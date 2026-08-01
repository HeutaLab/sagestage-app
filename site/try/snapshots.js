/* Sage Stage — snapshots (the armour the bin cannot be).

   The bin catches a mis-click on the X. It does not catch Clear page, deleting
   a page off the washing line, or deleting the screen or deck the unit sits on
   — all of which destroyed days of writing silently and instantly. This module
   is the layer underneath: a rolling copy of every widget that holds work,
   taken without the teacher doing anything.

   WHY INDEXEDDB, measured before it was written (2026-07-26):
     · a heavy writing unit is 2.24MB of strokes alone, 3.47MB with pictures
     · localStorage is ~5MB for the WHOLE app
     · IndexedDB reported 5,831MB of quota on the same machine
   So a snapshot in localStorage would evict the live state it is meant to
   protect. IndexedDB has room for hundreds of them, is asynchronous — it can
   never block a stroke the way `setItem` can — and is where the Tauri-era file
   store is heading anyway.

   Two triggers, because they catch different disasters:
     · DAILY   the first save of a calendar day copies the unit as it was, so
               "three days of writing" is three days of routes back
     · BEFORE  Clear page, delete page, delete screen, delete deck copy first,
               because those are the instants work actually dies

   Nothing here is on the critical path: every take() is deferred to idle time,
   and every failure is swallowed. A snapshot layer that breaks the app it is
   protecting would be worse than no snapshot layer.
*/
(function () {
  'use strict';

  const DB_NAME = 'sage-stage';
  const DB_VER = 2;
  const STORE = 'snapshots';
  // A second store for things that must outlive a reload but have no business
  // in localStorage, where they would compete with the live state for the same
  // 5MB. Undo histories are the first tenant.
  const AUX = 'aux';

  // Retention. Generous, because the whole point is the teacher who notices on
  // Thursday that Tuesday is gone — but bounded, because a stale 5GB of
  // handwriting on a school laptop is its own kind of failure.
  const KEEP_PER_UNIT = 14;      // most recent per widget
  const KEEP_DAYS = 60;
  const TOTAL_BUDGET = 250 * 1024 * 1024;

  let dbp = null;
  let D = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('unit', 'unit', { unique: false });
          os.createIndex('at', 'at', { unique: false });
        }
        if (!db.objectStoreNames.contains(AUX)) db.createObjectStore(AUX, { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB blocked'));
      // Private-browsing Firefox and locked-down school images can hang here
      // rather than erroring. Fail open after 4s: no snapshots is survivable,
      // a promise that never settles is not.
      setTimeout(() => reject(new Error('indexedDB timed out')), 4000);
    }).catch((e) => { dbp = null; throw e; });
    return dbp;
  }

  function tx(mode, fn, store) {
    return open().then((db) => new Promise((resolve, reject) => {
      const name = store || STORE;
      const t = db.transaction(name, mode);
      const os = t.objectStore(name);
      let out;
      try { out = fn(os); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    }));
  }

  const req2p = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const idle = (fn) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 60);
  };

  // Local day, not UTC: "yesterday's writing" means yesterday in the classroom.
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  // A cheap size estimate, so retention never has to stringify 3MB to decide.
  // Deliberately approximate — it only has to rank and total, not audit.
  function weighWidget(w) {
    let n = 200;
    const props = (w && w.props) || {};
    const pages = Array.isArray(props.pages) ? props.pages : null;
    if (!pages) {
      try { return n + JSON.stringify(props).length; } catch (_) { return n; }
    }
    for (const pg of pages) {
      if (!pg || typeof pg !== 'object') continue;
      for (const s of (pg.strokes || [])) n += 24 + (s.pts ? s.pts.length * 4 : 0);
      for (const im of (pg.imgs || [])) n += 80 + (im.src ? im.src.length : 0);
      if (pg.text) n += String(pg.text).length * 2;
    }
    return n;
  }
  function weigh(thing, kind) {
    if (kind === 'widget') return weighWidget(thing);
    let n = 200;
    const screens = kind === 'deck' ? (thing.screens || []) : [thing];
    for (const scr of screens) {
      for (const w of ((scr && scr.widgets) || [])) n += weighWidget(w);
      for (const s of ((scr && scr.ink) || [])) n += 24 + (s.pts ? s.pts.length * 4 : 0);
    }
    return n;
  }

  let seq = 0;
  const newId = () => Date.now().toString(36) + '-' + (seq++).toString(36)
    + '-' + Math.random().toString(36).slice(2, 7);

  /* take(thing, opts) — copy a widget, screen or whole deck as it stands.
     opts.kind    'widget' (default) | 'screen' | 'deck'
     opts.reason  'daily' | 'before' — 'daily' is skipped if today already has one
     opts.label   what the teacher will read in the list ("before clearing page 3")
     opts.screenId  so a restore can go back where it came from
     Returns a promise that never rejects; callers are not asked to care. */
  function take(thing, opts) {
    const o = opts || {};
    if (!thing || !thing.id) return Promise.resolve(false);
    const kind = o.kind === 'screen' || o.kind === 'deck' ? o.kind : 'widget';
    const isBefore = o.reason === 'before';
    // Snapshot the state at the INSTANT of the trigger, not after idle: a
    // "before deleting" copy taken once the delete has happened is worthless.
    // Cloning a heavy deck costs a few ms, and a destructive act is never the
    // moment a teacher is mid-stroke. Daily copies can afford to wait for idle.
    let clone = null;
    if (isBefore) { clone = snap(thing); if (!clone) return Promise.resolve(false); }
    return new Promise((resolve) => {
      idle(() => {
        if (!clone) clone = snap(thing);
        if (!clone) { resolve(false); return; }
        const at = Date.now();
        const rec = {
          id: newId(),
          unit: thing.id,
          kind,
          type: kind === 'widget' ? (thing.type || 'widget') : kind,
          title: o.title || (kind === 'widget' ? (thing.type || 'Widget') : kind),
          screenId: o.screenId || null,
          at,
          day: dayKey(at),
          reason: isBefore ? 'before' : 'daily',
          label: o.label || '',
          bytes: weigh(thing, kind),
          w: clone,
        };
        const run = isBefore
          ? Promise.resolve(true)
          : hasDay(thing.id, rec.day).then((seen) => !seen);
        run.then((go) => {
          if (!go) { resolve(false); return; }
          return tx('readwrite', (os) => os.put(rec))
            .then(() => sweepUnit(thing.id))
            .then(() => resolve(true));
        }).catch(() => resolve(false));
      });
    });
  }
  function snap(thing) {
    try {
      return typeof structuredClone === 'function'
        ? structuredClone(thing) : JSON.parse(JSON.stringify(thing));
    } catch (_) { return null; }
  }

  function hasDay(unit, day) {
    return tx('readonly', (os) => os.index('unit').getAll(unit))
      .then((rows) => (rows || []).some((r) => r && r.day === day && r.reason === 'daily'))
      .catch(() => true); // on failure assume "already have one" — never spam the store
  }

  // Per-unit retention runs on every take, so no unit can run away on its own.
  function sweepUnit(unit) {
    return tx('readwrite', (os) => {
      const g = os.index('unit').getAll(unit);
      g.onsuccess = () => {
        const rows = (g.result || []).sort((a, b) => b.at - a.at);
        const cutoff = Date.now() - KEEP_DAYS * 864e5;
        rows.forEach((r, i) => {
          // The most recent 'before' snapshot is never swept by age or count:
          // it is the one standing between a teacher and the thing they just
          // did by accident.
          const pinned = i === 0 || (r.reason === 'before' && i < 3);
          if (!pinned && (i >= KEEP_PER_UNIT || r.at < cutoff)) os.delete(r.id);
        });
      };
      return null;
    }).catch(() => null);
  }

  // Whole-store sweep: age, then total bytes, oldest first. Called at boot.
  function sweep() {
    return tx('readwrite', (os) => {
      const g = os.getAll();
      g.onsuccess = () => {
        let rows = (g.result || []).sort((a, b) => b.at - a.at);
        const cutoff = Date.now() - KEEP_DAYS * 864e5;
        const keep = [];
        for (const r of rows) {
          if (r.at < cutoff) { os.delete(r.id); continue; }
          keep.push(r);
        }
        let total = 0;
        for (const r of keep) {
          total += r.bytes || 0;
          if (total > TOTAL_BUDGET) os.delete(r.id);
        }
      };
      return null;
    }).catch(() => null);
  }

  function list(unit) {
    const p = unit
      ? tx('readonly', (os) => os.index('unit').getAll(unit))
      : tx('readonly', (os) => os.getAll());
    return p.then((rows) => (rows || []).sort((a, b) => b.at - a.at)).catch(() => []);
  }

  function get(id) {
    return tx('readonly', (os) => os.get(id)).then((r) => r || null).catch(() => null);
  }

  function drop(id) {
    return tx('readwrite', (os) => os.delete(id)).then(() => true).catch(() => false);
  }

  function clearAll() {
    return tx('readwrite', (os) => os.clear()).then(() => true).catch(() => false);
  }

  // Separate from clearAll on purpose: "delete my snapshots" must not throw
  // away the routes back that a teacher's undo stacks are holding. Only the
  // erase-everything path wants both, and it asks for both.
  function clearAux() {
    return tx('readwrite', (os) => os.clear(), AUX).then(() => true).catch(() => false);
  }

  function stats() {
    return list().then((rows) => ({
      count: rows.length,
      units: new Set(rows.map((r) => r.unit)).size,
      bytes: rows.reduce((n, r) => n + (r.bytes || 0), 0),
      oldest: rows.length ? rows[rows.length - 1].at : null,
    })).catch(() => ({ count: 0, units: 0, bytes: 0, oldest: null }));
  }

  // Is the store usable at all? The UI asks so it can say "snapshots are off on
  // this browser" rather than showing an empty list that looks like data loss.
  function available() {
    return open().then(() => true).catch(() => false);
  }

  // ------------------------------------------------------------------- aux
  // Small keyed blobs that must survive a reload without eating the live
  // state's localStorage. Undo histories: a teacher who restarts mid-unit
  // should not lose every route back, and an undo stack can carry whole
  // stroke arrays — exactly what must not go near the 5MB budget.
  function putAux(k, v) {
    return tx('readwrite', (os) => os.put({ k, v, at: Date.now() }), AUX)
      .then(() => true).catch(() => false);
  }
  function getAux(k) {
    return tx('readonly', (os) => os.get(k), AUX)
      .then((r) => (r && r.v !== undefined ? r.v : null)).catch(() => null);
  }
  function dropAux(k) {
    return tx('readwrite', (os) => os.delete(k), AUX).then(() => true).catch(() => false);
  }
  // Aux entries outlive the thing they describe when a widget is deleted, so
  // age them out on the same schedule as everything else.
  function sweepAux() {
    return tx('readwrite', (os) => {
      const g = os.getAll();
      g.onsuccess = () => {
        const cutoff = Date.now() - KEEP_DAYS * 864e5;
        for (const r of (g.result || [])) if (!r.at || r.at < cutoff) os.delete(r.k);
      };
      return null;
    }, AUX).catch(() => null);
  }

  window.SageSnapshots = {
    init(deps) { D = deps || {}; idle(() => { sweep(); sweepAux(); }); },
    take, list, get, drop, clearAll, clearAux, stats, available, dayKey,
    putAux, getAux, dropAux,
    KEEP_PER_UNIT, KEEP_DAYS,
  };
})();
