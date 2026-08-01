/* Sage Stage — a fully local classroom screen.
   Nothing leaves this device. WHERE it is kept is storage.js's business: the
   browser build keeps it in localStorage, and the desktop build will keep it in a
   real file under Documents (docs/storage-abstraction-plan.md). This file asks
   SageStorage and never touches the store itself. */
(async function () {
  'use strict';

  const LS_KEY = 'sage-stage-v1';

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root) => (root || document).querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'style') node.style.cssText = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k === 'html') node.innerHTML = v;
        else node.setAttribute(k, v);
      }
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.append(child.nodeType ? child : document.createTextNode(child));
    }
    return node;
  }

  function iconEl(name) {
    const s = el('span', { class: 'ic' });
    s.innerHTML = SageIcons.icon(name);
    return s;
  }

  let toastTimer = null;
  // opts.action adds one button inside the toast — the undo path that asks the
  // teacher to notice nothing and find nothing. It lingers longer than a plain
  // toast because a button nobody has time to press is not a safety net.
  function toast(msg, opts) {
    const t = $('#toast');
    const o = opts || {};
    t.textContent = '';
    t.append(el('span', {}, msg));
    if (o.action && typeof o.onAction === 'function') {
      t.append(el('button', {
        class: 'toast-action',
        onclick: () => { t.classList.remove('show'); clearTimeout(toastTimer); o.onAction(); },
      }, o.action));
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    // opts.ms for the few messages a teacher has to actually read and act on —
    // a storage warning that has gone by the time they look up is not a warning
    toastTimer = setTimeout(() => t.classList.remove('show'),
      o.ms > 0 ? o.ms : (o.action ? 9000 : 2600));
  }

  function beep(times = 3) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        const t0 = ctx.currentTime + i * 0.45;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        osc.start(t0);
        osc.stop(t0 + 0.4);
      }
      setTimeout(() => ctx.close(), times * 500 + 400);
    } catch (e) { /* audio unavailable */ }
  }

  // ---------------------------------------------------------------- state
  const BACKGROUNDS = {
    gradients: [
      'linear-gradient(160deg,#134e4a,#0f766e 45%,#67e8f9)',
      'linear-gradient(160deg,#1e3a8a,#3b82f6 55%,#a5f3fc)',
      'linear-gradient(160deg,#581c87,#a855f7 55%,#fbcfe8)',
      'linear-gradient(160deg,#7c2d12,#f97316 55%,#fde68a)',
      'linear-gradient(160deg,#14532d,#22c55e 60%,#d9f99d)',
      'linear-gradient(160deg,#0f172a,#334155 60%,#94a3b8)',
      'linear-gradient(140deg,#fdf2f8,#fbcfe8 50%,#c7d2fe)',
      'linear-gradient(140deg,#ecfeff,#a5f3fc 55%,#fef9c3)',
      'linear-gradient(165deg,#eaf7f4,#ccfbf1)', // the Soft Daylight ground — the dashboard's default
    ],
    colors: ['#0f766e', '#1d4ed8', '#7c3aed', '#be185d', '#b45309', '#166534', '#1f2937', '#f8fafc', '#fef3c7', '#e0f2fe'],
    // (named, not indexed: normalize() migrates on the OLD default's exact value,
    // so these strings must never drift from the list above)
    // Curated Unsplash photo ids, hotlinked from images.unsplash.com (free under the
    // Unsplash license, no API key). Same id serves thumbnail and full size via URL params.
    photos: [
      { label: 'Nature', ids: [
        'photo-1506744038136-46273834b3fb', 'photo-1501785888041-af3ef285b470',
        'photo-1441974231531-c6227db76b6e', 'photo-1470071459604-3b5ec3a7fe05',
        'photo-1472214103451-9374bd1c798e', 'photo-1447752875215-b2761acb3c5d',
        'photo-1426604966848-d7adac402bff', 'photo-1469474968028-56623f02e42e',
      ] },
      { label: 'Ocean & beach', ids: [
        'photo-1507525428034-b723cf961d3e', 'photo-1505142468610-359e7d316be0',
        'photo-1519046904884-53103b34b206', 'photo-1518837695005-2083093ee35b',
        'photo-1439405326854-014607f694d7',
      ] },
      { label: 'Animals', ids: [
        'photo-1474511320723-9a56873867b5', 'photo-1437622368342-7a3d73a34c8f',
        'photo-1456926631375-92c8ce872def', 'photo-1564349683136-77e08dba1ef7',
        'photo-1444464666168-49d633b86797', 'photo-1546182990-dffeafbe841d',
        'photo-1425082661705-1834bfd09dca',
      ] },
      { label: 'Sky & space', ids: [
        'photo-1419242902214-272b3f66ee7a', 'photo-1462331940025-496dfbfc7564',
        'photo-1451187580459-43490279c0fa', 'photo-1475274047050-1d0c0975c63e',
      ] },
      { label: 'Celebrations', ids: [
        'photo-1492684223066-81342ee5ff30', 'photo-1530103862676-de8c9debad1d',
        'photo-1513151233558-d860c5398176',
      ] },
      { label: 'Calm & abstract', ids: [
        'photo-1557683316-973673baf926', 'photo-1550684848-fac1c5b4e853',
        'photo-1557682250-33bd709cbe85', 'photo-1579546929518-9e396f3cc809',
        'photo-1554034483-04fda0d3507b',
      ] },
    ],
  };
  const bgPhotoUrl = (id, w, q) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=${q}`;

  // tools shown on the main bar by default; the rest live in the "More" panel
  // dashboard ground: the Soft Daylight mint is the default; the pink one was
  // the default before the redesign and is what untouched states migrate FROM
  const DASH_BG_DEFAULT = 'linear-gradient(165deg,#eaf7f4,#ccfbf1)';
  const OLD_DASH_BG_DEFAULT = 'linear-gradient(140deg,#fdf2f8,#fbcfe8 50%,#c7d2fe)';

  // only ever applied to a device with nothing pinned yet, so adding to it moves
  // no existing teacher's bar. 'lists' earns its slot on frequency — the register
  // is opened more than most of what is already here
  const DEFAULT_PINNED = ['background', 'sketch', 'text', 'clock', 'timer', 'traffic', 'lists', 'picker', 'poll', 'sound', 'image'];

  function blankDeck(name) {
    return {
      id: uid(), name: name || 'New deck', classList: null, subject: '', yearGroup: null, pinnedTop: false,
      createdAt: Date.now(), lastUsed: Date.now(), current: 0,
      screens: [{ id: uid(), background: { type: 'gradient', value: BACKGROUNDS.gradients[0] }, widgets: [] }],
    };
  }

  function defaultState() {
    return {
      version: 2,
      pinned: DEFAULT_PINNED.slice(),
      customColors: [],
      dock: 'full',
      defaults: {},
      decks: [blankDeck('My screen deck')],
      activeDeck: null, // fixed up by normalize()
      lists: { 'My class': ['Ada', 'Grace', 'Alan', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Radia'] },
      className: '', // the greeting's "Class 4B" — teacher-set on the hero, optional
      mascotImage: '', // data URL of the teacher's face (memoji/photo); '' = the CSS sprout
      readingFont: 'standard', // 'standard' | 'hyper' | 'dys' — whole-app chrome faces
      // teacher-awarded class stars: a weekly count plus a used-on-consecutive-
      // school-days streak. No automation — every star is a deliberate tap.
      rewards: { on: true, stars: 0, streak: 0, weekStart: '', lastUsed: '' },
    };
  }

  // One normalizer for every way data enters: load(), backup import, storage sync.
  // Accepts both the old flat shape (v1: screens/current/deckName at the top level)
  // and the deck shape (v2), returns a valid v2 state or null.
  function normalize(data) {
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.decks)) {
      if (!Array.isArray(data.screens) || data.screens.length === 0) return null;
      data.decks = [{
        id: uid(), name: data.deckName || 'My screen deck',
        classList: null, subject: '', yearGroup: null, pinnedTop: false,
        createdAt: Date.now(), lastUsed: Date.now(),
        current: clamp(data.current || 0, 0, data.screens.length - 1),
        screens: data.screens,
      }];
      delete data.screens; delete data.current; delete data.deckName;
    }
    data.version = 2;
    data.decks = data.decks.filter((d) => d && Array.isArray(d.screens) && d.screens.length);
    if (!data.decks.length) return null;
    for (const d of data.decks) {
      if (!d.id) d.id = uid();
      if (typeof d.name !== 'string') d.name = 'My screen deck';
      if (typeof d.subject !== 'string') d.subject = '';
      if (typeof d.classList !== 'string') d.classList = null;
      if (typeof d.createdAt !== 'number') d.createdAt = Date.now();
      if (typeof d.lastUsed !== 'number') d.lastUsed = d.createdAt;
      d.current = clamp(d.current || 0, 0, d.screens.length - 1);
      d.pinnedTop = !!d.pinnedTop;
    }
    if (!data.decks.some((d) => d.id === data.activeDeck)) data.activeDeck = data.decks[0].id;
    if (!Array.isArray(data.pinned) || !data.pinned.length) data.pinned = DEFAULT_PINNED.slice();
    // annotate moved to a fixed dock button; its old pinned slot becomes the Draw pad
    data.pinned = data.pinned.map((id) => (id === 'draw' ? 'sketch' : id));
    if (!Array.isArray(data.customColors)) data.customColors = [];
    // teacher-uploaded money photos: { curId: { denomValue: dataURL } }, shared by all money widgets
    if (!data.moneyImages || typeof data.moneyImages !== 'object') data.moneyImages = {};
    if (!data.defaults || typeof data.defaults !== 'object') data.defaults = {};
    if (!data.lists || typeof data.lists !== 'object') data.lists = {};
    if (!data.dashBg || typeof data.dashBg !== 'object' || !data.dashBg.value) {
      data.dashBg = { type: 'gradient', value: DASH_BG_DEFAULT };
    }
    // The pink gradient was the pre-redesign default; a state still carrying it
    // verbatim never made a wallpaper choice, so it follows the design onto the
    // Soft Daylight ground. Anything else was chosen on purpose and stays.
    if (data.dashBg.type === 'gradient' && data.dashBg.value === OLD_DASH_BG_DEFAULT) {
      data.dashBg = { type: 'gradient', value: DASH_BG_DEFAULT };
    }
    if (typeof data.className !== 'string') data.className = '';
    if (typeof data.mascotImage !== 'string' || !data.mascotImage.startsWith('data:image/')) data.mascotImage = '';
    if (!['standard', 'hyper', 'dys'].includes(data.readingFont)) data.readingFont = 'standard';
    if (!data.rewards || typeof data.rewards !== 'object' || Array.isArray(data.rewards)) data.rewards = {};
    const rw = data.rewards;
    rw.on = 'on' in rw ? !!rw.on : true;
    rw.stars = Number.isFinite(rw.stars) && rw.stars >= 0 ? Math.floor(rw.stars) : 0;
    rw.streak = Number.isFinite(rw.streak) && rw.streak >= 0 ? Math.floor(rw.streak) : 0;
    if (typeof rw.weekStart !== 'string') rw.weekStart = '';
    if (typeof rw.lastUsed !== 'string') rw.lastUsed = '';
    // community template banks: static folders (GitHub Pages / raw) with an index.json
    if (!Array.isArray(data.templateSources)) data.templateSources = ['community/'];
    data.templateSources = data.templateSources.filter((u) => typeof u === 'string' && u.trim());
    if (!Array.isArray(data.seenTemplates)) data.seenTemplates = [];
    return data;
  }

  // Rich text out of an imported file, cleaned before the app adopts it. Boot
  // deliberately does not run this over the teacher's own saved decks: the
  // sinks already make a stored payload inert, and silently rewriting somebody
  // else's saved work at every launch is the more expensive mistake to make.
  function scrubImportedHTML(data) {
    for (const d of (data.decks || [])) {
      for (const s of (d.screens || [])) {
        for (const w of (s.widgets || [])) {
          if (w && w.props && typeof w.props.html === 'string') w.props.html = SageSanitize.html(w.props.html);
        }
      }
    }
    return data;
  }

  // THE ONE await in this file. Everything below — every listener, every
  // render — registers after it, and the localStorage backend resolves in
  // microtasks, so nothing can observe the gap.
  const persisted = await SageStorage.init();

  function load() {
    try {
      if (!persisted.raw) return null;
      return normalize(JSON.parse(persisted.raw));
    } catch (e) {
      return null;
    }
  }

  let state = load() || normalize(defaultState());

  // App-wide preferences: things a teacher sets once for the whole app rather
  // than per widget — the school's own ink colours were the first.
  function getPref(k, dflt) {
    return state.prefs && state.prefs[k] !== undefined ? state.prefs[k] : dflt;
  }
  function setPref(k, v) {
    state.prefs = state.prefs && typeof state.prefs === 'object' ? state.prefs : {};
    state.prefs[k] = v;
    save();
  }

  // -------------------------------------------------------------- headroom
  // Teachers need warning at 80%, not an error at 100% — and "80%" cannot be a
  // hard-coded 5,000KB, because the real ceiling is not a constant. Measured
  // 2026-07-26: this browser took 50M characters, school Chrome gives about
  // 5–10MB, Safari less. So don't guess the ceiling — ASK for headroom: try to
  // park a scratch string a quarter the size of the data beside it. If that
  // won't fit, the data is inside the last quarter of whatever this browser
  // allows, whatever that happens to be.
  const HEAD_KEY = 'sage-stage-headroom-probe';
  const HEAD_PROBE_MAX = 1536 * 1024;   // bound the cost of the probe itself
  const HEAD_FLOOR = 64 * 1024;         // "one more page" — below this it's over
  let headAt = 0, headLen = 0, headWarned = 0;
  function checkHeadroom(len) {
    const now = Date.now();
    // only re-probe when the data has actually grown, and never more than once
    // every 20 seconds — this runs inside save()
    if (now - headAt < 20000 && len < headLen * 1.15) return;
    headAt = now; headLen = len;
    const probe = (n) => {
      let ok = true;
      try { localStorage.setItem(HEAD_KEY, 'x'.repeat(n)); } catch (_) { ok = false; }
      try { localStorage.removeItem(HEAD_KEY); } catch (_) { /* nothing to clean */ }
      return ok;
    };
    const want = Math.min(HEAD_PROBE_MAX, Math.max(HEAD_FLOOR, Math.round(len * 0.25)));
    if (probe(want)) {
      headWarned = 0; // room came back (a deck was deleted, pictures removed)
      return;
    }
    if (!probe(HEAD_FLOOR)) {
      if (headWarned >= 2) return;
      headWarned = 2;
      toast('⚠️ Almost out of storage. Export a backup now, then delete a deck '
        + 'or remove some pictures — the next save may not fit.', { ms: 12000 });
      return;
    }
    if (headWarned >= 1) return;
    headWarned = 1;
    toast('Storage is filling up — about a quarter of the room left. '
      + 'Pictures use it fastest. “Your data” has the numbers.', { ms: 9000 });
  }
  // "how much room is left" for the Your data panel, as a fraction that is
  // measured rather than assumed. Coarse on purpose: three probes, not a
  // binary search over 50MB.
  function headroomReport(len) {
    const probe = (n) => {
      let ok = true;
      try { localStorage.setItem(HEAD_KEY, 'x'.repeat(n)); } catch (_) { ok = false; }
      try { localStorage.removeItem(HEAD_KEY); } catch (_) { /* nothing to clean */ }
      return ok;
    };
    for (const [mult, word] of [[1, 'plenty'], [0.5, 'comfortable'], [0.25, 'getting full']]) {
      const n = Math.min(HEAD_PROBE_MAX * 4, Math.max(HEAD_FLOOR, Math.round(len * mult)));
      if (probe(n)) return { level: word, atLeast: n };
    }
    return { level: probe(HEAD_FLOOR) ? 'nearly full' : 'full', atLeast: 0 };
  }

  // The debounce and the write itself moved into storage.js so the desktop build
  // can put the same bytes in a file instead. What stayed here is everything that
  // is about STATE rather than about storage: rolling the snapshot trail, probing
  // headroom, and deciding what may be surrendered when there is no room left.
  function save() {
    SageStorage.write(serializeState, { shed: shedBallast });
  }

  // Runs at flush time, not at call time, so a hundred mutations in one gesture
  // cost one stringify of the final state.
  function serializeState() {
    // first save of a new calendar day rolls the snapshot trail forward
    try { dailySnapshots(); } catch (_) { /* armour must never break the save */ }
    const json = JSON.stringify(state);
    checkHeadroom(json.length);
    return json;
  }

  // The bin (closed widgets kept so a mis-click is recoverable) can hold a whole
  // writing unit's pictures. If keeping it would stop the LIVE state saving, the
  // bin loses — work on the screen always beats work in the bin. Shed oldest
  // first, then drop it entirely, and only then admit defeat.
  //
  // It lives here rather than in the backend because it is a judgement about what
  // the teacher can afford to lose, and the backend has no business holding an
  // opinion about that. The backend retries after each concession and gives up
  // when this returns null.
  function shedBallast() {
    if (Array.isArray(state.bin) && state.bin.length) {
      state.bin.pop();
      return { json: JSON.stringify(state), notice: null };
    }
    if (state.bin !== undefined) {
      delete state.bin;
      return {
        json: JSON.stringify(state),
        notice: 'Storage was full — the list of recently closed widgets was cleared to make room.',
      };
    }
    return null;
  }

  // The backend reports failure in words the teacher can act on; only this file
  // knows how to put words on the screen. Both the quota refusal and the
  // bin-was-cleared notice arrive through here.
  SageStorage.onWriteError((msg) => toast(
    // taster only: the browser's storage limit is the honest sales moment
    window.SAGE_DEMO && /storage is full/i.test(msg)
      ? msg + ' The desktop app keeps decks in a real file with no browser limit — it’s on the front page.'
      : msg,
  ));

  // A packaged desktop app has no console anyone will open, and the one failure
  // that would silently wreck it is a Content-Security-Policy that blocks the
  // inline style= attributes this whole UI is built from — the widget bar, every
  // el() call, every widget position. Per the CSP spec, a nonce or hash in a
  // directive makes the browser IGNORE 'unsafe-inline' in that same directive,
  // and Tauri injects nonces at build time. So the app says so out loud rather
  // than collapsing quietly and leaving a teacher to describe it over email.
  //
  // It fires at most once, and only for the directive that actually matters.
  let cspToldOnce = false;
  document.addEventListener('securitypolicyviolation', (e) => {
    if (cspToldOnce || e.violatedDirective !== 'style-src-attr'
      && e.violatedDirective !== 'style-src') return;
    cspToldOnce = true;
    console.error('CSP blocked inline styles:', e.violatedDirective, e.originalPolicy);
    toast('⚠️ This build blocks inline styles, so the layout will be wrong. '
      + 'dangerousDisableAssetCspModification needs "style-src".', { ms: 20000 });
  });

  // Erasing is the one change a tab cannot make on its own. Every other tab is
  // still holding the old state in memory — the forgotten #s= projector window
  // is the documented case — and its next save() writes the whole thing back.
  // A z-bump on any pointerdown is a save(), so "Erase ALL … on this device"
  // was handing back the class lists it had just promised to destroy. The tab
  // that erases and every tab that hears about it both come through here.
  function dropLocalState() {
    // a save queued before the erase would land after it and undo it
    SageStorage.cancel();
    state = normalize(defaultState());
    rewardsDayTick();
    applyReadingFont(); renderStarPill();
    renderScreen();
    if (dashEl) renderDashboard();
  }

  // "ALL … on this device" has to include the snapshot trail and the undo
  // histories. They live in IndexedDB, outside the store the button empties,
  // and they hold the same decks and the same children's names.
  function clearStoredHistory() {
    if (!window.SageSnapshots) return Promise.resolve(true);
    return Promise.all([SageSnapshots.clearAll(), SageSnapshots.clearAux()])
      .then((r) => r.every(Boolean)).catch(() => false);
  }

  // A tab opened via "Open in new tab" carries #s=<screen id> and pins itself to
  // that screen: it ignores the shared active deck, so every tab can show a
  // different screen — even one from a different deck (screen ids are global).
  let viewId = (location.hash.match(/s=([a-z0-9]+)/) || [])[1] || null;

  const deckById = (id) => state.decks.find((d) => d.id === id) || null;
  const deckOfScreen = (sid) => state.decks.find((d) => d.screens.some((s) => s.id === sid)) || null;

  // the deck this TAB is viewing: pinned tabs resolve their screen across all decks
  function viewDeck() {
    if (viewId) {
      const d = deckOfScreen(viewId);
      if (d) return d;
      viewId = null; // pinned screen was deleted; fall back to the shared active deck
    }
    return deckById(state.activeDeck) || state.decks[0];
  }
  const screens = () => viewDeck().screens;

  function currentIndex() {
    const d = viewDeck(); // may clear a stale viewId as a side effect
    if (viewId) return d.screens.findIndex((s) => s.id === viewId);
    return clamp(d.current, 0, d.screens.length - 1);
  }
  const screen = () => screens()[currentIndex()];

  function setCurrent(i) {
    const d = viewDeck();
    i = ((i % d.screens.length) + d.screens.length) % d.screens.length;
    if (viewId) {
      viewId = d.screens[i].id;
      location.hash = 's=' + viewId;
    } else {
      d.current = i;
    }
    d.lastUsed = Date.now();
    save();
    renderScreen();
  }

  // the deck's linked class list wins when a picker/groups widget has no valid list
  const deckDefaultList = () => {
    const cl = viewDeck().classList;
    return state.lists[cl] ? cl : Object.keys(state.lists)[0] || null;
  };

  // The English widgets get names through THIS and never through `state`. The
  // story map's who-row needs the children's names to record who offered a word,
  // and a narrow accessor is auditable where handing over `state` is not: one
  // line says exactly what an English widget can see. Returns a copy, so a widget
  // holding the result cannot edit a class list by accident, and [] when no list
  // exists — which is the common case, since a deck ships with none.
  const classNames = () => {
    const cl = deckDefaultList();
    return cl && Array.isArray(state.lists[cl]) ? state.lists[cl].filter(Boolean).slice() : [];
  };

  function openDeck(id) {
    if (viewId) { viewId = null; location.hash = ''; } // this tab adopts the deck
    state.activeDeck = id;
    const d = deckById(id);
    if (d) d.lastUsed = Date.now();
    save();
    closeDashboard();
    renderScreen();
  }

  // ---------------------------------------------------------------- widget registry
  // Each type: { title, icon, w, h, defaults(), mount(body, w, api) -> cleanup? , settings(box, w, api)? }
  const WIDGETS = {};
  const instances = new Map(); // widget id -> { el, cleanup }

  function fitFont(elm, base) {
    // scale a display element's font to its container
    const resize = () => {
      const rect = elm.parentElement ? elm.parentElement.getBoundingClientRect() : null;
      if (!rect) return;
      elm.style.fontSize = Math.max(14, Math.min(rect.width / base, rect.height * 0.6)) + 'px';
    };
    const ro = new ResizeObserver(resize);
    ro.observe(elm.parentElement || elm);
    resize();
    return () => ro.disconnect();
  }

  // ---- Clock ----
  WIDGETS.clock = {
    title: 'Clock', icon: 'clock', accent: '#99f6e4', w: 260, h: 170,
    defaults: () => ({ mode: 'digital', seconds: false, date: true }),
    mount(body, w) {
      body.style.justifyContent = 'center';
      let cleanup = () => {};
      const render = () => {
        cleanup();
        body.innerHTML = '';
        if (w.props.mode === 'digital') {
          const disp = el('div', { class: 'clock-digital' });
          const dateEl = el('div', { class: 'clock-date' });
          disp.append(el('span', { class: 'clock-time' }), dateEl);
          body.append(disp);
          const unfit = fitFont(disp, w.props.seconds ? 5.4 : 4.2);
          const tick = () => {
            const now = new Date();
            const opts = { hour: '2-digit', minute: '2-digit' };
            if (w.props.seconds) opts.second = '2-digit';
            $('.clock-time', disp).textContent = now.toLocaleTimeString([], opts);
            dateEl.style.display = w.props.date ? '' : 'none';
            dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
          };
          tick();
          const iv = setInterval(tick, 500);
          cleanup = () => { clearInterval(iv); unfit(); };
        } else {
          const cv = el('canvas', { class: 'clock-analog' });
          body.append(cv);
          const draw = () => {
            const size = Math.min(body.clientWidth, body.clientHeight) - 8;
            if (size < 20) return;
            const dpr = window.devicePixelRatio || 1;
            cv.width = size * dpr; cv.height = size * dpr;
            cv.style.width = cv.style.height = size + 'px';
            const c = cv.getContext('2d');
            c.scale(dpr, dpr);
            const r = size / 2;
            c.translate(r, r);
            c.beginPath(); c.arc(0, 0, r - 2, 0, Math.PI * 2);
            c.fillStyle = '#fff'; c.fill();
            c.lineWidth = 3; c.strokeStyle = '#22303c'; c.stroke();
            for (let i = 0; i < 12; i++) {
              c.save(); c.rotate((i * Math.PI) / 6);
              c.beginPath(); c.moveTo(0, -r + 8); c.lineTo(0, -r + (i % 3 === 0 ? 18 : 13));
              c.lineWidth = i % 3 === 0 ? 3 : 1.5; c.stroke(); c.restore();
            }
            const now = new Date();
            const sec = now.getSeconds() + now.getMilliseconds() / 1000;
            const min = now.getMinutes() + sec / 60;
            const hr = (now.getHours() % 12) + min / 60;
            const hand = (angle, len, width, color) => {
              c.save(); c.rotate(angle);
              c.beginPath(); c.moveTo(0, len * 0.18); c.lineTo(0, -len);
              c.lineWidth = width; c.lineCap = 'round'; c.strokeStyle = color; c.stroke(); c.restore();
            };
            hand((hr * Math.PI) / 6, r * 0.5, 5, '#22303c');
            hand((min * Math.PI) / 30, r * 0.72, 3.5, '#22303c');
            if (w.props.seconds) hand((sec * Math.PI) / 30, r * 0.78, 1.5, '#0f766e');
            c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fillStyle = '#0f766e'; c.fill();
            c.setTransform(1, 0, 0, 1, 0, 0);
          };
          draw();
          const iv = setInterval(draw, w.props.seconds ? 100 : 1000);
          const ro = new ResizeObserver(draw);
          ro.observe(body);
          cleanup = () => { clearInterval(iv); ro.disconnect(); };
        }
      };
      render();
      this._rerender = render;
      return () => cleanup();
    },
    settings(box, w, api) {
      box.append(
        settingRow('Style', selectInput([['digital', 'Digital'], ['analog', 'Analog']], w.props.mode, (v) => { w.props.mode = v; api.refresh(); })),
        checkRow('Show seconds', w.props.seconds, (v) => { w.props.seconds = v; api.refresh(); }),
        checkRow('Show date', w.props.date, (v) => { w.props.date = v; api.refresh(); }),
      );
    },
  };

  // ---- Teaching clock ----
  // An interactive analog clock for teaching time: geared draggable hands,
  // optional digital + "time in words" readouts in several languages, and a
  // ladder of whole-class challenges from o'clock all the way to elapsed time.
  const CLOCK_LANGS = {
    en: {
      name: 'English', past: 'past', to: 'to',
      units: { h1: 'hour', h2: 'hours', m1: 'minute', m2: 'minutes' },
      quads: ["o'clock", 'quarter past', 'half past', 'quarter to'],
      ui: {
        set: 'Show', read: 'What time does the clock show?',
        later: (t, d) => `It is ${t}. Show the time ${d} later.`,
        earlier: (t, d) => `It is ${t}. Show the time ${d} earlier.`,
        correct: 'Correct!', again: 'Not yet — look closely and try again',
        answer: 'It is', start: 'Press “New” for a challenge',
      },
      words(h, m) {
        const N = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine'];
        const on = N[h - 1], next = N[h % 12];
        if (m === 0) return on + " o'clock";
        if (m === 15) return 'quarter past ' + on;
        if (m === 30) return 'half past ' + on;
        if (m === 45) return 'quarter to ' + next;
        if (m < 30) return N[m - 1] + (m % 5 ? (m === 1 ? ' minute' : ' minutes') : '') + ' past ' + on;
        return N[59 - m] + ((60 - m) % 5 ? ' minutes' : '') + ' to ' + next;
      },
    },
    fr: {
      name: 'Français', past: 'et', to: 'moins',
      units: { h1: 'heure', h2: 'heures', m1: 'minute', m2: 'minutes' },
      quads: ['pile', 'et quart', 'et demie', 'moins le quart'],
      ui: {
        set: 'Montre', read: 'Quelle heure est-il ?',
        later: (t, d) => `Il est ${t}. Montre l'heure ${d} plus tard.`,
        earlier: (t, d) => `Il est ${t}. Montre l'heure ${d} plus tôt.`,
        correct: 'Correct !', again: 'Pas encore — regarde bien',
        answer: 'Il est', start: 'Appuie sur « New » pour un défi',
      },
      words(h, m) {
        const N = ['une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt', 'vingt et une', 'vingt-deux', 'vingt-trois', 'vingt-quatre', 'vingt-cinq', 'vingt-six', 'vingt-sept', 'vingt-huit', 'vingt-neuf'];
        const hn = (x) => { const n = ((x - 1) % 12) + 1; return N[n - 1] + ' heure' + (n > 1 ? 's' : ''); };
        if (m === 0) return hn(h);
        if (m === 15) return hn(h) + ' et quart';
        if (m === 30) return hn(h) + ' et demie';
        if (m === 45) return hn(h + 1) + ' moins le quart';
        if (m < 30) return hn(h) + ' ' + N[m - 1];
        return hn(h + 1) + ' moins ' + N[59 - m];
      },
    },
    de: {
      name: 'Deutsch', past: 'nach', to: 'vor',
      units: { h1: 'Stunde', h2: 'Stunden', m1: 'Minute', m2: 'Minuten' },
      quads: ['Uhr', 'Viertel nach', 'halb', 'Viertel vor'],
      ui: {
        set: 'Stelle die Uhr auf', read: 'Wie spät ist es?',
        later: (t, d) => `Es ist ${t}. Stelle die Uhr ${d} später.`,
        earlier: (t, d) => `Es ist ${t}. Stelle die Uhr ${d} früher.`,
        correct: 'Richtig!', again: 'Noch nicht — schau genau hin',
        answer: 'Es ist', start: 'Drücke „New“ für eine Aufgabe',
      },
      words(h, m) {
        const N = ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig', 'einundzwanzig', 'zweiundzwanzig', 'dreiundzwanzig', 'vierundzwanzig', 'fünfundzwanzig', 'sechsundzwanzig', 'siebenundzwanzig', 'achtundzwanzig', 'neunundzwanzig'];
        if (m === 0) return (h === 1 ? 'ein' : N[h - 1]) + ' Uhr';
        if (m === 15) return 'Viertel nach ' + N[h - 1];
        if (m === 30) return 'halb ' + N[h % 12];
        if (m === 45) return 'Viertel vor ' + N[h % 12];
        if (m < 30) return N[m - 1] + (m % 5 ? ' Minuten' : '') + ' nach ' + N[h - 1];
        return N[59 - m] + ((60 - m) % 5 ? ' Minuten' : '') + ' vor ' + N[h % 12];
      },
    },
    es: {
      name: 'Español', past: 'y', to: 'menos',
      units: { h1: 'hora', h2: 'horas', m1: 'minuto', m2: 'minutos' },
      quads: ['en punto', 'y cuarto', 'y media', 'menos cuarto'],
      ui: {
        set: 'Pon el reloj a', read: '¿Qué hora es?',
        later: (t, d) => `Son ${t}. Pon el reloj ${d} más tarde.`,
        earlier: (t, d) => `Son ${t}. Pon el reloj ${d} antes.`,
        correct: '¡Correcto!', again: 'Todavía no — mira otra vez',
        answer: 'Son', start: 'Pulsa «New» para un reto',
      },
      words(h, m) {
        const N = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuna', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
        const hn = (x) => { const n = ((x - 1) % 12) + 1; return (n === 1 ? 'la ' : 'las ') + N[n - 1]; };
        if (m === 0) return hn(h) + ' en punto';
        if (m === 15) return hn(h) + ' y cuarto';
        if (m === 30) return hn(h) + ' y media';
        if (m === 45) return hn(h + 1) + ' menos cuarto';
        if (m < 30) return hn(h) + ' y ' + N[m - 1];
        return hn(h + 1) + ' menos ' + N[59 - m];
      },
    },
    it: {
      name: 'Italiano', past: 'e', to: 'meno',
      units: { h1: 'ora', h2: 'ore', m1: 'minuto', m2: 'minuti' },
      quads: ['in punto', 'e un quarto', 'e mezza', 'meno un quarto'],
      ui: {
        set: 'Metti l’orologio su', read: 'Che ora è?',
        later: (t, d) => `Sono ${t}. Metti l’orologio ${d} più tardi.`,
        earlier: (t, d) => `Sono ${t}. Metti l’orologio ${d} prima.`,
        correct: 'Corretto!', again: 'Non ancora — guarda bene',
        answer: 'Sono', start: 'Premi «New» per una sfida',
      },
      words(h, m) {
        const N = ['una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove', 'venti', 'ventuno', 'ventidue', 'ventitré', 'ventiquattro', 'venticinque', 'ventisei', 'ventisette', 'ventotto', 'ventinove'];
        const hn = (x) => { const n = ((x - 1) % 12) + 1; return n === 1 ? "l'una" : 'le ' + N[n - 1]; };
        if (m === 0) return hn(h);
        if (m === 15) return hn(h) + ' e un quarto';
        if (m === 30) return hn(h) + ' e mezza';
        if (m === 45) return hn(h + 1) + ' meno un quarto';
        if (m < 30) return hn(h) + ' e ' + N[m - 1];
        return hn(h + 1) + ' meno ' + N[59 - m];
      },
    },
    cy: {
      name: 'Cymraeg', past: 'wedi', to: 'i',
      units: { h1: 'awr', h2: 'awr', m1: 'munud', m2: 'munud' },
      quads: ["o'r gloch", 'chwarter wedi', 'hanner awr wedi', 'chwarter i'],
      ui: {
        set: 'Dangos', read: 'Faint o’r gloch yw hi?',
        later: (t, d) => `Mae hi'n ${t}. Dangos yr amser ${d} yn ddiweddarach.`,
        earlier: (t, d) => `Mae hi'n ${t}. Dangos yr amser ${d} yn gynt.`,
        correct: 'Cywir!', again: 'Ddim eto — edrych eto',
        answer: "Mae hi'n", start: 'Pwyswch «New» am her',
      },
      // Welsh time words cover the classic five-minute clock phrases; odd minutes
      // fall back to digits (words() returning null does that automatically)
      words(h, m) {
        const H = ['un', 'dau', 'tri', 'pedwar', 'pump', 'chwech', 'saith', 'wyth', 'naw', 'deg', 'un ar ddeg', 'deuddeg'];
        const M = { 5: 'pum munud', 10: 'deng munud', 20: 'ugain munud', 25: 'pum munud ar hugain' };
        const hn = (x) => H[(x - 1) % 12];
        if (m === 0) return hn(h) + " o'r gloch";
        if (m === 15) return 'chwarter wedi ' + hn(h);
        if (m === 30) return 'hanner awr wedi ' + hn(h);
        if (m === 45) return 'chwarter i ' + hn(h + 1);
        if (m < 30) return M[m] ? M[m] + ' wedi ' + hn(h) : null;
        return M[60 - m] ? M[60 - m] + ' i ' + hn(h + 1) : null;
      },
    },
  };

  // the teaching ladder: each level generates targets one small step harder
  const CLOCK_LEVELS = [
    { label: "1 · O'clock", gen: (R) => ({ m: 0 }) },
    { label: '2 · Half past', gen: (R) => ({ m: R(2) ? 30 : 0 }) },
    { label: '3 · Quarters', gen: (R) => ({ m: [0, 15, 30, 45][R(4)] }) },
    { label: '4 · Five minutes', gen: (R) => ({ m: R(12) * 5 }) },
    { label: '5 · Any minute', gen: (R) => ({ m: R(60) }), digits: true },
    { label: '6 · 24-hour clock', gen: (R) => ({ m: R(12) * 5 }), h24: true },
    { label: '7 · Time later', elapsed: true },
  ];

  // ready-made challenge sequences, EYFS → KS2. Lines use the same format the
  // teacher can type in settings: "10:00" · "14:35" (24-hour) · "12:50 +3:15"
  // (show the time later) · "9:10 -1:30" (earlier)
  const CLOCK_PACKS = [
    { id: 'oclock', name: "O'clock (EYFS)", lines: ['10:00', '11:00', '2:00', '7:00', '12:00', '4:00', '9:00', '1:00'] },
    { id: 'halfpast', name: 'Half past (KS1)', lines: ['8:30', '9:30', '3:30', '11:30', '1:30', '6:30', '12:30', '5:30'] },
    { id: 'quarters', name: 'Quarter past & to (KS1)', lines: ['2:15', '7:45', '10:15', '4:45', '1:15', '8:45', '11:15', '6:45'] },
    { id: 'five', name: 'Five minutes (KS2)', lines: ['3:05', '6:40', '9:25', '12:55', '2:35', '10:10', '7:50', '4:20'] },
    { id: 'minute', name: 'To the minute (KS2)', lines: ['3:07', '11:52', '6:23', '9:38', '1:44', '8:16', '5:59', '2:31'] },
    { id: 'h24', name: '24-hour times (KS2)', lines: ['13:15', '16:40', '21:05', '18:30', '14:55', '23:10', '15:45', '19:20'] },
    { id: 'elapsed', name: 'Add & subtract time (KS2)', lines: ['12:50 +3:15', '2:20 +0:45', '9:10 -1:30', '6:35 +2:40', '11:15 -0:50', '4:05 +1:55', '10:30 -2:15', '3:45 +6:30'] },
  ];

  WIDGETS.teachclock = {
    title: 'Teaching clock', icon: 'teachclock', accent: '#99f6e4', w: 470, h: 620,
    defaults: () => ({
      h: 3, m: 0, pm: false, live: false,
      showHour: true, showMinute: true, showSecond: false,
      face: 'quadrants', // plain | minutes | pastto | quadrants
      digital: '12', // off | 12 | 24
      words: true, lang: 'en', snap: 1, quick: true,
      gameOn: true, level: 1, kind: 'set',
      pack: '', custom: [], listIndex: 0,
      score: 0, streak: 0, game: null,
    }),
    mount(body, w) {
      body.classList.add('tclock');
      const p = w.props;
      const lang = () => CLOCK_LANGS[p.lang] || CLOCK_LANGS.en;
      const pad2 = (n) => String(n).padStart(2, '0');
      const fmtDigits = (t, h24) => h24
        ? pad2((t.h % 12) + (t.pm ? 12 : 0)) + ':' + pad2(t.m)
        : ((t.h % 12) || 12) + ':' + pad2(t.m);
      const timeText = (t, digits, h24) => {
        if (h24) return fmtDigits(t, true);
        if (!digits) { const s = lang().words(((t.h - 1) % 12) + 1, t.m); if (s) return s; }
        return fmtDigits(t, false);
      };

      // current displayed time (live clocks follow the wall clock)
      const cur = () => {
        if (p.live) {
          const d = new Date();
          return { h: (d.getHours() % 12) || 12, m: d.getMinutes(), s: d.getSeconds() + d.getMilliseconds() / 1000, pm: d.getHours() >= 12 };
        }
        return { h: p.h, m: p.m, s: new Date().getSeconds(), pm: p.pm };
      };

      // ---- structure
      const task = el('div', { class: 'tclock-task' });
      const cvWrap = el('div', { class: 'tclock-canvas grow' });
      const cv = el('canvas');
      cvWrap.append(cv);
      const digitalEl = el('span', { class: 'tclock-digital' });
      const ampmEl = el('button', {
        class: 'tclock-ampm', title: 'Switch AM / PM',
        onclick: () => { if (!p.live) { p.pm = !p.pm; save(); paintAll(); } },
      });
      const readout = el('div', { class: 'tclock-readout' }, digitalEl, ampmEl);
      const wordsEl = el('div', { class: 'tclock-words' });
      const quick = el('div', { class: 'tclock-quick' });
      const gamebar = el('div', { class: 'tclock-game' });
      body.append(task, cvWrap, readout, wordsEl, quick, gamebar);

      // "3 hours 15 minutes" in the widget's language
      const durText = (h, m) => {
        const u = lang().units, parts = [];
        if (h) parts.push(h + ' ' + (h === 1 ? u.h1 : u.h2));
        if (m) parts.push(m + ' ' + (m === 1 ? u.m1 : u.m2));
        return parts.join(' ');
      };

      // move the whole clock forward/back, gears and AM/PM included
      function shiftTime(d) {
        if (p.live) return;
        let tot = (p.h % 12) * 60 + p.m + d;
        const flips = Math.floor(tot / 720);
        if (flips % 2) p.pm = !p.pm;
        tot -= flips * 720;
        p.h = Math.floor(tot / 60) || 12;
        p.m = tot % 60;
        save(); paintAll();
      }

      // ---- quick teacher bar: differentiate on the fly without opening settings.
      // Toggles show/hide the words + hands; each time cluster is [−] label [+]
      // — the label sets the drag snap, − / + nudge the clock by that amount.
      const quickToggles = ['words:Words', 'showHour:Hour', 'showMinute:Minute'].map((s) => {
        const [key, label] = s.split(':');
        const b = el('button', {
          class: 'tq-btn', title: 'Show / hide ' + label.toLowerCase(),
          onclick: () => { p[key] = !p[key]; save(); paintAll(); },
        }, label);
        b.dataset.key = key;
        return b;
      });
      const snapBtns = [], stepBtns = [];
      quick.append(...quickToggles);
      for (const [mins, label] of [[1, '1m'], [5, '5m'], [15, '15m'], [30, '30m'], [45, '45m'], [60, '1h']]) {
        const sb = el('button', {
          class: 'tq-snap', title: 'Snap the hands to ' + label + ' steps',
          onclick: () => { p.snap = mins; save(); paintAll(); },
        }, label);
        sb.dataset.snap = String(mins);
        snapBtns.push(sb);
        const minus = el('button', { class: 'tq-mini', title: 'Back ' + label, onclick: () => shiftTime(-mins) }, '−');
        const plus = el('button', { class: 'tq-mini', title: 'Forward ' + label, onclick: () => shiftTime(mins) }, '+');
        stepBtns.push(minus, plus);
        quick.append(el('span', { class: 'tq-step' }, minus, sb, plus));
      }

      // ---- game bar: random levels, ready-made packs or the teacher's own list
      let wrongTimer = null;
      const packLines = () => {
        if (p.pack === 'custom') return p.custom || [];
        const pk = CLOCK_PACKS.find((x) => x.id === p.pack);
        return pk ? pk.lines : [];
      };
      const modeOpts = [
        ...CLOCK_LEVELS.map((L, i) => ['l' + (i + 1), L.label]),
        ...CLOCK_PACKS.map((pk) => ['p:' + pk.id, '★ ' + pk.name]),
        ['custom', '✎ My challenges'],
      ];
      const modeSel = selectInput(modeOpts, p.pack ? (p.pack === 'custom' ? 'custom' : 'p:' + p.pack) : 'l' + p.level, (v) => {
        if (v === 'custom') {
          if (!Array.isArray(p.custom) || !p.custom.length) p.custom = CLOCK_PACKS[0].lines.slice();
          p.pack = 'custom';
        } else if (v.startsWith('p:')) {
          p.pack = v.slice(2);
        } else {
          p.pack = '';
          p.level = +v.slice(1);
        }
        p.listIndex = 0;
        p.game = null;
        save(); paintAll();
      });
      modeSel.classList.add('tclock-level');
      const kindBtn = (id, label) => el('button', {
        class: 'btn ghost small', 'data-kind': id,
        onclick: () => { p.kind = id; p.game = null; save(); paintAll(); },
      }, label);
      const setBtn = kindBtn('set', 'Set it');
      const readBtn = kindBtn('read', 'Read it');
      const newBtn = el('button', { class: 'btn small', onclick: () => newChallenge() }, 'New');
      const actBtn = el('button', { class: 'btn ghost small', onclick: () => checkOrReveal() });
      const scoreEl = el('span', { class: 'tclock-score', title: 'Points this session' });
      gamebar.append(modeSel, setBtn, readBtn, newBtn, actBtn, scoreEl);

      // "10:00" · "14:35" · "12:50 +3:15" · "9:10 -1:30" -> challenge parts
      function parseClockLine(line) {
        const m = String(line).trim().match(/^(\d{1,2})[:.](\d{2})(?:\s*([+-])\s*(\d{1,2})[:.](\d{2}))?$/);
        if (!m) return null;
        const H = +m[1], M = +m[2];
        if (H > 23 || M > 59) return null;
        const c = { h24: H === 0 || H > 12, bh: H, bm: M };
        if (m[3]) {
          c.dir = m[3] === '-' ? -1 : 1;
          c.ah = +m[4]; c.am = +m[5];
          if (c.am > 59) return null;
        }
        return c;
      }

      function newFromList() {
        const lines = packLines().map(parseClockLine).filter(Boolean);
        if (!lines.length) {
          toast('No valid challenges in the list yet — edit them in Settings');
          return;
        }
        const c = lines[p.listIndex % lines.length];
        p.listIndex = (p.listIndex % lines.length) + 1;
        const base = { h: ((c.bh + 11) % 12) + 1, m: c.bm, pm: c.h24 ? c.bh >= 12 : null };
        let target = base, text;
        const kind = c.dir ? 'set' : p.kind; // elapsed lines are always "set it"
        if (c.h24 && p.digital === 'off') p.digital = '24';
        if (c.dir) {
          let tot = (base.h % 12) * 60 + base.m + c.dir * (c.ah * 60 + c.am);
          tot = ((tot % 720) + 720) % 720;
          target = { h: Math.floor(tot / 60) || 12, m: tot % 60, pm: null };
          text = (c.dir > 0 ? lang().ui.later : lang().ui.earlier)(timeText(base, false, c.h24), durText(c.ah, c.am));
        } else if (kind === 'read') {
          text = lang().ui.read;
        } else {
          text = lang().ui.set + ': ' + timeText(target, false, c.h24);
        }
        if (kind === 'read') {
          p.h = target.h; p.m = target.m;
          if (target.pm != null) p.pm = target.pm;
        }
        p.game = { target, kind, state: 'open', text };
        save();
        paintAll();
      }

      function newChallenge() {
        clearTimeout(wrongTimer);
        if (p.pack) { newFromList(); return; }
        const L = CLOCK_LEVELS[p.level - 1];
        const R = (n) => Math.floor(Math.random() * n);
        const h = R(12) + 1;
        let target, base = null, add = 0, text;
        if (L.elapsed) {
          base = { h, m: R(12) * 5, pm: false };
          add = [5, 10, 15, 20, 25, 30, 45, 60][R(8)];
          const t = ((base.h % 12) * 60 + base.m + add) % 720;
          target = { h: Math.floor(t / 60) || 12, m: t % 60, pm: null };
        } else {
          target = { h, m: L.gen(R).m, pm: L.h24 ? !!R(2) : null };
        }
        if (L.h24 && p.digital === 'off') p.digital = '24'; // the 24-hour level needs the digital line
        if (p.kind === 'read') {
          // jump the clock to a mystery time; the class reads it aloud
          p.h = target.h; p.m = target.m;
          if (target.pm != null) p.pm = target.pm;
          text = lang().ui.read;
        } else if (L.elapsed) {
          text = lang().ui.later(timeText(base, L.digits, false), durText(Math.floor(add / 60), add % 60));
        } else {
          text = lang().ui.set + ': ' + timeText(target, L.digits, L.h24);
        }
        p.game = { target, base, add, kind: p.kind, state: 'open', text };
        save();
        paintAll();
      }

      function checkOrReveal() {
        const g = p.game;
        if (!g || g.state !== 'open') { newChallenge(); return; }
        clearTimeout(wrongTimer);
        if (g.kind === 'read') {
          g.state = 'revealed';
          save(); paintAll();
          return;
        }
        const okPm = g.target.pm == null || p.pm === g.target.pm;
        if ((p.h % 12) === (g.target.h % 12) && p.m === g.target.m && okPm) {
          g.state = 'done';
          p.score++; p.streak++;
          beep(1);
        } else {
          g.state = 'wrong';
          p.streak = 0;
          wrongTimer = setTimeout(() => { if (p.game === g && g.state === 'wrong') { g.state = 'open'; paintAll(); } }, 1800);
        }
        save();
        paintAll();
      }

      // ---- canvas
      const ctx = cv.getContext('2d');
      function draw() {
        const size = Math.min(cvWrap.clientWidth, cvWrap.clientHeight) - 6;
        if (size < 40) return;
        const dpr = window.devicePixelRatio || 1;
        cv.width = size * dpr; cv.height = size * dpr;
        cv.style.width = cv.style.height = size + 'px';
        const c = ctx;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const r = size / 2;
        c.translate(r, r);
        const t = cur();
        const ring = p.face !== 'plain';

        // face
        c.beginPath(); c.arc(0, 0, r - 2, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.lineWidth = Math.max(2.5, r * 0.02); c.strokeStyle = '#22303c'; c.stroke();

        if (p.face === 'pastto') {
          // right half = "past" (mint), left half = "to" (amber): a visual anchor
          // for which word to use before the hour
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * 0.8, -Math.PI / 2, Math.PI / 2); c.closePath();
          c.fillStyle = 'rgba(34,197,94,0.16)'; c.fill();
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * 0.8, Math.PI / 2, Math.PI * 1.5); c.closePath();
          c.fillStyle = 'rgba(245,158,11,0.18)'; c.fill();
          c.font = '700 ' + Math.max(10, r * 0.09) + 'px Quicksand, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = 'rgba(21,128,61,0.8)'; c.fillText(lang().past, r * 0.42, r * 0.3);
          c.fillStyle = 'rgba(180,83,9,0.85)'; c.fillText(lang().to, -r * 0.42, r * 0.3);
        }

        if (p.face === 'quadrants') {
          // the classic four-colour teaching face: each quarter of the hour has
          // its own colour, with o'clock / quarter past / half past / quarter to
          // anchored at 12, 3, 6 and 9
          const fills = ['rgba(250,204,21,0.28)', 'rgba(96,165,250,0.26)', 'rgba(248,113,113,0.24)', 'rgba(74,222,128,0.26)'];
          fills.forEach((f, i) => {
            c.beginPath(); c.moveTo(0, 0);
            c.arc(0, 0, r * 0.8, -Math.PI / 2 + (i * Math.PI) / 2, (i * Math.PI) / 2);
            c.closePath(); c.fillStyle = f; c.fill();
          });
          const Q = lang().quads;
          const spots = [
            { x: 0, y: -r * 0.44, col: '#15803d' },
            { x: r * 0.44, y: 0, col: '#b45309' },
            { x: 0, y: r * 0.44, col: '#1d4ed8' },
            { x: -r * 0.44, y: 0, col: '#b91c1c' },
          ];
          c.font = '700 ' + Math.max(9, r * 0.07) + 'px Quicksand, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          spots.forEach((s, i) => {
            c.fillStyle = s.col;
            const wds = String(Q[i]).split(' ');
            const rows = wds.length > 1 ? [wds.slice(0, wds.length - 1).join(' '), wds[wds.length - 1]] : [Q[i]];
            const lh = r * 0.078;
            rows.forEach((ln, j) => c.fillText(ln, s.x, s.y + (j - (rows.length - 1) / 2) * lh));
          });
        }

        // ticks
        for (let i = 0; i < 60; i++) {
          const major = i % 5 === 0;
          c.save(); c.rotate((i * Math.PI) / 30);
          c.beginPath(); c.moveTo(0, -r * 0.86); c.lineTo(0, -r * (major ? 0.79 : 0.82));
          c.lineWidth = major ? Math.max(2.5, r * 0.018) : 1.2;
          c.strokeStyle = '#22303c'; c.stroke(); c.restore();
        }

        // minute ring (00, 05 … 55) — colored soft teal so it reads as "minutes"
        if (ring) {
          c.font = '600 ' + Math.max(9, r * 0.085) + 'px Quicksand, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = '#0f766e';
          for (let i = 0; i < 12; i++) {
            const a = (i * Math.PI) / 6;
            c.fillText(i === 0 ? '00' : pad2(i * 5), Math.sin(a) * r * 0.925, -Math.cos(a) * r * 0.925);
          }
        }

        // hour numbers
        c.font = '700 ' + Math.max(13, r * 0.155) + 'px Quicksand, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#22303c';
        for (let i = 1; i <= 12; i++) {
          const a = (i * Math.PI) / 6;
          c.fillText(String(i), Math.sin(a) * r * 0.665, -Math.cos(a) * r * 0.665);
        }

        // hands: hour teal, minute orange, second red — color-coded like a
        // classroom teaching clock so "the little teal hand" is unambiguous
        const hand = (angle, len, width, color, arrow) => {
          c.save(); c.rotate(angle);
          c.beginPath(); c.moveTo(0, len * 0.16); c.lineTo(0, -len);
          c.lineWidth = width; c.lineCap = 'round'; c.strokeStyle = color; c.stroke();
          if (arrow) {
            c.beginPath();
            c.moveTo(0, -len - Math.max(6, width * 1.6));
            c.lineTo(-width * 1.35, -len + width * 1.1);
            c.lineTo(width * 1.35, -len + width * 1.1);
            c.closePath();
            c.fillStyle = color; c.fill();
          }
          c.restore();
        };
        const mAng = (t.m * Math.PI) / 30;
        const hAng = (((t.h % 12) + t.m / 60) * Math.PI) / 6;
        if (p.showHour) hand(hAng, r * 0.42, Math.max(5, r * 0.05), '#0f766e', true);
        if (p.showMinute) hand(mAng, r * 0.72, Math.max(4, r * 0.035), '#f97316', true);
        if (p.showSecond) hand((t.s * Math.PI) / 30, r * 0.8, Math.max(1.5, r * 0.012), '#dc2626', false);
        c.beginPath(); c.arc(0, 0, Math.max(4, r * 0.04), 0, Math.PI * 2); c.fillStyle = '#22303c'; c.fill();
        c.setTransform(1, 0, 0, 1, 0, 0);
      }

      // ---- geared hand dragging
      const angDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      const pointerInfo = (e) => {
        const rect = cv.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        return { a: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, rad: Math.hypot(dx, dy), r: rect.width / 2 };
      };
      let drag = null;
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', (e) => {
        if (p.live) return;
        const { a, rad, r } = pointerInfo(e);
        if (rad > r) return;
        const mAng = p.m * 6;
        const hAng = ((p.h % 12) + p.m / 60) * 30;
        const cands = [];
        // score = angular distance + how far the finger is from that hand's tip
        if (p.showMinute) cands.push({ hand: 'minute', ang: mAng, d: angDist(a, mAng) + (Math.abs(rad - r * 0.72) / r) * 30 });
        if (p.showHour) cands.push({ hand: 'hour', ang: hAng, d: angDist(a, hAng) + (Math.abs(rad - r * 0.42) / r) * 30 });
        cands.sort((x, y) => x.d - y.d);
        if (!cands.length || angDist(a, cands[0].ang) > 40) return;
        e.preventDefault();
        drag = { hand: cands[0].hand, lastA: a, total: (p.h % 12) * 60 + p.m };
        try { cv.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const { a } = pointerInfo(e);
        let dA = a - drag.lastA;
        if (dA > 180) dA -= 360;
        if (dA < -180) dA += 360;
        drag.lastA = a;
        // gearing: the minute hand moves the hour hand with it (and vice versa),
        // exactly like the wheels inside a real clock
        drag.total += drag.hand === 'minute' ? dA / 6 : dA * 2;
        const flips = Math.floor(drag.total / 720);
        if (flips) {
          if (flips % 2) p.pm = !p.pm; // sweeping past 12 flips morning/afternoon
          drag.total -= flips * 720;
        }
        const snap = +p.snap || 1;
        const tot = ((Math.round(drag.total / snap) * snap) % 720 + 720) % 720;
        p.h = Math.floor(tot / 60) || 12;
        p.m = tot % 60;
        paintAll();
      });
      const endDrag = () => { if (drag) { drag = null; save(); } };
      cv.addEventListener('pointerup', endDrag);
      cv.addEventListener('pointercancel', endDrag);

      // ---- paint the readouts + game chrome
      function paintAll() {
        draw();
        const t = cur();
        const g = p.gameOn ? p.game : null;
        const hideAnswer = g && g.kind === 'read' && g.state === 'open';
        digitalEl.textContent = fmtDigits(t, p.digital === '24');
        ampmEl.textContent = t.pm ? 'PM' : 'AM';
        // live time owns AM/PM — the step buttons already disable for live,
        // and a visibly enabled button that ignores the tap reads as broken
        ampmEl.disabled = !!p.live;
        ampmEl.title = p.live ? 'The live clock sets AM / PM itself' : 'Switch AM / PM';
        readout.style.display = p.digital === 'off' || hideAnswer ? 'none' : '';
        const wtxt = lang().words(t.h, t.m);
        wordsEl.textContent = wtxt || fmtDigits(t, false);
        wordsEl.style.display = p.words && !hideAnswer ? '' : 'none';
        // task banner
        task.style.display = p.gameOn ? '' : 'none';
        gamebar.style.display = p.gameOn ? '' : 'none';
        task.classList.remove('ok', 'no');
        if (!p.gameOn) { /* nothing */ }
        else if (!g) task.textContent = lang().ui.start;
        else if (g.state === 'done') { task.textContent = '✓ ' + lang().ui.correct + (p.streak > 1 ? ' ' + '⭐'.repeat(Math.min(p.streak, 5)) : ''); task.classList.add('ok'); }
        else if (g.state === 'wrong') { task.textContent = lang().ui.again; task.classList.add('no'); }
        else if (g.state === 'revealed') task.textContent = lang().ui.answer + ' ' + timeText(g.target, false, false) + ' · ' + fmtDigits({ ...g.target, pm: p.pm }, p.digital === '24');
        else task.textContent = g.text;
        // game bar states
        for (const b of [setBtn, readBtn]) b.classList.toggle('active', p.kind === b.dataset.kind);
        modeSel.value = p.pack ? (p.pack === 'custom' ? 'custom' : 'p:' + p.pack) : 'l' + p.level;
        actBtn.textContent = p.kind === 'read' ? 'Reveal' : 'Check';
        actBtn.disabled = !g || g.state !== 'open';
        const nLines = p.pack ? packLines().length : 0;
        scoreEl.textContent = '⭐ ' + (p.score || 0)
          + (nLines && p.game ? ' · ' + (((p.listIndex + nLines - 1) % nLines) + 1) + '/' + nLines : '');
        // quick teacher bar states
        quick.style.display = p.quick === false ? 'none' : '';
        for (const b of quickToggles) b.classList.toggle('active', !!p[b.dataset.key]);
        for (const b of snapBtns) b.classList.toggle('active', String(p.snap || 1) === b.dataset.snap);
        for (const b of stepBtns) b.disabled = !!p.live;
      }

      paintAll();
      const iv = setInterval(() => { if (p.live || p.showSecond) paintAll(); }, 500);
      const ro = new ResizeObserver(() => draw());
      ro.observe(cvWrap);
      return () => { clearInterval(iv); clearTimeout(wrongTimer); ro.disconnect(); };
    },
    settings(box, w, api) {
      const langOpts = Object.entries(CLOCK_LANGS).map(([id, l]) => [id, l.name]);
      // the challenge editor shows the active pack; any edit becomes "My challenges"
      const activeLines = w.props.pack && w.props.pack !== 'custom'
        ? (CLOCK_PACKS.find((x) => x.id === w.props.pack) || { lines: [] }).lines
        : (Array.isArray(w.props.custom) && w.props.custom.length ? w.props.custom : CLOCK_PACKS[0].lines);
      const ta = el('textarea', {
        class: 'text-input', rows: 7,
        style: 'width:100%;box-sizing:border-box;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.5;',
        onchange: () => {
          w.props.custom = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
          w.props.pack = 'custom';
          w.props.listIndex = 0;
          w.props.game = null;
          api.refresh();
        },
      });
      ta.value = activeLines.join('\n');
      box.append(
        settingRow('Language', selectInput(langOpts, w.props.lang, (v) => { w.props.lang = v; api.refresh(); })),
        settingRow('Clock face', selectInput([['plain', 'Numbers only'], ['minutes', 'Minute ring'], ['pastto', 'Past & to halves'], ['quadrants', 'Coloured quadrants']], w.props.face, (v) => { w.props.face = v; api.refresh(); })),
        settingRow('Digital', selectInput([['off', 'Hidden'], ['12', '12-hour'], ['24', '24-hour']], w.props.digital, (v) => { w.props.digital = v; api.refresh(); })),
        checkRow('Time in words', w.props.words, (v) => { w.props.words = v; api.refresh(); }),
        checkRow('Hour hand', w.props.showHour, (v) => { w.props.showHour = v; api.refresh(); }),
        checkRow('Minute hand', w.props.showMinute, (v) => { w.props.showMinute = v; api.refresh(); }),
        checkRow('Second hand', w.props.showSecond, (v) => { w.props.showSecond = v; api.refresh(); }),
        settingRow('Snap minutes', selectInput([['1', 'To the minute'], ['5', '5 minutes'], ['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour']], String(w.props.snap || 1), (v) => { w.props.snap = +v; api.refresh(); })),
        checkRow('Quick teacher bar on the widget', w.props.quick !== false, (v) => { w.props.quick = v; api.refresh(); }),
        checkRow('Live clock (follows real time)', w.props.live, (v) => { w.props.live = v; api.refresh(); }),
        checkRow('Teaching starters (challenges)', w.props.gameOn, (v) => { w.props.gameOn = v; api.refresh(); }),
        el('div', { style: 'font-weight:700;margin-top:2px;' }, 'Challenge list'),
        ta,
        el('div', { class: 'hint' }, 'One per line: 10:00 · 8:30 · 14:35 (24-hour) · 12:50 +3:15 (show it later) · 9:10 -1:30 (earlier). Editing saves as “✎ My challenges”.'),
        el('button', {
          class: 'btn ghost small', style: 'align-self:flex-start;',
          onclick: () => { w.props.score = 0; w.props.streak = 0; w.props.game = null; w.props.listIndex = 0; api.refresh(); },
        }, 'Reset score'),
      );
    },
  };

  // ---- Money (shared by the Money tray and the Class shop) ----
  // Currencies are pure data — adding one is a dozen lines, and the pieces are
  // stylised CSS/SVG shapes (no banknote imagery). Values are in minor units.
  const MONEY_CURRENCIES = {
    gbp: {
      name: 'UK pounds (£)', sym: '£', minor: 'p',
      denoms: [
        { v: 1, label: '1p', kind: 'coin', style: 'copper', d: 34 },
        { v: 2, label: '2p', kind: 'coin', style: 'copper', d: 44 },
        { v: 5, label: '5p', kind: 'coin', style: 'silver', d: 31 },
        { v: 10, label: '10p', kind: 'coin', style: 'silver', d: 42 },
        { v: 20, label: '20p', kind: 'coin', style: 'silver', shape: 'hept', d: 38 },
        { v: 50, label: '50p', kind: 'coin', style: 'silver', shape: 'hept', d: 48 },
        { v: 100, label: '£1', kind: 'coin', style: 'gold', d: 40 },
        { v: 200, label: '£2', kind: 'coin', style: 'bimetal', d: 49 },
        { v: 500, label: '£5', kind: 'note', bg: '#79c2b1', d: 86 },
        { v: 1000, label: '£10', kind: 'note', bg: '#dfa259', d: 92 },
        { v: 2000, label: '£20', kind: 'note', bg: '#b49add', d: 98 },
      ],
    },
    eur: {
      name: 'Euro (€)', sym: '€', minor: 'c',
      denoms: [
        { v: 1, label: '1c', kind: 'coin', style: 'copper', d: 30 },
        { v: 2, label: '2c', kind: 'coin', style: 'copper', d: 36 },
        { v: 5, label: '5c', kind: 'coin', style: 'copper', d: 42 },
        { v: 10, label: '10c', kind: 'coin', style: 'gold', d: 34 },
        { v: 20, label: '20c', kind: 'coin', style: 'gold', d: 40 },
        { v: 50, label: '50c', kind: 'coin', style: 'gold', d: 46 },
        { v: 100, label: '€1', kind: 'coin', style: 'bimetal2', d: 42 },
        { v: 200, label: '€2', kind: 'coin', style: 'bimetal', d: 48 },
        { v: 500, label: '€5', kind: 'note', bg: '#b9bfc9', d: 86 },
        { v: 1000, label: '€10', kind: 'note', bg: '#d98f8f', d: 92 },
        { v: 2000, label: '€20', kind: 'note', bg: '#8fa9d9', d: 98 },
      ],
    },
    usd: {
      name: 'US dollars ($)', sym: '$', minor: '¢',
      denoms: [
        { v: 1, label: '1¢', kind: 'coin', style: 'copper', d: 34 },
        { v: 5, label: '5¢', kind: 'coin', style: 'silver', d: 38 },
        { v: 10, label: '10¢', kind: 'coin', style: 'silver', d: 30 },
        { v: 25, label: '25¢', kind: 'coin', style: 'silver', d: 43 },
        { v: 100, label: '$1', kind: 'note', bg: '#9db89a', d: 86 },
        { v: 500, label: '$5', kind: 'note', bg: '#b3a4c6', d: 90 },
        { v: 1000, label: '$10', kind: 'note', bg: '#d8b48a', d: 94 },
        { v: 2000, label: '$20', kind: 'note', bg: '#a3c69b', d: 98 },
      ],
    },
    tok: {
      name: 'Counters (no currency)', sym: '', minor: '',
      denoms: [
        { v: 1, label: '1', kind: 'coin', style: 'tok1', d: 34 },
        { v: 2, label: '2', kind: 'coin', style: 'tok2', d: 38 },
        { v: 5, label: '5', kind: 'coin', style: 'tok3', d: 42 },
        { v: 10, label: '10', kind: 'coin', style: 'tok4', d: 46 },
        { v: 20, label: '20', kind: 'coin', style: 'tok5', d: 50 },
        { v: 50, label: '50', kind: 'coin', style: 'tok6', d: 54 },
      ],
    },
  };

  function moneyFmt(curId, v, decimal) {
    const c = MONEY_CURRENCIES[curId] || MONEY_CURRENCIES.gbp;
    if (!c.sym) return String(v);
    const major = Math.floor(v / 100), minor = v % 100;
    if (!decimal && v < 100) return minor + c.minor;
    if (!decimal && minor === 0) return c.sym + major;
    return c.sym + major + '.' + String(minor).padStart(2, '0');
  }

  // "47p" -> 47 · "£1.35" -> 135 · "£2" -> 200 · "25¢" -> 25 · "1.35" -> 135
  function moneyParse(str) {
    const m = String(str).trim().match(/^([£€$]?)\s*(\d+)(?:[.,](\d{1,2}))?\s*([pc¢]?)$/i);
    if (!m) return null;
    if (m[3] != null) return +m[2] * 100 + +(m[3] + '0').slice(0, 2);
    if (m[4]) return +m[2];
    if (m[1]) return +m[2] * 100;
    return +m[2];
  }

  // "47p" -> make the amount · "32p pay 50p" -> make the change
  function moneyParseLine(line) {
    const m = String(line).trim().match(/^(.+?)\s+pay\s+(.+)$/i);
    if (m) {
      const price = moneyParse(m[1]), paid = moneyParse(m[2]);
      return price != null && paid != null && paid > price ? { price, paid } : null;
    }
    const t = moneyParse(line);
    return t != null && t > 0 ? { target: t } : null;
  }

  // greedy split of an amount into pieces of the currency
  function moneySplit(curId, amount) {
    const denoms = [...(MONEY_CURRENCIES[curId] || MONEY_CURRENCIES.gbp).denoms].sort((a, b) => b.v - a.v);
    const out = [];
    let rest = amount;
    for (const d of denoms) while (rest >= d.v) { out.push(d.v); rest -= d.v; }
    return out;
  }

  // Real-money photos hotlinked from Wikimedia Commons via Special:FilePath.
  // US currency imagery is public domain; euro reproductions of this kind are
  // permitted by the ECB. Current UK coin designs are Crown copyright, so
  // Commons cannot host them — UK teachers upload their own photos instead.
  const cmn = (file) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=220';
  const MONEY_PHOTOS = {
    gbp: {},
    eur: {
      1: cmn('Euro 1 cent.gif'),
      2: cmn('Euro 2 cent.gif'),
      5: cmn('Euro 5 cent (Common face) (5131629928).jpg'),
      10: cmn('Euro 10 cent.gif'),
      20: cmn('Euro 20 cents (New Design) (5106285918).jpg'),
      50: cmn('Euro 50 cent common face (New Design) (5128333845).jpg'),
      100: cmn('1 Euro Common Face (Old Design) (5132150012).jpg'),
      200: cmn('2 Euro common face (Old Design) (5133941308).jpg'),
      500: cmn('EUR 5 obverse (2013 issue).png'),
      1000: cmn('EUR 10 obverse (2014 issue).png'),
      2000: cmn('EUR 20 obverse (2002 issue).jpg'),
    },
    usd: {
      1: cmn('US One Cent Obv.png'),
      5: cmn('Jefferson-Nickel-Unc-Obv.jpg'),
      10: cmn('United States dime, obverse, 2002.jpg'),
      25: cmn('2021-P US Quarter Obverse.jpg'),
      100: cmn('US one dollar bill, obverse, series 2009.jpg'),
      500: cmn('US $5 Series 2006 obverse.jpg'),
      1000: cmn('US10dollarbill-Series 2004A.jpg'),
      2000: cmn('US $20 Series 2006 Obverse.jpg'),
    },
    tok: {},
  };

  // which face a piece should wear: Commons photo, the teacher's upload, or none
  function moneyImgFor(curId, v, skin) {
    if (skin === 'photo') return (MONEY_PHOTOS[curId] || {})[v] || null;
    if (skin === 'custom') return ((state.moneyImages || {})[curId] || {})[v] || null;
    return null;
  }

  function moneyPieceEl(den, imgUrl, scale) {
    const d = Math.round(den.d * clamp(+scale || 1, 0.3, 6));
    const node = el('div', {
      class: 'mn-piece mn-' + den.kind + (den.shape === 'hept' ? ' mn-hept' : '') + (den.style ? ' mn-' + den.style : ''),
    });
    node.style.width = d + 'px';
    if (den.kind === 'coin') {
      node.style.height = d + 'px';
    } else {
      node.style.height = Math.round(d * 0.52) + 'px';
      node.style.background = 'linear-gradient(135deg, ' + den.bg + ', ' + den.bg + 'cc)';
    }
    if (den.style === 'bimetal' || den.style === 'bimetal2') node.append(el('span', { class: 'mn-inner' }));
    const label = el('span', { class: 'mn-label' }, den.label);
    const cartoonFont = Math.max(9, Math.round(d * (den.kind === 'coin' ? 0.28 : 0.2)));
    label.style.fontSize = cartoonFont + 'px';
    if (imgUrl) {
      node.classList.add('mn-hasimg');
      label.style.fontSize = Math.max(9, Math.round(d * 0.15)) + 'px';
      const im = el('img', { class: 'mn-img', src: imgUrl, alt: den.label, draggable: 'false' });
      // a broken or offline image quietly falls back to the cartoon piece
      im.addEventListener('error', () => { im.remove(); node.classList.remove('mn-hasimg'); label.style.fontSize = cartoonFont + 'px'; });
      node.append(im);
    }
    node.append(label);
    return node;
  }

  // Shared mat: the "magic move" mechanic. Dragging a tray stack spawns a copy
  // (the stack never moves); loose pieces drag freely; dropping a piece back
  // outside the mat bins it. Positions persist as fractions of the mat.
  function moneyMat(mat, tray, p, onChange) {
    let zp = 40;
    const currency = () => MONEY_CURRENCIES[p.cur] || MONEY_CURRENCIES.gbp;
    const zoom = () => clamp(+p.zoom || 1, 1, 4);
    // money also scales with the widget, so resizing the window resizes the coins
    const sizeFactor = () => clamp((mat.clientWidth || 850) / 850, 0.35, 1.6);
    const pieceScale = () => zoom() * sizeFactor();
    function relayout() {
      buildTray();
      render();
    }
    function setZoom(z) {
      p.zoom = Math.round(clamp(z, 1, 4) * 20) / 20;
      relayout();
      onChange();
    }
    const bin = el('div', { class: 'mn-bin', title: 'Drag money here to remove it' }, '🗑');
    mat.append(bin);
    function place(elp, pc) {
      elp.style.left = 'calc(' + (pc.fx * 100).toFixed(2) + '% - ' + elp.offsetWidth / 2 + 'px)';
      elp.style.top = 'calc(' + (pc.fy * 100).toFixed(2) + '% - ' + elp.offsetHeight / 2 + 'px)';
    }
    function dragPiece(elp, pc, e0) {
      elp.style.zIndex = ++zp;
      mat.classList.add('mn-dragging');
      const pid = e0.pointerId; // several fingers can drag several pieces at once
      const overBin = (ev) => {
        const b = bin.getBoundingClientRect();
        return ev.clientX >= b.left - 6 && ev.clientX <= b.right + 6 && ev.clientY >= b.top - 6 && ev.clientY <= b.bottom + 6;
      };
      const isOut = (ev) => {
        const r = mat.getBoundingClientRect();
        return ev.clientX < r.left - 8 || ev.clientX > r.right + 8 || ev.clientY < r.top - 8 || ev.clientY > r.bottom + 8 || overBin(ev);
      };
      const move = (ev) => {
        if (ev.pointerId !== pid) return;
        const r = mat.getBoundingClientRect();
        pc.fx = clamp((ev.clientX - r.left) / r.width, 0.03, 0.97);
        pc.fy = clamp((ev.clientY - r.top) / r.height, 0.06, 0.94);
        place(elp, pc);
        bin.classList.toggle('hot', overBin(ev));
        elp.classList.toggle('mn-binning', isOut(ev));
        onChange();
      };
      const up = (ev) => {
        if (ev.pointerId !== pid) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        mat.classList.remove('mn-dragging');
        bin.classList.remove('hot');
        if (isOut(ev)) {
          p.pieces = (p.pieces || []).filter((x) => x.id !== pc.id);
          elp.remove();
        }
        save();
        onChange();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      move(e0);
    }
    function mountPiece(pc) {
      const den = currency().denoms.find((d) => d.v === pc.v);
      if (!den) return;
      const elp = moneyPieceEl(den, moneyImgFor(p.cur, den.v, p.skin || 'cartoon'), pieceScale());
      elp.classList.add('mn-loose');
      elp.addEventListener('pointerdown', (e) => { e.preventDefault(); dragPiece(elp, pc, e); });
      mat.append(elp);
      place(elp, pc);
    }
    function render() {
      mat.querySelectorAll('.mn-loose').forEach((n) => n.remove());
      (p.pieces || []).forEach(mountPiece);
    }
    function buildTray() {
      tray.innerHTML = '';
      for (const den of currency().denoms) {
        const cell = el('div', { class: 'mn-cell', title: 'Drag onto the mat — the stack stays put' },
          moneyPieceEl(den, moneyImgFor(p.cur, den.v, p.skin || 'cartoon'), pieceScale() * 0.7));
        cell.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const pc = { id: uid(), v: den.v, fx: 0.5, fy: 0.5 };
          (p.pieces = p.pieces || []).push(pc);
          mountPiece(pc);
          const elp = mat.lastElementChild;
          if (elp) dragPiece(elp, pc, e);
        });
        tray.append(cell);
      }
    }
    // smooth "tidy" animation hook
    function tidy() {
      (p.pieces || []).sort((a, b) => b.v - a.v);
      mat.classList.add('mn-anim');
      const perRow = Math.max(4, Math.round(Math.sqrt((p.pieces || []).length * 2)));
      (p.pieces || []).forEach((pc, i) => {
        pc.fx = 0.1 + (i % perRow) * (0.8 / Math.max(1, perRow - 1));
        pc.fy = 0.16 + Math.floor(i / perRow) * 0.24;
      });
      render();
      setTimeout(() => mat.classList.remove('mn-anim'), 400);
      save();
      onChange();
    }
    // pinch anywhere on the mat resizes the money; trackpad pinches arrive as ctrl+wheel
    const pinchPts = new Map();
    let pinch0 = null;
    const pinchDist = () => { const [a, b] = [...pinchPts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    mat.addEventListener('pointerdown', (e) => {
      pinchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchPts.size === 2) pinch0 = { d: pinchDist(), z: zoom() };
    });
    mat.addEventListener('pointermove', (e) => {
      if (!pinchPts.has(e.pointerId)) return;
      pinchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch0 && pinchPts.size === 2) setZoom(pinch0.z * pinchDist() / pinch0.d);
    });
    const pinchEnd = (e) => {
      pinchPts.delete(e.pointerId);
      if (pinch0 && pinchPts.size < 2) { pinch0 = null; save(); }
    };
    window.addEventListener('pointerup', pinchEnd);
    window.addEventListener('pointercancel', pinchEnd);
    mat.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom() * (e.deltaY < 0 ? 1.06 : 0.94));
      save();
    }, { passive: false });
    const cleanup = () => {
      window.removeEventListener('pointerup', pinchEnd);
      window.removeEventListener('pointercancel', pinchEnd);
    };
    return { render, buildTray, tidy, zoom, setZoom, relayout, cleanup };
  }

  // money style picker + per-denomination photo uploads, shared by both money widgets
  function moneySkinSettings(box, w, api) {
    const curId = w.props.cur;
    const c = MONEY_CURRENCIES[curId] || MONEY_CURRENCIES.gbp;
    const hasPhotos = Object.keys(MONEY_PHOTOS[curId] || {}).length > 0;
    const skin = w.props.skin || 'cartoon';
    box.append(settingRow('Money style', selectInput([
      ['cartoon', 'Cartoon (clearest on screen)'],
      ['photo', hasPhotos ? 'Real photos (Wikimedia Commons)' : 'Real photos (none for this currency)'],
      ['custom', 'My photos (upload below)'],
    ], skin, (v) => { w.props.skin = v; api.refresh(); })));
    if (skin === 'photo') {
      box.append(el('div', { class: 'hint' }, hasPhotos
        ? 'Photos load from Wikimedia Commons, so an internet connection is needed. Any piece without a photo falls back to the cartoon style.'
        : 'Current UK coin designs are Crown copyright, so Wikimedia Commons cannot host them. Choose “My photos” and upload your own coin photos instead.'));
    }
    if (skin === 'custom') {
      const imgs = (state.moneyImages || {})[curId] || {};
      const list = el('div', { class: 'mn-uplist' });
      for (const den of c.denoms) {
        list.append(el('div', { class: 'mn-uprow' },
          imgs[den.v]
            ? el('img', { class: 'mn-upimg', src: imgs[den.v], alt: den.label })
            : moneyPieceEl(den, null),
          el('span', { class: 'grow', style: 'font-weight:700;' }, den.label),
          el('button', {
            class: 'btn ghost small',
            onclick: () => pickImage((data) => {
              if (!state.moneyImages || typeof state.moneyImages !== 'object') state.moneyImages = {};
              (state.moneyImages[curId] = state.moneyImages[curId] || {})[den.v] = data;
              save();
              api.refresh();
            }, 240),
          }, imgs[den.v] ? 'Replace' : 'Upload'),
          imgs[den.v] ? el('button', {
            class: 'btn ghost small', title: 'Remove this photo',
            onclick: () => { delete state.moneyImages[curId][den.v]; save(); api.refresh(); },
          }, '✕') : null,
        ));
      }
      box.append(
        el('div', { style: 'font-weight:700;margin-top:2px;' }, 'Your money photos'),
        list,
        el('div', { class: 'hint' }, 'Stored on this device only and shared by every money widget. Square photos of a single coin work best; pieces without a photo stay cartoon.'),
      );
    }
  }

  const MONEY_LEVELS = [
    { label: '1 · Pennies to 10', gen: (R) => ({ target: R(10) + 1 }) },
    { label: '2 · Coins to 50', gen: (R) => ({ target: R(50) + 1 }) },
    { label: '3 · Up to 1.00', gen: (R) => ({ target: R(99) + 1 }) },
    { label: '4 · Pounds & pence', gen: (R) => ({ target: (R(4) + 1) * 100 + R(20) * 5 }) },
    { label: '5 · Change from 1.00', gen: (R) => ({ price: R(95) + 1, paid: 100 }) },
    { label: '6 · Change from 5.00', gen: (R) => ({ price: (R(98) + 1) * 5, paid: 500 }) },
  ];

  const MONEY_PACKS = [
    { id: 'p10', name: 'Pennies to 10p (EYFS)', lines: ['4p', '7p', '9p', '3p', '10p', '6p', '2p', '8p'] },
    { id: 'p50', name: 'Coins to 50p (KS1)', lines: ['23p', '47p', '35p', '18p', '42p', '29p', '36p', '44p'] },
    { id: 'pound', name: 'Pounds & pence (KS1)', lines: ['£1.35', '£2.70', '£1.05', '£3.45', '£2.15', '£1.80', '£4.25', '£3.90'] },
    { id: 'change50', name: 'Change from 50p (KS1)', lines: ['32p pay 50p', '24p pay 50p', '45p pay 50p', '17p pay 50p', '38p pay 50p', '29p pay 50p', '41p pay 50p', '13p pay 50p'] },
    { id: 'change1', name: 'Change from £1 (KS2)', lines: ['27p pay £1', '64p pay £1', '83p pay £1', '36p pay £1', '72p pay £1', '55p pay £1', '91p pay £1', '48p pay £1'] },
    { id: 'change5', name: 'Change from £5 (KS2)', lines: ['£3.45 pay £5', '£1.20 pay £2', '£2.65 pay £5', '£4.15 pay £5', '£1.85 pay £2', '£3.70 pay £5', '£2.30 pay £5', '£4.60 pay £5'] },
  ];

  WIDGETS.moneytray = {
    title: 'Money tray', icon: 'money', accent: '#fde68a', w: 900, h: 700,
    defaults: () => ({
      cur: 'gbp', decimal: false, magic: true, showTotal: true, skin: 'cartoon', zoom: 3,
      pieces: [], gameOn: true, kind: 'make', level: 2,
      pack: '', custom: [], listIndex: 0,
      score: 0, streak: 0, game: null,
    }),
    mount(body, w) {
      body.classList.add('mntray');
      const p = w.props;
      if (!(+p.zoom >= 1)) p.zoom = 3; // widgets saved before money zoom existed
      const fmt = (v) => moneyFmt(p.cur, v, p.decimal);
      const sum = () => (p.pieces || []).reduce((a, x) => a + x.v, 0);

      const task = el('div', { class: 'tclock-task' });
      const tray = el('div', { class: 'mn-tray' });
      const mat = el('div', { class: 'mn-mat grow' });
      const quick = el('div', { class: 'tclock-quick' });
      const gamebar = el('div', { class: 'tclock-game' });
      body.append(task, tray, mat, quick, gamebar);
      const matApi = moneyMat(mat, tray, p, () => paintAll());
      matApi.buildTray();
      matApi.render();

      // quick teacher bar
      const trayBtn = el('button', { class: 'tq-btn', title: 'Show / hide the magic tray (hide it to fix the money on the mat)', onclick: () => { p.magic = !p.magic; save(); paintAll(); } }, 'Tray');
      const totalBtn = el('button', { class: 'tq-btn', title: 'Show / hide the running total', onclick: () => { p.showTotal = !p.showTotal; save(); paintAll(); } });
      const decBtn = el('button', { class: 'tq-btn', title: 'Write amounts as £0.47 instead of 47p', onclick: () => { p.decimal = !p.decimal; save(); paintAll(); } }, '£.pp');
      const tidyBtn = el('button', { class: 'tq-btn', title: 'Line the money up, biggest first', onclick: () => matApi.tidy() }, 'Tidy');
      const clearBtn = el('button', { class: 'tq-btn', title: 'Clear the mat', onclick: () => { p.pieces = []; save(); matApi.render(); paintAll(); } }, 'Clear');
      const sizeDn = el('button', { class: 'tq-mini', title: 'Smaller money', onclick: () => { matApi.setZoom(matApi.zoom() - 0.25); save(); } }, '−');
      const sizeUp = el('button', { class: 'tq-mini', title: 'Bigger money', onclick: () => { matApi.setZoom(matApi.zoom() + 0.25); save(); } }, '+');
      const sizeLbl = el('span', { class: 'tq-snap', title: 'Money size — you can also pinch the mat to resize' });
      quick.append(trayBtn, totalBtn, decBtn, tidyBtn, clearBtn, el('span', { class: 'tq-step' }, sizeDn, sizeLbl, sizeUp));

      // game bar
      let wrongTimer = null;
      const packLines = () => {
        if (p.pack === 'custom') return p.custom || [];
        const pk = MONEY_PACKS.find((x) => x.id === p.pack);
        return pk ? pk.lines : [];
      };
      const modeOpts = [
        ...MONEY_LEVELS.map((L, i) => ['l' + (i + 1), L.label]),
        ...MONEY_PACKS.map((pk) => ['p:' + pk.id, '★ ' + pk.name]),
        ['custom', '✎ My challenges'],
      ];
      const modeSel = selectInput(modeOpts, p.pack ? (p.pack === 'custom' ? 'custom' : 'p:' + p.pack) : 'l' + p.level, (v) => {
        if (v === 'custom') {
          if (!Array.isArray(p.custom) || !p.custom.length) p.custom = MONEY_PACKS[1].lines.slice();
          p.pack = 'custom';
        } else if (v.startsWith('p:')) {
          p.pack = v.slice(2);
        } else {
          p.pack = '';
          p.level = +v.slice(1);
        }
        p.listIndex = 0; p.game = null;
        save(); paintAll();
      });
      modeSel.classList.add('tclock-level');
      const kindBtn = (id, label) => el('button', {
        class: 'btn ghost small', 'data-kind': id,
        onclick: () => { p.kind = id; p.game = null; save(); paintAll(); },
      }, label);
      const makeBtn = kindBtn('make', 'Make it');
      const readBtn = kindBtn('read', 'Read it');
      const newBtn = el('button', { class: 'btn small', onclick: () => newChallenge() }, 'New');
      const actBtn = el('button', { class: 'btn ghost small', onclick: () => checkOrReveal() });
      const scoreEl = el('span', { class: 'tclock-score', title: 'Points this session' });
      gamebar.append(modeSel, makeBtn, readBtn, newBtn, actBtn, scoreEl);

      function newChallenge() {
        clearTimeout(wrongTimer);
        let c;
        if (p.pack) {
          const lines = packLines().map(moneyParseLine).filter(Boolean);
          if (!lines.length) { toast('No valid challenges in the list yet — edit them in Settings'); return; }
          c = lines[p.listIndex % lines.length];
          p.listIndex = (p.listIndex % lines.length) + 1;
        } else {
          const L = MONEY_LEVELS[p.level - 1];
          c = L.gen((n) => Math.floor(Math.random() * n));
        }
        const kind = c.price != null ? 'make' : p.kind; // change tasks are always "make"
        let target, text;
        if (c.price != null) {
          target = c.paid - c.price;
          text = 'It costs ' + fmt(c.price) + '. You pay ' + fmt(c.paid) + '. Make the change!';
          p.pieces = [];
        } else if (kind === 'read') {
          target = c.target;
          p.pieces = moneySplit(p.cur, target).map((v) => ({ id: uid(), v, fx: 0.12 + Math.random() * 0.76, fy: 0.16 + Math.random() * 0.68 }));
          text = 'How much money is on the mat?';
        } else {
          target = c.target;
          text = 'Make ' + fmt(target);
          p.pieces = [];
        }
        p.game = { target, kind, state: 'open', text };
        save();
        matApi.render();
        paintAll();
      }

      function checkOrReveal() {
        const g = p.game;
        if (!g || g.state !== 'open') { newChallenge(); return; }
        clearTimeout(wrongTimer);
        if (g.kind === 'read') { g.state = 'revealed'; save(); paintAll(); return; }
        if (sum() === g.target) {
          g.state = 'done'; p.score++; p.streak++;
          beep(1);
        } else {
          g.state = 'wrong'; p.streak = 0;
          wrongTimer = setTimeout(() => { if (p.game === g && g.state === 'wrong') { g.state = 'open'; paintAll(); } }, 1800);
        }
        save(); paintAll();
      }

      function paintAll() {
        const g = p.gameOn ? p.game : null;
        const hideTotal = !p.showTotal || (g && g.kind === 'read' && g.state === 'open');
        totalBtn.textContent = 'Total: ' + (hideTotal ? '•••' : fmt(sum()));
        tray.style.display = p.magic ? '' : 'none';
        trayBtn.classList.toggle('active', !!p.magic);
        totalBtn.classList.toggle('active', !!p.showTotal);
        decBtn.classList.toggle('active', !!p.decimal);
        task.style.display = p.gameOn ? '' : 'none';
        gamebar.style.display = p.gameOn ? '' : 'none';
        task.classList.remove('ok', 'no');
        if (!p.gameOn) { /* clean display mode */ }
        else if (!g) task.textContent = 'Press “New” for a challenge';
        else if (g.state === 'done') { task.textContent = '✓ Correct!' + (p.streak > 1 ? ' ' + '⭐'.repeat(Math.min(p.streak, 5)) : ''); task.classList.add('ok'); }
        else if (g.state === 'wrong') { task.textContent = 'Not yet — count it again!'; task.classList.add('no'); }
        else if (g.state === 'revealed') task.textContent = 'It is ' + fmt(g.target);
        else task.textContent = g.text;
        for (const b of [makeBtn, readBtn]) b.classList.toggle('active', p.kind === b.dataset.kind);
        modeSel.value = p.pack ? (p.pack === 'custom' ? 'custom' : 'p:' + p.pack) : 'l' + p.level;
        actBtn.textContent = (g ? g.kind : p.kind) === 'read' ? 'Reveal' : 'Check';
        actBtn.disabled = !g || g.state !== 'open';
        const n = p.pack ? packLines().length : 0;
        scoreEl.textContent = '⭐ ' + (p.score || 0)
          + (n && p.game ? ' · ' + (((p.listIndex + n - 1) % n) + 1) + '/' + n : '');
        sizeLbl.textContent = Math.round(matApi.zoom() * 100) + '%';
        sizeDn.disabled = matApi.zoom() <= 1;
        sizeUp.disabled = matApi.zoom() >= 4;
      }

      paintAll();
      const ro = new ResizeObserver(() => matApi.relayout());
      ro.observe(mat);
      return () => { clearTimeout(wrongTimer); ro.disconnect(); matApi.cleanup(); };
    },
    settings(box, w, api) {
      const curOpts = Object.entries(MONEY_CURRENCIES).map(([id, c]) => [id, c.name]);
      const activeLines = w.props.pack && w.props.pack !== 'custom'
        ? (MONEY_PACKS.find((x) => x.id === w.props.pack) || { lines: [] }).lines
        : (Array.isArray(w.props.custom) && w.props.custom.length ? w.props.custom : MONEY_PACKS[1].lines);
      const ta = el('textarea', {
        class: 'text-input', rows: 7,
        style: 'width:100%;box-sizing:border-box;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.5;',
        onchange: () => {
          w.props.custom = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
          w.props.pack = 'custom';
          w.props.listIndex = 0;
          w.props.game = null;
          api.refresh();
        },
      });
      ta.value = activeLines.join('\n');
      box.append(
        settingRow('Currency', selectInput(curOpts, w.props.cur, (v) => { w.props.cur = v; w.props.pieces = []; api.refresh(); })),
        checkRow('Write as £0.47 (not 47p)', w.props.decimal, (v) => { w.props.decimal = v; api.refresh(); }),
      );
      moneySkinSettings(box, w, api);
      box.append(
        checkRow('Magic tray (drag spawns copies)', w.props.magic, (v) => { w.props.magic = v; api.refresh(); }),
        checkRow('Show the running total', w.props.showTotal, (v) => { w.props.showTotal = v; api.refresh(); }),
        checkRow('Teaching starters (challenges)', w.props.gameOn, (v) => { w.props.gameOn = v; api.refresh(); }),
        el('div', { style: 'font-weight:700;margin-top:2px;' }, 'Challenge list'),
        ta,
        el('div', { class: 'hint' }, 'One per line: 47p · £1.35 · 32p pay 50p (make the change). Editing saves as “✎ My challenges”.'),
        el('button', {
          class: 'btn ghost small', style: 'align-self:flex-start;',
          onclick: () => { w.props.score = 0; w.props.streak = 0; w.props.game = null; w.props.listIndex = 0; api.refresh(); },
        }, 'Reset score'),
      );
    },
  };

  // ---- Class shop: role-play till ----
  // Customer side | counter | shopkeeper side. Money dragged over the counter
  // counts as paid; Ring up swallows it into the till and computes the change;
  // the shopkeeper builds the change and drags it back. Paid and change each
  // have their own reveal toggle so the maths can stay hidden until asked.
  WIDGETS.shop = {
    title: 'Class shop', icon: 'shop', accent: '#fbcfe8', w: 980, h: 720,
    defaults: () => ({
      cur: 'gbp', decimal: false, shopName: 'The class shop', skin: 'cartoon', zoom: 2,
      price: 145, priceSrc: 'manual', custom: [], listIndex: 0,
      revealPaid: true, revealChange: false,
      pieces: [], stage: 'sale', changeDue: 0,
      score: 0, game: null,
    }),
    mount(body, w) {
      body.classList.add('mntray');
      const p = w.props;
      if (!(+p.zoom >= 1)) p.zoom = 2; // widgets saved before money zoom existed
      const fmt = (v) => moneyFmt(p.cur, v, p.decimal);
      const sideSum = (left) => (p.pieces || []).filter((x) => (left ? x.fx <= 0.5 : x.fx > 0.5)).reduce((a, x) => a + x.v, 0);

      const task = el('div', { class: 'tclock-task' });
      const priceEl = el('div', { class: 'shop-price' });
      const drawer = el('div', { class: 'shop-drawer' }, '💰');
      const till = el('div', { class: 'shop-till' }, el('div', { class: 'shop-screen' }, priceEl), drawer);
      const sign = el('div', { class: 'shop-sign' }, p.shopName || 'The class shop');
      const head = el('div', { class: 'shop-head' }, sign, till);
      const mat = el('div', { class: 'mn-mat shop-mat grow' },
        el('span', { class: 'shop-side-label shop-left' }, '🧒 Customer'),
        el('span', { class: 'shop-side-label shop-right' }, '🛒 Shopkeeper'));
      const tray = el('div', { class: 'mn-tray' });
      const quick = el('div', { class: 'tclock-quick' });
      const gamebar = el('div', { class: 'tclock-game' });
      body.append(task, head, mat, tray, quick, gamebar);
      const matApi = moneyMat(mat, tray, p, () => paintAll());
      matApi.buildTray();
      matApi.render();

      // reveal chips + notation
      const paidBtn = el('button', { class: 'tq-btn', title: 'Reveal / hide how much the customer has paid', onclick: () => { p.revealPaid = !p.revealPaid; save(); paintAll(); } });
      const changeBtn2 = el('button', { class: 'tq-btn', title: 'Reveal / hide the change that is due', onclick: () => { p.revealChange = !p.revealChange; save(); paintAll(); } });
      const decBtn = el('button', { class: 'tq-btn', title: 'Write amounts as £0.47 instead of 47p', onclick: () => { p.decimal = !p.decimal; save(); paintAll(); } }, '£.pp');
      const sizeDn = el('button', { class: 'tq-mini', title: 'Smaller money', onclick: () => { matApi.setZoom(matApi.zoom() - 0.25); save(); } }, '−');
      const sizeUp = el('button', { class: 'tq-mini', title: 'Bigger money', onclick: () => { matApi.setZoom(matApi.zoom() + 0.25); save(); } }, '+');
      const sizeLbl = el('span', { class: 'tq-snap', title: 'Money size — you can also pinch the mat to resize' });
      quick.append(paidBtn, changeBtn2, decBtn, el('span', { class: 'tq-step' }, sizeDn, sizeLbl, sizeUp));

      // sale flow
      let flashTimer = null;
      function flash(msg) {
        clearTimeout(flashTimer);
        task.textContent = msg;
        task.classList.add('no');
        flashTimer = setTimeout(() => paintAll(), 1900);
      }
      const priceLines = () => {
        if (p.priceSrc === 'custom') return p.custom || [];
        const pk = MONEY_PACKS.find((x) => x.id === p.priceSrc);
        return pk ? pk.lines : [];
      };
      function newSale() {
        clearTimeout(flashTimer);
        p.pieces = [];
        p.stage = 'sale';
        p.changeDue = 0;
        if (p.priceSrc !== 'manual') {
          const lines = priceLines().map(moneyParseLine).filter(Boolean);
          if (lines.length) {
            const c = lines[p.listIndex % lines.length];
            p.listIndex = (p.listIndex % lines.length) + 1;
            p.price = c.price != null ? c.price : c.target;
          }
        }
        save(); matApi.render(); paintAll();
      }
      function ringUp() {
        if (p.stage !== 'sale') return;
        const got = sideSum(false);
        if (got < p.price) { flash('Not enough yet — the till stays shut! 🔒'); return; }
        p.changeDue = got - p.price;
        p.pieces = []; // the payment disappears into the till
        beep(1);
        if (p.changeDue === 0) { p.stage = 'done'; p.score++; }
        else p.stage = 'change';
        save(); matApi.render(); paintAll();
      }
      function giveChange() {
        if (p.stage !== 'change') return;
        const given = sideSum(true); // change lands on the customer's side
        if (given === p.changeDue) {
          p.stage = 'done'; p.score++;
          beep(1);
          save(); paintAll();
        } else {
          flash('Not the right change — count it again!');
        }
      }

      const srcOpts = [
        ['manual', 'Price: teacher sets it'],
        ...MONEY_PACKS.map((pk) => ['p!' + pk.id, '★ Prices: ' + pk.name]),
        ['custom', '✎ My price list'],
      ];
      const srcSel = selectInput(srcOpts, p.priceSrc === 'manual' || p.priceSrc === 'custom' ? p.priceSrc : 'p!' + p.priceSrc, (v) => {
        if (v === 'custom' && (!Array.isArray(p.custom) || !p.custom.length)) p.custom = MONEY_PACKS[2].lines.slice();
        p.priceSrc = v.startsWith('p!') ? v.slice(2) : v;
        p.listIndex = 0;
        save(); paintAll();
      });
      srcSel.classList.add('tclock-level');
      const newBtn = el('button', { class: 'btn small', onclick: () => newSale() }, 'New sale');
      const ringBtn = el('button', { class: 'btn ghost small', onclick: () => ringUp() }, '🔔 Ring up');
      const giveBtn = el('button', { class: 'btn ghost small', onclick: () => giveChange() }, '✓ Give change');
      const scoreEl = el('span', { class: 'tclock-score', title: 'Sales completed' });
      gamebar.append(srcSel, newBtn, ringBtn, giveBtn, scoreEl);

      function paintAll() {
        sign.textContent = p.shopName || 'The class shop';
        priceEl.textContent = fmt(p.price || 0);
        till.classList.toggle('open', p.stage !== 'sale');
        paidBtn.textContent = 'Paid: ' + (p.revealPaid ? fmt(sideSum(false)) : '•••');
        paidBtn.classList.toggle('active', !!p.revealPaid);
        changeBtn2.textContent = 'Change: ' + (p.stage === 'sale' ? '—' : (p.revealChange ? fmt(p.changeDue) : '•••'));
        changeBtn2.classList.toggle('active', !!p.revealChange);
        decBtn.classList.toggle('active', !!p.decimal);
        ringBtn.disabled = p.stage !== 'sale';
        giveBtn.disabled = p.stage !== 'change';
        task.classList.remove('ok', 'no');
        if (p.stage === 'sale') task.textContent = 'Customer: pay for your shopping — drag money over the counter, then 🔔 ring up';
        else if (p.stage === 'change') task.textContent = 'Shopkeeper: give the customer their change, then press ✓';
        else { task.textContent = '✓ Sale complete — thank you! ⭐'; task.classList.add('ok'); }
        scoreEl.textContent = '⭐ ' + (p.score || 0);
        sizeLbl.textContent = Math.round(matApi.zoom() * 100) + '%';
        sizeDn.disabled = matApi.zoom() <= 1;
        sizeUp.disabled = matApi.zoom() >= 4;
      }

      paintAll();
      const ro = new ResizeObserver(() => matApi.relayout());
      ro.observe(mat);
      return () => { clearTimeout(flashTimer); ro.disconnect(); matApi.cleanup(); };
    },
    settings(box, w, api) {
      const curOpts = Object.entries(MONEY_CURRENCIES).map(([id, c]) => [id, c.name]);
      const ta = el('textarea', {
        class: 'text-input', rows: 6,
        style: 'width:100%;box-sizing:border-box;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.5;',
        onchange: () => {
          w.props.custom = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
          w.props.priceSrc = 'custom';
          w.props.listIndex = 0;
          api.refresh();
        },
      });
      ta.value = (Array.isArray(w.props.custom) && w.props.custom.length ? w.props.custom : MONEY_PACKS[2].lines).join('\n');
      box.append(
        settingRow('Currency', selectInput(curOpts, w.props.cur, (v) => { w.props.cur = v; w.props.pieces = []; api.refresh(); })),
        settingRow('Shop name', el('input', {
          class: 'text-input', type: 'text', value: w.props.shopName || '', style: 'flex:1;min-width:0;',
          onchange: (e) => { w.props.shopName = e.target.value.slice(0, 40); api.refresh(); },
        })),
        settingRow('Price', el('input', {
          class: 'text-input', type: 'text', value: moneyFmt(w.props.cur, w.props.price || 0, w.props.decimal), style: 'width:100px;',
          onchange: (e) => {
            const v = moneyParse(e.target.value);
            if (v != null) { w.props.price = v; w.props.priceSrc = 'manual'; api.refresh(); }
          },
        }), el('span', { class: 'hint' }, 'e.g. 47p or £1.45')),
        checkRow('Write as £0.47 (not 47p)', w.props.decimal, (v) => { w.props.decimal = v; api.refresh(); }),
      );
      moneySkinSettings(box, w, api);
      box.append(
        checkRow('Reveal “paid” by default', w.props.revealPaid, (v) => { w.props.revealPaid = v; api.refresh(); }),
        checkRow('Reveal “change” by default', w.props.revealChange, (v) => { w.props.revealChange = v; api.refresh(); }),
        el('div', { style: 'font-weight:700;margin-top:2px;' }, 'Price list'),
        ta,
        el('div', { class: 'hint' }, 'One price per line: 47p · £1.35 · lines like “32p pay 50p” use the 32p as the price. Editing saves as “✎ My price list”.'),
        el('button', {
          class: 'btn ghost small', style: 'align-self:flex-start;',
          onclick: () => { w.props.score = 0; w.props.listIndex = 0; api.refresh(); },
        }, 'Reset score'),
      );
    },
  };

  // ---- Frame tiles: ten-frame number shapes ----
  // Sage Stage's own structured number apparatus (deliberately NOT a staircase
  // design): every tile 1–10 is a slice of a 2×5 ten-frame, with dots filling
  // in column pairs. Evens make full rectangles, odds keep a half-column
  // "step". The one representation stretches from Nursery to Year 5 — the same
  // 6-tile is six holes, or 0.6, or 60%, or 6/10, or two threes — so three mat
  // MODES (explore with ten-frames, a number line, and a compare balance) plus
  // value re-labelling and a strand-organised challenge bank cover subitising
  // through to decimals, percentages, place value and times tables.
  const FT_COLORS = ['', '#0ea5e9', '#f43f5e', '#f59e0b', '#8b5cf6', '#10b981', '#f97316', '#6366f1', '#ec4899', '#84cc16', '#334155'];

  // the same holes, re-read as different quantities — Numicon's whole point
  const FT_VALUES = {
    count: { name: 'Whole numbers', lab: (v) => String(v), tot: (s) => String(s), say: (v) => String(v) },
    tenths: { name: 'Decimals · 0.1 each', lab: (v) => (v / 10).toFixed(1), tot: (s) => (s / 10).toFixed(1), say: (v) => (v / 10).toFixed(1) },
    percent: { name: 'Percent · 10% each', lab: (v) => v * 10 + '%', tot: (s) => s * 10 + '%', say: (v) => v * 10 + '%' },
    fraction: { name: 'Tenths · n⁄10', lab: (v) => v + '⁄10', tot: (s) => s + '⁄10', say: (v) => v + '⁄10' },
  };
  const FT_MODES = [['explore', 'Ten-frames'], ['line', 'Number line'], ['compare', 'Compare']];

  // Strand-organised challenge bank. Each gen returns plain data (so it can be
  // saved): text + a set of constraints the generic checker enforces. Fields —
  // target (hole-unit sum), tiles (exact count), same (all equal), allOdd,
  // needTen, parityReq, prime (seed tiles), value (re-label mode), revealType
  // (parity|number → Reveal not Check), rel (compare relation).
  const FTR = (R, lo, hi) => lo + R(hi - lo + 1); // inclusive random
  const FT_STRANDS = [
    { id: 'count', name: 'Counting & subitising', acts: [
      { label: 'Show me a number', gen: (R) => { const n = FTR(R, 1, 10); return { target: n, text: 'Show me ' + n + ' — build it with tiles' }; } },
      { label: 'Flash & recall', gen: (R) => { const n = FTR(R, 1, 10); return { prime: [n], revealType: 'number', n, text: 'Look… now hide it with Flash. What number was it?' }; } },
      { label: 'One more', gen: (R) => { const n = FTR(R, 1, 9); return { target: n + 1, text: 'One MORE than ' + n + ' — make ' + (n + 1) }; } },
      { label: 'One less', gen: (R) => { const n = FTR(R, 2, 10); return { target: n - 1, text: 'One LESS than ' + n + ' — make ' + (n - 1) }; } },
      { label: 'Order: which is bigger?', gen: (R) => { let a = FTR(R, 1, 10), b = FTR(R, 1, 10); while (b === a) b = FTR(R, 1, 10); return { prime: [a, b], revealType: 'number', n: Math.max(a, b), text: 'Which shape is bigger, ' + a + ' or ' + b + '?' }; } },
    ] },
    { id: 'bonds', name: 'Bonds & making ten', acts: [
      { label: 'Make ten (add a partner)', gen: (R) => { const s = FTR(R, 1, 9); return { prime: [s], target: 10, text: 'Here is ' + s + '. Add one tile to make ten!' }; } },
      { label: 'Ten with two tiles', gen: () => ({ target: 10, tiles: 2, text: 'Make ten with exactly TWO tiles' }) },
      { label: 'Make this total', gen: (R) => { const t = FTR(R, 3, 9); return { target: t, text: 'Make ' + t + ' any way you like' }; } },
      { label: 'Missing part', gen: (R) => { const t = FTR(R, 6, 10), a = FTR(R, 1, t - 1); return { prime: [a], target: t, text: 'We have ' + a + '. Add tiles to reach ' + t }; } },
    ] },
    { id: 'addsub', name: 'Add & subtract', acts: [
      { label: 'Add two numbers', gen: (R) => { const a = FTR(R, 1, 6), b = FTR(R, 1, 6); return { target: a + b, tiles: 2, text: a + ' + ' + b + ' — put the two tiles together' }; } },
      { label: 'Take away', gen: (R) => { const big = FTR(R, 5, 10), d = FTR(R, 1, big - 1); return { prime: [big], target: big - d, text: 'Start with ' + big + '. Take away ' + d + ' — show what is LEFT' }; } },
      { label: 'Bridge through ten', gen: (R) => { const t = FTR(R, 11, 18); return { target: t, text: 'Make ' + t + ' — fill a ten first, then the rest' }; } },
      { label: 'Missing number', gen: (R) => { const t = FTR(R, 8, 14), a = FTR(R, 3, Math.min(9, t - 1)); return { prime: [a], target: t, text: a + ' + ? = ' + t + '. Add the missing part' }; } },
    ] },
    { id: 'double', name: 'Doubles & halves', acts: [
      { label: 'Double it', gen: (R) => { const h = FTR(R, 1, 5); return { target: h * 2, tiles: 2, same: true, text: 'Make double ' + h + ' — two tiles the same' }; } },
      { label: 'Halve it', gen: (R) => { const h = FTR(R, 1, 5); return { target: h, tiles: 1, text: 'Halve ' + (h * 2) + ' — show one half (' + h + ')' }; } },
      { label: 'Near doubles', gen: (R) => { const h = FTR(R, 2, 4); return { target: h + h + 1, text: 'Double ' + h + ' and one more — make ' + (h + h + 1) }; } },
    ] },
    { id: 'parity', name: 'Odd & even', acts: [
      { label: 'Odd or even?', gen: (R) => { const n = FTR(R, 1, 10); return { prime: [n], revealType: 'parity', n, text: 'Is ' + n + ' odd or even? Look at its shape!' }; } },
      { label: 'Make an even number', gen: () => ({ parityReq: 'even', text: 'Build any EVEN total — a full rectangle, no step' }) },
      { label: 'Make an odd number', gen: () => ({ parityReq: 'odd', text: 'Build any ODD total — it must have a step' }) },
      { label: 'Two odds together', gen: () => ({ tiles: 2, allOdd: true, text: 'Put two ODD tiles together — is the total odd or even?' }) },
    ] },
    { id: 'place', name: 'Place value & teens', acts: [
      { label: 'Teen numbers', gen: (R) => { const t = FTR(R, 11, 19); return { target: t, needTen: true, text: 'Make ' + t + ' — one ten and some ones' }; } },
      { label: 'Tens and ones', gen: (R) => { const t = FTR(R, 12, 20); return { target: t, needTen: true, text: 'Build ' + t + ' with a ten shape and ones' }; } },
      { label: 'Make twenty', gen: () => ({ target: 20, needTen: true, text: 'Make 20 — how many ten shapes?' }) },
      { label: 'Show me without the ten', gen: (R) => { const t = FTR(R, 11, 18); return { target: t, text: 'Make ' + t + ' WITHOUT using a ten shape' }; } },
    ] },
    { id: 'times', name: 'Times tables & arrays', acts: [
      { label: 'Equal groups', gen: (R) => { const g = FTR(R, 2, 4), v = FTR(R, 2, 5); return { target: g * v, tiles: g, same: true, text: 'Build ' + g + ' groups of ' + v + ' (= ' + (g * v) + ')' }; } },
      { label: 'Count in twos', gen: (R) => { const g = FTR(R, 2, 5); return { target: g * 2, tiles: g, same: true, text: g + ' twos — count in 2s to ' + (g * 2) }; } },
      { label: 'Count in fives', gen: (R) => { const g = FTR(R, 2, 4); return { target: g * 5, tiles: g, same: true, text: g + ' fives — count in 5s to ' + (g * 5) }; } },
      { label: 'Make an array', gen: (R) => { const g = FTR(R, 2, 4), v = FTR(R, 2, 5); return { target: g * v, tiles: g, same: true, text: 'Lay out ' + g + ' rows of ' + v + ' — what is the product?' }; } },
    ] },
    { id: 'frac', name: 'Fractions, decimals & %', acts: [
      { label: 'Tenths as decimals', gen: (R) => { const t = FTR(R, 1, 9); return { target: t, value: 'tenths', text: 'Make ' + (t / 10).toFixed(1) + ' — each tile is one tenth' }; } },
      { label: 'Percentages', gen: (R) => { const t = FTR(R, 1, 9); return { target: t, value: 'percent', text: 'Make ' + (t * 10) + '% — each tile is 10%' }; } },
      { label: 'Fractions of ten', gen: (R) => { const t = FTR(R, 1, 9); return { target: t, value: 'fraction', text: 'Show ' + t + '⁄10 of a ten-frame' }; } },
      { label: 'One half is…', gen: () => ({ target: 5, value: 'fraction', text: 'Show one HALF of ten — how many tenths?' }) },
    ] },
    { id: 'compare', name: 'Compare & reason', acts: [
      { label: 'Make A greater than B', gen: () => ({ mode: 'compare', rel: 'gt', text: 'Put tiles on both pans so A is GREATER than B' }) },
      { label: 'Make them equal', gen: () => ({ mode: 'compare', rel: 'eq', text: 'Balance the pans — make A and B EQUAL' }) },
      { label: 'Make B double A', gen: () => ({ mode: 'compare', rel: 'double', text: 'Make pan B exactly DOUBLE pan A' }) },
    ] },
  ];

  // cells of tile n as [col, row] (row 0 = top). Flipping an odd tile moves its
  // step from top-right to bottom-left, so a 3 can mesh with a 7 inside a frame.
  function ftCells(n, r) {
    const full = Math.floor(n / 2), odd = n % 2, cells = [];
    for (let j = 0; j < full; j++) { const c = odd && r ? j + 1 : j; cells.push([c, 0], [c, 1]); }
    if (odd) cells.push(r ? [0, 1] : [full, 0]);
    return cells;
  }

  WIDGETS.frametiles = {
    title: 'Frame tiles', icon: 'frametiles', accent: '#bbf7d0', w: 920, h: 720,
    defaults: () => ({
      pieces: [], zoom: 2, numerals: true, value: 'count', mode: 'explore',
      frames: 1, lineMax: 10, magic: true, showTotal: true, flash: false,
      gameOn: true, strand: 1, act: 0, score: 0, streak: 0, game: null,
    }),
    mount(body, w) {
      body.classList.add('mntray', 'fttiles');
      const p = w.props;
      if (!Array.isArray(p.pieces)) p.pieces = [];
      if (!FT_VALUES[p.value]) p.value = 'count';
      if (!FT_MODES.some((m) => m[0] === p.mode)) p.mode = 'explore';
      let zp = 40;
      let wrongTimer = null;
      const pieceEls = new Map(); // piece id -> element
      const framesDone = new Set();
      let cmpChip = null, subA = null, subB = null; // compare-mode furniture refs

      const task = el('div', { class: 'tclock-task' });
      const modebar = el('div', { class: 'tclock-quick ft-modebar' });
      const tray = el('div', { class: 'mn-tray' });
      const mat = el('div', { class: 'mn-mat grow' });
      const quick = el('div', { class: 'tclock-quick' });
      const gamebar = el('div', { class: 'tclock-game' });
      // tray sits BELOW the mat: on a wall-mounted board the tiles children
      // drag from stay within reach at their height, and the ten-frames anchor
      // to the bottom of the mat just above it (see frameRects)
      body.append(task, modebar, mat, tray, quick, gamebar);
      const bin = el('div', { class: 'mn-bin', title: 'Drag tiles here to remove them' }, '🗑');
      mat.append(bin);

      const val = () => FT_VALUES[p.value] || FT_VALUES.count;
      // one frame cell is the unit everything is built from; tiles scale with
      // the widget so a full ten-tile is always 5 units wide
      const unit = () => Math.max(14, Math.round(24 * clamp(+p.zoom || 2, 1, 4) * clamp((mat.clientWidth || 900) / 900, 0.4, 1.6)));
      const sum = () => p.pieces.reduce((a, x) => a + x.v, 0);
      const sumPan = (side) => p.pieces.filter((x) => (x.fx < 0.5 ? 0 : 1) === side).reduce((a, x) => a + x.v, 0);

      function buildTile(n, r, u) {
        const t = el('div', { class: 'ft-tile', style: `width:${Math.ceil(n / 2) * u}px;height:${2 * u}px;` });
        const cells = ftCells(n, r);
        let numCell = null; // numeral lives in the lowest-left hole so it reads upright either way
        for (const c of cells) if (c[1] === 1 && (!numCell || c[0] < numCell[0])) numCell = c;
        if (!numCell) numCell = cells[0];
        const label = val().lab(n);
        const fs = Math.max(8, Math.round(u * 0.5 * Math.min(1, 1.7 / label.length)));
        for (const [c, row] of cells) {
          const cell = el('div', {
            class: 'ft-cell',
            style: `left:${c * u}px;top:${row * u}px;width:${u}px;height:${u}px;background:${FT_COLORS[n]};`,
          }, el('span', { class: 'ft-hole' }));
          if (p.numerals && c === numCell[0] && row === numCell[1])
            cell.append(el('span', { class: 'ft-num', style: `color:${FT_COLORS[n]};font-size:${fs}px;` }, label));
          t.append(cell);
        }
        return t;
      }

      // ---- ten-frames on the mat (explore mode only) ----
      const frameRects = () => {
        if (p.mode !== 'explore') return [];
        const n = clamp(+p.frames || 0, 0, 2);
        if (!n) return [];
        const u = unit(), fw = 5 * u, fh = 2 * u, gap = Math.max(16, Math.round(u * 0.6));
        const left0 = Math.max(8, Math.round((mat.clientWidth - (n * fw + (n - 1) * gap)) / 2));
        // sit the frames low in the mat, just above the tray — reachable height
        const top = clamp(mat.clientHeight - fh - Math.max(14, Math.round(u * 0.6)), 8, mat.clientHeight);
        return Array.from({ length: n }, (_, i) => ({ left: left0 + i * (fw + gap), top, w: fw, h: fh }));
      };

      // rebuild whatever furniture the current mode draws under the tiles
      function buildFurniture() {
        mat.querySelectorAll('.ft-frame,.ft-ruler,.ft-divider,.ft-panlabel,.ft-subtotal,.ft-cmp').forEach((x) => x.remove());
        cmpChip = subA = subB = null;
        if (p.mode === 'explore') buildFrames();
        else if (p.mode === 'line') buildRuler();
        else if (p.mode === 'compare') buildCompare();
      }

      function buildFrames() {
        const u = unit();
        frameRects().forEach((r, i) => {
          const f = el('div', { class: 'ft-frame', 'data-i': i, style: `left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px;` });
          for (let c = 0; c < 5; c++) for (let row = 0; row < 2; row++)
            f.append(el('div', { class: 'ft-fcell', style: `left:${c * u}px;top:${row * u}px;width:${u}px;height:${u}px;` }));
          mat.append(f);
        });
        paintFrames();
      }

      function buildRuler() {
        const max = +p.lineMax === 20 ? 20 : 10;
        const W = mat.clientWidth, H = mat.clientHeight;
        const pad = Math.max(22, Math.round(W * 0.04));
        const y = Math.round(H * 0.82); // low on the mat so shapes laid above it stay in reach
        const step = (W - 2 * pad) / max;
        const ruler = el('div', { class: 'ft-ruler' });
        ruler.append(el('div', { class: 'ft-axis', style: `left:${pad}px;top:${y}px;width:${W - 2 * pad}px;` }));
        for (let i = 0; i <= max; i++) {
          const x = pad + i * step;
          ruler.append(el('div', { class: 'ft-tick', style: `left:${x}px;top:${y}px;` }));
          ruler.append(el('div', { class: 'ft-tlabel', style: `left:${x}px;top:${y + 10}px;` }, val().say(i)));
        }
        mat.append(ruler);
      }

      function buildCompare() {
        const W = mat.clientWidth;
        mat.append(
          el('div', { class: 'ft-divider', style: `left:${Math.round(W / 2)}px;` }),
          el('div', { class: 'ft-panlabel', style: 'left:14px;' }, 'A'),
          el('div', { class: 'ft-panlabel', style: 'right:14px;' }, 'B'),
        );
        subA = el('div', { class: 'ft-subtotal', style: 'left:14px;' });
        subB = el('div', { class: 'ft-subtotal', style: 'right:14px;' });
        cmpChip = el('div', { class: 'ft-cmp' });
        mat.append(subA, subB, cmpChip);
      }

      // a frame "makes ten" when its ten cells are each covered exactly once
      function frameFill(r) {
        const u = unit(), grid = Array(10).fill(0);
        for (const pc of p.pieces) {
          const elp = pieceEls.get(pc.id);
          if (!elp) continue;
          if (Math.abs(elp.offsetTop - r.top) > 3) continue;
          const k = Math.round((elp.offsetLeft - r.left) / u);
          if (k < 0 || k > 4 || Math.abs(elp.offsetLeft - (r.left + k * u)) > 3) continue;
          for (const [c, row] of ftCells(pc.v, pc.r)) {
            const col = k + c;
            if (col >= 0 && col <= 4) grid[row * 5 + col]++;
          }
        }
        return grid;
      }

      function paintFrames() {
        if (p.mode !== 'explore') return;
        const rects = frameRects();
        mat.querySelectorAll('.ft-frame').forEach((f) => {
          const i = +f.dataset.i;
          if (!rects[i]) return;
          const done = frameFill(rects[i]).every((v) => v === 1);
          f.classList.toggle('done', done);
          if (done && !framesDone.has(i)) { framesDone.add(i); beep(1); }
          if (!done) framesDone.delete(i);
        });
      }

      // ---- loose tiles on the mat ----
      function place(elp, pc) {
        elp.style.left = 'calc(' + (pc.fx * 100).toFixed(2) + '% - ' + elp.offsetWidth / 2 + 'px)';
        elp.style.top = 'calc(' + (pc.fy * 100).toFixed(2) + '% - ' + elp.offsetHeight / 2 + 'px)';
      }

      // dropped near a frame? snap the tile onto the frame's column grid, so
      // pieces line up and the maths self-corrects visually. Returns true when
      // it turned the tile (so the caller re-renders it). A single "1" tile is
      // one hole in a two-row slot, so it follows the row it was dropped into —
      // otherwise it could only ever reach the top row without a double-tap.
      function trySnap(elp, pc) {
        const u = unit(), cols = Math.ceil(pc.v / 2);
        const cx = elp.offsetLeft + elp.offsetWidth / 2, cy = elp.offsetTop + elp.offsetHeight / 2;
        for (const r of frameRects()) {
          if (cx < r.left - u / 2 || cx > r.left + r.w + u / 2 || cy < r.top - u / 2 || cy > r.top + r.h + u / 2) continue;
          let flipped = false;
          if (pc.v === 1) {
            const wantBottom = cy > r.top + r.h / 2;
            if (!!pc.r !== wantBottom) { pc.r = wantBottom; flipped = true; }
          }
          const k = clamp(Math.round((elp.offsetLeft - r.left) / u), 0, 5 - cols);
          pc.fx = (r.left + k * u + (cols * u) / 2) / mat.clientWidth;
          pc.fy = (r.top + u) / mat.clientHeight;
          place(elp, pc);
          return flipped;
        }
        return false;
      }

      function dragPiece(elp, pc, e0) {
        elp.style.zIndex = ++zp;
        mat.classList.add('mn-dragging');
        const pid = e0.pointerId; // several fingers can drag several tiles at once
        const overBin = (ev) => {
          const b = bin.getBoundingClientRect();
          return ev.clientX >= b.left - 6 && ev.clientX <= b.right + 6 && ev.clientY >= b.top - 6 && ev.clientY <= b.bottom + 6;
        };
        const isOut = (ev) => {
          const r = mat.getBoundingClientRect();
          return ev.clientX < r.left - 8 || ev.clientX > r.right + 8 || ev.clientY < r.top - 8 || ev.clientY > r.bottom + 8 || overBin(ev);
        };
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          const r = mat.getBoundingClientRect();
          pc.fx = clamp((ev.clientX - r.left) / r.width, 0.03, 0.97);
          pc.fy = clamp((ev.clientY - r.top) / r.height, 0.06, 0.94);
          place(elp, pc);
          bin.classList.toggle('hot', overBin(ev));
          elp.classList.toggle('mn-binning', isOut(ev));
          if (p.mode === 'compare') paintCompare();
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          mat.classList.remove('mn-dragging');
          bin.classList.remove('hot');
          let flipped = false;
          if (isOut(ev)) {
            p.pieces = p.pieces.filter((x) => x.id !== pc.id);
            pieceEls.delete(pc.id);
            elp.remove();
          } else {
            flipped = trySnap(elp, pc);
          }
          if (flipped) render(); else paintFrames();
          save();
          paintAll();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        move(e0);
      }

      function mountPiece(pc) {
        const elp = buildTile(pc.v, pc.r, unit());
        elp.classList.add('mn-loose');
        elp.title = pc.v % 2 ? 'Drag me — double-tap to turn my step' : 'Drag me';
        elp.addEventListener('pointerdown', (e) => { e.preventDefault(); dragPiece(elp, pc, e); });
        elp.addEventListener('dblclick', () => {
          if (pc.v % 2 === 0) return;
          pc.r = !pc.r;
          render();
          save();
        });
        mat.append(elp);
        pieceEls.set(pc.id, elp);
        place(elp, pc);
      }

      function render() {
        mat.querySelectorAll('.mn-loose').forEach((n) => n.remove());
        pieceEls.clear();
        p.pieces.forEach(mountPiece);
        paintFrames();
      }

      function buildTray() {
        tray.innerHTML = '';
        const u = Math.max(11, Math.round(unit() * 0.55));
        for (let v = 1; v <= 10; v++) {
          const cell = el('div', { class: 'mn-cell', title: 'Drag onto the mat — the stack stays put' }, buildTile(v, false, u));
          cell.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!p.magic) return;
            const pc = { id: uid(), v, r: false, fx: 0.5, fy: 0.55 };
            p.pieces.push(pc);
            mountPiece(pc);
            dragPiece(pieceEls.get(pc.id), pc, e);
          });
          tray.append(cell);
        }
      }

      function layout() {
        buildTray();
        buildFurniture();
        render();
      }

      function setZoom(z) {
        p.zoom = Math.round(clamp(z, 1, 4) * 20) / 20;
        layout();
        save();
        paintAll();
      }

      function setMode(m) {
        p.mode = m;
        framesDone.clear();
        save();
        layout();
        paintAll();
      }

      // ---- mode bar: mat mode · value re-labelling · flash ----
      const modeBtns = FT_MODES.map(([id, label]) => el('button', {
        class: 'tq-btn', 'data-mode': id, title: 'Switch the mat to ' + label.toLowerCase(),
        onclick: () => setMode(id),
      }, label));
      const valueSel = selectInput(Object.entries(FT_VALUES).map(([id, v]) => [id, v.name]), p.value, (v) => { p.value = v; save(); layout(); paintAll(); });
      valueSel.classList.add('tclock-level');
      valueSel.title = 'What each tile is worth';
      const flashBtn = el('button', { class: 'tq-btn', title: 'Flash: hide the holes so children recall the number', onclick: () => { p.flash = !p.flash; mat.classList.toggle('ft-flash', p.flash); save(); paintAll(); } }, 'Flash');
      modebar.append(el('span', { class: 'tq-step ft-seg' }, ...modeBtns), valueSel, flashBtn);

      // ---- quick teacher bar ----
      const trayBtn = el('button', { class: 'tq-btn', title: 'Show / hide the tile tray', onclick: () => { p.magic = !p.magic; save(); paintAll(); } }, 'Tray');
      const numBtn = el('button', { class: 'tq-btn', title: 'Show / hide the numerals on the tiles', onclick: () => { p.numerals = !p.numerals; save(); layout(); paintAll(); } }, '123');
      const frameBtn = el('button', { class: 'tq-btn', title: 'Ten-frames on the mat: none, one or two', onclick: () => { p.frames = ((+p.frames || 0) + 1) % 3; save(); buildFurniture(); paintAll(); } });
      const lineBtn = el('button', { class: 'tq-btn', title: 'Number line range', onclick: () => { p.lineMax = +p.lineMax === 20 ? 10 : 20; save(); buildFurniture(); paintAll(); } });
      const totalBtn = el('button', { class: 'tq-btn', title: 'Show / hide the running total', onclick: () => { p.showTotal = !p.showTotal; save(); paintAll(); } });
      const clearBtn = el('button', { class: 'tq-btn', title: 'Clear the mat', onclick: () => { p.pieces = []; framesDone.clear(); save(); render(); paintAll(); } }, 'Clear');
      const sizeDn = el('button', { class: 'tq-mini', title: 'Smaller tiles', onclick: () => setZoom((+p.zoom || 2) - 0.25) }, '−');
      const sizeUp = el('button', { class: 'tq-mini', title: 'Bigger tiles', onclick: () => setZoom((+p.zoom || 2) + 0.25) }, '+');
      const sizeLbl = el('span', { class: 'tq-snap', title: 'Tile size' });
      quick.append(trayBtn, numBtn, frameBtn, lineBtn, totalBtn, clearBtn, el('span', { class: 'tq-step' }, sizeDn, sizeLbl, sizeUp));

      // ---- teaching starters: strand · activity ----
      const strandSel = selectInput(FT_STRANDS.map((s, i) => [i, s.name]), clamp(+p.strand || 0, 0, FT_STRANDS.length - 1), (v) => { p.strand = +v; p.act = 0; p.game = null; save(); rebuildActs(); paintAll(); });
      strandSel.classList.add('tclock-level');
      const actSel = selectInput([['0', '']], 0, (v) => { p.act = +v; p.game = null; save(); paintAll(); });
      actSel.classList.add('tclock-level');
      const newBtn = el('button', { class: 'btn small', onclick: () => newChallenge() }, 'New');
      const actBtn = el('button', { class: 'btn ghost small', onclick: () => checkOrReveal() });
      const scoreEl = el('span', { class: 'tclock-score', title: 'Points this session' });
      gamebar.append(strandSel, actSel, newBtn, actBtn, scoreEl);

      function rebuildActs() {
        const strand = FT_STRANDS[clamp(+p.strand || 0, 0, FT_STRANDS.length - 1)];
        actSel.innerHTML = '';
        strand.acts.forEach((a, i) => actSel.append(el('option', { value: String(i) }, a.label)));
        actSel.value = String(clamp(+p.act || 0, 0, strand.acts.length - 1));
      }

      function newChallenge() {
        clearTimeout(wrongTimer);
        const R = (n) => Math.floor(Math.random() * n);
        const strand = FT_STRANDS[clamp(+p.strand || 0, 0, FT_STRANDS.length - 1)];
        const act = strand.acts[clamp(+p.act || 0, 0, strand.acts.length - 1)];
        const c = act.gen(R);
        if (c.mode && c.mode !== p.mode) p.mode = c.mode;
        p.value = c.value || 'count';
        p.flash = false;
        mat.classList.remove('ft-flash');
        framesDone.clear();
        p.pieces = (c.prime || []).map((v, i) => ({ id: uid(), v, r: false, fx: 0.22 + i * 0.2, fy: 0.5 }));
        p.game = { ...c, state: 'open' };
        save();
        layout();
        paintAll();
      }

      // generic checker — every build constraint the strand bank can set
      function checkBuild(g) {
        const s = sum();
        if (g.target != null && s !== g.target) return false;
        if (g.parityReq === 'even' && !(s > 0 && s % 2 === 0)) return false;
        if (g.parityReq === 'odd' && !(s > 0 && s % 2 === 1)) return false;
        if (g.tiles != null && p.pieces.length !== g.tiles) return false;
        if (g.same && !(p.pieces.length && p.pieces.every((x) => x.v === p.pieces[0].v))) return false;
        if (g.allOdd && !(p.pieces.length && p.pieces.every((x) => x.v % 2 === 1))) return false;
        if (g.needTen && !p.pieces.some((x) => x.v === 10)) return false;
        return true;
      }

      function checkCompare(g) {
        const a = sumPan(0), b = sumPan(1);
        if (!a || !b) return false;
        return g.rel === 'gt' ? a > b : g.rel === 'lt' ? a < b : g.rel === 'eq' ? a === b : b === 2 * a;
      }

      function checkOrReveal() {
        const g = p.game;
        if (!g || g.state !== 'open') { newChallenge(); return; }
        clearTimeout(wrongTimer);
        if (g.revealType) { g.state = 'revealed'; if (p.flash) { p.flash = false; mat.classList.remove('ft-flash'); } save(); paintAll(); return; }
        const ok = g.rel ? checkCompare(g) : checkBuild(g);
        if (ok) {
          g.state = 'done'; p.score++; p.streak++;
          beep(1);
        } else {
          g.state = 'wrong'; p.streak = 0;
          wrongTimer = setTimeout(() => { if (p.game === g && g.state === 'wrong') { g.state = 'open'; paintAll(); } }, 1800);
        }
        save(); paintAll();
      }

      function paintCompare() {
        if (p.mode !== 'compare' || !cmpChip) return;
        const a = sumPan(0), b = sumPan(1);
        subA.textContent = 'A · ' + val().tot(a);
        subB.textContent = 'B · ' + val().tot(b);
        cmpChip.textContent = a > b ? '>' : a < b ? '<' : '=';
      }

      function paintAll() {
        const g = p.gameOn ? p.game : null;
        totalBtn.textContent = 'Altogether: ' + (p.showTotal ? val().tot(sum()) : '•••');
        tray.style.display = p.magic ? '' : 'none';
        trayBtn.classList.toggle('active', !!p.magic);
        numBtn.classList.toggle('active', !!p.numerals);
        flashBtn.classList.toggle('active', !!p.flash);
        modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === p.mode));
        valueSel.value = p.value;
        frameBtn.style.display = p.mode === 'explore' ? '' : 'none';
        frameBtn.textContent = ['Frames: off', 'Frames ×1', 'Frames ×2'][clamp(+p.frames || 0, 0, 2)];
        frameBtn.classList.toggle('active', (+p.frames || 0) > 0);
        lineBtn.style.display = p.mode === 'line' ? '' : 'none';
        lineBtn.textContent = 'Line 0–' + (+p.lineMax === 20 ? 20 : 10);
        totalBtn.classList.toggle('active', !!p.showTotal);
        paintCompare();
        task.style.display = p.gameOn ? '' : 'none';
        modebar.style.display = '';
        gamebar.style.display = p.gameOn ? '' : 'none';
        task.classList.remove('ok', 'no');
        if (!p.gameOn) { /* clean display mode */ }
        else if (!g) task.textContent = 'Pick a strand, then press “New”';
        else if (g.state === 'done') { task.textContent = '✓ Correct!' + (p.streak > 1 ? ' ' + '⭐'.repeat(Math.min(p.streak, 5)) : ''); task.classList.add('ok'); }
        else if (g.state === 'wrong') { task.textContent = 'Not yet — count the holes and try again!'; task.classList.add('no'); }
        else if (g.state === 'revealed') { task.textContent = revealText(g); task.classList.add('ok'); }
        else task.textContent = g.text;
        strandSel.value = String(clamp(+p.strand || 0, 0, FT_STRANDS.length - 1));
        actSel.value = String(clamp(+p.act || 0, 0, FT_STRANDS[clamp(+p.strand || 0, 0, FT_STRANDS.length - 1)].acts.length - 1));
        actBtn.textContent = g && g.revealType ? 'Reveal' : 'Check';
        actBtn.disabled = !g || g.state !== 'open';
        scoreEl.textContent = '⭐ ' + (p.score || 0);
        sizeLbl.textContent = Math.round(clamp(+p.zoom || 2, 1, 4) * 50) + '%';
        sizeDn.disabled = (+p.zoom || 2) <= 1;
        sizeUp.disabled = (+p.zoom || 2) >= 4;
      }

      function revealText(g) {
        if (g.revealType === 'parity') return g.n + ' is ' + (g.n % 2 ? 'odd — it has a step!' : 'even — a full rectangle!');
        return 'It is ' + g.n;
      }

      rebuildActs();
      if (p.flash) mat.classList.add('ft-flash');
      layout();
      paintAll();
      const ro = new ResizeObserver(() => layout());
      ro.observe(mat);
      return () => { clearTimeout(wrongTimer); ro.disconnect(); };
    },
    settings(box, w, api) {
      box.append(
        settingRow('Mat mode', selectInput(FT_MODES, w.props.mode || 'explore', (v) => { w.props.mode = v; api.refresh(); })),
        settingRow('Each tile is worth', selectInput(Object.entries(FT_VALUES).map(([id, v]) => [id, v.name]), w.props.value || 'count', (v) => { w.props.value = v; api.refresh(); })),
        settingRow('Ten-frames (Ten-frames mode)', selectInput([[0, 'Hidden'], [1, 'One frame'], [2, 'Two frames']], clamp(+w.props.frames || 0, 0, 2), (v) => { w.props.frames = +v; api.refresh(); })),
        settingRow('Number line range', selectInput([[10, '0 – 10'], [20, '0 – 20']], +w.props.lineMax === 20 ? 20 : 10, (v) => { w.props.lineMax = +v; api.refresh(); })),
        checkRow('Numerals on the tiles', w.props.numerals, (v) => { w.props.numerals = v; api.refresh(); }),
        checkRow('Magic tray (drag spawns copies)', w.props.magic, (v) => { w.props.magic = v; api.refresh(); }),
        checkRow('Show the running total', w.props.showTotal, (v) => { w.props.showTotal = v; api.refresh(); }),
        checkRow('Teaching starters (challenges)', w.props.gameOn, (v) => { w.props.gameOn = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'One tool, the whole of primary: switch the mat between ten-frames, a number line and a compare balance; re-label every tile as a decimal, a percentage or a fraction; and pick a challenge strand from counting all the way to times tables and tenths. Evens are full rectangles, odds keep a turnable “step”.'),
        el('button', {
          class: 'btn ghost small', style: 'align-self:flex-start;',
          onclick: () => { w.props.score = 0; w.props.streak = 0; w.props.game = null; api.refresh(); },
        }, 'Reset score'),
      );
    },
  };

  // ---- Two-colour counters ----
  // Loose red/yellow flippable counters on a mat — the other half of WRM's
  // top-ranked resource (ten frame + counters). Tap the mat to place, tap a
  // counter to flip its colour, drag to move, drag off the mat to remove.
  // Mats: plain, ten frame, 20 frame, part–whole circles, array grid.
  const CT_RED = ['#f87171', '#b91c1c'];
  const CT_YEL = ['#fde047', '#a16207'];
  const CT_MATS = [['blank', 'Plain'], ['frame', 'Ten frame'], ['frame2', '20 frame'], ['pw', 'Part–whole'], ['array', 'Array']];
  // ten-frame cells are the top half of the 20 frame, so hopping between the
  // two keeps every counter in its place; any other switch re-reads positions
  const ctKeepCells = (a, b) => (a === 'frame' || a === 'frame2') && (b === 'frame' || b === 'frame2');

  WIDGETS.counters = {
    title: 'Counters', icon: 'counters', accent: '#fca5a5', w: 620, h: 480,
    defaults: () => ({ items: [], mat: 'frame', sent: false, covered: false }),
    mount(body, w) {
      body.classList.add('mntray', 'ctwidget');
      const p = w.props;
      if (!Array.isArray(p.items)) p.items = [];
      let popId = null; // freshly placed / flipped counter → one-shot pop
      let dragging = false;
      let zTop = 40;
      let flashT = null;
      let flashing = false; // mid-flash: sentences stay hidden through the reveal
      let binEl = null; // drop target — dragging a counter here removes it

      const mat = el('div', { class: 'ct-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, quick);

      const commit = () => { save(); paint(); };

      // all geometry flows from the mat's current size — resizing the widget
      // resizes the frame, grid and counters together (no separate zoom)
      function geom() {
        const W = mat.clientWidth || 560, H = mat.clientHeight || 300;
        const g = { W, H, d: clamp(Math.min(W, H) / 8.5, 22, 80) };
        if (p.mat === 'frame' || p.mat === 'frame2') {
          const two = p.mat === 'frame2';
          g.s = two ? Math.min((W * 0.92) / 5, (H * 0.86) / 4.6) : Math.min((W * 0.92) / 5, (H * 0.55) / 2);
          g.gap = two ? g.s * 0.6 : 0;
          g.fx = (W - g.s * 5) / 2;
          g.fy = two ? H * 0.05 : H * 0.1;
          g.cap = two ? 20 : 10;
          g.d = g.s * 0.74;
        } else if (p.mat === 'array') {
          g.cw = W / 12;
          g.ch = H / 8;
          g.d = 0.78 * Math.min(g.cw, g.ch);
        } else if (p.mat === 'pw') {
          const m = Math.min(W, H);
          g.whole = [W * 0.5, H * 0.235, m * 0.185];
          g.parts = [[W * 0.27, H * 0.67, m * 0.24], [W * 0.73, H * 0.67, m * 0.24]];
        }
        return g;
      }

      function cellCenter(idx, g) {
        if (p.mat === 'frame' || p.mat === 'frame2') {
          if (idx == null || idx < 0 || idx >= g.cap) return null;
          const row = Math.floor(idx / 5);
          return [g.fx + ((idx % 5) + 0.5) * g.s, g.fy + row * g.s + (row >= 2 ? g.gap : 0) + 0.5 * g.s];
        }
        if (p.mat === 'array') {
          if (idx == null) return null;
          return [((idx % 12) + 0.5) * g.cw, (Math.floor(idx / 12) + 0.5) * g.ch];
        }
        return null;
      }

      const posOf = (it, g) => cellCenter(it.cell, g) || [it.x * g.W, it.y * g.H];

      // dropping a counter claims the nearest free slot on structured mats;
      // outside the structure (or when it's full) the counter stays loose —
      // that's WRM's "ten and a bit more" laid out under the frame
      function snapItem(it, g) {
        const px = it.x * g.W, py = it.y * g.H;
        const taken = new Set(p.items.filter((o) => o !== it && o.cell != null).map((o) => o.cell));
        it.cell = null;
        if (p.mat === 'frame' || p.mat === 'frame2') {
          const fh = g.s * (g.cap === 20 ? 4 : 2) + g.gap;
          if (px < g.fx - g.s * 0.5 || px > g.fx + g.s * 5.5 || py < g.fy - g.s * 0.5 || py > g.fy + fh + g.s * 0.5) return;
          let best = null, bd = Infinity;
          for (let i = 0; i < g.cap; i++) {
            if (taken.has(i)) continue;
            const c = cellCenter(i, g);
            const dd = Math.hypot(c[0] - px, c[1] - py);
            if (dd < bd) { bd = dd; best = i; }
          }
          if (best != null && bd < g.s * 1.4) { it.cell = best; const c = cellCenter(best, g); it.x = c[0] / g.W; it.y = c[1] / g.H; }
        } else if (p.mat === 'array') {
          const gx = clamp(Math.floor(px / g.cw), 0, 11), gy = clamp(Math.floor(py / g.ch), 0, 7);
          const cands = [];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = gx + dx, y = gy + dy;
            if (x < 0 || x > 11 || y < 0 || y > 7) continue;
            const idx = y * 12 + x;
            if (taken.has(idx)) continue;
            const c = cellCenter(idx, g);
            cands.push([Math.hypot(c[0] - px, c[1] - py), idx]);
          }
          cands.sort((a, b) => a[0] - b[0]);
          if (cands.length) { it.cell = cands[0][1]; const c = cellCenter(it.cell, g); it.x = c[0] / g.W; it.y = c[1] / g.H; }
        }
      }

      // counters already lying on a freshly-chosen grid belong to it — adopt
      // them into cells so what the eye sees matches what the sentences count.
      // (Runs only on mat switches: continuous adoption would let loose spares
      // teleport into cells the moment one frees up.)
      function adoptLoose() {
        if (!(p.mat === 'frame' || p.mat === 'frame2' || p.mat === 'array')) return;
        const g = geom();
        for (const it of p.items) if (it.cell == null) snapItem(it, g);
      }

      function dragItem(elc, it, e0, isNew) {
        e0.preventDefault();
        const pid = e0.pointerId;
        const x0 = e0.clientX, y0 = e0.clientY;
        let moved = false;
        dragging = true;
        elc.style.zIndex = ++zTop;
        const g = geom();
        const isOut = (ev) => {
          const r = mat.getBoundingClientRect();
          return ev.clientX < r.left - 10 || ev.clientX > r.right + 10 || ev.clientY < r.top - 10 || ev.clientY > r.bottom + 10;
        };
        const overBin = (ev) => {
          if (!binEl) return false;
          const b = binEl.getBoundingClientRect();
          return ev.clientX >= b.left - 8 && ev.clientX <= b.right + 8 && ev.clientY >= b.top - 8 && ev.clientY <= b.bottom + 8;
        };
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
          moved = true;
          elc.classList.add('ct-drag');
          mat.classList.add('ct-dragging');
          const r = mat.getBoundingClientRect();
          it.x = clamp((ev.clientX - r.left) / r.width, 0.02, 0.98);
          it.y = clamp((ev.clientY - r.top) / r.height, 0.02, 0.98);
          it.cell = null;
          elc.style.left = it.x * g.W - g.d / 2 + 'px';
          elc.style.top = it.y * g.H - g.d / 2 + 'px';
          if (binEl) binEl.classList.toggle('hot', overBin(ev));
          elc.classList.toggle('ct-out', isOut(ev) || overBin(ev));
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          dragging = false;
          mat.classList.remove('ct-dragging');
          if (!moved) {
            if (!isNew) { it.f = it.f ? 0 : 1; popId = it.id; } // tap = flip
            else popId = it.id;
            snapItem(it, g);
            commit();
            return;
          }
          if (ev.type !== 'pointercancel' && (isOut(ev) || overBin(ev))) p.items = p.items.filter((x) => x !== it);
          else snapItem(it, g);
          commit();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      mat.addEventListener('pointerdown', (e) => {
        if (e.target !== mat || p.covered) return;
        if (p.items.length >= 60) { toast('That’s plenty of counters for one mat!'); return; }
        const r = mat.getBoundingClientRect();
        const it = {
          id: uid(), f: 0, cell: null,
          x: clamp((e.clientX - r.left) / r.width, 0.02, 0.98),
          y: clamp((e.clientY - r.top) / r.height, 0.02, 0.98),
        };
        p.items.push(it);
        const elc = mountCounter(it, geom());
        dragItem(elc, it, e, true);
      });

      function mountCounter(it, g) {
        const [x, y] = posOf(it, g);
        const [bg, bd] = it.f ? CT_YEL : CT_RED;
        const elc = el('button', {
          class: 'ct-c' + (popId === it.id ? ' bm-pop' : ''),
          style: `width:${g.d}px;height:${g.d}px;left:${x - g.d / 2}px;top:${y - g.d / 2}px;background:${bg};border-color:${bd};`,
          title: 'Tap to flip — drag to move, drag off the mat to remove',
        });
        elc.addEventListener('pointerdown', (e) => { if (!p.covered) dragItem(elc, it, e, false); });
        mat.append(elc);
        return elc;
      }

      function drawMatBg(g) {
        if (p.mat === 'frame' || p.mat === 'frame2') {
          const two = g.cap === 20;
          for (let f = 0; f < (two ? 2 : 1); f++) {
            mat.append(el('div', {
              class: 'ct-frame',
              style: `left:${g.fx}px;top:${g.fy + f * (2 * g.s + g.gap)}px;width:${g.s * 5}px;height:${g.s * 2}px;background-size:${g.s}px ${g.s}px;`,
            }));
          }
        } else if (p.mat === 'array') {
          mat.append(el('div', {
            class: 'ct-grid',
            style: `background-size:${g.cw}px ${g.ch}px;background-position:${g.cw / 2 - 2}px ${g.ch / 2 - 2}px;`,
          }));
        } else if (p.mat === 'pw') {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'pw-lines');
          svg.setAttribute('width', g.W);
          svg.setAttribute('height', g.H);
          const [wx, wy] = g.whole;
          svg.innerHTML = g.parts.map(([px2, py2]) => `<line x1="${wx}" y1="${wy}" x2="${px2}" y2="${py2}"/>`).join('');
          mat.append(svg);
          for (const [cx, cy, r] of [g.whole, ...g.parts]) {
            mat.append(el('div', {
              class: 'ct-ring',
              style: `left:${cx - r}px;top:${cy - r}px;width:${r * 2}px;height:${r * 2}px;`,
            }));
          }
        }
      }

      function paint() {
        mat.innerHTML = '';
        const g = geom();
        drawMatBg(g);
        binEl = el('div', { class: 'ct-bin', title: 'Drag a counter here to bin it' }, '🗑');
        mat.append(binEl);
        for (const it of p.items) mountCounter(it, g);
        if (p.covered) mat.append(el('div', { class: 'ct-blind' }, '?'));
        else if (!p.items.length) mat.append(el('div', { class: 'bm-empty ct-hint' }, 'Tap the mat to place counters'));
        popId = null;
        paintSent();
        paintQuick();
      }

      // the red/yellow split IS the number sentence — and a completed array
      // or filled part–whole circles read out their own fact families
      function sentences() {
        const n = p.items.length;
        if (!n) return [];
        const out = [];
        if (p.mat === 'array') {
          // only counters on the grid make the array — spares wait beside it
          const cells = p.items.map((i) => i.cell).filter((c) => c != null);
          const k = cells.length;
          if (k >= 4 && new Set(cells).size === k) {
            const xs = cells.map((c) => c % 12), ys = cells.map((c) => Math.floor(c / 12));
            const cw = Math.max(...xs) - Math.min(...xs) + 1;
            const rh = Math.max(...ys) - Math.min(...ys) + 1;
            if (cw >= 2 && rh >= 2 && cw * rh === k) {
              return [`${rh} × ${cw} = ${k}`, `${cw} × ${rh} = ${k}`, `${k} ÷ ${rh} = ${cw}`, `${k} ÷ ${cw} = ${rh}`];
            }
          }
        }
        if (p.mat === 'pw') {
          const g = geom();
          const counts = g.parts.map(([cx, cy, r]) =>
            p.items.filter((it) => { const [x, y] = posOf(it, g); return Math.hypot(x - cx, y - cy) < r * 0.95; }).length);
          const [a, b] = counts;
          if (a && b) {
            out.push(`${a} + ${b} = ${a + b}`);
            if (a !== b) out.push(`${b} + ${a} = ${a + b}`);
            return out;
          }
          return [];
        }
        // on the ten frames only counters IN the grid join the number story —
        // spares sitting beside the frame are a supply pile, not part of the sum
        const pool = p.mat === 'frame' || p.mat === 'frame2' ? p.items.filter((i) => i.cell != null) : p.items;
        const t = pool.length;
        const red = pool.filter((i) => !i.f).length, yel = t - red;
        if (red && yel) {
          out.push(`${red} + ${yel} = ${t}`);
          if (red !== yel) out.push(`${yel} + ${red} = ${t}`);
          out.push(`${t} − ${red} = ${yel}`);
          if (red !== yel) out.push(`${t} − ${yel} = ${red}`);
        } else if ((p.mat === 'frame' || p.mat === 'frame2') && t > 0) {
          // one colour in the frame: read the empty cells — the "make ten" fact
          const cap = p.mat === 'frame2' ? 20 : 10;
          const rest = cap - t;
          if (rest > 0) out.push(`${t} + ${rest} = ${cap}`, `${rest} + ${t} = ${cap}`, `${cap} − ${t} = ${rest}`, `${cap} − ${rest} = ${t}`);
        }
        return out.slice(0, 4);
      }

      function paintSent() {
        sent.innerHTML = '';
        // Facts keeps its line while switched on — sentences may come and go
        // (one colour, covered, mid-flash) but the mat never jumps around
        sent.style.display = p.sent ? '' : 'none';
        if (!p.sent) return;
        const list = p.covered || flashing ? [] : sentences();
        if (!list.length) {
          sent.append(el('span', { class: 'bm-fact', style: 'visibility:hidden;' }, '0 + 0 = 0'));
          return;
        }
        for (const s of list) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      // subitising: reveal the arrangement for a two-second look, then hide it
      // (the sentences sit the whole flash out — they'd whisper the answer)
      function flash() {
        clearTimeout(flashT);
        flashing = true;
        p.covered = false;
        paint();
        flashT = setTimeout(() => { flashing = false; p.covered = true; commit(); }, 2000);
      }

      function paintQuick() {
        quick.innerHTML = '';
        // every mat one tap away — cycling through modes in front of a class
        // meant parading all the wrong mats past the children first
        quick.append(
          el('span', { class: 'tq-step ft-seg' }, ...CT_MATS.map(([id, label]) => el('button', {
            class: 'tq-btn' + (p.mat === id ? ' active' : ''),
            title: 'Switch the mat',
            onclick: () => {
              if (p.mat === id) return;
              if (!ctKeepCells(p.mat, id)) { for (const it of p.items) it.cell = null; }
              p.mat = id;
              adoptLoose();
              commit();
            },
          }, label))),
          el('button', {
            class: 'tq-btn', title: 'Swap every counter’s colour',
            onclick: () => { for (const it of p.items) it.f = it.f ? 0 : 1; commit(); },
          }, 'Flip all'),
          el('button', {
            class: 'tq-btn', title: 'Show the counters for two seconds, then hide them (subitising)',
            onclick: flash,
          }, 'Flash'),
          el('button', {
            class: 'tq-btn' + (p.covered ? ' active' : ''), title: 'Hide the mat behind a cover',
            onclick: () => { clearTimeout(flashT); flashing = false; p.covered = !p.covered; commit(); },
          }, 'Cover'),
          el('button', {
            class: 'tq-btn' + (p.sent ? ' active' : ''), title: 'Show the number sentences under the mat',
            onclick: () => { p.sent = !p.sent; commit(); },
          }, 'Facts'),
          el('button', {
            class: 'tq-btn', title: 'Take every counter off the mat',
            onclick: () => { p.items = []; commit(); },
          }, 'Clear'),
        );
      }

      const ro = new ResizeObserver(() => { if (!dragging) paint(); });
      ro.observe(mat);
      paint();
      return () => { ro.disconnect(); clearTimeout(flashT); };
    },
    settings(box, w, api) {
      const preset = (label, make) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, make()); api.refresh(); },
      }, label);
      const C = (f, x, y, cell) => ({ id: uid(), f: f ? 1 : 0, x, y, cell: cell == null ? null : cell });
      const inCells = (f, cells) => cells.map((c) => C(f, 0.5, 0.5, c));
      box.append(
        el('div', { class: 'hint' }, 'Start from a mat:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('Make 10', () => ({ mat: 'frame', covered: false, sent: true, items: [...inCells(0, [0, 1, 2, 3, 4, 5, 6]), ...inCells(1, [7, 8, 9])] })),
          preset('Empty ten frame', () => ({ mat: 'frame', covered: false, items: [] })),
          preset('Doubles', () => ({ mat: 'frame2', covered: false, sent: true, items: [...inCells(0, [0, 1, 2, 3]), ...inCells(1, [10, 11, 12, 13])] })),
          preset('Subitise 6', () => ({
            mat: 'blank', sent: false, covered: true,
            items: [C(0, 0.32, 0.28), C(0, 0.68, 0.28), C(0, 0.32, 0.5), C(0, 0.68, 0.5), C(0, 0.32, 0.72), C(0, 0.68, 0.72)],
          })),
          preset('Part–whole 3 + 4', () => ({
            mat: 'pw', covered: false, sent: true,
            items: [C(0, 0.22, 0.6), C(0, 0.32, 0.6), C(0, 0.27, 0.74), C(1, 0.67, 0.6), C(1, 0.79, 0.6), C(1, 0.67, 0.74), C(1, 0.79, 0.74)],
          })),
          preset('Array 3 × 4', () => ({ mat: 'array', covered: false, sent: true, items: inCells(0, [28, 29, 30, 31, 40, 41, 42, 43, 52, 53, 54, 55]) })),
        ),
        settingRow('Mat', selectInput(CT_MATS, w.props.mat || 'blank', (v) => {
          if (!ctKeepCells(w.props.mat, v)) { for (const it of w.props.items || []) it.cell = null; }
          w.props.mat = v;
          api.refresh();
        })),
        checkRow('Number sentences under the mat', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Tap the mat to place a counter · tap a counter to flip it red ↔ yellow · drag to move — drop it on the bin (or right off the mat) to remove it · counters snap to ten-frame cells and array squares, and only counters ON the grid join the number sentences (spares beside the frame wait their turn) · “Flash” shows the mat for two seconds for subitising · everything scales when you resize the widget.'),
      );
    },
  };

  // ---- Base 10 (Dienes) ----
  // Dienes blocks for place value: ones, tens rods, hundred flats and a
  // thousand cube on a plain mat or a labelled place-value chart. The two moves
  // behind every column method are first-class: ten of a kind can be exchanged
  // up (the column's count glows and grows a "10 ⇄ 1" chip), and a block
  // dropped on a lower column — or double-tapped — breaks into ten of the next
  // place down. Dropping a block on a HIGHER column bounces with a nudge:
  // collect ten first, then exchange.
  const DN_MATS = [['plain', 'Plain'], ['to', 'T · O'], ['hto', 'H · T · O'], ['thto', 'Th · H · T · O'], ['tth', 'TTh'], ['m', 'Millions']];
  const DN_COLS = { plain: [], to: [1, 0], hto: [2, 1, 0], thto: [3, 2, 1, 0], tth: [4, 3, 2, 1, 0], m: [6, 5, 4, 3, 2, 1, 0] }; // chart columns, left → right
  const DN_ONE = ['one', 'ten', 'hundred', 'thousand', 'ten thousand', 'hundred thousand', 'million'];
  const DN_MANY = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands', 'millions'];
  const DN_HEAD = ['Ones', 'Tens', 'Hundreds', 'Thousands', 'Ten thousands', 'Hundred thousands', 'Millions'];
  const DN_SHORT = ['O', 'T', 'H', 'Th', 'TTh', 'HTh', 'M'];
  const DN_VALS = [1, 10, 100, 1000, 10000, 100000, 1000000];
  const DN_CAP = [30, 20, 20, 12, 12, 12, 9]; // per-denomination caps — enough to overshoot ten and feel the need to exchange
  const DN_RANGE = { plain: [11, 999], to: [11, 99], hto: [101, 999], thto: [1001, 9999], tth: [10001, 99999], m: [100001, 9999999] };
  // widest piece (in units) and tallest column stack each chart must fit — sets the unit size
  const DN_FIT = { to: { w: 11.9, h: 23, min: 3.5 }, hto: { w: 11.9, h: 23, min: 3.5 }, thto: { w: 16.4, h: 23, min: 3.5 }, tth: { w: 16.4, h: 112, min: 1.1 }, m: { w: 146.5, h: 152, min: 0.5 } };
  // the small charts are honest about scale; the Y5 charts compress it — at a
  // true 1:100 a one is an invisible speck beside the million cube and the
  // lower columns read as empty. Each denomination gets its own gentle boost
  // (size order is strictly kept) and the mat whispers "not to scale".
  const DN_BOOST = { tth: [3.2, 1.7, 1.75, 1.45, 1, 1, 1], m: [8, 3.6, 4, 3.4, 1.6, 1.05, 1] };
  const DN_PRAISE = ['Spot on!', 'Correct — great building!', 'Yes! That’s it exactly.', 'Brilliant!'];
  const dnFmt = (n) => n.toLocaleString('en-GB');
  const dnName = (d, n) => (n === 1 ? DN_ONE[d] : DN_MANY[d]);
  const dnCount = (items, d) => items.reduce((a, it) => a + (it.d === d ? 1 : 0), 0);
  const dnTotal = (items) => items.reduce((a, it) => a + DN_VALS[it.d], 0);
  // the highest denomination on the mat that the target chart has no column for
  const dnMisfit = (items, mat) => {
    const cols = DN_COLS[mat] || [];
    let bad = null;
    // the plain mat is free play up to the thousand cube — the big Y5 blocks
    // only make sense (and only fit) on their labelled charts
    const fits = (d) => (cols.length ? cols.includes(d) : d <= 3);
    for (const it of items) if (!fits(it.d)) bad = bad == null ? it.d : Math.max(bad, it.d);
    return bad;
  };
  // drawn footprint in px: [w, h] at unit size u (a one is 1×1 units)
  const DN_DIMS = [[1.2, 1.2], [1.2, 10.2], [10.2, 10.2], [14.6, 14.6], [14.6, 104.6], [104.6, 104.6], [144.2, 144.2]];
  const dnFoot = (d, u) => [DN_DIMS[d][0] * u, DN_DIMS[d][1] * u];

  // block artwork — 10 viewBox units per cube edge, warm "wood" like the real
  // kit. Strokes are non-scaling so the giant Y5 charts (where a one is a
  // speck) keep crisp edges; unit gridlines bow out below u≈3.5 and the big
  // blocks always show cube-level divisions instead (every 10 units).
  function dnSVG(d, u) {
    const k = u / 10;
    const line = '#92400e', edge = '#713f12';
    const st = (w, col, extra) => `vector-effect="non-scaling-stroke" stroke="${col || edge}" stroke-width="${w}" fill="none" ${extra || ''}`;
    const svg = (w, h, inner) => `<svg width="${w * k}" height="${h * k}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    const grid = u >= 3.5;
    const rules = (n, step, len, vert, x0, y0) => {
      let s = '';
      for (let i = 1; i <= n; i++) s += vert ? `M${x0 + i * step} ${y0}v${len}` : `M${x0} ${y0 + i * step}h${len}`;
      return s;
    };
    if (d === 0) return svg(12, 12, `<rect x="1" y="1" width="10" height="10" rx="1" fill="#fbbf24" ${st(1.5)}/>`);
    if (d === 1) {
      return svg(12, 102, `<rect x="1" y="1" width="10" height="100" rx="1.5" fill="#fcd34d" ${st(1.5)}/>`
        + (grid ? `<path d="${rules(9, 10, 10, false, 1, 1)}" ${st(0.8, line)}/>` : ''));
    }
    if (d === 2) {
      return svg(102, 102, `<rect x="1" y="1" width="100" height="100" rx="1.5" fill="#fcd34d" ${st(1.6)}/>`
        + (grid ? `<path d="${rules(9, 10, 100, false, 1, 1)}${rules(9, 10, 100, true, 1, 1)}" ${st(0.7, line, 'opacity="0.85"')}/>` : ''));
    }
    // 3+: isometric cuboids. The thousand shows unit lines; the ten-thousand
    // tower, hundred-thousand slab and million cube divide into thousand-cubes
    // so the "ten of these make one of those" story stays visible at any size.
    const iso = (fw, fh, off, div, divStep) => {
      const x1 = 1 + fw, yT = 1 + off, y1 = yT + fh; // front spans (1,yT)-(x1,y1); top and side recede by `off`
      const nx = Math.round(fw / divStep) - 1, ny = Math.round(fh / divStep) - 1;
      let out = `<path d="M1 ${yT}L${1 + off} 1H${x1 + off}L${x1} ${yT}Z" fill="#fde68a" ${st(1.6, edge, 'stroke-linejoin="round"')}/>`
        + `<path d="M${x1} ${yT}L${x1 + off} 1V${1 + fh}L${x1} ${y1}Z" fill="#d97706" ${st(1.6, edge, 'stroke-linejoin="round"')}/>`;
      let carry = '';
      if (div) {
        for (let i = 1; i <= nx; i++) carry += `M${1 + i * divStep} ${yT}L${1 + off + i * divStep} 1`; // top: verticals recede
        for (let i = 1; i <= ny; i++) carry += `M${x1} ${yT + i * divStep}L${x1 + off} ${1 + i * divStep}`; // side: horizontals recede
        if (carry) out += `<path d="${carry}" ${st(0.7, line, 'opacity="0.5"')}/>`;
      }
      out += `<rect x="1" y="${yT}" width="${fw}" height="${fh}" fill="#fcd34d" ${st(1.6)}/>`;
      if (div) out += `<path d="${rules(ny, divStep, fw, false, 1, yT)}${rules(nx, divStep, fh, true, 1, yT)}" ${st(0.7, line, 'opacity="0.85"')}/>`;
      return out;
    };
    if (d === 3) return svg(146, 146, iso(100, 100, 44, grid, 10));
    if (d === 4) return svg(146, 1046, iso(100, 1000, 44, true, 100));
    if (d === 5) return svg(1046, 1046, iso(1000, 1000, 44, true, 100));
    return svg(1442, 1442, iso(1000, 1000, 440, true, 100));
  }

  WIDGETS.dienes = {
    title: 'Base 10', icon: 'dienes', accent: '#fcd34d', w: 760, h: 560,
    defaults: () => ({ items: [], mat: 'hto', val: true, masked: false, sent: false, covered: false, task: false, target: null, streak: 0 }),
    mount(body, w) {
      body.classList.add('mntray', 'dnwidget');
      const p = w.props;
      if (!Array.isArray(p.items)) p.items = [];
      for (const it of p.items) it.d = clamp(it.d | 0, 0, 6);
      let dragging = false;
      let animating = false; // mid-exchange: pieces are converging, hands off
      let flashing = false;
      let zTop = 40;
      let flashT = null, exT = null;
      let binEl = null;
      let armed = 0; // plain mat: which block a bare mat-tap adds (last tray piece touched)
      let lastTap = { id: null, t: 0 };
      let pillPop = false;
      let taskDone = false; // transient ✓ state — not saved, a reload re-poses the challenge
      let valWas = p.val !== false;
      const popIds = new Set();
      const els = new Map(); // item id -> element, for the exchange animation

      const mat = el('div', { class: 'ct-mat dn-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const taskRow = el('div', { class: 'tclock-quick dn-taskrow' });
      const trayRow = el('div', { class: 'dn-tray' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, taskRow, trayRow, quick);

      const commit = () => { save(); paint(); };
      const colsOf = () => DN_COLS[p.mat] || [];
      const uFor = (d, g) => g.u * ((DN_BOOST[p.mat] || [])[d] || 1); // per-denomination unit size (big charts compress the scale)

      // all geometry flows from the mat size: the unit cube edge u sets every
      // block, so resizing the widget scales the whole kit together
      function geom() {
        const W = mat.clientWidth || 600, H = mat.clientHeight || 360;
        const cols = colsOf();
        const g = { W, H, rects: [], head: 0 };
        if (cols.length) {
          const cw = W / cols.length;
          g.head = clamp(H * 0.12, 30, 46);
          const fit = DN_FIT[p.mat] || DN_FIT.hto;
          g.u = clamp(Math.min(cw / fit.w, (H - g.head) / fit.h), fit.min, 15);
          g.rects = cols.map((d, i) => ({ d, x: i * cw, y: g.head, w: cw, h: H - g.head }));
        } else {
          g.u = clamp(Math.min(W, H) / 30, 3.5, 16);
        }
        return g;
      }

      // tidy layout inside a column: ones sit five-wise (subitisable rows),
      // everything else packs left-to-right; when a column fills up the rows
      // squeeze into an overlapping cascade instead of escaping the chart
      function dnSlots(d, n, r, u) {
        const [pw, ph] = dnFoot(d, u);
        const gap = u * 0.55;
        const padX = Math.max(6, u * 0.7), padY = Math.max(6, u * 0.7);
        const perRow = Math.max(1, Math.min(d === 0 ? 5 : 99, Math.floor((r.w - padX * 2 + gap) / (pw + gap))));
        const rows = Math.ceil(n / perRow);
        let rowH = ph + gap;
        const avail = r.h - padY * 2 - ph;
        if (rows > 1 && (rows - 1) * rowH > avail) rowH = Math.max(u * 0.8, avail / (rows - 1));
        const x0 = r.x + (r.w - (perRow * (pw + gap) - gap)) / 2;
        const out = [];
        for (let i = 0; i < n; i++) {
          out.push([x0 + (i % perRow) * (pw + gap) + pw / 2, r.y + padY + Math.floor(i / perRow) * rowH + ph / 2]);
        }
        return out;
      }

      // free-play placement: each denomination gets its own drop zone so taps
      // don't pile new blocks on top of each other
      function dnSpot(it, n) {
        it.x = clamp(0.13 + (3 - it.d) * 0.23 + (n % 3) * 0.05, 0.04, 0.94);
        it.y = clamp(0.14 + Math.floor(n / 3) * 0.12, 0.06, 0.82);
      }

      function placeNew(it) {
        if (!colsOf().length) dnSpot(it, dnCount(p.items, it.d) - 1);
      }

      function addPiece(d) {
        if (p.covered || animating) return;
        if (dnCount(p.items, d) >= DN_CAP[d]) { toast(`That’s plenty of ${DN_MANY[d]} — try exchanging ten of them!`); return; }
        const it = { id: uid(), d, x: 0.5, y: 0.5 };
        p.items.push(it);
        placeNew(it);
        popIds.add(it.id);
        commit();
      }

      // a ten-of-a-kind converges into one of the next place up — the exchange
      function exchange(d) {
        // d >= 6 is an index guard only (nothing above millions). The old
        // `d >= 3` predated the big charts: their Th→TTh and up chips rendered
        // and did nothing — the column checks below are the real gate.
        if (animating || p.covered || d >= 6) return;
        if (dnCount(p.items, d) < 10) return;
        const cols = colsOf();
        if (cols.length && !cols.includes(d + 1)) return; // no column to land in on this chart
        if (dnCount(p.items, d + 1) >= DN_CAP[d + 1]) { toast(`No room for another ${DN_ONE[d + 1]} — clear a few blocks first!`); return; }
        const g = geom();
        const ten = p.items.filter((it) => it.d === d).slice(0, 10);
        const rect = g.rects.find((c) => c.d === d + 1);
        let tx, ty;
        if (rect) { tx = rect.x + rect.w / 2; ty = rect.y + Math.min(rect.h * 0.3, 90); }
        else {
          tx = (ten.reduce((a, t) => a + t.x, 0) / 10) * g.W;
          ty = (ten.reduce((a, t) => a + t.y, 0) / 10) * g.H;
        }
        animating = true;
        for (const t of ten) {
          const elc = els.get(t.id);
          if (!elc) continue;
          elc.classList.add('dn-merge');
          elc.style.zIndex = ++zTop;
          elc.style.left = tx - elc.offsetWidth / 2 + 'px';
          elc.style.top = ty - elc.offsetHeight / 2 + 'px';
          elc.style.transform = 'scale(0.45)';
          elc.style.opacity = '0.3';
        }
        exT = setTimeout(() => {
          animating = false;
          const ids = new Set(ten.map((t) => t.id));
          p.items = p.items.filter((it) => !ids.has(it.id));
          const nu = { id: uid(), d: d + 1, x: clamp(tx / g.W, 0.03, 0.97), y: clamp(ty / g.H, 0.03, 0.97) };
          p.items.push(nu);
          popIds.add(nu.id);
          toast(`Ten ${DN_MANY[d]} make one ${DN_ONE[d + 1]}!`);
          commit();
        }, 360);
      }

      // ...and the inverse: one block bursts into ten of the place below
      function breakApart(it, g0) {
        if (it.d === 0) { popIds.add(it.id); commit(); return; }
        const kid = it.d - 1;
        if (dnCount(p.items, kid) + 10 > DN_CAP[kid]) { toast(`No room for ten more ${DN_MANY[kid]} — exchange or clear some first!`); commit(); return; }
        const cx = it.x, cy = it.y;
        p.items = p.items.filter((x) => x !== it);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const nu = {
            id: uid(), d: kid,
            x: clamp(cx + Math.cos(a) * 0.07, 0.04, 0.94),
            y: clamp(cy + Math.sin(a) * 0.09, 0.06, 0.9),
          };
          p.items.push(nu);
          popIds.add(nu.id);
        }
        toast(`One ${DN_ONE[kid + 1]} breaks into ten ${DN_MANY[kid]}`);
        commit();
      }

      function dragItem(elc, it, e0, isNew, fromTray) {
        e0.preventDefault();
        if (animating) return;
        const pid = e0.pointerId;
        const x0 = e0.clientX, y0 = e0.clientY;
        let moved = false;
        dragging = true;
        elc.style.zIndex = ++zTop;
        const g = geom();
        const [pw, ph] = dnFoot(it.d, uFor(it.d, g));
        const bw = Math.max(pw, 24), bh = Math.max(ph, 24);
        const isOut = (ev) => {
          const r = mat.getBoundingClientRect();
          return ev.clientX < r.left - 10 || ev.clientX > r.right + 10 || ev.clientY < r.top - 10 || ev.clientY > r.bottom + 10;
        };
        const overBin = (ev) => {
          if (!binEl) return false;
          const b = binEl.getBoundingClientRect();
          return ev.clientX >= b.left - 8 && ev.clientX <= b.right + 8 && ev.clientY >= b.top - 8 && ev.clientY <= b.bottom + 8;
        };
        const colAt = (ev) => {
          const r = mat.getBoundingClientRect();
          const x = ev.clientX - r.left;
          return g.rects.find((c) => x >= c.x && x < c.x + c.w) || null;
        };
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
          moved = true;
          elc.classList.add('ct-drag');
          mat.classList.add('ct-dragging');
          const r = mat.getBoundingClientRect();
          it.x = clamp((ev.clientX - r.left) / r.width, 0.02, 0.98);
          it.y = clamp((ev.clientY - r.top) / r.height, 0.02, 0.98);
          elc.style.left = it.x * g.W - bw / 2 + 'px';
          elc.style.top = it.y * g.H - bh / 2 + 'px';
          if (binEl) binEl.classList.toggle('hot', overBin(ev));
          elc.classList.toggle('ct-out', isOut(ev) || overBin(ev));
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          dragging = false;
          mat.classList.remove('ct-dragging');
          if (!moved) {
            if (fromTray) placeNew(it); // a tray tap lands in its home spot
            else if (!isNew) {
              // double-tap = break the block apart
              const now = Date.now();
              if (lastTap.id === it.id && now - lastTap.t < 380) { lastTap = { id: null, t: 0 }; breakApart(it, g); return; }
              lastTap = { id: it.id, t: now };
            }
            popIds.add(it.id);
            commit();
            return;
          }
          if (ev.type !== 'pointercancel' && (isOut(ev) || overBin(ev))) { p.items = p.items.filter((x) => x !== it); commit(); return; }
          const c = colAt(ev);
          if (c && c.d !== it.d) {
            if (c.d < it.d) { breakApart(it, g); return; } // dropped below its place: break it up
            toast(`Ten ${DN_MANY[it.d]} make one ${DN_ONE[it.d + 1]} — collect ten, then exchange!`);
          }
          commit(); // repaint snaps everything back into its tidy slot
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      // plain mat: a bare tap drops the armed block right under the finger
      mat.addEventListener('pointerdown', (e) => {
        if (e.target !== mat || p.covered || animating || colsOf().length) return;
        if (dnCount(p.items, armed) >= DN_CAP[armed]) { toast(`That’s plenty of ${DN_MANY[armed]} — try exchanging ten of them!`); return; }
        const r = mat.getBoundingClientRect();
        const it = {
          id: uid(), d: armed,
          x: clamp((e.clientX - r.left) / r.width, 0.02, 0.98),
          y: clamp((e.clientY - r.top) / r.height, 0.02, 0.98),
        };
        p.items.push(it);
        const elc = mountPiece(it, geom());
        dragItem(elc, it, e, true, false);
      });

      function trayDrag(d, e0) {
        if (p.covered || animating) return;
        armed = d;
        if (dnCount(p.items, d) >= DN_CAP[d]) { toast(`That’s plenty of ${DN_MANY[d]} — try exchanging ten of them!`); paintTray(); return; }
        const g = geom();
        const it = { id: uid(), d, x: 0.5, y: 0.88 };
        p.items.push(it);
        const elc = mountPiece(it, g);
        dragItem(elc, it, e0, true, true);
      }

      function mountPiece(it, g, pos) {
        const pu = uFor(it.d, g);
        const [pw, ph] = dnFoot(it.d, pu);
        const bw = Math.max(pw, 24), bh = Math.max(ph, 24); // hitbox never shrinks below a fingertip
        const [x, y] = pos || [it.x * g.W, it.y * g.H];
        const elc = el('button', {
          class: 'dn-p' + (popIds.has(it.id) ? ' bm-pop' : ''),
          style: `width:${bw}px;height:${bh}px;left:${x - bw / 2}px;top:${y - bh / 2}px;`,
          title: it.d ? `Drag to move — double-tap to break into ten ${DN_MANY[it.d - 1]}` : 'Drag to move — drop on the bin to remove',
          html: dnSVG(it.d, pu),
        });
        elc.addEventListener('pointerdown', (e) => { if (!p.covered && !animating) dragItem(elc, it, e, false, false); });
        els.set(it.id, elc);
        mat.append(elc);
        return elc;
      }

      function paint() {
        mat.innerHTML = '';
        els.clear();
        const g = geom();
        const chart = g.rects.length > 0;
        for (const c of g.rects) {
          const n = dnCount(p.items, c.d);
          const colEl = el('div', { class: 'dn-col', style: `left:${c.x}px;width:${c.w}px;height:${g.H}px;` });
          const head = el('div', { class: 'dn-head', style: `height:${g.head}px;font-size:${clamp(g.head * 0.42, 12, 19)}px;` },
            el('span', { class: 'dn-hlabel' }, c.w > 128 ? DN_HEAD[c.d] : DN_SHORT[c.d]),
            n ? el('span', { class: 'dn-count' + (n >= 10 ? ' hot' : '') }, String(n)) : null,
            n >= 10 && c.d < 6 && colsOf().includes(c.d + 1) ? el('button', {
              class: 'dn-xchip', title: `Exchange ten ${DN_MANY[c.d]} for one ${DN_ONE[c.d + 1]}`,
              onpointerdown: (e) => e.stopPropagation(),
              onclick: () => exchange(c.d),
            }, '10 ⇄ 1') : null,
          );
          colEl.append(head);
          colEl.addEventListener('pointerdown', (e) => { if (e.target === colEl) addPiece(c.d); });
          mat.append(colEl);
        }
        if (!chart) {
          const chips = [];
          for (let d = 0; d < 3; d++) {
            if (dnCount(p.items, d) >= 10) {
              chips.push(el('button', {
                class: 'dn-xchip', title: 'Exchange up',
                onclick: () => exchange(d),
              }, `10 ${DN_MANY[d]} ⇄ 1 ${DN_ONE[d + 1]}`));
            }
          }
          if (chips.length && !p.covered) mat.append(el('div', { class: 'dn-chips' }, chips));
        }
        binEl = el('div', { class: 'ct-bin', title: 'Drag a block here to bin it' }, '🗑');
        mat.append(binEl);
        if (DN_BOOST[p.mat]) mat.append(el('div', { class: 'dn-nts' }, 'not to scale'));
        if (chart) {
          for (const c of g.rects) {
            const list = p.items.filter((it) => it.d === c.d);
            const pts = dnSlots(c.d, list.length, c, uFor(c.d, g));
            list.forEach((it, i) => {
              it.x = pts[i][0] / g.W; // keep coords honest so switching to the plain mat holds the layout
              it.y = pts[i][1] / g.H;
              mountPiece(it, g, pts[i]);
            });
          }
        } else {
          for (const it of p.items) mountPiece(it, g);
        }
        if (p.covered) mat.append(el('div', { class: 'ct-blind' }, '?'));
        else if (!p.items.length) mat.append(el('div', { class: 'bm-empty ct-hint' }, chart ? 'Tap a column to add its block — or drag one in from the tray' : 'Tap the mat to add blocks — the tray picks which kind'));
        popIds.clear();
        paintSent();
        paintTask();
        paintTray();
        paintQuick();
      }

      // stem sentence, expanded form, then any live exchange facts
      function sentences() {
        if (!p.items.length) return [];
        const c = [0, 1, 2, 3, 4, 5, 6].map((d) => dnCount(p.items, d));
        const out = [];
        const cols = colsOf().length ? colsOf() : [6, 5, 4, 3, 2, 1, 0].filter((d) => c[d]);
        const nz = cols.filter((d) => c[d]);
        if (nz.length) {
          const hi = Math.max(...nz);
          const parts = cols.filter((d) => d <= hi).map((d) => `${c[d]} ${dnName(d, c[d])}`);
          out.push(parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]);
          const terms = [6, 5, 4, 3, 2, 1, 0].filter((d) => c[d]).map((d) => dnFmt(c[d] * DN_VALS[d]));
          // the sentences are the scaffold, so a masked value pill doesn't hide
          // them — the expanded form just holds its answer back until the reveal
          if (terms.length > 1) out.push(`${terms.join(' + ')} = ${p.val && p.masked ? '?' : dnFmt(dnTotal(p.items))}`);
        }
        for (let d = 0; d < 6; d++) {
          if (c[d] >= 10) {
            const q = Math.floor(c[d] / 10), r = c[d] % 10;
            out.push(`${c[d]} ${DN_MANY[d]} = ${q} ${dnName(d + 1, q)}${r ? ` and ${r} ${dnName(d, r)}` : ''}`);
          }
        }
        return out.slice(0, 4);
      }

      function paintSent() {
        sent.innerHTML = '';
        sent.style.display = p.sent ? '' : 'none';
        if (!p.sent) return;
        const list = p.covered || flashing ? [] : sentences();
        if (!list.length) {
          sent.append(el('span', { class: 'bm-fact', style: 'visibility:hidden;' }, '0 + 0 = 0'));
          return;
        }
        for (const s of list) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      function newTarget() {
        const [lo, hi] = DN_RANGE[p.mat] || DN_RANGE.plain;
        let t = p.target;
        for (let i = 0; i < 9 && (t == null || t === p.target); i++) t = lo + Math.floor(Math.random() * (hi - lo + 1));
        p.target = t;
      }

      function checkTask() {
        if (taskDone) return;
        const v = dnTotal(p.items);
        if (v === p.target) {
          taskDone = true;
          p.streak = (p.streak || 0) + 1;
          const messy = [0, 1, 2, 3, 4, 5].some((d) => dnCount(p.items, d) >= 10);
          toast(messy ? 'Correct! Now exchange to show it the tidy way.' : DN_PRAISE[p.streak % DN_PRAISE.length]);
        } else {
          toast('Not yet — count each column carefully and keep building!');
        }
        commit();
      }

      function setTask(on) {
        p.task = on;
        if (on) {
          newTarget();
          taskDone = false;
          valWas = p.val; // the value pill would give the game away
          p.val = false;
        } else {
          p.val = valWas;
          taskDone = false;
        }
        commit();
      }

      function randomNumber() {
        const [lo, hi] = DN_RANGE[p.mat] || DN_RANGE.plain;
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        p.items = [];
        for (let d = 6; d >= 0; d--) {
          const q = Math.floor(n / DN_VALS[d]) % 10;
          for (let i = 0; i < q; i++) p.items.push({ id: uid(), d, x: 0.5, y: 0.5 });
        }
        if (!colsOf().length) {
          const seen = [0, 0, 0, 0];
          for (const it of p.items) dnSpot(it, seen[it.d]++);
        }
        if (p.val) p.masked = true; // blocks first, number on reveal
        taskDone = false;
        toast('What number does the mat show?');
        commit();
      }

      function flash() {
        clearTimeout(flashT);
        flashing = true;
        p.covered = false;
        paint();
        flashT = setTimeout(() => { flashing = false; p.covered = true; commit(); }, 2000);
      }

      function paintTask() {
        taskRow.innerHTML = '';
        taskRow.style.display = p.task && p.target != null ? '' : 'none';
        if (!p.task || p.target == null) return;
        taskRow.append(...[
          el('span', { class: 'dn-goal' + (taskDone ? ' done' : '') }, taskDone ? `✓ ${dnFmt(p.target)}` : `Build ${dnFmt(p.target)}`),
          el('button', { class: 'tq-btn', title: 'Check the mat against the target', onclick: checkTask }, 'Check'),
          el('button', {
            class: 'tq-btn', title: 'Clear the mat and set a new target',
            onclick: () => { p.items = []; taskDone = false; newTarget(); commit(); },
          }, 'New number'),
          p.streak > 0 ? el('span', { class: 'dn-streak' }, `⭐ ${p.streak}`) : null,
        ].filter(Boolean));
      }

      function paintTray() {
        trayRow.innerHTML = '';
        const chart = colsOf().length > 0;
        const ds = chart ? colsOf() : [3, 2, 1, 0];
        const tu = [18, 4.6, 4.6, 3.6, 0.5, 0.46, 0.34]; // fixed display scale per denomination — roughly equal tray heights
        for (const d of ds) {
          const b = el('button', {
            class: 'dn-tpc' + (!chart && armed === d ? ' active' : ''),
            title: chart ? `Add a ${DN_ONE[d]} to its column — or drag it in` : `Add a ${DN_ONE[d]} — mat taps now add these too`,
            html: dnSVG(d, tu[d]) + `<span class="dn-tval">${dnFmt(DN_VALS[d])}</span>`,
          });
          b.addEventListener('pointerdown', (e) => trayDrag(d, e));
          trayRow.append(b);
        }
        if (p.val) {
          const hide = p.masked || p.covered || flashing;
          trayRow.append(el('button', {
            class: 'dn-value' + (hide ? ' masked' : '') + (pillPop ? ' bm-pop' : ''),
            title: 'Tap to hide or reveal the number',
            onclick: () => { p.masked = !p.masked; pillPop = !p.masked; save(); paint(); },
          }, hide ? '?' : dnFmt(dnTotal(p.items))));
          pillPop = false;
        }
      }

      function paintQuick() {
        quick.innerHTML = '';
        const tq = (label, title, active, fn) => el('button', { class: 'tq-btn' + (active ? ' active' : ''), title, onclick: fn }, label);
        quick.append(
          el('span', { class: 'tq-step ft-seg' }, ...DN_MATS.map(([id, label]) => el('button', {
            class: 'tq-btn' + (p.mat === id ? ' active' : ''),
            title: 'Switch the mat',
            onclick: () => {
              if (p.mat === id) return;
              const bad = dnMisfit(p.items, id);
              if (bad != null) { toast(`The ${label} chart has no ${DN_MANY[bad]} column — exchange or clear them first`); return; }
              p.mat = id;
              if (p.task) { newTarget(); taskDone = false; } // a target must be buildable on the new chart
              if (id === 'm' && mat.clientWidth < 1100) toast('Stretch the widget nice and wide — the million cube needs room!');
              commit();
            },
          }, label))),
          tq('Value', 'Show the number the blocks make', p.val, () => { p.val = !p.val; valWas = p.val; commit(); }),
          tq('Facts', 'Show the number sentences under the mat', p.sent, () => { p.sent = !p.sent; commit(); }),
          tq('Flash', 'Show the blocks for two seconds, then hide them', false, flash),
          tq('Cover', 'Hide the mat behind a cover', p.covered, () => { clearTimeout(flashT); flashing = false; p.covered = !p.covered; commit(); }),
          tq('Build', 'Challenge: build a target number', p.task, () => setTask(!p.task)),
          tq('Random', 'Scatter a random number onto the mat', false, randomNumber),
          tq('Clear', 'Take every block off the mat', false, () => { p.items = []; taskDone = false; commit(); }),
        );
      }

      if (p.task && p.target == null) newTarget();
      const ro = new ResizeObserver(() => { if (!dragging && !animating) paint(); });
      ro.observe(mat);
      paint();
      return () => { ro.disconnect(); clearTimeout(flashT); clearTimeout(exT); };
    },
    settings(box, w, api) {
      const preset = (label, make) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, make()); api.refresh(); },
      }, label);
      const mkItems = (th, h, t, o) => {
        const items = [];
        for (const [d, n] of [[3, th], [2, h], [1, t], [0, o]]) {
          for (let i = 0; i < n; i++) items.push({ id: uid(), d, x: 0.5, y: 0.5 });
        }
        return items;
      };
      const mkNum = (n) => {
        const items = [];
        for (let d = 6; d >= 0; d--) {
          const q = Math.floor(n / DN_VALS[d]) % 10;
          for (let i = 0; i < q; i++) items.push({ id: uid(), d, x: 0.5, y: 0.5 });
        }
        return items;
      };
      box.append(
        el('div', { class: 'hint' }, 'Start from a mat:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('Tens and ones: 34', () => ({ mat: 'to', items: mkItems(0, 0, 3, 4), val: true, masked: false, sent: true, covered: false, task: false })),
          preset('Exchange 14 ones', () => ({ mat: 'to', items: mkItems(0, 0, 0, 14), val: false, masked: false, sent: true, covered: false, task: false })),
          preset('Break a ten: 13 − 5', () => ({ mat: 'to', items: mkItems(0, 0, 1, 3), val: false, masked: false, sent: false, covered: false, task: false })),
          preset('Three digits: 245', () => ({ mat: 'hto', items: mkItems(0, 2, 4, 5), val: true, masked: true, sent: false, covered: false, task: false })),
          preset('Four digits: 1,362', () => ({ mat: 'thto', items: mkItems(1, 3, 6, 2), val: true, masked: true, sent: false, covered: false, task: false })),
          preset('Y5 · 34,052', () => ({ mat: 'tth', items: mkNum(34052), val: true, masked: true, sent: true, covered: false, task: false })),
          preset('Millions · 2,417,306', () => ({ mat: 'm', items: mkNum(2417306), val: true, masked: true, sent: true, covered: false, task: false })),
          preset('Build-it challenge', () => ({ mat: 'to', items: [], val: false, masked: false, sent: false, covered: false, task: true, target: null })),
        ),
        settingRow('Mat', selectInput(DN_MATS, w.props.mat || 'hto', (v) => {
          const bad = dnMisfit(w.props.items || [], v);
          if (bad != null) { toast(`That chart has no ${DN_MANY[bad]} column — exchange or clear them first`); return; }
          w.props.mat = v;
          if (w.props.task) w.props.target = null; // remount rolls a target that fits the new chart
          api.refresh();
        })),
        checkRow('Show the number (value pill)', w.props.val !== false, (v) => { w.props.val = v; api.refresh(); }),
        checkRow('Number sentences under the mat', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Tap a chart column (or the tray) to add blocks · drag to move — drop on the bin or off the mat to remove · when a place collects ten, its count glows: tap the “10 ⇄ 1” chip and they exchange into one of the next place · drag a block onto a lower column, or double-tap it, to break it into ten · “Build” poses a target number; “Random” scatters a mystery number to read · tap the big number to mask it behind a “?” — the sentences stay as a scaffold and hold back the answer (“… = ?”) until you reveal · the TTh and Millions charts gently compress the scale (and say “not to scale”) so every block stays easy to see and grab — the smaller charts stay truthful · everything scales when you resize the widget.'),
      );
    },
  };

  // ---- Place value counters ----
  // The KS2 workhorse: same-size labelled counters from millions down to
  // thousandths on WRM-style place value charts. Where Dienes blocks SHOW size,
  // counters ASSERT place — the column gives a counter its meaning — which is
  // what unlocks the decimal charts and the ×10/÷10 slide ("the counters move,
  // the decimal point stays put"). Exchange works exactly as in Base 10: ten of
  // a kind glow a "10 ⇄ 1" chip and converge up; double-tap (or drop on a
  // lower column) breaks one into ten of the place below — across the decimal
  // point too, because one one IS ten tenths.
  // A place is its power of ten: d = −3 (thousandths) … 6 (millions), and every
  // total is kept in integer thousandths so 0.1 + 0.2 is 0.3, not 0.30000000004.
  const PV_MATS = [['plain', 'Plain'], ['to', 'T · O'], ['hto', 'H · T · O'], ['thto', 'Th · H · T · O'], ['m', 'Millions'], ['oth', 'O · t · h'], ['dec', 'Decimals']];
  const PV_COLS = { plain: [], to: [1, 0], hto: [2, 1, 0], thto: [3, 2, 1, 0], m: [6, 5, 4, 3, 2, 1, 0], oth: [0, -1, -2], dec: [2, 1, 0, -1, -2, -3] }; // chart columns, left → right
  const pvI = (d) => d + 3; // index into the tables below
  const PV_ONE = ['thousandth', 'hundredth', 'tenth', 'one', 'ten', 'hundred', 'thousand', 'ten thousand', 'hundred thousand', 'million'];
  const PV_MANY = ['thousandths', 'hundredths', 'tenths', 'ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands', 'millions'];
  const PV_HEAD = ['Thousandths', 'Hundredths', 'Tenths', 'Ones', 'Tens', 'Hundreds', 'Thousands', 'Ten thousands', 'Hundred thousands', 'Millions'];
  const PV_SHORT = ['th', 'h', 't', 'O', 'T', 'H', 'Th', 'TTh', 'HTh', 'M']; // WRM convention: lowercase for the decimal places
  const PV_TH = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000]; // counter value in thousandths
  const PV_LABEL = ['0.001', '0.01', '0.1', '1', '10', '100', '1,000', '10,000', '100,000', '1,000,000'];
  // [fill, rim, ink] per place — the classic rainbow ramp up the places
  // (red ones → violet millions, like the physical sets), pastels below one
  const PV_COL = [
    ['#cbd5e1', '#475569', '#1e293b'], // 0.001 grey
    ['#f8fafc', '#94a3b8', '#334155'], // 0.01 white
    ['#f9a8d4', '#be185d', '#831843'], // 0.1 pink
    ['#fca5a5', '#b91c1c', '#7f1d1d'], // 1 red
    ['#fdba74', '#c2410c', '#7c2d12'], // 10 orange
    ['#fde047', '#a16207', '#713f12'], // 100 yellow
    ['#86efac', '#15803d', '#14532d'], // 1,000 green
    ['#7dd3fc', '#0369a1', '#0c4a6e'], // 10,000 sky
    ['#a5b4fc', '#4338ca', '#312e81'], // 100,000 indigo
    ['#c4b5fd', '#6d28d9', '#4c1d95'], // 1,000,000 violet
  ];
  const PV_CAP = 24; // per place — room to overshoot ten, and to break a counter onto a busy column
  // build/random ranges per mat, in thousandths: [lo, hi, step]
  const PV_RANGE = {
    plain: [1100, 99900, 100], to: [11000, 99000, 1000], hto: [101000, 999000, 1000],
    thto: [1001000, 9999000, 1000], m: [100001000, 9999999000, 1000], oth: [110, 9990, 10], dec: [1001, 99999, 1],
  };
  const pvName = (d, n) => (n === 1 ? PV_ONE[pvI(d)] : PV_MANY[pvI(d)]);
  const pvCount = (items, d) => items.reduce((a, it) => a + (it.d === d ? 1 : 0), 0);
  const pvTotal = (items) => items.reduce((a, it) => a + PV_TH[pvI(it.d)], 0); // in thousandths
  // The sign belongs to the whole number, not to its fraction part: taking the
  // remainder with % keeps the minus, and −2.5 printed as "−3.−5".
  const pvFmt = (th) => {
    const t = Math.round(th);
    const a = Math.abs(t);
    const fr = String(a % 1000).padStart(3, '0').replace(/0+$/, '');
    return (t < 0 ? '−' : '') + Math.floor(a / 1000).toLocaleString('en-GB') + (fr ? '.' + fr : '');
  };
  // counter label markup + a font size that keeps it inside the circle
  const pvFace = (d, dia, frac) => {
    if (frac && d < 0) {
      const den = String(PV_TH[3] / PV_TH[pvI(d)]);
      return { html: `<span class="pv-fr"><b>1</b><i>${den}</i></span>`, fs: dia * Math.min(0.3, 1.05 / den.length) };
    }
    const lab = PV_LABEL[pvI(d)];
    return { html: lab, fs: dia * Math.min(0.46, 1.62 / lab.length) };
  };
  // the place that stops a chart switch: prefer the big offender (it dominates
  // the number the mat shows), else the small one hanging below the chart
  const pvMisfit = (items, mat) => {
    const cols = PV_COLS[mat] || [];
    const top = cols.length ? Math.max(...cols) : 3;
    const fits = (d) => (cols.length ? cols.includes(d) : d >= -2 && d <= 3); // plain mat: free play thousands … hundredths
    const off = items.map((it) => it.d).filter((d) => !fits(d));
    if (!off.length) return null;
    const hi = Math.max(...off);
    return hi > top ? hi : Math.min(...off);
  };

  WIDGETS.pvcounters = {
    title: 'Place value counters', icon: 'pvcounters', accent: '#a5b4fc', w: 760, h: 560,
    defaults: () => ({ items: [], mat: 'hto', val: true, masked: false, sent: false, covered: false, task: false, target: null, streak: 0, frac: false }),
    mount(body, w) {
      body.classList.add('mntray', 'pvwidget');
      const p = w.props;
      if (!Array.isArray(p.items)) p.items = [];
      for (const it of p.items) it.d = clamp(it.d | 0, -3, 6);
      let dragging = false;
      let animating = false; // mid-exchange or mid-slide: counters are moving, hands off
      let flashing = false;
      let zTop = 40;
      let flashT = null, exT = null;
      let binEl = null;
      let armed = 0; // plain mat: which counter a bare mat-tap adds (last tray piece touched)
      let lastTap = { id: null, t: 0 };
      let pillPop = false;
      let taskDone = false; // transient ✓ state — not saved, a reload re-poses the challenge
      let valWas = p.val !== false;
      const popIds = new Set();
      const els = new Map(); // item id -> element, for the exchange/slide animations

      const mat = el('div', { class: 'ct-mat dn-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const taskRow = el('div', { class: 'tclock-quick dn-taskrow' });
      const trayRow = el('div', { class: 'dn-tray' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, taskRow, trayRow, quick);

      const commit = () => { save(); paint(); };
      const colsOf = () => PV_COLS[p.mat] || [];
      const fitsMat = (d) => { const cols = colsOf(); return cols.length ? cols.includes(d) : d >= -2 && d <= 3; };

      // all geometry flows from the mat size: one diameter for every counter —
      // sameness of size is the whole point — so resizing scales the kit together
      function geom() {
        const W = mat.clientWidth || 600, H = mat.clientHeight || 360;
        const cols = colsOf();
        const g = { W, H, rects: [], head: 0 };
        if (cols.length) {
          const cw = W / cols.length;
          g.head = clamp(H * 0.12, 30, 46);
          g.dia = clamp(Math.min(cw / 2.75, (H - g.head) / 7.4), 17, 62);
          g.rects = cols.map((d, i) => ({ d, x: i * cw, y: g.head, w: cw, h: H - g.head }));
        } else {
          g.dia = clamp(Math.min(W, H) / 9, 20, 62);
        }
        return g;
      }

      // tidy layout inside a column: counters sit five-wise (subitisable rows);
      // when a column fills up the rows squeeze into an overlapping cascade
      function pvSlots(n, r, dia) {
        const gap = dia * 0.16;
        const padX = Math.max(5, dia * 0.18), padY = Math.max(6, dia * 0.24);
        const perRow = clamp(Math.floor((r.w - padX * 2 + gap) / (dia + gap)), 1, 5);
        const rows = Math.ceil(n / perRow);
        let rowH = dia + gap;
        const avail = r.h - padY * 2 - dia;
        if (rows > 1 && (rows - 1) * rowH > avail) rowH = Math.max(dia * 0.4, avail / (rows - 1));
        const x0 = r.x + (r.w - (perRow * (dia + gap) - gap)) / 2;
        const out = [];
        for (let i = 0; i < n; i++) {
          out.push([x0 + (i % perRow) * (dia + gap) + dia / 2, r.y + padY + Math.floor(i / perRow) * rowH + dia / 2]);
        }
        return out;
      }

      // free-play placement: each denomination gets its own drop zone so taps
      // don't pile new counters on top of each other
      function pvSpot(it, n) {
        it.x = clamp(0.09 + (3 - it.d) * 0.155 + (n % 3) * 0.04, 0.04, 0.94);
        it.y = clamp(0.14 + Math.floor(n / 3) * 0.1, 0.06, 0.82);
      }

      function placeNew(it) {
        if (!colsOf().length) pvSpot(it, pvCount(p.items, it.d) - 1);
      }

      function addPiece(d) {
        if (p.covered || animating) return;
        if (pvCount(p.items, d) >= PV_CAP) { toast(`That’s plenty of ${PV_MANY[pvI(d)]} — try exchanging ten of them!`); return; }
        const it = { id: uid(), d, x: 0.5, y: 0.5 };
        p.items.push(it);
        placeNew(it);
        popIds.add(it.id);
        commit();
      }

      // a ten-of-a-kind converges into one of the next place up — the exchange
      function exchange(d) {
        if (animating || p.covered || !fitsMat(d + 1)) return;
        if (pvCount(p.items, d) < 10) return;
        if (pvCount(p.items, d + 1) >= PV_CAP) { toast(`No room for another ${PV_ONE[pvI(d + 1)]} counter — clear a few first!`); return; }
        const g = geom();
        const ten = p.items.filter((it) => it.d === d).slice(0, 10);
        const rect = g.rects.find((c) => c.d === d + 1);
        let tx, ty;
        if (rect) { tx = rect.x + rect.w / 2; ty = rect.y + Math.min(rect.h * 0.3, 90); }
        else {
          tx = (ten.reduce((a, t) => a + t.x, 0) / 10) * g.W;
          ty = (ten.reduce((a, t) => a + t.y, 0) / 10) * g.H;
        }
        animating = true;
        for (const t of ten) {
          const elc = els.get(t.id);
          if (!elc) continue;
          elc.classList.add('dn-merge');
          elc.style.zIndex = ++zTop;
          elc.style.left = tx - elc.offsetWidth / 2 + 'px';
          elc.style.top = ty - elc.offsetHeight / 2 + 'px';
          elc.style.transform = 'scale(0.45)';
          elc.style.opacity = '0.3';
        }
        exT = setTimeout(() => {
          animating = false;
          const ids = new Set(ten.map((t) => t.id));
          p.items = p.items.filter((it) => !ids.has(it.id));
          const nu = { id: uid(), d: d + 1, x: clamp(tx / g.W, 0.03, 0.97), y: clamp(ty / g.H, 0.03, 0.97) };
          p.items.push(nu);
          popIds.add(nu.id);
          toast(`Ten ${PV_MANY[pvI(d)]} make one ${PV_ONE[pvI(d + 1)]}!`);
          commit();
        }, 360);
      }

      // ...and the inverse: one counter bursts into ten of the place below
      function breakApart(it) {
        const kid = it.d - 1;
        if (!fitsMat(kid)) { popIds.add(it.id); commit(); return; }
        if (pvCount(p.items, kid) + 10 > PV_CAP) { toast(`No room for ten more ${PV_MANY[pvI(kid)]} — exchange or clear some first!`); commit(); return; }
        const cx = it.x, cy = it.y;
        p.items = p.items.filter((x) => x !== it);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const nu = {
            id: uid(), d: kid,
            x: clamp(cx + Math.cos(a) * 0.07, 0.04, 0.94),
            y: clamp(cy + Math.sin(a) * 0.09, 0.06, 0.9),
          };
          p.items.push(nu);
          popIds.add(nu.id);
        }
        toast(`One ${PV_ONE[pvI(it.d)]} breaks into ten ${PV_MANY[pvI(kid)]}`);
        commit();
      }

      // the WRM decimals move: ×10 slides every counter one place to the left,
      // ÷10 one place to the right — the counters move, the point stays put
      function shiftAll(by) {
        if (animating || p.covered || !p.items.length) return;
        if (p.items.some((it) => !fitsMat(it.d + by))) {
          toast(by > 0 ? 'No room — the biggest counters would slide off the chart!' : 'No room — the smallest counters have no place to go!');
          return;
        }
        const g = geom();
        const chart = g.rects.length > 0;
        animating = true;
        for (const it of p.items) {
          it.d += by;
          const elc = els.get(it.id);
          const rect = g.rects.find((c) => c.d === it.d);
          if (!elc || !rect) continue;
          elc.classList.add('dn-merge');
          elc.style.zIndex = ++zTop;
          elc.style.left = rect.x + rect.w / 2 - elc.offsetWidth / 2 + 'px';
          elc.style.top = rect.y + Math.min(rect.h * 0.3, 90) - elc.offsetHeight / 2 + 'px';
        }
        exT = setTimeout(() => {
          animating = false;
          for (const it of p.items) popIds.add(it.id);
          toast(by > 0 ? '× 10 — every counter slides one place up!' : '÷ 10 — every counter slides one place down!');
          commit();
        }, chart ? 370 : 60);
      }

      function dragItem(elc, it, e0, isNew, fromTray) {
        e0.preventDefault();
        if (animating) return;
        const pid = e0.pointerId;
        const x0 = e0.clientX, y0 = e0.clientY;
        let moved = false;
        dragging = true;
        elc.style.zIndex = ++zTop;
        const g = geom();
        const isOut = (ev) => {
          const r = mat.getBoundingClientRect();
          return ev.clientX < r.left - 10 || ev.clientX > r.right + 10 || ev.clientY < r.top - 10 || ev.clientY > r.bottom + 10;
        };
        const overBin = (ev) => {
          if (!binEl) return false;
          const b = binEl.getBoundingClientRect();
          return ev.clientX >= b.left - 8 && ev.clientX <= b.right + 8 && ev.clientY >= b.top - 8 && ev.clientY <= b.bottom + 8;
        };
        const colAt = (ev) => {
          const r = mat.getBoundingClientRect();
          const x = ev.clientX - r.left;
          return g.rects.find((c) => x >= c.x && x < c.x + c.w) || null;
        };
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
          moved = true;
          elc.classList.add('ct-drag');
          mat.classList.add('ct-dragging');
          const r = mat.getBoundingClientRect();
          it.x = clamp((ev.clientX - r.left) / r.width, 0.02, 0.98);
          it.y = clamp((ev.clientY - r.top) / r.height, 0.02, 0.98);
          elc.style.left = it.x * g.W - g.dia / 2 + 'px';
          elc.style.top = it.y * g.H - g.dia / 2 + 'px';
          if (binEl) binEl.classList.toggle('hot', overBin(ev));
          elc.classList.toggle('ct-out', isOut(ev) || overBin(ev));
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          dragging = false;
          mat.classList.remove('ct-dragging');
          if (!moved) {
            if (fromTray) placeNew(it); // a tray tap lands in its home spot
            else if (!isNew) {
              // double-tap = break the counter apart
              const now = Date.now();
              if (lastTap.id === it.id && now - lastTap.t < 380) { lastTap = { id: null, t: 0 }; breakApart(it); return; }
              lastTap = { id: it.id, t: now };
            }
            popIds.add(it.id);
            commit();
            return;
          }
          if (ev.type !== 'pointercancel' && (isOut(ev) || overBin(ev))) { p.items = p.items.filter((x) => x !== it); commit(); return; }
          const c = colAt(ev);
          if (c && c.d !== it.d) {
            if (c.d < it.d) { breakApart(it); return; } // dropped below its place: break it up
            toast(`Ten ${PV_MANY[pvI(it.d)]} make one ${PV_ONE[pvI(it.d + 1)]} — collect ten, then exchange!`);
          }
          commit(); // repaint snaps everything back into its tidy slot
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      // plain mat: a bare tap drops the armed counter right under the finger
      mat.addEventListener('pointerdown', (e) => {
        if (e.target !== mat || p.covered || animating || colsOf().length) return;
        if (pvCount(p.items, armed) >= PV_CAP) { toast(`That’s plenty of ${PV_MANY[pvI(armed)]} — try exchanging ten of them!`); return; }
        const r = mat.getBoundingClientRect();
        const it = {
          id: uid(), d: armed,
          x: clamp((e.clientX - r.left) / r.width, 0.02, 0.98),
          y: clamp((e.clientY - r.top) / r.height, 0.02, 0.98),
        };
        p.items.push(it);
        const elc = mountCounter(it, geom());
        dragItem(elc, it, e, true, false);
      });

      function trayDrag(d, e0) {
        if (p.covered || animating) return;
        armed = d;
        if (pvCount(p.items, d) >= PV_CAP) { toast(`That’s plenty of ${PV_MANY[pvI(d)]} — try exchanging ten of them!`); paintTray(); return; }
        const g = geom();
        const it = { id: uid(), d, x: 0.5, y: 0.88 };
        p.items.push(it);
        const elc = mountCounter(it, g);
        dragItem(elc, it, e0, true, true);
      }

      function mountCounter(it, g, pos) {
        const i = pvI(it.d);
        const [bg, rim, ink] = PV_COL[i];
        const { html, fs } = pvFace(it.d, g.dia, p.frac);
        const [x, y] = pos || [it.x * g.W, it.y * g.H];
        const elc = el('button', {
          class: 'pv-c' + (popIds.has(it.id) ? ' bm-pop' : ''),
          style: `width:${g.dia}px;height:${g.dia}px;left:${x - g.dia / 2}px;top:${y - g.dia / 2}px;`
            + `background:${bg};border-color:${rim};color:${ink};font-size:${fs}px;`,
          title: fitsMat(it.d - 1) ? `Drag to move — double-tap to break into ten ${PV_MANY[i - 1]}` : 'Drag to move — drop on the bin to remove',
          html,
        });
        elc.addEventListener('pointerdown', (e) => { if (!p.covered && !animating) dragItem(elc, it, e, false, false); });
        els.set(it.id, elc);
        mat.append(elc);
        return elc;
      }

      function paint() {
        mat.innerHTML = '';
        els.clear();
        const g = geom();
        const cols = colsOf();
        const chart = g.rects.length > 0;
        for (const c of g.rects) {
          const n = pvCount(p.items, c.d);
          const colEl = el('div', { class: 'dn-col', style: `left:${c.x}px;width:${c.w}px;height:${g.H}px;` });
          const head = el('div', { class: 'dn-head', style: `height:${g.head}px;font-size:${clamp(g.head * 0.42, 12, 19)}px;` },
            el('span', { class: 'dn-hlabel' }, c.w > 128 ? PV_HEAD[pvI(c.d)] : PV_SHORT[pvI(c.d)]),
            n ? el('span', { class: 'dn-count' + (n >= 10 ? ' hot' : '') }, String(n)) : null,
            n >= 10 && cols.includes(c.d + 1) ? el('button', {
              class: 'dn-xchip', title: `Exchange ten ${PV_MANY[pvI(c.d)]} for one ${PV_ONE[pvI(c.d + 1)]}`,
              onpointerdown: (e) => e.stopPropagation(),
              onclick: () => exchange(c.d),
            }, '10 ⇄ 1') : null,
          );
          colEl.append(head);
          colEl.addEventListener('pointerdown', (e) => { if (e.target === colEl) addPiece(c.d); });
          mat.append(colEl);
        }
        // the decimal point sits on the header line between the ones and tenths
        const iO = cols.indexOf(0);
        if (iO >= 0 && cols[iO + 1] === -1) {
          const dp = clamp(g.head * 0.42, 13, 20);
          mat.append(el('div', {
            class: 'pv-dp',
            style: `left:${(iO + 1) * (g.W / cols.length) - dp / 2}px;top:${g.head - dp / 2 - 1.5}px;width:${dp}px;height:${dp}px;`,
          }));
        }
        if (!chart) {
          const chips = [];
          for (let d = -2; d <= 2; d++) {
            if (pvCount(p.items, d) >= 10 && fitsMat(d + 1)) {
              chips.push(el('button', {
                class: 'dn-xchip', title: 'Exchange up',
                onclick: () => exchange(d),
              }, `10 ${PV_MANY[pvI(d)]} ⇄ 1 ${PV_ONE[pvI(d + 1)]}`));
            }
          }
          if (chips.length && !p.covered) mat.append(el('div', { class: 'dn-chips' }, chips));
        }
        binEl = el('div', { class: 'ct-bin', title: 'Drag a counter here to bin it' }, '🗑');
        mat.append(binEl);
        if (chart) {
          for (const c of g.rects) {
            const list = p.items.filter((it) => it.d === c.d);
            const pts = pvSlots(list.length, c, g.dia);
            list.forEach((it, i) => {
              it.x = pts[i][0] / g.W; // keep coords honest so switching to the plain mat holds the layout
              it.y = pts[i][1] / g.H;
              mountCounter(it, g, pts[i]);
            });
          }
        } else {
          for (const it of p.items) mountCounter(it, g);
        }
        if (p.covered) mat.append(el('div', { class: 'ct-blind' }, '?'));
        else if (!p.items.length) mat.append(el('div', { class: 'bm-empty ct-hint' }, chart ? 'Tap a column to add its counter — or drag one in from the tray' : 'Tap the mat to add counters — the tray picks which kind'));
        popIds.clear();
        paintSent();
        paintTask();
        paintTray();
        paintQuick();
      }

      // stem sentence, expanded form, then any live exchange facts
      function sentences() {
        if (!p.items.length) return [];
        const c = {};
        for (let d = -3; d <= 6; d++) c[d] = pvCount(p.items, d);
        const out = [];
        const order = colsOf().length ? colsOf() : [6, 5, 4, 3, 2, 1, 0, -1, -2, -3].filter((d) => c[d]);
        const nz = order.filter((d) => c[d]);
        if (nz.length) {
          const hi = Math.max(...nz);
          // small charts spell out "0 tens" (zero as a place holder); on the
          // five-plus-column charts the stem trims zeros to stay readable
          const parts = order.filter((d) => d <= hi && (c[d] || order.length <= 4)).map((d) => `${c[d]} ${pvName(d, c[d])}`);
          out.push(parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]);
          const terms = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3].filter((d) => c[d]).map((d) => pvFmt(c[d] * PV_TH[pvI(d)]));
          // the sentences are the scaffold, so a masked value pill doesn't hide
          // them — the expanded form just holds its answer back until the reveal
          if (terms.length > 1) out.push(`${terms.join(' + ')} = ${p.val && p.masked ? '?' : pvFmt(pvTotal(p.items))}`);
        }
        for (let d = -3; d < 6; d++) {
          if (c[d] >= 10) {
            const q = Math.floor(c[d] / 10), r = c[d] % 10;
            out.push(`${c[d]} ${PV_MANY[pvI(d)]} = ${q} ${pvName(d + 1, q)}${r ? ` and ${r} ${pvName(d, r)}` : ''}`);
          }
        }
        return out.slice(0, 4);
      }

      function paintSent() {
        sent.innerHTML = '';
        sent.style.display = p.sent ? '' : 'none';
        if (!p.sent) return;
        const list = p.covered || flashing ? [] : sentences();
        if (!list.length) {
          sent.append(el('span', { class: 'bm-fact', style: 'visibility:hidden;' }, '0 + 0 = 0'));
          return;
        }
        for (const s of list) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      function newTarget() {
        const [lo, hi, step] = PV_RANGE[p.mat] || PV_RANGE.plain;
        let t = p.target;
        for (let i = 0; i < 9 && (t == null || t === p.target); i++) t = lo + Math.floor(Math.random() * ((hi - lo) / step + 1)) * step;
        p.target = t; // stored in thousandths — decimal targets stay exact
      }

      function checkTask() {
        if (taskDone) return;
        if (pvTotal(p.items) === p.target) {
          taskDone = true;
          p.streak = (p.streak || 0) + 1;
          const messy = p.items.some((it) => pvCount(p.items, it.d) >= 10);
          toast(messy ? 'Correct! Now exchange to show it the tidy way.' : DN_PRAISE[p.streak % DN_PRAISE.length]);
        } else {
          toast('Not yet — count each column carefully and keep building!');
        }
        commit();
      }

      function setTask(on) {
        p.task = on;
        if (on) {
          newTarget();
          taskDone = false;
          valWas = p.val; // the value pill would give the game away
          p.val = false;
        } else {
          p.val = valWas;
          taskDone = false;
        }
        commit();
      }

      function randomNumber() {
        const [lo, hi, step] = PV_RANGE[p.mat] || PV_RANGE.plain;
        const n = lo + Math.floor(Math.random() * ((hi - lo) / step + 1)) * step;
        p.items = [];
        for (let d = 6; d >= -3; d--) {
          const q = Math.floor(n / PV_TH[pvI(d)]) % 10;
          for (let i = 0; i < q; i++) p.items.push({ id: uid(), d, x: 0.5, y: 0.5 });
        }
        if (!colsOf().length) {
          const seen = Array(10).fill(0);
          for (const it of p.items) pvSpot(it, seen[pvI(it.d)]++);
        }
        if (p.val) p.masked = true; // counters first, number on reveal
        taskDone = false;
        toast('What number does the chart show?');
        commit();
      }

      function flash() {
        clearTimeout(flashT);
        flashing = true;
        p.covered = false;
        paint();
        flashT = setTimeout(() => { flashing = false; p.covered = true; commit(); }, 2000);
      }

      function paintTask() {
        taskRow.innerHTML = '';
        taskRow.style.display = p.task && p.target != null ? '' : 'none';
        if (!p.task || p.target == null) return;
        taskRow.append(...[
          el('span', { class: 'dn-goal' + (taskDone ? ' done' : '') }, taskDone ? `✓ ${pvFmt(p.target)}` : `Build ${pvFmt(p.target)}`),
          el('button', { class: 'tq-btn', title: 'Check the chart against the target', onclick: checkTask }, 'Check'),
          el('button', {
            class: 'tq-btn', title: 'Clear the chart and set a new target',
            onclick: () => { p.items = []; taskDone = false; newTarget(); commit(); },
          }, 'New number'),
          p.streak > 0 ? el('span', { class: 'dn-streak' }, `⭐ ${p.streak}`) : null,
        ].filter(Boolean));
      }

      function paintTray() {
        trayRow.innerHTML = '';
        const chart = colsOf().length > 0;
        const ds = chart ? colsOf() : [3, 2, 1, 0, -1, -2];
        for (const d of ds) {
          const [bg, rim, ink] = PV_COL[pvI(d)];
          const { html, fs } = pvFace(d, 44, p.frac);
          const b = el('button', {
            class: 'dn-tpc' + (!chart && armed === d ? ' active' : ''),
            title: chart ? `Add a ${PV_ONE[pvI(d)]} counter to its column — or drag it in` : `Add a ${PV_ONE[pvI(d)]} counter — mat taps now add these too`,
          },
            el('span', { class: 'pv-tc', style: `background:${bg};border-color:${rim};color:${ink};font-size:${fs}px;`, html }),
            el('span', { class: 'dn-tval' }, PV_SHORT[pvI(d)]),
          );
          b.addEventListener('pointerdown', (e) => trayDrag(d, e));
          trayRow.append(b);
        }
        if (p.val) {
          const hide = p.masked || p.covered || flashing;
          trayRow.append(el('button', {
            class: 'dn-value' + (hide ? ' masked' : '') + (pillPop ? ' bm-pop' : ''),
            title: 'Tap to hide or reveal the number',
            onclick: () => { p.masked = !p.masked; pillPop = !p.masked; save(); paint(); },
          }, hide ? '?' : pvFmt(pvTotal(p.items))));
          pillPop = false;
        }
      }

      function paintQuick() {
        quick.innerHTML = '';
        const tq = (label, title, active, fn) => el('button', { class: 'tq-btn' + (active ? ' active' : ''), title, onclick: fn }, label);
        quick.append(
          el('span', { class: 'tq-step ft-seg' }, ...PV_MATS.map(([id, label]) => el('button', {
            class: 'tq-btn' + (p.mat === id ? ' active' : ''),
            title: 'Switch the chart',
            onclick: () => {
              if (p.mat === id) return;
              const bad = pvMisfit(p.items, id);
              if (bad != null) { toast(`The ${label} chart has no ${PV_MANY[pvI(bad)]} column — exchange or clear them first`); return; }
              p.mat = id;
              if (p.task) { newTarget(); taskDone = false; } // a target must be buildable on the new chart
              commit();
            },
          }, label))),
          tq('× 10', 'Slide every counter one place up — ten times bigger', false, () => shiftAll(1)),
          tq('÷ 10', 'Slide every counter one place down — ten times smaller', false, () => shiftAll(-1)),
          tq('Value', 'Show the number the counters make', p.val, () => { p.val = !p.val; valWas = p.val; commit(); }),
          tq('Facts', 'Show the number sentences under the chart', p.sent, () => { p.sent = !p.sent; commit(); }),
          tq('Flash', 'Show the counters for two seconds, then hide them', false, flash),
          tq('Cover', 'Hide the chart behind a cover', p.covered, () => { clearTimeout(flashT); flashing = false; p.covered = !p.covered; commit(); }),
          tq('Build', 'Challenge: build a target number', p.task, () => setTask(!p.task)),
          tq('Random', 'Scatter a random number onto the chart', false, randomNumber),
          tq('Clear', 'Take every counter off the chart', false, () => { p.items = []; taskDone = false; commit(); }),
        );
      }

      if (p.task && p.target == null) newTarget();
      const ro = new ResizeObserver(() => { if (!dragging && !animating) paint(); });
      ro.observe(mat);
      paint();
      return () => { ro.disconnect(); clearTimeout(flashT); clearTimeout(exT); };
    },
    settings(box, w, api) {
      const preset = (label, make) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, make()); api.refresh(); },
      }, label);
      const mk = (d, n) => Array.from({ length: n }, () => ({ id: uid(), d, x: 0.5, y: 0.5 }));
      const mkNum = (th) => {
        const items = [];
        for (let d = 6; d >= -3; d--) {
          const q = Math.floor(th / PV_TH[pvI(d)]) % 10;
          for (let i = 0; i < q; i++) items.push({ id: uid(), d, x: 0.5, y: 0.5 });
        }
        return items;
      };
      const base = { val: true, masked: false, sent: false, covered: false, task: false };
      box.append(
        el('div', { class: 'hint' }, 'Start from a chart:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('Tens and ones: 34', () => ({ ...base, mat: 'to', items: mkNum(34000), sent: true })),
          preset('Exchange 14 ones', () => ({ ...base, mat: 'to', items: mk(0, 14), val: false, sent: true })),
          preset('Three digits: 245', () => ({ ...base, mat: 'hto', items: mkNum(245000), masked: true })),
          preset('Decimals: 3.45', () => ({ ...base, mat: 'oth', items: mkNum(3450), masked: true, sent: true })),
          preset('Exchange 12 tenths', () => ({ ...base, mat: 'oth', items: [...mk(0, 2), ...mk(-1, 12)], val: false, sent: true })),
          preset('× 10 with 0.34', () => ({ ...base, mat: 'oth', items: mkNum(340), sent: true })),
          preset('Millions: 2,417,306', () => ({ ...base, mat: 'm', items: mkNum(2417306000), masked: true, sent: true })),
          preset('Build-it challenge', () => ({ ...base, mat: 'hto', items: [], val: false, task: true, target: null })),
        ),
        settingRow('Chart', selectInput(PV_MATS, w.props.mat || 'hto', (v) => {
          const bad = pvMisfit(w.props.items || [], v);
          if (bad != null) { toast(`That chart has no ${PV_MANY[pvI(bad)]} column — exchange or clear them first`); return; }
          w.props.mat = v;
          if (w.props.task) w.props.target = null; // remount rolls a target that fits the new chart
          api.refresh();
        })),
        checkRow('Show the number (value pill)', w.props.val !== false, (v) => { w.props.val = v; api.refresh(); }),
        checkRow('Number sentences under the chart', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        checkRow('Fraction labels on decimal counters (1/10)', w.props.frac, (v) => { w.props.frac = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Tap a chart column (or the tray) to add counters · drag to move — drop on the bin or off the mat to remove · when a place collects ten, its count glows: tap the “10 ⇄ 1” chip and they exchange into one of the next place — across the decimal point too · drag a counter onto a lower column, or double-tap it, to break it into ten · “× 10” and “÷ 10” slide every counter one place along the chart — the counters move, the decimal point stays put · “Build” poses a target number; “Random” scatters a mystery number to read · tap the big number to mask it behind a “?” — the sentences stay as a scaffold and hold back the answer (“… = ?”) until you reveal · everything scales when you resize the widget.'),
      );
    },
  };

  // ---- Rekenrek ----
  // WRM's flagship early-number tool (their 1-Minute Maths app is built on
  // it): rows of ten beads — five red, five white — sliding on a rod. Beads
  // rest on the right; a number is SHOWN by pushing beads left, ideally in one
  // push. So a tap does the whole push: tapping a resting bead brings it and
  // every bead before it across, tapping a shown bead sends it and everything
  // after it home. Dragging feels like the real thing — the bead follows the
  // finger and the rest of the row glides along as it crosses the middle.
  const RK_SIZES = [['1', '10'], ['2', '20'], ['10', '100']]; // rows -> bead count label
  const RK_RANGE = { 1: [1, 10], 2: [1, 20], 10: [10, 100] };

  WIDGETS.rekenrek = {
    title: 'Rekenrek', icon: 'rekenrek', accent: '#fda4af', w: 640, h: 400,
    defaults: () => ({ rows: 2, left: [0, 0], val: true, masked: false, sent: false, covered: false, task: false, target: null, streak: 0 }),
    mount(body, w) {
      body.classList.add('mntray', 'rkwidget');
      const p = w.props;
      p.rows = [1, 2, 10].includes(p.rows | 0) ? p.rows | 0 : 2;
      if (!Array.isArray(p.left)) p.left = [];
      while (p.left.length < p.rows) p.left.push(0);
      p.left = p.left.slice(0, p.rows).map((n) => clamp(n | 0, 0, 10));
      let dragging = false;
      let flashing = false;
      let flashT = null;
      let pillPop = false;
      let taskDone = false; // transient ✓ state — not saved, a reload re-poses the challenge
      let valWas = p.val !== false;
      let els = []; // els[row][bead] — live handles so a drag can glide the rest of the row

      const mat = el('div', { class: 'ct-mat rk-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const taskRow = el('div', { class: 'tclock-quick dn-taskrow' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, taskRow, quick);

      const commit = () => { save(); paint(); };
      const cap = () => p.rows * 10;
      const total = () => p.left.reduce((a, n) => a + n, 0);

      function geom() {
        const W = mat.clientWidth || 560, H = mat.clientHeight || 300;
        const padY = clamp(H * 0.07, 6, 24);
        const rowH = (H - padY * 2) / p.rows;
        return {
          W, H, padY, rowH,
          dia: clamp(Math.min(rowH * 0.8, W / 13.6), 9, 56),
          padX: clamp(W * 0.04, 8, 26),
        };
      }

      // bead centres: the shown cluster packs from the left edge, the resting
      // cluster packs from the right — the gap in the middle is the "read" zone
      const slot = (j, n, g) => (j < n
        ? g.padX + g.dia / 2 + j * g.dia * 1.03
        : g.W - g.padX - g.dia / 2 - (9 - j) * g.dia * 1.03);
      const rowY = (r, g) => g.padY + g.rowH * (r + 0.5);

      function applyRow(r, g, skipJ) {
        els[r].forEach((b, j) => {
          if (j === skipJ) return;
          b.style.left = slot(j, p.left[r], g) - g.dia / 2 + 'px';
        });
      }

      function dragBead(elc, r, j, e0) {
        if (p.covered || flashing) return;
        e0.preventDefault();
        const pid = e0.pointerId;
        const x0 = e0.clientX;
        let moved = false;
        dragging = true;
        const g = geom();
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.abs(ev.clientX - x0) < 7) return;
          moved = true;
          elc.classList.add('rk-drag');
          const rct = mat.getBoundingClientRect();
          const x = clamp(ev.clientX - rct.left, g.padX + g.dia / 2, g.W - g.padX - g.dia / 2);
          elc.style.left = x - g.dia / 2 + 'px';
          // crossing the middle carries the in-between beads along
          const want = x < g.W / 2 ? j + 1 : j;
          if (want !== p.left[r]) { p.left[r] = want; applyRow(r, g, j); }
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          dragging = false;
          // a plain tap pushes the bead and its companions across (or home)
          if (!moved) p.left[r] = j < p.left[r] ? j : j + 1;
          commit();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      function paint() {
        mat.innerHTML = '';
        els = [];
        const g = geom();
        for (let r = 0; r < p.rows; r++) {
          const y = rowY(r, g);
          mat.append(el('div', { class: 'rk-rod', style: `top:${y - 3}px;` }));
          els.push([]);
          for (let j = 0; j < 10; j++) {
            const b = el('button', {
              class: 'rk-bead ' + (j < 5 ? 'rk-red' : 'rk-white'),
              style: `width:${g.dia}px;height:${g.dia}px;left:${slot(j, p.left[r], g) - g.dia / 2}px;top:${y - g.dia / 2}px;`,
              title: 'Tap or slide — a bead brings every bead before it across',
            });
            b.addEventListener('pointerdown', (e) => dragBead(b, r, j, e));
            els[r].push(b);
            mat.append(b);
          }
        }
        if (p.covered) mat.append(el('div', { class: 'ct-blind' }, '?'));
        else if (!total()) mat.append(el('div', { class: 'bm-empty ct-hint' }, 'Slide beads to the left — or tap one: it brings every bead before it'));
        paintSent();
        paintTask();
        paintQuick();
      }

      function sentences() {
        const t = total();
        if (!t) return [];
        const out = [];
        if (p.rows === 1) {
          out.push(`${t} + ${10 - t} = 10`);
        } else if (p.rows === 2) {
          const [a, b] = p.left;
          if (a && b) {
            out.push(`${a} + ${b} = ${t}`);
            if (a !== b) out.push(`${b} + ${a} = ${t}`);
            else out.push(`Double ${a} is ${t}`);
          }
          if (t < 20) out.push(`${t} + ${20 - t} = 20`);
        } else {
          // read tens/ones off the total, not which rows happen to be exactly
          // full — beads scattered across rows (the common case) still add up
          const tens = Math.floor(t / 10), ones = t % 10;
          if (tens) out.push(ones ? `${tens} tens and ${ones} more make ${t}` : `${tens} tens make ${t}`);
        }
        return out.slice(0, 4);
      }

      function paintSent() {
        sent.innerHTML = '';
        sent.style.display = p.sent ? '' : 'none';
        if (!p.sent) return;
        const list = p.covered || flashing ? [] : sentences();
        if (!list.length) {
          sent.append(el('span', { class: 'bm-fact', style: 'visibility:hidden;' }, '0 + 0 = 0'));
          return;
        }
        for (const s of list) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      function newTarget() {
        const [lo, hi] = RK_RANGE[p.rows];
        let t = p.target;
        for (let i = 0; i < 9 && (t == null || t === p.target); i++) t = lo + Math.floor(Math.random() * (hi - lo + 1));
        p.target = t;
      }

      function checkTask() {
        if (taskDone) return;
        if (total() === p.target) {
          taskDone = true;
          p.streak = (p.streak || 0) + 1;
          toast(DN_PRAISE[p.streak % DN_PRAISE.length]);
        } else {
          toast('Not yet — count the beads on the left and keep going!');
        }
        commit();
      }

      function setTask(on) {
        p.task = on;
        if (on) {
          newTarget();
          taskDone = false;
          valWas = p.val; // the value pill would give the game away
          p.val = false;
        } else {
          p.val = valWas;
          taskDone = false;
        }
        commit();
      }

      function randomNumber() {
        const t = 1 + Math.floor(Math.random() * cap());
        let rem = t;
        p.left = [];
        for (let r = 0; r < p.rows; r++) {
          const after = 10 * (p.rows - r - 1);
          const lo = Math.max(0, rem - after), hi = Math.min(10, rem);
          const v = lo + Math.floor(Math.random() * (hi - lo + 1));
          p.left.push(v);
          rem -= v;
        }
        if (p.val) p.masked = true; // beads first, number on reveal
        taskDone = false;
        toast('How many beads do you see?');
        commit();
      }

      function flash() {
        clearTimeout(flashT);
        flashing = true;
        p.covered = false;
        paint();
        flashT = setTimeout(() => { flashing = false; p.covered = true; commit(); }, 2000);
      }

      function paintTask() {
        taskRow.innerHTML = '';
        taskRow.style.display = p.task && p.target != null ? '' : 'none';
        if (!p.task || p.target == null) return;
        taskRow.append(...[
          el('span', { class: 'dn-goal' + (taskDone ? ' done' : '') }, taskDone ? `✓ ${p.target}` : `Show ${p.target}`),
          el('button', { class: 'tq-btn', title: 'Check the rack against the target', onclick: checkTask }, 'Check'),
          el('button', {
            class: 'tq-btn', title: 'Send the beads home and set a new target',
            onclick: () => { p.left = p.left.map(() => 0); taskDone = false; newTarget(); commit(); },
          }, 'New number'),
          p.streak > 0 ? el('span', { class: 'dn-streak' }, `⭐ ${p.streak}`) : null,
        ].filter(Boolean));
      }

      function paintQuick() {
        quick.innerHTML = '';
        const tq = (label, title, active, fn) => el('button', { class: 'tq-btn' + (active ? ' active' : ''), title, onclick: fn }, label);
        quick.append(
          el('span', { class: 'tq-step ft-seg' }, ...RK_SIZES.map(([rows, label]) => el('button', {
            class: 'tq-btn' + (p.rows === +rows ? ' active' : ''),
            title: `Rekenrek ${label} — ${rows} row${rows === '1' ? '' : 's'} of ten`,
            onclick: () => {
              if (p.rows === +rows) return;
              p.rows = +rows;
              p.left = Array(p.rows).fill(0);
              if (p.task) { newTarget(); taskDone = false; }
              commit();
            },
          }, label))),
          tq('Value', 'Show how many beads are across', p.val, () => { p.val = !p.val; valWas = p.val; commit(); }),
          tq('Facts', 'Show the number sentences under the rack', p.sent, () => { p.sent = !p.sent; commit(); }),
          tq('Flash', 'Show the beads for two seconds, then hide them', false, flash),
          tq('Cover', 'Hide the rack behind a cover', p.covered, () => { clearTimeout(flashT); flashing = false; p.covered = !p.covered; commit(); }),
          tq('Build', 'Challenge: show a target number', p.task, () => setTask(!p.task)),
          tq('Random', 'Push a mystery number across', false, randomNumber),
          tq('Clear', 'Send every bead back to the start side', false, () => { p.left = p.left.map(() => 0); taskDone = false; commit(); }),
        );
        if (p.val) {
          const hide = p.masked || p.covered || flashing;
          quick.append(el('button', {
            class: 'dn-value' + (hide ? ' masked' : '') + (pillPop ? ' bm-pop' : ''),
            title: 'Tap to hide or reveal the number',
            onclick: () => { p.masked = !p.masked; pillPop = !p.masked; save(); paint(); },
          }, hide ? '?' : String(total())));
          pillPop = false;
        }
      }

      if (p.task && p.target == null) newTarget();
      const ro = new ResizeObserver(() => { if (!dragging) paint(); });
      ro.observe(mat);
      paint();
      return () => { ro.disconnect(); clearTimeout(flashT); };
    },
    settings(box, w, api) {
      const preset = (label, make) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, make()); api.refresh(); },
      }, label);
      const base = { val: true, masked: false, sent: false, covered: false, task: false };
      box.append(
        el('div', { class: 'hint' }, 'Start from a rack:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('Show 7 in one push', () => ({ ...base, rows: 2, left: [7, 0], sent: true })),
          preset('Doubles: 4 + 4', () => ({ ...base, rows: 2, left: [4, 4], sent: true })),
          preset('Bridge ten: 8 + 5', () => ({ ...base, rows: 2, left: [8, 5], val: false, sent: true })),
          preset('Make 10 (one row)', () => ({ ...base, rows: 1, left: [6], val: false, sent: true })),
          preset('Subitise: flash 6', () => ({ ...base, rows: 2, left: [5, 1], masked: true, covered: true })),
          preset('Rekenrek 100', () => ({ ...base, rows: 10, left: Array(10).fill(0), sent: true })),
          preset('Build-it challenge', () => ({ ...base, rows: 2, left: [0, 0], val: false, task: true, target: null })),
        ),
        settingRow('Rack', selectInput([['1', 'Rekenrek 10 — one row'], ['2', 'Rekenrek 20 — two rows'], ['10', 'Rekenrek 100 — ten rows']], String(w.props.rows || 2), (v) => {
          w.props.rows = +v;
          w.props.left = Array(+v).fill(0);
          if (w.props.task) w.props.target = null;
          api.refresh();
        })),
        checkRow('Show the number (value pill)', w.props.val !== false, (v) => { w.props.val = v; api.refresh(); }),
        checkRow('Number sentences under the rack', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Beads rest on the right; push them left to show a number — five red then five white on every row, so the fives structure does the counting · tap a resting bead and it brings every bead before it across in one push; tap a shown bead and it takes everything after it home · drag if you’d rather slide · “Flash” shows the beads for two seconds (subitising), “Build” poses a target, “Random” pushes a mystery number · the whole rack scales when you resize the widget.'),
      );
    },
  };

  // ---- Number line ----
  // The missing piece next to the frame-tiles line: a proper flexible number
  // line — marked scales from 0–10 up to 0–1,000, decimal and fraction lines,
  // negatives, or a completely blank "empty number line". Press on the line
  // and drag to DRAW A JUMP (the empty-line calculation strategy): an arc with
  // an automatic "+10"-style label on marked lines, or a tap-to-edit label on
  // blank ones. A tap drops a landing dot (marked) or an editable mark
  // (blank). Everything stores line-relative, so the widget resizes freely.
  const NL_QUICK = [
    ['blank', 'Blank', { blank: true }],
    ['t10', '0–10', { blank: false, min: 0, max: 10, den: 1, major: 1, minor: 0 }],
    ['t20', '0–20', { blank: false, min: 0, max: 20, den: 1, major: 1, minor: 0 }],
    ['h', '0–100', { blank: false, min: 0, max: 100, den: 1, major: 10, minor: 10 }],
    ['u1', '0–1', { blank: false, min: 0, max: 10, den: 10, major: 1, minor: 0, frac: false }],
    ['pm', '−10–10', { blank: false, min: -10, max: 10, den: 1, major: 1, minor: 0 }],
  ];
  // denominators whose units land exactly on thousandths — safe to show as decimals
  const NL_DEC = [2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 125, 200, 250, 500, 1000];

  WIDGETS.numberline = {
    title: 'Number line', icon: 'numberline', accent: '#86efac', w: 820, h: 300,
    defaults: () => ({ preset: 't20', blank: false, min: 0, max: 20, den: 1, major: 1, minor: 0, labels: 'all', frac: false, sent: false, jumps: [], marks: [] }),
    mount(body, w) {
      const p = w.props;
      body.classList.add('mntray', 'nlwidget');
      if (!Array.isArray(p.jumps)) p.jumps = [];
      if (!Array.isArray(p.marks)) p.marks = [];
      let drawing = false;
      let edEl = null; // the floating label editor, if open

      const mat = el('div', { class: 'ct-mat nl-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, quick);

      const commit = () => { save(); paint(); };
      const range = () => p.max - p.min;
      const snapStep = () => (p.minor ? p.major / p.minor : p.major);

      function geom() {
        const W = mat.clientWidth || 700, H = mat.clientHeight || 200;
        const padL = clamp(W * 0.05, 26, 60);
        return { W, H, padL, padR: padL, iw: W - padL * 2, lineY: H * 0.58, fs: clamp(H * 0.085, 12, 20) };
      }
      const xOf = (f, g) => g.padL + f * g.iw;
      const fAt = (ev, g) => {
        const r = mat.getBoundingClientRect();
        return clamp((ev.clientX - r.left - g.padL) / g.iw, 0, 1);
      };
      const snapV = (f) => {
        const s = snapStep();
        return clamp(Math.round((p.min + f * range()) / s) * s, p.min, p.max);
      };
      const fOf = (v) => (v - p.min) / range();

      // The denominator a fraction label has to be written in: not the line's
      // den, but the smallest unit the line actually shows. Minor ticks
      // subdivide each step, so a Halves line ticked into halves is a line of
      // quarters — and a quarter jump on it used to round its way to "+1/2",
      // which is the wrong fraction on a classroom screen.
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      function nlUnit() {
        if (!p.minor) return p.den;
        const d = p.den * p.minor;
        return d / (gcd(Math.abs(p.major) || 1, d) || 1);
      }
      // exact label text: integers with thousands grouping, decimals via the
      // thousandths formatter (no float drift), fractions as mixed numbers
      function nlParts(av) {
        const den = nlUnit();
        const n = Math.round((av * den) / p.den); // whole number of line units
        const wh = Math.floor(n / den);
        return { den, wh, rem: n - wh * den };
      }
      function nlTxt(v) {
        if (p.den === 1) return Number.isInteger(v) ? dnFmt(v) : pvFmt(Math.round(v * 1000));
        const neg = v < 0 ? '−' : '';
        const av = Math.abs(v);
        if (!p.frac && NL_DEC.includes(p.den)) return neg + pvFmt(Math.round(av * 1000 / p.den));
        const { den, wh, rem } = nlParts(av);
        return neg + (rem ? (wh ? `${wh} ` : '') + `${rem}/${den}` : dnFmt(wh));
      }
      function nlHTML(v) {
        if (p.den === 1 || (!p.frac && NL_DEC.includes(p.den))) return nlTxt(v);
        const neg = v < 0 ? '−' : '';
        const { den, wh, rem } = nlParts(Math.abs(v));
        if (!rem) return neg + dnFmt(wh);
        return `${neg}${wh ? wh + ' ' : ''}<span class="pv-fr"><b>${rem}</b><i>${den}</i></span>`;
      }

      const jumpAuto = (j) => (j.va == null || j.vb == null ? '' : (j.vb >= j.va ? '+' : '−') + nlHTML(Math.abs(j.vb - j.va)));

      function closeEd() { if (edEl) { edEl.remove(); edEl = null; } }

      // the floating label editor: type and Enter (or click away) to save,
      // ✕ to delete the jump or mark it belongs to
      function openEd(obj, arr, x, y, current) {
        closeEd();
        const input = el('input', { value: current, onkeydown: (e) => { if (e.key === 'Enter') done(); } });
        const done = () => { obj.t = input.value.trim() || null; commit(); };
        edEl = el('div', { class: 'nl-ed', style: `left:${x}px;top:${y}px;`, onpointerdown: (e) => e.stopPropagation() },
          input,
          el('button', { title: 'Remove', onpointerdown: (e) => { e.stopPropagation(); e.preventDefault(); const i = arr.indexOf(obj); if (i >= 0) arr.splice(i, 1); commit(); } }, '✕'),
        );
        input.addEventListener('blur', () => { if (edEl) done(); });
        mat.append(edEl);
        input.focus();
        input.select();
      }

      // one quadratic arc per jump, arrowhead at the landing end
      function arcSVG(xa, xb, g, cls) {
        const h = clamp(Math.abs(xb - xa) * 0.55, 34, Math.max(40, (g.lineY - 14) * 1.6));
        const xm = (xa + xb) / 2, y0 = g.lineY - 3, yc = g.lineY - h;
        let out = `<path class="${cls}" d="M${xa} ${y0}Q${xm} ${yc} ${xb} ${y0}"/>`;
        const dx = xb - xm, dy = y0 - yc;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const s = 8.5;
        out += `<polygon class="nl-arrow" points="${xb} ${y0 + 2},${xb - ux * s * 1.7 - uy * s * 0.62} ${y0 - uy * s * 1.7 + ux * s * 0.62},${xb - ux * s * 1.7 + uy * s * 0.62} ${y0 - uy * s * 1.7 - ux * s * 0.62}"/>`;
        return out;
      }
      const apexY = (xa, xb, g) => g.lineY - clamp(Math.abs(xb - xa) * 0.55, 34, Math.max(40, (g.lineY - 14) * 1.6)) / 2;

      function lineSVG(g) {
        const y = g.lineY;
        let s = `<line class="nl-line" x1="${g.padL - 16}" y1="${y}" x2="${g.W - g.padR + 16}" y2="${y}"/>`;
        s += `<polygon class="nl-cap" points="${g.padL - 24} ${y},${g.padL - 12} ${y - 6},${g.padL - 12} ${y + 6}"/>`;
        s += `<polygon class="nl-cap" points="${g.W - g.padR + 24} ${y},${g.W - g.padR + 12} ${y - 6},${g.W - g.padR + 12} ${y + 6}"/>`;
        if (!p.blank) {
          const st = snapStep();
          let ticks = '';
          for (let v = p.min; v <= p.max + 1e-9; v += st) {
            const major = Math.abs((v - p.min) % p.major) < 1e-9 || Math.abs(((v - p.min) % p.major) - p.major) < 1e-9;
            const x = xOf(fOf(v), g);
            ticks += `M${x} ${y - (major ? 11 : 5)}V${y + (major ? 11 : 5)}`;
          }
          s += `<path class="nl-ticks" d="${ticks}"/>`;
        }
        for (const m of p.marks) {
          if (p.blank) s += `<path class="nl-mtick" d="M${xOf(m.f, g)} ${y - 13}V${y + 13}"/>`;
        }
        for (const j of p.jumps) s += arcSVG(xOf(j.a, g), xOf(j.b, g), g, 'nl-jump');
        s += '<path class="nl-jump nl-prev" d=""/>';
        return s;
      }

      function paint() {
        closeEd();
        mat.innerHTML = '';
        const g = geom();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'nl-svg');
        svg.setAttribute('width', g.W);
        svg.setAttribute('height', g.H);
        svg.innerHTML = lineSVG(g);
        mat.append(svg);
        const prev = svg.querySelector('.nl-prev');
        // tick labels
        if (!p.blank && p.labels !== 'none') {
          for (let v = p.min; v <= p.max + 1e-9; v += p.major) {
            if (p.labels === 'ends' && v !== p.min && Math.abs(v - p.max) > 1e-9) continue;
            mat.append(el('div', {
              class: 'nl-lab',
              style: `left:${xOf(fOf(v), g)}px;top:${g.lineY + 15}px;font-size:${g.fs}px;`,
              html: nlHTML(v),
            }));
          }
        }
        // landing dots (marked) / editable marks (blank)
        for (const m of p.marks) {
          if (!p.blank) {
            const d = el('button', { class: 'nl-dot', style: `left:${xOf(m.f, g) - 13}px;top:${g.lineY - 13}px;`, title: 'Drag along the line — drag away to remove' });
            d.addEventListener('pointerdown', (e) => dragMark(m, d, null, e, g));
            mat.append(d);
          } else {
            const c = el('button', { class: 'nl-mlab', style: `left:${xOf(m.f, g)}px;top:${g.lineY + 16}px;font-size:${g.fs}px;`, title: 'Tap to edit — drag away to remove' }, m.t || '…');
            if (!m.t) c.classList.add('empty');
            c.addEventListener('pointerdown', (e) => dragMark(m, null, c, e, g));
            mat.append(c);
          }
        }
        // jump labels
        for (const j of p.jumps) {
          const chip = el('button', {
            class: 'nl-jlab', title: 'Tap to edit the label',
            style: `left:${(xOf(j.a, g) + xOf(j.b, g)) / 2}px;top:${apexY(xOf(j.a, g), xOf(j.b, g), g) - 16}px;font-size:${g.fs}px;`,
          });
          if (j.t) chip.textContent = j.t;
          else if (jumpAuto(j)) chip.innerHTML = jumpAuto(j);
          else { chip.textContent = '…'; chip.classList.add('empty'); }
          chip.addEventListener('pointerdown', (e) => e.stopPropagation());
          chip.addEventListener('click', () => {
            const g2 = geom();
            openEd(j, p.jumps, (xOf(j.a, g2) + xOf(j.b, g2)) / 2, apexY(xOf(j.a, g2), xOf(j.b, g2), g2) - 16, j.t || chipText(j));
          });
          mat.append(chip);
        }
        if (!p.jumps.length && !p.marks.length) {
          mat.append(el('div', { class: 'bm-empty ct-hint' }, p.blank
            ? 'An empty number line — press and drag along it to draw a jump, tap it to add a mark'
            : 'Press on the line and drag to draw a jump — tap the line to drop a landing dot'));
        }
        paintSent();
        paintQuick();
        return prev;
      }
      const chipText = (j) => (j.va == null ? '' : (j.vb >= j.va ? '+' : '−') + nlTxt(Math.abs(j.vb - j.va)));

      function dragMark(m, dot, chip, e0, g) {
        e0.preventDefault();
        e0.stopPropagation();
        const pid = e0.pointerId;
        let moved = false;
        const x0 = e0.clientX, y0 = e0.clientY;
        let away = false;
        const elc = dot || chip;
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          moved = true;
          const f = fAt(ev, g);
          m.f = p.blank ? f : fOf(snapV(f));
          if (!p.blank) m.v = snapV(f);
          away = Math.abs(ev.clientY - y0) > 64;
          elc.classList.toggle('ct-out', away);
          elc.style.left = xOf(m.f, g) - (dot ? 13 : 0) + 'px';
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          if (moved && away) p.marks = p.marks.filter((x) => x !== m);
          else if (!moved && chip) { // tap a blank-line mark: edit its label
            openEd(m, p.marks, xOf(m.f, g), g.lineY + 26, m.t || '');
            return;
          }
          commit();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      // press-drag on the line draws a jump; a plain tap drops a mark
      mat.addEventListener('pointerdown', (e0) => {
        if (e0.target !== mat) return; // labels and the svg are pointer-transparent; chips stop propagation
        closeEd();
        const g = geom();
        const rct = mat.getBoundingClientRect();
        if (Math.abs(e0.clientY - rct.top - g.lineY) > g.H * 0.34) return;
        e0.preventDefault();
        const pid = e0.pointerId;
        const fa = fAt(e0, g);
        const a = p.blank ? fa : fOf(snapV(fa));
        let moved = false;
        let fb = a;
        drawing = true;
        const prev = mat.querySelector('.nl-prev');
        const move = (ev) => {
          if (ev.pointerId !== pid) return;
          if (!moved && Math.abs(ev.clientX - e0.clientX) < 8) return;
          moved = true;
          fb = fAt(ev, g);
          if (!p.blank) fb = fOf(snapV(fb));
          if (prev) {
            const xa = xOf(a, g), xb = xOf(fb, g);
            const h = clamp(Math.abs(xb - xa) * 0.55, 34, Math.max(40, (g.lineY - 14) * 1.6));
            prev.setAttribute('d', `M${xa} ${g.lineY - 3}Q${(xa + xb) / 2} ${g.lineY - h} ${xb} ${g.lineY - 3}`);
          }
        };
        const up = (ev) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          drawing = false;
          if (ev.type === 'pointercancel') { commit(); return; }
          if (moved && Math.abs(xOf(fb, g) - xOf(a, g)) >= 14 && fb !== a) {
            if (p.jumps.length >= 12) { toast('That’s plenty of jumps — clear some first!'); commit(); return; }
            const j = { id: uid(), a, b: fb, va: p.blank ? null : snapV(a), vb: p.blank ? null : snapV(fb), t: null };
            p.jumps.push(j);
            commit();
            if (p.blank) { // a blank jump wants its label straight away
              const g2 = geom();
              openEd(j, p.jumps, (xOf(j.a, g2) + xOf(j.b, g2)) / 2, apexY(xOf(j.a, g2), xOf(j.b, g2), g2) - 16, '');
            }
          } else if (!moved) {
            if (p.marks.length >= 24) { toast('That’s plenty of marks — clear some first!'); commit(); return; }
            const m = { id: uid(), f: a, v: p.blank ? null : snapV(fa), t: null };
            if (!p.blank && p.marks.some((x) => x.v === m.v)) { commit(); return; } // one dot per number
            p.marks.push(m);
            commit();
            if (p.blank) openEd(m, p.marks, xOf(a, geom()), geom().lineY + 26, '');
          } else commit();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });

      // the jump story, read in drawing order: "36 + 10 + 10 + 3 = 59"
      function sentences() {
        const out = [];
        let chain = null;
        for (const j of p.jumps) {
          if (j.va == null || j.vb == null || j.va === j.vb) continue;
          if (chain && chain.v === j.va) { chain.terms.push(j.vb - j.va); chain.v = j.vb; }
          else { if (chain) out.push(chain); chain = { start: j.va, terms: [j.vb - j.va], v: j.vb }; }
        }
        if (chain) out.push(chain);
        return out.map((c) => `${nlTxt(c.start)} ${c.terms.map((d) => `${d < 0 ? '−' : '+'} ${nlTxt(Math.abs(d))}`).join(' ')} = ${nlTxt(c.v)}`).slice(0, 3);
      }

      function paintSent() {
        sent.innerHTML = '';
        sent.style.display = p.sent ? '' : 'none';
        if (!p.sent) return;
        const list = sentences();
        if (!list.length) {
          sent.append(el('span', { class: 'bm-fact', style: 'visibility:hidden;' }, '0 + 0 = 0'));
          return;
        }
        for (const s of list) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      function applyPreset(id, props) {
        if (p.preset === id) return;
        p.preset = id;
        Object.assign(p, props);
        // a new scale gives old jumps new meanings — start clean instead
        if (p.jumps.length || p.marks.length) { p.jumps = []; p.marks = []; toast('New line — jumps and marks cleared'); }
        commit();
      }

      function paintQuick() {
        quick.innerHTML = '';
        const tq = (label, title, active, fn) => el('button', { class: 'tq-btn' + (active ? ' active' : ''), title, onclick: fn }, label);
        quick.append(...[
          el('span', { class: 'tq-step ft-seg' }, ...NL_QUICK.map(([id, label, props]) => el('button', {
            class: 'tq-btn' + (p.preset === id ? ' active' : ''),
            title: 'Switch the line',
            onclick: () => applyPreset(id, props),
          }, label))),
          // a blank line draws no labels at all, so the cycle button would
          // click through three states with nothing changing — hidden, like
          // the Fractions chip when there are no fractions to swap to
          p.blank ? null : tq(`Labels · ${p.labels}`, 'Cycle tick labels: all, ends only, none', p.labels !== 'none', () => {
            p.labels = { all: 'ends', ends: 'none', none: 'all' }[p.labels] || 'all';
            commit();
          }),
          p.den > 1 ? tq('Fractions', 'Swap between decimal and fraction labels', p.frac, () => { p.frac = !p.frac; commit(); }) : null,
          tq('Facts', 'Read the jumps as a number sentence', p.sent, () => { p.sent = !p.sent; commit(); }),
          tq('Undo jump', 'Remove the last jump drawn', false, () => { p.jumps.pop(); commit(); }),
          tq('Clear', 'Remove every jump and mark', false, () => { p.jumps = []; p.marks = []; commit(); }),
        ].filter(Boolean));
      }

      const ro = new ResizeObserver(() => { if (!drawing) paint(); });
      ro.observe(mat);
      paint();
      return () => ro.disconnect();
    },
    settings(box, w, api) {
      const preset = (label, props) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, { jumps: [], marks: [] }, props); api.refresh(); },
      }, label);
      const num = (val, width, onChange) => el('input', { type: 'number', class: 'text-input', style: `width:${width}px;`, value: String(val), onchange: (e) => onChange(+e.target.value) });
      const custom = (patch) => {
        const q = { ...w.props, ...patch };
        if (!(q.max > q.min)) { toast('The end of the line must be after the start'); api.refresh(); return; }
        if ((q.max - q.min) / q.major > 60) { toast('Too many ticks — use a bigger step'); api.refresh(); return; }
        Object.assign(w.props, patch, { preset: 'custom', blank: false, den: 1, jumps: [], marks: [] });
        api.refresh();
      };
      box.append(
        el('div', { class: 'hint' }, 'Start from a line:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('0–10', { preset: 't10', blank: false, min: 0, max: 10, den: 1, major: 1, minor: 0 }),
          preset('0–20', { preset: 't20', blank: false, min: 0, max: 20, den: 1, major: 1, minor: 0 }),
          preset('0–100 in tens', { preset: 'h', blank: false, min: 0, max: 100, den: 1, major: 10, minor: 10 }),
          preset('0–1,000', { preset: 'custom', blank: false, min: 0, max: 1000, den: 1, major: 100, minor: 10 }),
          preset('Decimals 0–1', { preset: 'u1', blank: false, min: 0, max: 10, den: 10, major: 1, minor: 0, frac: false }),
          preset('Halves', { preset: 'custom', blank: false, min: 0, max: 4, den: 2, major: 1, minor: 0, frac: true }),
          preset('Quarters', { preset: 'custom', blank: false, min: 0, max: 8, den: 4, major: 1, minor: 0, frac: true }),
          preset('Thirds', { preset: 'custom', blank: false, min: 0, max: 6, den: 3, major: 1, minor: 0, frac: true }),
          preset('Negatives −10–10', { preset: 'pm', blank: false, min: -10, max: 10, den: 1, major: 1, minor: 0 }),
          preset('Blank line', { preset: 'blank', blank: true }),
        ),
        settingRow('From / to', el('span', { class: 'row', style: 'gap:6px;' },
          num(w.props.min, 74, (v) => custom({ min: Math.round(v) })),
          num(w.props.max, 74, (v) => custom({ max: Math.round(v) })),
        )),
        settingRow('Step', num(w.props.major, 74, (v) => { if (v >= 1) custom({ major: Math.round(v) }); })),
        settingRow('Minor ticks', selectInput([['0', 'None'], ['2', 'Halves'], ['4', 'Quarters'], ['5', 'Fifths'], ['10', 'Tenths']], String(w.props.minor || 0), (v) => { w.props.minor = +v; w.props.jumps = []; w.props.marks = []; api.refresh(); })),
        settingRow('Labels', selectInput([['all', 'Every step'], ['ends', 'Ends only'], ['none', 'Hidden']], w.props.labels || 'all', (v) => { w.props.labels = v; api.refresh(); })),
        checkRow('Fraction labels (¾ instead of 0.75)', w.props.frac, (v) => { w.props.frac = v; api.refresh(); }),
        checkRow('Number sentence from the jumps', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Press on the line and drag to draw a jump — on marked lines the ends snap to the ticks and the arc labels itself (“+10”); tap the label to reword it, or ✕ to remove it · a plain tap drops a landing dot (marked) or an editable mark (blank) — drag marks along the line, or drag them away to delete · “Labels” cycles every step / ends only / hidden — hide them and the marked line becomes a counting-on scaffold · fraction lines label as ¾ or 0.75, your choice · “Facts” reads the jumps in order as a number sentence (“36 + 10 + 10 + 3 = 59”) · switching lines clears the jumps, since a new scale would change what they mean.'),
      );
    },
  };

  // ---- Bar model ----
  // White Rose-style bar models: part–whole, comparison and equal-parts bars.
  // Lengths tell the truth — every bar on the mat shares one scale, so a bar of
  // 12 really is twice a bar of 6. Values can be masked as "?" mystery boxes
  // that the class reveals with a tap.
  const BM_COLORS = [
    ['#fca5a5', '#dc2626'], ['#93c5fd', '#2563eb'], ['#fde047', '#ca8a04'],
    ['#86efac', '#16a34a'], ['#c4b5fd', '#7c3aed'], ['#fdba74', '#ea580c'],
    ['#f9a8d4', '#db2777'], ['#a5f3fc', '#0891b2'],
  ];
  const bmFmt = (n) => {
    const r = Math.round(n * 100) / 100;
    return r % 1 === 0 ? String(r) : r.toFixed(2).replace(/0$/, '');
  };
  const bmBar = (whole, name, vals) => ({
    id: uid(), name: name || '', whole,
    segs: vals.map(([v, c]) => ({ id: uid(), v, c })),
  });

  WIDGETS.barmodel = {
    title: 'Bar model', icon: 'barmodel', accent: '#fdba74', w: 780, h: 400,
    defaults: () => ({
      bars: [bmBar('sum', '', [[7, 0], [5, 1]])],
      scaled: true, names: false, barH: 56, units: false, sent: false,
    }),
    mount(body, w) {
      body.classList.add('mntray', 'barmodel');
      const p = w.props;
      if (!Array.isArray(p.bars)) p.bars = [];
      p.barH = clamp(+p.barH || 56, 36, 84);
      let sel = null; // { barId, segId } — the part being edited
      let focusVal = false; // focus the value box on the next paint (fresh selection)
      let popId = null; // freshly revealed value → one-shot pop animation
      let vinEl = null;

      const mat = el('div', { class: 'bm-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const ctx = el('div', { class: 'tclock-quick bm-ctx' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, ctx, quick);
      mat.addEventListener('pointerdown', (e) => { if (e.target === mat && sel) { sel = null; paint(); } });

      const total = (b) => b.segs.reduce((a, s) => a + s.v, 0);
      const selBar = () => sel && p.bars.find((b) => b.id === sel.barId) || null;
      const selSeg = () => { const b = selBar(); return b && b.segs.find((s) => s.id === sel.segId) || null; };
      const commit = () => { save(); paint(); };
      const setVal = (s, v) => { if (Number.isFinite(v)) s.v = clamp(Math.round(v * 100) / 100, 0.01, 9999); };

      function addSeg(bar, after) {
        const prev = after || bar.segs[bar.segs.length - 1];
        const seg = { id: uid(), v: prev ? prev.v : 1, c: prev ? (prev.c + 1) % BM_COLORS.length : 0 };
        bar.segs.splice(after ? bar.segs.indexOf(after) + 1 : bar.segs.length, 0, seg);
        sel = { barId: bar.id, segId: seg.id };
        focusVal = true;
        commit();
      }

      function addBar() {
        const last = p.bars[p.bars.length - 1];
        // a new bar arrives visibly shorter than the one above, ready to compare
        const bar = bmBar(p.bars.length ? 'off' : 'sum', '',
          [[last ? Math.max(1, Math.round(total(last) / 2)) : 5, (p.bars.length * 3) % BM_COLORS.length]]);
        p.bars.push(bar);
        sel = { barId: bar.id, segId: bar.segs[0].id };
        focusVal = true;
        commit();
      }

      // -- dragging. A join (divider) repartitions its two neighbours — the bar
      //    total stays put, so the shared scale can't shift under the finger.
      //    The end handle grows/shrinks the bar's last part (capped at the
      //    current longest bar). Layout is frozen to px for the gesture;
      //    commit() on release restores % widths and transitions.
      function bmDrag(e, onMove) {
        e.preventDefault();
        mat.classList.add('bm-live');
        const x0 = e.clientX;
        const move = (ev) => onMove(ev.clientX - x0);
        let done = false;
        const up = () => {
          if (done) return;
          done = true;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          mat.classList.remove('bm-live');
          commit();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }

      function dragDivider(e, bar, i, barEl) {
        const a = bar.segs[i], b = bar.segs[i + 1];
        const segEls = barEl.querySelectorAll('.bm-seg');
        const aEl = segEls[i], bEl = segEls[i + 1];
        const a0 = a.v, sum = a.v + b.v;
        const ppu = barEl.getBoundingClientRect().width / total(bar);
        const step = Number.isInteger(a.v) && Number.isInteger(b.v) ? 1 : 0.1;
        const aw0 = aEl.getBoundingClientRect().width, bw0 = bEl.getBoundingClientRect().width;
        for (const n of segEls) n.style.width = n.getBoundingClientRect().width + 'px';
        barEl.style.width = barEl.getBoundingClientRect().width + 'px';
        bmDrag(e, (dx) => {
          const av = Math.round(clamp(Math.round((a0 + dx / ppu) / step) * step, step, sum - step) * 100) / 100;
          if (av === a.v) return;
          a.v = av;
          b.v = Math.round((sum - av) * 100) / 100;
          aEl.style.width = aw0 + (av - a0) * ppu + 'px';
          bEl.style.width = bw0 - (av - a0) * ppu + 'px';
          if (!a.hide) aEl.querySelector('.bm-val').textContent = a.label || bmFmt(a.v);
          if (!b.hide) bEl.querySelector('.bm-val').textContent = b.label || bmFmt(b.v);
          const s = selSeg();
          if (vinEl && (s === a || s === b)) vinEl.value = bmFmt(s.v);
        });
      }

      function dragEnd(e, bar, barEl, brkEl, chipEl) {
        const seg = bar.segs[bar.segs.length - 1];
        const segEls = barEl.querySelectorAll('.bm-seg');
        const segEl = segEls[segEls.length - 1];
        const t0 = total(bar);
        const scale0 = Math.max(...p.bars.map(total));
        const ppu = barEl.getBoundingClientRect().width / t0;
        const v0 = seg.v, step = Number.isInteger(v0) ? 1 : 0.1;
        const maxV = Math.max(step, v0 + (scale0 - t0));
        const sw0 = segEl.getBoundingClientRect().width;
        const bw0 = barEl.getBoundingClientRect().width;
        const kw0 = brkEl ? brkEl.getBoundingClientRect().width : 0;
        for (const n of segEls) n.style.width = n.getBoundingClientRect().width + 'px';
        barEl.style.width = bw0 + 'px';
        if (brkEl) brkEl.style.width = kw0 + 'px';
        bmDrag(e, (dx) => {
          const v = Math.round(clamp(Math.round((v0 + dx / ppu) / step) * step, step, maxV) * 100) / 100;
          if (v === seg.v) return;
          const dv = v - v0;
          seg.v = v;
          segEl.style.width = sw0 + dv * ppu + 'px';
          barEl.style.width = bw0 + dv * ppu + 'px';
          if (brkEl) brkEl.style.width = kw0 + dv * ppu + 'px';
          if (!seg.hide) segEl.querySelector('.bm-val').textContent = seg.label || bmFmt(v);
          if (chipEl && bar.whole === 'sum' && !bar.wlabel) chipEl.textContent = bmFmt(total(bar));
          if (vinEl && selSeg() === seg) vinEl.value = bmFmt(v);
        });
      }

      function paint() {
        mat.innerHTML = '';
        const scale = p.bars.length ? Math.max(...p.bars.map(total)) : 0;
        const maxN = p.bars.length ? Math.max(...p.bars.map((b) => b.segs.length)) : 1;
        const vFont = clamp(Math.round(p.barH * 0.42), 15, 34);
        p.bars.forEach((bar, bi) => {
          const row = el('div', { class: 'bm-row' });
          if (p.names) {
            row.append(el('input', {
              class: 'bm-name', value: bar.name || '', placeholder: 'name',
              onchange: (e) => { bar.name = e.target.value.slice(0, 20); save(); },
            }));
          }
          const track = el('div', { class: 'bm-track' });
          const barW = p.scaled ? (scale ? (total(bar) / scale) * 100 : 100) : (bar.segs.length / maxN) * 100;
          const prev = bi > 0 ? p.bars[bi - 1] : null;
          if (prev && p.scaled && bar.diff && bar.diff !== 'off') {
            // difference arrow: spans the shorter bar's end to the longer's end
            const lo = Math.min(total(prev), total(bar));
            const hi = Math.max(total(prev), total(bar));
            const masked = bar.diff === 'mask';
            track.append(el('div', {
              class: 'bm-diff',
              style: `margin-left:${(lo / scale) * 100}%;width:${((hi - lo) / scale) * 100}%;`,
            },
              el('span', { class: 'bm-diff-l' }),
              el('span', { class: 'bm-diff-r' }),
              el('button', {
                class: 'bm-brk-chip on-line' + (popId === 'd' + bar.id ? ' bm-pop' : ''),
                style: 'font-size:' + Math.max(14, vFont - 7) + 'px;',
                title: masked ? 'Show the difference' : 'Hide the difference',
                onclick: () => { bar.diff = masked ? 'auto' : 'mask'; popId = masked ? 'd' + bar.id : null; commit(); },
              }, masked ? '?' : bmFmt(hi - lo))));
          }
          let brkEl = null, chipEl = null;
          if (bar.whole !== 'off') {
            const masked = bar.whole === 'mask';
            chipEl = el('button', {
              class: 'bm-brk-chip' + (popId === bar.id ? ' bm-pop' : ''),
              style: 'font-size:' + Math.max(14, vFont - 7) + 'px;',
              title: masked ? 'Show the whole' : 'Hide the whole',
              onclick: () => { bar.whole = masked ? 'sum' : 'mask'; popId = masked ? bar.id : null; commit(); },
            }, masked ? '?' : (bar.wlabel || bmFmt(total(bar))));
            brkEl = el('div', { class: 'bm-brk', style: 'width:' + barW + '%;' }, chipEl);
            track.append(brkEl);
          }
          const barEl = el('div', { class: 'bm-bar', style: 'height:' + p.barH + 'px;width:' + barW + '%;' });
          bar.segs.forEach((seg, si) => {
            if (si > 0 && p.scaled) {
              barEl.append(el('div', {
                class: 'bm-div', title: 'Drag to repartition',
                onpointerdown: (e) => dragDivider(e, bar, si - 1, barEl),
              }));
            }
            const active = !!sel && sel.segId === seg.id;
            const [bg, border] = BM_COLORS[seg.c % BM_COLORS.length];
            const segW = p.scaled ? (seg.v / total(bar)) * 100 : 100 / bar.segs.length;
            const kids = [];
            // discrete mode: draw the part as its unit boxes (WRM's KS1 bar) —
            // whole small numbers only, and never on a mystery box (the cell
            // count would give the answer away)
            if (p.units && p.scaled && !seg.hide && Number.isInteger(seg.v) && seg.v >= 2 && seg.v <= 24 && total(bar) <= 40) {
              kids.push(el('span', {
                class: 'bm-units',
                style: `background-image:linear-gradient(to right, ${border} 1.5px, transparent 1.5px);background-size:${100 / seg.v}% 100%;`,
              }));
            }
            kids.push(el('span', { class: 'bm-val' + (popId === seg.id ? ' bm-pop' : '') }, seg.hide ? '?' : (seg.label || bmFmt(seg.v))));
            barEl.append(el('button', {
              class: 'bm-seg' + (active ? ' active' : '') + (seg.hide ? ' hidden-val' : ''),
              style: `width:${segW}%;background:${seg.fill === false ? '#fff' : bg};border-color:${border};font-size:${vFont}px;`,
              onclick: () => {
                if (seg.hide) { seg.hide = false; popId = seg.id; commit(); return; } // the reveal moment
                sel = active ? null : { barId: bar.id, segId: seg.id };
                focusVal = !active;
                paint();
              },
            }, kids));
          });
          if (p.scaled && bar.segs.length && p.bars.length > 1) {
            barEl.append(el('div', {
              class: 'bm-end', title: 'Drag to change this bar’s total',
              onpointerdown: (e) => dragEnd(e, bar, barEl, brkEl, chipEl),
            }));
          }
          track.append(barEl);
          // sub-bracket: a brace under the run of parts flagged with "Bracket",
          // showing the partial sum (WRM two-step problem style)
          const flags = bar.segs.map((s, i) => (s.sub ? i : -1)).filter((i) => i >= 0);
          if (flags.length) {
            const first = flags[0], last = flags[flags.length - 1];
            const span = bar.segs.slice(first, last + 1);
            const spanSum = span.reduce((a, s) => a + s.v, 0);
            const T = total(bar);
            const leftPct = p.scaled
              ? (bar.segs.slice(0, first).reduce((a, s) => a + s.v, 0) / T) * barW
              : (first / bar.segs.length) * barW;
            const wPct = p.scaled ? (spanSum / T) * barW : (span.length / bar.segs.length) * barW;
            const masked = bar.subw === 'mask';
            track.append(el('div', { class: 'bm-brk bm-sub', style: `margin-left:${leftPct}%;width:${wPct}%;` },
              el('button', {
                class: 'bm-brk-chip on-sub' + (popId === 's' + bar.id ? ' bm-pop' : ''),
                style: 'font-size:' + Math.max(14, vFont - 7) + 'px;',
                title: masked ? 'Show this group' : 'Hide this group',
                onclick: () => { bar.subw = masked ? 'sum' : 'mask'; popId = masked ? 's' + bar.id : null; commit(); },
              }, masked ? '?' : bmFmt(spanSum))));
          }
          row.append(track);
          mat.append(row);
        });
        if (!p.bars.length) mat.append(el('div', { class: 'bm-empty' }, 'Tap “＋ bar” to begin'));
        popId = null;
        paintSent();
        paintCtx();
        paintQuick();
        if (focusVal && vinEl) { vinEl.focus(); vinEl.select(); }
        focusVal = false;
      }

      // number sentences: WRM sets a model up "to include the calculation(s)".
      // Fact families follow the bar exactly — hidden values stay ? here too.
      function sentences() {
        const out = [];
        const disp = (s) => (s.hide ? '?' : (s.label || bmFmt(s.v)));
        const wdisp = (b) => (b.whole === 'mask' ? '?' : (b.wlabel || bmFmt(total(b))));
        for (const b of p.bars) {
          const n = b.segs.length;
          if (n < 2) continue;
          // labelled parts (x, 1/4…) only make true sentences against a
          // teacher-set whole; the internal layout total would lie (3 × 1/3 ≠ 6)
          if (b.segs.some((s) => s.label) && !b.wlabel) continue;
          // rows of unit boxes (ratio bars) need no fact family
          if (b.segs[0].v === 1 && b.segs.every((s) => s.v === 1 && !s.label)) continue;
          if (b.segs.every((s) => s.v === b.segs[0].v)) {
            out.push(`${n} × ${disp(b.segs[0])} = ${wdisp(b)}`);
            out.push(`${wdisp(b)} ÷ ${n} = ${disp(b.segs[0])}`);
          } else {
            out.push(b.segs.map(disp).join(' + ') + ' = ' + wdisp(b));
            if (n === 2) {
              out.push(`${wdisp(b)} − ${disp(b.segs[0])} = ${disp(b.segs[1])}`);
              out.push(`${wdisp(b)} − ${disp(b.segs[1])} = ${disp(b.segs[0])}`);
            }
          }
        }
        p.bars.forEach((b, i) => {
          if (i > 0 && b.diff && b.diff !== 'off' && p.scaled) {
            const a = p.bars[i - 1];
            const [big, small] = total(a) >= total(b) ? [a, b] : [b, a];
            out.push(`${wdisp(big)} − ${wdisp(small)} = ${b.diff === 'mask' ? '?' : bmFmt(total(big) - total(small))}`);
          }
        });
        return out.slice(0, 8);
      }

      function paintSent() {
        sent.innerHTML = '';
        const show = p.sent && p.bars.length;
        sent.style.display = show ? '' : 'none';
        if (!show) return;
        for (const s of sentences()) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      function paintCtx() {
        ctx.innerHTML = '';
        vinEl = null;
        const bar = selBar();
        const seg = selSeg();
        ctx.style.display = seg ? '' : 'none';
        if (!seg) return;
        vinEl = el('input', {
          class: 'bm-vin', inputmode: 'decimal', value: bmFmt(seg.v),
          onchange: (e) => { setVal(seg, parseFloat(String(e.target.value).replace(',', '.'))); commit(); },
          onkeydown: (e) => {
            if (e.key === 'Enter') { e.target.blur(); sel = null; paint(); }
            else if (e.key === 'Escape') { sel = null; paint(); }
          },
        });
        const bi = p.bars.indexOf(bar);
        // ctx.append is the DOM's own append — nulls would become "null" text,
        // so drop the conditional entries first
        ctx.append(...[
          el('span', { class: 'tq-step' },
            el('button', { class: 'tq-mini', onclick: () => { setVal(seg, seg.v - 1); commit(); } }, '−'),
            vinEl,
            el('button', { class: 'tq-mini', onclick: () => { setVal(seg, seg.v + 1); commit(); } }, '＋')),
          el('input', {
            class: 'bm-vin bm-lin', placeholder: 'label', value: seg.label || '',
            title: 'Show this on the part instead of its number — x, 1⁄4, apples…',
            onchange: (e2) => { seg.label = e2.target.value.trim().slice(0, 12); commit(); },
          }),
          el('button', {
            class: 'tq-btn' + (seg.hide ? ' active' : ''), title: 'Mask this value as a mystery box',
            onclick: () => { seg.hide = !seg.hide; commit(); },
          }, seg.hide ? 'Hidden ?' : 'Hide ?'),
          el('button', {
            class: 'tq-btn bm-swatch', style: '--sw:' + BM_COLORS[seg.c % BM_COLORS.length][0] + ';', title: 'Change colour',
            onclick: () => { seg.c = (seg.c + 1) % BM_COLORS.length; commit(); },
          }, el('span', { class: 'bm-swdot' }), 'Colour'),
          el('button', {
            class: 'tq-btn' + (seg.fill === false ? ' active' : ''), title: 'Outline only — for fraction shading',
            onclick: () => { seg.fill = seg.fill === false ? true : false; commit(); },
          }, 'Empty'),
          el('button', {
            class: 'tq-btn', title: 'Add an identical part next to this one (times-as-many, ratio)',
            onclick: () => {
              const copy = { id: uid(), v: seg.v, c: seg.c, label: seg.label, hide: seg.hide, fill: seg.fill };
              bar.segs.splice(bar.segs.indexOf(seg) + 1, 0, copy);
              sel = { barId: bar.id, segId: copy.id };
              commit();
            },
          }, 'Copy'),
          el('button', {
            class: 'tq-btn' + (seg.sub ? ' active' : ''), title: 'Group this part under a bracket below the bar',
            onclick: () => { seg.sub = !seg.sub; if (!bar.subw) bar.subw = 'sum'; commit(); },
          }, 'Bracket'),
          el('button', {
            class: 'tq-btn', title: 'Remove this part',
            onclick: () => {
              bar.segs = bar.segs.filter((s) => s !== seg);
              if (!bar.segs.length) p.bars = p.bars.filter((b) => b !== bar);
              sel = null;
              commit();
            },
          }, '✕ part'),
          el('button', {
            class: 'tq-btn' + (bar.whole !== 'off' ? ' active' : ''), title: 'Whole bracket: shown → hidden as ? → off',
            onclick: () => { bar.whole = bar.whole === 'sum' ? 'mask' : bar.whole === 'mask' ? 'off' : 'sum'; commit(); },
          }, bar.whole === 'mask' ? 'Whole ?' : 'Whole'),
          bar.whole !== 'off' ? el('input', {
            class: 'bm-vin bm-lin', placeholder: 'whole =', value: bar.wlabel || '',
            title: 'Show this on the whole bracket instead of the sum — 20, y…',
            onchange: (e2) => { bar.wlabel = e2.target.value.trim().slice(0, 12); commit(); },
          }) : null,
          bi > 0 ? el('button', {
            class: 'tq-btn' + (bar.diff && bar.diff !== 'off' ? ' active' : ''),
            title: 'Difference arrow vs the bar above: shown → hidden as ? → off',
            onclick: () => { bar.diff = bar.diff === 'auto' ? 'mask' : bar.diff === 'mask' ? 'off' : 'auto'; commit(); },
          }, bar.diff === 'mask' ? 'Diff ?' : 'Diff') : null,
          el('button', {
            class: 'tq-btn', title: 'Remove this bar',
            onclick: () => { p.bars = p.bars.filter((b) => b !== bar); sel = null; commit(); },
          }, '✕ bar'),
        ].filter(Boolean));
      }

      function paintQuick() {
        quick.innerHTML = '';
        quick.append(
          el('button', {
            class: 'tq-btn',
            onclick: () => { const b = selBar() || p.bars[p.bars.length - 1]; if (b) addSeg(b, selSeg()); else addBar(); },
          }, '＋ part'),
          el('button', { class: 'tq-btn', onclick: addBar }, '＋ bar'),
          el('button', {
            class: 'tq-btn' + (p.scaled ? ' active' : ''), title: 'Part widths show their values',
            onclick: () => { p.scaled = !p.scaled; commit(); },
          }, 'Scaled'),
          el('button', {
            class: 'tq-btn' + (p.units ? ' active' : ''), title: 'Draw parts as unit boxes (discrete bar, small whole numbers)',
            onclick: () => { p.units = !p.units; commit(); },
          }, 'Units'),
          el('button', {
            class: 'tq-btn' + (p.sent ? ' active' : ''), title: 'Show the number sentences under the model',
            onclick: () => { p.sent = !p.sent; commit(); },
          }, 'Facts'),
          el('button', {
            class: 'tq-btn', title: 'Mask every value',
            onclick: () => {
              for (const b of p.bars) {
                for (const s of b.segs) s.hide = true;
                if (b.whole === 'sum') b.whole = 'mask';
              }
              commit();
            },
          }, 'Hide all'),
          el('button', {
            class: 'tq-btn', title: 'Reveal every value',
            onclick: () => {
              for (const b of p.bars) {
                for (const s of b.segs) s.hide = false;
                if (b.whole === 'mask') b.whole = 'sum';
              }
              commit();
            },
          }, 'Show all'),
        );
      }

      paint();
    },
    settings(box, w, api) {
      const preset = (label, make) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, make()); api.refresh(); },
      }, label);
      box.append(
        el('div', { class: 'hint' }, 'Start from a model:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('Part–whole', () => ({ bars: [bmBar('sum', '', [[7, 0], [5, 1]])] })),
          preset('Comparison', () => ({ names: true, bars: [bmBar('sum', 'A', [[12, 1]]), { ...bmBar('sum', 'B', [[7, 3]]), diff: 'mask' }] })),
          preset('Before / after', () => ({
            names: true, scaled: true,
            bars: [
              bmBar('sum', 'Before', [[12, 4]]),
              { id: uid(), name: 'After', whole: 'off', segs: [{ id: uid(), v: 5, c: 5 }, { id: uid(), v: 7, c: 1, hide: true }] },
            ],
          })),
          preset('Equal parts', () => ({ bars: [bmBar('sum', '', [[4, 2], [4, 2], [4, 2], [4, 2]])] })),
          preset('Fractions', () => ({
            scaled: true, names: false,
            bars: [{
              id: uid(), name: '', whole: 'off',
              segs: Array.from({ length: 4 }, (_, i) => ({ id: uid(), v: 1, c: 7, label: '1/4', fill: i === 0 })),
            }],
          })),
          preset('Equal fractions', () => ({
            scaled: true, names: false,
            bars: [
              { id: uid(), name: '', whole: 'off', segs: Array.from({ length: 3 }, () => ({ id: uid(), v: 2, c: 5, label: '1/3' })) },
              { id: uid(), name: '', whole: 'off', segs: Array.from({ length: 6 }, () => ({ id: uid(), v: 1, c: 7, label: '1/6' })) },
            ],
          })),
          preset('Ratio 2 : 3', () => ({
            names: true, scaled: true,
            bars: [bmBar('off', 'A', [[1, 1], [1, 1]]), bmBar('off', 'B', [[1, 3], [1, 3], [1, 3]])],
          })),
          preset('Clear', () => ({ bars: [] })),
        ),
        checkRow('Scaled widths (length shows the value)', w.props.scaled, (v) => { w.props.scaled = v; api.refresh(); }),
        checkRow('Unit boxes inside parts (discrete bar)', w.props.units, (v) => { w.props.units = v; api.refresh(); }),
        checkRow('Number sentences under the model', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        checkRow('Name labels on bars', w.props.names, (v) => { w.props.names = v; api.refresh(); }),
        settingRow('Bar size', selectInput([[44, 'Compact'], [56, 'Classroom'], [70, 'Big board']], String(clamp(+w.props.barH || 56, 36, 84)), (v) => { w.props.barH = +v; api.refresh(); })),
        el('div', { class: 'hint' }, 'Tap a part to edit it · drag a join to repartition, or a bar’s end to resize it · “Hide ?” makes mystery boxes the class taps to reveal · label parts for algebra or fractions (x, 1/4) · “Empty” shades fractions · “Diff” draws a difference arrow against the bar above.'),
      );
    },
  };

  // ---- Part–whole model ----
  // The WRM "cherry" diagram: a whole circle branching to part circles.
  // Same truth rule as the bar model — the whole always shows the parts' sum
  // (or a teacher label), and any circle can be masked as a "?" mystery box
  // the class taps to reveal. Counters mode shows values as WRM-style dots.
  WIDGETS.partwhole = {
    title: 'Part–whole', icon: 'partwhole', accent: '#f9a8d4', w: 470, h: 540,
    defaults: () => ({
      parts: [{ id: uid(), v: 6, c: 0 }, { id: uid(), v: 4, c: 1 }],
      whole: 'sum', wlabel: '', orient: 'top', counters: false, sent: false,
    }),
    mount(body, w) {
      body.classList.add('mntray', 'partwhole');
      const p = w.props;
      if (!Array.isArray(p.parts)) p.parts = [];
      let fitScale = 1; // diagram-to-mat fit: the widget's resize corner IS the size control
      let sel = null; // 'whole' | part id — the circle being edited
      let focusVal = false; // focus the value box on the next paint (fresh selection)
      let popId = null; // freshly revealed value → one-shot pop animation
      let dotPop = null; // part that just gained a tapped-in counter → its newest dot (and the whole's) pops
      let vinEl = null;

      const mat = el('div', { class: 'pw-mat grow' });
      const sent = el('div', { class: 'bm-sent' });
      const ctx = el('div', { class: 'tclock-quick bm-ctx' });
      const quick = el('div', { class: 'tclock-quick' });
      body.append(mat, sent, ctx, quick);
      mat.addEventListener('pointerdown', (e) => { if (e.target === mat && sel) { sel = null; paint(); } });

      const total = () => p.parts.reduce((a, s) => a + s.v, 0);
      const selPart = () => p.parts.find((s) => s.id === sel) || null;
      const commit = () => { save(); paint(); };
      // zero stays reachable — 7 = 7 + 0 is a bond WRM teaches on purpose
      const setVal = (s, v) => { if (Number.isFinite(v)) s.v = clamp(Math.round(v * 100) / 100, 0, 9999); };
      // typing a new whole keeps the other parts and moves the last one
      const setWhole = (v) => {
        if (!Number.isFinite(v)) return;
        // with every part deleted the whole circle is still on the mat and
        // still editable — a typed whole then births the first part rather
        // than dying in silence ("the last part adjusts" needs a last part)
        if (!p.parts.length) {
          p.parts.push({ id: uid(), v: clamp(Math.round(v * 100) / 100, 0, 9999), c: 0 });
          return;
        }
        const last = p.parts[p.parts.length - 1];
        setVal(last, v - (total() - last.v));
      };
      // long numbers and labels shrink to stay inside their circle
      const fs = (text, d) => clamp(Math.min(Math.round(d * 0.36), Math.floor((d * 1.5) / String(text).length)), 12, 88);

      function addPart(after) {
        if (p.parts.length >= 6) { toast('Six parts is plenty for one whole.'); return; }
        const prev = after || p.parts[p.parts.length - 1];
        const s = { id: uid(), v: prev ? prev.v : 5, c: prev ? (prev.c + 1) % BM_COLORS.length : 0 };
        p.parts.splice(after ? p.parts.indexOf(after) + 1 : p.parts.length, 0, s);
        sel = s.id;
        focusVal = true;
        commit();
      }

      // counters: rows of five (ten-frame habit), whole numbers up to 20 only,
      // and never on a mystery — the dots would give the answer away
      function dotsEl(groups, d, popIdx) {
        const n = groups.reduce((a, [k]) => a + k, 0);
        if (!n || n > 20) return null;
        const cols = Math.min(5, n), rows = Math.ceil(n / 5);
        const size = clamp(Math.floor(Math.min((d * 0.72) / cols, (d * 0.56) / rows)) - 2, 7, 34);
        const box = el('span', { class: 'pw-dots', style: `--dot:${size}px;grid-template-columns:repeat(${cols}, ${size}px);` });
        let i = 0;
        for (const [k, c] of groups) {
          const [bg, bd] = c == null ? ['#e2e8f0', '#475569'] : BM_COLORS[c % BM_COLORS.length];
          for (let j = 0; j < k; j++, i++) {
            box.append(el('i', { class: i === popIdx ? 'bm-pop' : '', style: `background:${bg};border-color:${bd};` }));
          }
        }
        return box;
      }

      let diagEl = null, svgEl = null;
      // branches join circle centres and ride underneath the opaque circles,
      // so wrapped part rows and every orientation come out right for free
      function drawLines() {
        if (!diagEl || !diagEl.isConnected) return;
        const box = diagEl.getBoundingClientRect();
        if (!box.width) return;
        svgEl.setAttribute('width', box.width);
        svgEl.setAttribute('height', box.height);
        const mid = (n) => {
          const r = n.getBoundingClientRect();
          return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
        };
        const whole = diagEl.querySelector('.pw-whole');
        let html = '';
        if (whole) {
          const [x0, y0] = mid(whole);
          for (const n of diagEl.querySelectorAll('.pw-part')) {
            const [x1, y1] = mid(n);
            html += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
          }
        }
        svgEl.innerHTML = html;
      }
      // fit the diagram to the mat: measure at the current scale, normalise back
      // to scale 1, then rescale so it fills whichever dimension binds first —
      // resizing the widget is the size control. Gaps scale with the circles,
      // so the measurement stays linear; the 0.04 epsilon stops repaint loops.
      function fit() {
        if (!diagEl || !diagEl.isConnected || !mat.clientWidth) return;
        const w0 = diagEl.offsetWidth / fitScale, h0 = diagEl.offsetHeight / fitScale;
        if (!w0 || !h0) return;
        // 0.97 keeps the equilibrium comfortably inside the mat; shrink eagerly
        // (overflow is visible at once) but grow lazily (stops repaint churn)
        const s = clamp(Math.min((mat.clientWidth - 30) / w0, (mat.clientHeight - 30) / h0) * 0.97, 0.3, 3);
        if (s < fitScale - 0.01 || s > fitScale + 0.04) { fitScale = s; paint(); }
      }
      function refit() { fit(); drawLines(); }
      const ro = new ResizeObserver(() => refit());

      function paint() {
        mat.innerHTML = '';
        const d = Math.round(100 * fitScale);
        const D = Math.round(d * 1.14); // the whole reads as the bigger idea
        diagEl = el('div', { class: 'pw-diag o-' + (p.orient || 'top'), style: `gap:${Math.round(52 * fitScale)}px;` });
        svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('class', 'pw-lines');
        diagEl.append(svgEl);

        const t = total();
        const masked = p.whole === 'mask';
        const wtext = masked ? '?' : (p.wlabel || bmFmt(t));
        // the whole's counters keep each part's colour — unless a part is
        // hidden (counting one colour would leak the secret): then neutral
        const leak = p.parts.some((s) => s.hide || !Number.isInteger(s.v));
        // a tapped-in counter pops in the whole too — the compounding is the lesson
        let wPop = -1;
        if (dotPop != null) {
          if (leak) wPop = t - 1;
          else { let acc = 0; for (const x of p.parts) { acc += x.v; if (x.id === dotPop) { wPop = acc - 1; break; } } }
        }
        const wdots = p.counters && !masked && !p.wlabel && Number.isInteger(t) && t >= 1
          ? dotsEl(leak ? [[t, null]] : p.parts.map((s) => [s.v, s.c]), D, wPop) : null;
        const wholeEl = el('button', {
          class: 'pw-node pw-whole' + (sel === 'whole' ? ' active' : '') + (masked ? ' hidden-val' : ''),
          style: `width:${D}px;height:${D}px;font-size:${fs(wtext, D)}px;`,
          title: masked ? 'Tap to reveal the whole' : 'Tap to edit the whole',
          onclick: () => {
            if (masked) { p.whole = 'sum'; popId = 'whole'; commit(); return; } // the reveal moment
            sel = sel === 'whole' ? null : 'whole';
            focusVal = sel === 'whole';
            paint();
          },
        }, wdots || el('span', { class: 'pw-val' + (popId === 'whole' ? ' bm-pop' : '') }, wtext));

        const partsEl = el('div', { class: 'pw-parts', style: `gap:${Math.round(16 * fitScale)}px;` });
        for (const s of p.parts) {
          const active = sel === s.id;
          const [bg, bd] = BM_COLORS[s.c % BM_COLORS.length];
          const text = s.hide ? '?' : (s.label || bmFmt(s.v));
          const dots = p.counters && !s.hide && !s.label && Number.isInteger(s.v) && s.v >= 1 ? dotsEl([[s.v, s.c]], d, dotPop === s.id ? s.v - 1 : -1) : null;
          // counting in: while a part is selected in counters mode, every tap on it
          // drops one counter in — the whole circle is one fat target (tapping a
          // counter must NOT remove it: the dots sit dead-centre where fingers
          // land, so "−" in the toolbar is the only way to take one away)
          const countable = p.counters && !s.hide && !s.label && Number.isInteger(s.v);
          partsEl.append(el('button', {
            class: 'pw-node pw-part' + (active ? ' active' : '') + (s.hide ? ' hidden-val' : ''),
            style: `width:${d}px;height:${d}px;background:${s.fill === false ? '#fff' : bg};border-color:${bd};font-size:${fs(text, d)}px;`,
            title: s.hide ? 'Tap to reveal' : (active && countable ? 'Tap to count one in — “−” takes one away' : 'Tap to edit this part'),
            onclick: () => {
              if (s.hide) { s.hide = false; popId = s.id; commit(); return; } // the reveal moment
              if (active && countable) {
                if (s.v < 20) { setVal(s, s.v + 1); dotPop = s.id; commit(); }
                return; // at 20 the circle is full — stay put rather than deselect mid-count
              }
              sel = active ? null : s.id;
              focusVal = !active;
              paint();
            },
          }, dots || el('span', { class: 'pw-val' + (popId === s.id ? ' bm-pop' : '') }, text)));
        }

        diagEl.append(el('div', { class: 'pw-zone' }, wholeEl), partsEl);
        mat.append(diagEl);
        if (!p.parts.length) mat.append(el('div', { class: 'bm-empty' }, 'Tap “＋ part” to begin'));
        ro.disconnect();
        ro.observe(mat);
        ro.observe(diagEl);
        requestAnimationFrame(refit);
        popId = null;
        dotPop = null;
        paintSent();
        paintCtx();
        paintQuick();
        if (focusVal && vinEl) { vinEl.focus(); vinEl.select(); }
        focusVal = false;
      }

      // the part–whole model IS the fact family — WRM Y1 reads all four
      // addition/subtraction facts from one cherry. Hidden values stay ? here too.
      function sentences() {
        const n = p.parts.length;
        if (n < 2) return [];
        // labelled parts (x, 1/4…) only make true sentences against a teacher-set whole
        if (p.parts.some((s) => s.label) && !p.wlabel) return [];
        const disp = (s) => (s.hide ? '?' : (s.label || bmFmt(s.v)));
        const wd = p.whole === 'mask' ? '?' : (p.wlabel || bmFmt(total()));
        const equal = p.parts.every((s) => s.v === p.parts[0].v && !s.label);
        const out = [];
        if (n === 2) {
          const [a, b] = p.parts.map(disp);
          if (equal) out.push(`${a} + ${b} = ${wd}`, `${wd} − ${a} = ${b}`, `2 × ${a} = ${wd}`, `${wd} ÷ 2 = ${a}`);
          else out.push(`${a} + ${b} = ${wd}`, `${b} + ${a} = ${wd}`, `${wd} − ${a} = ${b}`, `${wd} − ${b} = ${a}`);
        } else if (equal) {
          out.push(`${n} × ${disp(p.parts[0])} = ${wd}`, `${wd} ÷ ${n} = ${disp(p.parts[0])}`);
        } else {
          out.push(p.parts.map(disp).join(' + ') + ' = ' + wd);
        }
        return out;
      }

      function paintSent() {
        sent.innerHTML = '';
        const show = p.sent && p.parts.length;
        sent.style.display = show ? '' : 'none';
        if (!show) return;
        for (const s of sentences()) sent.append(el('span', { class: 'bm-fact' }, s));
      }

      function paintCtx() {
        ctx.innerHTML = '';
        vinEl = null;
        const s = selPart();
        const isWhole = sel === 'whole';
        ctx.style.display = s || isWhole ? '' : 'none';
        if (!s && !isWhole) return;
        const finish = (e) => {
          if (e.key === 'Enter') { e.target.blur(); sel = null; paint(); }
          else if (e.key === 'Escape') { sel = null; paint(); }
        };
        if (isWhole) {
          vinEl = el('input', {
            class: 'bm-vin', inputmode: 'decimal', value: bmFmt(total()),
            title: 'Type a new whole — the last part adjusts to match',
            onchange: (e) => { setWhole(parseFloat(String(e.target.value).replace(',', '.'))); commit(); },
            onkeydown: finish,
          });
          ctx.append(
            el('span', { class: 'tq-step' },
              el('button', { class: 'tq-mini', onclick: () => { setWhole(total() - 1); commit(); } }, '−'),
              vinEl,
              el('button', { class: 'tq-mini', onclick: () => { setWhole(total() + 1); commit(); } }, '＋')),
            el('input', {
              class: 'bm-vin bm-lin', placeholder: 'label', value: p.wlabel || '',
              title: 'Show this on the whole instead of the sum — 20, y…',
              onchange: (e) => { p.wlabel = e.target.value.trim().slice(0, 12); commit(); },
            }),
            el('button', {
              class: 'tq-btn', title: 'Mask the whole as a mystery box',
              onclick: () => { p.whole = 'mask'; sel = null; commit(); },
            }, 'Hide ?'),
          );
          return;
        }
        vinEl = el('input', {
          class: 'bm-vin', inputmode: 'decimal', value: bmFmt(s.v),
          onchange: (e) => { setVal(s, parseFloat(String(e.target.value).replace(',', '.'))); commit(); },
          onkeydown: finish,
        });
        ctx.append(
          el('span', { class: 'tq-step' },
            el('button', { class: 'tq-mini', onclick: () => { setVal(s, s.v - 1); commit(); } }, '−'),
            vinEl,
            el('button', { class: 'tq-mini', onclick: () => { setVal(s, s.v + 1); commit(); } }, '＋')),
          el('input', {
            class: 'bm-vin bm-lin', placeholder: 'label', value: s.label || '',
            title: 'Show this on the part instead of its number — x, 1⁄4, apples…',
            onchange: (e) => { s.label = e.target.value.trim().slice(0, 12); commit(); },
          }),
          el('button', {
            class: 'tq-btn' + (s.hide ? ' active' : ''), title: 'Mask this value as a mystery box',
            onclick: () => { s.hide = !s.hide; commit(); },
          }, s.hide ? 'Hidden ?' : 'Hide ?'),
          el('button', {
            class: 'tq-btn bm-swatch', style: '--sw:' + BM_COLORS[s.c % BM_COLORS.length][0] + ';', title: 'Change colour',
            onclick: () => { s.c = (s.c + 1) % BM_COLORS.length; commit(); },
          }, el('span', { class: 'bm-swdot' }), 'Colour'),
          el('button', {
            class: 'tq-btn' + (s.fill === false ? ' active' : ''), title: 'White circle — WRM style, counters carry the colour',
            onclick: () => { s.fill = s.fill === false ? true : false; commit(); },
          }, 'Empty'),
          el('button', {
            class: 'tq-btn', title: 'Add an identical part next to this one',
            onclick: () => addPart(s),
          }, 'Copy'),
          el('button', {
            class: 'tq-btn', title: 'Remove this part',
            onclick: () => { p.parts = p.parts.filter((x) => x !== s); sel = null; commit(); },
          }, '✕ part'),
        );
      }

      function paintQuick() {
        quick.innerHTML = '';
        const ORIENTS = ['top', 'right', 'bottom', 'left'];
        quick.append(
          el('button', { class: 'tq-btn', onclick: () => addPart(selPart()) }, '＋ part'),
          el('button', {
            class: 'tq-btn', title: 'Turn the model — the whole isn’t always on top',
            onclick: () => { p.orient = ORIENTS[(ORIENTS.indexOf(p.orient || 'top') + 1) % 4]; commit(); },
          }, 'Turn'),
          el('button', {
            class: 'tq-btn' + (p.counters ? ' active' : ''), title: 'Show values as counters (whole numbers up to 20)',
            onclick: () => { p.counters = !p.counters; commit(); },
          }, 'Counters'),
          el('button', {
            class: 'tq-btn' + (p.sent ? ' active' : ''), title: 'Show the fact family under the model',
            onclick: () => { p.sent = !p.sent; commit(); },
          }, 'Facts'),
          el('button', {
            class: 'tq-btn', title: 'Mask every value',
            onclick: () => { for (const s of p.parts) s.hide = true; p.whole = 'mask'; commit(); },
          }, 'Hide all'),
          el('button', {
            class: 'tq-btn', title: 'Reveal every value',
            onclick: () => { for (const s of p.parts) s.hide = false; p.whole = 'sum'; commit(); },
          }, 'Show all'),
        );
      }

      paint();
      return () => ro.disconnect();
    },
    settings(box, w, api) {
      const preset = (label, make) => el('button', {
        class: 'btn ghost small',
        onclick: () => { Object.assign(w.props, make()); api.refresh(); },
      }, label);
      const P = (v, c, extra) => ({ id: uid(), v, c, ...extra });
      box.append(
        el('div', { class: 'hint' }, 'Start from a model:'),
        el('div', { class: 'row', style: 'flex-wrap:wrap;' },
          preset('Bonds to 10', () => ({ whole: 'sum', wlabel: '', parts: [P(6, 0), P(4, 1)] })),
          preset('Counters', () => ({ whole: 'sum', wlabel: '', counters: true, parts: [P(3, 0, { fill: false }), P(4, 1, { fill: false })] })),
          preset('Missing part', () => ({ whole: 'sum', wlabel: '', parts: [P(7, 0), P(3, 1, { hide: true })] })),
          preset('Missing whole', () => ({ whole: 'mask', wlabel: '', parts: [P(8, 3), P(5, 4)] })),
          preset('Three parts', () => ({ whole: 'sum', wlabel: '', parts: [P(5, 0), P(4, 1), P(3, 2)] })),
          preset('Tens and ones', () => ({ whole: 'sum', wlabel: '', counters: false, parts: [P(40, 2), P(5, 5)] })),
          preset('All hidden', () => ({ whole: 'mask', wlabel: '', parts: [P(6, 0, { hide: true }), P(4, 1, { hide: true })] })),
        ),
        settingRow('Whole sits', selectInput([['top', 'On top'], ['right', 'To the right'], ['bottom', 'Underneath'], ['left', 'To the left']], w.props.orient || 'top', (v) => { w.props.orient = v; api.refresh(); })),
        checkRow('Counters in the circles', w.props.counters, (v) => { w.props.counters = v; api.refresh(); }),
        checkRow('Fact family under the model', w.props.sent, (v) => { w.props.sent = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Tap a circle to edit it — or to reveal a mystery “?” · with Counters on, keep tapping the selected part to count one in at a time (“−” takes one away) — the whole’s counters grow with you · the whole always shows the parts’ total (type a new whole and the last part adjusts) · label parts for algebra or objects (x, apples) · “Empty” gives white WRM-style circles · “Turn” rotates the model · the model always fills the widget — drag the widget’s corner to make everything bigger or smaller.'),
      );
    },
  };

  // ---- Timer ----
  WIDGETS.timer = {
    title: 'Timer', icon: 'timer', accent: '#fde68a', w: 280, h: 210,
    defaults: () => ({ total: 300, remaining: 300, running: false, endAt: null, sound: true, repeat: 0, repeatLeft: 0 }),
    mount(body, w) {
      const disp = el('div', { class: 'time-display' });
      const dispWrap = el('div', { class: 'grow', style: 'display:grid;place-items:center;min-height:0;' }, disp);
      const bar = el('div', { class: 'timer-bar' }, el('div'));
      const startBtn = el('button', { class: 'btn', onclick: () => toggle() });
      const resetBtn = el('button', { class: 'btn ghost', onclick: () => reset() }, 'Reset');
      const presets = el('div', { class: 'center-row' },
        [1, 5, 10, 15].map((m) => el('button', {
          class: 'btn ghost small',
          onclick: () => { w.props.total = m * 60; reset(); },
        }, m + 'm')),
      );
      body.append(dispWrap, bar, el('div', { class: 'center-row', style: 'margin-bottom:6px;' }, startBtn, resetBtn), presets);
      const unfit = fitFont(disp, 4.6);

      let fired = false;
      const fmt = (s) => {
        s = Math.max(0, Math.ceil(s));
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      };
      const paint = () => {
        let rem = w.props.remaining;
        if (w.props.running && w.props.endAt) rem = (w.props.endAt - Date.now()) / 1000;
        rem = Math.max(0, rem);
        disp.textContent = fmt(rem);
        disp.classList.toggle('finished', rem <= 0 && w.props.total > 0);
        bar.firstChild.style.width = w.props.total ? (rem / w.props.total) * 100 + '%' : '0%';
        startBtn.textContent = w.props.running ? 'Pause' : 'Start';
        if (w.props.running && rem <= 0 && !fired) {
          if ((w.props.repeatLeft || 0) > 0) {
            // ring and roll straight into the next cycle (e.g. every 10 minutes)
            w.props.repeatLeft--;
            w.props.endAt = Date.now() + w.props.total * 1000;
            if (w.props.sound) beep(4);
            save();
            return;
          }
          fired = true;
          w.props.running = false;
          w.props.remaining = 0;
          if (w.props.sound) beep(4);
          save();
        }
      };
      const toggle = () => {
        if (w.props.running) {
          w.props.remaining = Math.max(0, (w.props.endAt - Date.now()) / 1000);
          w.props.running = false;
        } else {
          if (w.props.remaining <= 0) {
            w.props.remaining = w.props.total;
            w.props.repeatLeft = w.props.repeat || 0;
          }
          w.props.endAt = Date.now() + w.props.remaining * 1000;
          w.props.running = true;
          fired = false;
        }
        save(); paint();
      };
      const reset = () => {
        w.props.running = false;
        w.props.remaining = w.props.total;
        w.props.repeatLeft = w.props.repeat || 0;
        fired = false;
        save(); paint();
      };
      paint();
      const iv = setInterval(paint, 250);
      return () => { clearInterval(iv); unfit(); };
    },
    settings(box, w, api) {
      const mins = el('input', {
        class: 'text-input', type: 'number', min: 0, max: 599, value: Math.floor(w.props.total / 60), style: 'width:70px',
      });
      const secs = el('input', {
        class: 'text-input', type: 'number', min: 0, max: 59, value: Math.round(w.props.total % 60), style: 'width:70px',
      });
      const apply = () => {
        w.props.total = clamp((+mins.value || 0) * 60 + (+secs.value || 0), 1, 35999);
        w.props.remaining = w.props.total;
        w.props.running = false;
        api.refresh();
      };
      mins.addEventListener('change', apply);
      secs.addEventListener('change', apply);
      box.append(
        el('div', { class: 'row' }, el('span', {}, 'Duration'), mins, el('span', {}, 'min'), secs, el('span', {}, 'sec')),
        checkRow('Play sound when finished', w.props.sound, (v) => { w.props.sound = v; save(); }),
        settingRow('Repeat', el('input', {
          class: 'text-input', type: 'number', min: 0, max: 99, value: w.props.repeat || 0, style: 'width:70px',
          onchange: (e) => {
            w.props.repeat = clamp(+e.target.value || 0, 0, 99);
            w.props.repeatLeft = w.props.repeat;
            save();
          },
        }), el('span', { class: 'hint' }, 'extra rings, e.g. 2 = ring at 10, 20 and 30 min')),
      );
    },
  };

  // ---- Stopwatch ----
  WIDGETS.stopwatch = {
    title: 'Stopwatch', icon: 'stopwatch', accent: '#bae6fd', w: 280, h: 180,
    defaults: () => ({ elapsed: 0, running: false, startedAt: null }),
    mount(body, w) {
      const disp = el('div', { class: 'time-display' });
      const dispWrap = el('div', { class: 'grow', style: 'display:grid;place-items:center;min-height:0;' }, disp);
      const startBtn = el('button', { class: 'btn', onclick: () => toggle() });
      const resetBtn = el('button', {
        class: 'btn ghost',
        onclick: () => { w.props.running = false; w.props.elapsed = 0; save(); paint(); },
      }, 'Reset');
      body.append(dispWrap, el('div', { class: 'center-row' }, startBtn, resetBtn));
      const unfit = fitFont(disp, 5.6);
      const paint = () => {
        let ms = w.props.elapsed;
        if (w.props.running) ms += Date.now() - w.props.startedAt;
        const t = Math.floor(ms / 1000);
        const tenth = Math.floor((ms % 1000) / 100);
        disp.textContent =
          String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') + '.' + tenth;
        startBtn.textContent = w.props.running ? 'Pause' : 'Start';
      };
      const toggle = () => {
        if (w.props.running) {
          w.props.elapsed += Date.now() - w.props.startedAt;
          w.props.running = false;
        } else {
          w.props.startedAt = Date.now();
          w.props.running = true;
        }
        save(); paint();
      };
      paint();
      const iv = setInterval(paint, 100);
      return () => { clearInterval(iv); unfit(); };
    },
  };

  // ---- Traffic light ----
  WIDGETS.traffic = {
    title: 'Traffic light', icon: 'traffic', accent: '#d9f99d', w: 150, h: 300,
    defaults: () => ({ active: 'green' }),
    mount(body, w) {
      const wrap = el('div', { class: 'tl-wrap' });
      const bodyEl = el('div', { class: 'tl-body' });
      const lights = ['red', 'amber', 'green'].map((color) =>
        el('button', {
          class: 'tl-light ' + color,
          title: color,
          onclick: () => { w.props.active = w.props.active === color ? null : color; save(); paint(); },
        }),
      );
      bodyEl.append(...lights);
      wrap.append(bodyEl);
      body.append(wrap);
      const paint = () => {
        lights.forEach((l) => l.classList.toggle('on', l.title === w.props.active));
      };
      const size = () => {
        const d = Math.max(24, Math.min(wrap.clientWidth * 0.55, (wrap.clientHeight - 70) / 3));
        lights.forEach((l) => { l.style.width = l.style.height = d + 'px'; });
      };
      const ro = new ResizeObserver(size);
      ro.observe(wrap);
      paint(); size();
      return () => ro.disconnect();
    },
  };

  // ---- Text ----
  // fonts render as live previews (fetched from Google Fonts when online)
  const FONT_LIST = [
    ['Quicksand', "'Quicksand', ui-rounded, sans-serif"],
    ['Lexend', "'Lexend', sans-serif"],
    ['Poppins', "'Poppins', sans-serif"],
    ['Lilita One', "'Lilita One', sans-serif"],
    ['Pacifico', "'Pacifico', cursive"],
    ['Mali', "'Mali', cursive"],
    ['Graduate', "'Graduate', serif"],
    ['Hyperlegible', "'Atkinson Hyperlegible', sans-serif"],
    ['Serif', "Georgia, 'Times New Roman', serif"],
    ['Mono', "ui-monospace, Menlo, Consolas, monospace"],
  ];
  const textDefaults = () => (state.defaults && state.defaults.text) || {};
  WIDGETS.text = {
    title: 'Text', icon: 'text', accent: '#c7d2fe', w: 320, h: 200,
    defaults: () => ({
      html: '',
      size: textDefaults().size || 24,
      align: 'left',
      color: '#22303c',
      font: textDefaults().font || FONT_LIST[0][1],
    }),
    mount(body, w, api) {
      const ed = el('div', { class: 'text-edit', contenteditable: 'true' });
      // cleaned on the way in, not on the way out: a payload that arrived in a
      // shared template or an old backup is inert the moment it is displayed,
      // and the next edit saves the cleaned version over it
      ed.innerHTML = SageSanitize.html(w.props.html);
      ed.spellcheck = !!textDefaults().spell;
      const apply = () => {
        ed.style.fontSize = w.props.size + 'px';
        ed.style.textAlign = w.props.align;
        ed.style.color = w.props.color;
        ed.style.fontFamily = w.props.font || 'inherit';
      };
      apply();
      let deb = null;
      const queueSave = () => {
        clearTimeout(deb);
        deb = setTimeout(() => { w.props.html = ed.innerHTML; save(); }, 400);
      };
      ed.addEventListener('input', queueSave);
      ed.addEventListener('paste', (e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      });

      // floating formatting toolbar that sits atop the widget while editing
      const widgetEl = body.closest('.widget');
      const cmd = (command, value) => () => {
        ed.focus();
        document.execCommand(command, false, value);
        queueSave();
      };
      const tbBtn = (content, title, fn, cls) => {
        const b = el('button', { class: 'tb-btn' + (cls ? ' ' + cls : ''), title, onclick: fn }, content);
        // keep focus (and the text selection) in the editor while clicking toolbar buttons
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        return b;
      };
      const sep = () => el('span', { class: 'tb-sep' });
      const alignBtn = (align, icon) => tbBtn(iconEl(icon), 'Align ' + align, () => {
        w.props.align = align;
        apply(); save();
      });

      const fontName = () => {
        const hit = FONT_LIST.find(([, stack]) => stack === w.props.font);
        return hit ? hit[0] : 'Quicksand';
      };

      // one popover at a time, anchored under the toolbar
      let pop = null;
      const closePop = () => { if (pop) { pop.remove(); pop = null; } };
      const openPop = (kind, builder) => {
        if (pop && pop.dataset.kind === kind) { closePop(); return; }
        closePop();
        pop = el('div', { class: 'tb-pop' });
        pop.dataset.kind = kind;
        builder(pop);
        toolbar.append(pop);
      };

      const fontBtn = tbBtn(el('span', { class: 'tb-fontname' }, fontName()), 'Font', () => {
        openPop('font', (p) => {
          p.classList.add('tb-fontmenu');
          for (const [name, stack] of FONT_LIST) {
            p.append(el('button', {
              style: 'font-family:' + stack + ';',
              onclick: () => {
                w.props.font = stack;
                fontBtn.querySelector('.tb-fontname').textContent = name;
                apply(); save(); closePop();
              },
            }, name));
          }
        });
      }, 'tb-fontbtn');

      const sizeInput = el('input', {
        class: 'tb-size', type: 'number', min: 10, max: 120, value: w.props.size, title: 'Text size',
        onchange: () => {
          w.props.size = clamp(+sizeInput.value || 24, 10, 120);
          sizeInput.value = w.props.size;
          apply(); save();
        },
      });

      // color / highlight palettes with shared custom colors
      const PALETTE = [
        ['#0f172a', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#14b8a6', '#2563eb', '#7c3aed', '#db2777', '#ffffff'],
        ['#64748b', '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#99f6e4', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#f8fafc'],
      ];
      const openPalette = (kind, applyColor, allowNone) => {
        openPop(kind, (p) => {
          const swatch = (color, extraClass, fn) => {
            const b = el('button', { class: 'tb-swatch' + (extraClass ? ' ' + extraClass : ''), onclick: fn });
            if (color) b.style.background = color;
            b.addEventListener('pointerdown', (e) => e.preventDefault());
            return b;
          };
          for (const row of PALETTE) {
            p.append(el('div', { class: 'tb-swatch-row' },
              row.map((c) => swatch(c, null, () => { applyColor(c); closePop(); }))));
          }
          if (allowNone) {
            p.append(el('div', { class: 'tb-swatch-row' },
              swatch(null, 'tb-none', () => { applyColor('transparent'); closePop(); })));
          }
          const customRow = el('div', { class: 'tb-swatch-row' });
          for (const c of state.customColors) customRow.append(swatch(c, null, () => { applyColor(c); closePop(); }));
          const customInput = el('input', { type: 'color', style: 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;' });
          customInput.addEventListener('change', () => {
            const c = customInput.value;
            if (!state.customColors.includes(c)) {
              state.customColors = [...state.customColors, c].slice(-8);
              save();
            }
            applyColor(c);
            closePop();
          });
          customRow.append(el('button', { class: 'tb-swatch tb-add', title: 'Custom color', onclick: () => customInput.click() }, '＋'), customInput);
          p.append(el('div', { class: 'hint', style: 'margin:8px 0 4px;' }, 'Custom colors'), customRow);
        });
      };

      const colorBtn = tbBtn(el('span', { class: 'tb-cur' }), 'Text color', () => {
        openPalette('color', (c) => {
          ed.focus();
          document.execCommand('foreColor', false, c);
          colorBtn.querySelector('.tb-cur').style.background = c;
          queueSave();
        }, false);
      });
      colorBtn.querySelector('.tb-cur').style.background = '#0f172a';
      const highlightBtn = tbBtn(iconEl('marker'), 'Highlight', () => {
        openPalette('highlight', (c) => {
          ed.focus();
          document.execCommand('hiliteColor', false, c);
          queueSave();
        }, true);
      });

      // drag grip so the toolbar doubles as a move handle
      const grip = el('button', { class: 'tb-btn tb-grip', title: 'Move widget' }, iconEl('move'));
      grip.addEventListener('pointerdown', (e) => {
        if (w.locked) return;
        e.preventDefault();
        const sx = e.clientX - w.x, sy = e.clientY - w.y;
        const mv = (ev) => {
          w.x = clamp(ev.clientX - sx, -w.w + 60, window.innerWidth - 60);
          w.y = clamp(ev.clientY - sy, 0, window.innerHeight - 40);
          widgetEl.style.left = w.x + 'px';
          widgetEl.style.top = w.y + 'px';
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); save(); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      });

      const linkBtn = tbBtn(iconEl('chain'), 'Link', () => {
        // native prompt() kept the editor's selection alive because it never
        // touched the DOM; the dialog's input steals focus, so the selection
        // must be carried across by hand or createLink has nothing to wrap
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        promptDialog('Link URL:', 'https://', (raw) => {
          if (!raw || raw === 'https://') return;
          // the sink cleans a stored href on the next mount; this stops a
          // javascript: link being live and tappable in the meantime
          const url = SageSanitize.url(raw);
          if (!url) { toast('⚠️ Links need to start with https:// (or mailto:).'); return; }
          ed.focus();
          if (range) { sel.removeAllRanges(); sel.addRange(range); }
          document.execCommand('createLink', false, url);
          queueSave();
        });
      });

      const toolbar = el('div', { class: 'text-toolbar' },
        grip,
        fontBtn,
        sizeInput,
        sep(),
        tbBtn('B', 'Bold', cmd('bold'), 'b'),
        tbBtn('I', 'Italic', cmd('italic'), 'i'),
        tbBtn('U', 'Underline', cmd('underline'), 'u'),
        tbBtn('x²', 'Superscript', cmd('superscript')),
        tbBtn(iconEl('list'), 'Bullet list', cmd('insertUnorderedList')),
        linkBtn,
        sep(),
        alignBtn('left', 'alignl'), alignBtn('center', 'alignc'), alignBtn('right', 'alignr'),
        sep(),
        colorBtn,
        highlightBtn,
        sep(),
        tbBtn(iconEl('fit'), 'Resize to fit', () => api.resizeToFit()),
        tbBtn(iconEl('trash'), 'Remove widget', () => api.removeSelf()),
        tbBtn(iconEl('gear'), 'Settings', () => api.toggleSettings()),
        tbBtn(iconEl('dots'), 'More options', () => api.openMenu(), 'tb-menu'),
      );
      body.append(toolbar, ed);

      // the toolbar shows while the widget is selected (any click inside it),
      // and hides when clicking anywhere else. Pointer-driven rather than
      // focus-driven — focus events are unreliable in unfocused/embedded windows.
      const setEditing = (on) => {
        widgetEl.classList.toggle('editing', on);
        if (on) {
          const rect = widgetEl.getBoundingClientRect();
          // flip the toolbar underneath the widget when it would collide with the top bar
          toolbar.classList.toggle('below', rect.top < 120);
          // keep the toolbar (and its popovers) inside the viewport
          toolbar.style.left = '0px';
          requestAnimationFrame(() => {
            const shift = Math.min(0, window.innerWidth - 12 - rect.left - toolbar.offsetWidth);
            toolbar.style.left = Math.max(shift, -rect.left + 8) + 'px';
          });
        } else {
          closePop();
        }
      };
      const onDocPointer = (e) => {
        const inside = widgetEl.contains(e.target) || toolbar.contains(e.target);
        setEditing(inside);
        if (inside && pop && !pop.contains(e.target) && !e.target.closest('.tb-btn')) closePop();
      };
      document.addEventListener('pointerdown', onDocPointer);

      // a freshly added text widget is selected immediately, like clicking the dock tool
      if (autoEditId === w.id) {
        autoEditId = null;
        setEditing(true);
        setTimeout(() => ed.focus(), 30);
      }
      return () => document.removeEventListener('pointerdown', onDocPointer);
    },
    settings(box, w, api) {
      box.append(
        settingRow('Size', rangeInput(12, 96, w.props.size, (v) => { w.props.size = +v; api.refresh(); })),
        settingRow('Color', colorInput(w.props.color, (v) => { w.props.color = v; api.refresh(); })),
        el('div', { class: 'hint' }, 'Click into the text to get the formatting toolbar (bold, lists, alignment…).'),
      );
    },
  };

  // ---- Name picker ----
  WIDGETS.picker = {
    title: 'Name picker', icon: 'picker', accent: '#bae6fd', w: 300, h: 220,
    defaults: () => ({ list: null, remove: false, pool: null, last: '—' }),
    mount(body, w, api) {
      const result = el('div', { class: 'picker-result' }, w.props.last || '—');
      const pickBtn = el('button', { class: 'btn' }, 'Pick a name');
      const listSel = el('select', { class: 'text-input', style: 'width:auto;flex:1;min-width:0;' });
      const editBtn = el('button', { class: 'btn ghost small', onclick: () => openListManager(api.refreshAllOf('picker', 'groups')) }, 'Edit lists');
      body.append(
        result,
        el('div', { class: 'center-row', style: 'margin-bottom:8px;' }, pickBtn),
        el('div', { class: 'row' }, listSel, editBtn),
      );
      const unfit = fitFont(result, 9);

      const listNames = () => Object.keys(state.lists);
      const fillSelect = () => {
        listSel.innerHTML = '';
        for (const name of listNames()) listSel.append(el('option', { value: name }, name));
        if (!state.lists[w.props.list]) w.props.list = deckDefaultList();
        if (w.props.list) listSel.value = w.props.list;
      };
      fillSelect();
      listSel.addEventListener('change', () => {
        w.props.list = listSel.value;
        w.props.pool = null;
        save();
      });

      let rolling = false;
      let spinTimer = null;
      pickBtn.addEventListener('click', () => {
        if (rolling) return;
        const names = (state.lists[w.props.list] || []).filter(Boolean);
        if (!names.length) { toast('That list is empty — click "Edit lists" to add names.'); return; }
        let pool = names;
        if (w.props.remove) {
          if (!Array.isArray(w.props.pool) || !w.props.pool.length) w.props.pool = names.slice();
          pool = w.props.pool;
        }
        rolling = true;
        result.classList.add('rolling');
        let n = 0;
        spinTimer = setInterval(() => {
          result.textContent = names[Math.floor(Math.random() * names.length)];
          if (++n > 14) {
            clearInterval(spinTimer);
            const winner = pool[Math.floor(Math.random() * pool.length)];
            if (w.props.remove) w.props.pool = pool.filter((x) => x !== winner);
            result.textContent = winner;
            result.classList.remove('rolling');
            w.props.last = winner;
            rolling = false;
            save();
          }
        }, 70);
      });
      // a spin left running when the widget closes would keep writing a winner
      // into props the teacher just removed — stop it with the mount
      return () => { unfit(); clearInterval(spinTimer); };
    },
    settings(box, w, api) {
      box.append(
        checkRow('Remove picked names until list is used up', w.props.remove, (v) => { w.props.remove = v; w.props.pool = null; save(); }),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.pool = null; w.props.last = '—'; api.refresh(); } }, 'Reset picked names'),
      );
    },
  };

  // ---- Group maker ----
  WIDGETS.groups = {
    title: 'Group maker', icon: 'groups', accent: '#a7f3d0', w: 380, h: 260,
    defaults: () => ({ list: null, size: 3, mode: 'size', groups: [] }),
    mount(body, w, api) {
      const out = el('div', { class: 'groups-out' });
      const listSel = el('select', { class: 'text-input', style: 'width:auto;flex:1;min-width:0;' });
      const makeBtn = el('button', { class: 'btn small' }, 'Make groups');
      const editBtn = el('button', { class: 'btn ghost small', onclick: () => openListManager(api.refreshAllOf('picker', 'groups')) }, 'Lists');
      body.append(el('div', { class: 'row', style: 'margin-bottom:8px;' }, listSel, makeBtn, editBtn), out);

      const fillSelect = () => {
        listSel.innerHTML = '';
        for (const name of Object.keys(state.lists)) listSel.append(el('option', { value: name }, name));
        if (!state.lists[w.props.list]) w.props.list = deckDefaultList();
        if (w.props.list) listSel.value = w.props.list;
      };
      fillSelect();
      listSel.addEventListener('change', () => { w.props.list = listSel.value; save(); });

      const paint = () => {
        out.innerHTML = '';
        w.props.groups.forEach((g, i) => {
          out.append(el('div', { class: 'group-card' },
            el('h4', {}, 'Group ' + (i + 1)),
            el('div', {}, g.join(', ')),
          ));
        });
      };
      makeBtn.addEventListener('click', () => {
        const names = (state.lists[w.props.list] || []).filter(Boolean);
        if (names.length < 2) { toast('Need at least 2 names in the list.'); return; }
        const shuffled = names.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const n = clamp(+w.props.size || 2, 2, Math.max(2, names.length));
        const count = w.props.mode === 'size' ? Math.ceil(shuffled.length / n) : n;
        const groups = Array.from({ length: count }, () => []);
        shuffled.forEach((name, i) => groups[i % count].push(name));
        w.props.groups = groups;
        save(); paint();
      });
      paint();
    },
    settings(box, w, api) {
      box.append(
        settingRow('Split by', selectInput([['size', 'Group size'], ['count', 'Number of groups']], w.props.mode, (v) => { w.props.mode = v; save(); })),
        settingRow('Value', el('input', {
          class: 'text-input', type: 'number', min: 2, max: 30, value: w.props.size, style: 'width:80px',
          onchange: (e) => { w.props.size = clamp(+e.target.value || 2, 2, 30); save(); },
        })),
      );
    },
  };

  // ---- Dice ----
  WIDGETS.dice = {
    title: 'Dice', icon: 'dice', accent: '#c7d2fe', w: 260, h: 200,
    defaults: () => ({ count: 2, values: [3, 5], showTotal: true }),
    mount(body, w) {
      const row = el('div', { class: 'dice-row' });
      const total = el('div', { class: 'dice-total' });
      body.append(row, total);
      const PIPS = {
        1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
      };
      let rolling = false;
      const buildDie = (value) => {
        const d = el('div', { class: 'die', title: 'Click to roll' });
        for (let i = 0; i < 9; i++) d.append(el('span'));
        setDie(d, value);
        d.addEventListener('click', roll);
        return d;
      };
      const setDie = (d, value) => {
        [...d.children].forEach((s, i) => s.classList.toggle('on', PIPS[value].includes(i)));
        d.dataset.value = value;
      };
      const paint = () => {
        row.innerHTML = '';
        while (w.props.values.length < w.props.count) w.props.values.push(1 + Math.floor(Math.random() * 6));
        w.props.values = w.props.values.slice(0, w.props.count);
        w.props.values.forEach((v) => row.append(buildDie(v)));
        sizeDice();
        paintTotal();
      };
      const sizeDice = () => {
        const n = w.props.count;
        const s = Math.max(40, Math.min((row.clientWidth - 14 * n) / n, row.clientHeight - 10));
        [...row.children].forEach((d) => { d.style.width = s + 'px'; });
      };
      const paintTotal = () => {
        total.style.display = w.props.showTotal && w.props.count > 1 ? '' : 'none';
        total.textContent = 'Total: ' + w.props.values.reduce((a, b) => a + b, 0);
      };
      let rollTimer = null;
      function roll() {
        if (rolling) return;
        rolling = true;
        let n = 0;
        rollTimer = setInterval(() => {
          [...row.children].forEach((d) => setDie(d, 1 + Math.floor(Math.random() * 6)));
          if (++n > 9) {
            clearInterval(rollTimer);
            w.props.values = [...row.children].map((d) => +d.dataset.value);
            paintTotal();
            rolling = false;
            save();
          }
        }, 80);
      }
      const ro = new ResizeObserver(sizeDice);
      ro.observe(row);
      paint();
      this._paint = paint;
      // clearing the roll matters as much as the observer: a die closed
      // mid-roll kept writing to detached nodes and then save()d a widget
      // the teacher had already removed
      return () => { ro.disconnect(); clearInterval(rollTimer); };
    },
    settings(box, w, api) {
      box.append(
        settingRow('Number of dice', selectInput([[1, '1'], [2, '2'], [3, '3']], w.props.count, (v) => { w.props.count = +v; api.refresh(); })),
        checkRow('Show total', w.props.showTotal, (v) => { w.props.showTotal = v; api.refresh(); }),
      );
    },
  };

  // ---- Sound level meter ----
  WIDGETS.sound = {
    title: 'Noise meter', icon: 'sound', accent: '#fbcfe8', w: 320, h: 200,
    defaults: () => ({ sensitivity: 5, threshold: 0.55, alarm: true, alerts: 0 }),
    mount(body, w) {
      const cv = el('canvas', { class: 'sound-canvas' });
      const status = el('div', { class: 'sound-status' }, 'Click "Enable microphone" to start');
      const enableBtn = el('button', { class: 'btn', style: 'align-self:center;margin-top:4px;' }, 'Enable microphone');
      body.append(cv, status, enableBtn);
      let stream = null, ctx = null, raf = null;
      let smooth = 0;
      // like the timer's end-of-time chime: ring when the room stays too loud
      let overSince = null, lastAlert = 0;
      const checkAlarm = (over) => {
        const now = performance.now();
        if (!over) { overSince = null; return; }
        if (overSince === null) overSince = now;
        if (w.props.alarm && now - overSince > 700 && now - lastAlert > 6000) {
          lastAlert = now;
          w.props.alerts = (w.props.alerts || 0) + 1;
          beep(2);
          save();
        }
      };
      const start = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          status.textContent = 'Microphone unavailable';
          return;
        }
        enableBtn.style.display = 'none';
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
          const rms = Math.sqrt(sum / buf.length);
          const level = clamp(rms * w.props.sensitivity, 0, 1);
          smooth = smooth * 0.85 + level * 0.15;
          const c = cv.getContext('2d');
          const W = (cv.width = cv.clientWidth * 2);
          const H = (cv.height = cv.clientHeight * 2);
          c.clearRect(0, 0, W, H);
          const segs = 24;
          const over = smooth > w.props.threshold;
          checkAlarm(over);
          for (let i = 0; i < segs; i++) {
            const frac = i / segs;
            c.fillStyle = frac < smooth
              ? (frac > w.props.threshold ? '#ef4444' : frac > w.props.threshold * 0.72 ? '#f59e0b' : '#22c55e')
              : 'rgba(34,48,60,0.12)';
            const sw = W / segs;
            c.beginPath();
            c.roundRect(i * sw + 2, H * (1 - (0.35 + frac * 0.65)), sw - 4, H * (0.35 + frac * 0.65), 6);
            c.fill();
          }
          const state = over ? '🔴 Too loud!' : smooth > w.props.threshold * 0.72 ? '🟡 Getting noisy' : '🟢 Nice and calm';
          status.textContent = w.props.alerts > 0 ? `${state} · ${w.props.alerts} alert${w.props.alerts === 1 ? '' : 's'}` : state;
          raf = requestAnimationFrame(draw);
        };
        draw();
      };
      enableBtn.addEventListener('click', start);
      return () => {
        cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        if (ctx) ctx.close();
      };
    },
    settings(box, w, api) {
      box.append(
        settingRow('Sensitivity', rangeInput(1, 15, w.props.sensitivity, (v) => { w.props.sensitivity = +v; save(); })),
        settingRow('Alert level', rangeInput(20, 95, w.props.threshold * 100, (v) => { w.props.threshold = v / 100; save(); })),
        checkRow('Play sound when too loud', w.props.alarm, (v) => { w.props.alarm = v; save(); }),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.alerts = 0; api.refresh(); } }, 'Reset alert counter'),
      );
    },
  };

  // ---- Work symbols ----
  const SYMBOLS = [
    ['quiet', 'Work in silence', '#fecaca'],
    ['symbols', 'Whisper voices', '#ddd6fe'],
    ['groups', 'Work together', '#a7f3d0'],
    ['help', 'Ask for help', '#bae6fd'],
    ['headphones', 'Headphones OK', '#c7d2fe'],
    ['happy', 'Break time', '#fde68a'],
  ];
  WIDGETS.symbols = {
    title: 'Work mode', icon: 'symbols', accent: '#ddd6fe', w: 260, h: 220,
    defaults: () => ({ active: 0 }),
    mount(body, w) {
      const face = el('div', { class: 'symbol-face' });
      const label = el('div', { class: 'symbol-label' });
      const display = el('div', { class: 'symbol-display' }, face, label);
      const picker = el('div', { class: 'symbol-picker' });
      SYMBOLS.forEach(([icon, title, acc], i) => {
        picker.append(el('button', {
          title, style: '--acc:' + acc,
          onclick: () => { w.props.active = i; save(); paint(); },
        }, iconEl(icon)));
      });
      body.append(display, picker);
      const paint = () => {
        const [icon, l, acc] = SYMBOLS[w.props.active] || SYMBOLS[0];
        face.innerHTML = SageIcons.icon(icon);
        face.style.setProperty('--acc', acc);
        label.textContent = l;
        [...picker.children].forEach((b, i) => b.classList.toggle('active', i === w.props.active));
      };
      const size = () => {
        const s = Math.min(display.clientHeight * 0.62, display.clientWidth * 0.5);
        face.style.fontSize = Math.max(32, s) + 'px';
        label.style.fontSize = Math.max(13, s * 0.24) + 'px';
      };
      const ro = new ResizeObserver(size);
      ro.observe(display);
      paint(); size();
      return () => ro.disconnect();
    },
  };

  // ---- Poll ----
  WIDGETS.poll = {
    title: 'Poll', icon: 'poll', accent: '#99f6e4', w: 360, h: 260,
    defaults: () => ({ question: 'What do you think?', options: [{ label: 'Option A', votes: 0 }, { label: 'Option B', votes: 0 }, { label: 'Option C', votes: 0 }] }),
    mount(body, w) {
      const q = el('div', { class: 'poll-question' });
      const opts = el('div', { class: 'poll-options' });
      body.append(q, opts);
      const paint = () => {
        q.textContent = w.props.question;
        opts.innerHTML = '';
        const max = Math.max(1, ...w.props.options.map((o) => o.votes));
        w.props.options.forEach((o) => {
          const bar = el('div', { class: 'bar', style: 'width:' + (o.votes / max) * 100 + '%' });
          const wrap = el('div', { class: 'bar-wrap' }, bar,
            el('div', { class: 'bar-label' }, el('span', {}, o.label), el('span', {}, String(o.votes))));
          opts.append(el('div', { class: 'poll-opt' },
            wrap,
            el('button', { class: 'btn ghost small vote', title: 'Add a vote', onclick: () => { o.votes++; save(); paint(); } }, '＋'),
          ));
        });
      };
      paint();
      this._paint = paint;
    },
    settings(box, w, api) {
      box.append(
        settingRow('Question', el('input', {
          class: 'text-input', value: w.props.question,
          onchange: (e) => { w.props.question = e.target.value; api.refresh(); },
        })),
        el('div', { class: 'hint' }, 'Options (one per line):'),
        el('textarea', {
          class: 'text-input', rows: 4,
          onchange: (e) => {
            const labels = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8);
            w.props.options = labels.map((label) => {
              const old = w.props.options.find((o) => o.label === label);
              return { label, votes: old ? old.votes : 0 };
            });
            api.refresh();
          },
        }, w.props.options.map((o) => o.label).join('\n')),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.options.forEach((o) => { o.votes = 0; }); api.refresh(); } }, 'Reset votes'),
      );
    },
  };

  // ---- QR code ----
  WIDGETS.qr = {
    title: 'QR code', icon: 'qr', accent: '#a7f3d0', w: 240, h: 280,
    defaults: () => ({ text: 'https://example.com', caption: '' }),
    mount(body, w) {
      const cv = el('canvas');
      const wrap = el('div', { class: 'media-fill' }, cv);
      const cap = el('div', { style: 'text-align:center;font-weight:600;font-size:14px;padding-top:6px;' });
      body.append(wrap, cap);
      const paint = () => {
        SageQR.drawQR(cv, w.props.text || '', 480);
        cap.textContent = w.props.caption;
        cap.style.display = w.props.caption ? '' : 'none';
      };
      paint();
      this._paint = paint;
    },
    settings(box, w, api) {
      box.append(
        settingRow('Link / text', el('input', {
          class: 'text-input', value: w.props.text,
          onchange: (e) => { w.props.text = e.target.value.trim(); api.refresh(); },
        })),
        settingRow('Caption', el('input', {
          class: 'text-input', value: w.props.caption,
          onchange: (e) => { w.props.caption = e.target.value; api.refresh(); },
        })),
      );
    },
  };

  // ---- Image ----
  WIDGETS.image = {
    title: 'Image', icon: 'image', accent: '#d9f99d', w: 320, h: 240,
    defaults: () => ({ src: null, fit: 'contain' }),
    mount(body, w, api) {
      const wrap = el('div', { class: 'media-fill' });
      body.append(wrap);
      if (w.props.src) {
        const img = el('img', { src: w.props.src, alt: '' });
        img.classList.toggle('cover', w.props.fit === 'cover');
        wrap.append(img);
      } else {
        const pick = el('button', { class: 'btn' }, 'Choose image…');
        pick.addEventListener('click', () => pickImage((dataUrl) => { w.props.src = dataUrl; api.refresh(); }));
        wrap.append(el('div', { style: 'text-align:center;display:grid;gap:8px;justify-items:center;--acc:#d9f99d;' },
          el('div', { style: 'font-size:38px;color:var(--ink-soft);' }, iconEl('image')), pick,
          el('div', { class: 'hint' }, 'Stored locally on this device'),
        ));
      }
    },
    settings(box, w, api) {
      box.append(
        el('button', { class: 'btn ghost small', onclick: () => pickImage((d) => { w.props.src = d; api.refresh(); }) }, 'Replace image…'),
        settingRow('Fit', selectInput([['contain', 'Fit inside'], ['cover', 'Fill frame']], w.props.fit, (v) => { w.props.fit = v; api.refresh(); })),
        el('button', { class: 'btn danger small', onclick: () => { w.props.src = null; api.refresh(); } }, 'Remove image'),
      );
    },
  };

  // ---- Embed ----
  WIDGETS.embed = {
    title: 'Embed', icon: 'embed', accent: '#ddd6fe', w: 420, h: 300,
    defaults: () => ({ url: '' }),
    mount(body, w) {
      const wrap = el('div', { class: 'media-fill' });
      body.append(wrap);
      if (w.props.url) {
        wrap.append(el('iframe', {
          src: w.props.url,
          sandbox: 'allow-scripts allow-same-origin allow-presentation',
          allow: 'autoplay; encrypted-media',
        }));
      } else {
        wrap.append(el('div', { class: 'hint', style: 'text-align:center;padding:10px;' },
          'Open ⚙ settings and paste a URL (e.g. a YouTube embed link). Some sites refuse to be embedded.'));
      }
    },
    settings(box, w, api) {
      box.append(settingRow('URL', el('input', {
        class: 'text-input', value: w.props.url, placeholder: 'https://…',
        onchange: (e) => {
          let u = e.target.value.trim();
          if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
          const yt = u.match(/youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)/);
          if (yt) u = 'https://www.youtube.com/embed/' + (yt[1] || yt[2]);
          w.props.url = u;
          api.refresh();
        },
      })));
    },
  };

  // ---- Agenda ----
  WIDGETS.agenda = {
    title: 'Agenda', icon: 'agenda', accent: '#fed7aa', w: 300, h: 280,
    defaults: () => ({ items: [{ id: uid(), time: '09:00', text: 'Welcome', done: false }] }),
    mount(body, w, api) {
      const list = el('div', { class: 'agenda-list' });
      const timeIn = el('input', { class: 'text-input', type: 'time', style: 'width:auto;' });
      const textIn = el('input', { class: 'text-input', placeholder: 'Add item…', style: 'flex:1;min-width:0;' });
      const add = () => {
        if (!textIn.value.trim()) return;
        w.props.items.push({ id: uid(), time: timeIn.value, text: textIn.value.trim(), done: false });
        textIn.value = '';
        save(); paint();
      };
      textIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      body.append(list, el('div', { class: 'row', style: 'margin-top:8px;flex-shrink:0;' },
        timeIn, textIn, el('button', { class: 'btn small', onclick: add }, '＋')));
      const paint = () => {
        list.innerHTML = '';
        for (const item of w.props.items) {
          const row = el('div', { class: 'agenda-item' + (item.done ? ' done' : '') },
            el('input', {
              type: 'checkbox', ...(item.done ? { checked: '' } : {}),
              onchange: (e) => { item.done = e.target.checked; save(); paint(); },
            }),
            item.time ? el('span', { class: 'agenda-time' }, item.time) : null,
            el('span', { class: 'agenda-text' }, item.text),
            el('button', {
              class: 'rm', title: 'Remove',
              onclick: () => { w.props.items = w.props.items.filter((x) => x.id !== item.id); save(); paint(); },
            }, '✕'),
          );
          list.append(row);
        }
        if (!w.props.items.length) list.append(el('div', { class: 'hint', style: 'text-align:center;padding:14px;' }, 'No items yet — add your plan below.'));
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        el('button', { class: 'btn ghost small', onclick: () => { w.props.items.forEach((i) => { i.done = false; }); api.refresh(); } }, 'Uncheck all'),
        el('button', { class: 'btn danger small', onclick: () => { w.props.items = []; api.refresh(); } }, 'Clear all items'),
      );
    },
  };

  // ---- Visual timer (depleting disc) ----
  WIDGETS.visualtimer = {
    title: 'Visual timer', icon: 'visualtimer', accent: '#fecaca', w: 280, h: 310,
    defaults: () => ({ total: 300, remaining: 300, running: false, endAt: null, sound: true, color: '#ef4444' }),
    mount(body, w) {
      const cv = el('canvas', { style: 'flex:1;min-height:0;width:100%;' });
      const startBtn = el('button', { class: 'btn', onclick: () => toggle() });
      const resetBtn = el('button', { class: 'btn ghost', onclick: () => reset() }, 'Reset');
      const presets = el('div', { class: 'center-row' },
        [1, 5, 10, 15].map((m) => el('button', {
          class: 'btn ghost small',
          onclick: () => { w.props.total = m * 60; reset(); },
        }, m + 'm')));
      body.append(cv, el('div', { class: 'center-row', style: 'margin:6px 0;' }, startBtn, resetBtn), presets);

      let fired = false;
      const remaining = () => {
        let rem = w.props.remaining;
        if (w.props.running && w.props.endAt) rem = (w.props.endAt - Date.now()) / 1000;
        return Math.max(0, rem);
      };
      const paint = () => {
        const rem = remaining();
        startBtn.textContent = w.props.running ? 'Pause' : 'Start';
        if (w.props.running && rem <= 0 && !fired) {
          fired = true;
          w.props.running = false;
          w.props.remaining = 0;
          if (w.props.sound) beep(4);
          save();
        }
        const rect = cv.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;
        const dpr = window.devicePixelRatio || 1;
        cv.width = rect.width * dpr;
        cv.height = rect.height * dpr;
        const c = cv.getContext('2d');
        c.scale(dpr, dpr);
        const cx = rect.width / 2, cy = rect.height / 2;
        const r = Math.min(rect.width, rect.height) / 2 - 6;
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(34,48,60,0.25)'; c.stroke();
        const frac = w.props.total ? rem / w.props.total : 0;
        if (frac > 0) {
          c.beginPath();
          c.moveTo(cx, cy);
          c.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
          c.closePath();
          c.fillStyle = w.props.color;
          c.fill();
        }
        for (let i = 0; i < 12; i++) {
          c.save(); c.translate(cx, cy); c.rotate((i * Math.PI) / 6);
          c.beginPath(); c.moveTo(0, -r + 2); c.lineTo(0, -r + (i % 3 === 0 ? 10 : 6));
          c.lineWidth = i % 3 === 0 ? 2.5 : 1.5; c.strokeStyle = 'rgba(34,48,60,0.5)'; c.stroke(); c.restore();
        }
        // time bubble in the middle
        c.beginPath(); c.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.lineWidth = 1.5; c.strokeStyle = 'rgba(34,48,60,0.2)'; c.stroke();
        const s = Math.ceil(rem);
        c.fillStyle = rem <= 0 && w.props.total > 0 ? '#dc2626' : '#22303c';
        c.font = '800 ' + r * 0.22 + 'px ui-rounded, system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'), cx, cy);
      };
      const toggle = () => {
        if (w.props.running) {
          w.props.remaining = remaining();
          w.props.running = false;
        } else {
          if (w.props.remaining <= 0) w.props.remaining = w.props.total;
          w.props.endAt = Date.now() + w.props.remaining * 1000;
          w.props.running = true;
          fired = false;
        }
        save(); paint();
      };
      const reset = () => { w.props.running = false; w.props.remaining = w.props.total; fired = false; save(); paint(); };
      paint();
      const iv = setInterval(paint, 200);
      const ro = new ResizeObserver(paint);
      ro.observe(cv);
      return () => { clearInterval(iv); ro.disconnect(); };
    },
    settings(box, w, api) {
      const mins = el('input', { class: 'text-input', type: 'number', min: 0, max: 599, value: Math.floor(w.props.total / 60), style: 'width:70px' });
      const secs = el('input', { class: 'text-input', type: 'number', min: 0, max: 59, value: Math.round(w.props.total % 60), style: 'width:70px' });
      const apply = () => {
        w.props.total = clamp((+mins.value || 0) * 60 + (+secs.value || 0), 1, 35999);
        w.props.remaining = w.props.total;
        w.props.running = false;
        api.refresh();
      };
      mins.addEventListener('change', apply);
      secs.addEventListener('change', apply);
      box.append(
        el('div', { class: 'row' }, el('span', {}, 'Duration'), mins, el('span', {}, 'min'), secs, el('span', {}, 'sec')),
        settingRow('Disc color', colorInput(w.props.color, (v) => { w.props.color = v; save(); })),
        checkRow('Play sound when finished', w.props.sound, (v) => { w.props.sound = v; save(); }),
      );
    },
  };

  // ---- Calendar ----
  WIDGETS.calendar = {
    title: 'Calendar', icon: 'calendar', accent: '#fecaca', w: 320, h: 320,
    defaults: () => ({ offset: 0, weekStart: 1 }),
    mount(body, w) {
      const title = el('button', { class: 'cal-title', title: 'Back to this month', onclick: () => { w.props.offset = 0; save(); paint(); } });
      const head = el('div', { class: 'cal-head' },
        el('button', { class: 'btn ghost small', onclick: () => { w.props.offset--; save(); paint(); } }, '‹'),
        title,
        el('button', { class: 'btn ghost small', onclick: () => { w.props.offset++; save(); paint(); } }, '›'));
      const grid = el('div', { class: 'cal-grid' });
      body.append(head, grid);
      const paint = () => {
        const now = new Date();
        const base = new Date(now.getFullYear(), now.getMonth() + w.props.offset, 1);
        title.textContent = base.toLocaleDateString([], { month: 'long', year: 'numeric' });
        grid.innerHTML = '';
        const ws = w.props.weekStart; // 1 = Monday, 0 = Sunday
        const dowRef = new Date(2024, 0, ws === 1 ? 1 : 7); // a known Monday / Sunday
        for (let i = 0; i < 7; i++) {
          const d = new Date(dowRef);
          d.setDate(dowRef.getDate() + i);
          grid.append(el('div', { class: 'cal-dow' }, d.toLocaleDateString([], { weekday: 'narrow' })));
        }
        const lead = (base.getDay() - ws + 7) % 7;
        const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        const prevDays = new Date(base.getFullYear(), base.getMonth(), 0).getDate();
        const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
        for (let i = 0; i < cells; i++) {
          const dayNum = i - lead + 1;
          let label, other = false;
          if (dayNum < 1) { label = prevDays + dayNum; other = true; }
          else if (dayNum > daysInMonth) { label = dayNum - daysInMonth; other = true; }
          else label = dayNum;
          const isToday = !other && w.props.offset === 0 && dayNum === now.getDate();
          grid.append(el('div', { class: 'cal-day' + (other ? ' other' : '') + (isToday ? ' today' : '') }, String(label)));
        }
      };
      paint();
      const iv = setInterval(paint, 60000); // roll over at midnight
      return () => clearInterval(iv);
    },
    settings(box, w, api) {
      box.append(settingRow('Week starts', selectInput([[1, 'Monday'], [0, 'Sunday']], w.props.weekStart, (v) => { w.props.weekStart = +v; api.refresh(); })));
    },
  };

  // ---- Event countdown ----
  WIDGETS.countdown = {
    title: 'Countdown', icon: 'countdown', accent: '#fbcfe8', w: 320, h: 210,
    defaults: () => ({
      label: 'Our event',
      date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      time: '09:00',
    }),
    mount(body, w) {
      const label = el('div', { class: 'count-label' });
      const main = el('div', { class: 'count-main' }, el('span'));
      const sub = el('div', { class: 'count-sub' });
      body.append(label, main, sub);
      const unfit = fitFont(main.firstChild, 6);
      const pad = (n) => String(n).padStart(2, '0');
      const paint = () => {
        label.textContent = w.props.label;
        const target = new Date(w.props.date + 'T' + (w.props.time || '00:00'));
        if (isNaN(target)) { main.firstChild.textContent = '—'; sub.textContent = 'Set a date in ⚙'; return; }
        const diff = target - Date.now();
        if (diff <= 0) {
          main.firstChild.textContent = '🎉';
          sub.textContent = "It's here!";
          return;
        }
        const d = Math.floor(diff / 864e5);
        const h = Math.floor(diff / 36e5) % 24;
        const m = Math.floor(diff / 6e4) % 60;
        const s = Math.floor(diff / 1e3) % 60;
        if (d > 0) {
          main.firstChild.textContent = d + (d === 1 ? ' day' : ' days');
          sub.textContent = `and ${h}h ${m}m`;
        } else {
          main.firstChild.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
          sub.textContent = 'to go';
        }
      };
      paint();
      const iv = setInterval(paint, 500);
      return () => { clearInterval(iv); unfit(); };
    },
    settings(box, w, api) {
      box.append(
        settingRow('Event', el('input', { class: 'text-input', value: w.props.label, onchange: (e) => { w.props.label = e.target.value; api.refresh(); } })),
        settingRow('Date', el('input', { class: 'text-input', type: 'date', value: w.props.date, style: 'width:auto;', onchange: (e) => { w.props.date = e.target.value; api.refresh(); } })),
        settingRow('Time', el('input', { class: 'text-input', type: 'time', value: w.props.time, style: 'width:auto;', onchange: (e) => { w.props.time = e.target.value; api.refresh(); } })),
      );
    },
  };

  // ---- Video ----
  WIDGETS.video = {
    title: 'Video', icon: 'video', accent: '#fecaca', w: 420, h: 300,
    defaults: () => ({ url: '' }),
    mount(body, w) {
      const wrap = el('div', { class: 'media-fill' });
      body.append(wrap);
      const u = w.props.url;
      if (!u) {
        wrap.append(el('div', { class: 'hint', style: 'text-align:center;padding:10px;' },
          'Open ⚙ settings and paste a YouTube link or a direct video URL (.mp4, .webm).'));
      } else if (/youtube\.com\/embed\//.test(u)) {
        wrap.append(el('iframe', { src: u, allow: 'autoplay; fullscreen; encrypted-media', allowfullscreen: '' }));
      } else {
        wrap.append(el('video', { src: u, controls: '', playsinline: '' }));
      }
    },
    settings(box, w, api) {
      box.append(settingRow('URL', el('input', {
        class: 'text-input', value: w.props.url, placeholder: 'https://…',
        onchange: (e) => {
          let u = e.target.value.trim();
          if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
          const yt = u.match(/youtube\.com\/watch\?v=([\w-]+)|youtu\.be\/([\w-]+)|youtube\.com\/shorts\/([\w-]+)/);
          if (yt) u = 'https://www.youtube.com/embed/' + (yt[1] || yt[2] || yt[3]);
          w.props.url = u;
          api.refresh();
        },
      })));
    },
  };

  // ---- Webcam ----
  WIDGETS.webcam = {
    title: 'Webcam', icon: 'webcam', accent: '#bae6fd', w: 380, h: 300,
    defaults: () => ({ mirror: true, auto: false }),
    mount(body, w, api) {
      const wrap = el('div', { class: 'media-fill' });
      body.append(wrap);
      let stream = null;
      const start = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } } });
        } catch (e) {
          wrap.innerHTML = '';
          wrap.append(el('div', { class: 'hint' }, 'Camera unavailable'));
          return;
        }
        if (!w.props.auto) { w.props.auto = true; save(); }
        const video = el('video', { autoplay: '', playsinline: '', muted: '', class: w.props.mirror ? 'mirror' : '' });
        video.srcObject = stream;
        wrap.innerHTML = '';
        wrap.append(video);
      };
      if (w.props.auto) {
        start();
      } else {
        wrap.append(el('div', { style: 'text-align:center;display:grid;gap:8px;justify-items:center;--acc:#bae6fd;' },
          el('div', { style: 'font-size:38px;color:var(--ink-soft);' }, iconEl('webcam')),
          el('button', { class: 'btn', onclick: start }, 'Enable camera'),
          el('div', { class: 'hint' }, 'The video never leaves this device'),
        ));
      }
      return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
    },
    settings(box, w, api) {
      box.append(checkRow('Mirror image', w.props.mirror, (v) => { w.props.mirror = v; api.refresh(); }));
    },
  };

  // ---- Document ----
  // Local document files stay in memory for this tab only. The widget keeps its
  // original `pdf` type id so documents in existing decks remain compatible.
  const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.doc,.docx,.ppt,.pptx';
  const DOCUMENT_TEXT_LIMIT = 1_000_000;
  const sessionFiles = Object.create(null);

  function documentKind(record) {
    const type = ((record && record.type) || '').toLowerCase();
    const name = ((record && record.name) || '').split(/[?#]/)[0].toLowerCase();
    if (type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)) return 'image';
    if (type === 'text/plain' || /\.txt$/.test(name)) return 'text';
    if (type === 'text/csv' || type === 'application/csv' || /\.csv$/.test(name)) return 'csv';
    if (/\.(doc|docx)$/.test(name) || /wordprocessingml|msword/.test(type)) return 'word';
    if (/\.(ppt|pptx)$/.test(name) || /presentationml|powerpoint/.test(type)) return 'powerpoint';
    return 'unknown';
  }

  function clearSessionFile(widgetId) {
    const record = sessionFiles[widgetId];
    if (record && record.url) URL.revokeObjectURL(record.url);
    delete sessionFiles[widgetId];
  }

  function setSessionFile(widgetId, file) {
    clearSessionFile(widgetId);
    sessionFiles[widgetId] = {
      file,
      url: URL.createObjectURL(file),
      type: file.type || '',
      name: file.name || 'Untitled document',
    };
  }

  function pickDocumentFile(w, api) {
    const input = el('input', { type: 'file', accept: DOCUMENT_ACCEPT });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const record = { type: file.type, name: file.name };
      if (documentKind(record) === 'unknown') {
        toast('That file type cannot be previewed here');
        return;
      }
      setSessionFile(w.id, file);
      w.props.url = '';
      api.refresh();
    });
    input.click();
  }

  function documentMessage(title, detail, w, api) {
    return el('div', { class: 'document-message' },
      el('div', { class: 'document-message-icon', style: '--acc:#fed7aa;' }, iconEl('pdf')),
      el('strong', {}, title),
      el('div', {}, detail),
      el('button', { class: 'btn small', onclick: () => pickDocumentFile(w, api) }, 'Choose a different file…'));
  }

  function renderTextDocument(wrap, file) {
    let active = true;
    const scroll = el('div', { class: 'document-scroll' });
    const pre = el('pre', { class: 'document-text' }, 'Loading…');
    scroll.append(pre);
    wrap.append(scroll);
    file.slice(0, DOCUMENT_TEXT_LIMIT).text().then((text) => {
      if (!active) return;
      pre.textContent = text || 'This file is empty.';
      if (file.size > DOCUMENT_TEXT_LIMIT) {
        scroll.append(el('div', { class: 'document-note' }, 'Preview truncated after 1 MB.'));
      }
    }).catch(() => {
      if (active) pre.textContent = 'This text file could not be read.';
    });
    return () => { active = false; };
  }

  function parseCsvPreview(text, maxRows, maxColumns) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let truncated = false;

    const pushField = () => {
      if (row.length < maxColumns) row.push(field);
      else truncated = true;
      field = '';
    };
    const pushRow = () => {
      pushField();
      if (rows.length < maxRows) rows.push(row);
      else truncated = true;
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        pushField();
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        pushRow();
        if (rows.length >= maxRows) { truncated = i < text.length - 1; break; }
      } else {
        field += ch;
      }
    }
    if ((field || row.length) && rows.length < maxRows) pushRow();
    return { rows, truncated };
  }

  function renderCsvDocument(wrap, file) {
    let active = true;
    const scroll = el('div', { class: 'document-scroll' },
      el('div', { class: 'document-loading' }, 'Loading table…'));
    wrap.append(scroll);
    file.slice(0, DOCUMENT_TEXT_LIMIT).text().then((text) => {
      if (!active) return;
      const result = parseCsvPreview(text, 250, 50);
      scroll.innerHTML = '';
      if (!result.rows.length) {
        scroll.append(el('div', { class: 'document-loading' }, 'This CSV file is empty.'));
        return;
      }
      const table = el('table', { class: 'document-table' });
      result.rows.forEach((cells, rowIndex) => {
        const tr = el('tr');
        cells.forEach((cell) => tr.append(el(rowIndex === 0 ? 'th' : 'td', {}, cell)));
        table.append(tr);
      });
      scroll.append(table);
      if (result.truncated || file.size > DOCUMENT_TEXT_LIMIT) {
        scroll.append(el('div', { class: 'document-note' }, 'Preview limited to 250 rows, 50 columns, and 1 MB.'));
      }
    }).catch(() => {
      if (!active) return;
      scroll.innerHTML = '';
      scroll.append(el('div', { class: 'document-loading' }, 'This CSV file could not be read.'));
    });
    return () => { active = false; };
  }

  WIDGETS.pdf = {
    title: 'Document', icon: 'pdf', accent: '#fed7aa', w: 420, h: 380,
    defaults: () => ({ url: '' }),
    mount(body, w, api) {
      const wrap = el('div', { class: 'media-fill' });
      body.append(wrap);
      const local = sessionFiles[w.id];
      const remote = w.props.url ? { name: w.props.url, type: '', url: w.props.url } : null;
      const record = remote || local;
      if (!record) {
        const pickBtn = el('button', { class: 'btn', onclick: () => pickDocumentFile(w, api) }, 'Open document file…');
        wrap.append(el('div', { style: 'text-align:center;display:grid;gap:8px;justify-items:center;--acc:#fed7aa;' },
          el('div', { style: 'font-size:38px;color:var(--ink-soft);' }, iconEl('pdf')), pickBtn,
          el('div', { class: 'hint' }, 'PDF, images, TXT or CSV. Word and PowerPoint files can be selected for conversion guidance.'),
          el('div', { class: 'hint' }, 'Local files show until the tab closes; paste a URL in ⚙ to keep one.'),
        ));
        return null;
      }

      const kind = documentKind(record);
      if (kind === 'pdf') wrap.append(el('iframe', { src: record.url, title: record.name || 'PDF document' }));
      else if (kind === 'image') wrap.append(el('img', { src: record.url, alt: record.name || '' }));
      else if (kind === 'text' && local) return renderTextDocument(wrap, local.file);
      else if (kind === 'csv' && local) return renderCsvDocument(wrap, local.file);
      else if ((kind === 'text' || kind === 'csv') && remote) wrap.append(el('iframe', { src: record.url, title: record.name }));
      else if (kind === 'word') wrap.append(documentMessage('Word preview needs conversion',
        'Convert this DOC or DOCX file to PDF, then select the PDF here. The document stays on your device.', w, api));
      else if (kind === 'powerpoint') wrap.append(documentMessage('PowerPoint preview needs conversion',
        'Convert this PPT or PPTX file to PDF, then select the PDF here. The presentation stays on your device.', w, api));
      else if (remote) wrap.append(el('iframe', { src: record.url, title: record.name }));
      else wrap.append(documentMessage('Preview unavailable', 'Choose a PDF, image, TXT or CSV file instead.', w, api));
      return null;
    },
    settings(box, w, api) {
      box.append(settingRow('URL', el('input', {
        class: 'text-input', value: w.props.url, placeholder: 'https://…/file.pdf',
        onchange: (e) => {
          let u = e.target.value.trim();
          if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
          if (u) clearSessionFile(w.id);
          w.props.url = u;
          api.refresh();
        },
      })),
      el('button', { class: 'btn ghost small', onclick: () => pickDocumentFile(w, api) },
        sessionFiles[w.id] ? 'Replace local file…' : 'Open local file…'));
      if (sessionFiles[w.id]) {
        box.append(
          el('div', { class: 'hint' }, 'Local file: ' + sessionFiles[w.id].name),
          el('button', { class: 'btn danger small', onclick: () => { clearSessionFile(w.id); api.refresh(); } }, 'Remove local file'));
      }
    },
  };

  // ---- Hyperlink ----
  WIDGETS.link = {
    title: 'Link', icon: 'link', accent: '#99f6e4', w: 260, h: 150,
    defaults: () => ({ label: 'Class website', url: 'https://example.com' }),
    mount(body, w) {
      // the settings box forces an https:// prefix, but a url that arrived in a
      // shared template never went through it — and window.open('javascript:…')
      // runs in a window that inherits this origin
      const open = () => {
        const url = SageSanitize.url(w.props.url);
        // Sanitised first, either way. Under Tauri it goes to the SYSTEM browser
        // rather than a chrome-less webview with no back button and no address
        // bar — a class website opened inside the app is a trap for a teacher.
        if (url && window.SagePlatform) SagePlatform.openExternal(url);
        else if (url) window.open(url, '_blank', 'noopener');
        else toast('⚠️ That link isn’t a web address.');
      };
      body.append(el('div', { class: 'link-big' },
        el('button', {
          class: 'btn',
          style: 'display:flex;align-items:center;gap:8px;',
          onclick: open,
        }, iconEl('link'), w.props.label || 'Open'),
        el('div', { class: 'link-url' }, w.props.url),
      ));
    },
    settings(box, w, api) {
      box.append(
        settingRow('Label', el('input', { class: 'text-input', value: w.props.label, onchange: (e) => { w.props.label = e.target.value; api.refresh(); } })),
        settingRow('URL', el('input', {
          class: 'text-input', value: w.props.url,
          onchange: (e) => {
            let u = e.target.value.trim();
            if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
            w.props.url = u;
            api.refresh();
          },
        })),
      );
    },
  };

  // ---- Sticker ----
  const STICKERS = ['⭐', '🌟', '❤️', '🎉', '🏆', '👍', '👏', '🔥', '💯', '🎈', '🌈', '🦄', '😀', '😎', '🤩', '🥳', '🍎', '📚', '✅', '❗️', '❓', '🎵', '⚽️', '🧠'];
  WIDGETS.sticker = {
    title: 'Sticker', icon: 'sticker', accent: '#fde68a', w: 190, h: 190,
    defaults: () => ({ emoji: '⭐' }),
    mount(body, w) {
      const face = el('div', { class: 'sticker-face' }, w.props.emoji);
      body.append(face);
      const size = () => {
        face.style.fontSize = Math.max(24, Math.min(face.clientWidth, face.clientHeight) * 0.72) + 'px';
      };
      const ro = new ResizeObserver(size);
      ro.observe(face);
      size();
      return () => ro.disconnect();
    },
    settings(box, w, api) {
      const grid = el('div', { class: 'row' });
      for (const s of STICKERS) {
        grid.append(el('button', {
          style: 'font-size:20px;padding:3px 5px;border-radius:8px;' + (s === w.props.emoji ? 'background:var(--accent-soft);' : ''),
          onclick: () => { w.props.emoji = s; api.refresh(); },
        }, s));
      }
      box.append(grid, settingRow('Custom', el('input', {
        class: 'text-input', value: w.props.emoji, style: 'width:90px;',
        onchange: (e) => { if (e.target.value.trim()) { w.props.emoji = e.target.value.trim(); api.refresh(); } },
      })));
    },
  };

  // ---- Scoreboard ----
  WIDGETS.score = {
    title: 'Scoreboard', icon: 'score', accent: '#fde68a', w: 380, h: 240,
    defaults: () => ({ teams: [{ name: 'Team 1', score: 0 }, { name: 'Team 2', score: 0 }] }),
    mount(body, w) {
      const grid = el('div', { class: 'score-grid' });
      body.append(grid);
      const paint = () => {
        grid.innerHTML = '';
        w.props.teams.forEach((t) => {
          grid.append(el('div', { class: 'score-card' },
            el('div', { class: 'score-name' }, t.name),
            el('div', { class: 'score-val' }, String(t.score)),
            el('div', { class: 'score-btns' },
              el('button', { onclick: () => { t.score--; save(); paint(); } }, '−'),
              el('button', { onclick: () => { t.score++; save(); paint(); } }, '＋'),
            ),
          ));
        });
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        el('div', { class: 'hint' }, 'Teams (one per line):'),
        el('textarea', {
          class: 'text-input', rows: 3,
          onchange: (e) => {
            const names = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8);
            if (!names.length) return;
            w.props.teams = names.map((name, i) => ({ name, score: w.props.teams[i] ? w.props.teams[i].score : 0 }));
            api.refresh();
          },
        }, w.props.teams.map((t) => t.name).join('\n')),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.teams.forEach((t) => { t.score = 0; }); api.refresh(); } }, 'Reset scores'),
      );
    },
  };

  // ---------------------------------------------------------------- activity games
  // The template library is intentionally built from a small set of reusable
  // engines. A seasonal spelling game, for example, is the same Word builder
  // widget with a different skin and word pack — not a second copy of the rules.
  const GAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const GAME_SKINS = {
    bunny: { label: 'Bunny', emoji: '🐰', color: '#f59eaa' },
    alien: { label: 'Alien', emoji: '👽', color: '#65d46e' },
    snowman: { label: 'Snowman', emoji: '⛄️', color: '#60a5fa' },
    scarecrow: { label: 'Scarecrow', emoji: '🌾', color: '#d9983e' },
    classic: { label: 'Classic', emoji: '🧍', color: '#64748b' },
  };

  function gameLines(value, fallback, max = 80) {
    const list = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    const clean = list.map((s) => String(s).trim()).filter(Boolean).slice(0, max);
    return clean.length ? clean : fallback.slice();
  }

  function shuffled(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ---- Prompt cards: Heads up, Guess it and speaking-topic packs ----
  WIDGETS.promptcards = {
    title: 'Prompt cards', icon: 'picker', accent: '#f9a8d4', w: 520, h: 350,
    defaults: () => ({
      title: 'Heads up!', mode: 'show', index: 0, revealed: true, score: 0, passed: 0,
      prompts: ['Volcano', 'Photosynthesis', 'The Moon', 'A detective', 'A thunderstorm'],
    }),
    mount(body, w) {
      const fallback = ['Volcano', 'Photosynthesis', 'The Moon', 'A detective', 'A thunderstorm'];
      w.props.prompts = gameLines(w.props.prompts, fallback);
      w.props.index = clamp(+w.props.index || 0, 0, w.props.prompts.length - 1);
      const wrap = el('div', { class: 'prompt-game' });
      body.append(wrap);

      const next = (result) => {
        if (result === 'score') w.props.score = (+w.props.score || 0) + 1;
        if (result === 'pass') w.props.passed = (+w.props.passed || 0) + 1;
        w.props.index = (w.props.index + 1) % w.props.prompts.length;
        w.props.revealed = w.props.mode !== 'guess';
        save(); paint();
      };
      const paint = () => {
        wrap.innerHTML = '';
        const hidden = w.props.mode === 'guess' && !w.props.revealed;
        const card = el('div', { class: 'prompt-card' },
          el('div', { class: 'prompt-kicker' }, w.props.mode === 'topic' ? 'Your speaking topic' : hidden ? 'Can your class guess it?' : 'Describe it without saying it'),
          el('div', { class: 'prompt-word' }, hidden ? 'Tap to reveal' : w.props.prompts[w.props.index]),
          el('div', { class: 'prompt-progress' }, `${w.props.index + 1} / ${w.props.prompts.length}`));
        if (hidden) card.classList.add('is-hidden');
        card.addEventListener('click', () => {
          if (w.props.mode !== 'guess') return;
          w.props.revealed = !w.props.revealed;
          save(); paint();
        });
        wrap.append(
          el('div', { class: 'game-title-row' },
            el('strong', {}, w.props.title || 'Prompt cards'),
            el('span', { class: 'game-score' }, `✓ ${+w.props.score || 0}  ·  ↷ ${+w.props.passed || 0}`)),
          card,
          el('div', { class: 'game-actions' },
            w.props.mode === 'guess' ? el('button', { class: 'btn ghost', onclick: () => { w.props.revealed = !w.props.revealed; save(); paint(); } }, hidden ? 'Reveal' : 'Hide') : '',
            el('button', { class: 'btn ghost', onclick: () => next('pass') }, 'Pass'),
            el('button', { class: 'btn', onclick: () => next('score') }, w.props.mode === 'topic' ? 'Next topic' : 'Got it')),
        );
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        settingRow('Title', el('input', { class: 'text-input', value: w.props.title || '', onchange: (e) => { w.props.title = e.target.value.trim(); api.refresh(); } })),
        settingRow('Style', selectInput([
          ['show', 'Heads up'], ['guess', 'Guess and reveal'], ['topic', 'Speaking topics'],
        ], w.props.mode || 'show', (v) => { w.props.mode = v; w.props.revealed = v !== 'guess'; api.refresh(); })),
        el('div', { class: 'hint' }, 'Cards or topics (one per line)'),
        el('textarea', {
          class: 'text-input', rows: 8,
          onchange: (e) => { w.props.prompts = gameLines(e.target.value, ['Ready?']); w.props.index = 0; w.props.score = 0; w.props.passed = 0; api.refresh(); },
        }, gameLines(w.props.prompts, ['Ready?']).join('\n')),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.index = 0; w.props.score = 0; w.props.passed = 0; api.refresh(); } }, 'Reset pack'),
      );
    },
  };

  // ---- Word builder: one spelling engine, several friendly build-up skins ----
  WIDGETS.wordbuilder = {
    title: 'Word builder', icon: 'text', accent: '#86efac', w: 650, h: 470,
    defaults: () => ({
      title: 'Build a buddy', skin: 'bunny', words: ['CLASSROOM', 'LEARNING', 'FRIENDSHIP', 'CURIOUS'],
      wordIndex: 0, guessed: [], misses: 0, maxMisses: 6,
    }),
    mount(body, w) {
      const cleanWord = (s) => String(s || '').toUpperCase().replace(/[^A-Z '\-]/g, '').trim();
      w.props.words = gameLines(w.props.words, ['CLASSROOM']).map(cleanWord).filter(Boolean);
      if (!w.props.words.length) w.props.words = ['CLASSROOM'];
      w.props.wordIndex = clamp(+w.props.wordIndex || 0, 0, w.props.words.length - 1);
      w.props.guessed = Array.isArray(w.props.guessed) ? w.props.guessed.filter((x) => GAME_ALPHABET.includes(x)) : [];
      w.props.misses = clamp(+w.props.misses || 0, 0, 12);
      w.props.maxMisses = clamp(+w.props.maxMisses || 6, 4, 10);
      const wrap = el('div', { class: 'word-game' });
      body.append(wrap);

      const reset = (advance) => {
        if (advance) w.props.wordIndex = (w.props.wordIndex + 1) % w.props.words.length;
        w.props.guessed = [];
        w.props.misses = 0;
        save(); paint();
      };
      const paint = () => {
        wrap.innerHTML = '';
        const word = w.props.words[w.props.wordIndex];
        const letters = word.split('').filter((c) => GAME_ALPHABET.includes(c));
        const won = letters.every((c) => w.props.guessed.includes(c));
        const lost = w.props.misses >= w.props.maxMisses;
        const skin = GAME_SKINS[w.props.skin] || GAME_SKINS.bunny;
        const progress = won ? 100 : Math.round((w.props.misses / w.props.maxMisses) * 100);
        const art = el('div', { class: 'word-build-art', style: '--skin:' + skin.color },
          el('span', { class: 'word-build-ghost' }, skin.emoji),
          el('span', { class: 'word-build-reveal', style: `clip-path:inset(${100 - progress}% 0 0 0)` }, skin.emoji),
          el('div', { class: 'word-build-count' }, `${w.props.misses} / ${w.props.maxMisses}`));
        const masked = el('div', { class: 'word-mask' });
        for (const c of word) {
          const show = !GAME_ALPHABET.includes(c) || w.props.guessed.includes(c) || lost;
          masked.append(el('span', { class: GAME_ALPHABET.includes(c) ? 'word-letter' : 'word-space' }, show ? c : ''));
        }
        const keys = el('div', { class: 'word-keys' });
        for (const c of GAME_ALPHABET) {
          const used = w.props.guessed.includes(c);
          const hit = word.includes(c);
          const key = el('button', {
            class: 'word-key' + (used ? (hit ? ' hit' : ' miss') : ''),
            onclick: () => {
              if (used || won || lost) return;
              w.props.guessed.push(c);
              if (!hit) w.props.misses++;
              save(); paint();
            },
          }, c);
          key.disabled = used || won || lost;
          keys.append(key);
        }
        wrap.append(
          el('div', { class: 'game-title-row' }, el('strong', {}, w.props.title || 'Word builder'), el('span', { class: 'game-score' }, skin.label)),
          el('div', { class: 'word-main' }, art, el('div', { class: 'word-play' }, masked, keys,
            won || lost ? el('div', { class: 'word-result ' + (won ? 'won' : 'lost') }, won ? 'Brilliant — word complete!' : `The word was ${word}`) : '')),
          el('div', { class: 'game-actions' },
            el('button', { class: 'btn ghost', onclick: () => reset(false) }, 'Try again'),
            el('button', { class: 'btn', onclick: () => reset(true) }, 'New word')),
        );
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        settingRow('Title', el('input', { class: 'text-input', value: w.props.title || '', onchange: (e) => { w.props.title = e.target.value.trim(); api.refresh(); } })),
        settingRow('Character', selectInput(Object.entries(GAME_SKINS).map(([id, s]) => [id, `${s.emoji} ${s.label}`]), w.props.skin || 'bunny', (v) => { w.props.skin = v; w.props.misses = 0; api.refresh(); })),
        settingRow('Attempts', el('input', { class: 'text-input', type: 'number', min: 4, max: 10, value: w.props.maxMisses || 6, style: 'width:76px;', onchange: (e) => { w.props.maxMisses = clamp(+e.target.value || 6, 4, 10); api.refresh(); } })),
        el('div', { class: 'hint' }, 'Words or short phrases (one per line)'),
        el('textarea', {
          class: 'text-input', rows: 8,
          onchange: (e) => { w.props.words = gameLines(e.target.value, ['CLASSROOM']); w.props.wordIndex = 0; w.props.guessed = []; w.props.misses = 0; api.refresh(); },
        }, gameLines(w.props.words, ['CLASSROOM']).join('\n')),
      );
    },
  };

  // ---- Memory / find-the-pairs ----
  WIDGETS.memory = {
    title: 'Memory pairs', icon: 'copy', accent: '#fdba74', w: 620, h: 460,
    defaults: () => ({
      title: 'Find the pairs', pairs: ['🍎', '🚀', '🐝', '🌈', '🎵', '⭐'], columns: 4,
      cards: null, pairKey: '', moves: 0,
    }),
    mount(body, w) {
      w.props.pairs = gameLines(w.props.pairs, ['🍎', '🚀', '🐝', '🌈', '🎵', '⭐'], 12);
      w.props.columns = clamp(+w.props.columns || 4, 3, 6);
      const key = w.props.pairs.join('\u0001');
      const resetCards = () => {
        w.props.cards = shuffled(w.props.pairs.flatMap((label, pair) => [
          { id: uid(), pair, label, open: false, matched: false },
          { id: uid(), pair, label, open: false, matched: false },
        ]));
        w.props.pairKey = key;
        w.props.moves = 0;
      };
      if (!Array.isArray(w.props.cards) || w.props.cards.length !== w.props.pairs.length * 2 || w.props.pairKey !== key) resetCards();
      // A reload or remount inside the 850ms unflip window used to strand two
      // non-matching cards open forever (the timer that would close them died
      // with the old mount, and choose() then never saw exactly two open).
      // A fresh mount simply forgets the half-flip.
      for (const c of w.props.cards) if (c.open && !c.matched) c.open = false;
      const wrap = el('div', { class: 'memory-game' });
      body.append(wrap);
      let locked = false;
      let flipTimer = null;

      const reset = () => { resetCards(); save(); paint(); };
      const choose = (card) => {
        if (locked || card.open || card.matched) return;
        card.open = true;
        const open = w.props.cards.filter((c) => c.open && !c.matched);
        if (open.length === 2) {
          w.props.moves = (+w.props.moves || 0) + 1;
          locked = true;
          if (open[0].pair === open[1].pair) {
            open.forEach((c) => { c.matched = true; c.open = false; });
            locked = false;
          } else {
            flipTimer = setTimeout(() => {
              open.forEach((c) => { c.open = false; });
              locked = false; save(); paint();
            }, 850);
          }
        }
        save(); paint();
      };
      const paint = () => {
        wrap.innerHTML = '';
        const matched = w.props.cards.filter((c) => c.matched).length / 2;
        const grid = el('div', { class: 'memory-grid', style: `--memory-cols:${w.props.columns}` });
        for (const card of w.props.cards) {
          grid.append(el('button', {
            class: 'memory-card' + (card.open ? ' open' : '') + (card.matched ? ' matched' : ''),
            onclick: () => choose(card),
            'aria-label': card.open || card.matched ? card.label : 'Hidden card',
          }, el('span', { class: 'memory-back' }, '🌿'), el('span', { class: 'memory-face' }, card.label)));
        }
        wrap.append(
          el('div', { class: 'game-title-row' }, el('strong', {}, w.props.title || 'Find the pairs'), el('span', { class: 'game-score' }, `${matched}/${w.props.pairs.length} pairs · ${+w.props.moves || 0} moves`)),
          grid,
          el('div', { class: 'game-actions' }, el('button', { class: 'btn ghost', onclick: reset }, 'Shuffle and reset')),
        );
      };
      paint();
      return () => clearTimeout(flipTimer);
    },
    settings(box, w, api) {
      box.append(
        settingRow('Title', el('input', { class: 'text-input', value: w.props.title || '', onchange: (e) => { w.props.title = e.target.value.trim(); api.refresh(); } })),
        settingRow('Columns', selectInput([['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], String(w.props.columns || 4), (v) => { w.props.columns = +v; api.refresh(); })),
        el('div', { class: 'hint' }, 'Pair faces (one per line; emoji or short words work best)'),
        el('textarea', {
          class: 'text-input', rows: 8,
          onchange: (e) => { w.props.pairs = gameLines(e.target.value, ['🍎', '🚀']); w.props.cards = null; api.refresh(); },
        }, gameLines(w.props.pairs, ['🍎', '🚀']).join('\n')),
      );
    },
  };

  // ---- Tic tac toe ----
  WIDGETS.tictactoe = {
    title: 'Tic tac toe', icon: 'score', accent: '#67e8f9', w: 520, h: 470,
    defaults: () => ({ board: ['', '', '', '', '', '', '', '', ''], turn: 'X', status: '', xLabel: 'Team X', oLabel: 'Team O', xWins: 0, oWins: 0, draws: 0 }),
    mount(body, w) {
      if (!Array.isArray(w.props.board) || w.props.board.length !== 9) w.props.board = Array(9).fill('');
      const wrap = el('div', { class: 'ttt-game' });
      body.append(wrap);
      const winner = () => {
        const b = w.props.board;
        const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (const line of lines) if (b[line[0]] && b[line[0]] === b[line[1]] && b[line[1]] === b[line[2]]) return { mark: b[line[0]], line };
        return null;
      };
      const reset = () => { w.props.board = Array(9).fill(''); w.props.turn = 'X'; w.props.status = ''; save(); paint(); };
      const play = (i) => {
        if (w.props.board[i] || w.props.status) return;
        w.props.board[i] = w.props.turn;
        const win = winner();
        if (win) {
          w.props.status = win.mark + ' wins!';
          if (win.mark === 'X') w.props.xWins = (+w.props.xWins || 0) + 1;
          else w.props.oWins = (+w.props.oWins || 0) + 1;
        } else if (w.props.board.every(Boolean)) {
          w.props.status = 'Draw'; w.props.draws = (+w.props.draws || 0) + 1;
        } else w.props.turn = w.props.turn === 'X' ? 'O' : 'X';
        save(); paint();
      };
      const paint = () => {
        wrap.innerHTML = '';
        const win = winner();
        const grid = el('div', { class: 'ttt-grid' });
        w.props.board.forEach((mark, i) => grid.append(el('button', {
          class: 'ttt-cell mark-' + (mark || 'empty') + (win && win.line.includes(i) ? ' winner' : ''),
          onclick: () => play(i), 'aria-label': mark || 'Empty square',
        }, mark)));
        const turnName = w.props.turn === 'X' ? w.props.xLabel : w.props.oLabel;
        wrap.append(
          el('div', { class: 'game-title-row' }, el('strong', {}, w.props.status || `${turnName}'s turn`), el('span', { class: 'game-score' }, `${w.props.xLabel} ${+w.props.xWins || 0} · ${+w.props.oWins || 0} ${w.props.oLabel}`)),
          grid,
          el('div', { class: 'game-actions' },
            el('button', { class: 'btn ghost', onclick: reset }, 'New round'),
            el('span', { class: 'game-score' }, `Draws ${+w.props.draws || 0}`)),
        );
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        settingRow('X team', el('input', { class: 'text-input', value: w.props.xLabel || 'Team X', onchange: (e) => { w.props.xLabel = e.target.value.trim() || 'Team X'; api.refresh(); } })),
        settingRow('O team', el('input', { class: 'text-input', value: w.props.oLabel || 'Team O', onchange: (e) => { w.props.oLabel = e.target.value.trim() || 'Team O'; api.refresh(); } })),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.board = Array(9).fill(''); w.props.turn = 'X'; w.props.status = ''; w.props.xWins = 0; w.props.oWins = 0; w.props.draws = 0; api.refresh(); } }, 'Reset match'),
      );
    },
  };

  // ---- Connect four ----
  WIDGETS.connectfour = {
    title: 'Connect four', icon: 'poll', accent: '#818cf8', w: 650, h: 500,
    defaults: () => ({ board: Array(42).fill(''), turn: 'coral', status: '', coralLabel: 'Coral team', goldLabel: 'Gold team', coralWins: 0, goldWins: 0 }),
    mount(body, w) {
      const ROWS = 6, COLS = 7;
      if (!Array.isArray(w.props.board) || w.props.board.length !== ROWS * COLS) w.props.board = Array(ROWS * COLS).fill('');
      const wrap = el('div', { class: 'connect-game' });
      body.append(wrap);
      const winningCells = () => {
        const b = w.props.board;
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const mark = b[r * COLS + c];
          if (!mark) continue;
          for (const [dr, dc] of dirs) {
            const cells = [];
            for (let k = 0; k < 4; k++) {
              const rr = r + dr * k, cc = c + dc * k;
              if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== mark) break;
              cells.push(rr * COLS + cc);
            }
            if (cells.length === 4) return { mark, cells };
          }
        }
        return null;
      };
      const reset = () => { w.props.board = Array(ROWS * COLS).fill(''); w.props.turn = 'coral'; w.props.status = ''; save(); paint(); };
      const drop = (col) => {
        if (w.props.status) return;
        let row = -1;
        for (let r = ROWS - 1; r >= 0; r--) if (!w.props.board[r * COLS + col]) { row = r; break; }
        if (row < 0) return;
        w.props.board[row * COLS + col] = w.props.turn;
        const win = winningCells();
        if (win) {
          const name = win.mark === 'coral' ? w.props.coralLabel : w.props.goldLabel;
          w.props.status = name + ' connects four!';
          if (win.mark === 'coral') w.props.coralWins = (+w.props.coralWins || 0) + 1;
          else w.props.goldWins = (+w.props.goldWins || 0) + 1;
        } else if (w.props.board.every(Boolean)) w.props.status = 'Board full — draw';
        else w.props.turn = w.props.turn === 'coral' ? 'gold' : 'coral';
        save(); paint();
      };
      const paint = () => {
        wrap.innerHTML = '';
        const win = winningCells();
        const drops = el('div', { class: 'connect-drops' });
        for (let c = 0; c < COLS; c++) drops.append(el('button', { onclick: () => drop(c), title: `Drop in column ${c + 1}` }, '▼'));
        const grid = el('div', { class: 'connect-grid' });
        w.props.board.forEach((mark, i) => grid.append(el('button', {
          class: 'connect-slot' + (mark ? ' ' + mark : '') + (win && win.cells.includes(i) ? ' winner' : ''),
          onclick: () => drop(i % COLS), 'aria-label': mark || 'Empty slot',
        }, el('span'))));
        const turnName = w.props.turn === 'coral' ? w.props.coralLabel : w.props.goldLabel;
        wrap.append(
          el('div', { class: 'game-title-row' }, el('strong', {}, w.props.status || `${turnName}'s turn`), el('span', { class: 'game-score' }, `${w.props.coralLabel} ${+w.props.coralWins || 0} · ${+w.props.goldWins || 0} ${w.props.goldLabel}`)),
          el('div', { class: 'connect-board' }, drops, grid),
          el('div', { class: 'game-actions' }, el('button', { class: 'btn ghost', onclick: reset }, 'New round')),
        );
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        settingRow('Coral team', el('input', { class: 'text-input', value: w.props.coralLabel || 'Coral team', onchange: (e) => { w.props.coralLabel = e.target.value.trim() || 'Coral team'; api.refresh(); } })),
        settingRow('Gold team', el('input', { class: 'text-input', value: w.props.goldLabel || 'Gold team', onchange: (e) => { w.props.goldLabel = e.target.value.trim() || 'Gold team'; api.refresh(); } })),
        el('button', { class: 'btn ghost small', onclick: () => { w.props.board = Array(42).fill(''); w.props.turn = 'coral'; w.props.status = ''; w.props.coralWins = 0; w.props.goldWins = 0; api.refresh(); } }, 'Reset match'),
      );
    },
  };

  // ---- Countdown-style number and letter rounds ----
  const COUNTDOWN_VOWELS = 'AAAAAAAAAAAAAAAEEEEEEEEEEEEEEEEEEEEEEEEIIIIIIIIIIIIOOOOOOOOOOOOUUUUU';
  const COUNTDOWN_CONSONANTS = 'BBBBCCCDDDDDDFFFFFFFFGGGGGHHHHHHJKLLLLLMMMMNNNNNNNNPPPPQRRRRRRRRRSSSSSSSSSTTTTTTTTTVVWWXYYZ';
  WIDGETS.countdowngame = {
    title: 'Numbers & letters', icon: 'dice', accent: '#38bdf8', w: 640, h: 390,
    defaults: () => ({ mode: 'numbers', target: 451, numbers: [25, 50, 3, 6, 7, 8], letters: ['S','T','A','G','E','R','O','U','N'] }),
    mount(body, w) {
      if (!['numbers', 'letters'].includes(w.props.mode)) w.props.mode = 'numbers';
      if (!Array.isArray(w.props.numbers) || w.props.numbers.length !== 6) w.props.numbers = [25, 50, 3, 6, 7, 8];
      w.props.numbers = w.props.numbers.map((n) => clamp(Math.round(+n || 1), 1, 999));
      if (!Array.isArray(w.props.letters) || w.props.letters.length !== 9) w.props.letters = ['S','T','A','G','E','R','O','U','N'];
      w.props.letters = w.props.letters.map((c) => String(c || 'A').charAt(0).toUpperCase());
      w.props.target = clamp(Math.round(+w.props.target || 451), 101, 999);
      const wrap = el('div', { class: 'countdown-game' });
      body.append(wrap);
      const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];
      const newRound = () => {
        if (w.props.mode === 'letters') {
          const letters = [];
          for (let i = 0; i < 9; i++) letters.push(pick(i < 4 ? COUNTDOWN_VOWELS : COUNTDOWN_CONSONANTS));
          w.props.letters = shuffled(letters);
        } else {
          const large = shuffled([25, 50, 75, 100]).slice(0, 2);
          const small = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 10));
          w.props.numbers = shuffled(large.concat(small));
          w.props.target = 101 + Math.floor(Math.random() * 899);
        }
        save(); paint();
      };
      const paint = () => {
        wrap.innerHTML = '';
        const tiles = el('div', { class: 'countdown-tiles' });
        const values = w.props.mode === 'letters' ? w.props.letters : w.props.numbers;
        for (const value of values) tiles.append(el('span', {}, String(value)));
        wrap.append(
          el('div', { class: 'game-title-row' }, el('strong', {}, w.props.mode === 'letters' ? 'Make the longest word' : 'Reach the target'),
            el('div', { class: 'countdown-tabs' },
              el('button', { class: w.props.mode === 'numbers' ? 'active' : '', onclick: () => { w.props.mode = 'numbers'; save(); paint(); } }, 'Numbers'),
              el('button', { class: w.props.mode === 'letters' ? 'active' : '', onclick: () => { w.props.mode = 'letters'; save(); paint(); } }, 'Letters'))),
          w.props.mode === 'numbers' ? el('div', { class: 'countdown-target' }, String(w.props.target)) : el('div', { class: 'countdown-target word-target' }, 'WORD ROUND'),
          tiles,
          el('div', { class: 'countdown-instruction' }, w.props.mode === 'numbers' ? 'Use each number at most once. You may add, subtract, multiply or divide.' : 'Use each letter at most once. How long a word can your class make?'),
          el('div', { class: 'game-actions' }, el('button', { class: 'btn', onclick: newRound }, 'New round')),
        );
      };
      paint();
    },
    settings(box, w, api) {
      box.append(settingRow('Starting mode', selectInput([['numbers', 'Numbers'], ['letters', 'Letters']], w.props.mode || 'numbers', (v) => { w.props.mode = v; api.refresh(); })));
    },
  };

  // ---- Four-square strategy: mini checkers and an original chess line-up game ----
  WIDGETS.strategyboard = {
    title: 'Mini strategy board', icon: 'screens', accent: '#c4b5fd', w: 560, h: 500,
    defaults: () => ({ mode: 'checkers', board: null, boardMode: '', turn: 'light', selected: -1, pieceChoice: '♟', status: '', lightLabel: 'Ivory', darkLabel: 'Ink' }),
    mount(body, w) {
      const SIZE = 4;
      const linePieces = ['♟', '♞', '♝', '♜'];
      const startBoard = () => w.props.mode === 'checkers'
        ? ['', 'dark', '', 'dark', '', '', '', '', '', '', '', '', 'light', '', 'light', '']
        : Array(SIZE * SIZE).fill('');
      const reset = () => {
        w.props.board = startBoard(); w.props.boardMode = w.props.mode; w.props.turn = 'light';
        w.props.selected = -1; w.props.pieceChoice = linePieces[0]; w.props.status = '';
      };
      if (!Array.isArray(w.props.board) || w.props.board.length !== SIZE * SIZE || !w.props.board.every((v) => typeof v === 'string') || w.props.boardMode !== w.props.mode) reset();
      const wrap = el('div', { class: 'strategy-game' });
      body.append(wrap);
      const sideOf = (v) => v && (v.includes(':') ? v.split(':')[0] : v);
      const other = (side) => side === 'light' ? 'dark' : 'light';
      const sideName = (side) => side === 'light' ? w.props.lightLabel : w.props.darkLabel;
      const lineWinner = () => {
        const lines = [[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],[0,5,10,15],[3,6,9,12]];
        for (const line of lines) {
          const side = sideOf(w.props.board[line[0]]);
          if (side && line.every((i) => sideOf(w.props.board[i]) === side)) return side;
        }
        return '';
      };
      const clickCheckers = (i) => {
        const cell = w.props.board[i];
        if (cell === w.props.turn) { w.props.selected = i; save(); paint(); return; }
        if (cell || w.props.selected < 0) return;
        const from = w.props.selected, fr = Math.floor(from / SIZE), fc = from % SIZE, tr = Math.floor(i / SIZE), tc = i % SIZE;
        const dir = w.props.turn === 'light' ? -1 : 1;
        const dr = tr - fr, dc = tc - fc;
        let legal = dr === dir && Math.abs(dc) === 1;
        let captured = -1;
        if (dr === dir * 2 && Math.abs(dc) === 2) {
          const mid = ((fr + tr) / 2) * SIZE + ((fc + tc) / 2);
          if (w.props.board[mid] === other(w.props.turn)) { legal = true; captured = mid; }
        }
        if (!legal) return;
        w.props.board[i] = w.props.turn; w.props.board[from] = '';
        if (captured >= 0) w.props.board[captured] = '';
        const home = w.props.turn === 'light' ? tr === 0 : tr === SIZE - 1;
        const opponentLeft = w.props.board.some((v) => v === other(w.props.turn));
        if (home || !opponentLeft) w.props.status = sideName(w.props.turn) + ' wins!';
        else w.props.turn = other(w.props.turn);
        w.props.selected = -1; save(); paint();
      };
      const clickLineup = (i) => {
        const cell = w.props.board[i];
        const side = w.props.turn;
        const own = w.props.board.filter((v) => sideOf(v) === side);
        if (sideOf(cell) === side) {
          if (own.length < linePieces.length) return;
          w.props.selected = i; w.props.pieceChoice = cell.split(':')[1]; save(); paint(); return;
        }
        if (cell) return;
        if (w.props.selected >= 0) {
          const from = w.props.selected, fr = Math.floor(from / SIZE), fc = from % SIZE, tr = Math.floor(i / SIZE), tc = i % SIZE;
          if (Math.max(Math.abs(tr - fr), Math.abs(tc - fc)) !== 1) return;
          w.props.board[i] = w.props.board[from]; w.props.board[from] = '';
        } else {
          const used = own.map((v) => v.split(':')[1]);
          const choice = !used.includes(w.props.pieceChoice) ? w.props.pieceChoice : linePieces.find((p) => !used.includes(p));
          if (!choice) return;
          w.props.board[i] = side + ':' + choice;
        }
        const won = lineWinner();
        if (won) w.props.status = sideName(won) + ' lines up four!';
        else w.props.turn = other(side);
        w.props.selected = -1; save(); paint();
      };
      const play = (i) => {
        if (w.props.status) return;
        if (w.props.mode === 'checkers') clickCheckers(i); else clickLineup(i);
      };
      const paint = () => {
        wrap.innerHTML = '';
        const board = el('div', { class: 'strategy-grid' });
        w.props.board.forEach((value, i) => {
          const side = sideOf(value);
          const symbol = w.props.mode === 'checkers' ? (value ? '●' : '') : value ? value.split(':')[1] : '';
          board.append(el('button', {
            class: 'strategy-cell' + (side ? ' side-' + side : '') + (w.props.selected === i ? ' selected' : ''),
            onclick: () => play(i), 'aria-label': value || 'Empty square',
          }, symbol ? el('span', { class: 'strategy-piece' }, symbol) : ''));
        });
        const chooser = el('div', { class: 'strategy-choices' });
        if (w.props.mode === 'lineup') for (const p of linePieces) chooser.append(el('button', {
          class: w.props.pieceChoice === p ? 'active' : '', onclick: () => { w.props.pieceChoice = p; save(); paint(); },
        }, p));
        wrap.append(
          el('div', { class: 'game-title-row' }, el('strong', {}, w.props.status || `${sideName(w.props.turn)} to play`), el('span', { class: 'game-score' }, w.props.mode === 'checkers' ? 'Reach the opposite edge' : 'Line up four pieces')),
          el('div', { class: 'strategy-board-wrap' }, board, chooser),
          el('div', { class: 'game-actions' }, el('button', { class: 'btn ghost', onclick: () => { reset(); save(); paint(); } }, 'New round')),
        );
      };
      paint();
    },
    settings(box, w, api) {
      box.append(
        settingRow('Game', selectInput([['checkers', 'Mini checkers'], ['lineup', 'Tic tac chess']], w.props.mode || 'checkers', (v) => { w.props.mode = v; w.props.boardMode = ''; api.refresh(); })),
        settingRow('Light side', el('input', { class: 'text-input', value: w.props.lightLabel || 'Ivory', onchange: (e) => { w.props.lightLabel = e.target.value.trim() || 'Ivory'; api.refresh(); } })),
        settingRow('Dark side', el('input', { class: 'text-input', value: w.props.darkLabel || 'Ink', onchange: (e) => { w.props.darkLabel = e.target.value.trim() || 'Ink'; api.refresh(); } })),
      );
    },
  };

  // ---- Draw pad ----
  // A widget-sized sketch canvas: hand-drawn instructions that live beside other
  // widgets. Papers cover writing, maths, music and planning layouts; the toolbar
  // is deliberately compact and rose-tinted so it reads as the pad's own tools,
  // never the full-screen annotation layer.
  const paperSVG = (vw, vh, inner) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${vw} ${vh}' width='${vw}' height='${vh}'>${inner}</svg>`)}")`;

  const PAPER_SOFT = 'rgba(37,99,235,0.16)';

  function numberLineSVG() {
    let g = "<line x1='20' y1='36' x2='820' y2='36' stroke='#475569' stroke-width='2'/>";
    for (let i = 0; i <= 20; i++) {
      const x = 20 + i * 40;
      g += `<line x1='${x}' y1='${i % 5 ? 30 : 26}' x2='${x}' y2='${i % 5 ? 42 : 46}' stroke='#475569' stroke-width='2'/>`;
      g += `<text x='${x}' y='64' font-size='15' font-family='sans-serif' fill='#475569' text-anchor='middle'>${i}</text>`;
    }
    return paperSVG(840, 76, g);
  }
  function hundredSVG() {
    let g = '';
    for (let i = 0; i < 100; i++) {
      const x = (i % 10) * 50, y = Math.floor(i / 10) * 50;
      g += `<rect x='${x + 1}' y='${y + 1}' width='48' height='48' fill='none' stroke='#94a3b8' stroke-width='1.5'/>`;
      g += `<text x='${x + 25}' y='${y + 31}' font-size='17' font-family='sans-serif' fill='#64748b' text-anchor='middle'>${i + 1}</text>`;
    }
    return paperSVG(502, 502, g);
  }
  function storyboardSVG() {
    let g = '';
    for (let r = 0; r < 2; r++) for (let col = 0; col < 3; col++) {
      const x = 18 + col * 200, y = 14 + r * 196;
      g += `<rect x='${x}' y='${y}' width='184' height='146' rx='8' fill='none' stroke='#94a3b8' stroke-width='2'/>`;
      g += `<line x1='${x + 6}' y1='${y + 164}' x2='${x + 178}' y2='${y + 164}' stroke='#cbd5e1' stroke-width='2'/>`;
    }
    return paperSVG(636, 400, g);
  }
  function fractionsSVG() {
    const rows = [1, 2, 3, 4, 5, 6, 8, 10];
    let g = '';
    rows.forEach((n, r) => {
      const y = 8 + r * 52;
      const cw = 600 / n;
      for (let i = 0; i < n; i++) {
        g += `<rect x='${i * cw + 1}' y='${y}' width='${cw - 2}' height='42' fill='none' stroke='#94a3b8' stroke-width='1.5'/>`;
        g += `<text x='${i * cw + cw / 2}' y='${y + 27}' font-size='15' font-family='sans-serif' fill='#64748b' text-anchor='middle'>${n === 1 ? '1' : '1/' + n}</text>`;
      }
    });
    return paperSVG(602, 8 + rows.length * 52, g);
  }
  function placeValueSVG() {
    const cols = ['Th', 'H', 'T', 'O'];
    let g = "<line x1='2' y1='56' x2='598' y2='56' stroke='#94a3b8' stroke-width='2'/>";
    cols.forEach((label, i) => {
      const x = i * 149 + 2;
      g += `<rect x='${x}' y='2' width='149' height='396' fill='none' stroke='#94a3b8' stroke-width='2'/>`;
      g += `<text x='${x + 74}' y='40' font-size='26' font-weight='bold' font-family='sans-serif' fill='#64748b' text-anchor='middle'>${label}</text>`;
    });
    return paperSVG(600, 400, g);
  }

  const paperAxis = (deg) =>
    `linear-gradient(${deg}, transparent calc(50% - 1px), rgba(51,65,85,0.55) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px))`;

  const SKETCH_PAPERS = {
    blank: { label: 'Plain', css: '' },
    ruled: { label: 'Ruled', css: 'repeating-linear-gradient(0deg, transparent 0 27px, rgba(37,99,235,0.28) 27px 28px)' },
    writing: { label: 'Handwriting guide', css: 'repeating-linear-gradient(0deg, rgba(37,99,235,0.5) 0 1px, transparent 1px 18px, rgba(220,38,38,0.45) 18px 19px, transparent 19px 36px, rgba(37,99,235,0.5) 36px 37px, transparent 37px 58px)' },
    grid: { label: 'Square grid', css: `repeating-linear-gradient(0deg, rgba(37,99,235,0.14) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(37,99,235,0.14) 0 1px, transparent 1px 24px)` },
    dots: { label: 'Dot grid', css: 'radial-gradient(circle, rgba(37,99,235,0.4) 1.3px, transparent 1.8px)', size: '24px 24px' },
    iso: { label: 'Isometric grid', css: `repeating-linear-gradient(0deg, ${PAPER_SOFT} 0 1px, transparent 1px 22px), repeating-linear-gradient(60deg, ${PAPER_SOFT} 0 1px, transparent 1px 22px), repeating-linear-gradient(120deg, ${PAPER_SOFT} 0 1px, transparent 1px 22px)` },
    coord: { label: 'Coordinate plane', css: `${paperAxis('90deg')}, ${paperAxis('0deg')}, repeating-linear-gradient(0deg, ${PAPER_SOFT} 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, ${PAPER_SOFT} 0 1px, transparent 1px 24px)` },
    numline: { label: 'Number line', css: numberLineSVG(), size: '100% 72px', repeat: 'no-repeat', pos: 'center' },
    hundred: { label: 'Hundred square', css: hundredSVG(), size: 'contain', repeat: 'no-repeat', pos: 'center' },
    fractions: { label: 'Fraction bars', css: fractionsSVG(), size: 'contain', repeat: 'no-repeat', pos: 'center' },
    placevalue: { label: 'Place value', css: placeValueSVG(), size: '100% 100%', repeat: 'no-repeat', pos: 'center' },
    story: { label: 'Storyboard', css: storyboardSVG(), size: '100% 100%', repeat: 'no-repeat', pos: 'center' },
    music: { label: 'Music staff', css: 'repeating-linear-gradient(0deg, transparent 0 20px, #94a3b8 20px 21px, transparent 21px 30px, #94a3b8 30px 31px, transparent 31px 40px, #94a3b8 40px 41px, transparent 41px 50px, #94a3b8 50px 51px, transparent 51px 60px, #94a3b8 60px 61px, transparent 61px 92px)' },
  };

  const SKETCH_SIZES = [2, 4, 8, 14];
  const SKETCH_TEXT_SIZES = [16, 22, 32, 46];
  const SKETCH_ALPHAS = [0.25, 0.4, 0.6];
  const SKETCH_FONTS = {
    sans: ['Rounded', 'system-ui, sans-serif'],
    serif: ['Serif', 'Georgia, "Times New Roman", serif'],
    hand: ['Handwriting', '"Comic Sans MS", "Chalkboard SE", "Comic Sans", cursive'],
    mono: ['Typewriter', 'Menlo, Consolas, "Courier New", monospace'],
  };
  const sketchFontStack = (f) => (SKETCH_FONTS[f] || SKETCH_FONTS.sans)[1];
  const SKETCH_SHAPES = [
    ['line', 'linetool', 'Line'],
    ['arrow', 'arrowtool', 'Arrow'],
    ['rect', 'recttool', 'Rectangle'],
    ['ellipse', 'elltool', 'Ellipse'],
    ['triangle', 'tritool', 'Triangle'],
    ['speech', 'speechtool', 'Speech bubble'],
    ['bracket', 'brackettool', 'Bracket'],
    ['brace', 'bracetool', 'Brace'],
  ];
  const SKETCH_SHAPE_IDS = SKETCH_SHAPES.map((s) => s[0]);
  let padClipboard = null; // "Copy drawing" buffer, shared between pads for the session

  WIDGETS.sketch = {
    title: 'Draw pad', icon: 'sketchpad', accent: '#fbcfe8', w: 440, h: 330,
    defaults: () => ({ strokes: [], pattern: 'blank', color: '#0f172a', size: 4, tool: 'pen', shape: 'line', alpha: 0.4, locked: false }),
    // the widget the closing-work comment was written about finally says so —
    // without this it leant on the 400-char JSON fallback alone
    hasWork: (w) => Array.isArray(w.props.strokes) && w.props.strokes.length > 0,
    mount(body, w) {
      if (!w.props.shape) w.props.shape = SKETCH_SHAPE_IDS.includes(w.props.tool) ? w.props.tool : 'line';
      if (!w.props.alpha) w.props.alpha = 0.4;
      body.classList.add('sketch-body');
      const bar = el('div', { class: 'sketch-bar' });
      const wrap = el('div', { class: 'sketch-wrap' });
      const cv = el('canvas', { class: 'sketch-canvas' });
      wrap.append(cv);
      body.append(bar, wrap);

      // undo/redo are whole-canvas snapshots so moves, erases, recolours and
      // clears all undo cleanly, not just "remove last stroke"
      const history = [];
      const future = [];
      let live = null;   // in-progress freehand/shape stroke
      let lasso = null;  // in-progress lasso outline
      let drag = null;   // active select-tool drag (move/resize/rotate)
      let sel = [];      // selected stroke objects (refs into w.props.strokes)
      let erasing = false;
      let editor = null; // active text editor

      const ctx = () => {
        const c = cv.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        return c;
      };
      const pos = (e) => {
        const r = cv.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      const geomCenter = (s) => {
        const g = strokeGeom(s);
        return [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2];
      };

      const snapshot = () => {
        history.push(JSON.stringify(w.props.strokes));
        if (history.length > 60) history.shift();
        future.length = 0;
      };
      const restore = (json) => {
        w.props.strokes = JSON.parse(json);
        sel = [];
        syncSel();
        repaint();
        save();
      };
      const undo = () => { commitEditor(); if (history.length) { future.push(JSON.stringify(w.props.strokes)); restore(history.pop()); } };
      const redoFn = () => { commitEditor(); if (future.length) { history.push(JSON.stringify(w.props.strokes)); restore(future.pop()); } };

      // ---- selection ----
      const HANDLE = 7;
      const selFrame = () => {
        const s = sel[0];
        const g = strokeGeom(s);
        const p = effWidth(s) / 2 + 5;
        return { s, x0: g.x0 - p, y0: g.y0 - p, x1: g.x1 + p, y1: g.y1 + p, cx: (g.x0 + g.x1) / 2, cy: (g.y0 + g.y1) / 2, rot: s.rot || 0 };
      };
      const frameCorners = (f) => {
        const rot = ([x, y]) => {
          const dx = x - f.cx, dy = y - f.cy;
          return [f.cx + dx * Math.cos(f.rot) - dy * Math.sin(f.rot), f.cy + dx * Math.sin(f.rot) + dy * Math.cos(f.rot)];
        };
        return {
          corners: [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]].map(rot),
          rotHandle: rot([(f.x0 + f.x1) / 2, f.y0 - 24]),
        };
      };
      const paintSelection = (c) => {
        if (!sel.length) return;
        c.save();
        c.strokeStyle = '#db2777';
        c.fillStyle = '#fff';
        c.lineWidth = 1.5;
        if (sel.length === 1) {
          const f = selFrame();
          c.translate(f.cx, f.cy); c.rotate(f.rot); c.translate(-f.cx, -f.cy);
          c.setLineDash([6, 4]);
          c.strokeRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
          c.setLineDash([]);
          const mx = (f.x0 + f.x1) / 2;
          c.beginPath(); c.moveTo(mx, f.y0); c.lineTo(mx, f.y0 - 24); c.stroke();
          for (const [hx, hy] of [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]]) {
            c.beginPath(); c.rect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE); c.fill(); c.stroke();
          }
          c.beginPath(); c.arc(mx, f.y0 - 24, 5, 0, Math.PI * 2); c.fill(); c.stroke();
        } else {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const s of sel) {
            const b = strokeBBox(s);
            x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
            x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
          }
          c.setLineDash([6, 4]);
          c.strokeRect(x0, y0, x1 - x0, y1 - y0);
        }
        c.restore();
      };

      const repaint = () => {
        const c = ctx();
        c.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
        for (const s of w.props.strokes) paintStroke(c, s);
        if (live) paintStroke(c, live);
        if (lasso && lasso.length > 1) {
          c.save();
          c.strokeStyle = '#db2777';
          c.lineWidth = 1.2;
          c.setLineDash([5, 4]);
          c.beginPath();
          c.moveTo(lasso[0][0], lasso[0][1]);
          for (const [x, y] of lasso) c.lineTo(x, y);
          c.stroke();
          c.restore();
        }
        paintSelection(c);
      };
      const applyPattern = () => {
        const p = SKETCH_PAPERS[w.props.pattern] || SKETCH_PAPERS.blank;
        wrap.style.backgroundImage = p.css;
        wrap.style.backgroundSize = p.size || '';
        wrap.style.backgroundRepeat = p.repeat || '';
        wrap.style.backgroundPosition = p.pos || '';
      };

      const measureTextStroke = (s) => {
        const c = ctx();
        c.font = '600 ' + s.size + 'px ' + sketchFontStack(s.font);
        const lines = s.text.split('\n');
        s.w = Math.max(10, ...lines.map((ln) => c.measureText(ln).width));
        s.h = lines.length * s.size * 1.25;
      };

      // ---- popups anchored to the toolbar ----
      let pop = null;
      const closePop = () => { if (pop) { pop.remove(); pop = null; } };
      const openPop = (kind, builder) => {
        if (pop && pop.dataset.kind === kind) { closePop(); return; }
        closePop();
        pop = el('div', { class: 'dt-pop sketch-pop' });
        pop.dataset.kind = kind;
        builder(pop);
        bar.append(pop);
      };

      // ---- selection context bar ----
      let selBar = null;
      const closeSelBar = () => { if (selBar) { selBar.remove(); selBar = null; } };
      const syncSel = () => {
        sel = sel.filter((s) => w.props.strokes.includes(s));
        closeSelBar();
        if (sel.length) buildSelBar();
      };
      const deleteSel = () => {
        snapshot();
        w.props.strokes = w.props.strokes.filter((s) => !sel.includes(s));
        sel = [];
        syncSel(); repaint(); save();
      };
      const duplicateSel = () => {
        snapshot();
        const copies = sel.map((s) => { const c = JSON.parse(JSON.stringify(s)); translateStroke(c, 18, 18); return c; });
        w.props.strokes.push(...copies);
        sel = copies;
        syncSel(); repaint(); save();
      };
      const reorderSel = (dir) => {
        snapshot();
        const arr = w.props.strokes;
        const idxs = sel.map((s) => arr.indexOf(s)).sort((a, b) => (dir > 0 ? b - a : a - b));
        for (const i of idxs) {
          const j = i + dir;
          if (j < 0 || j >= arr.length || sel.includes(arr[j])) continue;
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        repaint(); save(); syncSel();
      };
      const buildSelBar = () => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity;
        for (const s of sel) {
          const b = strokeBBox(s);
          x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1);
        }
        selBar = el('div', { class: 'sketch-selbar' });
        selBar.addEventListener('pointerdown', (e) => e.stopPropagation());
        let spop = null;
        const closeSpop = () => { if (spop) { spop.remove(); spop = null; } };
        const openSpop = (builder) => {
          closeSpop();
          spop = el('div', { class: 'dt-pop sketch-pop' });
          builder(spop);
          selBar.append(spop);
        };
        const btn = (content, title, fn) => el('button', { class: 'sk-btn', title, onclick: fn }, content);
        const isText = sel.every((s) => s.tool === 'text');
        selBar.append(
          btn(el('span', { class: 'sel-dot', style: 'background:' + sel[0].color }), 'Colour', () => openSpop((p) => {
            p.classList.add('sketch-colors');
            for (const c of INK_COLORS.flat()) {
              p.append(el('button', {
                class: 'dt-swatch' + (sel[0].color === c ? ' active' : ''), style: 'background:' + c,
                onclick: () => { snapshot(); for (const s of sel) s.color = c; repaint(); save(); syncSel(); },
              }));
            }
          })),
          btn(el('span', { class: 'sel-dot sel-dot-ink' }), isText ? 'Text size' : 'Line width', () => openSpop((p) => {
            SKETCH_SIZES.forEach((z, i) => {
              p.append(el('button', {
                class: 'dt-size', title: isText ? SKETCH_TEXT_SIZES[i] + ' px text' : z + ' px',
                onclick: () => {
                  snapshot();
                  for (const s of sel) {
                    if (s.tool === 'text') { s.size = SKETCH_TEXT_SIZES[i]; measureTextStroke(s); }
                    else s.size = z;
                  }
                  repaint(); save(); syncSel();
                },
              }, el('span', { style: `width:${3 + z}px;height:${3 + z}px;` })));
            });
          })),
          el('span', { class: 'sk-sep' }),
          btn(iconEl('copy'), 'Duplicate', duplicateSel),
          btn(iconEl('tofront'), 'Bring forward', () => reorderSel(1)),
          btn(iconEl('toback'), 'Send backward', () => reorderSel(-1)),
          el('span', { class: 'sk-sep' }),
          btn(iconEl('trash'), 'Delete', deleteSel),
        );
        wrap.append(selBar);
        const bw = selBar.offsetWidth || 220;
        selBar.style.left = clamp((x0 + x1) / 2 - bw / 2, 4, Math.max(4, wrap.clientWidth - bw - 4)) + 'px';
        selBar.style.top = Math.max(4, y0 - 42) + 'px';
      };

      // ---- text tool ----
      const commitEditor = (cancel) => {
        if (!editor) return;
        const ed = editor;
        editor = null;
        const text = ed.area.value.replace(/\s+$/, '');
        const ex = parseFloat(ed.area.style.left) + 3;
        const ey = parseFloat(ed.area.style.top) + 3;
        ed.area.remove();
        ed.fbar.remove();
        if (cancel || !text.trim()) {
          w.props.strokes = JSON.parse(ed.pre);
          repaint(); save();
          return;
        }
        history.push(ed.pre);
        if (history.length > 60) history.shift();
        future.length = 0;
        const s = { tool: 'text', x: ex, y: ey, size: ed.fs, color: ed.color, font: ed.font, text };
        if (ed.existing) { s.rot = ed.existing.rot; s.x = ed.existing.x; s.y = ed.existing.y; }
        measureTextStroke(s);
        w.props.strokes.push(s);
        // remember the style for the next text box on this pad
        w.props.textFont = ed.font;
        repaint(); save();
      };
      const openTextEditor = (x, y, existing) => {
        commitEditor();
        const pre = JSON.stringify(w.props.strokes);
        if (existing) {
          w.props.strokes = w.props.strokes.filter((s) => s !== existing);
          sel = [];
          syncSel();
          repaint();
        }
        const idx = Math.max(0, SKETCH_SIZES.indexOf(w.props.size));
        const ed = {
          pre, existing,
          fs: existing ? existing.size : SKETCH_TEXT_SIZES[idx] || 22,
          color: existing ? existing.color : w.props.color,
          font: existing ? (existing.font || 'sans') : (w.props.textFont || 'sans'),
        };
        const area = el('textarea', {
          class: 'sketch-text-edit', spellcheck: 'false', wrap: 'off',
          style: `left:${x - 3}px;top:${y - 3}px;`,
        });
        area.value = existing ? existing.text : '';
        const fbar = el('div', { class: 'sketch-textbar' });
        // taps on the bar must not blur (= commit) the textarea
        fbar.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
        const grow = () => {
          const c = ctx();
          c.font = '600 ' + ed.fs + 'px ' + sketchFontStack(ed.font);
          const lines = area.value.split('\n');
          area.style.width = Math.max(60, ...lines.map((ln) => c.measureText(ln).width + 18)) + 'px';
          area.style.height = Math.max(1, lines.length) * ed.fs * 1.25 + 12 + 'px';
          // keep the formatting bar pinned above the box (below it at the top edge)
          const top = parseFloat(area.style.top);
          fbar.style.left = clamp(parseFloat(area.style.left), 2, Math.max(2, wrap.clientWidth - fbar.offsetWidth - 2)) + 'px';
          fbar.style.top = (top > 40 ? top - 38 : top + area.offsetHeight + 6) + 'px';
        };
        const applyStyle = () => {
          area.style.fontSize = ed.fs + 'px';
          area.style.color = ed.color;
          area.style.fontFamily = sketchFontStack(ed.font);
          grow();
        };
        const renderFbar = () => {
          fbar.innerHTML = '';
          SKETCH_TEXT_SIZES.forEach((z, i) => {
            fbar.append(el('button', {
              class: 'sk-btn stb-size' + (ed.fs === z ? ' active' : ''), title: z + ' px',
              style: 'font-size:' + (11 + i * 3) + 'px;',
              onclick: () => { ed.fs = z; applyStyle(); renderFbar(); },
            }, 'A'));
          });
          fbar.append(el('span', { class: 'sk-sep' }));
          for (const [key, [label, stack]] of Object.entries(SKETCH_FONTS)) {
            fbar.append(el('button', {
              class: 'sk-btn stb-font' + (ed.font === key ? ' active' : ''), title: label,
              style: 'font-family:' + stack.replace(/"/g, "'") + ';',
              onclick: () => { ed.font = key; applyStyle(); renderFbar(); },
            }, 'Aa'));
          }
          fbar.append(el('span', { class: 'sk-sep' }));
          for (const c of INK_COLORS[0]) {
            fbar.append(el('button', {
              class: 'dt-swatch stb-swatch' + (ed.color === c ? ' active' : ''), style: 'background:' + c,
              onclick: () => { ed.color = c; applyStyle(); renderFbar(); },
            }));
          }
          const inp = el('input', {
            type: 'color', value: ed.color, style: 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;',
            oninput: (e) => { ed.color = e.target.value; applyStyle(); },
          });
          fbar.append(el('button', { class: 'dt-swatch stb-swatch dt-rainbow', title: 'Custom colour', onclick: () => inp.click() }), inp);
        };
        area.addEventListener('input', grow);
        area.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Escape') commitEditor(true);
        });
        area.addEventListener('blur', () => commitEditor());
        area.addEventListener('pointerdown', (e) => e.stopPropagation());
        editor = ed;
        ed.area = area;
        ed.fbar = fbar;
        wrap.append(area, fbar);
        renderFbar();
        applyStyle();
        requestAnimationFrame(() => area.focus());
      };

      // ---- clear menu ----
      const clearKind = (pred, label) => {
        if (!w.props.strokes.some(pred)) { toast('Nothing to clear'); return; }
        snapshot();
        w.props.strokes = w.props.strokes.filter((s) => !pred(s));
        sel = [];
        syncSel(); repaint(); save();
        if (label) toast(label);
      };
      const openClearPop = () => openPop('clear', (p) => {
        p.classList.add('sk-menu');
        const opt = (label, fn) => p.append(el('button', { onclick: () => { closePop(); fn(); } }, label));
        opt('Clear ink', () => clearKind((s) => !!s.pts, 'Ink cleared — shapes and text kept'));
        opt('Clear shapes', () => clearKind((s) => !s.pts && s.tool !== 'text', 'Shapes cleared'));
        opt('Clear text', () => clearKind((s) => s.tool === 'text', 'Text cleared'));
        p.append(el('hr'));
        opt('Clear all…', () => {
          if (!w.props.strokes.length) { clearKind(() => true); return; }
          confirmDialog('Clear everything on this draw pad?', () => clearKind(() => true), { label: 'Clear' });
        });
      });

      // ---- pad ⋯ menu ----
      const sendToNewScreen = () => {
        const copy = JSON.parse(JSON.stringify(w));
        copy.id = uid();
        copy.everywhere = false;
        copy.z = ++zTop;
        const idx = currentIndex();
        screens().splice(idx + 1, 0, { id: uid(), background: { ...screen().background }, widgets: [copy] });
        save();
        renderScreen();
        toast('Pad copied to a new screen (next slide)');
      };
      const saveTemplate = () => {
        promptDialog('Template name:', 'My pad', (name) => {
          if (!name.trim()) return;
          if (!Array.isArray(state.padTemplates)) state.padTemplates = [];
          state.padTemplates.push({
            name: name.trim().slice(0, 40) || 'Pad',
            pattern: w.props.pattern,
            strokes: JSON.parse(JSON.stringify(w.props.strokes)),
          });
          save();
          toast('Saved — find it under Change paper');
        }, { label: 'Save' });
      };
      // The paper is normally a CSS background on `wrap`, so a naive canvas
      // export shipped the ink on bare white — a handwriting guide without its
      // lines is not the sheet the class saw. Painted here in canvas terms,
      // matching SKETCH_PAPERS stop-for-stop (the SVG papers draw themselves).
      const paintPaper = async (c, iw, ih) => {
        const key = w.props.pattern;
        const p = SKETCH_PAPERS[key] || SKETCH_PAPERS.blank;
        const svg = (p.css || '').match(/url\("(data:image\/svg\+xml,[^"]+)"\)/);
        if (svg) {
          await new Promise((res) => {
            const img = new Image();
            img.onload = () => {
              let dw = iw, dh = ih, dx = 0, dy = 0;
              if (p.size === 'contain') {
                const k = Math.min(iw / img.width, ih / img.height);
                dw = img.width * k; dh = img.height * k;
                dx = (iw - dw) / 2; dy = (ih - dh) / 2;
              } else if (/px/.test(p.size || '')) {           // '100% 72px'
                dh = parseFloat(p.size.split(' ')[1]);
                dy = (ih - dh) / 2;
              }
              c.drawImage(img, dx, dy, dw, dh);
              res();
            };
            img.onerror = () => res();                        // paper missing beats no export
            img.src = svg[1];
          });
          return;
        }
        const hlines = (offsets, cycle, color) => {
          c.fillStyle = color;
          for (let y = 0; y < ih; y += cycle) for (const o of offsets) c.fillRect(0, y + o, iw, 1);
        };
        const vlines = (gap, color) => {
          c.fillStyle = color;
          for (let x = 0; x < iw; x += gap) c.fillRect(x, 0, 1, ih);
        };
        const diag = (deg, gap, color) => {
          // one stripe family of a repeating-linear-gradient(deg): lines
          // perpendicular to the gradient axis, `gap` apart along it
          c.save();
          c.translate(iw / 2, ih / 2);
          c.rotate((deg * Math.PI) / 180);
          c.fillStyle = color;
          const R = Math.hypot(iw, ih) / 2 + gap;
          for (let y = -R; y < R; y += gap) c.fillRect(-R, y, R * 2, 1);
          c.restore();
        };
        if (key === 'ruled') hlines([27], 28, 'rgba(37,99,235,0.28)');
        else if (key === 'writing') { hlines([0, 36], 58, 'rgba(37,99,235,0.5)'); hlines([18], 58, 'rgba(220,38,38,0.45)'); }
        else if (key === 'grid') { hlines([0], 24, 'rgba(37,99,235,0.14)'); vlines(24, 'rgba(37,99,235,0.14)'); }
        else if (key === 'dots') {
          c.fillStyle = 'rgba(37,99,235,0.4)';
          for (let y = 12; y < ih; y += 24) for (let x = 12; x < iw; x += 24) {
            c.beginPath(); c.arc(x, y, 1.5, 0, Math.PI * 2); c.fill();
          }
        } else if (key === 'iso') { hlines([0], 22, PAPER_SOFT); diag(60, 22, PAPER_SOFT); diag(120, 22, PAPER_SOFT); }
        else if (key === 'coord') {
          hlines([0], 24, PAPER_SOFT); vlines(24, PAPER_SOFT);
          c.fillStyle = 'rgba(51,65,85,0.55)';
          c.fillRect(0, ih / 2 - 1, iw, 2); c.fillRect(iw / 2 - 1, 0, 2, ih);
        } else if (key === 'music') hlines([20, 30, 40, 50, 60], 92, '#94a3b8');
      };
      const renderImage = async () => {
        const iw = Math.max(1, wrap.clientWidth), ih = Math.max(1, wrap.clientHeight);
        const out = document.createElement('canvas');
        out.width = iw * 2; out.height = ih * 2;
        const oc = out.getContext('2d');
        oc.fillStyle = '#ffffff';
        oc.fillRect(0, 0, out.width, out.height);
        oc.scale(2, 2);
        await paintPaper(oc, iw, ih);
        for (const s of w.props.strokes) paintStroke(oc, s);
        return out;
      };
      const exportPNG = () => {
        renderImage().then((cv) => cv.toBlob(async (b) => {
          const name = 'draw-pad-' + new Date().toISOString().slice(0, 10) + '.png';
          // Desktop first: blob anchors do nothing in the webview, and the old
          // path toasted "downloading" over that nothing. The native panel
          // both works and shows where the file went.
          if (window.SagePlatform && SagePlatform.saveBlob) {
            const r = await SagePlatform.saveBlob(name, b, 'PNG image');
            if (r === 'saved') toast('🖼 Saved');
            return;
          }
          // the native save dialog shows exactly where the file is going
          if (window.showSaveFilePicker) {
            try {
              const handle = await window.showSaveFilePicker({
                suggestedName: name,
                types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
              });
              const ws = await handle.createWritable();
              await ws.write(b);
              await ws.close();
              toast('🖼 Saved as “' + handle.name + '”');
              return;
            } catch (err) {
              if (err && err.name === 'AbortError') return; // user cancelled the dialog
            }
          }
          const a = el('a', { href: URL.createObjectURL(b), download: name });
          document.body.append(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
          toast('🖼 “' + name + '” is downloading to your Downloads folder');
        }));
      };
      const copyPNG = () => {
        renderImage().then((cv) => cv.toBlob(async (b) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
            toast('🖼 Image copied to the clipboard — paste it into any document (⌘V)');
          } catch (err) {
            toast('Clipboard blocked — use Export as PNG instead');
          }
        }));
      };
      const openPaperPop = () => openPop('paper', (p) => {
        p.classList.add('sketch-paper-pop');
        const grid = el('div', { class: 'paper-grid' });
        for (const [key, pp] of Object.entries(SKETCH_PAPERS)) {
          const sw = el('button', {
            class: 'paper-swatch' + (w.props.pattern === key ? ' active' : ''), title: pp.label,
            onclick: () => { w.props.pattern = key; applyPattern(); save(); closePop(); },
          });
          sw.style.backgroundImage = pp.css;
          sw.style.backgroundSize = pp.size ? (pp.size === 'contain' ? 'contain' : 'cover') : '';
          sw.style.backgroundRepeat = pp.repeat || '';
          sw.style.backgroundPosition = 'center';
          grid.append(sw);
        }
        p.append(grid);
        const tpls = state.padTemplates || [];
        if (tpls.length) {
          p.append(el('div', { class: 'hint', style: 'margin:6px 0 2px;' }, 'Pad templates'));
          for (const t of tpls) {
            p.append(el('div', { class: 'row', style: 'gap:4px;' },
              el('button', {
                class: 'btn ghost small grow', style: 'justify-content:flex-start;',
                onclick: () => {
                  const apply = () => {
                    snapshot();
                    w.props.strokes = JSON.parse(JSON.stringify(t.strokes));
                    w.props.pattern = t.pattern;
                    sel = [];
                    syncSel(); applyPattern(); repaint(); save(); closePop();
                  };
                  if (w.props.strokes.length) confirmDialog(`Replace this pad's content with "${t.name}"?`, apply, { label: 'Replace' });
                  else apply();
                },
              }, t.name),
              el('button', {
                class: 'icon-btn', title: 'Delete template',
                onclick: (e) => {
                  e.stopPropagation();
                  state.padTemplates = state.padTemplates.filter((x) => x !== t);
                  save();
                  closePop();
                  openPaperPop();
                },
              }, iconEl('trash')),
            ));
          }
        }
      });
      const menuBtn = () => el('button', {
        class: 'sk-btn', title: 'Pad options',
        onclick: () => openPop('menu', (p) => {
          p.classList.add('sk-menu');
          const mi = (icon, label, fn) => p.append(el('button', { onclick: () => { closePop(); fn(); } },
            iconEl(icon), el('span', { class: 'grow', style: 'text-align:left;' }, label)));
          mi('background', 'Change paper…', openPaperPop);
          mi('lock', w.props.locked ? 'Unlock drawing' : 'Lock drawing', () => {
            w.props.locked = !w.props.locked;
            sel = [];
            closeSelBar();
            save(); paintBar(); repaint();
            toast(w.props.locked ? 'Drawing locked' : 'Drawing unlocked');
          });
          mi('trash', 'Clear options…', openClearPop);
          p.append(el('hr'));
          mi('copy', 'Duplicate pad', () => duplicateWidget(w));
          mi('screens', 'Send to new screen', sendToNewScreen);
          mi('save', 'Save as pad template…', saveTemplate);
          p.append(el('hr'));
          mi('scribble', 'Copy drawing', () => {
            padClipboard = JSON.parse(JSON.stringify(w.props.strokes));
            toast('Drawing copied — paste it in any draw pad');
          });
          if (padClipboard && padClipboard.length) {
            mi('sticker', 'Paste drawing', () => {
              snapshot();
              const copies = JSON.parse(JSON.stringify(padClipboard));
              for (const s of copies) translateStroke(s, 12, 12);
              w.props.strokes.push(...copies);
              repaint(); save();
            });
          }
          p.append(el('hr'));
          mi('image', 'Export as PNG…', exportPNG);
          mi('copy', 'Copy image to clipboard', copyPNG);
        }),
      }, iconEl('dots'));

      // ---- toolbar ----
      const setTool = (id) => {
        commitEditor();
        w.props.tool = id;
        if (id !== 'select') { sel = []; closeSelBar(); }
        cv.style.cursor = id === 'select' ? 'default' : id === 'text' ? 'text' : 'crosshair';
        save(); paintBar(); repaint();
      };
      const paintBar = () => {
        closePop();
        bar.innerHTML = '';
        if (w.props.locked) {
          bar.append(
            el('span', { class: 'sketch-lock-note' }, iconEl('lock'), 'Drawing locked'),
            el('span', { class: 'grow' }),
            menuBtn(),
          );
          return;
        }
        const tb = (id, icon, title) => el('button', {
          class: 'sk-btn' + (w.props.tool === id ? ' active' : ''), title,
          onclick: () => setTool(id),
        }, iconEl(icon));
        const shapeActive = SKETCH_SHAPE_IDS.includes(w.props.tool);
        const curShape = SKETCH_SHAPES.find((s) => s[0] === (shapeActive ? w.props.tool : w.props.shape)) || SKETCH_SHAPES[0];
        const shapeBtn = el('button', {
          class: 'sk-btn' + (shapeActive ? ' active' : ''), title: 'Shapes',
          onclick: () => openPop('shape', (p) => {
            for (const [id, icon, label] of SKETCH_SHAPES) {
              p.append(el('button', {
                class: 'sk-btn' + (w.props.tool === id ? ' active' : ''), title: label,
                onclick: () => { w.props.shape = id; setTool(id); },
              }, iconEl(icon)));
            }
          }),
        }, iconEl(curShape[1]));
        const colorBtn = el('button', {
          class: 'sk-btn', title: 'Colour',
          onclick: () => openPop('color', (p) => {
            p.classList.add('sketch-colors');
            for (const c of INK_COLORS.flat()) {
              p.append(el('button', {
                class: 'dt-swatch' + (w.props.color === c ? ' active' : ''), style: 'background:' + c,
                onclick: () => { w.props.color = c; save(); paintBar(); },
              }));
            }
            const inp = el('input', {
              type: 'color', value: w.props.color, style: 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;',
              oninput: (e) => { w.props.color = e.target.value; save(); },
            });
            p.append(el('button', { class: 'dt-swatch dt-rainbow', title: 'Custom colour', onclick: () => inp.click() }), inp);
          }),
        }, el('span', { class: 'sel-dot', style: 'background:' + w.props.color }));
        const sizeBtn = el('button', {
          class: 'sk-btn', title: 'Width',
          onclick: () => openPop('size', (p) => {
            p.style.flexDirection = 'column';
            const sizes = el('div', { class: 'row', style: 'gap:2px;' });
            for (const z of SKETCH_SIZES) {
              sizes.append(el('button', {
                class: 'dt-size' + (w.props.size === z ? ' active' : ''), title: z + ' px',
                onclick: () => { w.props.size = z; save(); paintBar(); },
              }, el('span', { style: `width:${3 + z}px;height:${3 + z}px;` })));
            }
            p.append(sizes);
            if (w.props.tool === 'highlighter') {
              const op = el('div', { class: 'row', style: 'gap:2px;' });
              for (const a of SKETCH_ALPHAS) {
                op.append(el('button', {
                  class: 'dt-size' + (w.props.alpha === a ? ' active' : ''), title: Math.round(a * 100) + '% ink',
                  onclick: () => { w.props.alpha = a; save(); paintBar(); },
                }, el('span', { style: `width:14px;height:14px;opacity:${a};` })));
              }
              p.append(el('div', { class: 'hint', style: 'margin:4px 0 2px;' }, 'Marker opacity'), op);
            }
          }),
        }, el('span', { class: 'sel-dot sel-dot-ink', style: `width:${Math.min(16, 5 + w.props.size)}px;height:${Math.min(16, 5 + w.props.size)}px;` }));
        bar.append(
          tb('select', 'pointer', 'Select — move, resize, rotate; drag empty space to lasso'),
          tb('pen', 'draw', 'Pen'),
          tb('highlighter', 'marker', 'Marker'),
          tb('eraser', 'eraser', 'Eraser — removes a whole stroke'),
          shapeBtn,
          tb('text', 'text', 'Text box'),
          el('span', { class: 'sk-sep' }),
          colorBtn, sizeBtn,
          el('span', { class: 'sk-sep' }),
          el('button', { class: 'sk-btn', title: 'Undo', onclick: undo }, iconEl('undo')),
          el('button', { class: 'sk-btn', title: 'Redo', onclick: redoFn }, iconEl('redo')),
          el('button', { class: 'sk-btn', title: 'Clear…', onclick: openClearPop }, iconEl('trash')),
          menuBtn(),
        );
      };

      // ---- pointer interactions ----
      const strokeAt = (x, y) => {
        const arr = w.props.strokes;
        for (let i = arr.length - 1; i >= 0; i--) if (hitStroke(arr[i], x, y)) return arr[i];
        return null;
      };
      const handleAt = (x, y) => {
        if (sel.length !== 1) return null;
        const f = selFrame();
        const { corners, rotHandle } = frameCorners(f);
        if (Math.hypot(x - rotHandle[0], y - rotHandle[1]) < 10) return { type: 'rotate', f };
        for (let i = 0; i < 4; i++) {
          if (Math.hypot(x - corners[i][0], y - corners[i][1]) < 9) return { type: 'resize', f, corner: i };
        }
        return null;
      };
      const eraseAt = (x, y) => {
        const s = strokeAt(x, y);
        if (!s) return;
        if (!erasing) { snapshot(); erasing = true; }
        w.props.strokes = w.props.strokes.filter((q) => q !== s);
        sel = sel.filter((q) => q !== s);
        repaint(); save();
      };
      const resizeTo = (x, y) => {
        const { s, f, fixed, start, orig } = drag;
        const cos = Math.cos(-f.rot), sin = Math.sin(-f.rot);
        const dx = x - f.cx, dy = y - f.cy;
        const lx = f.cx + dx * cos - dy * sin;
        const ly = f.cy + dx * sin + dy * cos;
        const kx = clamp(start[0] - fixed[0] ? (lx - fixed[0]) / (start[0] - fixed[0]) : 1, 0.05, 40);
        const ky = clamp(start[1] - fixed[1] ? (ly - fixed[1]) / (start[1] - fixed[1]) : 1, 0.05, 40);
        const [fx, fy] = fixed;
        if (orig.pts) {
          s.pts = orig.pts.map(([px, py]) => [fx + (px - fx) * kx, fy + (py - fy) * ky]);
        } else if (orig.tool === 'text') {
          const k = (kx + ky) / 2;
          s.size = clamp(orig.size * k, 8, 220);
          s.x = fx + (orig.x - fx) * k;
          s.y = fy + (orig.y - fy) * k;
          measureTextStroke(s);
        } else {
          s.x0 = fx + (orig.x0 - fx) * kx; s.x1 = fx + (orig.x1 - fx) * kx;
          s.y0 = fy + (orig.y0 - fy) * ky; s.y1 = fy + (orig.y1 - fy) * ky;
        }
      };
      const inPoly = (x, y, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i], [xj, yj] = poly[j];
          if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      };
      const finishLasso = () => {
        const poly = lasso;
        lasso = null;
        let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
        for (const [x, y] of poly) {
          px0 = Math.min(px0, x); py0 = Math.min(py0, y);
          px1 = Math.max(px1, x); py1 = Math.max(py1, y);
        }
        if (poly.length < 3 || Math.hypot(px1 - px0, py1 - py0) < 6) { syncSel(); repaint(); return; }
        sel = w.props.strokes.filter((s) => {
          if (s.tool === 'eraser') return false;
          if (s.pts) {
            for (let i = 0; i < s.pts.length; i += 4) if (inPoly(s.pts[i][0], s.pts[i][1], poly)) return true;
            return false;
          }
          const [cx, cy] = geomCenter(s);
          return inPoly(cx, cy, poly);
        });
        syncSel(); repaint();
      };

      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activatePad();
        if (w.props.locked) return;
        // same belt-and-braces as modelwrite and the annotation layer: a touch
        // pointer can be gone again before the handler runs, and capture is an
        // optimisation here, not a requirement
        try { cv.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
        closePop();
        if (editor) { commitEditor(); return; }
        const [x, y] = pos(e);
        const tool = w.props.tool;
        if (tool === 'select') {
          const h = handleAt(x, y);
          if (h && h.type === 'rotate') {
            snapshot();
            drag = { mode: 'rotate', s: sel[0], cx: h.f.cx, cy: h.f.cy, offset: (sel[0].rot || 0) - Math.atan2(y - h.f.cy, x - h.f.cx) };
          } else if (h) {
            snapshot();
            const f = h.f;
            const boxCorners = [[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]];
            drag = {
              mode: 'resize', s: sel[0], f,
              fixed: boxCorners[(h.corner + 2) % 4],
              start: boxCorners[h.corner],
              orig: JSON.parse(JSON.stringify(sel[0])),
            };
          } else {
            const s = strokeAt(x, y);
            if (s) {
              if (e.shiftKey) {
                sel = sel.includes(s) ? sel.filter((q) => q !== s) : [...sel, s];
              } else {
                if (!sel.includes(s)) sel = [s];
                // snapshot lazily on first movement so a plain click-select
                // doesn't pollute undo history or clear the redo stack
                drag = { mode: 'move', lx: x, ly: y, moved: false, pre: JSON.stringify(w.props.strokes) };
              }
            } else {
              sel = [];
              lasso = [[x, y]];
            }
          }
          closeSelBar();
          repaint();
        } else if (tool === 'text') {
          openTextEditor(x, y);
        } else if (tool === 'eraser') {
          erasing = false;
          eraseAt(x, y);
        } else if (tool === 'pen' || tool === 'highlighter') {
          live = { tool, color: w.props.color, size: w.props.size, pts: [[x, y]] };
          if (tool === 'highlighter') live.alpha = w.props.alpha;
        } else {
          live = { tool, color: w.props.color, size: w.props.size, x0: x, y0: y, x1: x, y1: y };
        }
      });
      cv.addEventListener('pointermove', (e) => {
        const [x, y] = pos(e);
        if (live) {
          if (live.pts) {
            const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
            for (const ev of (coalesced.length ? coalesced : [e])) {
              const r = cv.getBoundingClientRect();
              const px = ev.clientX - r.left, py = ev.clientY - r.top;
              const last = live.pts[live.pts.length - 1];
              if (Math.hypot(px - last[0], py - last[1]) < 1.5) continue;
              live.pts.push([px, py]);
            }
          } else {
            live.x1 = x; live.y1 = y;
          }
          repaint();
        } else if (lasso) {
          lasso.push([x, y]);
          repaint();
        } else if (drag) {
          if (drag.mode === 'move') {
            const dx = x - drag.lx, dy = y - drag.ly;
            drag.lx = x; drag.ly = y;
            if ((dx || dy) && !drag.moved) {
              drag.moved = true;
              history.push(drag.pre);
              if (history.length > 60) history.shift();
              future.length = 0;
            }
            for (const s of sel) translateStroke(s, dx, dy);
          } else if (drag.mode === 'rotate') {
            let rot = drag.offset + Math.atan2(y - drag.cy, x - drag.cx);
            for (const snap of [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI]) {
              if (Math.abs(rot - snap) < 0.06) rot = snap;
            }
            drag.s.rot = rot;
          } else if (drag.mode === 'resize') {
            resizeTo(x, y);
          }
          repaint();
        } else if (w.props.tool === 'eraser' && e.buttons) {
          eraseAt(x, y);
        }
      });
      const finish = () => {
        if (live) {
          if (live.pts) {
            live.pts = live.pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
          } else {
            live.x0 = Math.round(live.x0); live.y0 = Math.round(live.y0);
            live.x1 = Math.round(live.x1); live.y1 = Math.round(live.y1);
            if (Math.abs(live.x1 - live.x0) < 3 && Math.abs(live.y1 - live.y0) < 3) { live = null; repaint(); return; }
          }
          snapshot();
          w.props.strokes.push(live);
          live = null;
          repaint(); save();
        } else if (lasso) {
          finishLasso();
        } else if (drag) {
          drag = null;
          syncSel(); repaint(); save();
        }
        erasing = false;
      };
      cv.addEventListener('pointerup', finish);
      cv.addEventListener('pointercancel', () => { live = null; lasso = null; drag = null; erasing = false; repaint(); });
      cv.addEventListener('dblclick', (e) => {
        if (w.props.locked) return;
        const [x, y] = pos(e);
        const s = strokeAt(x, y);
        if (s && s.tool === 'text' && (w.props.tool === 'select' || w.props.tool === 'text')) openTextEditor(s.x, s.y, s);
      });

      // ---- keyboard: pad shortcuts win over widget shortcuts while the pad is focused
      const myKeys = (e) => {
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return false;
        const mod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();
        if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && sel.length) { e.preventDefault(); deleteSel(); return true; }
        if (e.key === 'Escape' && (sel.length || pop)) { sel = []; syncSel(); closePop(); repaint(); return true; }
        if (mod && !e.shiftKey && key === 'z') { e.preventDefault(); undo(); return true; }
        if (mod && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); redoFn(); return true; }
        if (mod && key === 'd' && sel.length) { e.preventDefault(); duplicateSel(); return true; }
        return false;
      };
      const activatePad = () => { sketchKeyHook = myKeys; };
      const outsideDown = (e) => {
        if (!body.contains(e.target)) {
          if (sketchKeyHook === myKeys) sketchKeyHook = null;
          if (editor) commitEditor();
          if (sel.length) { sel = []; syncSel(); repaint(); }
        }
      };
      document.addEventListener('pointerdown', outsideDown, true);
      body.addEventListener('pointerdown', activatePad, true);

      const size = () => {
        const dpr = window.devicePixelRatio || 1;
        cv.width = Math.max(1, wrap.clientWidth * dpr);
        cv.height = Math.max(1, wrap.clientHeight * dpr);
        repaint();
      };
      const ro = new ResizeObserver(size);
      ro.observe(wrap);
      applyPattern();
      cv.style.cursor = w.props.tool === 'select' ? 'default' : w.props.tool === 'text' ? 'text' : 'crosshair';
      paintBar();
      size();
      return () => {
        ro.disconnect();
        document.removeEventListener('pointerdown', outsideDown, true);
        if (sketchKeyHook === myKeys) sketchKeyHook = null;
        if (editor) commitEditor();
      };
    },
    settings(box, w, api) {
      const grid = el('div', { class: 'paper-grid' });
      for (const [key, pp] of Object.entries(SKETCH_PAPERS)) {
        const sw = el('button', {
          class: 'paper-swatch' + (w.props.pattern === key ? ' active' : ''),
          title: pp.label,
          onclick: () => { w.props.pattern = key; api.refresh(); },
        });
        sw.style.backgroundImage = pp.css;
        sw.style.backgroundSize = pp.size ? (pp.size === 'contain' ? 'contain' : 'cover') : '';
        sw.style.backgroundRepeat = pp.repeat || '';
        sw.style.backgroundPosition = 'center';
        grid.append(sw);
      }
      box.append(
        el('div', {}, el('div', { class: 'hint', style: 'margin-bottom:6px;' }, 'Paper'), grid),
        checkRow('Lock drawing (view only)', w.props.locked, (v) => { w.props.locked = v; api.refresh(); }),
        el('div', { class: 'hint' }, 'Writing, maths, music and planning papers. Duplicate, export and clear options live under the pad’s ⋯ menu.'),
      );
    },
  };

  // ---------------------------------------------------------------- settings helpers
  function settingRow(label, control) {
    return el('div', { class: 'row' }, el('span', { style: 'min-width:82px;' }, label), control);
  }
  function checkRow(label, value, onChange) {
    const cb = el('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
    cb.checked = !!value;
    return el('label', { class: 'row', style: 'cursor:pointer;' }, cb, label);
  }
  function selectInput(options, value, onChange) {
    const s = el('select', { class: 'text-input', style: 'width:auto;', onchange: (e) => onChange(e.target.value) });
    for (const [v, label] of options) s.append(el('option', { value: v }, label));
    s.value = value;
    return s;
  }
  function rangeInput(min, max, value, onChange) {
    return el('input', { type: 'range', min, max, value, class: 'grow', oninput: (e) => onChange(e.target.value) });
  }
  function colorInput(value, onChange) {
    return el('input', { type: 'color', value, onchange: (e) => onChange(e.target.value) });
  }
  function pickImage(cb, maxW) {
    const input = el('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // downscale large images so localStorage stays healthy
        const img = new Image();
        img.onload = () => {
          const limit = maxW || 1600;
          if (img.width <= limit && file.size < 400_000) { cb(reader.result); return; }
          const scale = Math.min(1, limit / img.width);
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          // small pngs keep their transparency (coin cut-outs); the rest go jpeg
          cb(file.type === 'image/png' && limit <= 400 ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  // ---------------------------------------------------------------- widget themes
  // lets teachers color-code widgets per team/group; `clear` = transparent chrome,
  // `dark` = light ink (also fixes input styling on dark cards)
  const THEMES = [
    { id: 'card', bg: 'rgba(255,255,255,0.92)', ink: '#22303c', soft: '#5b6b7b', acc: '#6366f1' },
    { id: 'glass', bg: 'rgba(255,255,255,0.5)', ink: '#22303c', soft: '#44566a', acc: '#0f766e' },
    { id: 'clear', bg: 'transparent', ink: '#22303c', soft: '#44566a', acc: '#0f766e', clear: true },
    { id: 'clearlight', bg: 'transparent', ink: '#f8fafc', soft: 'rgba(248,250,252,0.75)', acc: '#c7d2fe', clear: true, dark: true },
    { id: 'lilac', bg: '#ede9fe', ink: '#3b3663', soft: '#6d678f', acc: '#8b5cf6' },
    { id: 'mint', bg: '#d9f7e8', ink: '#173f2e', soft: '#3f6f5b', acc: '#22c55e' },
    { id: 'lemon', bg: '#fef3c7', ink: '#4a3b12', soft: '#7c6a33', acc: '#eab308' },
    { id: 'peach', bg: '#ffe4cc', ink: '#54300f', soft: '#8a5f3a', acc: '#f97316' },
    { id: 'pink', bg: '#fce7f3', ink: '#5c1f42', soft: '#8f4a6e', acc: '#ec4899' },
    { id: 'sky', bg: '#dbeffe', ink: '#123a5c', soft: '#3f6b8f', acc: '#3b82f6' },
    { id: 'rose', bg: '#fee2e2', ink: '#7f1d1d', soft: '#a05252', acc: '#ef4444' },
    { id: 'sun', bg: '#fde047', ink: '#422006', soft: '#71571e', acc: '#b45309' },
    { id: 'tangerine', bg: '#fdba74', ink: '#431407', soft: '#7c4a26', acc: '#c2410c' },
    { id: 'grape', bg: '#7c3aed', ink: '#f5f3ff', soft: '#d8cef8', acc: '#ddd6fe', dark: true },
    { id: 'ocean', bg: '#1d4ed8', ink: '#eff6ff', soft: '#bcd3f7', acc: '#93c5fd', dark: true },
    { id: 'crimson', bg: '#991b1b', ink: '#fef2f2', soft: '#e7bcbc', acc: '#fca5a5', dark: true },
    { id: 'forest', bg: '#14532d', ink: '#ecfdf5', soft: '#b3d4c0', acc: '#86efac', dark: true },
    { id: 'navy', bg: '#1e3a5f', ink: '#e0f2fe', soft: '#a9c4d8', acc: '#38bdf8', dark: true },
    { id: 'dark', bg: '#26323c', ink: '#f1f5f9', soft: '#aebbc7', acc: '#818cf8', dark: true },
    { id: 'ink', bg: '#0f172a', ink: '#f8fafc', soft: '#a9b4c4', acc: '#a5b4fc', dark: true },
  ];

  function applyTheme(widgetEl, w) {
    const t = THEMES.find((x) => x.id === (w.theme || 'card')) || THEMES[0];
    widgetEl.classList.toggle('theme-clear', !!t.clear);
    widgetEl.classList.toggle('theme-dark', !!t.dark);
    widgetEl.style.background = t.bg;
    widgetEl.style.setProperty('--ink', t.ink);
    widgetEl.style.setProperty('--ink-soft', t.soft);
  }

  function buildThemeGrid(w) {
    const grid = el('div', { class: 'theme-grid' });
    const paint = () => {
      for (const c of grid.children) c.classList.toggle('active', (w.theme || 'card') === c.dataset.theme);
    };
    for (const t of THEMES) {
      const card = el('button', {
        class: 'theme-card' + (t.clear ? ' checker' : ''),
        'data-theme': t.id,
        title: t.id,
        onclick: () => {
          w.theme = t.id;
          save();
          const inst = instances.get(w.id);
          if (inst) applyTheme(inst.el, w);
          paint();
        },
      },
        el('span', { class: 'tc-bar', style: 'background:' + t.ink }),
        el('span', { class: 'tc-row' },
          el('span', { class: 'tc-bar tc-short', style: 'background:' + t.acc }),
          el('span', { class: 'tc-dot', style: 'background:' + t.ink })),
      );
      if (!t.clear) card.style.background = t.bg;
      grid.append(card);
    }
    paint();
    return grid;
  }

  // ---------------------------------------------------------------- settings side panel
  let settingsPanel = null;
  let settingsFor = null;

  function closeSettingsPanel() {
    if (settingsPanel) { settingsPanel.remove(); settingsPanel = null; settingsFor = null; }
  }

  function openSettingsPanel(w, force) {
    if (!force && settingsFor === w.id) { closeSettingsPanel(); return; }
    const inst = instances.get(w.id);
    if (!inst) { closeSettingsPanel(); return; }
    const def = WIDGETS[w.type];
    const body = el('div', { class: 'spanel-body' });
    if (w.type === 'text') buildTextDefaults(body);
    if (def.settings) {
      const box = el('div', { class: 'spanel-sec' });
      const api = { ...inst.api, refresh: () => { inst.api.refresh(); openSettingsPanel(w, true); } };
      def.settings.call(def, box, w, api);
      body.append(el('h4', {}, 'Options'), box);
    }
    body.append(el('h4', {}, 'Color theme'), buildThemeGrid(w));
    // a refresh from a control inside the open panel swaps the body in
    // place: tearing the whole panel down replays the entrance animation
    // (the panel flashes on every checkbox) and loses the scroll position
    if (force && settingsPanel && settingsFor === w.id) {
      const old = settingsPanel.querySelector('.spanel-body');
      if (old) {
        const keep = old.scrollTop;
        old.replaceWith(body);
        body.scrollTop = keep;
        return;
      }
    }
    closeSettingsPanel();
    settingsFor = w.id;
    settingsPanel = el('div', { class: 'spanel' },
      el('div', { class: 'spanel-head', style: '--acc:' + (def.accent || '#c7d2fe') },
        iconEl(def.icon), el('h3', {}, def.title),
        el('button', { class: 'spanel-close', title: 'Close', onclick: () => closeSettingsPanel() }, iconEl('close'))),
      body);
    document.body.append(settingsPanel);
  }

  function buildTextDefaults(body) {
    if (!state.defaults || typeof state.defaults !== 'object') state.defaults = {};
    const d = state.defaults.text = state.defaults.text || { font: FONT_LIST[0][1], size: 24, spell: false };
    const fontSel = el('select', {
      class: 'text-input', style: 'width:auto;flex:1;min-width:0;',
      onchange: () => { d.font = fontSel.value; save(); },
    });
    for (const [name, stack] of FONT_LIST) fontSel.append(el('option', { value: stack, style: 'font-family:' + stack }, name));
    fontSel.value = d.font;
    if (fontSel.selectedIndex < 0) fontSel.value = FONT_LIST[0][1];
    const box = el('div', { class: 'spanel-sec' },
      settingRow('Font', fontSel),
      settingRow('Size', el('input', {
        class: 'text-input', type: 'number', min: 10, max: 120, value: d.size, style: 'width:80px;',
        onchange: (e) => { d.size = clamp(+e.target.value || 24, 10, 120); save(); },
      })),
      checkRow('Enable spell check', d.spell, (v) => {
        d.spell = v;
        save();
        document.querySelectorAll('.text-edit').forEach((n) => { n.spellcheck = v; });
      }),
    );
    body.append(el('h4', {}, 'Defaults for new text widgets'), box);
  }

  // ---------------------------------------------------------------- widget shell
  const stage = $('#stage');
  let zTop = 10;

  let autoEditId = null; // set so a freshly added text widget opens with its toolbar active

  function addWidget(type) {
    const def = WIDGETS[type];
    // a template or import can name a widget this build doesn't have — say so
    // rather than throw halfway through applying it
    if (!def) { toast('⚠️ This build doesn’t have a “' + type + '” widget — skipped it.'); return null; }
    const scr = screen();
    const n = scr.widgets.length;
    const w = {
      id: uid(), type,
      x: clamp(80 + n * 30, 0, window.innerWidth - def.w - 40),
      y: clamp(80 + n * 26, 0, window.innerHeight - def.h - 120),
      w: def.w, h: def.h, z: ++zTop,
      props: def.defaults(),
    };
    scr.widgets.push(w);
    if (type === 'text') autoEditId = w.id;
    save();
    mountWidget(w);
    return w;
  }

  // ------------------------------------------------------------ closing work
  // A widget that holds days of a class's handwriting must not be one mis-click
  // from gone. A flip chart's armour is that the paper still exists after you
  // fold the easel away, so closing gets two layers (Glenn, 2026-07-26):
  //   1. a question, when there is work to lose — with Duplicate as a way out
  //   2. the bin underneath it, which needs no teacher awareness at all
  // The bin is the part that is actually bullet-proof; the question only helps
  // a teacher who is looking at the screen when they mis-click.
  const BIN_MAX = 12;                       // most recent closures, newest first
  const BIN_DAYS = 30;

  // Only ASK when the widget type says there is something to lose. A clock has
  // nothing, and a question that fires every time teaches a teacher to click
  // straight through it — which would cost exactly the work it means to save.
  function widgetHasWork(w) {
    const def = WIDGETS[w.type];
    if (!def || typeof def.hasWork !== 'function') return false;
    try { return !!def.hasWork(w); } catch (_) { return true; }
  }

  // Binning is separate and far more generous: anything with real content in it
  // is recoverable whether or not its type has opted into the question. That is
  // the layer that needs no teacher awareness, so it should catch the most.
  function widgetWorthKeeping(w) {
    const def = WIDGETS[w.type];
    if (def && typeof def.hasWork === 'function') return widgetHasWork(w);
    try { return JSON.stringify(w.props || {}).length > 400; } catch (_) { return false; }
  }

  function binWidget(w, screenId) {
    if (!widgetWorthKeeping(w)) return;
    state.bin = Array.isArray(state.bin) ? state.bin : [];
    state.bin.unshift({
      at: Date.now(), screenId,
      title: (WIDGETS[w.type] && WIDGETS[w.type].title) || w.type,
      w: JSON.parse(JSON.stringify(w)),
    });
    const cutoff = Date.now() - BIN_DAYS * 864e5;
    state.bin = state.bin.filter((b) => b && b.at > cutoff).slice(0, BIN_MAX);
  }

  // ---------------------------------------------------------------- snapshots
  // The bin catches a mis-click on the X. It cannot catch Clear page, deleting
  // a page off the washing line, or deleting the screen or deck the work sits
  // on — the acts that actually destroy days of writing. Those go to
  // SageSnapshots (IndexedDB: ~5.8GB of room here against localStorage's 5MB,
  // and asynchronous, so a copy can never stall a stroke).
  const titleOf = (w) => (WIDGETS[w.type] && WIDGETS[w.type].title) || w.type;

  // Copy a widget, screen or deck the instant before something destroys it.
  function snapshotBefore(thing, label, opts) {
    if (!window.SageSnapshots || !thing) return;
    const o = opts || {};
    const kind = o.kind || 'widget';
    if (kind === 'widget' && !widgetWorthKeeping(thing)) return;
    if (kind !== 'widget' && !worthKeeping(thing, kind)) return;
    SageSnapshots.take(thing, {
      kind, reason: 'before', label,
      title: o.title || (kind === 'widget' ? titleOf(thing) : null),
      screenId: o.screenId || null,
    });
  }
  // A screen or deck is worth a copy if anything inside it is.
  function worthKeeping(thing, kind) {
    const scrs = kind === 'deck' ? (thing.screens || []) : [thing];
    return scrs.some((s) => s && ((s.widgets || []).some(widgetWorthKeeping)
      || (Array.isArray(s.ink) && s.ink.length)));
  }

  // The rolling daily copy. Runs at boot and on the first save of any new
  // calendar day, so a unit worked on across a week leaves a trail of days
  // rather than one overwritten "latest".
  let lastDailyDay = null;
  function dailySnapshots() {
    if (!window.SageSnapshots) return;
    const day = SageSnapshots.dayKey(Date.now());
    if (day === lastDailyDay) return;
    lastDailyDay = day;
    for (const d of state.decks) {
      for (const scr of d.screens) {
        for (const w of scr.widgets) {
          if (!widgetWorthKeeping(w)) continue;
          SageSnapshots.take(w, { reason: 'daily', title: titleOf(w), screenId: scr.id });
        }
      }
    }
  }

  function restoreFromBin(entry) {
    if (!entry || !entry.w) return;
    // the widget may have been closed on a screen in another deck
    let scr = null;
    for (const d of state.decks) {
      const hit = d.screens.find((s) => s.id === entry.screenId);
      if (hit) { scr = hit; break; }
    }
    scr = scr || screen();
    if (!scr) return;
    const w = JSON.parse(JSON.stringify(entry.w));
    w.id = uid();                            // never collide with a live widget
    w.z = ++zTop;
    scr.widgets.push(w);
    state.bin = (state.bin || []).filter((b) => b !== entry);
    save();
    renderScreen();
    toast('Put back — ' + entry.title);
  }

  function removeWidget(id, opts) {
    const o = opts || {};
    const w = findWidgetById(id);
    const scr = w ? screens().find((s) => s.widgets.some((x) => x.id === id)) : null;
    if (w && !o.force && widgetHasWork(w)) {
      const title = (WIDGETS[w.type] && WIDGETS[w.type].title) || 'this widget';
      // The copy is automatic — a teacher holding a lesson plan and a head full
      // of verbal assessments should not have to spot a "duplicate first"
      // button and decide. The question just tells them the copy exists and
      // where it is (Glenn, 2026-07-26).
      confirmDialog(
        // named by position, not by icon: the button renders as a download
        // arrow (iconEl('save')), so pointing at a floppy sends a teacher
        // hunting for something that is not on the screen
        'Close ' + title + '? A copy is kept for 30 days — it’s in “Your data”, '
        + 'the download button at the top right, under “Recently closed”.',
        () => removeWidget(id, { force: true }),
        { label: 'Close it', cancelLabel: 'Keep it open', danger: false },
      );
      return;
    }
    if (w) binWidget(w, scr && scr.id);
    if (settingsFor === id) closeSettingsPanel();
    clearSessionFile(id);
    // widgets shown on all screens live on another screen's list, so search every deck
    for (const d of state.decks) for (const scr2 of d.screens) scr2.widgets = scr2.widgets.filter((x) => x.id !== id);
    const inst = instances.get(id);
    if (inst) {
      if (inst.cleanup) inst.cleanup();
      inst.el.remove();
      instances.delete(id);
    }
    save();
    // the toast is the no-awareness-required path back: it needs no menu, no
    // reading and no understanding of where things go when they are closed
    if (w && state.bin && state.bin[0] && state.bin[0].w.id === w.id) {
      const entry = state.bin[0];
      toast('Closed — put it back?', { action: 'Put it back', onAction: () => restoreFromBin(entry) });
    }
  }

  function findWidgetById(id) {
    for (const scr of screens()) {
      const w = scr.widgets.find((x) => x.id === id);
      if (w) return w;
    }
    return null;
  }

  function duplicateWidget(w) {
    const copy = JSON.parse(JSON.stringify(w));
    copy.id = uid();
    copy.x += 26;
    copy.y += 26;
    copy.z = ++zTop;
    copy.everywhere = false;
    if (sessionFiles[w.id]) setSessionFile(copy.id, sessionFiles[w.id].file);
    screen().widgets.push(copy);
    save();
    mountWidget(copy);
  }

  function toggleLock(w) {
    w.locked = !w.locked;
    const inst = instances.get(w.id);
    if (inst) inst.el.classList.toggle('locked', !!w.locked);
    save();
    toast(w.locked ? 'Widget locked in place' : 'Widget unlocked');
  }

  function toggleEverywhere(w) {
    w.everywhere = !w.everywhere;
    save();
    renderScreen();
    toast(w.everywhere ? 'Widget now shows on every screen' : 'Widget only on its own screen');
  }

  function bringFront(w) {
    w.z = ++zTop;
    const inst = instances.get(w.id);
    if (inst) inst.el.style.zIndex = w.z;
    save();
  }

  function sendBack(w) {
    const zs = [...instances.keys()].map((id) => (findWidgetById(id) || {}).z || 10);
    w.z = Math.max(1, Math.min(...zs) - 1);
    const inst = instances.get(w.id);
    if (inst) inst.el.style.zIndex = w.z;
    save();
  }

  function resizeToFit(w) {
    const inst = instances.get(w.id);
    if (!inst) return;
    const bodyEl = inst.el.querySelector('.widget-body');
    w.w = clamp(Math.ceil(bodyEl.scrollWidth) + 26, 150, window.innerWidth - 20);
    w.h = clamp(Math.ceil(bodyEl.scrollHeight) + 46, 100, window.innerHeight - 20);
    inst.el.style.width = w.w + 'px';
    inst.el.style.height = w.h + 'px';
    save();
  }

  function spotlightWidget(w) {
    const inst = instances.get(w.id);
    if (!inst) return;
    bringFront(w);
    const ov = el('div', { class: 'spotlight-overlay', style: 'z-index:' + (w.z - 1) + ';' },
      el('div', { class: 'spotlight-hint' }, 'Click outside the widget to end the spotlight'));
    ov.addEventListener('pointerdown', () => ov.remove());
    stage.append(ov);
  }

  // widget ⋮ menu (one open at a time)
  let menuEl = null;
  function closeWidgetMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }
  document.addEventListener('pointerdown', (e) => {
    if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('.wbtn.menu, .tb-menu'))) closeWidgetMenu();
  });

  function openWidgetMenu(widgetEl, w) {
    if (menuEl && menuEl.parentElement === widgetEl) { closeWidgetMenu(); return; }
    closeWidgetMenu();
    const item = (icon, label, kbd, fn) =>
      el('button', { onclick: () => { closeWidgetMenu(); fn(); } },
        iconEl(icon), el('span', { class: 'grow', style: 'text-align:left;' }, label),
        kbd ? el('kbd', {}, kbd) : null);
    menuEl = el('div', { class: 'wmenu' },
      item('trash', 'Remove', '⌘⌫', () => removeWidget(w.id)),
      item('gear', 'Settings', 'S', () => openSettingsPanel(w)),
      el('hr'),
      item('fit', 'Resize to fit', '', () => resizeToFit(w)),
      item('copy', 'Duplicate', '⌘D', () => duplicateWidget(w)),
      // §4.5 poster seam: the method's existence is the capability
      (window.SagePrint && WIDGETS[w.type]
        && (WIDGETS[w.type].toPrintable || WIDGETS[w.type].toPrintablePages))
        ? item('print', 'Print…', '', () => {
            const def = WIDGETS[w.type];
            let job = null, at = 0;
            try {
              // §4.6: a widget that holds several pages offers the plural seam
              // and the dialog lets the teacher tick which ones are worth paper
              if (def.toPrintablePages) {
                job = def.toPrintablePages(w);
                if (def.printCurrent) at = def.printCurrent(w);
              } else {
                job = def.toPrintable(w);
              }
            }
            catch (err) { toast('Couldn’t prepare the page — ' + ((err && err.message) || 'unknown error')); return; }
            if (!job || (Array.isArray(job) && !job.length)) { toast('Nothing to print yet'); return; }
            SagePrint.openDialog(job, { title: def.title, current: at });
          })
        : null,
      item('pin', w.everywhere ? 'Only on this screen' : 'Show on all screens', '⇧P', () => toggleEverywhere(w)),
      item('spot', 'Spotlight', '⇧S', () => spotlightWidget(w)),
      item('lock', w.locked ? 'Unlock position' : 'Lock in position', '⇧L', () => toggleLock(w)),
      el('hr'),
      item('tofront', 'Bring to front', '⌘↑', () => bringFront(w)),
      item('toback', 'Send to back', '⌘↓', () => sendBack(w)),
    );
    widgetEl.append(menuEl);
  }

  // keyboard shortcuts act on the most recently clicked widget
  let lastActiveId = null;
  // a focused draw pad claims keys first (delete selection, undo…) so Delete
  // doesn't remove the whole widget while objects are selected inside the pad
  let sketchKeyHook = null;
  window.addEventListener('keydown', (e) => {
    if (sketchKeyHook && sketchKeyHook(e)) return;
    if (e.key === 'Escape') {
      if (helping) { exitWhatsThis(); return; }
      if (dashEl && !modal) { closeDashboard(); return; }
      // the shades sit above the dock, so without this the only exits were
      // re-finding the tool in More or dragging all four tabs home — the
      // spotlight's Esc parity was always the intent
      if (shadesEl) { toggleShades(); return; }
      closeSettingsPanel(); closeWidgetMenu(); closeDockPanels(); return;
    }
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!lastActiveId || !instances.has(lastActiveId)) return;
    const w = findWidgetById(lastActiveId);
    if (!w) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    // Delete/Backspace ALONE used to remove the widget the teacher last touched.
    // The bin makes that recoverable, but on a touch board with a keyboard
    // trailing off the trolley it is still a one-key way to make a class watch
    // their writing vanish. It now needs a modifier — the same ⌘/Ctrl the
    // duplicate and layering shortcuts already use — and a bare press says why.
    if ((e.key === 'Delete' || e.key === 'Backspace') && mod) { e.preventDefault(); removeWidget(w.id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      toast('Hold ⌘ (or Ctrl) with Delete to close a widget — or use its ⋯ menu.', { ms: 4000 });
    }
    else if (!mod && !e.shiftKey && key === 's') openSettingsPanel(w);
    else if (!mod && e.shiftKey && key === 's') spotlightWidget(w);
    else if (!mod && e.shiftKey && key === 'l') toggleLock(w);
    else if (!mod && e.shiftKey && key === 'p') toggleEverywhere(w);
    else if (mod && e.key === 'ArrowUp') { e.preventDefault(); bringFront(w); }
    else if (mod && e.key === 'ArrowDown') { e.preventDefault(); sendBack(w); }
    else if (mod && key === 'd') { e.preventDefault(); duplicateWidget(w); }
  });

  function mountWidget(w) {
    const def = WIDGETS[w.type];
    if (!def) return;

    const body = el('div', { class: 'widget-body' });
    const widgetEl = el('div', { class: 'widget', 'data-help': w.type, style: `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;z-index:${w.z};` });

    // A widget that lays itself out to the width it has been given needs to
    // hear about the resize. ResizeObserver is the obvious answer and is fine
    // in a browser, but the resize grip below mutates the element's style
    // directly, so a plain callback is both simpler and one less thing that has
    // to be supported wherever this runs. Cleared on every remount, so a
    // stale closure can never outlive the mount that registered it.
    let resizeHook = null;
    const api = {
      onResize(fn) { resizeHook = typeof fn === 'function' ? fn : null; },
      openMenu: () => openWidgetMenu(widgetEl, w),
      toggleSettings: () => openSettingsPanel(w),
      removeSelf: () => removeWidget(w.id),
      resizeToFit: () => resizeToFit(w),
      refresh() {
        save();
        remount();
      },
      refreshAllOf(...types) {
        return () => {
          save();
          for (const other of screen().widgets) {
            if (types.includes(other.type)) {
              const inst = instances.get(other.id);
              if (inst) { remountWidget(other); }
            }
          }
        };
      },
    };

    let cleanup = null;
    const remount = () => {
      if (cleanup) cleanup();
      resizeHook = null;
      body.innerHTML = '';
      cleanup = def.mount.call(def, body, w, api) || null;
      applyTheme(widgetEl, w);
    };

    const header = el('div', { class: 'widget-header', style: '--acc:' + (def.accent || '#c7d2fe') },
      el('span', { class: 'widget-title' }, iconEl(def.icon), def.title),
      el('button', {
        class: 'wbtn', title: 'Settings',
        onclick: (e) => { e.stopPropagation(); openSettingsPanel(w); },
      }, iconEl('gear')),
      el('button', {
        class: 'wbtn menu', title: 'More options',
        onclick: (e) => { e.stopPropagation(); openWidgetMenu(widgetEl, w); },
      }, iconEl('dots')),
      el('button', { class: 'wbtn close', title: 'Close', onclick: (e) => { e.stopPropagation(); removeWidget(w.id); } }, iconEl('close')),
    );

    const handle = el('div', { class: 'resize-handle' });
    widgetEl.append(header, body, handle);
    stage.append(widgetEl);

    widgetEl.addEventListener('pointerdown', () => {
      lastActiveId = w.id;
      w.z = ++zTop;
      widgetEl.style.zIndex = w.z;
      save();
    });
    if (w.locked) widgetEl.classList.add('locked');

    // drag
    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.wbtn') || w.locked) return;
      e.preventDefault();
      const startX = e.clientX - w.x;
      const startY = e.clientY - w.y;
      const move = (ev) => {
        w.x = clamp(ev.clientX - startX, -w.w + 60, window.innerWidth - 60);
        w.y = clamp(ev.clientY - startY, 0, window.innerHeight - 40);
        widgetEl.style.left = w.x + 'px';
        widgetEl.style.top = w.y + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        save();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    // resize
    handle.addEventListener('pointerdown', (e) => {
      if (w.locked) return;
      e.preventDefault();
      e.stopPropagation();
      const startW = w.w - e.clientX;
      const startH = w.h - e.clientY;
      const move = (ev) => {
        w.w = clamp(startW + ev.clientX, 150, window.innerWidth);
        w.h = clamp(startH + ev.clientY, 100, window.innerHeight);
        widgetEl.style.width = w.w + 'px';
        widgetEl.style.height = w.h + 'px';
        if (resizeHook) { try { resizeHook(w.w, w.h); } catch (_) { resizeHook = null; } }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (resizeHook) { try { resizeHook(w.w, w.h); } catch (_) { resizeHook = null; } }
        save();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    remount();
    instances.set(w.id, { el: widgetEl, api, cleanup: () => cleanup && cleanup() });
  }

  function remountWidget(w) {
    const inst = instances.get(w.id);
    if (inst) {
      if (inst.cleanup) inst.cleanup();
      inst.el.remove();
      instances.delete(w.id);
    }
    mountWidget(w);
  }

  // ---------------------------------------------------------------- screens
  function renderScreen() {
    for (const inst of instances.values()) {
      if (inst.cleanup) inst.cleanup();
      inst.el.remove();
    }
    instances.clear();
    closeWidgetMenu();
    closeSettingsPanel();
    const spot = $('.spotlight-overlay');
    if (spot) spot.remove();
    applyBackground();
    // this screen's widgets, plus any widget marked "show on all screens"
    const toShow = [...screen().widgets];
    const shown = new Set(toShow.map((w) => w.id));
    // "all screens" means all screens of this deck — decks are independent workspaces
    screens().forEach((s, i) => {
      if (i === currentIndex()) return;
      for (const w of s.widgets) {
        if (w.everywhere && !shown.has(w.id)) { toShow.push(w); shown.add(w.id); }
      }
    });
    zTop = Math.max(10, ...toShow.map((w) => w.z || 10));
    for (const w of toShow) mountWidget(w);
    $('#screenLabel').textContent = currentIndex() + 1 + ' / ' + screens().length;
    paintBrand();
    renderToolbar();
    refreshInk();
    if (deckPanel) renderDeck();
  }

  // While teaching, the top-left pill shows WHERE the teacher is, not what the
  // app is called — the deck name is the orientation that matters mid-lesson.
  // The dashboard header still says Sage Stage.
  function paintBrand() {
    const n = (viewDeck().name || '').trim();
    $('#brandName').textContent = n || 'Sage Stage';
  }

  function applyBackground() {
    const bg = screen().background;
    if (bg.type === 'color') {
      stage.style.background = bg.value;
    } else if (bg.type === 'image') {
      stage.style.background = `url(${bg.value}) center / cover no-repeat`;
    } else {
      stage.style.background = bg.value;
    }
  }

  $('#prevScreen').addEventListener('click', () => setCurrent(currentIndex() - 1));
  $('#nextScreen').addEventListener('click', () => setCurrent(currentIndex() + 1));
  $('#addScreen').addEventListener('click', () => { addScreenAfter(screens().length - 1); toast('New screen added'); });
  $('#delScreen').addEventListener('click', () => deleteScreen(currentIndex()));
  $('#deckBtn').addEventListener('click', () => toggleDeck());

  function addScreenAfter(i) {
    screens().splice(i + 1, 0, { id: uid(), background: { ...screen().background }, widgets: [] });
    save();
    setCurrent(i + 1);
  }

  function deleteScreen(i) {
    const d = viewDeck();
    const s = d.screens[i];
    // Both paths take everything on the screen with them, so both copy first.
    const name = screenTitle(i);
    if (d.screens.length === 1) {
      confirmDialog('Clear all widgets from this screen?', () => {
        snapshotBefore(s, 'before clearing “' + name + '”', { kind: 'screen', title: name });
        s.widgets = [];
        save(); renderScreen();
      }, { label: 'Clear' });
    } else {
      confirmDialog(`Delete "${name}" and its widgets?`, () => {
        snapshotBefore(s, 'deleted screen “' + name + '”', { kind: 'screen', title: name });
        d.screens.splice(i, 1);
        if (viewId === s.id) viewId = null;
        d.current = clamp(d.current > i ? d.current - 1 : d.current, 0, d.screens.length - 1);
        save(); renderScreen();
      });
    }
  }

  // ---------------------------------------------------------------- screen deck sidebar
  const screenTitle = (i) => (i + 1) + ' - ' + (screens()[i].name || 'Screen');
  let deckPanel = null;
  let deckMenu = null;
  let deckSelect = null; // Set of screen ids while picking screens to export

  function closeDeckMenu() {
    if (deckMenu) { deckMenu.remove(); deckMenu = null; }
  }

  // kebab menus live on document.body (position: fixed) so they can never be
  // painted over by sibling cards or clipped by the scrolling list
  function placeMenuAt(menu, anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
    menu.style.visibility = 'hidden';
    document.body.append(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - mw, vw - mw - 8)) + 'px';
    let top = r.bottom + 6;
    if (top + mh > vh - 8) top = Math.max(8, Math.min(r.top - mh - 6, vh - mh - 8));
    menu.style.top = top + 'px';
    menu.style.visibility = '';
  }
  // a fixed menu can't follow its anchor, so any scroll or resize dismisses it
  const closeCardMenus = () => { closeDeckMenu(); closeDashMenu(); };
  window.addEventListener('scroll', closeCardMenus, true);
  window.addEventListener('resize', closeCardMenus);
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest && (t.closest('.deck-menu') || t.closest('.deck-kebab'))) return;
    closeCardMenus();
  });
  function closeDeck() {
    closeDeckMenu();
    deckSelect = null;
    if (deckPanel) { deckPanel.remove(); deckPanel = null; }
  }
  function toggleDeck() {
    if (deckPanel) { closeDeck(); return; }
    closePanels();
    deckPanel = el('aside', { class: 'deck-panel' });
    document.body.append(deckPanel);
    renderDeck();
  }

  // miniature of a screen: real background + a chip per widget, to scale.
  // Image and text widgets show their actual content (imported PPTX decks are
  // mostly those two, and icon-only chips made every slide look identical);
  // backgrounds and images use lazy <img>s so long decks don't decode dozens
  // of big data URLs while the list opens.
  function deckThumb(s) {
    const thumb = el('div', { class: 'deck-thumb' });
    // a hidden/minimised window reports 0×0 — fall back so thumbs never render
    // with a degenerate aspect ratio or NaN widget positions
    const sw = window.innerWidth || 1280, sh = window.innerHeight || 720;
    thumb.style.aspectRatio = sw + ' / ' + sh;
    // an imported deck can arrive with zero screens; a plain card beats a throw
    if (!s) { thumb.style.background = '#eef2f1'; return thumb; }
    const bg = s.background;
    if (bg.type === 'image') {
      thumb.style.background = '#fff';
      thumb.append(el('img', { class: 'deck-thumb-bg', src: bg.value, alt: '', loading: 'lazy', decoding: 'async' }));
    } else {
      thumb.style.background = bg.value;
    }
    for (const w of s.widgets) {
      const mini = el('div', { class: 'deck-mini' });
      mini.style.left = clamp((w.x / sw) * 100, 0, 96) + '%';
      mini.style.top = clamp((w.y / sh) * 100, 0, 92) + '%';
      mini.style.width = clamp((w.w / sw) * 100, 4, 100) + '%';
      mini.style.height = clamp((w.h / sh) * 100, 6, 100) + '%';
      const def = WIDGETS[w.type];
      let content = null;
      if (w.type === 'image' && w.props && w.props.src) {
        content = el('img', {
          class: 'deck-mini-img', src: w.props.src, alt: '', loading: 'lazy', decoding: 'async',
          style: 'object-fit:' + (w.props.fit === 'cover' ? 'cover' : 'contain'),
        });
      } else if (w.type === 'text' && w.props && w.props.html) {
        // a thumbnail wants the words, and used to reach them through a
        // detached div's innerHTML — which fires an <img onerror> as readily
        // as a live one, so the dashboard ran a stranger's script before a
        // deck was ever opened
        const text = SageSanitize.text(w.props.html).trim();
        if (text) content = el('div', { class: 'deck-mini-text' }, text.slice(0, 120));
      }
      mini.append(content || (def ? iconEl(def.icon) : ''));
      thumb.append(mini);
    }
    return thumb;
  }

  function openDeckMenu(anchor, i) {
    if (deckMenu && +deckMenu.dataset.idx === i) { closeDeckMenu(); return; }
    closeDeckMenu();
    const item = (icon, label, fn, cls) => el('button', {
      class: 'deck-menu-item' + (cls ? ' ' + cls : ''),
      onclick: (e) => { e.stopPropagation(); closeDeckMenu(); fn(); },
    }, iconEl(icon), label);
    const ss = screens();
    const s = ss[i];
    deckMenu = el('div', { class: 'deck-menu', 'data-idx': i },
      item('text', 'Rename', () => {
        promptDialog('Screen name:', s.name || '', (name) => {
          s.name = name.trim();
          save(); renderDeck(); renderScreen();
        }, { label: 'Rename' });
      }),
      item('copy', 'Duplicate', () => {
        const copy = JSON.parse(JSON.stringify(s));
        copy.id = uid();
        copy.name = (s.name || 'Screen') + ' copy';
        for (const w of copy.widgets) { w.id = uid(); w.everywhere = false; }
        ss.splice(i + 1, 0, copy);
        save();
        setCurrent(i + 1);
      }),
      // at the ends these render disabled instead of silently doing nothing —
      // the deck-up/deck-down classes never had CSS, so "enabled but inert"
      // was all a teacher ever saw on screen 1
      Object.assign(item('tofront', 'Move up', () => {
        if (i === 0) return;
        const cur = screen().id;
        [ss[i - 1], ss[i]] = [ss[i], ss[i - 1]];
        if (!viewId) viewDeck().current = ss.findIndex((x) => x.id === cur);
        save(); renderScreen();
      }, 'deck-up'), { disabled: i === 0 }),
      Object.assign(item('toback', 'Move down', () => {
        if (i === ss.length - 1) return;
        const cur = screen().id;
        [ss[i], ss[i + 1]] = [ss[i + 1], ss[i]];
        if (!viewId) viewDeck().current = ss.findIndex((x) => x.id === cur);
        save(); renderScreen();
      }, 'deck-down'), { disabled: i === ss.length - 1 }),
      el('a', {
        class: 'deck-menu-item', target: '_blank',
        href: location.href.split('#')[0] + '#s=' + s.id,
        // The anchor stays exactly as it was, so in a browser middle-click and
        // copy-link still work. Under Tauri only, take it over: target="_blank"
        // is unreliable in a webview, and a second SCREEN wants a second window.
        onclick: (e) => {
          e.stopPropagation(); closeDeckMenu();
          if (window.SagePlatform) { e.preventDefault(); SagePlatform.openScreenWindow(s.id); }
        },
      }, iconEl('expand'), 'Open in new tab'),
      window.SageExport ? item('save', 'Export…', () => SageExport.openDialog([i])) : null,
      item('plus', 'Add new screen', () => addScreenAfter(i)),
      item('trash', 'Delete', () => deleteScreen(i), 'danger'),
    );
    placeMenuAt(deckMenu, anchor);
  }

  // ------------------------------------------------------- drag to reorder
  // Pointer-based (not HTML5 DnD) so a ghost card can float under the cursor,
  // the other cards slide out of the way, and the list auto-scrolls when the
  // pointer nears its edges. A 6px threshold keeps plain clicks working.
  let deckDragActive = false;
  function startDeckDrag(e, card, i, list) {
    if (e.button !== 0 || deckSelect || deckDragActive) return;
    if (e.target.closest('.deck-kebab')) return;
    const startX = e.clientX, startY = e.clientY;
    let ghost = null, scrollTimer = 0, lastY = startY;
    let cards = [], tops = [], slotH = 0, target = i, listRect = null, cardRect = null;

    const update = (clientY) => {
      lastY = clientY;
      const contentY = clientY - listRect.top + list.scrollTop;
      let t = 0, best = Infinity;
      for (let j = 0; j < cards.length; j++) {
        const d = Math.abs(contentY - (tops[j] + slotH / 2));
        if (d < best) { best = d; t = j; }
      }
      if (t === target) return;
      target = t;
      cards.forEach((c, j) => {
        if (j === i) return;
        c.style.transform = (j > i && j <= target) ? `translateY(${-slotH}px)`
          : (j < i && j >= target) ? `translateY(${slotH}px)` : '';
      });
    };

    // roll the list while the ghost hovers near its top or bottom edge
    // (setInterval rather than rAF so the roll never stalls if frames throttle)
    const EDGE = 64, MAX_V = 14;
    const tick = () => {
      const topDist = lastY - listRect.top, botDist = listRect.bottom - lastY;
      let dv = 0;
      if (topDist < EDGE) dv = -Math.ceil(((EDGE - topDist) / EDGE) * MAX_V);
      else if (botDist < EDGE) dv = Math.ceil(((EDGE - botDist) / EDGE) * MAX_V);
      if (dv) {
        const before = list.scrollTop;
        list.scrollTop = before + dv;
        if (list.scrollTop !== before) update(lastY);
      }
    };

    const begin = () => {
      deckDragActive = true;
      closeDeckMenu();
      cards = Array.from(list.querySelectorAll('.deck-card'));
      listRect = list.getBoundingClientRect();
      cardRect = card.getBoundingClientRect();
      slotH = cardRect.height + (parseFloat(getComputedStyle(list).rowGap) || 10);
      tops = cards.map((c) => c.getBoundingClientRect().top - listRect.top + list.scrollTop);
      ghost = card.cloneNode(true);
      ghost.classList.add('deck-ghost');
      ghost.style.width = cardRect.width + 'px';
      ghost.style.left = cardRect.left + 'px';
      ghost.style.top = cardRect.top + 'px';
      document.body.append(ghost);
      card.classList.add('drag-slot');
      list.classList.add('dragging');
      document.body.classList.add('deck-dragging');
      scrollTimer = setInterval(tick, 16);
    };

    const onMove = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        begin();
      }
      ev.preventDefault();
      ghost.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;
      update(ev.clientY);
    };

    const finish = (cancelled) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (!ghost) return; // never crossed the threshold: it's a plain click
      clearInterval(scrollTimer);
      const t = cancelled ? i : target;
      // glide the ghost into the vacant slot, then commit the reorder
      const finalTop = tops[t] - list.scrollTop + listRect.top;
      ghost.classList.add('drop');
      ghost.style.transform = `translate(0px, ${finalTop - cardRect.top}px)`;
      setTimeout(() => {
        ghost.remove();
        card.classList.remove('drag-slot');
        list.classList.remove('dragging');
        document.body.classList.remove('deck-dragging');
        cards.forEach((c) => { c.style.transform = ''; });
        deckDragActive = false;
        if (!cancelled && t !== i) {
          const ss = screens();
          const curId = screen().id;
          const [moved] = ss.splice(i, 1);
          ss.splice(t, 0, moved);
          if (!viewId) viewDeck().current = ss.findIndex((x) => x.id === curId);
          save(); renderScreen();
        }
      }, 200);
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function renderDeck() {
    if (!deckPanel) return;
    closeDeckMenu();
    deckPanel.innerHTML = '';
    const title = el('input', {
      class: 'deck-title', value: viewDeck().name || '', placeholder: 'My screen deck',
      onchange: (e) => { viewDeck().name = e.target.value.trim(); save(); paintBrand(); if (dashEl) renderDashboard(); },
    });
    const selecting = !!deckSelect;
    deckPanel.append(el('div', { class: 'deck-head' }, title,
      !window.SageExport ? null : el('button', {
        class: 'icon-btn deck-close', title: 'Export screens…',
        onclick: () => { deckSelect = selecting ? null : new Set([screen().id]); renderDeck(); },
      }, iconEl('save')),
      el('button', { class: 'icon-btn deck-close', title: 'All decks & class lists', onclick: () => { closeDeck(); openDashboard(); } }, iconEl('screens')),
      el('button', { class: 'icon-btn deck-close', onclick: () => closeDeck() }, iconEl('close'))));
    const list = el('div', { class: 'deck-list' });
    screens().forEach((s, i) => {
      const corner = selecting
        ? el('div', { class: 'deck-select-check' + (deckSelect.has(s.id) ? ' on' : '') }, deckSelect.has(s.id) ? '✓' : '')
        : el('button', { class: 'deck-kebab', title: 'Screen options', onclick: (e) => { e.stopPropagation(); openDeckMenu(e.currentTarget, i); } }, iconEl('dots'));
      const card = el('div', {
        class: 'deck-card' + (i === currentIndex() ? ' active' : '') + (selecting && deckSelect.has(s.id) ? ' selected' : ''),
        onclick: () => {
          if (card.classList.contains('drag-slot')) return; // it was a drag, not a click
          if (!selecting) { setCurrent(i); return; }
          if (deckSelect.has(s.id)) deckSelect.delete(s.id); else deckSelect.add(s.id);
          renderDeck();
        },
      }, el('div', { class: 'deck-thumb-wrap' },
        deckThumb(s),
        el('span', { class: 'deck-num' }, String(i + 1)),
        corner),
        el('div', { class: 'deck-label' }, s.name || 'Screen'));
      card.addEventListener('pointerdown', (e) => startDeckDrag(e, card, i, list));
      list.append(card);
    });
    if (selecting) {
      const n = deckSelect.size;
      list.append(el('div', { class: 'deck-select-bar' },
        el('button', {
          class: 'btn small ghost',
          onclick: () => { deckSelect = new Set(screens().map((s) => s.id)); renderDeck(); },
        }, 'All'),
        el('button', { class: 'btn small ghost', onclick: () => { deckSelect = new Set(); renderDeck(); } }, 'None'),
        el('button', { class: 'btn small ghost', onclick: () => { deckSelect = null; renderDeck(); } }, 'Cancel'),
        el('button', {
          class: 'btn small' + (n ? '' : ' disabled'),
          onclick: () => {
            if (!n) return;
            const indices = screens().map((s, i) => (deckSelect.has(s.id) ? i : -1)).filter((i) => i >= 0);
            deckSelect = null;
            renderDeck();
            SageExport.openDialog(indices);
          },
        }, 'Export ' + n)));
    } else {
      list.append(el('button', { class: 'deck-add', title: 'Add screen', onclick: () => { addScreenAfter(screens().length - 1); } },
        el('span', { class: 'deck-add-plus' }, iconEl('plus'))));
    }
    deckPanel.append(list);
  }

  // ---------------------------------------------------------------- dashboard (landing page)
  // Full-page overlay listing every deck (per class / subject) and every class list.
  // Shown on launch so a teacher picks the class they're about to teach; a tab
  // pinned with #s=<id> skips it and goes straight to its screen.
  let dashEl = null;
  let dashMenu = null;
  // ------------------------------------------------- reading font & class stars
  // The reading font is one attribute on <html>; style.css rewrites --font-ui
  // and --font-display underneath it and every rule follows. Content fonts the
  // teacher picked inside widgets (text, draw pad, modelled writing) are
  // deliberately NOT touched — this is a chrome accessibility setting, not a
  // restyle of their work.
  const READING_FONTS = [
    ['standard', 'Standard (Quicksand & Lexend)'],
    ['hyper', 'Atkinson Hyperlegible'],
    ['dys', 'OpenDyslexic'],
  ];

  function applyReadingFont() {
    if (state.readingFont === 'standard') delete document.documentElement.dataset.readingFont;
    else document.documentElement.dataset.readingFont = state.readingFont;
  }

  // local-date keys, so a star given during an evening class stays on that day
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mondayKey = (d = new Date()) => {
    const m = new Date(d);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return dayKey(m);
  };
  const prevSchoolDayKey = (d = new Date()) => {
    const p = new Date(d);
    do { p.setDate(p.getDate() - 1); } while (p.getDay() === 0 || p.getDay() === 6);
    return dayKey(p);
  };

  // Stars are a weekly count (Monday reset — small numbers stay meaningful to
  // a class); the streak counts consecutive school days the screen was used.
  // Weekends don't break it, holidays honestly do. Mutates only — callers
  // decide about save(), because the erase path must leave localStorage empty
  // until the teacher's next real action. Runs at boot and again at the
  // moments a long-lived kiosk tab proves it is being used (dashboard open,
  // star tap), so crossing a weekend without a reload still rolls the week.
  function rewardsDayTick() {
    const r = state.rewards, today = dayKey(), week = mondayKey();
    let changed = false;
    // ordering, not inequality: a clock that briefly ran a week fast (or a
    // dead CMOS battery pushing it back) must not wipe the stars twice
    if (week > r.weekStart) { r.weekStart = week; r.stars = 0; changed = true; }
    // weekend boots neither count nor break the chain: Saturday prep leaves
    // lastUsed on Friday, so Monday still reads as the next school day
    const wd = new Date().getDay();
    if (wd !== 0 && wd !== 6 && r.lastUsed < today) {
      r.streak = r.lastUsed === prevSchoolDayKey() ? r.streak + 1 : 1;
      r.lastUsed = today;
      changed = true;
    }
    return changed;
  }

  // The award control lives in the stage top bar: one tap, one star, mid-lesson,
  // without leaving the screen. Management (reset, hide) lives on the hero.
  let starBtn = null;
  function renderStarPill() {
    if (!state.rewards.on) {
      if (starBtn) { starBtn.remove(); starBtn = null; }
      return;
    }
    if (!starBtn) {
      starBtn = el('button', {
        class: 'star-pill', title: 'Give the class a star',
        'aria-label': 'Give the class a star', 'data-help': 'starPill',
        onclick: () => {
          rewardsDayTick(); // a kiosk tab crossing Monday rolls the week before this star lands
          state.rewards.stars++;
          save();
          renderStarPill();
          toast('⭐ Star for the class — ' + state.rewards.stars + ' this week');
        },
      });
      $('#topbar .top-actions').prepend(starBtn);
    }
    starBtn.replaceChildren(iconEl('sticker'), el('b', {}, String(state.rewards.stars)));
  }

  let dashTab = 'decks'; // 'decks' | 'lists'
  let dashQuery = '';
  let dashSort = 'lastUsed'; // 'lastUsed' | 'createdAt' | 'name'
  let heroEdit = false; // the greeting block flips into its name/stars form

  function closeDashMenu() {
    if (dashMenu) { dashMenu.remove(); dashMenu = null; }
  }
  function closeDashboard() {
    closeDashMenu();
    if (dashEl) { dashEl.remove(); dashEl = null; }
  }
  function openDashboard() {
    if (dashEl) return;
    closePanels(); closeDeck();
    heroEdit = false;
    if (rewardsDayTick()) { save(); renderStarPill(); }
    dashEl = el('aside', { class: 'dashboard', onclick: () => closeDashMenu() });
    document.body.append(dashEl);
    renderDashboard();
  }

  const fmtDay = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });

  // shared list operations: keep widget selections and deck class tags following
  // the list through renames and deletes
  function renameList(oldName, newName) {
    state.lists[newName] = state.lists[oldName];
    delete state.lists[oldName];
    for (const d of state.decks) {
      if (d.classList === oldName) d.classList = newName;
      for (const s of d.screens) for (const w of s.widgets) {
        if (w.props && w.props.list === oldName) w.props.list = newName;
      }
    }
    save();
  }
  function deleteList(name) {
    delete state.lists[name];
    for (const d of state.decks) if (d.classList === name) d.classList = null;
    save();
  }

  // Every place a list gets named comes through here. The old code checked for a
  // clash against the raw string and then wrote the trimmed one, so " My class"
  // sailed past the check and landed on "My class" — a register emptied with no
  // confirm, no toast and no way back. Trim once, check the key you are about to
  // write, and the whole class of that bug goes with it.
  const normListName = (name) => String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  function createList(name) {
    const key = normListName(name);
    if (!key) return null;
    if (state.lists[key]) { toast(`There is already a list called "${key}".`); return null; }
    state.lists[key] = [];
    save();
    return key;
  }
  function renameListTo(oldName, next) {
    const key = normListName(next);
    if (!key || key === oldName) return null;
    if (state.lists[key]) { toast(`There is already a list called "${key}".`); return null; }
    renameList(oldName, key);
    return key;
  }

  /* One reader for every way a register arrives. The textarea keeps its plain
     one-name-per-line behaviour while you type — this runs at the paste and
     import boundary, where the text came from somewhere else and arrives with a
     shape of its own.

     A register is almost never a clean column. It is two columns out of Excel
     (tabs), a row per child out of the MIS (commas, with the reg group and
     often a good deal more beside the name), a numbered list out of Word, or
     "Surname, Forename" in any of those. Left to split('\n'), one MIS row
     becomes a child called "Raman,Priya,4R,Female,EAL" and the picker puts that
     on the wall at display size — which is how a child's EAL status ends up
     projected in front of thirty people.

     Flipping reorders cells, never words inside a cell: "Ahmed, Yusuf" becomes
     "Yusuf Ahmed", while "Mary Jane Smith" is left alone because there is no
     way to know which part is the surname and a guess would be worse than
     nothing. */
  const NAME_CAP = 200; // a year group with room to spare; a class is ~30

  /* Rows of cells, honouring quotes. An MIS export writes "Smith, John",4R and
     a plain split shreds it, so the whole text is scanned in one pass rather
     than cut into lines first — a quoted field is allowed to hold the
     delimiter, doubled quotes, and newlines. */
  function nameRows(text, delim) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') { cell += ch; continue; }
        if (text[i + 1] === '"') { cell += '"'; i++; continue; }
        quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === delim) { row.push(cell); cell = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* The words a register puts at the top of its columns. A sheet almost always
     has a header row, and "Surname Forename" standing at the front of the class
     is a poor first impression of an import. */
  const NAME_HEAD = /^(surname|last ?name|family ?name|forename|first ?name|given ?name|known ?as|preferred ?name|name|full ?name|pupil|pupil ?name|child|student|reg|reg ?group|registration|class|form|group|year|year ?group|upn|adno|dob|date ?of ?birth|gender|sex|email|notes?|comments?|photo|eal|pp|sen|house|team|no|num|number|#)$/i;

  function parseNames(text, opts) {
    const o = opts || {};
    // Excel writes a byte order mark, and it must not become part of the first
    // child's name — the word bank learned this one the hard way
    const src = String(text || '').replace(/^﻿/, '');
    // one delimiter for the whole text rather than per row: a tab anywhere means
    // the columns came from a spreadsheet, and a comma is then part of a name
    // rather than a separator
    const delim = src.indexOf('\t') >= 0 ? '\t' : ',';
    const seen = new Set((o.existing || []).map((n) => String(n).toLowerCase()));
    const out = { names: [], blank: 0, dupes: 0, capped: 0, columns: false, numbered: false, header: false };
    const room = Math.max(0, NAME_CAP - seen.size);
    let atFirstRow = true;
    for (const row of nameRows(src, delim)) {
      let cells = row.map((c) => c.trim()).filter(Boolean);
      /* A first cell holding a comma is a whole name on its own — an export
         writes "Ahmed, Yusuf",4R with the name quoted precisely because the
         comma is inside it. Reading on into the next column would staple the
         reg group to the child. This covers the tab-delimited sheet that keeps
         "Ahmed, Yusuf" in one cell too. */
      if (cells.length && cells[0].indexOf(',') >= 0) {
        cells = cells[0].split(',').map((c) => c.trim()).filter(Boolean);
      }
      if (!cells.length) { out.blank++; continue; }
      if (atFirstRow) {
        atFirstRow = false;
        /* A labelled name column is the tell. Requiring every cell to be a
           known heading was too brittle to survive a real register — one
           "Notes" column and the header walked into the class as a child
           called "Name Reg". A row that opens with Surname or Forename or
           Pupil is a header; a child whose surname is "Surname" is not a risk
           worth keeping the brittle rule for. */
        if (NAME_HEAD.test(cells[0]) || cells.every((c) => NAME_HEAD.test(c))) { out.header = true; continue; }
      }
      // "1. Ada", "1) Ada", "12 – Ada" — Word's list numbering, pasted flat
      const unnum = cells[0].replace(/^\d{1,3}\s*[.):\-–]\s+/, '').trim();
      if (unnum !== cells[0]) {
        out.numbered = true;
        cells = (unnum ? [unnum] : []).concat(cells.slice(1));
      }
      if (cells.length > 1) out.columns = true;
      // the name is the first two cells: a register leads with the child, and
      // both "Ahmed, Yusuf" and a Surname/Forename column pair land here
      const parts = cells.slice(0, 2);
      const name = (o.flip ? parts.slice().reverse() : parts).join(' ').replace(/\s+/g, ' ').trim();
      // every name has a letter in it; a leading column of admission numbers
      // has none, and is a column we were never meant to read
      if (!name || !/\p{L}/u.test(name)) { out.blank++; continue; }
      const key = name.toLowerCase();
      if (seen.has(key)) { out.dupes++; continue; }
      if (out.names.length >= room) { out.capped++; continue; }
      seen.add(key);
      out.names.push(name);
    }
    return out;
  }
  // what parseNames did, in the order a teacher would notice it
  function nameParseNote(res) {
    const bits = [`${res.names.length} name${res.names.length === 1 ? '' : 's'}`];
    if (res.dupes) bits.push(`${res.dupes} repeat${res.dupes === 1 ? '' : 's'} dropped`);
    if (res.header) bits.push('header row ignored');
    if (res.numbered) bits.push('numbering removed');
    if (res.capped) bits.push(`${res.capped} over the ${NAME_CAP} cap`);
    return bits.join(' · ');
  }

  function newDeck() {
    promptDialog('Name for the new deck:', '', (name) => {
      const d = blankDeck(name.trim() || 'New deck');
      state.decks.push(d);
      save();
      openDeck(d.id);
    }, { label: 'Create', placeholder: 'e.g. "Year 4R — Math"' });
  }

  // a parsed PowerPoint (pptx-import.js) arrives as ready-made screen objects;
  // ids are minted here so imported decks obey the same uniqueness rules
  function addImportedDeck(name, screenList) {
    const d = blankDeck(name);
    d.screens = screenList.map((s) => ({
      id: uid(), name: s.name || '', background: s.background,
      widgets: (s.widgets || []).map((w) => ({ ...w, id: uid() })),
    }));
    state.decks.push(d);
    openDeck(d.id); // saves + renders + closes the dashboard
    return d;
  }

  // same id-minting rules, but the screens land at the end of an existing deck
  function appendImportedScreens(deckId, screenList) {
    const d = deckById(deckId);
    if (!d) return null;
    d.screens.push(...screenList.map((s) => ({
      id: uid(), name: s.name || '', background: s.background,
      widgets: (s.widgets || []).map((w) => ({ ...w, id: uid() })),
    })));
    d.lastUsed = Date.now();
    save();
    renderScreen();
    if (deckPanel) renderDeck();
    if (dashEl) renderDashboard();
    return d;
  }

  function openDashDeckMenu(anchor, deck) {
    if (dashMenu && dashMenu.dataset.deck === deck.id) { closeDashMenu(); return; }
    closeDashMenu();
    const item = (icon, label, fn, cls) => el('button', {
      class: 'deck-menu-item' + (cls ? ' ' + cls : ''),
      onclick: (e) => { e.stopPropagation(); closeDashMenu(); fn(); },
    }, iconEl(icon), label);
    dashMenu = el('div', { class: 'deck-menu', 'data-deck': deck.id, onclick: (e) => e.stopPropagation() },
      item('expand', 'Open', () => openDeck(deck.id)),
      // a zero-screen deck (possible via import) has no screen to pin a tab to
      !deck.screens.length ? null : el('a', {
        class: 'deck-menu-item', target: '_blank',
        href: location.href.split('#')[0] + '#s=' + deck.screens[clamp(deck.current, 0, deck.screens.length - 1)].id,
        onclick: (e) => {
          e.stopPropagation(); closeDashMenu();
          if (window.SagePlatform) {
            e.preventDefault();
            SagePlatform.openScreenWindow(deck.screens[clamp(deck.current, 0, deck.screens.length - 1)].id);
          }
        },
      }, iconEl('screens'), 'Open in new tab'),
      item('text', 'Rename', () => {
        promptDialog('Deck name:', deck.name || '', (name) => {
          deck.name = name.trim() || 'New deck';
          save(); paintBrand(); renderDashboard();
        }, { label: 'Rename' });
      }),
      item('copy', 'Duplicate', () => {
        const copy = JSON.parse(JSON.stringify(deck));
        copy.id = uid();
        copy.name = (deck.name || 'Deck') + ' copy';
        copy.pinnedTop = false;
        copy.createdAt = copy.lastUsed = Date.now();
        for (const s of copy.screens) {
          s.id = uid();
          for (const w of s.widgets) w.id = uid();
          if (Array.isArray(s.ink)) for (const st of s.ink) if (st.id) st.id = uid();
        }
        state.decks.splice(state.decks.indexOf(deck) + 1, 0, copy);
        save(); renderDashboard();
      }),
      item('save', 'Copy as template JSON', () => {
        const json = JSON.stringify(deckToTemplate(deck), null, 2);
        const copyPromise = navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(json) : Promise.reject();
        copyPromise
          .then(() => toast('Template JSON copied — share the file or add it to your school bank'))
          .catch(() => {
            // no native prompt on the desktop, and a one-line input can't hold
            // a whole template anyway — a selectable textarea does the job
            openModal('Copy this template JSON', (body) => {
              const ta = el('textarea', { class: 'text-input', readonly: '', style: 'width:100%;height:220px;box-sizing:border-box;font-family:monospace;font-size:12px;' });
              ta.value = json;
              body.append(el('p', {}, 'Select it all (⌘A) and copy (⌘C):'), ta);
              ta.focus(); ta.select();
            });
          });
      }),
      window.SagePptxImport ? item('screens', 'Import slides…', () => SagePptxImport.openDialog(null, deck.id)) : null,
      window.SageExport ? item('save', 'Export deck…', () => {
        openDeck(deck.id); // export renders from the active deck, so adopt it first
        SageExport.openDialog(deck.screens.map((_, idx) => idx));
      }) : null,
      item('picker', 'Set class list…', () => {
        openModal('Class list for "' + (deck.name || 'deck') + '"', (body, finish) => {
          const sel = el('select', { class: 'select' }, el('option', { value: '' }, '— none —'));
          for (const n of Object.keys(state.lists)) sel.append(el('option', { value: n }, n));
          sel.value = deck.classList && state.lists[deck.classList] ? deck.classList : '';
          body.append(
            el('p', {}, 'The linked list becomes the default class for the name picker and group maker on this deck.'),
            sel,
            el('div', { class: 'row' }, el('button', {
              class: 'btn',
              onclick: () => { deck.classList = sel.value || null; save(); renderDashboard(); finish(); },
            }, 'Save')),
          );
        });
      }),
      item('text', 'Set subject…', () => {
        promptDialog('Subject tag:', deck.subject || '', (s) => {
          deck.subject = s.trim();
          save(); renderDashboard();
        }, { label: 'Set', placeholder: 'e.g. "Math", "Period 3"' });
      }),
      item('groups', 'Set year group…', () => {
        openModal('Year group for "' + (deck.name || 'deck') + '"', (body, finish) => {
          const sel = el('select', { class: 'select' }, el('option', { value: '' }, '— none —'));
          for (const [v, label] of [['R', 'Reception'], ['1', 'Year 1'], ['2', 'Year 2'], ['3', 'Year 3'], ['4', 'Year 4'], ['5', 'Year 5'], ['6', 'Year 6']]) {
            sel.append(el('option', { value: v }, label));
          }
          sel.value = deck.yearGroup || '';
          body.append(
            el('p', {}, 'Age-aware widgets follow this — phoneme tiles picks its phonics phase from it. Every widget can still be set by hand.'),
            sel,
            el('div', { class: 'row' }, el('button', {
              class: 'btn',
              onclick: () => { deck.yearGroup = sel.value || null; save(); renderDashboard(); finish(); },
            }, 'Save')),
          );
        });
      }),
      item('pin', deck.pinnedTop ? 'Unpin from top' : 'Pin to top', () => {
        deck.pinnedTop = !deck.pinnedTop;
        save(); renderDashboard();
      }),
      item('trash', 'Delete', () => {
        // A deck can hold a term of modelled writing. Both paths below destroy
        // every screen in it, so both put a copy in the snapshot store first —
        // it is the only armour these two acts have ever had.
        const dname = deck.name || 'Untitled';
        if (state.decks.length === 1) {
          confirmDialog('This is your only deck — reset it to one blank screen?', () => {
            snapshotBefore(deck, 'before resetting “' + dname + '”', { kind: 'deck', title: dname });
            const fresh = blankDeck(deck.name);
            fresh.id = deck.id; fresh.createdAt = deck.createdAt;
            state.decks[0] = fresh;
            state.activeDeck = fresh.id;
            save(); renderScreen(); renderDashboard();
          }, { label: 'Reset' });
        } else {
          confirmDialog(`Delete deck "${dname}" and all its screens?`, () => {
            snapshotBefore(deck, 'deleted deck “' + dname + '”', { kind: 'deck', title: dname });
            state.decks.splice(state.decks.indexOf(deck), 1);
            if (state.activeDeck === deck.id) state.activeDeck = state.decks[0].id;
            save(); renderScreen(); renderDashboard();
          });
        }
      }, 'danger'),
    );
    placeMenuAt(dashMenu, anchor);
  }

  function dashDeckCards(grid) {
    const q = dashQuery.trim().toLowerCase();
    let decks = state.decks.filter((d) => !q
      || (d.name || '').toLowerCase().includes(q)
      || (d.subject || '').toLowerCase().includes(q)
      || (d.classList || '').toLowerCase().includes(q));
    const by = {
      lastUsed: (a, b) => b.lastUsed - a.lastUsed,
      createdAt: (a, b) => b.createdAt - a.createdAt,
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    }[dashSort];
    decks = decks.slice().sort((a, b) => (b.pinnedTop - a.pinnedTop) || by(a, b));
    for (const d of decks) {
      const kebab = el('button', {
        class: 'deck-kebab', title: 'Deck options',
        onclick: (e) => { e.stopPropagation(); openDashDeckMenu(e.currentTarget, d); },
      }, iconEl('dots'));
      const chips = el('div', { class: 'dash-chips' });
      if (d.classList && state.lists[d.classList]) chips.append(el('span', { class: 'chip chip-class' }, iconEl('picker'), d.classList));
      if (d.subject) chips.append(el('span', { class: 'chip chip-subject' }, d.subject));
      const card = el('div', {
        class: 'dash-card' + (d.id === state.activeDeck ? ' active' : ''),
        onclick: () => openDeck(d.id),
      },
        el('div', { class: 'deck-thumb-wrap' }, deckThumb(d.screens[0]), kebab,
          d.pinnedTop ? el('span', { class: 'dash-pin', title: 'Pinned to top' }, iconEl('pin')) : ''),
        el('div', { class: 'dash-card-name' }, d.name || 'Untitled deck'),
        el('div', { class: 'dash-meta' }, `${d.screens.length} screen${d.screens.length === 1 ? '' : 's'} · used ${fmtDay(d.lastUsed)}`),
        chips,
      );
      grid.append(card);
    }
    if (!decks.length) {
      // an empty SEARCH answers "nothing matched", not "make a new deck" —
      // the tile only belongs where there genuinely are no decks yet
      if (dashQuery.trim()) {
        grid.append(el('div', { class: 'hint', style: 'padding:18px 6px;' },
          'No deck matches “' + dashQuery.trim() + '”.'));
      } else {
        grid.append(el('button', { class: 'dash-card dash-new', onclick: () => newDeck() },
          el('span', { class: 'deck-add-plus' }, iconEl('plus')), 'New deck'));
      }
    }
  }

  function dashListCards(grid) {
    const q = dashQuery.trim().toLowerCase();
    for (const name of Object.keys(state.lists)) {
      if (q && !name.toLowerCase().includes(q)) continue;
      const names = state.lists[name];
      const usedBy = state.decks.filter((d) => d.classList === name).map((d) => d.name || 'Untitled');
      const chipsEl = el('div', { class: 'name-chips' });
      for (const n of names) {
        chipsEl.append(el('span', { class: 'name-chip' }, n, el('button', {
          class: 'name-chip-x', title: 'Remove ' + n,
          onclick: () => {
            state.lists[name] = state.lists[name].filter((x) => x !== n);
            save(); renderDashboard();
          },
        }, '×')));
      }
      const addInput = el('input', { class: 'name-add', placeholder: '＋ Add name…', 'data-list-add': name });
      // a single-line input flattens a pasted register into one very long name,
      // which is what sent a teacher looking for the import button in the first
      // place — so a paste with any shape to it goes through the same reader the
      // list editor uses, and lands as a class
      addInput.addEventListener('paste', (e) => {
        const cb = e.clipboardData || window.clipboardData;
        const raw = cb && cb.getData('text');
        if (!raw || !/[\n\r\t,]/.test(raw)) return;
        e.preventDefault();
        const res = parseNames(raw, { existing: state.lists[name] });
        if (!res.names.length) { toast('No names to add from that.'); return; }
        state.lists[name] = state.lists[name].concat(res.names);
        save(); renderDashboard();
        toast('Added ' + nameParseNote(res));
      });
      addInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const v = addInput.value.trim();
        if (!v) return;
        // mirror the paste route's manners: repeats are dropped, not doubled
        if (state.lists[name].some((x) => x.toLowerCase() === v.toLowerCase())) {
          toast('“' + v + '” is already on this list.');
          addInput.value = '';
          return;
        }
        state.lists[name].push(v);
        save(); renderDashboard();
        // renderDashboard rebuilt the card, and with it this input — without a
        // refocus a 30-child register means clicking the field 30 times
        const again = document.querySelector('[data-list-add="' + CSS.escape(name) + '"]');
        if (again) again.focus();
      });
      const kebab = el('button', {
        class: 'deck-kebab list-kebab', title: 'Class list options',
        onclick: (e) => {
          e.stopPropagation();
          if (dashMenu && dashMenu.dataset.list === name) { closeDashMenu(); return; }
          closeDashMenu();
          const item = (icon, label, fn, cls) => el('button', {
            class: 'deck-menu-item' + (cls ? ' ' + cls : ''),
            onclick: (ev) => { ev.stopPropagation(); closeDashMenu(); fn(); },
          }, iconEl(icon), label);
          dashMenu = el('div', { class: 'deck-menu', 'data-list': name, onclick: (ev) => ev.stopPropagation() },
            item('list', 'Import names…', () => openListManager(renderDashboard, name)),
            item('text', 'Rename', () => {
              promptDialog('Class list name:', name, (v) => {
                if (renameListTo(name, v)) renderDashboard();
              }, { label: 'Rename' });
            }),
            item('trash', 'Delete list', () => {
              confirmDialog(`Delete list "${name}"?`, () => {
                deleteList(name);
                renderDashboard();
              });
            }, 'danger'),
          );
          placeMenuAt(dashMenu, e.currentTarget);
        },
      }, iconEl('dots'));
      grid.append(el('div', { class: 'dash-card list-card' },
        el('div', { class: 'list-card-head' },
          el('div', { class: 'dash-card-name' }, name),
          el('span', { class: 'dash-meta' }, names.length + ''),
          kebab),
        usedBy.length ? el('div', { class: 'dash-meta' }, 'Class for: ' + usedBy.join(', ')) : '',
        chipsEl,
        addInput,
      ));
    }
    grid.append(el('button', {
      class: 'dash-card dash-new', onclick: () => {
        promptDialog('New class list name:', '', (v) => {
          if (createList(v)) renderDashboard();
        }, { label: 'Create', placeholder: 'e.g. "Year 4R"' });
      },
    }, el('span', { class: 'deck-add-plus' }, iconEl('plus')), 'New list'));
  }

  // the dashboard wallpaper: the teacher's chosen background under a soft veil
  function applyDashBg() {
    if (!dashEl) return;
    const bg = state.dashBg || {};
    const veil = bg.type === 'image'
      ? 'linear-gradient(rgba(248, 250, 250, 0.62), rgba(248, 250, 250, 0.62))'
      : 'linear-gradient(rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.42))';
    if (bg.type === 'image') {
      dashEl.style.background = veil + ', url(' + bg.value + ') center / cover no-repeat fixed';
    } else {
      dashEl.style.background = veil + ', ' + (bg.value || '#f4f7f6');
    }
  }

  let dashCat = 'All'; // template category filter (per-tab UI, not saved)
  let dashTplQuery = '';

  function templateCover(cover) {
    const themes = ['berry', 'ocean', 'meadow', 'sunset', 'midnight', 'paper', 'chalk', 'candy'];
    const theme = themes.includes(cover.theme) ? cover.theme : 'berry';
    return el('div', { class: 'tpl-cover cover-' + theme },
      el('span', { class: 'tpl-cover-shape shape-a' }),
      el('span', { class: 'tpl-cover-shape shape-b' }),
      cover.badge ? el('span', { class: 'tpl-cover-badge' }, cover.badge) : '',
      el('div', { class: 'tpl-cover-copy' },
        cover.eyebrow ? el('span', { class: 'tpl-cover-eyebrow' }, cover.eyebrow) : '',
        el('strong', {}, cover.title || 'Ready to play'),
        cover.subtitle ? el('span', { class: 'tpl-cover-sub' }, cover.subtitle) : ''),
      cover.emoji ? el('span', { class: 'tpl-cover-emoji' }, cover.emoji) : '',
    );
  }

  function templateCard(meta, screens, byline, onUse) {
    const card = el('button', { class: 'dash-card tpl-card', onclick: onUse },
      el('div', { class: 'deck-thumb-wrap' },
        meta.cover ? templateCover(meta.cover) : screens && screens.length ? templateThumb(screens[0]) : el('div', { class: 'deck-thumb tpl-thumb-empty' }, '🌿')),
      el('div', { class: 'dash-card-name' }, meta.name || 'Template'),
      meta.description ? el('div', { class: 'dash-meta tpl-desc' }, meta.description) : '',
      el('div', { class: 'dash-chips' },
        el('span', { class: 'chip chip-subject' }, meta.category || 'Community'),
        ...(Array.isArray(meta.tags) ? meta.tags.slice(0, 2).map((tag) => el('span', { class: 'tpl-mini-tag' }, String(tag))) : []),
        el('span', { class: 'tpl-byline' }, byline)));
    card.dataset.search = [meta.name, meta.description, meta.category, meta.author]
      .concat(Array.isArray(meta.tags) ? meta.tags : []).join(' ').toLowerCase();
    return card;
  }

  function dashTemplateCards(page, body) {
    const builtIn = Array.isArray(window.SAGE_TEMPLATES) ? window.SAGE_TEMPLATES : [];
    const orderedBuiltIn = builtIn.slice().sort((a, b) => Number(!!b.cover) - Number(!!a.cover));
    const search = el('input', {
      class: 'dash-search tpl-search', type: 'search', placeholder: 'Search games, subjects or skills…', value: dashTplQuery,
    });
    const filterCards = () => {
      dashTplQuery = search.value;
      const q = dashTplQuery.trim().toLowerCase();
      body.querySelectorAll('.tpl-card').forEach((card) => { card.hidden = !!q && !card.dataset.search.includes(q); });
      body.querySelectorAll('.tpl-source-block').forEach((block) => {
        const cards = Array.from(block.querySelectorAll('.tpl-card'));
        const visible = cards.some((card) => !card.hidden);
        block.classList.toggle('tpl-source-empty', !!q && !!cards.length && !visible);
      });
    };
    search.addEventListener('input', filterCards);
    body.append(el('div', { class: 'tpl-search-row' }, search));
    const cats = new Set(['All']);
    for (const t of orderedBuiltIn) cats.add(t.category || 'Community');
    for (const src of state.templateSources) {
      const c = communityCache.get(src);
      if (c) for (const m of c.items) cats.add(m.category || 'Community');
    }
    const chipRow = el('div', { class: 'tpl-cats' });
    for (const c of cats) {
      chipRow.append(el('button', {
        class: 'tpl-cat' + (dashCat === c ? ' active' : ''),
        onclick: () => { dashCat = c; renderDashboard(); },
      }, c));
    }
    body.append(chipRow);

    const match = (cat) => dashCat === 'All' || (cat || 'Community') === dashCat;

    // built-in bank — instant and offline
    const grid = el('div', { class: 'dash-grid' });
    for (const t of orderedBuiltIn) {
      if (!match(t.category)) continue;
      grid.append(templateCard(t, t.screens, '🌿 Sage Stage', () => useTemplate(t, { community: false })));
    }
    body.append(grid);

    // community sources (GitHub Pages / any static folder with index.json)
    for (const src of state.templateSources) {
      const cache = communityCache.get(src);
      if (!cache) { fetchCommunity(src, () => { if (dashEl && dashTab === 'templates') renderDashboard(); }); }
      const label = src.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const sourceBlock = el('section', { class: 'tpl-source-block' });
      sourceBlock.append(el('div', { class: 'tpl-source-head' },
        el('h4', {}, '🏫 ' + label),
        el('button', {
          class: 'tpl-source-x', title: 'Remove this source',
          onclick: () => {
            confirmDialog(`Stop showing templates from "${label}"?`, () => {
              state.templateSources = state.templateSources.filter((s) => s !== src);
              communityCache.delete(src);
              save(); renderDashboard();
            }, { label: 'Remove' });
          },
        }, '×')));
      const st = communityCache.get(src);
      if (!st || st.status === 'loading') {
        sourceBlock.append(el('div', { class: 'hint tpl-hint' }, 'Loading templates…'));
      } else if (st.status === 'error') {
        sourceBlock.append(el('div', { class: 'hint tpl-hint' }, "Couldn't reach this source — check the address, or you may be offline."));
      } else if (!st.items.length) {
        sourceBlock.append(el('div', { class: 'hint tpl-hint' }, 'No templates here yet.'));
      } else {
        const cgrid = el('div', { class: 'dash-grid' });
        const base = src.replace(/\/?$/, '/');
        for (const meta of st.items) {
          if (!match(meta.category)) continue;
          cgrid.append(templateCard(meta, meta.sketch && meta.sketch.screens, '👩‍🏫 ' + (meta.author || 'Shared'), () => {
            fetch(base + meta.file, { cache: 'no-cache' })
              .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
              .then((json) => useTemplate(json, { community: true }))
              .catch(() => toast("⚠️ Couldn't load that template — check the source."));
          }));
        }
        sourceBlock.append(cgrid);
      }
      body.append(sourceBlock);
    }

    // import a shared file / add a school bank
    body.append(el('div', { class: 'row tpl-actions' },
      el('button', {
        class: 'btn ghost',
        onclick: () => {
          const input = el('input', { type: 'file', accept: '.json,application/json' });
          input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              try { useTemplate(JSON.parse(reader.result), { community: true }); }
              catch (e) { toast("⚠️ That file doesn't look like a template."); }
            };
            reader.readAsText(file);
          });
          input.click();
        },
      }, '⬆ Import a template file…'),
      el('button', {
        class: 'btn ghost',
        onclick: () => {
          promptDialog('Address of a template folder:', '', (url) => {
            if (!url.trim()) return;
            state.templateSources.push(url.trim());
            save(); renderDashboard();
          }, { label: 'Add', placeholder: 'e.g. your school’s GitHub Pages URL' });
        },
      }, '＋ Add a school source…')));
    filterCards();
  }

  function renderDashboard() {
    if (!dashEl) return;
    closeDashMenu();
    dashEl.innerHTML = '';
    applyDashBg();
    const tab = (id, icon, label) => el('button', {
      class: 'dash-tab' + (dashTab === id ? ' active' : ''), 'data-help': 'dash:' + id,
      onclick: () => { dashTab = id; renderDashboard(); },
    }, iconEl(icon), label);
    const hour = new Date().getHours();
    const hello = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const page = el('div', { class: 'dash-page' });
    dashEl.append(page);

    // top row: brand + reading font + tabs + close
    const fontIdx = READING_FONTS.findIndex(([id]) => id === state.readingFont);
    const fontBtn = el('button', {
      class: 'dash-font-btn', 'data-help': 'aaPill',
      title: 'Reading font: ' + READING_FONTS[Math.max(fontIdx, 0)][1] + ' — tap to change',
      onclick: () => {
        state.readingFont = READING_FONTS[(fontIdx + 1) % READING_FONTS.length][0];
        applyReadingFont();
        save();
        renderDashboard();
      },
    }, 'Aa');
    // the ? from every window: the dashboard covers the topbar, so it carries
    // its own — same sheet, same hover card (docs/help-system-design.md §1)
    const dashHelp = el('button', {
      class: 'dash-font-btn dash-help', 'data-help': 'helpBtn',
      title: 'Help — what you’re looking at, and where your data lives',
      onclick: () => openHelp(),
    }, iconEl('help'));
    wireHelpHover(dashHelp);
    page.append(el('div', { class: 'dash-topbar' },
      el('div', { class: 'dash-brand' },
        el('span', { class: 'dash-brand-tile' }, '🌿'),
        el('span', { class: 'dash-brand-name' }, 'Sage Stage'),
        el('span', { class: 'dash-tag' }, window.SAGE_DEMO ? 'Taster — in this browser' : '100% local'),
        fontBtn,
        dashHelp),
      el('div', { class: 'dash-tabs' },
        tab('decks', 'screens', 'Screen decks'),
        tab('templates', 'copy', 'Templates'),
        tab('lists', 'picker', 'Class lists'),
        tab('background', 'background', 'Wallpaper')),
      el('button', { class: 'icon-btn dash-close', title: 'Back to the screen (Esc)', onclick: () => closeDashboard() }, iconEl('close'))));

    // hero: mascot · greeting · class stars — exactly three children, the
    // greeting owns the middle. The default face is a CSS sprout; a teacher can
    // put their own smile there instead (memoji or photo — it stays on this
    // device like everything else). Painted via a closure so the edit form can
    // swap the face in place without a re-render eating uncommitted typing.
    const mascot = el('span', { class: 'dash-mascot', 'aria-hidden': 'true' });
    const paintMascot = () => {
      mascot.innerHTML = '';
      if (state.mascotImage) {
        const face = el('img', { class: 'm-face', alt: '', src: state.mascotImage });
        // a corrupt data URL (hand-edited backup) falls back to the sprout
        face.addEventListener('error', () => { state.mascotImage = ''; save(); paintMascot(); });
        mascot.append(face);
      } else {
        mascot.append(
          el('i', { class: 'm-leaf' }), el('i', { class: 'm-eye m-eye-l' }),
          el('i', { class: 'm-eye m-eye-r' }), el('i', { class: 'm-smile' }));
      }
    };
    paintMascot();

    const greet = el('div', { class: 'dash-greet' });
    if (heroEdit) {
      // the hero's one settings moment: name the class, decide about stars
      const nameIn = el('input', {
        class: 'text-input greet-input', type: 'text', maxlength: '40', id: 'greetNameIn',
        value: state.className, placeholder: 'e.g. Class 4B or Year 3 Robins',
      });
      const starsChk = el('input', { type: 'checkbox', id: 'greetStarsChk' });
      starsChk.checked = state.rewards.on;
      const commit = () => {
        state.className = nameIn.value.trim();
        state.rewards.on = starsChk.checked;
        heroEdit = false;
        save();
        renderStarPill();
        renderDashboard();
      };
      nameIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          // contain it: the window-level Escape handler would close the whole
          // dashboard, when the teacher only meant to back out of the edit
          e.stopPropagation();
          heroEdit = false;
          renderDashboard();
        }
      });
      // the face row updates in place (never renderDashboard — it would eat the
      // typed-but-uncommitted name, the same trap the reset button fell into)
      const faceBtn = el('button', { class: 'btn' }, state.mascotImage ? 'Change the face…' : 'Use your face…');
      const faceOff = el('button', { class: 'greet-reset' }, 'Back to the sprout');
      const faceRow = el('div', { class: 'greet-row greet-face-row' },
        el('span', { class: 'greet-lab', style: 'margin: 0;' }, 'Mascot — the sprout, or a memoji or photo of you'),
        faceBtn, faceOff);
      const paintFaceRow = () => {
        faceBtn.textContent = state.mascotImage ? 'Change the face…' : 'Use your face…';
        faceOff.style.display = state.mascotImage ? '' : 'none';
      };
      paintFaceRow();
      // 1024, not the tile's 108: pickImage passes small-enough files through
      // UNTOUCHED, and untouched is what keeps an animated memoji animated —
      // the canvas fallback (big photos only) flattens to its first frame
      faceBtn.addEventListener('click', () => pickImage((data) => {
        state.mascotImage = data;
        save();
        paintMascot();
        paintFaceRow();
      }, 1024));
      faceOff.addEventListener('click', () => {
        state.mascotImage = '';
        save();
        paintMascot();
        paintFaceRow();
      });

      greet.append(
        el('label', { class: 'greet-lab', for: 'greetNameIn' }, 'Class name — how the greeting says hello'),
        nameIn,
        faceRow,
        el('div', { class: 'greet-row' },
          el('label', { class: 'greet-chk' }, starsChk, 'Show class stars'),
          el('button', {
            class: 'greet-reset',
            onclick: () => {
              // update in place — a renderDashboard() here would rebuild the
              // form and throw away whatever name the teacher has typed
              state.rewards.stars = 0;
              save();
              renderStarPill();
              const n = dashEl.querySelector('.dr-stars');
              if (n) n.textContent = '0';
              const c = dashEl.querySelector('.dr-cap');
              if (c) c.textContent = 'stars this week';
              toast('Class stars reset');
            },
          }, 'Reset stars to 0'),
          el('button', { class: 'btn greet-done', onclick: commit }, 'Done')));
      queueMicrotask(() => nameIn.focus());
    } else {
      greet.append(
        el('h2', { class: 'dash-greet-line' },
          hello + (state.className ? ', ' + state.className : '!'),
          el('button', {
            class: 'greet-edit', title: 'Class name & stars',
            onclick: () => { heroEdit = true; renderDashboard(); },
          }, iconEl('gear'))),
        el('div', { class: 'dash-sub' },
          new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
          + ' · stays on this device'));
    }

    const hero = el('div', { class: 'dash-hero' }, mascot, greet);
    if (state.rewards.on) {
      const r = state.rewards;
      hero.append(el('div', { class: 'dash-rewards' },
        el('div', { class: 'dr-stars' }, String(r.stars)),
        el('div', { class: 'dr-cap' }, r.stars === 1 ? 'star this week' : 'stars this week'),
        el('div', { class: 'dr-streak' }, iconEl('sticker'),
          r.streak + (r.streak === 1 ? ' day in a row' : ' days in a row'))));
    }
    page.append(hero);

    // quick tools: the four one-tap classics spawn straight onto the current
    // screen; Maths and Games land on the stage with their category panel open
    const TILE_TOOLS = [
      { type: 'timer', label: 'Timer', tint: 'var(--tint-orange)' },
      { type: 'picker', label: 'Name picker', tint: 'var(--tint-blue)' },
      { type: 'traffic', label: 'Traffic light', tint: 'var(--tint-teal)' },
      { type: 'sketch', label: 'Draw pad', tint: 'var(--tint-yellow)' },
      { cat: 'maths', glyph: 'maths', label: 'Maths', tint: 'var(--tint-violet)' },
      { cat: 'games', glyph: 'games', label: 'Games', tint: 'var(--tint-pink)' },
    ];
    page.append(el('div', { class: 'dash-tools' },
      TILE_TOOLS.map((t) => el('button', {
        class: 'dash-tool',
        onclick: () => { closeDashboard(); if (t.cat) toggleMorePanel(t.cat); else addWidget(t.type); },
      },
      el('span', { class: 'dash-tool-ic', style: 'background:' + t.tint + '; --acc: rgba(255,255,255,0.85)' },
        iconEl(t.glyph || WIDGETS[t.type].icon)),
      el('span', { class: 'dash-tool-label' }, t.label)))));

    const body = el('div', { class: 'dash-body' });

    if (dashTab === 'templates') {
      page.append(el('div', { class: 'dash-section-head' },
        el('h3', {}, 'Templates'),
        el('div', { class: 'dash-section-sub' }, 'Ready-made screens — yours instantly, shared ones vetted before first use.')));
      dashTemplateCards(page, body);
      page.append(body);
      return;
    }

    if (dashTab === 'background') {
      page.append(el('div', { class: 'dash-section-head' },
        el('h3', {}, 'Dashboard wallpaper'),
        el('div', { class: 'dash-section-sub' }, 'Sets the backdrop of this page — pick a photo, gradient or your own image.'),
        el('div', { class: 'dash-section-sub' }, 'Each screen’s teaching backdrop is set on the stage: Background, in the dock.')));
      const picker = el('div', { class: 'dash-bg-card' },
        buildBgPicker(() => state.dashBg, (bg) => { state.dashBg = bg; save(); applyDashBg(); }));
      body.append(picker);
      page.append(body);
      return;
    }

    const search = el('input', {
      class: 'dash-search', type: 'search', placeholder: 'Search…', value: dashQuery,
    });
    search.addEventListener('input', () => { dashQuery = search.value; paintBody(); });
    const sortSel = el('select', { class: 'dash-sort' },
      el('option', { value: 'lastUsed' }, 'Last used'),
      el('option', { value: 'createdAt' }, 'Date created'),
      el('option', { value: 'name' }, 'Name'));
    sortSel.value = dashSort;
    sortSel.addEventListener('change', () => { dashSort = sortSel.value; paintBody(); });
    let headLead;
    const pill = (icon, label, onclick, helpKey) => el('button', { class: 'dash-pill', 'data-help': helpKey || '', onclick },
      el('span', { class: 'dash-pill-ic' }, iconEl(icon)), label);
    if (dashTab === 'decks') {
      headLead = el('div', { class: 'dash-actions' },
        el('button', { class: 'dash-primary', 'data-help': 'dash:start', onclick: () => closeDashboard() },
          'Start teaching', iconEl('chevr')),
        pill('plus', 'New deck', () => newDeck(), 'dash:newdeck'),
        pill('copy', 'From a template', () => { dashTab = 'templates'; renderDashboard(); }, 'dash:template'));
      if (window.SagePptxImport) headLead.append(pill('screens', 'Import PowerPoint', () => SagePptxImport.openDialog(), 'dash:importppt'));
    } else {
      // the register arrives as a column of names, so the front page opens the
      // same editor the widgets do rather than asking for one name at a time
      headLead = el('div', { class: 'dash-actions' },
        el('h3', {}, 'Class lists'),
        pill('list', 'Import a class list', () => {
          if (Object.keys(state.lists).length) { openListManager(renderDashboard); return; }
          // nothing to paste into yet: name the class first, or the textarea
          // would quietly swallow everything typed into it
          promptDialog('New class list name:', '', (v) => {
            const key = createList(v);
            if (key) openListManager(renderDashboard, key);
          }, { label: 'Create', placeholder: 'e.g. "Year 4R"' });
        }));
    }
    page.append(el('div', { class: 'dash-section-head' },
      headLead,
      el('div', { class: 'dash-section-tools' }, search, sortSel)));

    page.append(body);
    const paintBody = () => {
      body.innerHTML = '';
      const grid = el('div', { class: 'dash-grid' + (dashTab === 'lists' ? ' dash-lists' : '') });
      if (dashTab === 'decks') dashDeckCards(grid); else dashListCards(grid);
      body.append(grid);
    };
    paintBody();
  }

  // ---------------------------------------------------------------- templates
  // A template is a deck definition with fractional widget positions (fx/fy/fw/fh,
  // 0..1 of the viewport) so it lays out correctly on any display. Everything that
  // enters — built-in bank, community fetch, pasted file — goes through
  // sanitizeTemplate: unknown widget types are dropped, fields are coerced, and
  // any URLs inside props are collected so the teacher can vet them first.
  const URLISH_PROPS = ['url', 'src', 'text', 'value'];

  function sanitizeTemplate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.screens) || !raw.screens.length) return null;
    const urls = [];
    const screens = [];
    for (const s of raw.screens.slice(0, 12)) {
      if (!s || typeof s !== 'object') continue;
      const widgets = [];
      for (const w of (Array.isArray(s.widgets) ? s.widgets : []).slice(0, 24)) {
        if (!w || !WIDGETS[w.type]) continue;
        const props = (w.props && typeof w.props === 'object') ? JSON.parse(JSON.stringify(w.props)) : {};
        // rich text from a stranger's file never enters storage uncleaned. The
        // sinks sanitize too, but a payload that is never saved cannot outlive
        // a sink this file forgets about later.
        if (typeof props.html === 'string') props.html = SageSanitize.html(props.html);
        for (const k of URLISH_PROPS) {
          if (typeof props[k] === 'string' && /^(https?:|data:)/i.test(props[k])) {
            urls.push(props[k].length > 90 ? props[k].slice(0, 90) + '…' : props[k]);
          }
        }
        widgets.push({
          type: w.type,
          fx: clamp(+w.fx || 0, 0, 0.95), fy: clamp(+w.fy || 0, 0, 0.9),
          fw: clamp(+w.fw || 0.2, 0.04, 1), fh: clamp(+w.fh || 0.2, 0.05, 1),
          theme: typeof w.theme === 'string' ? w.theme : undefined,
          props,
        });
      }
      if (!widgets.length && !s.background) continue;
      const bt = s.background && s.background.type;
      const bg = s.background && typeof s.background.value === 'string'
        ? { type: bt === 'image' ? 'image' : bt === 'color' ? 'color' : 'gradient', value: s.background.value }
        : { type: 'gradient', value: BACKGROUNDS.gradients[0] };
      if (bg.type === 'image' && /^https?:/i.test(bg.value)) urls.push(bg.value.slice(0, 90));
      screens.push({ name: typeof s.name === 'string' ? s.name.slice(0, 40) : '', background: bg, widgets });
    }
    if (!screens.length) return null;
    return {
      id: String(raw.id || raw.name || 'template').slice(0, 60),
      name: String(raw.name || 'Template').slice(0, 60),
      description: String(raw.description || '').slice(0, 200),
      category: String(raw.category || 'Community').slice(0, 40),
      author: String(raw.author || 'Unknown').slice(0, 40),
      screens, urls,
    };
  }

  function resetTemplateWidgetProps(type, props) {
    if (type === 'promptcards') {
      props.index = 0; props.score = 0; props.passed = 0; props.revealed = props.mode !== 'guess';
    } else if (type === 'wordbuilder') {
      props.wordIndex = 0; props.guessed = []; props.misses = 0;
    } else if (type === 'memory') {
      props.cards = null; props.pairKey = ''; props.moves = 0;
    } else if (type === 'tictactoe') {
      props.board = Array(9).fill(''); props.turn = 'X'; props.status = '';
      props.xWins = 0; props.oWins = 0; props.draws = 0;
    } else if (type === 'connectfour') {
      props.board = Array(42).fill(''); props.turn = 'coral'; props.status = '';
      props.coralWins = 0; props.goldWins = 0;
    } else if (type === 'strategyboard') {
      props.board = null; props.boardMode = ''; props.turn = 'light'; props.selected = -1; props.status = '';
    } else if (type === 'teachclock') {
      props.score = 0; props.streak = 0; props.game = null; props.live = false; props.listIndex = 0;
    } else if (type === 'moneytray') {
      props.pieces = []; props.score = 0; props.streak = 0; props.game = null; props.listIndex = 0;
    } else if (type === 'shop') {
      props.pieces = []; props.stage = 'sale'; props.changeDue = 0; props.score = 0; props.listIndex = 0;
    } else if (type === 'frametiles') {
      props.pieces = []; props.score = 0; props.streak = 0; props.game = null; props.flash = false;
    }
    return props;
  }

  // fractions -> pixels for this display, fresh ids, volatile state reset
  function instantiateTemplate(tpl) {
    const W = window.innerWidth, H = window.innerHeight;
    const deck = blankDeck(tpl.name);
    deck.screens = tpl.screens.map((s) => ({
      id: uid(),
      name: s.name || '',
      background: { ...s.background },
      widgets: s.widgets.map((w, i) => {
        const props = Object.assign(WIDGETS[w.type].defaults(), w.props);
        props.running = false; props.endAt = null;
        if (typeof props.remaining === 'number' && typeof props.total === 'number') props.remaining = props.total;
        if (Array.isArray(props.items)) props.items = props.items.map((it) => ({ id: uid(), time: String(it.time || ''), text: String(it.text || ''), done: false }));
        if (Array.isArray(props.options)) props.options = props.options.map((o) => ({ label: String(o.label || ''), votes: 0 }));
        resetTemplateWidgetProps(w.type, props);
        const widget = {
          id: uid(), type: w.type,
          x: Math.round(w.fx * W), y: Math.round(w.fy * H),
          w: Math.round(w.fw * W), h: Math.round(w.fh * H),
          z: 10 + i, props,
        };
        if (w.theme) widget.theme = w.theme;
        return widget;
      }),
    }));
    state.decks.push(deck);
    save();
    return deck;
  }

  // vetting step: community templates get a contents + URL preview the first time
  function useTemplate(raw, opts) {
    const tpl = sanitizeTemplate(raw);
    if (!tpl) { toast("⚠️ That doesn't look like a Sage Stage template."); return; }
    const community = opts && opts.community;
    const firstTime = !state.seenTemplates.includes(tpl.id);
    const go = () => {
      if (community && firstTime) { state.seenTemplates.push(tpl.id); }
      const deck = instantiateTemplate(tpl);
      toast(`"${tpl.name}" added as a new deck`);
      openDeck(deck.id);
    };
    if (!community || !firstTime) { go(); return; }
    openModal('Check this template first', (body, finish) => {
      const counts = {};
      for (const s of tpl.screens) for (const w of s.widgets) counts[w.type] = (counts[w.type] || 0) + 1;
      const summary = Object.entries(counts).map(([t, n]) => (WIDGETS[t].title + (n > 1 ? ' ×' + n : ''))).join(', ');
      body.append(
        el('p', {}, el('b', {}, tpl.name), ` by ${tpl.author} — ${tpl.screens.length} screen${tpl.screens.length > 1 ? 's' : ''} with: ${summary || 'no widgets'}.`),
      );
      if (tpl.urls.length) {
        const list = el('ul', { class: 'tpl-url-list' });
        for (const u of tpl.urls) list.append(el('li', {}, u));
        body.append(el('p', {}, el('b', {}, 'It links to these addresses:')), list);
      }
      body.append(
        el('div', { class: 'hint' }, '👀 First time using this template — open it privately before showing your class (pause screen mirroring while you check it).'),
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => { finish(); go(); } }, 'Add as new deck'),
          el('button', { class: 'btn ghost', onclick: () => finish() }, 'Cancel')),
      );
    });
  }

  // deck -> shareable template JSON (fractions, volatile state stripped)
  function deckToTemplate(deck) {
    const W = window.innerWidth, H = window.innerHeight;
    return {
      id: (deck.name || 'my-template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name: deck.name || 'My template',
      category: deck.subject || 'Community',
      description: '',
      author: 'A teacher',
      screens: deck.screens.map((s) => ({
        name: s.name || '',
        background: { ...s.background },
        widgets: s.widgets.map((w) => {
          const props = JSON.parse(JSON.stringify(w.props || {}));
          delete props.running; delete props.endAt; delete props.pool; delete props.startedAt;
          if (typeof props.remaining === 'number' && typeof props.total === 'number') props.remaining = props.total;
          resetTemplateWidgetProps(w.type, props);
          const out = {
            type: w.type,
            fx: +(w.x / W).toFixed(4), fy: +(w.y / H).toFixed(4),
            fw: +(w.w / W).toFixed(4), fh: +(w.h / H).toFixed(4),
            props,
          };
          if (w.theme && w.theme !== 'card') out.theme = w.theme;
          return out;
        }),
      })),
    };
  }

  // community banks: fetch <source>/index.json, cards fetch <source>/<file> on use
  const communityCache = new Map(); // source url -> { status: 'loading'|'ok'|'error', items: [] }
  function fetchCommunity(source, onDone) {
    const base = source.replace(/\/?$/, '/');
    communityCache.set(source, { status: 'loading', items: [] });
    fetch(base + 'index.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((idx) => {
        const items = (Array.isArray(idx.templates) ? idx.templates : []).slice(0, 100)
          .filter((m) => m && typeof m.file === 'string');
        communityCache.set(source, { status: 'ok', items });
      })
      .catch(() => communityCache.set(source, { status: 'error', items: [] }))
      .then(() => onDone && onDone());
  }

  // a pseudo-screen (fractions -> px) so deckThumb can draw template previews
  function templateThumb(scr) {
    const W = window.innerWidth, H = window.innerHeight;
    return deckThumb({
      background: scr.background || { type: 'gradient', value: BACKGROUNDS.gradients[0] },
      widgets: (scr.widgets || []).map((w) => ({
        type: w.type,
        x: (+w.fx || 0) * W, y: (+w.fy || 0) * H,
        w: (+w.fw || 0.2) * W, h: (+w.fh || 0.2) * H,
      })),
    });
  }

  // ---------------------------------------------------------------- spotlight tool
  // Dims the whole screen except a movable hole — drag the bright spot around to
  // focus the class on one part of the screen. The hole is a div whose huge
  // box-shadow paints the dim layer, so moving it is just left/top updates.
  let spotTool = null;
  function closeSpotlight() {
    if (!spotTool) return;
    window.removeEventListener('keydown', spotTool.esc);
    spotTool.el.remove();
    spotTool = null;
  }
  function toggleSpotlight() {
    if (spotTool) { closeSpotlight(); return; }
    closePanels();
    const st = { x: window.innerWidth / 2, y: window.innerHeight * 0.42, rw: 170, rh: 170, shape: 'circle', dim: 0.78 };
    const hole = el('div', { class: 'spot-hole' });
    const handle = el('div', { class: 'spot-size', title: 'Drag to resize' });
    hole.append(handle);
    const paint = () => {
      hole.style.left = st.x - st.rw + 'px';
      hole.style.top = st.y - st.rh + 'px';
      hole.style.width = st.rw * 2 + 'px';
      hole.style.height = st.rh * 2 + 'px';
      hole.style.borderRadius = st.shape === 'circle' ? '50%' : '22px';
      hole.style.boxShadow = `0 0 0 200vmax rgba(8, 18, 28, ${st.dim})`;
      shapeBtns.circle.classList.toggle('active', st.shape === 'circle');
      shapeBtns.rect.classList.toggle('active', st.shape !== 'circle');
    };
    const shapeBtns = {
      circle: el('button', { class: 'spot-btn', title: 'Round spotlight', onclick: () => { st.shape = 'circle'; st.rh = st.rw; paint(); } }, iconEl('elltool')),
      rect: el('button', { class: 'spot-btn', title: 'Rectangle spotlight', onclick: () => { st.shape = 'rect'; paint(); } }, iconEl('recttool')),
    };
    const bar = el('div', { class: 'spot-bar' },
      shapeBtns.circle, shapeBtns.rect,
      el('input', {
        type: 'range', min: 35, max: 95, value: st.dim * 100, title: 'Darkness',
        oninput: (e) => { st.dim = +e.target.value / 100; paint(); },
      }),
      el('button', { class: 'spot-btn', title: 'Close the spotlight (Esc)', onclick: () => closeSpotlight() }, iconEl('close')),
    );
    const root = el('div', { class: 'spot-root' }, hole, bar);
    // drag anywhere: clicking the dark area jumps the spotlight there, then drags
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.spot-bar')) return;
      e.preventDefault();
      const resizing = e.target === handle;
      const move = (ev) => {
        if (resizing) {
          st.rw = clamp(Math.abs(ev.clientX - st.x), 50, window.innerWidth);
          st.rh = st.shape === 'circle' ? st.rw : clamp(Math.abs(ev.clientY - st.y), 50, window.innerHeight);
        } else {
          st.x = ev.clientX; st.y = ev.clientY;
        }
        paint();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      move(e);
    });
    const esc = (e) => { if (e.key === 'Escape') closeSpotlight(); };
    window.addEventListener('keydown', esc);
    spotTool = { el: root, esc };
    paint();
    document.body.append(root);
  }

  // ---------------------------------------------------------------- screen shades
  // Four pull tabs, one per edge: drag a tab to slide an opaque shade across
  // that part of the screen (hide the answer, reveal line by line…).
  // Double-click a tab to snap its shade back. Toggle the tool again to clear.
  let shadesEl = null;
  function toggleShades() {
    if (shadesEl) { shadesEl.remove(); shadesEl = null; return; }
    closePanels();
    shadesEl = el('div', { class: 'shade-root' });
    const SIDES = [
      { side: 'top', vertical: true, from: 0 },
      { side: 'bottom', vertical: true, from: 1 },
      { side: 'left', vertical: false, from: 0 },
      { side: 'right', vertical: false, from: 1 },
    ];
    for (const s of SIDES) {
      const tab = el('button', { class: 'shade-tab', title: 'Drag to cover the screen · double-click to open' },
        el('span', { class: 'shade-grip' }));
      const shade = el('div', { class: 'shade shade-' + s.side }, tab);
      let size = 0;
      const apply = () => { shade.style[s.vertical ? 'height' : 'width'] = size + 'px'; };
      tab.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const move = (ev) => {
          const pos = s.vertical ? ev.clientY : ev.clientX;
          const span = s.vertical ? window.innerHeight : window.innerWidth;
          size = clamp(s.from === 0 ? pos : span - pos, 0, span);
          apply();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      tab.addEventListener('dblclick', () => { size = 0; apply(); });
      apply();
      shadesEl.append(shade);
    }
    document.body.append(shadesEl);
    toast('Drag a tab to pull a shade over the screen');
  }

  // ---------------------------------------------------------------- toolbar
  const widgetTool = (type, label, cat) => ({ id: type, glyph: WIDGETS[type].icon, accent: WIDGETS[type].accent, label, cat, run: () => addWidget(type) });
  // the list editor opened from the bar has to refresh the widgets that read a
  // list, the same way the "Edit lists" button inside them already does
  const refreshListWidgets = () => {
    save();
    for (const w of screen().widgets) if (w.type === 'picker' || w.type === 'groups') remountWidget(w);
  };
  const TOOLS = [
    { id: 'background', glyph: 'background', accent: '#fbcfe8', label: 'Background', run: () => toggleBackgroundPanel() },
    { id: 'spotlight', glyph: 'spot', accent: '#fde68a', label: 'Spotlight', run: () => toggleSpotlight() },
    { id: 'shades', glyph: 'shade', accent: '#c7d2fe', label: 'Screen cover', run: () => toggleShades() },
    widgetTool('sketch', 'Draw pad'),
    widgetTool('text', 'Text'),
    widgetTool('clock', 'Clock'),
    widgetTool('teachclock', 'Teaching clock', 'maths'),
    widgetTool('moneytray', 'Money tray', 'maths'),
    widgetTool('shop', 'Class shop', 'maths'),
    widgetTool('frametiles', 'Frame tiles', 'maths'),
    widgetTool('counters', 'Counters', 'maths'),
    widgetTool('dienes', 'Base 10', 'maths'),
    widgetTool('pvcounters', 'Place value counters', 'maths'),
    widgetTool('rekenrek', 'Rekenrek', 'maths'),
    widgetTool('numberline', 'Number line', 'maths'),
    widgetTool('partwhole', 'Part–whole', 'maths'),
    widgetTool('barmodel', 'Bar model', 'maths'),
    widgetTool('timer', 'Timer'),
    widgetTool('visualtimer', 'Visual timer'),
    widgetTool('stopwatch', 'Stopwatch'),
    widgetTool('countdown', 'Countdown'),
    widgetTool('calendar', 'Calendar'),
    widgetTool('agenda', 'Agenda'),
    widgetTool('traffic', 'Traffic light'),
    widgetTool('symbols', 'Work mode'),
    widgetTool('sound', 'Noise meter'),
    // sits with the picker rather than up by Background, which is where its
    // declaration order would have put it on the bar. Shares the picker's accent
    // too: same register, two ways in. The menu sorts by label, so this position
    // only decides where it lands on the bar — set the register, then pick from it
    { id: 'lists', glyph: 'list', accent: '#bae6fd', label: 'Class lists', run: () => openListManager(refreshListWidgets) },
    widgetTool('picker', 'Name picker'),
    widgetTool('groups', 'Group maker'),
    widgetTool('dice', 'Dice'),
    widgetTool('poll', 'Poll'),
    widgetTool('score', 'Scoreboard'),
    widgetTool('promptcards', 'Prompt cards'),
    widgetTool('wordbuilder', 'Word builder'),
    widgetTool('memory', 'Memory pairs', 'games'),
    widgetTool('tictactoe', 'Tic tac toe', 'games'),
    widgetTool('connectfour', 'Connect four', 'games'),
    widgetTool('countdowngame', 'Numbers & letters', 'games'),
    widgetTool('strategyboard', 'Mini strategy board', 'games'),
    widgetTool('image', 'Image'),
    widgetTool('video', 'Video'),
    widgetTool('webcam', 'Webcam'),
    widgetTool('embed', 'Embed'),
    widgetTool('pdf', 'Document'),
    widgetTool('qr', 'QR code'),
    widgetTool('link', 'Link'),
    widgetTool('sticker', 'Sticker'),
  ];

  function renderToolbar() {
    const toolbar = $('#toolbar');
    toolbar.innerHTML = '';
    for (const t of TOOLS) {
      if (!state.pinned.includes(t.id)) continue;
      // title + aria-label so the name survives compact mode's hidden labels
      toolbar.append(el('button', { class: 'tool', style: '--acc:' + t.accent, title: t.label, 'aria-label': t.label, 'data-help': t.id, onclick: () => t.run() },
        el('span', { class: 'glyph' }, iconEl(t.glyph)),
        el('span', { class: 'label' }, t.label)));
    }
    // permanent category tabs — Maths and Games keep growing, so they get their own panels
    const catTab = (cat, glyph, accent, label) => el('button', { class: 'tool', style: '--acc:' + accent, title: label, 'aria-label': label, 'data-help': 'dock:' + cat, onclick: () => toggleMorePanel(cat) },
      el('span', { class: 'glyph' }, iconEl(glyph)),
      el('span', { class: 'label' }, label));
    toolbar.append(...[
      catTab('more', 'more', '#c7d2fe', 'More'),
      catTab('maths', 'maths', '#fde68a', 'Maths'),
      window.SageEnglishWord ? catTab('english', 'english', '#bbf7d0', 'English') : null,
      catTab('games', 'games', '#ddd6fe', 'Games'),
    ].filter(Boolean));
    // fixed switcher: annotation is always one tap away, never needs pinning
    toolbar.append(
      el('span', { class: 'dock-sep' }),
      el('button', {
        class: 'dock-annotate' + (drawLayer.classList.contains('active') ? ' active' : ''),
        title: 'Annotate the screen', 'data-help': 'dock:annotate', onclick: () => toggleDraw(),
      }, iconEl('scribble')),
      el('button', { class: 'dock-hide', title: 'Hide bar (B)', 'data-help': 'dock:hide', onclick: () => setDock('mini') }, iconEl('shrink')),
    );
    applyDock();
  }

  // ---------------------------------------------------------------- collapsible dock
  // The full bar folds into a three-button pill: annotate / select / restore.
  let miniDock = null;

  function setDock(mode) {
    state.dock = mode;
    save();
    applyDock();
  }

  function applyDock() {
    const mini = state.dock === 'mini';
    $('#toolbar').classList.toggle('hidden', mini);
    if (mini && !miniDock) {
      miniDock = el('div', { class: 'mini-dock' });
      document.body.append(miniDock);
    } else if (!mini && miniDock) {
      miniDock.remove();
      miniDock = null;
    }
    if (miniDock) renderMiniDock();
    fitDock();
  }

  // The dock degrades by measurement, never by viewport guesswork — a teacher
  // with four pinned tools keeps labels far narrower than one with fourteen.
  // Stage 1: one row, 14px labels. Stage 2 (.compact): icons only, everything
  // still visible. Stage 3 (.dock-left): centering can't clear the screen-nav
  // pill, so the dock takes the left span instead. overflow-x remains the
  // backstop for a tiny window. Always measured from stage 1, so widening the
  // window restores labels — no thrash, the classes only ever shrink content.
  function fitDock() {
    const tb = $('#toolbar');
    if (tb.classList.contains('hidden')) return;
    tb.classList.remove('compact', 'dock-left');
    tb.style.removeProperty('--dock-left');
    if (tb.scrollWidth > tb.clientWidth + 1) tb.classList.add('compact');
    if (tb.scrollWidth > tb.clientWidth + 1) {
      tb.classList.add('dock-left');
      // Stage 3 means CENTRED couldn't clear the nav pill — but hard-left was
      // a cliff (13px over budget jumped 100+px and left a dead gap by the
      // nav). Centre the bar in the span that IS free: from the 16px margin
      // to 12px shy of the nav's real left edge, measured, not assumed.
      const nav = $('#screenNav');
      const navLeft = nav ? nav.getBoundingClientRect().left : window.innerWidth;
      const free = Math.max(0, navLeft - 12 - 16);
      const w = Math.min(tb.scrollWidth, free);
      tb.style.setProperty('--dock-left', Math.round(16 + Math.max(0, (free - w) / 2)) + 'px');
    }
  }
  let fitDockTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(fitDockTimer);
    fitDockTimer = setTimeout(fitDock, 120);
  });

  function renderMiniDock() {
    if (!miniDock) return;
    const drawOn = drawLayer.classList.contains('active');
    miniDock.innerHTML = '';
    miniDock.dataset.help = 'minidock';
    miniDock.append(
      el('button', { class: 'mini-btn' + (drawOn ? ' active' : ''), title: 'Annotate', onclick: () => { if (!drawOn) toggleDraw(); } }, iconEl('scribble')),
      el('button', { class: 'mini-btn' + (drawOn ? '' : ' active'), title: 'Select', onclick: () => { if (drawOn) toggleDraw(); } }, iconEl('pointer')),
      el('span', { class: 'mini-sep' }),
      el('button', { class: 'mini-btn', title: 'Show bar (B)', onclick: () => setDock('full') }, iconEl('expand')),
    );
  }

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'b' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    setDock(state.dock === 'mini' ? 'full' : 'mini');
  });

  // ---------------------------------------------------------------- "More" panel (widgets by category + pinning)
  let morePanel = null;
  let morePanelCat = 'more';
  const PANEL_TITLES = { more: 'More widgets', maths: 'Maths', english: 'English', games: 'Games' };
  function closeMorePanel() {
    if (morePanel) { morePanel.remove(); morePanel = null; }
  }
  function toggleMorePanel(cat = 'more') {
    if (morePanel && morePanelCat === cat) { closeMorePanel(); return; }
    closePanels();
    morePanelCat = cat;
    const grid = el('div', { class: 'tool-grid' });
    // sorted by label, not by TOOLS order — a teacher hunting for one widget
    // scans A–Z; the bar keeps its hand-picked order (renderToolbar)
    const inCat = TOOLS.filter((t) => (t.cat || 'more') === cat)
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' }));
    for (const t of inCat) {
      const pinned = state.pinned.includes(t.id);
      grid.append(el('div', {
        class: 'tool-cell', role: 'button', tabindex: '0', style: '--acc:' + t.accent, 'data-help': t.id,
        onclick: () => { closeMorePanel(); t.run(); },
        // role=button promises the keyboard what only a real button gives free
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeMorePanel(); t.run(); }
        },
      },
        el('span', { class: 'glyph' }, iconEl(t.glyph)),
        el('span', { class: 'label' }, t.label),
        el('button', {
          class: 'pin-btn' + (pinned ? ' pinned' : ''),
          title: pinned ? 'Remove from the bar' : 'Pin to the bar',
          onclick: (e) => { e.stopPropagation(); togglePin(t.id); },
        }, iconEl('pin')),
      ));
    }
    morePanel = el('div', { class: 'panel' },
      el('h3', {}, PANEL_TITLES[cat] || 'More widgets'),
      grid,
      el('div', { class: 'hint', style: 'margin-top:10px;' }, 'Click a widget to add it to this screen · 📌 pins it to the bar.'),
    );
    document.body.append(morePanel);
  }
  function togglePin(id) {
    state.pinned = state.pinned.includes(id)
      ? state.pinned.filter((x) => x !== id)
      : [...state.pinned, id];
    save();
    renderToolbar();
    closeMorePanel();
    toggleMorePanel(morePanelCat);
  }

  // ---------------------------------------------------------------- background panel
  let bgPanel = null;
  // shared background picker (photos, gradients, colors, custom color + upload) —
  // used by the per-screen background drawer and the dashboard wallpaper tab
  function buildBgPicker(getBg, setBg) {
    const root = el('div', { class: 'bg-drawer-body' });
    const markActive = () => {
      const bg = getBg() || {};
      for (const n of root.querySelectorAll('.swatch, .bg-thumb')) {
        n.classList.toggle('active', n.dataset.value === bg.value);
      }
    };
    const pick = (bg) => { setBg(bg); markActive(); };
    for (const cat of BACKGROUNDS.photos) {
      const grid = el('div', { class: 'bg-grid' });
      for (const id of cat.ids) {
        const full = bgPhotoUrl(id, 1920, 80);
        grid.append(el('button', {
          class: 'bg-thumb', 'data-value': full, title: cat.label,
          onclick: () => pick({ type: 'image', value: full }),
        }, el('img', { src: bgPhotoUrl(id, 320, 55), loading: 'lazy', alt: cat.label + ' background' })));
      }
      root.append(el('h4', {}, cat.label), grid);
    }
    const gradWrap = el('div', { class: 'swatches' });
    for (const g of BACKGROUNDS.gradients) {
      gradWrap.append(el('button', {
        class: 'swatch', style: 'background:' + g, 'data-value': g,
        onclick: () => pick({ type: 'gradient', value: g }),
      }));
    }
    const colWrap = el('div', { class: 'swatches' });
    for (const c of BACKGROUNDS.colors) {
      colWrap.append(el('button', {
        class: 'swatch', style: 'background:' + c, 'data-value': c,
        onclick: () => pick({ type: 'color', value: c }),
      }));
    }
    const customColor = el('input', {
      type: 'color', value: '#0f766e',
      oninput: (e) => pick({ type: 'color', value: e.target.value }),
    });
    const imgBtn = el('button', {
      class: 'btn ghost small',
      onclick: () => pickImage((d) => pick({ type: 'image', value: d })),
    }, 'Upload image…');
    root.append(
      el('h4', {}, 'Gradients'), gradWrap,
      el('h4', {}, 'Colors'), colWrap,
      el('h4', {}, 'Custom'),
      el('div', { class: 'row' }, customColor, imgBtn),
      el('div', { class: 'hint' }, 'Uploaded images are stored on this device only; photos need an internet connection.'),
    );
    markActive();
    return root;
  }

  function toggleBackgroundPanel() {
    if (bgPanel) { bgPanel.remove(); bgPanel = null; return; }
    closePanels();
    const body = buildBgPicker(
      () => screen().background,
      (bg) => {
        screen().background = bg; save(); applyBackground();
        if (deckPanel) renderDeck();   // the sidebar thumbnail paints this backdrop
      },
    );
    bgPanel = el('aside', { class: 'bg-drawer' },
      el('div', { class: 'bg-drawer-head' },
        el('h3', {}, 'Background for this screen'),
        el('button', { class: 'rm', title: 'Close', onclick: () => closePanels() }, '✕')),
      body);
    document.body.append(bgPanel);
  }
  function closePanels() {
    if (bgPanel) { bgPanel.remove(); bgPanel = null; }
    if (geoPanel) { geoPanel.remove(); geoPanel = null; }
    closeMorePanel();
    closeModal();
  }

  // A dock panel used to sit there until the same dock button was pressed again:
  // open Maths, think better of it, click the stage — and a 560px slab stayed
  // over the lesson. Everything else here (widget ⋮, deck menus) goes away on an
  // outside press, so the dock's panels do too.
  // Capture phase: widgets stop pointerdown from bubbling once a drag starts, and
  // a press that begins a drag is exactly the press that should dismiss the panel.
  // The dock is exempt — its buttons toggle, so closing on the way down would let
  // the click reopen what it meant to shut. The geometry drawer is left out: it
  // belongs to the annotate bar and its "outside" is the canvas it configures.
  function closeDockPanels() {
    if (bgPanel) { bgPanel.remove(); bgPanel = null; }
    closeMorePanel();
  }
  document.addEventListener('pointerdown', (e) => {
    if (!morePanel && !bgPanel) return;
    const t = e.target;
    if (t && t.closest && t.closest('.panel, .bg-drawer, #toolbar, .mini-dock')) return;
    closeDockPanels();
  }, true);

  // ---------------------------------------------------------------- list manager
  let modal = null;
  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }
  function openModal(title, bodyBuilder, onClose) {
    closePanels();
    const bodyEl = el('div', { class: 'modal-body' });
    modal = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === modal) finish(); } },
      el('div', { class: 'modal' },
        el('div', { class: 'modal-head' }, el('h3', {}, title),
          el('button', { class: 'icon-btn', style: 'box-shadow:none;border:none;', onclick: () => finish() }, iconEl('close'))),
        bodyEl));
    const finish = () => { closeModal(); if (onClose) onClose(); };
    bodyBuilder(bodyEl, finish);
    document.body.append(modal);
  }

  // stand-alone confirm overlay — doesn't touch the `modal` singleton, so it can
  // stack on top of an already-open modal without closing it (window.confirm is
  // unreliable in fullscreen/kiosk contexts this app is often run in, so every
  // destructive action confirms through here instead)
  // opts.altLabel/onAlt adds a third, non-destructive way out between Cancel and
  // the danger button — "Duplicate first" when closing something that holds work
  function confirmDialog(message, onYes, opts) {
    const { label = 'Delete', cancelLabel = 'Cancel', danger = true, altLabel, onAlt } = opts || {};
    const backdrop = el('div', {
      class: 'modal-backdrop',
      onclick: (e) => { if (e.target === backdrop) close(); },
    });
    const close = () => backdrop.remove();
    const row = el('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:wrap;' },
      el('button', { class: 'btn ghost', onclick: () => close() }, cancelLabel));
    if (altLabel && typeof onAlt === 'function') {
      row.append(el('button', { class: 'btn ghost', onclick: () => { close(); onAlt(); } }, altLabel));
    }
    row.append(el('button', {
      class: 'btn' + (danger ? ' danger' : ''), onclick: () => { close(); onYes(); },
    }, label));
    backdrop.append(el('div', { class: 'modal confirm-modal' },
      el('div', { class: 'modal-body' }, el('p', {}, message), row)));
    document.body.append(backdrop);
  }

  // window.prompt's replacement, in confirmDialog's mould. It exists because
  // the desktop webview has NO native prompt — wry implements none of the
  // WKUIDelegate JS-dialog methods, so prompt() returns null instantly and a
  // "Rename" that leans on it is a button that does nothing. Same story in
  // fullscreen/kiosk browsers, which is why confirmDialog already existed.
  // onSubmit(value) fires only on OK/Enter — never with null; cancel is Esc,
  // the backdrop, or the Cancel button, and simply closes.
  function promptDialog(message, initial, onSubmit, opts) {
    const { label = 'OK', placeholder = '', hint = null } = opts || {};
    const backdrop = el('div', {
      class: 'modal-backdrop',
      onclick: (e) => { if (e.target === backdrop) close(); },
    });
    const close = () => backdrop.remove();
    const input = el('input', {
      class: 'text-input', type: 'text', value: initial == null ? '' : String(initial), placeholder,
      style: 'width:100%;box-sizing:border-box;',
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.stopPropagation(); close(); }
      },
    });
    const submit = () => { const v = input.value; close(); onSubmit(v); };
    backdrop.append(el('div', { class: 'modal confirm-modal' },
      el('div', { class: 'modal-body' },
        el('p', {}, message),
        input,
        hint ? el('div', { class: 'hint' }, hint) : null,
        el('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:wrap;' },
          el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
          el('button', { class: 'btn', onclick: () => submit() }, label)))));
    document.body.append(backdrop);
    input.focus();
    input.select();
  }

  // ------------------------------------------------- snapshots: the way back
  // The list a teacher reaches for on Thursday when Tuesday has gone. Grouped
  // by the thing the copy is OF, newest first, because "my Year 2 writing" is
  // how the question arrives — not "the snapshot from 14:32".
  function snapWhen(at) {
    const mins = Math.floor((Date.now() - at) / 60000);
    if (mins < 60) return mins <= 1 ? 'just now' : mins + ' minutes ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs === 1 ? 'an hour ago' : hrs + ' hours ago';
    const days = Math.floor(hrs / 24);
    const t = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days === 1) return 'yesterday, ' + t;
    if (days < 7) return days + ' days ago, ' + t;
    return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + t;
  }

  function paintSnapshots(box, finish) {
    SageSnapshots.list().then((rows) => {
      box.innerHTML = '';
      if (!rows.length) return;
      const groups = new Map();
      for (const r of rows) {
        if (!groups.has(r.unit)) groups.set(r.unit, []);
        groups.get(r.unit).push(r);
      }
      const list = el('div', { class: 'bin-list' });
      for (const [, entries] of groups) {
        const head = entries[0];
        const kindWord = head.kind === 'deck' ? 'deck' : head.kind === 'screen' ? 'screen' : head.title;
        const sub = el('div', { class: 'snap-versions' });
        for (const r of entries) {
          sub.append(el('div', { class: 'row bin-row' },
            el('span', { class: 'grow' }, snapWhen(r.at)
              + (r.label ? ' · ' + r.label : r.reason === 'daily' ? ' · daily copy' : '')
              + ' · ' + Math.max(1, Math.round((r.bytes || 0) / 1024)) + ' KB'),
            el('button', {
              class: 'btn ghost small',
              onclick: () => restoreSnapshot(r, finish),
            }, 'Restore…')));
        }
        list.append(el('div', { class: 'snap-group' },
          el('div', { class: 'snap-title' }, kindWord
            + ' · ' + entries.length + (entries.length === 1 ? ' copy' : ' copies')),
          sub));
      }
      box.append(
        el('h3', {}, 'Snapshots'),
        el('div', { class: 'hint' }, 'Taken on their own: a copy of every piece of '
          + 'work at the start of each day, and another the moment before anything '
          + 'clears or deletes it. This is what catches “Clear page”, a deleted page, '
          + 'and a deleted screen or deck — the things closing a widget never covered.'),
        list, el('hr'));
    }).catch(() => { /* no snapshots is a quiet absence, not an error to report */ });
  }

  function restoreSnapshot(rec, finish) {
    SageSnapshots.get(rec.id).then((full) => {
      return handleSnapshot(full);
    }).catch(() => toast('That copy could not be read — the snapshot store didn’t answer.'));
    function handleSnapshot(full) {
      if (!full || !full.w) { toast('That copy could not be read.'); return; }
      const when = snapWhen(full.at);
      if (full.kind === 'deck') {
        confirmDialog('Bring back the deck “' + (full.w.name || 'Untitled')
          + '” as it was ' + when + '? It is added alongside what you have now — '
          + 'nothing currently on screen is touched.', () => {
          const d = JSON.parse(JSON.stringify(full.w));
          d.id = uid();
          d.name = (d.name || 'Deck') + ' (restored)';
          d.lastUsed = Date.now();
          for (const s of d.screens || []) {
            s.id = uid();
            for (const wd of s.widgets || []) wd.id = uid();
          }
          state.decks.push(d);
          state.activeDeck = d.id;
          save(); renderScreen(); if (finish) finish();
          if (dashEl) renderDashboard();
          toast('Restored as “' + d.name + '”');
        }, { label: 'Bring it back', danger: false });
        return;
      }
      if (full.kind === 'screen') {
        confirmDialog('Bring back the screen “' + (full.title || 'Screen')
          + '” as it was ' + when + '? It is added after the one you are on.', () => {
          const s = JSON.parse(JSON.stringify(full.w));
          s.id = uid();
          for (const wd of s.widgets || []) wd.id = uid();
          const d = viewDeck();
          d.screens.splice(currentIndex() + 1, 0, s);
          save(); setCurrent(currentIndex() + 1); if (finish) finish();
          toast('Screen restored');
        }, { label: 'Bring it back', danger: false });
        return;
      }
      // A widget. If the original is still on a screen, put the copy BESIDE it
      // rather than over it: a teacher restoring Tuesday almost never wants
      // today thrown away to get it, and comparing the two is the actual task.
      const live = findWidgetAnywhere(full.unit);
      const msg = live
        ? 'Put “' + full.title + '” back as it was ' + when
          + '? It opens as a second copy next to the one you have, so nothing you have written since is lost.'
        : 'Put “' + full.title + '” back as it was ' + when + '?';
      confirmDialog(msg, () => {
        const wd = JSON.parse(JSON.stringify(full.w));
        wd.id = uid();
        wd.z = ++zTop;
        wd.everywhere = false;
        wd.x = (wd.x || 40) + (live ? 30 : 0);
        wd.y = (wd.y || 40) + (live ? 30 : 0);
        const scr = screen();
        if (!scr) return;
        scr.widgets.push(wd);
        save(); renderScreen(); if (finish) finish();
        toast('Put back — ' + full.title + ' as it was ' + when);
      }, { label: 'Put it back', danger: false });
    }
  }
  // findWidgetById only looks at the deck this tab is viewing; a snapshot can
  // be of a widget on any deck, so this one searches everywhere.
  function findWidgetAnywhere(id) {
    for (const d of state.decks) {
      for (const scr of d.screens) {
        const hit = scr.widgets.find((x) => x.id === id);
        if (hit) return hit;
      }
    }
    return null;
  }

  /* Whatever the register is saved as, this hands back its text.

     SageDocText reads .csv, .txt, .docx, .xlsx and .pdf here on the device, and
     turns away the two it cannot read — .doc and .xls — with the Save As that
     fixes each. The FileReader below is the fallback for a build without the
     module and for anything it does not claim: a plain read is still worth a
     try before telling a teacher no. */
  function readNameFile(file) {
    const DT = window.SageDocText;
    if (DT && DT.handles(file)) return DT.read(file, { maxChars: 200000 });
    return new Promise((resolve, reject) => {
      if (file.size > 4 * 1024 * 1024) {
        reject(new Error('That file is too big to read here. Copy the names you want and paste them in.'));
        return;
      }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('I couldn’t read that file. A .csv, .xlsx, Word file or plain text all work.'));
      fr.onload = () => resolve({ text: String(fr.result || ''), note: '' });
      fr.readAsText(file);
    });
  }

  /* A register dropped on the window. It has to land in some class, and the
     deck's own is the only sensible guess — so the guess is made out loud: the
     editor opens on that list with the names in it, the count above them and
     Undo paste beside it. Guessing silently would be the version to avoid. */
  function dropNameFile(file) {
    const target = deckDefaultList();
    if (!target) {
      promptDialog('Which class is this?', '', (v) => {
        const made = createList(v);
        if (made) openListManager(() => { if (dashEl) renderDashboard(); }, made, file);
      }, { label: 'Create', placeholder: 'e.g. "Year 4R"' });
      return;
    }
    openListManager(() => { if (dashEl) renderDashboard(); }, target, file);
  }

  // startList opens the editor on a named list. The dashboard's list cards open
  // the same textarea the picker and group maker do, so a register pasted from
  // either place lands one name per line instead of one very long name.
  // dropped is a File to read straight into startList — the way in for a
  // register dragged onto the window.
  function openListManager(onDone, startList, dropped) {
    openModal('Class lists', (body) => {
      let current = (startList && state.lists[startList]) ? startList : Object.keys(state.lists)[0] || null;
      const side = el('div', { class: 'lists-side' });
      const area = el('textarea', { class: 'names-area', placeholder: 'One name per line' });
      const nameRow = el('div', { class: 'row' });

      const pasteRow = el('div', { class: 'row names-paste', style: 'display:none;' });

      const commit = () => {
        if (current && state.lists[current]) {
          state.lists[current] = area.value.split('\n').map((s) => s.trim()).filter(Boolean);
          save();
        }
      };
      area.addEventListener('input', () => { commit(); });

      // A paste is the moment text arrives from somewhere else, and the only
      // moment we are entitled to reshape it. Typing stays as literal as it has
      // always been — reflowing a line while a teacher is halfway through it
      // would be its own kind of broken.
      let lastPaste = null;
      const paintPasteRow = (res) => {
        pasteRow.innerHTML = '';
        if (!res || !lastPaste) { pasteRow.style.display = 'none'; return; }
        pasteRow.style.display = '';
        pasteRow.append(el('span', { class: 'hint' }, nameParseNote(res)));
        if (res.columns) {
          // the offer names the result rather than the rule: "Surname first" is
          // a thing to work out, "Flip to Yusuf Ahmed" is a thing to recognise
          const eg = parseNames(lastPaste.raw, { flip: !lastPaste.flip }).names[0];
          pasteRow.append(el('button', {
            class: 'btn ghost small',
            onclick: () => { lastPaste.flip = !lastPaste.flip; applyPaste(); },
          }, eg ? `Flip to “${eg}”` : 'Flip the name order'));
        }
        pasteRow.append(el('button', {
          class: 'btn ghost small',
          onclick: () => {
            area.value = lastPaste.before;
            lastPaste = null;
            commit(); paintSide(); paintPasteRow(null);
          },
        }, 'Undo paste'));
      };
      const applyPaste = () => {
        const p = lastPaste;
        if (!p) return;
        const head = p.before.slice(0, p.selStart);
        const tail = p.before.slice(p.selEnd);
        // names already in the box count against the paste, so pasting the same
        // register twice does not give you every child twice
        const existing = (head + '\n' + tail).split('\n').map((s) => s.trim()).filter(Boolean);
        const res = parseNames(p.raw, { existing, flip: p.flip });
        const joined = res.names.join('\n');
        // a paste that turns out to be all repeats adds nothing, and should not
        // leave the blank line that joining nothing to a separator would
        area.value = !joined ? head + tail
          : (head && !head.endsWith('\n') ? head + '\n' : head)
            + joined
            + (tail && !tail.startsWith('\n') ? '\n' + tail : tail);
        commit(); paintSide(); paintPasteRow(res);
      };
      // one way in for text from anywhere: the clipboard, or a file. Both get
      // the same reading, the same count, the same flip and the same undo
      const takeText = (raw, selStart, selEnd) => {
        lastPaste = { raw, before: area.value, selStart, selEnd, flip: false };
        applyPaste();
      };
      area.addEventListener('paste', (e) => {
        const cb = e.clipboardData || window.clipboardData;
        const raw = cb && cb.getData('text');
        // a single plain name has no shape to read — let it land as typed
        if (!raw || !/[\n\r\t,]/.test(raw)) return;
        e.preventDefault();
        takeText(raw, area.selectionStart, area.selectionEnd);
      });

      const DT = window.SageDocText;
      const fileIn = el('input', {
        type: 'file', style: 'display:none;',
        accept: (DT && DT.EXT) || '.csv,.tsv,.txt,text/csv,text/plain',
      });
      const openBtn = el('button', {
        class: 'btn go small',
        onclick: () => { if (!openBtn.disabled) fileIn.click(); },
      }, 'Open a file…');
      const importFile = (f) => {
        if (!f) return;
        if (!current) { toast('Make a list first, then open the file into it.'); return; }
        // a forty-page PDF or a big sheet takes a moment, and a button that
        // looks dead is how a teacher ends up opening the file three times
        openBtn.disabled = true;
        openBtn.textContent = 'Reading…';
        const done = () => { openBtn.disabled = false; openBtn.textContent = 'Open a file…'; };
        readNameFile(f).then((res) => {
          done();
          if (res.note) toast(res.note);
          // appended, never replacing: a teacher who opens the wrong file has
          // Undo paste sitting right there, and has lost nothing meanwhile
          takeText(res.text, area.value.length, area.value.length);
        }).catch((err) => {
          done();
          toast((err && err.message) || 'I couldn’t read that file.');
        });
      };
      fileIn.addEventListener('change', () => {
        const f = (fileIn.files || [])[0];
        fileIn.value = '';
        importFile(f);
      });

      const paintSide = () => {
        side.innerHTML = '';
        for (const name of Object.keys(state.lists)) {
          side.append(el('button', {
            class: name === current ? 'active' : '',
            onclick: () => { commit(); current = name; paintSide(); paintArea(); },
          }, `${name} (${state.lists[name].length})`));
        }
        side.append(el('button', {
          style: 'color:var(--accent);',
          onclick: () => {
            promptDialog('New class list name:', '', (v) => {
              const key = createList(v);
              if (!key) return;
              current = key;
              paintSide(); paintArea();
            }, { label: 'Create', placeholder: 'e.g. "Year 4R"' });
          },
        }, '＋ New list'));
      };
      const paintArea = () => {
        area.value = current && state.lists[current] ? state.lists[current].join('\n') : '';
        // with no list selected there is nowhere to commit to, and typing into
        // an enabled box that discards every keystroke reads as a broken app
        area.disabled = !current;
        // the undo and the flip belong to the box they were pasted into; carrying
        // them to another class would undo the wrong register
        lastPaste = null;
        paintPasteRow(null);
        nameRow.innerHTML = '';
        if (current) {
          // one row of actions under the box, read left to right: bring names in,
          // retitle the list, throw it away
          nameRow.append(
            openBtn,
            el('button', {
              class: 'btn warn small',
              onclick: () => {
                promptDialog('Rename class list:', current, (v) => {
                  const key = renameListTo(current, v);
                  if (!key) return;
                  current = key;
                  paintSide(); paintArea();
                }, { label: 'Rename' });
              },
            }, 'Rename'),
            el('button', {
              class: 'btn danger small',
              onclick: () => {
                confirmDialog(`Delete list "${current}"?`, () => {
                  deleteList(current);
                  current = Object.keys(state.lists)[0] || null;
                  paintSide(); paintArea();
                });
              },
            }, 'Delete list'),
          );
        }
      };
      // the file button has moved down to the action row; this row keeps the
      // label on the box, and keeps the hidden input mounted whatever paintArea
      // does to the buttons below
      const srcRow = el('div', { class: 'row names-src' },
        el('span', { class: 'hint' }, 'Paste the names in — one per line'), fileIn);
      paintSide(); paintArea();
      body.append(
        el('div', { class: 'lists-cols' }, side, el('div', {}, srcRow, area, pasteRow, nameRow)),
        el('div', { class: 'hint' }, 'Open your register straight from a spreadsheet (.xlsx or .csv), a Word file or a PDF — or copy the column out of Excel and paste it. Columns, numbering, header rows and repeats are all sorted out for you. Lists are shared by the name picker and group maker on every screen.'),
      );
      // a register dragged onto the window: the list it landed in is on screen,
      // with its count and its undo, before the teacher has to trust anything
      if (dropped) importFile(dropped);
    }, onDone);
  }

  // The file backend can only answer about size and path asynchronously, and the
  // modal builds in one pass, so this returns the element immediately and fills
  // it a tick later. It says something useful in the meantime rather than
  // flashing empty, because a panel that starts blank reads as a panel that is
  // broken.
  function dataFileHint() {
    const box = el('div', { class: 'hint' }, 'Your data is in one file on this computer.');
    SageStorage.fileInfo().then((info) => {
      box.replaceChildren(
        el('div', {}, `Current data size: ~${info.sizeKB} KB. Snapshots are stored separately and don’t count towards this.`),
        el('code', { style: 'display:block;margin-top:6px;word-break:break-all;opacity:.85;' }, info.path),
      );
    }).catch(() => { /* the sentence above is still true */ });
    return box;
  }

  // ---------------------------------------------------------------- help (?)
  // One button that answers three questions a teacher actually has: what am I
  // looking at, how does this thing work, and — the one a school will put in
  // writing — where does the children's data go. The answers are written to be
  // TRUE of this build rather than reassuring in general: every claim below is
  // checkable in this file, and the compliance answers are worded so a teacher
  // can paste them into a DPIA conversation without us having to be in the room.
  //
  // Design: docs/help-system-design.md. Three opt-in layers, nothing always-on:
  // hover the ? for an instant card about the current view; click it for the
  // sheet; "What's this?" arms a pointing mode where hovering or TAPPING any
  // part shows its synopsis. The board is touch — every path works by tap.

  // The registry: one table (help/widgets-data.js) feeds the app AND the help
  // site, so the words can never drift apart. Keyed by data-help attribute
  // value; widget frames carry their type, dock tools their tool id.
  const HELP = {};
  if (window.SAGE_HELP) {
    for (const w of SAGE_HELP.widgets) HELP[w.id] = [w.name, w.blurb];
    for (const [k, v] of Object.entries(SAGE_HELP.chrome)) HELP[k] = v;
  }
  const helpEntryFor = (target) => {
    const keyed = target.closest && target.closest('[data-help]');
    if (keyed && HELP[keyed.dataset.help]) return { el: keyed, entry: HELP[keyed.dataset.help] };
    // coverage degrades to something true, never to silence
    const titled = target.closest && target.closest('[title]');
    if (titled && titled.title) return { el: titled, entry: ['', titled.title] };
    return null;
  };

  // ---- the hover card: summoned by pointing at the ? itself, never else
  let hoverCard = null, hoverTimer = null;
  function hideHoverCard() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    if (hoverCard) { hoverCard.remove(); hoverCard = null; }
  }
  function showHoverCard(anchor) {
    if (helping || document.querySelector('.modal-backdrop')) return;
    hideHoverCard();
    const sc = !dashEl && screen();
    const n = sc && sc.widgets ? sc.widgets.length : 0;
    const where = dashEl ? 'Your decks' : 'A teaching screen — ' + n + (n === 1 ? ' widget' : ' widgets');
    const line = dashEl
      ? 'One deck per class; Start teaching puts a screen on the board. Templates, class lists and the wallpaper live in the tabs.'
      : 'The dock adds widgets; drag to move, corner to resize, ⋮ on a frame for the rest. Everything saves itself.';
    hoverCard = el('div', { class: 'help-hover' },
      el('b', {}, where),
      el('span', {}, line),
      el('i', {}, 'Click for help & your data answers · “What’s this?” points at any tool'));
    document.body.append(hoverCard);
    const r = anchor.getBoundingClientRect();
    hoverCard.style.top = r.bottom + 8 + 'px';
    hoverCard.style.right = Math.max(10, window.innerWidth - r.right) + 'px';
  }
  function wireHelpHover(btn) {
    btn.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showHoverCard(btn), 80);
    });
    btn.addEventListener('mouseleave', hideHoverCard);
    btn.addEventListener('focus', () => showHoverCard(btn));
    btn.addEventListener('blur', hideHoverCard);
    btn.addEventListener('pointerdown', hideHoverCard);
  }

  // ---- "What's this?": the pointing mode
  let helping = false;
  let helpPill = null, helpCard = null;
  function exitWhatsThis() {
    if (!helping) return;
    helping = false;
    document.body.classList.remove('helping');
    if (helpPill) { helpPill.remove(); helpPill = null; }
    if (helpCard) { helpCard.remove(); helpCard = null; }
  }
  function placeHelpCard(near) {
    const r = near.getBoundingClientRect();
    const cw = helpCard.offsetWidth, ch = helpCard.offsetHeight;
    let x = Math.min(Math.max(10, r.left), window.innerWidth - cw - 10);
    let y = r.bottom + 10;
    if (y + ch > window.innerHeight - 10) y = Math.max(10, r.top - ch - 10);
    helpCard.style.left = x + 'px';
    helpCard.style.top = y + 'px';
  }
  function showWhatsThis(target) {
    const hit = helpEntryFor(target);
    if (!hit) { if (helpCard) helpCard.style.display = 'none'; return; }
    if (!helpCard) { helpCard = el('div', { class: 'help-card' }); document.body.append(helpCard); }
    helpCard.style.display = '';
    helpCard.innerHTML = '';
    if (hit.entry[0]) helpCard.append(el('b', {}, hit.entry[0]));
    helpCard.append(el('span', {}, hit.entry[1]));
    placeHelpCard(hit.el);
  }
  function enterWhatsThis() {
    if (helping) return;
    hideHoverCard();
    helping = true;
    document.body.classList.add('helping');
    helpPill = el('div', { class: 'help-pill' },
      el('span', {}, 'Tap anything to see what it does'),
      el('button', { class: 'btn small' }, 'Done'));
    document.body.append(helpPill);
  }
  // The shield: while armed, nothing the teacher points at may ACT — most
  // widgets act on pointerdown, so click-only interception would let a tap
  // drag a rekenrek or, worse, press a danger button. Capture phase, all three.
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    document.addEventListener(type, (e) => {
      if (!helping) return;
      // the two sanctioned exits keep working: the pill and any ? button
      if (e.target.closest && (e.target.closest('.help-pill') || e.target.closest('[data-help="helpBtn"]'))) {
        if (type === 'click') exitWhatsThis();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (type === 'pointerdown') showWhatsThis(e.target);   // tap pins — the board path
    }, { capture: true });
  }
  document.addEventListener('pointermove', (e) => {
    if (!helping || e.pointerType !== 'mouse') return;
    if (e.target.closest && (e.target.closest('.help-card') || e.target.closest('.help-pill'))) return;
    showWhatsThis(e.target);                                  // hover tracks — the laptop path
  }, { capture: true, passive: true });
  function openHelp() {
    const h4 = (t) => el('h4', {}, t);
    const p = (t) => el('p', { class: 'hint', style: 'margin:4px 0 10px;' }, t);
    // the FAQ folds: a teacher glancing mid-lesson sees three headings, a
    // deputy head writing the DPIA opens the one question they were sent to ask
    const faq = (q, ...answers) => {
      const d = el('details', { class: 'help-faq' });
      d.append(el('summary', {}, q), ...answers.map((a) => p(a)));
      return d;
    };
    openModal('Help', (body, finish) => {
      // ---- the two doors out of the sheet: point at things, or the full guide
      body.append(el('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;' },
        el('button', {
          class: 'btn', onclick: () => { finish(); enterWhatsThis(); },
        }, '？ What’s this? — point at anything'),
        el('button', {
          class: 'btn ghost',
          onclick: () => {
            const url = 'https://sagestage.co.uk/';
            if (window.SagePlatform) SagePlatform.openExternal(url);
            else window.open(url, '_blank', 'noopener');
          },
        }, '📖 Open the full guide'),
      ));
      // ---- what you're looking at: this branch is the "notices" part — it
      // reads the app's actual state rather than describing the app in general
      if (dashEl) {
        body.append(h4('You’re looking at: your decks'),
          p('A deck is one class’s set of screens — most teachers keep one deck per class. '
            + 'Open a deck and press Start teaching to put a screen on the board. The tabs along '
            + 'the top hold your saved templates, class name lists, and the dashboard wallpaper.'));
      } else {
        const sc = screen();
        const n = sc && sc.widgets ? sc.widgets.length : 0;
        body.append(h4('You’re looking at: a teaching screen'),
          p('This screen holds ' + n + (n === 1 ? ' widget. ' : ' widgets. ')
            + 'The dock along the bottom adds more — clocks, timers, name pickers, maths and '
            + 'English tools; More, Maths, English and Games hold the full shelves. Drag a widget '
            + 'to move it, drag its corner to resize, and use the ⋮ menu on its frame for '
            + 'duplicate, lock, spotlight and the rest. Everything saves itself as you go; '
            + 'there is no save button to forget.'));
      }

      // ---- the basics: the longer-form support a tester actually needs
      body.append(h4('The basics'),
        p('Decks hold screens; the numbered pill at the bottom (“1 / 3”) switches between them, '
          + 'and clicking it opens the whole deck as a sidebar — rename, reorder, duplicate and '
          + 'send a screen to a second window from there. Widgets keep their exact positions — '
          + 'children navigate the board by memory, so nothing ever rearranges itself.'),
        p('Closed a widget by mistake? Its work is kept: open 💾 and restore it from Recently '
          + 'closed, or from the automatic snapshots underneath. Most widgets with something '
          + 'worth paper have Print… in the More options menu on their frame — an A4 sheet (or '
          + 'a poster over several sheets) of what’s on the board. The squiggle at the end of '
          + 'the dock annotates over everything; press B to fold the dock away, Esc to close '
          + 'panels.'),
        p('If something looks wrong, a reload almost never loses work — the app saves within a '
          + 'second of every change.'));

      // ---- data compliance, in the order schools actually ask
      body.append(h4('Questions schools ask — straight answers'));
      body.append(
        faq('Where does my data live?',
          SageStorage.kind === 'file'
            ? 'Everything is in one file on this computer: Documents/Sage Stage/sage-stage.json. '
              + 'The app keeps two weeks of daily backups beside it, and 💾 can show you the file. '
              + 'Undo history and snapshots live in this app’s own local database, also on this '
              + 'computer.'
            : 'Everything is in this browser, on this computer. Undo history and snapshots live '
              + 'in the browser’s own local database, also on this computer. Clearing the '
              + 'browser’s site data erases it, so export a backup (💾) before deep-cleaning the '
              + 'browser.'),
        faq('Does anything leave this device?',
          'There are no accounts, no server of ours, and no analytics — nothing about you or '
            + 'your class is collected, and there is nothing to hack at our end because there is '
            + 'no “our end”. Even the typefaces ship inside the app.',
          'Three things do use the internet, all of them chosen by you: wallpaper photos if you '
            + 'pick one (they load from Unsplash), template sources you add yourself (they load '
            + 'from your school’s address), and anything you put in the Video or Embed widgets '
            + '(YouTube or the website loads on your screen, as it would in any browser). Your '
            + 'class data rides on none of them. The full guide opens in your browser — a normal '
            + 'web page visit, and only when you click it.'),
        faq('Children’s names?',
          'Class lists stay on this device and reach no one. Printed sheets are designed to '
            + 'carry no child’s name, so a sheet in a book bag discloses nothing about another '
            + 'child. School policy on names still applies to what you type — first names are '
            + 'plenty.'),
        faq('The camera and microphone?',
          'The Webcam widget shows the camera live on your screen (a visualiser); the Noise '
            + 'meter listens only to measure how loud the room is. Nothing is recorded, kept, or '
            + 'sent anywhere — when the widget closes, the camera and microphone are released.'),
        faq('What do I tell the DPO? (GDPR / DPIA)',
          'Sage Stage processes nothing off this device, so your school remains the data '
            + 'controller and no processor relationship with us exists. There is no cloud '
            + 'storage, no account, no tracking, and no data sharing to assess. The honest DPIA '
            + 'note is one line: “local software; personal data never leaves the '
            + 'school-controlled device; erasure is the Erase button or deleting the file.”'),
        faq('Backups, moving machine, erasing',
          '💾 → Export everything makes one JSON file holding the lot — that file is your '
            + 'backup and your removal van; import it on the new machine. Use one machine at a '
            + 'time. 💾 → Danger zone erases everything on this device, including the snapshot '
            + 'history — it says so before it does it, and it means it.'),
      );
    });
  }

  // ---------------------------------------------------------------- data (export / import)
  $('#dataBtn').addEventListener('click', () => {
    openModal('Your data', (body, finish) => {
      // still computed synchronously, so the modal renders in one pass with no
      // async fill-in — the local backend's usageChars() is a plain read
      const usage = Math.round(SageStorage.usageChars() / 1024);
      // The second way back, for the teacher who did not catch the toast —
      // "I closed something on Tuesday" has to have an answer on Thursday.
      const bin = (state.bin || []).filter((b) => b && b.w);
      if (bin.length) {
        const list = el('div', { class: 'bin-list' });
        const paint = () => {
          list.innerHTML = '';
          for (const entry of (state.bin || []).filter((b) => b && b.w)) {
            const days = Math.floor((Date.now() - entry.at) / 864e5);
            list.append(el('div', { class: 'row bin-row' },
              el('span', { class: 'grow' }, entry.title + ' · closed '
                + (days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago')),
              el('button', {
                class: 'btn ghost small',
                onclick: () => { restoreFromBin(entry); paint(); },
              }, 'Put it back')));
          }
          if (!list.children.length) list.append(el('div', { class: 'hint' }, 'Nothing closed recently.'));
        };
        paint();
        body.append(
          el('h3', {}, 'Recently closed'),
          el('div', { class: 'hint' }, 'Closing a widget never throws the work away — anything with writing or pictures in it waits here for 30 days.'),
          list,
          el('hr'));
      }
      // The deeper armour: copies taken automatically, of things the bin never
      // saw. Loaded asynchronously because it lives in IndexedDB, so the panel
      // opens instantly and this section fills in behind it.
      const snapBox = el('div', {});
      body.append(snapBox);
      if (window.SageSnapshots) paintSnapshots(snapBox, finish);

      body.append(
        el('p', {}, SageStorage.kind === 'file'
          ? 'Everything you see lives in one file on this computer — no account, no server, no tracking. Back it up or move it between devices any time:'
          : 'Everything you see lives only in this browser — no account, no server, no tracking. Back it up or move it between devices any time:'),
        el('div', { class: 'row' },
          el('button', {
            class: 'btn',
            onclick: async () => {
              const json = JSON.stringify(state, null, 2);
              const name = 'sage-stage-backup-' + new Date().toISOString().slice(0, 10) + '.json';
              // WKWebView ignores a blob-anchor download, so on the desktop this
              // button did nothing at all — silently, which is the worst way for
              // a backup button to fail. The file backend answers with a real
              // save panel; the browser keeps the anchor it always had.
              if (SageStorage.saveExport) {
                const r = await SageStorage.saveExport(name, json);
                if (r === 'saved') toast('Backup saved');
                return;
              }
              const blob = new Blob([json], { type: 'application/json' });
              const a = el('a', { href: URL.createObjectURL(blob), download: name });
              a.click();
              URL.revokeObjectURL(a.href);
              toast('Backup downloaded');
            },
          }, '⬇ Export everything (JSON)'),
          el('button', {
            class: 'btn ghost',
            onclick: () => {
              const input = el('input', { type: 'file', accept: '.json,application/json' });
              input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const data = JSON.parse(reader.result);
                    if (!data || (!Array.isArray(data.screens) && !Array.isArray(data.decks))) throw new Error('bad file');
                    confirmDialog('Replace everything with this backup?', () => {
                      const next = normalize(data);
                      if (!next) { toast("⚠️ That file doesn't look like a Sage Stage backup."); return; }
                      state = scrubImportedHTML(next);
                      // old backups predate the chrome fields: stamp the rewards
                      // clock before any star lands under weekStart '', and
                      // re-apply the chrome the swapped state describes
                      rewardsDayTick();
                      applyReadingFont(); renderStarPill();
                      save(); renderScreen(); finish();
                      toast('Backup restored');
                    }, { label: 'Replace' });
                  } catch (e) {
                    toast("⚠️ That file doesn't look like a Sage Stage backup.");
                  }
                };
                reader.readAsText(file);
              });
              input.click();
            },
          }, '⬆ Import backup'),
        ),
        // Measured, not assumed: the ceiling is 5MB on some browsers and 50MB
        // on others, so quoting one number was wrong nearly everywhere. This
        // asks the browser whether the data would still fit alongside itself.
        // "Room left" is a localStorage-quota answer. On the desktop the state
        // is a file on a disk with hundreds of gigabytes free, so probing a
        // quota would report a number that means nothing. What a teacher wants
        // there is WHERE it is, so they can back it up, email it, or find it.
        SageStorage.kind === 'file' ? dataFileHint() : el('div', { class: 'hint' },
          `Current data size: ~${usage} KB — room left: `
          + headroomReport(usage * 1024).level
          + '. Pictures use it up fastest; snapshots are stored separately and don’t count towards this.'
          + (window.SAGE_DEMO
            ? ' The desktop app keeps decks in a real file in Documents, with daily backups and no browser limit — it’s on the front page.'
            : '')),
        SageStorage.kind !== 'file' ? null : el('button', {
          class: 'btn ghost small', style: 'align-self:start;',
          onclick: () => SageStorage.revealDataFile(),
        }, '📂 Show the file'),
        !window.SagePptxImport ? null : el('h4', {}, 'Bring in a presentation'),
        !window.SagePptxImport ? null : el('button', {
          class: 'btn ghost', style: 'align-self:start;',
          onclick: () => { finish(); SagePptxImport.openDialog(); },
        }, '⬆ Import PowerPoint (.pptx) as a new deck'),
        el('h4', {}, 'Danger zone'),
        el('button', {
          class: 'btn danger small', style: 'align-self:start;',
          onclick: () => {
            confirmDialog('Erase ALL screens, widgets and class lists on this device?', () => {
              SageStorage.erase();
              dropLocalState();
              finish();
              toast('Everything cleared');
              clearStoredHistory().then((ok) => {
                if (ok) return;
                toast('⚠️ Screens and lists are gone, but the saved snapshot history would not '
                  + 'clear. Try again, or clear this site’s data in your browser settings.', { ms: 12000 });
              });
            }, { label: 'Erase' });
          },
        }, 'Erase all local data'),
      );
    });
  });

  // ---------------------------------------------------------------- fullscreen
  $('#fullscreenBtn').addEventListener('click', () => {
    // Desktop: the element-fullscreen API rejects in this webview (wry never
    // enables it), so ⛶ drives the WINDOW — which is also the mac-native
    // behaviour a teacher expects: its own Space, swipe or ⛶ again to leave.
    if (window.SagePlatform && SagePlatform.toggleFullscreen) {
      SagePlatform.toggleFullscreen().catch(() => toast('Fullscreen not available'));
      return;
    }
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen not available'));
  });

  // ------------------------------------------- external links, desktop only
  // target="_blank" and window.open are dead in the webview, and sanitize.js
  // stamps target="_blank" onto every stored rich-text link — so any anchor
  // that slips through (pptx-imported slides, template content) would be a
  // click that does nothing. One delegate sends them all to the system
  // browser. Browser builds are untouched: middle-click and copy-link keep
  // working there, which is why this is not done per-anchor.
  if (window.SagePlatform) {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;                    // a guarded anchor already handled itself
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;           // in-app anchors (#s=…) stay in-app
      if (a.closest('[contenteditable="true"]')) return; // editors place carets, same as the browser
      e.preventDefault();
      const url = SageSanitize.url(href);
      if (url) SagePlatform.openExternal(url);
    });
  }

  // ---------------------------------------------------------------- drawing overlay
  // Annotations are objects: each stroke is data saved per screen (screen.ink), so
  // ink survives reloads, stays visible outside draw mode, and can be re-selected,
  // recolored, resized, moved, locked or shown on every screen after the fact.
  // Freehand strokes render as quadratic curves through point midpoints, so
  // diagonals come out silky instead of jittery polylines.
  const drawLayer = $('#drawLayer');
  const drawTools = $('#drawTools');
  const inkBoard = document.createElement('canvas'); // committed strokes
  const INK_COLORS = [
    ['#0f172a', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#ffffff'],
    ['#64748b', '#2dd4bf', '#2563eb', '#7c3aed', '#db2777'],
  ];
  const INK_SIZES = [3, 6, 12];
  const ink = { tool: 'pen', shape: 'line', color: '#0f172a', size: 6 };
  let selected = null; // { s, home } — the stroke and the screen that owns it
  let dragState = null;
  let redoInkStack = [];
  // strokes in progress, keyed by pointerId — up to four children can draw at
  // the same time on a multi-touch board; each finger gets its own stroke
  const liveStrokes = new Map();

  function screenInk(sc) {
    if (!Array.isArray(sc.ink)) sc.ink = [];
    return sc.ink;
  }

  // strokes visible on the current screen: its own, then "show on all screens" ink
  function inkRenderList() {
    const cur = screen();
    const list = screenInk(cur).map((s) => ({ s, home: cur }));
    for (const sc of screens()) {
      if (sc === cur) continue;
      for (const s of screenInk(sc)) if (s.everywhere) list.push({ s, home: sc });
    }
    return list;
  }

  const effWidth = (s) => (s.tool === 'highlighter' ? s.size * 2.5 : s.tool === 'eraser' ? s.size * 4 : s.tool === 'text' ? 2 : s.size);

  // unpadded, unrotated extent of a stroke / shape / text object
  function strokeGeom(s) {
    let x0, y0, x1, y1;
    if (s.pts) {
      x0 = x1 = s.pts[0][0]; y0 = y1 = s.pts[0][1];
      for (const [x, y] of s.pts) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    } else if (s.tool === 'text') {
      x0 = s.x; y0 = s.y;
      x1 = s.x + (s.w || 80); y1 = s.y + (s.h || (s.size || 22) * 1.25);
    } else {
      x0 = Math.min(s.x0, s.x1); x1 = Math.max(s.x0, s.x1);
      y0 = Math.min(s.y0, s.y1); y1 = Math.max(s.y0, s.y1);
    }
    return { x0, y0, x1, y1 };
  }

  function strokeBBox(s) {
    const g = strokeGeom(s);
    const p = effWidth(s) / 2 + 6;
    let box = { x0: g.x0 - p, y0: g.y0 - p, x1: g.x1 + p, y1: g.y1 + p };
    if (s.rot) {
      const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
      const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]) {
        const rx = cx + (px - cx) * cos - (py - cy) * sin;
        const ry = cy + (px - cx) * sin + (py - cy) * cos;
        x0 = Math.min(x0, rx); y0 = Math.min(y0, ry);
        x1 = Math.max(x1, rx); y1 = Math.max(y1, ry);
      }
      box = { x0, y0, x1, y1 };
    }
    return box;
  }

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function hitStroke(s, x, y) {
    if (s.tool === 'eraser') return false;
    if (s.rot) {
      // test in the object's unrotated frame
      const g0 = strokeGeom(s);
      const cx = (g0.x0 + g0.x1) / 2, cy = (g0.y0 + g0.y1) / 2;
      const cos = Math.cos(-s.rot), sin = Math.sin(-s.rot);
      const dx = x - cx, dy = y - cy;
      x = cx + dx * cos - dy * sin;
      y = cy + dx * sin + dy * cos;
    }
    const tol = effWidth(s) / 2 + 6;
    if (s.pts) {
      if (s.pts.length === 1) return Math.hypot(x - s.pts[0][0], y - s.pts[0][1]) < tol;
      for (let i = 0; i < s.pts.length - 1; i++) {
        if (segDist(x, y, s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1]) < tol) return true;
      }
      return false;
    }
    const g = strokeGeom(s);
    if (x < g.x0 - tol || x > g.x1 + tol || y < g.y0 - tol || y > g.y1 + tol) return false;
    if (s.tool === 'line' || s.tool === 'arrow') return segDist(x, y, s.x0, s.y0, s.x1, s.y1) < tol;
    return true; // rect / ellipse / triangle / speech / brackets / text: anywhere in the box
  }

  function translateStroke(s, dx, dy) {
    if (s.pts) {
      for (const p of s.pts) { p[0] += dx; p[1] += dy; }
    } else if (s.tool === 'text') {
      s.x += dx; s.y += dy;
    } else {
      s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy;
    }
  }

  function inkCtx(canvas) {
    const c = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function smoothPath(c, pts) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    if (pts.length < 3) {
      for (const p of pts) c.lineTo(p[0], p[1]);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      }
      c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }
    c.stroke();
  }

  function speechPath(c, s) {
    const x = Math.min(s.x0, s.x1), y = Math.min(s.y0, s.y1);
    const bw = Math.abs(s.x1 - s.x0), h = Math.abs(s.y1 - s.y0);
    const bh = h * 0.74; // bubble body; the rest is the tail
    const r = Math.max(0, Math.min(14, bw / 4, bh / 4));
    c.moveTo(x + r, y);
    c.lineTo(x + bw - r, y);
    c.quadraticCurveTo(x + bw, y, x + bw, y + r);
    c.lineTo(x + bw, y + bh - r);
    c.quadraticCurveTo(x + bw, y + bh, x + bw - r, y + bh);
    c.lineTo(x + bw * 0.42, y + bh);
    c.lineTo(x + bw * 0.2, y + h);
    c.lineTo(x + bw * 0.26, y + bh);
    c.lineTo(x + r, y + bh);
    c.quadraticCurveTo(x, y + bh, x, y + bh - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  // brackets/braces mirror with the drag direction: the drag start edge is the
  // spine (bracket) or nub side (brace), the drag end edge holds the arms
  function bracketPath(c, s) {
    const { x0, y0, x1, y1 } = s;
    const vertical = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    if (s.tool === 'bracket') {
      if (vertical) { c.moveTo(x1, y0); c.lineTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); }
      else { c.moveTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1); }
      return;
    }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (vertical) {
      const q = Math.min(Math.abs(y1 - y0) * 0.14, Math.abs(x1 - x0) || 8, 18);
      c.moveTo(x1, y0);
      c.quadraticCurveTo(mx, y0, mx, y0 + q);
      c.lineTo(mx, my - q);
      c.quadraticCurveTo(mx, my, x0, my);
      c.quadraticCurveTo(mx, my, mx, my + q);
      c.lineTo(mx, y1 - q);
      c.quadraticCurveTo(mx, y1, x1, y1);
    } else {
      const q = Math.min(Math.abs(x1 - x0) * 0.14, Math.abs(y1 - y0) || 8, 18);
      c.moveTo(x0, y1);
      c.quadraticCurveTo(x0, my, x0 + q, my);
      c.lineTo(mx - q, my);
      c.quadraticCurveTo(mx, my, mx, y0);
      c.quadraticCurveTo(mx, my, mx + q, my);
      c.lineTo(x1 - q, my);
      c.quadraticCurveTo(x1, my, x1, y1);
    }
  }

  function paintStroke(c, s) {
    c.save();
    if (s.rot) {
      const g = strokeGeom(s);
      const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
      c.translate(cx, cy); c.rotate(s.rot); c.translate(-cx, -cy);
    }
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = s.color;
    c.lineWidth = effWidth(s);
    if (s.tool === 'highlighter') c.globalAlpha = s.alpha || 0.4;
    if (s.tool === 'eraser') c.globalCompositeOperation = 'destination-out';
    if (s.pts) {
      smoothPath(c, s.pts);
    } else if (s.tool === 'text') {
      c.fillStyle = s.color;
      c.font = '600 ' + s.size + 'px ' + sketchFontStack(s.font);
      c.textBaseline = 'top';
      const lh = s.size * 1.25;
      s.text.split('\n').forEach((ln, i) => c.fillText(ln, s.x, s.y + i * lh + (lh - s.size) / 2));
    } else {
      const { x0, y0, x1, y1 } = s;
      c.beginPath();
      if (s.tool === 'rect') c.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      else if (s.tool === 'ellipse') c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      else if (s.tool === 'triangle') {
        c.moveTo((x0 + x1) / 2, Math.min(y0, y1));
        c.lineTo(Math.max(x0, x1), Math.max(y0, y1));
        c.lineTo(Math.min(x0, x1), Math.max(y0, y1));
        c.closePath();
      } else if (s.tool === 'speech') speechPath(c, s);
      else if (s.tool === 'bracket' || s.tool === 'brace') bracketPath(c, s);
      else {
        c.moveTo(x0, y0); c.lineTo(x1, y1);
        if (s.tool === 'arrow') {
          const a = Math.atan2(y1 - y0, x1 - x0);
          const len = Math.max(12, s.size * 3.2);
          for (const off of [-0.5, 0.5]) {
            c.moveTo(x1, y1);
            c.lineTo(x1 - len * Math.cos(a + off), y1 - len * Math.sin(a + off));
          }
        }
      }
      c.stroke();
    }
    c.restore();
  }

  function repaintBoard() {
    const c = inkCtx(inkBoard);
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const { s } of inkRenderList()) paintStroke(c, s);
  }

  function blit() {
    const c = inkCtx(drawLayer);
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (inkBoard.width) c.drawImage(inkBoard, 0, 0);
    c.restore();
    for (const s of liveStrokes.values()) paintStroke(c, s);
    if (selected) {
      const b = strokeBBox(selected.s);
      c.save();
      c.strokeStyle = '#6366f1';
      c.lineWidth = 1.5;
      c.setLineDash([6, 4]);
      c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      c.restore();
    }
  }

  function inkChanged() {
    repaintBoard();
    blit();
    save();
  }

  function undoInk() {
    const arr = screenInk(screen());
    if (!arr.length) return;
    redoInkStack.push(arr.pop());
    deselect();
    inkChanged();
  }
  function redoInk() {
    if (!redoInkStack.length) return;
    screenInk(screen()).push(redoInkStack.pop());
    inkChanged();
  }

  function setInkTool(tool) {
    ink.tool = tool;
    if (tool !== 'select') deselect();
    drawLayer.classList.toggle('selecting', tool === 'select');
    buildDrawTools();
  }

  // the bar can dock to the top (default), bottom (just above the widget
  // dock), left or right screen edge
  function applyDrawToolsPos() {
    const pos = state.inkBarPos || 'top';
    drawTools.classList.toggle('side-left', pos === 'left');
    drawTools.classList.toggle('side-right', pos === 'right');
    drawTools.classList.toggle('side-bottom', pos === 'bottom');
    drawTools.style.left = '';
    drawTools.style.top = '';
    drawTools.style.right = '';
    drawTools.style.bottom = '';
    drawTools.style.transform = '';
  }

  function buildDrawTools() {
    drawTools.innerHTML = '';
    const toolBtn = (id, icon, title) => el('button', {
      class: 'dt-btn' + (ink.tool === id ? ' active' : ''), title,
      'data-help': 'draw:' + (id === 'highlighter' ? 'marker' : id),
      onclick: () => setInkTool(id),
    }, iconEl(icon));

    const grip = el('button', { class: 'dt-btn dt-grip', title: 'Drag to move the bar — dock it top, bottom, left or right' }, iconEl('move'));
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* window listeners track the drag regardless */ }
      drawTools.classList.add('dragging');
      let last = null; // dock by the last dragged-to position, not the release event
      const move = (ev) => {
        if (typeof ev.clientX !== 'number' || Number.isNaN(ev.clientX)) return;
        last = [ev.clientX, ev.clientY];
        drawTools.style.left = ev.clientX + 'px';
        drawTools.style.top = ev.clientY + 'px';
        drawTools.style.right = 'auto';
        // clear the dock's bottom anchor — otherwise top + bottom are both set
        // while dragging a bottom/side-docked bar and it stretches to span them
        drawTools.style.bottom = 'auto';
        drawTools.style.transform = 'translate(-50%, -50%)';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        drawTools.classList.remove('dragging');
        if (last) {
          const [x, y] = last;
          const dLeft = x, dRight = window.innerWidth - x, dTop = y, dBottom = window.innerHeight - y;
          const min = Math.min(dLeft, dRight, dTop, dBottom);
          state.inkBarPos = min === dTop ? 'top' : min === dBottom ? 'bottom' : min === dLeft ? 'left' : 'right';
        }
        applyDrawToolsPos();
        save();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    const shapeBtn = el('button', {
      class: 'dt-btn' + (['line', 'arrow', 'rect', 'ellipse'].includes(ink.tool) ? ' active' : ''), title: 'Shapes & lines (L)', 'data-help': 'draw:shapes',
      onclick: () => {
        // only OUR pop toggles closed; a different pop (geometry's) is in the
        // way, not a reason to show nothing — swallowing the first click here
        // made Shapes→Geometry always take two taps
        const pop = $('.dt-pop', drawTools);
        const mine = pop && !pop.classList.contains('dt-pop-geo');
        if (pop) pop.remove();
        if (mine) return;
        drawTools.append(el('div', { class: 'dt-pop dt-pop-shapes' },
          [['line', 'linetool', 'Line'], ['arrow', 'arrowtool', 'Arrow'], ['rect', 'recttool', 'Rectangle'], ['ellipse', 'elltool', 'Ellipse']]
            .map(([id, icon, title]) => el('button', {
              class: 'dt-btn' + (ink.tool === id ? ' active' : ''), title,
              onclick: () => { ink.shape = id; setInkTool(id); },
            }, iconEl(icon)))));
      },
    }, iconEl('shapes'));

    const geoActive = !!geo;
    const geoBtn = el('button', {
      class: 'dt-btn' + (geoActive ? ' active' : ''), title: 'Geometry tools — ruler, protractor, set square', 'data-help': 'draw:geometry',
      onclick: () => {
        // same courtesy in the other direction: close whatever is open, but
        // only skip opening if the open pop was our own
        const pop = $('.dt-pop', drawTools);
        const mine = pop && pop.classList.contains('dt-pop-geo');
        if (pop) pop.remove();
        if (mine) return;
        const items = [
          ['ruler', 'ruler', 'Ruler'],
          ['protractor', 'protractor', 'Protractor (360°)'],
          ['protractor180', 'protractor180', '180° protractor'],
          ['setsquare', 'setsquare', 'Set square'],
        ];
        drawTools.append(el('div', { class: 'dt-pop dt-pop-geo' },
          ...items.map(([id, icon, title]) => el('button', {
            class: 'dt-btn' + (geo && geo.kind === id ? ' active' : ''), title,
            onclick: () => { const p = $('.dt-pop', drawTools); if (p) p.remove(); activateGeoTool(id); },
          }, iconEl(icon))),
          el('span', { class: 'dt-sep' }),
          el('button', {
            class: 'dt-btn', title: 'Geometry settings & snapping',
            onclick: () => { const p = $('.dt-pop', drawTools); if (p) p.remove(); toggleGeoSettings(); },
          }, iconEl('gear')),
        ));
      },
    }, iconEl('geotools'));

    const swatches = el('div', { class: 'dt-swatches' });
    for (const row of INK_COLORS) {
      const r = el('div', { class: 'dt-swatch-row' });
      for (const c of row) {
        r.append(el('button', {
          class: 'dt-swatch' + (ink.color === c ? ' active' : ''),
          style: 'background:' + c + ';',
          onclick: () => { ink.color = c; if (ink.tool === 'eraser') ink.tool = 'pen'; buildDrawTools(); },
        }));
      }
      swatches.append(r);
    }
    const customInput = el('input', {
      type: 'color', value: ink.color, style: 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;',
      oninput: (e) => { ink.color = e.target.value; if (ink.tool === 'eraser') ink.tool = 'pen'; buildDrawTools(); },
    });
    swatches.lastChild.append(el('button', { class: 'dt-swatch dt-rainbow', title: 'Custom color', onclick: () => customInput.click() }), customInput);

    const sizes = el('div', { class: 'dt-sizes' },
      INK_SIZES.map((s) => el('button', {
        class: 'dt-size' + (ink.size === s ? ' active' : ''), title: s + ' px',
        onclick: () => { ink.size = s; buildDrawTools(); },
      }, el('span', { style: `width:${4 + s}px;height:${4 + s}px;` }))));

    drawTools.append(
      grip,
      toolBtn('select', 'pointer', 'Select & edit (V)'),
      toolBtn('pen', 'draw', 'Pen (P)'),
      toolBtn('highlighter', 'marker', 'Marker (M)'),
      shapeBtn,
      toolBtn('eraser', 'eraser', 'Eraser (E)'),
      geoBtn,
      el('span', { class: 'dt-sep' }),
      swatches,
      el('span', { class: 'dt-sep' }),
      sizes,
      el('span', { class: 'dt-sep' }),
      el('button', { class: 'dt-btn', title: 'Undo (⌘Z)', 'data-help': 'draw:undo', onclick: () => undoInk() }, iconEl('undo')),
      el('button', { class: 'dt-btn', title: 'Redo (⌘⇧Z)', 'data-help': 'draw:redo', onclick: () => redoInk() }, iconEl('redo')),
      el('button', {
        class: 'dt-btn', title: 'Clear all ink on this screen', 'data-help': 'draw:clear',
        onclick: () => {
          const arr = screenInk(screen());
          const doClear = () => { arr.length = 0; deselect(); inkChanged(); };
          if (!arr.length) doClear();
          else confirmDialog('Clear all annotations on this screen?', doClear, { label: 'Clear' });
        },
      }, iconEl('trash')),
      el('button', { class: 'dt-btn dt-done', title: 'Stop drawing (Esc)', onclick: () => toggleDraw() }, iconEl('close')),
    );
  }

  function sizeDrawLayer() {
    const dpr = window.devicePixelRatio || 1;
    for (const cv of [drawLayer, inkBoard]) {
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
    }
    drawLayer.style.width = window.innerWidth + 'px';
    drawLayer.style.height = window.innerHeight + 'px';
    repaintBoard();
    blit();
  }

  function toggleDraw() {
    const active = !drawLayer.classList.contains('active');
    drawLayer.classList.toggle('active', active);
    drawLayer.classList.toggle('selecting', active && ink.tool === 'select');
    drawTools.classList.toggle('active', active);
    if (active) { sizeDrawLayer(); applyDrawToolsPos(); buildDrawTools(); closePanels(); } else { deselect(); clearGeo(); }
    if (miniDock) renderMiniDock();
    renderToolbar(); // keeps the dock's annotate switcher showing the right state
  }

  // called by renderScreen: repaint the new screen's ink, drop selection/redo
  function refreshInk() {
    redoInkStack = [];
    selected = null;
    dragState = null;
    liveStrokes.clear();
    if (selBar) { selBar.remove(); selBar = null; }
    sizeDrawLayer();
  }

  // ---- selection mini toolbar ----
  let selBar = null;
  function deselect() {
    selected = null;
    dragState = null;
    if (selBar) { selBar.remove(); selBar = null; }
    blit();
  }

  function removeSelected() {
    if (!selected) return;
    const arr = screenInk(selected.home);
    const i = arr.indexOf(selected.s);
    if (i >= 0) arr.splice(i, 1);
    deselect();
    inkChanged();
  }

  function updateSelBar() {
    if (selBar) { selBar.remove(); selBar = null; }
    if (!selected) return;
    const s = selected.s;
    let pop = null;
    const closePop = () => { if (pop) { pop.remove(); pop = null; } };
    const openPop = (kind, builder) => {
      if (pop && pop.dataset.kind === kind) { closePop(); return; }
      closePop();
      pop = el('div', { class: 'dt-pop sel-pop' });
      pop.dataset.kind = kind;
      builder(pop);
      selBar.append(pop);
    };

    const colorBtn = el('button', {
      class: 'dt-btn', title: 'Color',
      onclick: () => openPop('color', (p) => {
        p.classList.add('sel-colors');
        for (const c of INK_COLORS.flat()) {
          p.append(el('button', {
            class: 'dt-swatch' + (s.color === c ? ' active' : ''), style: 'background:' + c,
            onclick: () => { s.color = c; inkChanged(); updateSelBar(); },
          }));
        }
        const inp = el('input', {
          type: 'color', value: s.color, style: 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;',
          oninput: (e) => { s.color = e.target.value; inkChanged(); },
        });
        p.append(el('button', { class: 'dt-swatch dt-rainbow', title: 'Custom color', onclick: () => inp.click() }), inp);
      }),
    }, el('span', { class: 'sel-dot', style: 'background:' + s.color }));

    const sizeBtn = el('button', {
      class: 'dt-btn', title: 'Stroke size',
      onclick: () => openPop('size', (p) => {
        for (const z of INK_SIZES) {
          p.append(el('button', {
            class: 'dt-size' + (s.size === z ? ' active' : ''), title: z + ' px',
            onclick: () => { s.size = z; inkChanged(); updateSelBar(); },
          }, el('span', { style: `width:${4 + z}px;height:${4 + z}px;` })));
        }
      }),
    }, iconEl('list'));

    const menuBtn = el('button', {
      class: 'dt-btn', title: 'More',
      onclick: () => openPop('menu', (p) => {
        p.classList.add('sel-menu');
        const item = (icon, label, fn) => el('button', { class: 'deck-menu-item', onclick: () => { closePop(); fn(); } }, iconEl(icon), label);
        p.append(
          item('trash', 'Remove', () => removeSelected()),
          item('copy', 'Copy drawing', () => {
            const c = JSON.parse(JSON.stringify(s));
            c.everywhere = false;
            translateStroke(c, 24, 24);
            screenInk(screen()).push(c);
            selected = { s: c, home: screen() };
            inkChanged();
            updateSelBar();
          }),
          item('lock', s.locked ? 'Unlock' : 'Lock in position', () => { s.locked = !s.locked; save(); updateSelBar(); }),
          item('pin', s.everywhere ? 'Only on this screen' : 'Show in all screens', () => { s.everywhere = !s.everywhere; inkChanged(); }),
          item('tofront', 'Bring to front', () => {
            const arr = screenInk(selected.home);
            const i = arr.indexOf(s);
            if (i >= 0) { arr.splice(i, 1); arr.push(s); inkChanged(); }
          }),
          item('toback', 'Send to back', () => {
            const arr = screenInk(selected.home);
            const i = arr.indexOf(s);
            if (i >= 0) { arr.splice(i, 1); arr.unshift(s); inkChanged(); }
          }),
        );
      }),
    }, iconEl('dots'));

    selBar = el('div', { class: 'sel-bar' },
      colorBtn, sizeBtn,
      el('span', { class: 'dt-sep' }),
      el('button', { class: 'dt-btn', title: 'Remove (Delete)', onclick: () => removeSelected() }, iconEl('trash')),
      menuBtn,
    );
    const b = strokeBBox(s);
    selBar.style.left = clamp(b.x1 - 170, 8, window.innerWidth - 190) + 'px';
    selBar.style.top = clamp(b.y0 - 56, 8, window.innerHeight - 60) + 'px';
    document.body.append(selBar);
  }

  // ---- pointer input ----
  // each active pointer draws its own stroke (see liveStrokes), so several
  // children can pen/marker/erase simultaneously; selection stays one-finger
  const MAX_TOUCH_STROKES = 4;
  let blitQueued = false;
  const queueBlit = () => {
    if (blitQueued) return;
    blitQueued = true;
    requestAnimationFrame(() => { blitQueued = false; blit(); });
  };

  let palmToastShown = false;
  drawLayer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { drawLayer.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone — stroke tracking works regardless */ }
    const pop = $('.dt-pop', drawTools);
    if (pop) pop.remove();
    // a wide touch contact (palm / side of the fist) erases, whatever tool is active
    const contact = e.pointerType === 'touch' ? Math.max(e.width || 0, e.height || 0) : 0;
    if (contact >= 35) {
      if (liveStrokes.size >= MAX_TOUCH_STROKES) return;
      liveStrokes.set(e.pointerId, { tool: 'eraser', color: ink.color, size: Math.max(ink.size, Math.round(contact / 4)), pts: [[e.clientX, e.clientY]] });
      if (!palmToastShown) {
        palmToastShown = true;
        toast('✋ Palm eraser — rub the screen with the side of your hand to erase');
      }
      return;
    }
    if (ink.tool === 'select') {
      if (!e.isPrimary || liveStrokes.size) return;
      const hit = inkRenderList().reverse().find(({ s }) => hitStroke(s, e.clientX, e.clientY)) || null;
      selected = hit;
      dragState = hit && !hit.s.locked ? { x: e.clientX, y: e.clientY, moved: false } : null;
      blit();
      updateSelBar();
      return;
    }
    if (liveStrokes.size >= MAX_TOUCH_STROKES) return;
    const freehand = ['pen', 'highlighter', 'eraser'].includes(ink.tool);
    liveStrokes.set(e.pointerId, freehand
      ? { tool: ink.tool, color: ink.color, size: ink.size, pts: [[e.clientX, e.clientY]] }
      : { tool: ink.tool, color: ink.color, size: ink.size, x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
  });
  drawLayer.addEventListener('pointermove', (e) => {
    if (dragState && selected && e.isPrimary) {
      const dx = e.clientX - dragState.x, dy = e.clientY - dragState.y;
      if (!dragState.moved && Math.hypot(dx, dy) < 3) return;
      dragState.moved = true;
      if (selBar) { selBar.remove(); selBar = null; } // re-shown on release
      translateStroke(selected.s, dx, dy);
      dragState.x = e.clientX;
      dragState.y = e.clientY;
      repaintBoard();
      queueBlit();
      return;
    }
    const s = liveStrokes.get(e.pointerId);
    if (!s) return;
    if (s.pts) {
      // coalesced events give the full-rate pointer trail on high-Hz screens
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of (coalesced.length ? coalesced : [e])) {
        const last = s.pts[s.pts.length - 1];
        if (Math.hypot(ev.clientX - last[0], ev.clientY - last[1]) < 1.5) continue;
        s.pts.push([ev.clientX, ev.clientY]);
      }
    } else {
      s.x1 = e.clientX;
      s.y1 = e.clientY;
    }
    queueBlit();
  });
  const roundStroke = (s) => {
    if (s.pts) s.pts = s.pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
    else { s.x0 = Math.round(s.x0); s.y0 = Math.round(s.y0); s.x1 = Math.round(s.x1); s.y1 = Math.round(s.y1); }
    return s;
  };
  const finishStroke = (e) => {
    if (dragState && e.isPrimary) {
      if (dragState.moved && selected) { roundStroke(selected.s); save(); }
      dragState = null;
      updateSelBar();
      return;
    }
    const s = liveStrokes.get(e.pointerId);
    if (!s) return;
    liveStrokes.delete(e.pointerId);
    // a shape needs some extent; a bare click with the pen still leaves a dot
    if (s.pts || Math.hypot(s.x1 - s.x0, s.y1 - s.y0) >= 3) {
      screenInk(screen()).push(roundStroke(s));
      redoInkStack = [];
      paintStroke(inkCtx(inkBoard), s);
      save();
    }
    blit();
  };
  drawLayer.addEventListener('pointerup', finishStroke);
  drawLayer.addEventListener('pointercancel', (e) => {
    liveStrokes.delete(e.pointerId);
    if (e.isPrimary) dragState = null;
    blit();
  });
  window.addEventListener('resize', () => sizeDrawLayer());

  // ================================================================
  // Geometry tools — ruler, protractor (full + 180°) and set square.
  // These are transient on-screen instruments (not saved as ink): one
  // finger drags them, two fingers rotate/scale, and dragging along a
  // working edge rules a straight ink line with its angle labelled. The
  // lines they produce are normal ink strokes, so they undo/redo, select
  // and save like anything else drawn by hand.
  // ================================================================
  const DEG = 180 / Math.PI;
  const normDeg = (d) => ((d % 360) + 360) % 360;
  const rotPt = (cx, cy, rot, lx, ly) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [cx + lx * c - ly * s, cy + lx * s + ly * c];
  };

  const geoLayer = el('div', { id: 'geoLayer' });
  const SVGNS = 'http://www.w3.org/2000/svg';
  const mkSvg = () => document.createElementNS(SVGNS, 'svg');
  const geoGridSvg = mkSvg();   // faint board grid / snap guides
  const geoInstr = mkSvg();     // the instrument itself (interactive)
  const geoPreview = mkSvg();   // the line being ruled + its angle label
  geoLayer.append(geoGridSvg, geoInstr, geoPreview);
  document.body.append(geoLayer);

  let geo = null;               // active instrument, or null
  let geoDeg = 0;               // geo.rot in degrees, cached for renders
  let geoPanel = null;          // right-hand settings drawer
  let geoDraw = null;           // a line/ray being ruled right now
  let geoGesture = null;        // active move/rotate/resize gesture
  const geoPointers = new Map();
  let geoWinBound = false;

  function geoSettings() {
    if (!state.geoSettings) state.geoSettings = { snapAngle: true, snapGrid: false, snapEdges: true, grid: 40, square: '45' };
    return state.geoSettings;
  }

  function makeGeo(kind) {
    const W = window.innerWidth, H = window.innerHeight, m = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    if (kind === 'ruler') return { kind, cx, cy, rot: 0, len: Math.min(620, W * 0.62), h: 72 };
    if (kind === 'protractor') return { kind, cx, cy, rot: 0, r: Math.min(240, m * 0.34) };
    if (kind === 'protractor180') return { kind, cx, cy: cy + Math.min(120, H * 0.16), rot: 0, r: Math.min(260, m * 0.38) };
    return { kind, cx, cy, rot: 0, size: Math.min(380, m * 0.5), variant: geoSettings().square };
  }

  const geoSizeKey = () => (geo.kind === 'ruler' ? 'len' : geo.kind === 'setsquare' ? 'size' : 'r');
  function clampGeoSize(v) {
    const W = window.innerWidth, H = window.innerHeight, m = Math.min(W, H);
    if (geo.kind === 'ruler') return clamp(v, 220, W * 0.98);
    if (geo.kind === 'setsquare') return clamp(v, 150, m * 0.8);
    return clamp(v, 90, m * 0.5);
  }
  const geoSizeParam = () => geo[geoSizeKey()];
  const setGeoSizeParam = (v) => { geo[geoSizeKey()] = clampGeoSize(v); };

  // right triangle vertices in local coords, centred on the centroid so the
  // whole tool rotates and scales about its middle
  function setSquareVerts() {
    const S = geo.size;
    const V0 = [0, 0];
    let V1, V2;
    if ((geo.variant || '45') === '30') { V1 = [S, 0]; V2 = [0, S / Math.sqrt(3)]; }
    else { V1 = [S, 0]; V2 = [0, S]; }
    const gx = (V0[0] + V1[0] + V2[0]) / 3, gy = (V0[1] + V1[1] + V2[1]) / 3;
    return [[V0[0] - gx, V0[1] - gy], [V1[0] - gx, V1[1] - gy], [V2[0] - gx, V2[1] - gy]];
  }

  // drawing edges, in local coords, for the straightedge tools
  function localEdges() {
    if (geo.kind === 'ruler') {
      const L = geo.len, h = geo.h;
      return [[[-L / 2, h / 2], [L / 2, h / 2]], [[-L / 2, -h / 2], [L / 2, -h / 2]]];
    }
    if (geo.kind === 'setsquare') {
      const v = setSquareVerts();
      return [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]];
    }
    return [];
  }
  const edgeScreen = (i) => {
    const e = localEdges()[i];
    return [rotPt(geo.cx, geo.cy, geo.rot, e[0][0], e[0][1]), rotPt(geo.cx, geo.cy, geo.rot, e[1][0], e[1][1])];
  };
  const projectPoint = (A, B, Q) => {
    const ux = B[0] - A[0], uy = B[1] - A[1];
    const L2 = ux * ux + uy * uy || 1;
    const t = ((Q[0] - A[0]) * ux + (Q[1] - A[1]) * uy) / L2;
    return [A[0] + t * ux, A[1] + t * uy];
  };

  const snapRot = (r) => (geoSettings().snapAngle ? Math.round(r / (Math.PI / 12)) * (Math.PI / 12) : r);
  function snapCenter(x, y) {
    const s = geoSettings(), W = window.innerWidth, H = window.innerHeight, T = 16;
    if (s.snapEdges) {
      for (const v of [0, W / 2, W]) if (Math.abs(x - v) < T) x = v;
      for (const v of [0, H / 2, H]) if (Math.abs(y - v) < T) y = v;
    }
    if (s.snapGrid) {
      const g = s.grid || 40, gx = Math.round(x / g) * g, gy = Math.round(y / g) * g;
      if (Math.abs(x - gx) < T) x = gx;
      if (Math.abs(y - gy) < T) y = gy;
    }
    return [x, y];
  }

  // the standard-position inclination (0–180°) of the ruler's long axis, so the
  // tilt readout matches the label on any line ruled along its edge
  const foldTilt = (rot) => { let d = normDeg(-rot * DEG); if (d >= 180) d -= 180; return d; };
  function lineAngleLabel(ax, ay, bx, by) {
    let a = normDeg(Math.atan2(-(by - ay), bx - ax) * DEG);
    if (a >= 180) a -= 180;
    return Math.round(a) + '°';
  }
  function rayReading(end) {
    const rayM = normDeg(Math.atan2(-(end[1] - geo.cy), end[0] - geo.cx) * DEG);
    const baseM = normDeg(-geo.rot * DEG);
    let read = normDeg(rayM - baseM);
    if (geo.kind === 'protractor180' && read > 180) read = 360 - read;
    return read;
  }

  // ---- sizing ----
  function sizeGeoSvgs() {
    const W = window.innerWidth, H = window.innerHeight;
    for (const sv of [geoGridSvg, geoInstr, geoPreview]) {
      sv.setAttribute('width', W);
      sv.setAttribute('height', H);
      sv.setAttribute('viewBox', `0 0 ${W} ${H}`);
    }
  }

  function renderGrid() {
    if (!geo || !geoSettings().snapGrid) { geoGridSvg.innerHTML = ''; return; }
    sizeGeoSvgs();
    const g = geoSettings().grid || 40, W = window.innerWidth, H = window.innerHeight;
    let s = '';
    for (let x = 0; x <= W; x += g) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(15,118,110,0.10)" stroke-width="1"/>`;
    for (let y = 0; y <= H; y += g) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(15,118,110,0.10)" stroke-width="1"/>`;
    s += `<line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="rgba(15,118,110,0.22)" stroke-width="1"/>`;
    s += `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="rgba(15,118,110,0.22)" stroke-width="1"/>`;
    geoGridSvg.innerHTML = s;
  }

  // ---- instrument renderers (all in local coords; the wrapping <g> rotates) ----
  const HIT = 'style="pointer-events:all"';
  const rotateHandle = (hx, hy, fromx, fromy) =>
    `<line x1="${fromx}" y1="${fromy}" x2="${hx}" y2="${hy}" stroke="rgba(15,118,110,0.45)" stroke-width="1.5"/>` +
    `<circle cx="${hx}" cy="${hy}" r="12" fill="#0f766e" data-role="rotate" ${HIT} style="pointer-events:all;cursor:grab"/>` +
    `<g transform="rotate(${-geoDeg} ${hx} ${hy})"><path d="M ${hx - 5} ${hy - 1} a 5 5 0 1 1 1.6 3.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M ${hx - 5.4} ${hy - 4} l 0.4 3 l 3 -0.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const closeHandle = (hx, hy) =>
    `<circle cx="${hx}" cy="${hy}" r="12" fill="#ef4444" data-role="close" ${HIT} style="pointer-events:all;cursor:pointer"/>` +
    `<g transform="rotate(${-geoDeg} ${hx} ${hy})"><path d="M ${hx - 4} ${hy - 4} L ${hx + 4} ${hy + 4} M ${hx + 4} ${hy - 4} L ${hx - 4} ${hy + 4}" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></g>`;
  const uprightText = (x, y, txt, extra) =>
    `<g transform="rotate(${-geoDeg} ${x} ${y})"><text x="${x}" y="${y}" text-anchor="middle" ${extra || ''}>${txt}</text></g>`;

  function renderRuler() {
    const L = geo.len, h = geo.h, x0 = -L / 2, x1 = L / 2, y1 = h / 2;
    let s = `<rect x="${x0}" y="${-h / 2}" width="${L}" height="${h}" rx="10" fill="rgba(204,251,241,0.55)" stroke="rgba(15,118,110,0.9)" stroke-width="1.5" data-role="body" ${HIT} style="pointer-events:all;cursor:move"/>`;
    // ruling edge highlighted along the bottom
    s += `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="#0f766e" stroke-width="2.5"/>`;
    // tick marks along the bottom edge
    const step = 10, n = Math.floor(L / step);
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * step, major = i % 5 === 0, th = major ? 13 : 7;
      s += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y1 - th}" stroke="rgba(17,24,39,0.55)" stroke-width="1"/>`;
      if (i % 10 === 0) s += uprightText(x, y1 - 18, i / 10, 'font-size="10" fill="rgba(17,24,39,0.7)"');
    }
    // centre protractor: a semicircle scale + a level line that stays horizontal
    const Rp = 50;
    s += `<path d="M ${-Rp} 0 A ${Rp} ${Rp} 0 0 1 ${Rp} 0" fill="rgba(255,255,255,0.7)" stroke="rgba(15,118,110,0.6)" stroke-width="1"/>`;
    for (let d = 0; d <= 180; d += 10) {
      const a = Math.PI * d / 180, tl = d % 30 === 0 ? 10 : 5;
      const px = Rp * Math.cos(a), py = -Rp * Math.sin(a), qx = (Rp - tl) * Math.cos(a), qy = -(Rp - tl) * Math.sin(a);
      s += `<line x1="${px}" y1="${py}" x2="${qx}" y2="${qy}" stroke="rgba(17,24,39,0.5)" stroke-width="1"/>`;
      if (d % 30 === 0) { const rx = (Rp - 19) * Math.cos(a), ry = -(Rp - 19) * Math.sin(a); s += uprightText(rx, ry + 3, 180 - d, 'font-size="9" fill="rgba(17,24,39,0.65)"'); }
    }
    s += `<g transform="rotate(${-geoDeg})"><line x1="${-Rp - 7}" y1="0" x2="${Rp + 7}" y2="0" stroke="#dc2626" stroke-width="1.5"/></g>`;
    s += `<circle cx="0" cy="0" r="2.5" fill="#0f172a"/>`;
    s += uprightText(0, -Rp - 12, foldTilt(geo.rot) + '°', 'font-size="13" font-weight="700" fill="#0f766e"');
    // invisible fat hit-lines over both long edges (top of stack = edge wins over body)
    localEdges().forEach((e, i) => {
      s += `<line x1="${e[0][0]}" y1="${e[0][1]}" x2="${e[1][0]}" y2="${e[1][1]}" stroke="transparent" stroke-width="26" data-role="draw" data-edge="${i}" ${HIT} style="pointer-events:all;cursor:crosshair"/>`;
    });
    s += rotateHandle(x1 + 32, 0, x1, 0);
    s += closeHandle(x1 - 4, -h / 2 - 20);
    return s;
  }

  function protMarks(span, r) {
    let m = '';
    for (let d = 0; d <= span; d += 5) {
      if (span === 360 && d === 360) break;
      const a = Math.PI * d / 180, major = d % 30 === 0, tl = major ? 15 : (d % 10 === 0 ? 10 : 6);
      const px = r * Math.cos(a), py = -r * Math.sin(a), qx = (r - tl) * Math.cos(a), qy = -(r - tl) * Math.sin(a);
      m += `<line x1="${px}" y1="${py}" x2="${qx}" y2="${qy}" stroke="rgba(17,24,39,0.5)" stroke-width="1"/>`;
      if (major) { const rx = (r - 27) * Math.cos(a), ry = -(r - 27) * Math.sin(a); m += uprightText(rx, ry + 3, d, 'font-size="11" fill="rgba(17,24,39,0.75)"'); }
    }
    return m;
  }

  function renderProtractor(span) {
    const r = geo.r;
    let s;
    if (span === 360) {
      s = `<circle cx="0" cy="0" r="${r}" fill="rgba(204,251,241,0.35)" stroke="rgba(15,118,110,0.9)" stroke-width="1.5" data-role="body" ${HIT} style="pointer-events:all;cursor:move"/>`;
    } else {
      s = `<path d="M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z" fill="rgba(204,251,241,0.35)" stroke="rgba(15,118,110,0.9)" stroke-width="1.5" data-role="body" ${HIT} style="pointer-events:all;cursor:move"/>`;
      s += `<line x1="${-r}" y1="0" x2="${r}" y2="0" stroke="rgba(15,118,110,0.85)" stroke-width="2"/>`;
    }
    // fat transparent rim band for drawing angle rays
    if (span === 360) s += `<circle cx="0" cy="0" r="${r - 4}" fill="none" stroke="transparent" stroke-width="40" data-role="rim" ${HIT} style="pointer-events:all;cursor:crosshair"/>`;
    else s += `<path d="M ${-(r - 4)} 0 A ${r - 4} ${r - 4} 0 0 1 ${r - 4} 0" fill="none" stroke="transparent" stroke-width="40" data-role="rim" ${HIT} style="pointer-events:all;cursor:crosshair"/>`;
    s += protMarks(span, r);
    // baseline (0°) accent + crosshair + centre
    s += `<line x1="0" y1="0" x2="${r}" y2="0" stroke="#0f766e" stroke-width="2"/>`;
    if (span === 360) s += `<line x1="${-r}" y1="0" x2="0" y2="0" stroke="rgba(15,118,110,0.4)" stroke-width="1"/><line x1="0" y1="${-r}" x2="0" y2="${r}" stroke="rgba(15,118,110,0.4)" stroke-width="1"/>`;
    s += `<circle cx="0" cy="0" r="4" fill="#0f172a"/>`;
    s += rotateHandle(0, -(r + 30), 0, -r);
    s += closeHandle(span === 360 ? r * 0.72 : r - 12, span === 360 ? -r * 0.72 : -14);
    return s;
  }

  function renderSetSquare() {
    const v = setSquareVerts();
    const pts = v.map((p) => `${p[0]},${p[1]}`).join(' ');
    let s = `<polygon points="${pts}" fill="rgba(204,251,241,0.4)" stroke="rgba(15,118,110,0.9)" stroke-width="1.5" data-role="body" ${HIT} style="pointer-events:all;cursor:move"/>`;
    // right-angle mark at V0
    const [a, b, c] = v;
    const ua = [(b[0] - a[0]), (b[1] - a[1])], uc = [(c[0] - a[0]), (c[1] - a[1])];
    const la = Math.hypot(ua[0], ua[1]) || 1, lc = Math.hypot(uc[0], uc[1]) || 1, m = 16;
    const p1 = [a[0] + ua[0] / la * m, a[1] + ua[1] / la * m];
    const p2 = [p1[0] + uc[0] / lc * m, p1[1] + uc[1] / lc * m];
    const p3 = [a[0] + uc[0] / lc * m, a[1] + uc[1] / lc * m];
    s += `<path d="M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]}" fill="none" stroke="rgba(15,118,110,0.7)" stroke-width="1.2"/>`;
    // per-edge angle labels, sitting at each edge midpoint
    localEdges().forEach((e) => {
      const A = rotPt(geo.cx, geo.cy, geo.rot, e[0][0], e[0][1]);
      const B = rotPt(geo.cx, geo.cy, geo.rot, e[1][0], e[1][1]);
      const mx = (e[0][0] + e[1][0]) / 2, my = (e[0][1] + e[1][1]) / 2;
      s += uprightText(mx, my, lineAngleLabel(A[0], A[1], B[0], B[1]), 'font-size="12" font-weight="700" fill="#0f766e"');
    });
    // fat transparent hit-lines over each edge
    localEdges().forEach((e, i) => {
      s += `<line x1="${e[0][0]}" y1="${e[0][1]}" x2="${e[1][0]}" y2="${e[1][1]}" stroke="transparent" stroke-width="26" data-role="draw" data-edge="${i}" ${HIT} style="pointer-events:all;cursor:crosshair"/>`;
    });
    // resize handle at the far base corner (V1), rotate handle out past V0
    s += `<circle cx="${b[0]}" cy="${b[1]}" r="11" fill="#fff" stroke="#0f766e" stroke-width="2" data-role="resize" ${HIT} style="pointer-events:all;cursor:nwse-resize"/>`;
    s += `<g transform="rotate(${-geoDeg} ${b[0]} ${b[1]})"><path d="M ${b[0] - 4} ${b[1] - 4} L ${b[0] + 4} ${b[1] + 4} M ${b[0] + 4} ${b[1] + 4} l -4 0 m 4 0 l 0 -4" stroke="#0f766e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    const rot = [a[0] - 34, a[1] - 34];
    s += rotateHandle(rot[0], rot[1], a[0], a[1]);
    s += closeHandle(c[0] - 2, c[1] + 20);
    return s;
  }

  function renderGeo() {
    if (!geo) { geoInstr.innerHTML = ''; return; }
    sizeGeoSvgs();
    geoDeg = geo.rot * DEG;
    let inner = '';
    if (geo.kind === 'ruler') inner = renderRuler();
    else if (geo.kind === 'protractor') inner = renderProtractor(360);
    else if (geo.kind === 'protractor180') inner = renderProtractor(180);
    else if (geo.kind === 'setsquare') inner = renderSetSquare();
    geoInstr.innerHTML = `<g transform="translate(${geo.cx} ${geo.cy}) rotate(${geoDeg})" font-family="Lexend, system-ui, sans-serif">${inner}</g>`;
  }

  // ---- the line/ray being ruled ----
  function renderPreview() {
    if (!geoDraw) { geoPreview.innerHTML = ''; return; }
    let a, b, text;
    if (geoDraw.type === 'line') {
      a = geoDraw.a; b = geoDraw.b; text = lineAngleLabel(a[0], a[1], b[0], b[1]);
    } else {
      const C = geoDraw.C;
      let wm = Math.atan2(-(geoDraw.y - C[1]), geoDraw.x - C[0]);
      if (geoSettings().snapAngle) wm = Math.round(wm / (Math.PI / 12)) * (Math.PI / 12);
      const len = Math.max(30, Math.hypot(geoDraw.x - C[0], geoDraw.y - C[1]));
      a = C; b = [C[0] + len * Math.cos(wm), C[1] - len * Math.sin(wm)];
      geoDraw.end = b;
      text = Math.round(rayReading(b)) + '°';
    }
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const lx = mx + Math.sin(ang) * 20, ly = my - Math.cos(ang) * 20;
    const w = text.length * 10 + 16;
    geoPreview.innerHTML =
      `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${ink.color}" stroke-width="${Math.max(2, ink.size)}" stroke-linecap="round" opacity="0.92"/>` +
      `<circle cx="${a[0]}" cy="${a[1]}" r="4" fill="${ink.color}"/><circle cx="${b[0]}" cy="${b[1]}" r="4" fill="${ink.color}"/>` +
      `<g transform="translate(${lx} ${ly})" font-family="Lexend, system-ui, sans-serif"><rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="9" fill="rgba(17,24,39,0.92)"/><text x="0" y="5" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${text}</text></g>`;
  }

  function beginLineDraw(e, i) {
    const [A, B] = edgeScreen(i);
    const P = projectPoint(A, B, [e.clientX, e.clientY]);
    geoDraw = { type: 'line', id: e.pointerId, A, B, a: P, b: P };
    renderPreview();
  }
  function beginRayDraw(e) {
    geoDraw = { type: 'ray', id: e.pointerId, C: [geo.cx, geo.cy], x: e.clientX, y: e.clientY };
    renderPreview();
  }
  function updateGeoDraw(x, y) {
    if (!geoDraw) return;
    if (geoDraw.type === 'line') geoDraw.b = projectPoint(geoDraw.A, geoDraw.B, [x, y]);
    else { geoDraw.x = x; geoDraw.y = y; }
    renderPreview();
  }
  function commitGeoDraw() {
    if (!geoDraw) return;
    const a = geoDraw.a || geoDraw.C, b = geoDraw.type === 'line' ? geoDraw.b : (geoDraw.end || [geoDraw.x, geoDraw.y]);
    geoDraw = null;
    renderPreview();
    if (a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) >= 4) {
      screenInk(screen()).push({ tool: 'line', color: ink.color, size: ink.size, x0: Math.round(a[0]), y0: Math.round(a[1]), x1: Math.round(b[0]), y1: Math.round(b[1]) });
      redoInkStack = [];
      inkChanged();
    }
  }

  // ---- gestures ----
  function setupBodyGesture() {
    const ids = [...geoPointers.keys()];
    if (ids.length >= 2) {
      const p0 = geoPointers.get(ids[0]), p1 = geoPointers.get(ids[1]);
      geoGesture = {
        mode: 'two', ids: [ids[0], ids[1]],
        ang0: Math.atan2(p1.y - p0.y, p1.x - p0.x),
        dist0: Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1,
        mid0: [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2],
        rot0: geo.rot, cx0: geo.cx, cy0: geo.cy, size0: geoSizeParam(),
      };
    } else if (ids.length === 1) {
      const p = geoPointers.get(ids[0]);
      geoGesture = { mode: 'move', id: ids[0], x0: p.x, y0: p.y, cx0: geo.cx, cy0: geo.cy };
    } else {
      geoGesture = null;
    }
  }

  function onGeoDown(e) {
    if (!geo) return;
    const roleEl = e.target.closest && e.target.closest('[data-role]');
    if (!roleEl) return;
    e.preventDefault();
    geoPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!geoWinBound) {
      window.addEventListener('pointermove', onGeoMove);
      window.addEventListener('pointerup', onGeoUp);
      window.addEventListener('pointercancel', onGeoUp);
      geoWinBound = true;
    }
    const role = roleEl.dataset.role;
    if (role === 'close') { geoPointers.delete(e.pointerId); clearGeo(); return; }
    if (geoDraw) return; // ignore extra fingers mid-line
    if (role === 'draw') { beginLineDraw(e, +roleEl.dataset.edge); return; }
    if (role === 'rim') { beginRayDraw(e); return; }
    if (role === 'rotate') { geoGesture = { mode: 'rotate1', startAng: Math.atan2(e.clientY - geo.cy, e.clientX - geo.cx), rot0: geo.rot }; return; }
    if (role === 'resize') { geoGesture = { mode: 'resize1', d0: Math.max(12, Math.hypot(e.clientX - geo.cx, e.clientY - geo.cy)), size0: geoSizeParam() }; return; }
    setupBodyGesture();
  }

  function onGeoMove(e) {
    if (!geoPointers.has(e.pointerId)) return;
    geoPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (geoDraw) { if (geoDraw.id === e.pointerId) updateGeoDraw(e.clientX, e.clientY); return; }
    const g = geoGesture;
    if (!g) return;
    if (g.mode === 'move') {
      let nx = g.cx0 + (e.clientX - g.x0), ny = g.cy0 + (e.clientY - g.y0);
      [nx, ny] = snapCenter(nx, ny);
      geo.cx = nx; geo.cy = ny;
    } else if (g.mode === 'two') {
      const p0 = geoPointers.get(g.ids[0]), p1 = geoPointers.get(g.ids[1]);
      if (!p0 || !p1) return;
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x), dist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      const mid = [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2];
      geo.rot = snapRot(g.rot0 + (ang - g.ang0));
      geo.cx = g.cx0 + (mid[0] - g.mid0[0]);
      geo.cy = g.cy0 + (mid[1] - g.mid0[1]);
      setGeoSizeParam(g.size0 * (dist / g.dist0));
    } else if (g.mode === 'rotate1') {
      geo.rot = snapRot(g.rot0 + (Math.atan2(e.clientY - geo.cy, e.clientX - geo.cx) - g.startAng));
    } else if (g.mode === 'resize1') {
      setGeoSizeParam(g.size0 * (Math.max(12, Math.hypot(e.clientX - geo.cx, e.clientY - geo.cy)) / g.d0));
    }
    renderGeo();
  }

  function onGeoUp(e) {
    const had = geoPointers.delete(e.pointerId);
    if (!had) return;
    if (geoDraw && geoDraw.id === e.pointerId) commitGeoDraw();
    if (geoPointers.size === 0) {
      geoGesture = null;
      window.removeEventListener('pointermove', onGeoMove);
      window.removeEventListener('pointerup', onGeoUp);
      window.removeEventListener('pointercancel', onGeoUp);
      geoWinBound = false;
    } else if (!geoDraw) {
      setupBodyGesture(); // finger count changed (e.g. 2 → 1): re-baseline
    }
  }
  geoInstr.addEventListener('pointerdown', onGeoDown);

  function activateGeoTool(kind) {
    if (geo && geo.kind === kind) { clearGeo(); return; }
    geo = makeGeo(kind);
    renderGrid();
    renderGeo();
    if (typeof buildDrawTools === 'function') buildDrawTools();
  }
  function clearGeo() {
    geo = null;
    geoDraw = null;
    geoGesture = null;
    geoPointers.clear();
    if (geoWinBound) {
      window.removeEventListener('pointermove', onGeoMove);
      window.removeEventListener('pointerup', onGeoUp);
      window.removeEventListener('pointercancel', onGeoUp);
      geoWinBound = false;
    }
    renderPreview();
    renderGeo();
    renderGrid();
    if (typeof buildDrawTools === 'function') buildDrawTools();
  }

  // ---- settings drawer (right-hand slide-out) ----
  function toggleGeoSettings() {
    if (geoPanel) { geoPanel.remove(); geoPanel = null; return; }
    closePanels();
    const s = geoSettings();
    const body = el('div', { class: 'bg-drawer-body' });
    const toggleRow = (label, key, hint) => {
      const sw = el('button', { class: 'geo-sw' + (s[key] ? ' on' : ''), role: 'switch', 'data-key': key });
      const row = el('div', { class: 'geo-row', onclick: () => { s[key] = !s[key]; sw.classList.toggle('on', s[key]); save(); renderGrid(); } },
        el('div', {}, el('div', { class: 'geo-row-label' }, label), hint ? el('div', { class: 'hint' }, hint) : null),
        sw);
      return row;
    };
    const variantSeg = el('div', { class: 'geo-seg' },
      ...[['45', '45° · 45°'], ['30', '30° · 60°']].map(([val, lbl]) =>
        el('button', {
          class: 'geo-seg-btn' + ((s.square || '45') === val ? ' active' : ''),
          onclick: () => {
            s.square = val; save();
            if (geo && geo.kind === 'setsquare') { geo.variant = val; renderGeo(); }
            for (const b of variantSeg.children) b.classList.toggle('active', b.textContent === lbl);
          },
        }, lbl)));
    const gridRange = el('input', {
      type: 'range', min: '20', max: '90', step: '5', value: String(s.grid || 40),
      oninput: (e) => {
        s.grid = +e.target.value;
        if (!s.snapGrid) {
          s.snapGrid = true;
          const sw = body.querySelector('.geo-sw[data-key="snapGrid"]');
          if (sw) sw.classList.add('on');
        }
        save(); renderGrid();
      },
    });
    body.append(
      el('div', { class: 'hint', style: 'margin-top:6px;' }, 'One finger moves the instrument · two fingers rotate & resize · drag along an edge to rule a line.'),
      el('h4', {}, 'Snapping'),
      toggleRow('Snap angles to 15°', 'snapAngle', 'Rotation and ruled lines lock to neat angles'),
      toggleRow('Snap to board areas', 'snapEdges', 'Centre, mid-lines and edges of the screen'),
      toggleRow('Snap to grid', 'snapGrid', 'Show a grid and snap instruments to it'),
      el('h4', {}, 'Grid size'),
      // the grid only exists while snapGrid is on — a live slider under its
      // own heading that visibly did nothing was the bug; moving it now turns
      // the grid on, which is the only reason anyone reaches for it
      el('div', { class: 'row' }, gridRange),
      el('div', { class: 'hint' }, 'Moving the slider switches the grid on.'),
      el('h4', {}, 'Set square'),
      variantSeg,
    );
    geoPanel = el('aside', { class: 'bg-drawer' },
      el('div', { class: 'bg-drawer-head' },
        el('h3', {}, 'Geometry tools'),
        el('button', { class: 'rm', title: 'Close', onclick: () => { geoPanel.remove(); geoPanel = null; } }, '✕')),
      body);
    document.body.append(geoPanel);
  }

  // keep instruments in step with the viewport
  window.addEventListener('resize', () => { if (geo) { renderGrid(); renderGeo(); } });

  // ---- keyboard shortcuts while annotating ----
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!drawLayer.classList.contains('active')) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoInk(); else undoInk();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'escape') { if (geo) clearGeo(); else if (selected) deselect(); else toggleDraw(); }
    else if (k === 'v') setInkTool('select');
    else if (k === 'p') setInkTool('pen');
    else if (k === 'm') setInkTool('highlighter');
    else if (k === 'l') setInkTool(ink.shape);
    else if (k === 'e') setInkTool('eraser');
    else if ((k === 'delete' || k === 'backspace') && selected) { e.preventDefault(); removeSelected(); }
  });

  // keep tabs in sync: adopt changes written by another tab instead of clobbering them
  SageStorage.onExternalChange((raw) => {
    // A null payload is the erase in another window, not a write to skip past.
    // Ignoring it left this tab holding the only surviving copy — and then
    // writing it back. It says so out loud, because a display tab that empties
    // itself mid-lesson without explanation reads as the app losing the work.
    if (!raw) {
      dropLocalState();
      toast('Everything on this device was erased in another window.', { ms: 9000 });
      return;
    }
    try {
      const incoming = normalize(JSON.parse(raw));
      if (!incoming) return;
      state = incoming;
      // no rewardsDayTick here — the writing tab already ticked this state,
      // and a tick's save() would echo writes back and forth between tabs
      applyReadingFont(); renderStarPill();
      renderScreen();
      if (dashEl) renderDashboard();
    } catch (err) { /* ignore malformed writes */ }
  });

  // ---------------------------------------------------------------- boot
  if (window.SagePptxImport) {
    SagePptxImport.init({ el, iconEl, openModal, toast, addImportedDeck, appendImportedScreens });
  }
  /* Drop a file anywhere on the page. A .pptx becomes a deck; a register
     becomes a class. Neither is nested inside a module check any more — the
     register route only needs a file reader, and the plain-text fallback in
     readNameFile means it works even without one. */
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && [...e.dataTransfer.items].some((it) => it.kind === 'file')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    if (/\.pptx$/i.test(file.name)) {
      if (window.SagePptxImport) SagePptxImport.openDialog(file);
      return;
    }
    if (/\.ppt$/i.test(file.name)) {
      toast('Old .ppt format — open it in PowerPoint and save as .pptx first.');
      return;
    }
    /* Only files that could hold names. Without this, a photo dropped on the
       window opens the class editor, gets read as text, and appends whatever
       letters happen to fall out of the JPEG to a real register. A drop we
       don't understand does nothing at all, which is what it did before there
       was a register route. */
    const DT = window.SageDocText;
    if ((DT && DT.handles(file)) || /\.(csv|tsv|txt|text|md|markdown)$/i.test(file.name)) {
      dropNameFile(file);
    }
  });
  if (window.SageExport) {
    SageExport.init({ el, iconEl, openModal, toast, WIDGETS, applyTheme, paintStroke, screens, viewDeck, screenTitle, screenInk });
  }
  if (window.SagePrint) SagePrint.init({ el, iconEl, openModal, toast });
  if (window.SageSnapshots) SageSnapshots.init({ toast });
  if (window.SageEnglishWord) {
    const engDeps = { WIDGETS, el, iconEl, save, toast, uid, clamp, settingRow, checkRow, selectInput, pickImage, confirmDialog, promptDialog, openModal, deck: viewDeck, snapshotBefore, getPref, setPref, classNames };
    SageEnglishWord.init(engDeps);
    // modelled writing lives in its own file from v2 — same deps, same pattern
    if (window.SageModelWrite) SageModelWrite.init(engDeps);
    // Sentence + Text grains; the genre toolkit is its first occupant
    if (window.SageEnglishText) SageEnglishText.init(engDeps);
    // TOOLS is assembled at load time, before this block runs — english widgets
    // join it here, once their defs exist in the registry
    TOOLS.push(widgetTool('phonemetiles', 'Phoneme tiles', 'english'));
    TOOLS.push(widgetTool('wordsort', 'Word class sorter', 'english'));
    TOOLS.push(widgetTool('wordbank', 'Word bank', 'english'));
    TOOLS.push(widgetTool('sentencebuilder', 'Sentence builder', 'english'));
    TOOLS.push(widgetTool('modelwrite', 'Modelled writing', 'english'));
    if (window.SageEnglishText) TOOLS.push(widgetTool('genretoolkit', 'Genre toolkit', 'english'));
    if (window.SageEnglishText) TOOLS.push(widgetTool('storymap', 'Story map', 'english'));
  }
  // Boot is the honest moment for the daily copy: it records every unit as the
  // teacher left it yesterday, BEFORE today's lesson can touch it. It has to
  // run AFTER the widget registry is complete, though — asked any earlier it
  // cannot tell a writing unit from a clock, and names it "modelwrite".
  if (window.SageSnapshots) dailySnapshots();
  applyReadingFont();
  if (rewardsDayTick()) save();
  renderStarPill();
  $('#homeBtn').replaceChildren(iconEl('screens'));
  $('#homeBtn').addEventListener('click', () => (dashEl ? closeDashboard() : openDashboard()));
  $('#dataBtn').replaceChildren(iconEl('save'));
  // guarded because a cached index.html without the button must not break boot
  if ($('#helpBtn')) {
    $('#helpBtn').replaceChildren(iconEl('help'));
    $('#helpBtn').addEventListener('click', () => openHelp());
    wireHelpHover($('#helpBtn'));
  }
  $('#fullscreenBtn').replaceChildren(iconEl('expand'));
  $('#prevScreen').replaceChildren(iconEl('chevl'));
  $('#nextScreen').replaceChildren(iconEl('chevr'));
  $('#addScreen').replaceChildren(iconEl('plus'));
  $('#delScreen').replaceChildren(iconEl('trash'));
  $('#deckBtn').prepend(iconEl('screens'));
  renderScreen();
  // ------------------------------------------------ taster (sagestage.app)
  // docs/sagestage-app-design.md §2: three guarded moves, all inert without
  // window.SAGE_DEMO — the product never sets it; only the deployed taster's
  // demo.js does. The seed builds widgets from each type's own defaults() so
  // the showcase can never drift from what widgets actually expect.
  let demoSeeded = false;
  if (window.SAGE_DEMO) {
    const t = document.querySelector('#topbar .tag');
    if (t) t.textContent = 'Taster — work stays in this browser';
    const spec = SAGE_DEMO.seed && Array.isArray(SAGE_DEMO.seed.screens) ? SAGE_DEMO.seed : null;
    const buildScreens = (screens) => screens.map((s) => ({
      id: uid(), name: s.name || '',
      background: s.background || { type: 'color', value: '#f4f7f6' },
      widgets: (s.widgets || []).filter((w) => WIDGETS[w.type]).map((w, i) => ({
        id: uid(), type: w.type,
        x: w.x || 60, y: w.y || 80,
        w: w.w || WIDGETS[w.type].w, h: w.h || WIDGETS[w.type].h,
        z: 10 + i,
        props: { ...WIDGETS[w.type].defaults(), ...(w.props || {}) },
      })),
    }));
    if (spec && !persisted.existed) {
      // fresh browser: the chosen deck IS the state
      const next = normalize({
        deckName: spec.deckName || 'Try Sage Stage',
        lists: spec.lists && typeof spec.lists === 'object' ? spec.lists : {},
        screens: buildScreens(spec.screens),
      });
      if (next) {
        state = scrubImportedHTML(next);
        rewardsDayTick(); applyReadingFont(); renderStarPill();
        save(); renderScreen();
        demoSeeded = true;   // land ON the showcase, not the dashboard
      }
    } else if (spec && SAGE_DEMO.requested) {
      // a landing-page card was clicked and this browser already holds work:
      // ADD the requested deck if it isn't here yet, open it, touch nothing
      // else — the never-overwrite rule survives the deep links
      let deck = state.decks.find((d) => d.name === spec.deckName);
      if (!deck) {
        deck = {
          id: uid(), name: spec.deckName, classList: null, subject: '',
          yearGroup: null, pinnedTop: false, createdAt: Date.now(),
          lastUsed: Date.now(), current: 0, screens: buildScreens(spec.screens),
        };
        state.decks.push(deck);
        for (const [k, v] of Object.entries(spec.lists || {})) {
          if (!state.lists[k]) state.lists[k] = v.slice();
        }
      }
      state.activeDeck = deck.id;
      deck.current = 0;
      save(); renderScreen();
      demoSeeded = true;
    }
  }
  if (!persisted.existed && !demoSeeded) {
    // friendly first-run starter widgets. The floor matters: a window that
    // reports zero width at this instant would park the clock at x = -320,
    // wholly off-screen with nothing to grab (seen in the 2026-07-31 audit).
    addWidget('clock');
    const c = screen().widgets[screen().widgets.length - 1];
    c.x = Math.max(24, window.innerWidth - 320); c.y = 80;
    remountWidget(c);
    save();
  }
  // land on the dashboard so the teacher picks their class deck; a tab pinned
  // to one screen (#s=) is a display tab and goes straight there instead
  if (persisted.notice) toast(persisted.notice);
  if (!viewId && !demoSeeded) openDashboard();
})().catch((e) => {
  // Boot is async now, so a throw here is a promise rejection rather than a
  // console error with a half-drawn page behind it. A teacher at a board needs
  // to be told the app did not start, not left looking at an empty screen.
  console.error(e);
  document.body.textContent = 'Sage Stage failed to start — see the browser console.';
});
