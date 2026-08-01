/* Sage Stage — the storage seam.
   Design: docs/storage-abstraction-plan.md §2, §3. Phase 1: the localStorage
   backend only.

   One global, window.SageStorage, chosen at LOAD time so app.js never branches on
   which one it got. Loaded immediately before app.js, same synchronous script-tag
   idiom as everything else — no modules, no build step, which is the whole point
   of the plan.

   The seam exists so that state can move off localStorage and into a real file
   under Tauri without app.js learning about files. Everything app.js does with
   persistence goes through this object; nothing else in the app touches
   localStorage for state. (The headroom PROBE in app.js is a localStorage-quota
   measurement rather than a state write, and stays there until the file backend
   lands and it becomes a no-op — §4.)

   PHASE 1 IS A PURE REFACTOR. The parity claim is meant to be trivially true, so
   the write path below is today's code MOVED, not rewritten: same 250ms debounce,
   same synchronous setItem on the same tick, same shedding ladder, same strings.
   The known today-risk — a write lost if the tab closes inside the debounce
   window — is PRESERVED on purpose. Fixing it is not a refactor. */
(function () {
  'use strict';

  // Duplicated from app.js deliberately. It is one constant string, and a
  // cross-file config mechanism for a single literal costs more than it saves.
  const LS_KEY = 'sage-stage-v1';

  function localBackend() {
    let saveTimer = null;
    let pending = null;      // the serializer thunk, so rapid mutations coalesce
    let shedFn = null;       // app-supplied: give something up, or return null
    let errCb = null;

    const put = (json) => {
      try { localStorage.setItem(LS_KEY, json); return true; }
      catch (e) { return false; }
    };

    function doWrite() {
      const serialize = pending;
      pending = null;
      if (!serialize) return;
      let json = null;
      // The thunk runs at FLUSH time, not at call time — that is what makes a
      // hundred mutations in one gesture cost one stringify of the final state.
      try { json = serialize(); } catch (e) { json = null; }
      if (json !== null && put(json)) return;
      // Out of room. Ask the app to give up ballast, oldest first, and retry
      // after each concession. app.js owns what may be surrendered because
      // app.js owns the state; this only owns the retry loop.
      for (;;) {
        const next = shedFn ? shedFn() : null;
        if (!next || typeof next.json !== 'string') break;
        if (put(next.json)) {
          if (next.notice && errCb) errCb(next.notice);
          return;
        }
      }
      if (errCb) {
        errCb('⚠️ Could not save — storage is full. Try removing large images or clearing old writing pages.');
      }
    }

    return {
      kind: 'local',

      // Resolves in microtasks — before paint, and before any user event can
      // land — so awaiting it in app.js's boot costs nothing observable.
      async init() {
        let raw = null;
        try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
        return { raw, existed: raw !== null, notice: null, readOnly: false };
      },

      // Synchronous signature, exactly as save() has always had.
      //   serialize  () => string
      //   opts.shed  () => { json, notice } | null   (optional)
      write(serialize, opts) {
        pending = serialize;
        if (opts && typeof opts.shed === 'function') shedFn = opts.shed;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(doWrite, 250);
      },

      // Force any pending write NOW. Nothing in the browser build calls this yet;
      // the Tauri close/quit handlers will.
      async flush() {
        if (!pending) return;
        clearTimeout(saveTimer);
        doWrite();
      },

      // THROW AWAY a pending write instead of performing it. Erase needs this and
      // nothing else does: a save queued a moment before the erase would land
      // after it and quietly undo it. app.js used to reach into its own timer to
      // do this; once the timer moved in here that reach became a dangling
      // reference, which broke erase-all silently. Not in the original plan —
      // add it to §2's interface when the file backend lands, where it means
      // "drop the queued payload", not "cancel a write already in flight".
      cancel() {
        clearTimeout(saveTimer);
        saveTimer = null;
        pending = null;
      },

      async erase() {
        try { localStorage.removeItem(LS_KEY); } catch (e) { /* already gone */ }
      },

      // The data modal's usage meter. Synchronous and local-only, so the modal
      // keeps computing its KB figure inline with no async fill-in and no
      // microtask delta in how it renders.
      usageChars() {
        try { return (localStorage.getItem(LS_KEY) || '').length; }
        catch (e) { return 0; }
      },

      onExternalChange(fn) {
        window.addEventListener('storage', (e) => {
          if (e.key !== LS_KEY) return;
          // null newValue is another window's ERASE, not a write to skip past.
          // The local backend passes it through as null and app.js decides,
          // which is what it already did inline.
          fn(e.newValue === null ? null : e.newValue);
        });
      },

      onWriteError(fn) { errCb = fn; },
    };
  }

  /* ---------------------------------------------------------------- file backend
     Plan §4. State lives in a real file the teacher can see, back up and email:
     Documents/Sage Stage/sage-stage.json.

     The governing rule for everything below is one sentence: NEVER destroy a file
     you could not read. A OneDrive "online-only" placeholder throws on read, and
     treating that as corruption would quarantine healthy data, boot empty, save
     that emptiness, and poison the cloud copy the moment sync resumed. So a read
     that FAILS gives a read-only session, and only a read that SUCCEEDS and then
     fails the shape check is ever quarantined. */

  const DIR = 'Sage Stage';
  const MAIN = DIR + '/sage-stage.json';
  const BACKUPS = DIR + '/backups';
  const KEEP_DAILY = 14;

  // Coalescing, single-in-flight write queue. The one non-obvious rule: a FAILED
  // persist puts the serializer back as pending, so `dirty` stays true and the
  // close-time flush retries. Dropping it would silently discard a teacher's last
  // edit after one transient OneDrive lock.
  function makeQueue(persist, debounceMs, maxDirtyMs, errCb) {
    let timer = null, pending = null, draining = null, dirtySince = 0;
    function drain() {
      if (!draining) {
        draining = (async () => {
          // This await is load-bearing and must stay. Without it, a drain() with
          // nothing pending runs its whole body SYNCHRONOUSLY — setting
          // draining = null on the way out — and only then does the assignment
          // below store the already-resolved promise. draining is left non-null
          // for ever, every later drain() takes the `if (!draining)` false
          // branch, and NOTHING IS EVER WRITTEN AGAIN while `dirty` cheerfully
          // reports true. Flushing a clean queue is exactly what the quit
          // handshake does, so this was one bad ordering away from a window that
          // silently stopped saving.
          await null;
          while (pending) {
            const serialize = pending;
            pending = null;
            try { await persist(serialize()); dirtySince = 0; }
            catch (e) {
              if (!pending) pending = serialize;
              if (errCb) errCb(e);
              break;
            }
          }
          draining = null;
        })();
      }
      return draining;
    }
    return {
      write(serialize) {
        if (!pending) dirtySince = Date.now();
        pending = serialize;
        clearTimeout(timer);
        // Continuous activity would reset a debounce forever, so a run of
        // non-stop annotating still reaches disk every maxDirtyMs.
        const overdue = dirtySince && Date.now() - dirtySince > maxDirtyMs;
        timer = setTimeout(drain, overdue ? 0 : debounceMs);
      },
      async flush() {
        clearTimeout(timer); timer = null;
        await drain();
        if (pending) await drain();          // one bounded retry
        if (pending) throw new Error('flush failed');
      },
      cancel() { clearTimeout(timer); timer = null; pending = null; },
      get dirty() { return !!pending || !!draining; },
    };
  }

  function fileBackend() {
    const T = window.__TAURI__;
    const fs = T.fs;
    const D = { baseDir: fs.BaseDirectory.Document };
    const label = (T.window.getCurrentWindow().label || 'main')
      .toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'main';

    let errCb = null, extCb = null;
    let readOnly = false;          // set when the file could not be READ
    let lastMtime = 0;             // for the external-modification guard
    let backedUpDay = null;        // memoised so backups cost one exists() a day
    let lastSize = 0;              // bytes, for the data panel's synchronous read
    let backupWarned = false;

    const shapeOk = (raw) => {
      try {
        const o = JSON.parse(raw);
        return !!o && (Array.isArray(o.decks) || Array.isArray(o.screens));
      } catch (e) { return false; }
    };
    const today = () => {
      // local time, deliberately: toISOString() is UTC and would label an 8am
      // lesson in Sydney with yesterday's date
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    };
    const mtimeOf = async (path) => {
      try {
        const st = await fs.stat(path, D);
        if (path === MAIN && st && typeof st.size === 'number') lastSize = st.size;
        return st && st.mtime ? +new Date(st.mtime) : 0;
      } catch (e) { return 0; }
    };

    // 3 attempts, 150ms apart, around the WHOLE persist — sync clients and AV
    // scanners lock files briefly on Windows, and the lock can hit the temp
    // create as easily as the rename.
    async function persistOnce(json) {
      let last = null;
      for (let i = 0; i < 3; i++) {
        try { await T.core.invoke('save_state', { json, windowLabel: label }); return; }
        catch (e) {
          last = e;
          // No sleep after the LAST attempt — there is nothing left to wait for,
          // and this runs inside the quit handshake's 2s fuse, where 150ms of
          // pointless sleeping is 150ms the write could have used.
          if (i < 2) await new Promise((r) => setTimeout(r, 150));
        }
      }
      throw last;
    }

    async function maybeDailyBackup() {
      // Must NEVER block the main write. A broken backup is a worse reason to
      // lose today's work than no backup at all.
      if (readOnly || backedUpDay === today()) return;
      try {
        backedUpDay = today();
        if (!(await fs.exists(MAIN, D))) return;
        await fs.mkdir(BACKUPS, { ...D, recursive: true });
        const name = BACKUPS + '/' + today() + '.json';
        if (await fs.exists(name, D)) return;
        await fs.copyFile(MAIN, name, { fromPathBaseDir: D.baseDir, toPathBaseDir: D.baseDir });
        // rotation: keep the newest KEEP_DAILY, ignoring future-dated names so a
        // skewed clock cannot occupy every slot
        const now = today();
        const entries = await fs.readDir(BACKUPS, D);
        const dailies = entries
          .map((e) => e.name)
          .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) <= now)
          .sort().reverse();
        for (const old of dailies.slice(KEEP_DAILY)) {
          try { await fs.remove(BACKUPS + '/' + old, D); } catch (e) { /* leave it */ }
        }
      } catch (e) {
        if (!backupWarned && errCb) {
          backupWarned = true;
          errCb('⚠️ Could not write today’s backup. Your work is still being saved.');
        }
      }
    }

    async function persist(json) {
      await maybeDailyBackup();
      // External-modification guard: if the file changed under us (the same
      // teacher on another machine through OneDrive), keep the other version
      // before overwriting it. No merge UI, but nothing is silently destroyed.
      if (lastMtime) {
        const m = await mtimeOf(MAIN);
        if (m && m !== lastMtime) {
          try {
            await fs.mkdir(BACKUPS, { ...D, recursive: true });
            await fs.copyFile(MAIN, BACKUPS + '/conflict-' + Date.now() + '.json',
              { fromPathBaseDir: D.baseDir, toPathBaseDir: D.baseDir });
            if (errCb) errCb('Another copy of Sage Stage changed this file — the other version was saved to backups/.');
          } catch (e) { /* the write below still matters more */ }
        }
      }
      await persistOnce(json);
      lastSize = json.length;
      lastMtime = await mtimeOf(MAIN);
      // Tell the other windows AFTER the rename, never before — the event is a
      // "go and read the file" nudge, and the file has to be the new one by the
      // time anyone acts on it. No payload: receivers re-read rather than have
      // multi-MB of JSON pushed through IPC, and because the write is an atomic
      // rename a reader can only ever see a complete file.
      //
      // `from` is load-bearing. Tauri v2 payloads no longer carry v1's
      // windowLabel, so without it a window cannot tell its own echo from a real
      // change and every save would bounce round the windows forever.
      try { await T.event.emit('sage:written', { from: label }); } catch (e) { /* alone */ }
    }

    const queue = makeQueue(
      (json) => (readOnly ? Promise.resolve() : persist(json)),
      1000,   // the debounce IS the data-loss window for a hard crash
      10000,  // ...and this bounds it during continuous drawing
      (e) => { if (errCb) errCb('⚠️ Could not save to your data file: ' + (e && e.message ? e.message : e)); }
    );

    async function restoreFrom(raw, whenLabel) {
      // Recovery writes back IMMEDIATELY, inside init(), before returning.
      // Otherwise a teacher who opens the app and quits without editing would
      // find no main file next boot — which reads as a total wipe.
      try { await persistOnce(raw); lastMtime = await mtimeOf(MAIN); } catch (e) { /* in memory at least */ }
      return {
        raw, existed: true, readOnly: false,
        notice: '⚠️ Your data file was ' + whenLabel
          + '. The damaged file was kept in Documents/Sage Stage.',
      };
    }

    async function recoveryCandidates() {
      const out = [];
      try {
        const now = today();
        const entries = await fs.readDir(BACKUPS, D);
        const names = entries.map((e) => e.name)
          .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) <= now)
          .sort().reverse();
        for (const n of names) out.push({ path: BACKUPS + '/' + n, label: 'restored the backup from ' + n.slice(0, 10) });
      } catch (e) { /* no backups dir */ }
      try {
        // OneDrive conflict copies sit beside the main file
        const entries = await fs.readDir(DIR, D);
        for (const e of entries) {
          if (/^sage-stage-.*\.json$/.test(e.name)) out.push({ path: DIR + '/' + e.name, label: 'restored a conflict copy' });
        }
      } catch (e) { /* nothing */ }
      return out;
    }

    return {
      kind: 'file',

      async init() {
        await fs.mkdir(DIR, { ...D, recursive: true });
        // stale per-window temps from a crash mid-write
        try {
          for (const e of await fs.readDir(DIR, D)) {
            if (/^sage-stage\.json\.tmp-/.test(e.name)) {
              try { await fs.remove(DIR + '/' + e.name, D); } catch (_) { /* leave it */ }
            }
          }
        } catch (e) { /* nothing to clean */ }

        const present = await fs.exists(MAIN, D);

        if (present) {
          let raw = null, readFailed = false;
          for (let i = 0; i < 3; i++) {
            try { raw = await fs.readTextFile(MAIN, D); readFailed = false; break; }
            catch (e) { readFailed = true; await new Promise((r) => setTimeout(r, 700)); }
          }
          if (readFailed) {
            // COULD NOT READ. Touch nothing. Run in memory for this session.
            readOnly = true;
            return {
              raw: null, existed: true, readOnly: true,
              notice: '⚠️ Couldn’t read your data file — it may be waiting for OneDrive or locked. Nothing will be saved this session.',
            };
          }
          if (shapeOk(raw)) {
            lastSize = raw.length;
            lastMtime = await mtimeOf(MAIN);
            return { raw, existed: true, notice: null, readOnly: false };
          }
          // Read fine, but it is not a Sage Stage file. Quarantine, never delete.
          try {
            await fs.rename(MAIN, DIR + '/sage-stage.corrupt-' + Date.now() + '.json',
              { oldPathBaseDir: D.baseDir, newPathBaseDir: D.baseDir });
          } catch (e) { /* pressing on is still better than stopping */ }
          for (const c of await recoveryCandidates()) {
            try {
              const cand = await fs.readTextFile(c.path, D);
              if (shapeOk(cand)) return await restoreFrom(cand, 'damaged — ' + c.label);
            } catch (e) { /* try the next */ }
          }
          return {
            raw: null, existed: true, readOnly: false,
            notice: '⚠️ Your data file was damaged and no backup could be read. The damaged file was kept in Documents/Sage Stage.',
          };
        }

        // No main file. Before declaring a first run, look in backups — the file
        // may have been deleted in Finder, or dehydrated then removed by "free up
        // space". Declaring first-run here would seed starter widgets over a
        // recoverable class.
        for (const c of await recoveryCandidates()) {
          try {
            const cand = await fs.readTextFile(c.path, D);
            if (shapeOk(cand)) return await restoreFrom(cand, 'missing — ' + c.label);
          } catch (e) { /* try the next */ }
        }
        return { raw: null, existed: false, notice: null, readOnly: false };
      },

      write(serialize) { queue.write(serialize); },
      async flush() { await queue.flush(); },
      cancel() { queue.cancel(); },

      async erase() {
        queue.cancel();
        // Quiesce the other windows BEFORE deleting anything, and give the event
        // a moment to actually arrive. A display window left open on a screen
        // holds a complete copy of everything in memory; if its debounce expires
        // in the gap between the delete and the notification it recreates the
        // file, in full, and the toast has already said "Everything cleared"
        // while the children's names are back on disk. Erase is a privacy
        // control, so it does not get to be approximately right.
        try { await T.event.emit('sage:erased', { from: label }); } catch (e) { /* alone */ }
        await new Promise((r) => setTimeout(r, 250));
        for (const p of [MAIN, BACKUPS]) {
          try { await fs.remove(p, { ...D, recursive: true }); } catch (e) { /* already gone */ }
        }
        lastMtime = 0; backedUpDay = null; lastSize = 0;
      },

      // The data panel asks synchronously and renders in one pass, so it gets the
      // size measured at the last read or write rather than a promise. It is a
      // figure for a human deciding whether to tidy up, not an accounting total,
      // and being one save stale is invisible at that job.
      usageChars() { return lastSize; },

      async fileInfo() {
        let sizeKB = 0, path = '';
        try { const s = await fs.stat(MAIN, D); sizeKB = Math.round((s.size || 0) / 1024); } catch (e) { /* new file */ }
        try { path = await T.core.invoke('state_file_path'); } catch (e) { path = 'Documents/Sage Stage/sage-stage.json'; }
        return { sizeKB, path };
      },
      async revealDataFile() {
        try { await T.opener.revealItemInDir(await T.core.invoke('state_file_path')); }
        catch (e) { if (errCb) errCb('Could not open the folder.'); }
      },
      async saveExport(defaultName, json) {
        // WKWebView does not honour blob-anchor downloads, so export goes through
        // the native save panel rather than a click on an <a download>.
        try {
          const p = await T.dialog.save({ defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] });
          if (!p) return 'cancelled';
          await fs.writeTextFile(p, json);
          return 'saved';
        } catch (e) { if (errCb) errCb('Could not save the export.'); return 'cancelled'; }
      },

      onExternalChange(fn) {
        extCb = fn;

        // Another window in THIS app saved. Same semantics as the browser's two
        // tab behaviour: whole-state replace, re-render, last-write-wins. Per
        // window temp files mean last-write-wins can never degrade into a torn
        // file, so there is nothing cleverer to do here.
        T.event.listen('sage:written', async (e) => {
          if (!e || !e.payload || e.payload.from === label) return;   // our own echo
          // The SAME guard the focus path uses below, and for the same reason: a
          // window with unsaved edits must not have them replaced out from under
          // the person typing. The plan calls adopting-while-dirty "a harmless
          // convergent no-op" because it converges ON DISK — but the writer's
          // memory is the teacher's screen, and its pending thunk would then
          // write the rolled-back state back out. Let the dirty window land its
          // own edit first; the others adopt that.
          if (queue.dirty) return;
          try {
            const raw = await fs.readTextFile(MAIN, D);
            if (!shapeOk(raw)) return;
            lastMtime = await mtimeOf(MAIN);   // keep the conflict guard honest
            if (extCb) extCb(raw);
          } catch (err) { /* it will be re-read on focus */ }
        }).catch(() => { /* single window */ });

        // Another window erased everything. Drop anything of ours still queued —
        // a pending write landing after an erase would quietly undo it — and let
        // app.js say so, exactly as the browser's null-payload path does.
        T.event.listen('sage:erased', (e) => {
          if (e && e.payload && e.payload.from === label) return;
          queue.cancel();
          lastMtime = 0;
          if (extCb) extCb(null);
        }).catch(() => { /* single window */ });

        // Left running overnight while the other machine edited: on focus, if we
        // have nothing pending of our own, adopt whatever is on disk now.
        window.addEventListener('focus', async () => {
          if (queue.dirty) return;
          try {
            const m = await mtimeOf(MAIN);
            if (!m || m === lastMtime) return;
            const raw = await fs.readTextFile(MAIN, D);
            if (!shapeOk(raw)) return;
            lastMtime = m;
            readOnly = false;               // it reads now; the session recovers
            if (extCb) extCb(raw);
          } catch (e) { /* still unreadable; stay as we are */ }
        });
      },

      onWriteError(fn) { errCb = fn; },

      // Wired at the end of init by the selection block below.
      async _wireQuit() {
        const win = T.window.getCurrentWindow();
        await win.onCloseRequested(async (e) => {
          if (!queue.dirty) return;
          e.preventDefault();
          try { await queue.flush(); }
          catch (_) {
            // Never leave the window undestroyable, and never destroy it while
            // dirty without saying so.
            if (errCb) errCb('⚠️ Could not save to your data file. Export a backup before closing.');
            return;
          }
          await win.destroy();
        });
        // Rust asks every window to flush before the app exits (Cmd+Q, Dock-Quit,
        // Windows logoff). Answer either way — a silent window costs 2s and then
        // the app quits regardless.
        await T.event.listen('sage:flush-request', async () => {
          try { await queue.flush(); } catch (e) { /* the exit is happening */ }
          try { await T.event.emit('sage:flush-done', {}); } catch (e) { /* going anyway */ }
        });
      },
    };
  }

  /* SagePlatform — the things a webview cannot do for itself.
     DEFINED ONLY UNDER TAURI. Every call site is guarded by `if
     (window.SagePlatform)`, so in a browser it is undefined and the existing
     anchors and window.open run untouched — middle-click and copy-link keep
     working, which they would not if this replaced them everywhere. */
  function platform() {
    const T = window.__TAURI__;
    return {
      async openScreenWindow(id) {
        const { WebviewWindow } = T.webviewWindow;
        const label = 'screen-' + id;
        // getByLabel is ASYNC in v2. The v1 sync-looking form returns a Promise,
        // which is always truthy, so skipping the await would take the "already
        // open" branch every time and then throw on setFocus.
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) { await existing.setFocus(); return; }
        // Land anything still in the debounce FIRST. The new window's only truth
        // is its own read of the file, so a teacher who arranges a screen and
        // immediately sends it to the projector would otherwise put last
        // second's arrangement on the wall — and if a child then touches
        // anything there, that stale state is written back over the good one.
        try { await window.SageStorage.flush(); } catch (e) { /* open it anyway */ }
        // The hash is set at CREATION, before app.js runs in that window, so the
        // new window boots already pinned to the screen rather than flashing the
        // dashboard and jumping.
        const win = new WebviewWindow(label, {
          url: 'index.html#s=' + id,
          title: 'Sage Stage — screen',
          width: 1280,
          height: 800,
          // same as the main window in tauri.conf.json: wry's OS-level drop
          // interception would otherwise eat the .pptx / register drop route
          dragDropEnabled: false,
        });
        win.once('tauri://error', (e) => console.error('window create failed', e));
      },
      openExternal(url) {
        // The system browser, not a webview with no chrome and no way back.
        try { T.opener.openUrl(url); } catch (e) { /* nothing sensible to fall back to */ }
      },
      // The ⛶ button. document.requestFullscreen() rejects in this webview
      // (wry never turns WKPreferences.elementFullscreenEnabled on), so the
      // desktop answer is the WINDOW going fullscreen — which is also the one
      // that behaves like a mac app: its own Space, swipe to leave.
      async toggleFullscreen() {
        const win = T.window.getCurrentWindow();
        const now = await win.isFullscreen();
        await win.setFullscreen(!now);
        return !now;
      },
      // Blob-anchor downloads do nothing in WKWebView, so every "export"
      // (PDF, PNG, ZIP, word-bank set…) funnels through the native save panel
      // instead. Returns 'saved' | 'cancelled' — a caller must only claim
      // success on 'saved'; the old paths toasted "downloading" over a no-op.
      async saveBlob(defaultName, blob, filterName) {
        const ext = (defaultName.match(/\.([a-z0-9]+)$/i) || [])[1];
        try {
          const p = await T.dialog.save({
            defaultPath: defaultName,
            filters: ext ? [{ name: filterName || ext.toUpperCase(), extensions: [ext] }] : undefined,
          });
          if (!p) return 'cancelled';
          const buf = new Uint8Array(await blob.arrayBuffer());
          await T.fs.writeFile(p, buf);
          return 'saved';
        } catch (e) {
          console.error('saveBlob failed', e);
          return 'cancelled';
        }
      },
      // window.print() is a no-op in this webview (wry implements no
      // printFrame delegate); the webview plugin's own print command drives
      // the real NSPrintOperation, and @media print CSS applies to it.
      async printPage() {
        try { await T.webviewWindow.getCurrentWebviewWindow().print(); return true; }
        catch (e) { /* older API surface */ }
        try { await T.core.invoke('plugin:webview|print'); return true; }
        catch (e) { console.error('print failed', e); return false; }
      },
    };
  }

  // Backend selection happens once, here, so app.js never branches on which one
  // it got. Tauri v2 sets window.isTauri in the webview.
  const isTauri = ('isTauri' in window && window.isTauri) || !!window.__TAURI__;
  window.SageStorage = isTauri ? fileBackend() : localBackend();
  if (isTauri) window.SagePlatform = platform();
  if (window.SageStorage._wireQuit) {
    window.SageStorage._wireQuit().catch(() => { /* the app still runs */ });
  }
}());
