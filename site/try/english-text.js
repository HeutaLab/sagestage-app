/* Sage Stage — English widgets, Sentence & Text grains.
   Design: docs/genre-toolkit-design.md, implementing docs/english-widgets-design.md §8.4.
   Slice 1: genre toolkit — the success criteria that grow on the working wall
   across a unit, the model text they were found in, and the genre's word bank.
   Three faces, one pack. Registered into the app at boot via
   SageEnglishText.init(deps), the export.js dependency-injection pattern.

   §10 of the English set design puts the sentence builder in this file too. It
   shipped inside english-word.js and it stays there: moving it is an unrelated
   refactor with real regression risk on a widget reviewed two days ago, and no
   gain (genre-toolkit-design.md §12 records the drift on purpose). The Story Map
   is the next thing that belongs here. */
(function () {
  'use strict';

  let D = null; // injected by SageEnglishText.init from app.js

  // ---------------------------------------------------------------- the genre pack
  // Defaults ship in english-packs.js. The normaliser runs on our own file too,
  // so an imported school pack inherits identical hardening for free — the
  // phonics pack's pattern (english-word.js:16), and the same reasoning: this is
  // the class of input sanitizeTemplate exists for.
  const GT_BANDS = [['ks1', 'Reception – Year 2'], ['lks2', 'Years 3–4'], ['uks2', 'Years 5–6']];
  const GT_BAND_IDS = GT_BANDS.map((b) => b[0]);
  const GT_LANG = [['openers', 'Openers'], ['connectives', 'Connectives'], ['vocabulary', 'Vocabulary']];
  const GT_CAP = {
    name: 60, id: 60, items: 20, item: 200, struct: 12, box: 60, hint: 200,
    lang: 50, word: 60, text: 20000, file: 400000,
  };
  // Reception, 1, 2 → ks1 · 3, 4 → lks2 · 5, 6 → uks2. A deck with no year group
  // set returns null, which means "offer every band" rather than "offer none".
  const GT_YEAR_BAND = { R: 'ks1', 1: 'ks1', 2: 'ks1', 3: 'lks2', 4: 'lks2', 5: 'uks2', 6: 'uks2' };
  const gtBandFor = (yg) => GT_YEAR_BAND[String(yg == null ? '' : yg)] || null;

  // Picker identity: each default genre wears a solid Soft Daylight tint (t, the
  // GT_COLS register extended to twelve) with a deep same-hue ink (k) stroking a
  // little specimen of the text-form itself — an envelope, a comedy mask, a
  // quill. The hues are laid out so no two neighbours in the 4-across grid
  // share a family; newspaper is deliberately the one newsprint-grey card.
  // Colour is looked up by pack id and never stored: an imported or renamed
  // genre falls back to the neutral card, and position never carries meaning.
  const GT_LOOK = {
    'narrative': { t: '#ddd6fe', k: '#6d28d9' },
    'recount': { t: '#fde68a', k: '#b45309' },
    'diary': { t: '#fbcfe8', k: '#be185d' },
    'letter': { t: '#bae6fd', k: '#0369a1' },
    'instructions': { t: '#fed7aa', k: '#c2410c' },
    'explanation': { t: '#99f6e4', k: '#0f766e' },
    'non-chronological-report': { t: '#d9f99d', k: '#4d7c0f' },
    'persuasion': { t: '#fecaca', k: '#b91c1c' },
    'newspaper-report': { t: '#e2e8f0', k: '#475569' },
    'playscript': { t: '#f5d0fe', k: '#a21caf' },
    'poetry': { t: '#c7d2fe', k: '#4338ca' },
    'book-review': { t: '#a7f3d0', k: '#047857' },
  };
  // Drawn in the icons.js idiom: 24×24, stroke 1.7, round caps, honest geometry.
  const GT_ART = {
    'narrative': '<path d="M12 6.3C10.2 4.9 7.6 4.5 4.5 4.8v13.7c3.1-.3 5.7.1 7.5 1.5 1.8-1.4 4.4-1.8 7.5-1.5V4.8c-3.1-.3-5.7.1-7.5 1.5z"/><path d="M12 6.3v13.7"/>',
    'recount': '<circle cx="4.5" cy="19.5" r="1.3" fill="currentColor" stroke="none"/><path d="M4.5 19.5c7 0 3.5-7 9.5-7 4.5 0 3.5-5 5.5-6" stroke-dasharray="2.6 2.8"/><path d="M19.5 3.8v5.7"/><path d="M19.5 4l-3 .9 3 1.2"/>',
    'diary': '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.7 3.5v17"/><path d="M14 9.3c-.8-.9-2.3-.6-2.3.7 0 1 1.2 1.9 2.3 2.7 1.1-.8 2.3-1.7 2.3-2.7 0-1.3-1.5-1.6-2.3-.7z"/>',
    'letter': '<rect x="3.5" y="6" width="17" height="12" rx="1.8"/><path d="M4.8 7.5L12 12.8l7.2-5.3"/>',
    'instructions': '<circle cx="5.2" cy="6" r="1.7"/><circle cx="5.2" cy="12" r="1.7"/><path d="M9.5 6h10M9.5 12h10M9.5 18h6.5"/><path d="M3.7 18.1l1 1.1 1.9-2.2"/>',
    'explanation': '<path d="M6.3 9.2a6.6 6.6 0 0 1 11.2-2.3"/><path d="M17.8 3.4v3.6h-3.6"/><path d="M17.7 14.8a6.6 6.6 0 0 1-11.2 2.3"/><path d="M6.2 20.6v-3.6h3.6"/>',
    'non-chronological-report': '<circle cx="10.2" cy="9.8" r="5.8"/><path d="M14.5 14.1l5 5"/><path d="M7.8 8.4h4.8M7.8 11.2h3.4"/>',
    'persuasion': '<path d="M14.5 5v13l-7-3.4H5a1.6 1.6 0 0 1-1.6-1.6v-3A1.6 1.6 0 0 1 5 8.4h2.5L14.5 5z"/><path d="M17.6 9.3a4 4 0 0 1 0 5.4"/><path d="M19.9 7.4a7 7 0 0 1 0 9.2"/>',
    'newspaper-report': '<rect x="3.5" y="4.5" width="17" height="15" rx="1.6"/><path d="M6.3 8h11.4"/><path d="M6.3 11.2h5.2M6.3 13.8h5.2M6.3 16.4h5.2"/><rect x="13.7" y="10.9" width="3.9" height="5.6"/>',
    'playscript': '<path d="M5.5 4.6c4.2 1.4 8.8 1.4 13 0v7.2a6.5 6.5 0 0 1-13 0z"/><path d="M8.8 9.4c.6-.7 1.7-.7 2.3 0M12.9 9.4c.6-.7 1.7-.7 2.3 0"/><path d="M9 13c1.7 1.5 4.3 1.5 6 0"/>',
    'poetry': '<path d="M19 4.6C13.6 4.6 8.4 8.6 6.9 14.6L5.8 19.4"/><path d="M19 4.6c.9 5.6-2.8 10.4-8.7 11.2"/><path d="M9.3 11.9h4.4M7.9 15h3.5"/>',
    'book-review': '<rect x="4.5" y="5.5" width="12.5" height="15" rx="1.8"/><path d="M7.5 5.5v15"/><path d="M17.8 2.6l.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.7.9.3-1.9-1.3-1.3 1.9-.3z" fill="currentColor" stroke="none"/>',
  };
  const GT_ART_FALLBACK = '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/>';
  const gtLook = (id) => GT_LOOK[id] || { t: 'rgba(255,255,255,.6)', k: '#64748b' };
  function gtArtEl(id) {
    // D.el, not a bare el — top-level helpers sit outside register()'s
    // destructure, the mount guard would swallow the ReferenceError silently
    const s = D.el('span', { class: 'gt-pick-art', 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
      + 'stroke-linecap="round" stroke-linejoin="round">' + (GT_ART[id] || GT_ART_FALLBACK) + '</svg>';
    return s;
  }
  const gtBandName = (id) => (GT_BANDS.find((b) => b[0] === id) || [null, ''])[1];

  // Eight fills, drawn from the accents already in use across the set: each
  // legible with dark slate on top, each printing without turning to mud. Colour
  // is NEVER stored on an item — it is the item's index into this list, so an
  // edited or reordered list can't orphan a mark to a dead colour. Past eight the
  // list cycles; identity lives in marks[].item, and tapping a highlight names
  // its criterion, so a repeated colour is a cosmetic collision, never a data one.
  //
  // Stepped up one register 2026-07-29 (Glenn: "the colours of the pills need to
  // be slightly more prominent — it's dim on the board even on dynamic
  // setting"). These were the palest usable tints, which is exactly the trap the
  // word bank already recorded: an interactive whiteboard is badly
  // colour-calibrated and a tasteful tint disappears on a projector. One step
  // is the whole change: 20% denser on average, and measured against the slate
  // the chips and rows are set in the worst of the eight is still 7.9:1 — above
  // AAA — so nothing on the board or the poster loses legibility, and the hues
  // stay as widely separated as before because every one moved together.
  const GT_COLS = ['#fcd34d', '#6ee7b7', '#93c5fd', '#f9a8d4',
    '#c4b5fd', '#fdba74', '#bef264', '#7dd3fc'];

  // C0 controls other than tab/newline/return are illegal in XML 1.0, so a pack
  // carrying one produces a poster SVG the print dialog cannot parse — the
  // criteria sheet simply vanishes. Stripped at the door, before anything else
  // sees the string.
  const GT_BAD_CH = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g;
  const gtStr = (v, cap) => String(v == null ? '' : v)
    .replace(GT_BAD_CH, '').replace(/\s+/g, ' ').trim().slice(0, cap);
  const gtSlug = (s) => gtStr(s, GT_CAP.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, GT_CAP.id) || 'genre';

  // Which part of an arc a thing serves: a plan's box usually runs up, level or
  // down, and so does a word. Three values and null, whitelisted at every door —
  // an unrecognised mood is absence, never a fourth kind.
  const GT_MOODS = ['up', 'mid', 'down'];
  const gtMood = (v) => (GT_MOODS.includes(v) ? v : null);

  // Model text keeps its line breaks — paragraphing is part of what a class reads
  // off a WAGOLL — so it gets its own cleaner rather than gtStr's whitespace
  // collapse. Over the cap it stops at the last sentence end rather than
  // mid-clause, and says so, rather than losing the tail silently.
  function gtCleanText(v) {
    let s = typeof v === 'string' ? v : '';
    // trimmed on BOTH branches (the clipped one always was): an untrimmed
    // whitespace-only string is truthy but tokenises to nothing, which put the
    // widget on the "a model text is in" path showing an empty board instead of
    // the paste target, and made the print page count a sheet nothing built.
    // Only the ends go — a poem's interior line breaks are its form.
    s = s.replace(/\r\n?/g, '\n').replace(/[\t\v\f ]/g, ' ').replace(GT_BAD_CH, '').trim();
    if (s.length <= GT_CAP.text) return { text: s, clipped: false };
    const cut = s.slice(0, GT_CAP.text);
    const stop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    return { text: (stop > GT_CAP.text / 2 ? cut.slice(0, stop + 1) : cut).trim(), clipped: true };
  }

  // Returns { genre, clamped } — clamped names what the caps threw away, so an
  // import can say what happened instead of silently loading two thirds of a file.
  //
  // keepIds matters. Coming from a FILE or one of our defaults, every item gets a
  // fresh id (false). Coming from a widget's own saved props (true), each item
  // keeps the id it had, because that id is what its reveals, ticks and marks
  // reference. Re-minting there — or restoring ids by position afterwards, which
  // is what the first cut of this did — silently re-points a highlight at a
  // different criterion the moment the normaliser drops one empty line.
  function gtNormalize(raw, keepIds) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { genre: null, clamped: [] };
    const clamped = [];
    const name = gtStr(raw.name, GT_CAP.name) || 'Genre';

    // items are objects with a band here; §9 of the set design wrote them as bare
    // strings under `toolkit`, so both shapes load and a bare string lands in the
    // middle band rather than being guessed at
    const src = Array.isArray(raw.items) ? raw.items
      : Array.isArray(raw.toolkit) ? raw.toolkit : [];
    const items = [];
    const seenIds = new Set();
    for (const it of src) {
      if (items.length >= GT_CAP.items) { clamped.push('criteria past ' + GT_CAP.items); break; }
      const t = gtStr(typeof it === 'string' ? it : (it && it.t), GT_CAP.item);
      if (!t) continue;
      const band = it && GT_BAND_IDS.includes(it.band) ? it.band : 'lks2';
      let id = keepIds && it && typeof it.id === 'string' && it.id && it.id.length <= 40
        ? it.id : D.uid();
      if (seenIds.has(id)) id = D.uid();
      seenIds.add(id);
      items.push({ id, t, band });
    }

    const structure = [];
    for (const row of Array.isArray(raw.structure) ? raw.structure : []) {
      if (structure.length >= GT_CAP.struct) { clamped.push('structure rows past ' + GT_CAP.struct); break; }
      const box = gtStr(row && row.box, GT_CAP.box);
      if (!box) continue;
      structure.push({ box, hint: gtStr(row && row.hint, GT_CAP.hint), mood: gtMood(row && row.mood) });
    }
    // shape says whether this text form is a story in TIME at all — whether the
    // emotion graph applies to it. It lives on the plan and is never derived from
    // the genre id: a water-cycle explanation and a diary are both "text" and
    // only one of them has a shape. Absent means true, so nothing already
    // authored loses its graph.
    const shape = raw.shape !== false;

    // `language: "nonsense"` and `language: []` both land here as three empty
    // lists rather than a throw — which also hides the word bank face (§8.5)
    const lang = raw.language && typeof raw.language === 'object' && !Array.isArray(raw.language)
      ? raw.language : {};
    const language = {};
    const vocab = [];
    for (const [key, label] of GT_LANG) {
      const out = [];
      for (const wd of Array.isArray(lang[key]) ? lang[key] : []) {
        if (out.length >= GT_CAP.lang) { clamped.push(label.toLowerCase() + ' past ' + GT_CAP.lang); break; }
        const obj = wd && typeof wd === 'object' && !Array.isArray(wd) ? wd : null;
        const s = gtStr(obj ? obj.w : wd, GT_CAP.word);
        if (!s) continue;
        out.push(s);
        // VOCABULARY alone may arrive tagged, and the tags ride ALONGSIDE rather
        // than inside: language.vocabulary stays a list of plain strings, so the
        // toolkit's own bank face, its poster and its settings are byte-for-byte
        // unaffected, while the story map's word bank reads `vocab` in the same
        // order. One authored list, two views — there is no second list to drift.
        //
        // The tags are AUTHORED, never inferred. A derived valence stays refused:
        // nothing here looks at the string and decides what it means.
        if (key !== 'vocabulary') continue;
        const raw2 = obj && obj.lvl != null ? +obj.lvl : 2;
        vocab.push({
          w: s,
          lvl: Number.isFinite(raw2) ? Math.max(0, Math.min(4, Math.round(raw2))) : 2,
          mood: gtMood(obj && obj.mood) || 'mid',
        });
      }
      language[key] = out;
    }

    const model = gtCleanText(raw.model);
    if (model.clipped) clamped.push('model text shortened');
    const id = gtStr(raw.id, GT_CAP.id).toLowerCase().replace(/[^a-z0-9-]/g, '') || gtSlug(name);
    return { genre: { id, name, items, structure, shape, language, vocab, model: model.text }, clamped };
  }

  let gtDefaultCache = null;
  function gtDefaults() {
    if (!gtDefaultCache) {
      const packs = Array.isArray(window.SAGE_ENGLISH_PACKS) ? window.SAGE_ENGLISH_PACKS : [];
      gtDefaultCache = packs.filter((b) => b && b.kind === 'genre')
        .map((b) => gtNormalize(b, false).genre).filter(Boolean);
    }
    // fresh ids on every read: two toolkit widgets on one genre are two
    // independent lesson artefacts, and sharing item ids between them would let a
    // reveal in one look like a reveal in the other after a reload
    return gtDefaultCache.map(gtCopy);
  }
  // Every one of these rebuilds the shape FIELD BY FIELD, which is what makes an
  // unknown key impossible to smuggle through — and also what means a new key
  // must land in all five places (here, gtNormalize, gtBlank, gtPackOf and
  // english-packs.js) in ONE commit. mood, shape and vocab landed together for
  // exactly that reason: a mood added to the data alone works until the first
  // time a pack round-trips through a file, and then it is silently gone.
  const gtCopy = (g) => ({
    id: g.id,
    name: g.name,
    items: g.items.map((it) => ({ id: D.uid(), t: it.t, band: it.band })),
    structure: g.structure.map((r) => ({ box: r.box, hint: r.hint, mood: r.mood || null })),
    shape: g.shape !== false,
    language: GT_LANG.reduce((o, [k]) => { o[k] = (g.language[k] || []).slice(); return o; }, {}),
    vocab: (g.vocab || []).map((v) => ({ w: v.w, lvl: v.lvl, mood: v.mood })),
    model: g.model,
  });
  const gtBlank = () => ({
    id: 'genre', name: 'Genre', items: [], structure: [], shape: true,
    language: GT_LANG.reduce((o, [k]) => { o[k] = []; return o; }, {}), vocab: [], model: '',
  });
  const gtHasBank = (g) => !!g && GT_LANG.some(([k]) => (g.language[k] || []).length);
  // Always mutate the existing genre object rather than swapping in a new one, so
  // an open settings panel's reference stays live. Every key of the shape is
  // assigned, so nothing of the old genre survives — this is a replacement that
  // happens to preserve identity, not a merge.
  function gtSetGenre(p, next) {
    if (p.genre && typeof p.genre === 'object') Object.assign(p.genre, next);
    else p.genre = next;
    return p.genre;
  }
  // Vocabulary leaves TAGGED, so a pack that goes out to a file and comes back
  // keeps the moods and scores that were authored into it. gtNormalize reads
  // both shapes, so a pack of bare strings written before this still loads and
  // one written after it still loads anywhere.
  const gtVocabOut = (g) => ((g.vocab && g.vocab.length)
    ? g.vocab.map((v) => ({ w: v.w, lvl: v.lvl, mood: v.mood }))
    : (g.language.vocabulary || []).slice());
  const gtPackOf = (g) => ({
    format: 'sage-pack@1', kind: 'genre', id: g.id, name: g.name,
    items: g.items.map((it) => ({ t: it.t, band: it.band })),
    structure: g.structure.map((r) => ({ box: r.box, hint: r.hint, mood: r.mood || null })),
    shape: g.shape !== false,
    language: GT_LANG.reduce((o, [k]) => {
      o[k] = k === 'vocabulary' ? gtVocabOut(g) : (g.language[k] || []).slice();
      return o;
    }, {}),
    model: g.model || '',
  });

  // ---------------------------------------------------------------- tokens
  // The model text tokenises ONCE and is immutable after, so a token index can
  // never drift under a mark. Whitespace is not a token: it rides on the
  // following token as `pre`, which is what lets a painted phrase bridge its own
  // gaps and still reproduce the text exactly.
  const GT_WORD_RE = /[\p{L}\p{N}]/u;
  const gtWordCh = (c) => GT_WORD_RE.test(c);

  // Every leading and every trailing punctuation character peels off as its own
  // token, working inwards, and the core splits before each apostrophe. So
  // `"Help!"` is four tokens and `fox's` is two — which is what makes "comma
  // after the fronted adverbial" and "apostrophe for possession" things a teacher
  // can actually point at. Hyphens stay inside: `well-known` is one adjective and
  // highlighting half of it means nothing.
  function gtSplitChunk(chunk) {
    const parts = [];
    let s = chunk;
    const lead = [], tail = [];
    while (s && !gtWordCh(s[0])) { lead.push(s[0]); s = s.slice(1); }
    while (s && !gtWordCh(s[s.length - 1])) { tail.unshift(s[s.length - 1]); s = s.slice(0, -1); }
    for (const c of lead) parts.push({ s: c, w: false });
    if (s) for (const part of s.split(/(?=['’])/)) if (part) parts.push({ s: part, w: true });
    for (const c of tail) parts.push({ s: c, w: false });
    return parts;
  }

  function gtTokens(text) {
    const src = String(text == null ? '' : text);
    const out = [];
    let i = 0;
    while (i < src.length) {
      let ws = '';
      while (i < src.length && /\s/.test(src[i])) { ws += src[i]; i++; }
      let chunk = '';
      while (i < src.length && !/\s/.test(src[i])) { chunk += src[i]; i++; }
      if (!chunk) break; // trailing whitespace: invisible, nothing to carry it
      gtSplitChunk(chunk).forEach((pt, k) => out.push({ s: pt.s, w: pt.w, pre: k === 0 ? ws : '' }));
    }
    return out;
  }

  // ---------------------------------------------------------------- marks
  // { a, b, item } — an inclusive token range. The list is kept sorted,
  // non-overlapping, and with same-item neighbours merged, so "adjacent marks of
  // one item merge into one range" is an invariant of the store rather than
  // something every caller has to remember. Each mutation returns a fresh list.
  function gtNormMarks(marks, n) {
    const rows = (Array.isArray(marks) ? marks : [])
      .map((m) => (m && typeof m === 'object'
        ? { a: m.a | 0, b: m.b | 0, item: typeof m.item === 'string' ? m.item : '' } : null))
      .filter((m) => m && m.item && m.a >= 0 && m.b >= m.a && m.b < n)
      .sort((x, y) => x.a - y.a || x.b - y.b);
    const out = [];
    for (const m of rows) {
      const last = out[out.length - 1];
      if (last && last.item === m.item && m.a <= last.b + 1) {
        last.b = Math.max(last.b, m.b);
        continue;
      }
      // a hand-edited store can hand us overlapping marks of DIFFERENT items;
      // clip rather than trust, so the non-overlap invariant holds even then
      if (last && m.a <= last.b) m.a = last.b + 1;
      if (m.b >= m.a) out.push(m);
    }
    return out;
  }

  function gtErase(marks, a, b, n) {
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(n - 1, Math.max(a, b));
    if (hi < lo) return marks;
    const out = [];
    for (const m of marks) {
      if (m.b < lo || m.a > hi) { out.push(m); continue; }
      if (m.a < lo) out.push({ a: m.a, b: lo - 1, item: m.item });
      if (m.b > hi) out.push({ a: hi + 1, b: m.b, item: m.item });
    }
    return gtNormMarks(out, n);
  }

  function gtPaint(marks, a, b, item, n) {
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(n - 1, Math.max(a, b));
    if (hi < lo || !item) return marks;
    return gtNormMarks([...gtErase(marks, lo, hi, n), { a: lo, b: hi, item }], n);
  }

  const gtMarkAt = (marks, i) => (marks || []).find((m) => i >= m.a && i <= m.b) || null;

  // ---------------------------------------------------------------- print
  // §11: toPrintablePages, because there is more than one sheet and the app's
  // dialog already lets the teacher tick which are worth the paper. Pure vector,
  // attribute styling, no ids, no external references; every string XML-escaped
  // (criteria and word bank entries carry apostrophes as a matter of course).
  // One known deviation from the poster checklist, the same one the sound mat
  // logs: text rides the system font stack until chrome-font embedding lands.
  const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  const xmlEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => XML_ESC[c]);
  const GT_FONT = 'system-ui, sans-serif';
  const GT_W = 1000, GT_PAD = 56;
  // leading/trailing spaces become non-breaking ones, so they measure and render
  // instead of being collapsed away (see gtSnippetGroups for the measurements)
  const gtHardSpaces = (s) => String(s)
    .replace(/^ +/, (m) => '\u00a0'.repeat(m.length))
    .replace(/ +$/, (m) => '\u00a0'.repeat(m.length));

  // Exact text widths, measured in the document the poster is built in. The
  // alternative is a characters-times-em guess, and a guess is precisely what
  // puts a highlight one word to the left of the word it highlights. Falls back
  // to the guess if measurement comes back empty, so a poster is always produced.
  let gtMeasHost = null, gtMeasText = null;
  function gtWidth(str, size, weight) {
    const s = String(str == null ? '' : str);
    if (!s) return 0;
    try {
      if (!gtMeasHost) {
        const NS = 'http://www.w3.org/2000/svg';
        gtMeasHost = document.createElementNS(NS, 'svg');
        gtMeasHost.setAttribute('width', '10');
        gtMeasHost.setAttribute('height', '10');
        gtMeasHost.setAttribute('style', 'position:absolute;left:-10000px;top:0;overflow:hidden;');
        gtMeasText = document.createElementNS(NS, 'text');
        gtMeasHost.append(gtMeasText);
        document.body.append(gtMeasHost);
      }
      gtMeasText.setAttribute('font-family', GT_FONT);
      gtMeasText.setAttribute('font-size', String(size));
      gtMeasText.setAttribute('font-weight', String(weight || 400));
      // preserve, because the snippet runs carry their own boundary spaces and a
      // measurement that silently drops a trailing space renders "a" and "fox" as
      // "afox" — SVG strips boundary whitespace at BOTH ends of the pipeline
      gtMeasText.setAttribute('xml:space', 'preserve');
      gtMeasText.textContent = s;
      const n = gtMeasText.getComputedTextLength();
      if (n > 0) return n;
    } catch (err) { /* fall through to the estimate */ }
    return s.length * size * 0.54;
  }

  // Greedy word wrap against measured widths. A single word wider than the box is
  // left long rather than broken: a poster with a hyphenated criterion reads
  // worse than one with a slightly wide line.
  function gtWrap(text, width, size, weight) {
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const wd of words) {
      const next = line ? line + ' ' + wd : wd;
      if (line && gtWidth(next, size, weight) > width) { lines.push(line); line = wd; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  const gtColOf = (g, id) => {
    const i = ((g && g.items) || []).findIndex((it) => it.id === id);
    return i < 0 ? GT_COLS[0] : GT_COLS[i % GT_COLS.length];
  };

  // §11's snippet: the sentence a mark sits in, clipped to fit the sheet.
  //
  // Grouped BY SENTENCE, not by mark. Three highlights in one sentence print as
  // one line with three painted runs, not as three near-identical copies of the
  // same sentence — which is what one-snippet-per-mark produced, and it read as
  // noise on the wall.
  //
  // Clipping is by measured width rather than a character count, because a
  // character count cannot know how wide the sheet is: 160 characters at 22px is
  // nearly twice the column, so it silently wrapped or ran off the page.
  function gtSnippetGroups(toks, marks, avail, size) {
    const isStop = (t) => !t.w && /[.!?]/.test(t.s);
    const sentenceOf = (m) => {
      let a = m.a, b = m.b;
      while (a > 0 && !isStop(toks[a - 1])) a--;
      while (b < toks.length - 1 && !isStop(toks[b])) b++;
      return a + ':' + b;
    };
    const groups = new Map();
    for (const m of marks) {
      const key = sentenceOf(m);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }

    const out = [];
    for (const [key, ms] of groups) {
      const bounds = key.split(':').map(Number);
      let from = bounds[0], to = bounds[1];
      const lo = Math.min(...ms.map((x) => x.a));
      const hi = Math.max(...ms.map((x) => x.b));
      const on = (i) => ms.some((x) => i >= x.a && i <= x.b);
      // the gap between two tokens is painted only when BOTH sides are painted,
      // so a run reads continuous and a boundary stays plain
      const build = () => {
        const units = [];
        for (let i = from; i <= to; i++) {
          const pre = i > from ? toks[i].pre.replace(/\s+/g, ' ') : '';
          if (pre) units.push({ s: pre, on: on(i - 1) && on(i) });
          units.push({ s: toks[i].s, on: on(i) });
        }
        const segs = [];
        for (const u of units) {
          const last = segs[segs.length - 1];
          if (last && last.on === u.on) last.s += u.s;
          else segs.push({ s: u.s, on: u.on });
        }
        return segs;
      };
      const widthOf = (segs) => segs.reduce((n, s) => n + gtWidth(s.s, size, s.on ? 500 : 400), 0);

      let segs = build(), cutL = false, cutR = false;
      // trim the unmarked context first, from whichever side has more of it
      while (widthOf(segs) > avail && (from < lo || to > hi)) {
        if (from < lo && (lo - from) >= (to - hi)) { from++; cutL = true; }
        else if (to > hi) { to--; cutR = true; }
        else { from++; cutL = true; }
        segs = build();
      }
      // last resort: a teacher who highlighted forty words gets it truncated
      // rather than running off the sheet
      while (widthOf(segs) > avail && to > from) { to--; cutR = true; segs = build(); }
      if (cutL) segs.unshift({ s: '… ', on: false });
      if (cutR) segs.push({ s: ' …', on: false });
      // A run's leading or trailing space IS the gap between it and its
      // neighbour, and the poster positions each run by its measured width — so a
      // boundary space that measures zero puts the next run flush against this
      // one and prints "a fox" as "afox".
      //
      // xml:space="preserve" does NOT fix it. Measured in Chrome: the attribute
      // works on a PARSED node (199.47 vs 194.41) but is ignored on one built
      // with setAttribute + textContent, which is what the measuring host is —
      // so render and measurement disagree by a space every time. A non-breaking
      // space is not XML whitespace at all, so it survives collapsing in both
      // paths with no attribute involved.
      for (const seg of segs) seg.s = gtHardSpaces(seg.s);
      out.push({ segs });
    }
    return out;
  }

  function gtSvg(inner, h) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + GT_W + ' ' + h + '" width="'
      + GT_W + '" height="' + h + '"><rect x="0" y="0" width="' + GT_W + '" height="' + h
      + '" fill="#ffffff"/>' + inner + '</svg>';
  }
  function gtHead(parts, title, y0) {
    let y = y0 + 46;
    // a teacher-named genre can be 60 characters, and "Long Victorian Diary Entry
    // — word bank" at 46px overruns the sheet, so the title shrinks to fit rather
    // than walking off the edge
    let size = 46;
    const room = GT_W - GT_PAD * 2;
    while (size > 26 && gtWidth(title, size, 700) > room) size -= 2;
    parts.push('<text x="' + GT_PAD + '" y="' + y + '" font-family="' + GT_FONT
      + '" font-size="' + size + '" font-weight="700" fill="#0f172a">' + xmlEsc(title) + '</text>');
    y += 16;
    parts.push('<path d="M' + GT_PAD + ' ' + y + 'H' + (GT_W - GT_PAD)
      + '" stroke="#94a3b8" stroke-width="2" fill="none"/>');
    return y;
  }

  function gtPosterSvg(p) {
    const g = p.genre;
    if (!g) return null;
    // REVEAL order, not pack order — the poster has to match the board a class has
    // been reading for three weeks, and p.revealed is the order they met them in
    const byId = (id) => (g.items || []).find((it) => it.id === id);
    const shown = (p.revealed || []).map(byId).filter(Boolean);
    if (!shown.length) return null;
    const toks = gtTokens(p.text || '');
    const marks = gtNormMarks(p.marks, toks.length);
    const parts = [];
    let y = gtHead(parts, g.name, GT_PAD) + 14;

    const swW = 30, boxW = 32, gap = 16;
    const textX = GT_PAD + swW + gap;
    const textW = GT_W - GT_PAD - boxW - gap - textX;
    for (const it of shown) {
      const col = gtColOf(g, it.id);
      const mine = marks.filter((m) => m.item === it.id);
      const lines = gtWrap(it.t, textW, 28, 500);
      y += 8;
      lines.forEach((ln, k) => {
        parts.push('<text x="' + textX + '" y="' + (y + 22 + k * 36) + '" font-family="' + GT_FONT
          + '" font-size="28" font-weight="500" fill="#0f172a">' + xmlEsc(ln) + '</text>');
      });
      parts.push('<rect x="' + GT_PAD + '" y="' + (y + 2) + '" width="' + swW + '" height="' + swW
        + '" rx="6" fill="' + col + '" stroke="#64748b" stroke-width="1.5"/>');
      // the tick box prints as it sits on screen — the screen is already the control
      const bx = GT_W - GT_PAD - boxW;
      parts.push('<rect x="' + bx + '" y="' + (y + 1) + '" width="' + boxW + '" height="' + boxW
        + '" rx="6" fill="#ffffff" stroke="#64748b" stroke-width="2"/>');
      // hand ticks only, the same rule the checklist face now follows: the
      // poster is the thing that goes on the wall, so a box ticked here is the
      // class saying they can do it, never the widget saying it found evidence
      if ((p.ticked || []).includes(it.id)) {
        parts.push('<path d="M' + (bx + 7) + ' ' + (y + 17) + 'l7 7 11-13" stroke="#0f172a"'
          + ' stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
      }
      y += lines.length * 36 + 6;

      // the evidence, directly under its criterion — the whole argument for the widget
      const inX = textX + 12;
      const snipAvail = GT_W - GT_PAD - inX;
      for (const grp of gtSnippetGroups(toks, mine, snipAvail, 22)) {
        let x = inX;
        for (const seg of grp.segs) {
          const wSeg = gtWidth(seg.s, 22, seg.on ? 500 : 400);
          if (seg.on) {
            parts.push('<rect x="' + (x - 3) + '" y="' + (y + 2) + '" width="' + (wSeg + 6)
              + '" height="28" rx="5" fill="' + col + '"/>');
          }
          // the gaps between runs are non-breaking spaces (gtHardSpaces); the
          // attribute is belt-and-braces for the parsed document, not the fix
          parts.push('<text x="' + x + '" y="' + (y + 22) + '" xml:space="preserve" font-family="'
            + GT_FONT + '" font-size="22"' + (seg.on ? ' font-weight="500" fill="#0f172a"' : ' fill="#475569"')
            + '>' + xmlEsc(seg.s) + '</text>');
          x += wSeg;
        }
        y += 34;
      }
      y += 6;
      parts.push('<path d="M' + GT_PAD + ' ' + y + 'H' + (GT_W - GT_PAD)
        + '" stroke="#e2e8f0" stroke-width="1.5" fill="none"/>');
    }
    return gtSvg(parts.join(''), Math.max(y + GT_PAD, 300));
  }

  // §11 addendum (Glenn, 2026-07-28): the marked-up WAGOLL itself prints. The
  // class spent a session finding the evidence; the sheet is that work — the
  // text with its highlights, and a colour key of the criteria they point at,
  // so the artefact stands alone on the wall. Source line breaks are hard
  // breaks (a poem's line breaks ARE the form); everything else wraps against
  // measured widths, and a break only ever happens where the source had a
  // space, so punctuation stays glued to its word.
  function gtTextSvg(p) {
    const g = p.genre;
    if (!g || !p.text) return null;
    const toks = gtTokens(p.text);
    if (!toks.length) return null;
    const marks = gtNormMarks(p.marks, toks.length);
    const size = 30, lh = 44;
    const avail = GT_W - GT_PAD * 2;

    // lines of segments { s, item } — item is a mark's criterion id or null.
    // A gap between two tokens is painted only when one mark covers both sides
    // (object identity: marks are ranges, so the same mark means the same run).
    const lines = [];
    let segs = [], x = 0;
    const put = (s, item) => {
      if (!s) return;
      const last = segs[segs.length - 1];
      if (last && last.item === item) last.s += s;
      else segs.push({ s, item });
      x += gtWidth(s, size, item ? 500 : 400);
    };
    const flush = () => { lines.push(segs); segs = []; x = 0; };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const nl = ((t.pre || '').match(/\n/g) || []).length;
      if (nl && (segs.length || lines.length)) {
        flush();
        if (nl > 1) lines.push(null); // stanza / paragraph gap, one spacer
      }
      const m = gtMarkAt(marks, i);
      const item = m ? m.item : null;
      const gap = nl ? '' : (t.pre || '').replace(/\s+/g, ' ');
      const gapItem = gap && i > 0 && m && gtMarkAt(marks, i - 1) === m ? item : null;
      if (segs.length && gap && x + gtWidth(gap + t.s, size, 400) > avail) {
        flush();
        put(t.s, item);
      } else {
        put(gap, gapItem);
        put(t.s, item);
      }
    }
    flush();

    const parts = [];
    let y = gtHead(parts, g.name + ' — model text', GT_PAD) + 26;
    for (const ln of lines) {
      if (!ln || !ln.length) { y += Math.round(lh * 0.55); continue; }
      let lx = GT_PAD;
      for (const seg of ln) {
        const s = gtHardSpaces(seg.s);
        const wSeg = gtWidth(s, size, seg.item ? 500 : 400);
        if (seg.item) {
          parts.push('<rect x="' + (lx - 3) + '" y="' + (y + 3) + '" width="' + (wSeg + 6)
            + '" height="38" rx="6" fill="' + gtColOf(g, seg.item) + '"/>');
        }
        parts.push('<text x="' + lx + '" y="' + (y + size) + '" xml:space="preserve" font-family="'
          + GT_FONT + '" font-size="' + size + '"' + (seg.item ? ' font-weight="500"' : '')
          + ' fill="#0f172a">' + xmlEsc(s) + '</text>');
        lx += wSeg;
      }
      y += lh;
    }

    // the colour key: every criterion the class actually evidenced, reveal
    // order first — the order they met them in, the poster's rule
    const marked = [];
    const seen = new Set();
    for (const id of p.revealed || []) {
      if (!seen.has(id) && marks.some((m) => m.item === id)) { seen.add(id); marked.push(id); }
    }
    for (const m of marks) {
      if (!seen.has(m.item)) { seen.add(m.item); marked.push(m.item); }
    }
    if (marked.length) {
      y += 16;
      parts.push('<path d="M' + GT_PAD + ' ' + y + 'H' + (GT_W - GT_PAD)
        + '" stroke="#94a3b8" stroke-width="2" fill="none"/>');
      y += 14;
      const sw = 26, tx = GT_PAD + sw + 14, tw = GT_W - GT_PAD - tx;
      for (const id of marked) {
        const it = (g.items || []).find((q) => q.id === id);
        if (!it) continue;
        const ls = gtWrap(it.t, tw, 24, 500);
        parts.push('<rect x="' + GT_PAD + '" y="' + (y + 6) + '" width="' + sw + '" height="' + sw
          + '" rx="6" fill="' + gtColOf(g, id) + '" stroke="#64748b" stroke-width="1.5"/>');
        ls.forEach((l, k) => {
          parts.push('<text x="' + tx + '" y="' + (y + 26 + k * 32) + '" font-family="' + GT_FONT
            + '" font-size="24" font-weight="500" fill="#0f172a">' + xmlEsc(l) + '</text>');
        });
        y += ls.length * 32 + 10;
      }
    }
    return gtSvg(parts.join(''), Math.max(y + GT_PAD, 300));
  }

  function gtBankSvg(p) {
    const g = p.genre;
    if (!gtHasBank(g)) return null;
    const parts = [];
    let y = gtHead(parts, g.name + ' — word bank', GT_PAD) + 26;
    const avail = GT_W - GT_PAD * 2;
    for (const [key, label] of GT_LANG) {
      const words = g.language[key] || [];
      if (!words.length) continue;
      y += 26;
      parts.push('<text x="' + GT_PAD + '" y="' + y + '" font-family="' + GT_FONT
        + '" font-size="26" font-weight="700" fill="#475569">' + xmlEsc(label) + '</text>');
      y += 16;
      let x = GT_PAD;
      for (const wd of words) {
        const cw = gtWidth(wd, 26, 500) + 32;
        if (x > GT_PAD && x + cw > GT_PAD + avail) { x = GT_PAD; y += 50; }
        parts.push('<rect x="' + x + '" y="' + y + '" width="' + cw + '" height="40" rx="8"'
          + ' fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>');
        parts.push('<text x="' + (x + cw / 2) + '" y="' + (y + 27) + '" text-anchor="middle"'
          + ' font-family="' + GT_FONT + '" font-size="26" font-weight="500" fill="#0f172a">'
          + xmlEsc(wd) + '</text>');
        x += cw + 10;
      }
      y += 62;
    }
    return gtSvg(parts.join(''), Math.max(y + GT_PAD, 300));
  }

  // Which sheets exist, and in what order — decided in ONE place, because
  // `toPrintablePages` and `printCurrent` both need the answer and they used to
  // work it out separately. printCurrent restated the presence tests as its own
  // arithmetic and got one of them looser than the builder's: it counted a Model
  // text sheet whenever `text` was truthy, while gtTextSvg also requires the
  // text to tokenise to something. A whitespace-only model text from a
  // hand-authored pack therefore shifted every later index by one, and on the
  // word bank face with a modelwrite sibling supplying Cold and Hot it
  // pre-ticked "Cold task" instead of the word bank — silently, because
  // print.js clamps the index into range.
  //
  // Each predicate below is the same condition its builder guards on. The
  // builders keep their own guards; this is the list, not a replacement for
  // them.
  const GT_PAGES = [
    ['poster', 'Success criteria', gtPosterSvg],
    ['text', 'Model text', gtTextSvg],
    ['bank', 'Word bank', gtBankSvg],
  ];
  function gtPageKinds(p) {
    const g = p && p.genre;
    if (!g) return [];
    const kinds = [];
    if ((p.revealed || []).some((id) => (g.items || []).some((it) => it.id === id))) kinds.push('poster');
    if (p.text && gtTokens(p.text).length) kinds.push('text');
    if (gtHasBank(g)) kinds.push('bank');
    return kinds;
  }
  const GT_FACE_PAGE = { list: 'poster', text: 'text', bank: 'bank' };

  // §11: the Cold and Hot pages join the list when a modelwrite widget on THIS
  // screen carries both bookends. A read plus a public method — modelwrite gains
  // no knowledge of this widget. The widget's own id finds its screen exactly;
  // deck.current can point elsewhere while a pinned screen is being viewed
  // (the sentence builder's note at english-word.js:3197).
  function gtColdHotPages(w) {
    const MW = D.WIDGETS && D.WIDGETS.modelwrite;
    if (!MW || typeof MW.toPrintablePages !== 'function') return [];
    const d = D.deck() || {};
    const screens = d.screens || [];
    const scr = screens.find((s) => (s.widgets || []).some((x) => x && x.id === w.id));
    if (!scr) return [];
    // this screen's widgets first, then any modelwrite pinned "show on all
    // screens" from elsewhere in the deck — a pinned widget lives on its home
    // screen but displays on every one (app.js:9327), so searching only this
    // screen misses the case where the unit is pinned and the toolkit is not
    const siblings = [...(scr.widgets || [])];
    for (const s of screens) {
      if (s === scr) continue;
      for (const x of s.widgets || []) if (x && x.everywhere) siblings.push(x);
    }
    for (const other of siblings) {
      if (!other || other.type !== 'modelwrite' || !other.props) continue;
      const pages = Array.isArray(other.props.pages) ? other.props.pages : [];
      const cold = pages.findIndex((q) => q && q.bookend === 'cold');
      const hot = pages.findIndex((q) => q && q.bookend === 'hot');
      if (cold < 0 || hot < 0) continue;
      let all = [];
      try { all = MW.toPrintablePages(other) || []; } catch (err) { continue; }
      const out = [];
      for (const [i, fallback] of [[cold, 'Cold task'], [hot, 'Hot task']]) {
        if (all[i] && all[i].svg) out.push({ svg: all[i].svg, label: all[i].label || fallback });
      }
      if (out.length === 2) return out;
    }
    return [];
  }

  // ---------------------------------------------------------------- pack files
  // Packs move as files the teacher owns, not over a distribution rail: a rail
  // only pays off when several teachers coordinate, and the unit of adoption here
  // is one teacher on one machine. Plain JSON, no zip — unlike the word bank
  // there are no pictures to carry, and a zip would be ceremony around one file.
  function gtSavePack(w) {
    const g = w.props.genre;
    if (!g) return;
    const name = gtSlug(g.name) + '.genre.json';
    const blob = new Blob([JSON.stringify(gtPackOf(g), null, 2)], { type: 'application/json' });
    // desktop webview: a blob anchor is a silent no-op, the native panel isn't
    if (window.SagePlatform && SagePlatform.saveBlob) {
      SagePlatform.saveBlob(name, blob, 'Genre pack').then((r) => {
        if (r === 'saved') D.toast('Pack saved');
      });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = D.el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function gtOpenPack(w, api) {
    const p = w.props;
    const fileIn = D.el('input', {
      type: 'file', style: 'display:none;', accept: '.json,.genre,application/json', class: 'gt-pack-in',
    });
    // a cancelled picker never fires change, so sweep any earlier stray first
    document.querySelectorAll('.gt-pack-in').forEach((n) => n.remove());
    fileIn.addEventListener('change', () => {
      const f = (fileIn.files || [])[0];
      fileIn.value = '';
      if (!f) return;
      if (f.size > GT_CAP.file) { D.toast('That file is too big to be a genre pack'); return; }
      const fr = new FileReader();
      fr.onerror = () => D.toast('Could not read that file');
      fr.onload = () => {
        let raw = null;
        try { raw = JSON.parse(String(fr.result || '')); }
        catch (err) { D.toast('That is not a genre pack we can read'); return; }
        if (raw && raw.kind && raw.kind !== 'genre') {
          D.toast('That is a ' + gtStr(raw.kind, 20) + ' pack, not a genre one');
          return;
        }
        const res = gtNormalize(raw, false);
        if (!res.genre || !res.genre.items.length) { D.toast('No criteria in that pack'); return; }
        const apply = () => {
          if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Genre toolkit');
          // supersede, never accumulate: the incoming lists replace what was here.
          // An incoming list is somebody's considered current version of it, and
          // half of an old one mixed in is the stale-word problem the rule exists
          // to prevent (Glenn, 2026-07-27).
          gtSetGenre(p, res.genre);
          p.src = null;
          p.revealed = []; p.ticked = []; p.marks = []; p.active = null;
          if (res.genre.model) p.text = res.genre.model;
          D.toast(res.clamped.length ? 'Loaded, trimmed: ' + res.clamped.join(', ')
            : 'Loaded ' + res.genre.name);
          api.refresh();
        };
        // a pack carrying its own model text overwrites the teacher's — so the
        // pasted WAGOLL counts as something to lose, not just reveals and marks
        const losesText = !!(res.genre.model && p.text);
        const losesWork = p.revealed.length || p.marks.length;
        if (p.genre && (losesWork || losesText)) {
          D.confirmDialog('Load “' + res.genre.name + '”? Its criteria and word bank replace what is '
            + 'here'
            + (losesWork ? ', and this unit’s reveals and highlights go with them' : '')
            + (losesText ? '. Its own model text replaces the one you pasted' : '') + '.',
          apply, { label: 'Load', danger: true });
        } else apply();
      };
      fr.readAsText(f);
    });
    // in the document before the click, like every sibling picker — WebKit is
    // within its rights to ignore a click on a detached input
    fileIn.addEventListener('change', () => fileIn.remove(), { once: true });
    document.body.append(fileIn);
    fileIn.click();
  }

  /* ================================================================ story map
     Design: docs/story-map-design.md, folded against .sm-mock.html — the mock is
     the authority on BEHAVIOUR, the spec on the seams and the hazards.

     THE GOVERNING DISCOVERY, and everything else follows from it: THE CHILDREN
     DO NOT TOUCH THE BOARD. The board is for MODELLING; the practice happens on
     thirty drywipe boards in front of it. So gradual release is a first-class
     state, the board lock is a first-class control, the boxing-up face is a
     HANDWRITTEN page the teacher writes on while the class copies from it, and
     the word bank is class-facing furniture to be covered and uncovered rather
     than a teacher's list.

     The second governing sentence, which is why this exists beyond the lesson: a
     moment recorded at the board is evidence for a report written a term later.

     Three lessons, three bits of paper, and all three are describing the same
     five or six boxes — which is why it is one widget with three faces and not
     three widgets. */

  // Caps live in ONE table, because a cap that lives somewhere else is a cap
  // nobody audits. `word` and `words` are REUSED from GT_CAP rather than
  // restated, for the same reason. Channels are 3 and that is a SHAPE, not a
  // cap, so 3 is deliberately not in here.
  const SM_CAP = {
    spine: 16, beats: 6, mapBeats: 96, beat: 140, note: 140,
    lines: 12, moments: 60, axisWord: 24, track: 24, vocabPerBeat: 4,
    writeMin: 2, writeMax: 14,
    strokesPerBox: 300, strokesPerMap: 1200, pointsPerStroke: 3000,
    pic: 64000, picW: 340,
  };

  // Three channels: the colour, the marker shape and the lane are one thing and
  // there are three of them, permanently, because three widely-separated
  // saturated hues is what a badly calibrated interactive whiteboard can
  // actually carry. Widget-internal literals and never var(--…): applyTheme
  // re-declares --ink per widget, and a var() inside a printed SVG string means
  // nothing at all. These are the same three re-declared under .smwidget.
  const SM_CH = [
    { col: '#1d4ed8', shape: 'circle', name: 'blue' },
    { col: '#ea580c', shape: 'square', name: 'orange' },
    { col: '#047857', shape: 'triangle', name: 'green' },
  ];

  const SM_STAGES = [
    ['model', 'Model', 'teacher drives, thinking aloud'],
    ['together', 'Together', 'class contributes, teacher scribes'],
    ['yours', 'Over-to-you', 'their whiteboards now'],
  ];
  const SM_STAGE_IDS = SM_STAGES.map((s) => s[0]);
  const SM_STAGE_NAME = (id) => (SM_STAGES.find((s) => s[0] === id) || SM_STAGES[0])[1];

  // Which part of the arc a word serves, as a sign. Read against the STORY line
  // and nothing else — see smStoryLine.
  const SM_MOODSIGN = { up: 1, mid: 0, down: -1 };
  // Seeding a target from a plan's shape. Clamped to the axis at ±((steps−1)/2),
  // so at five steps a "down" box gets −2 rather than −3.
  const SM_MOODVAL = { up: 2, mid: 0, down: -3 };
  const SM_MOOD_META = [
    ['up', 'for the lifts', '#0d6e66'],
    ['mid', 'for the level', '#5b6b7b'],
    ['down', 'for the falls', '#b02a5b'],
  ];

  // One string per step, top first. The axis words are the class's to change —
  // a class that has agreed "raging" for the bottom of the scale should see
  // "raging" on the board.
  const SM_AXIS_WORDS = {
    5: ['very happy', 'happy', 'all right', 'sad', 'very sad'],
    7: ['as happy as it gets', 'happy', 'a bit happy', 'all right',
      'a bit sad', 'sad', 'as sad as it gets'],
  };
  const smValOfStep = (i, steps) => ((steps - 1) / 2) - i;
  // ONE glyph for a signed numeral, everywhere. The numeral is the cue that
  // survives a reader who has neither the default wording nor the class's
  // replacement, so it cannot be a hyphen-minus on the axis and a U+2212 on the
  // sheet. Every signed number in this widget comes through here.
  const smSigned = (v) => (v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '0');

  /* Writing room is not one size. A Reception child forms block letters an inch
     tall and needs a guide — a baseline to sit on and a dashed midline to reach
     for. Year 6 writes small and at length, so it needs narrow rules and MORE of
     them. Banded default, teacher override, like everything else here.

     The pitches are viewBox UNITS in a fixed 560-unit space, so on screen a band
     is a RELATIVE size and nothing here claims otherwise — the honest millimetre
     claim belongs to the printed sheet, where the paper is a known size. Naming
     these in px on the board would be a claim the widget cannot keep. */
  const SM_RULES = {
    eyfs: { name: 'EYFS · block letters', pitch: 52, guide: true, lines: 3 },
    ks1: { name: 'KS1 · large', pitch: 38, guide: true, lines: 4 },
    lks2: { name: 'Years 3–4', pitch: 26, guide: false, lines: 5 },
    uks2: { name: 'Years 5–6 · long', pitch: 20, guide: false, lines: 9 },
  };
  const SM_RULE_IDS = Object.keys(SM_RULES);
  const SM_WRITE_W = 560;

  /* A SECOND band vocabulary, and it is not gtBandFor's. Writing rules have FOUR
     bands where plans have three, because gtBandFor folds Reception into ks1 —
     and Reception is precisely the band that needs the 52-unit guide. Derived
     from the RAW year group, which is why it is its own function sitting beside
     gtBandFor rather than a call to it. Do not unify the two. */
  const SM_RULE_YEAR = { R: 'eyfs', 1: 'ks1', 2: 'ks1', 3: 'lks2', 4: 'lks2', 5: 'uks2', 6: 'uks2' };
  const smRuleBandFor = (yg) => SM_RULE_YEAR[String(yg == null ? '' : yg)] || 'lks2';

  /* SCORE IS DICTION, not intensity of feeling. "Wistful" scores high because a
     primary writer almost never reaches for it — that the feeling is mild is
     beside the point. Mood and score are INDEPENDENT: mood says which part of
     the arc a word serves, score says how ambitious the language is. Conflating
     them was the error, and only mood ever feeds counterpoint.

     It scores the WORD, never the writing: a 5 in the wrong place is worse than
     a 2 in the right one, and a class chasing high numbers writes purple prose. */
  const SM_LVLNAME = ['plain', 'useful', 'good', 'strong', 'exceptional'];
  const SM_LVLMAX = 4;
  const SM_LADDERS = ['sunflower', 'vine', 'rocket', 'crosshair'];
  const SM_LADDER_BAND = { ks1: 'sunflower', lks2: 'rocket', uks2: 'crosshair' };

  /* Board-facing tags are SINGLE LETTERS for the two that name a NEED. A word
     tagged "EAL" or "SEN" on a surface thirty children read is a signpost to
     which child it is for — the same reason the ambition mark goes on the word
     and never on the person. "pack", "bank" and "HFW" name a kind of WORD, not a
     kind of child, so they read in full.

     That is the test, and the next tag has to pass it: a tag naming a kind of
     word reads in full; a tag naming a need is one letter. */
  const SM_SRC = {
    genre: ['pack', '#0d6e66', '#d5f0ec'],
    bank: ['bank', '#7c3aed', '#ede4fd'],
    eal: ['E', '#b02a5b', '#fbe3ec'],
    sen: ['S', '#b45309', '#fdf0dc'],
    hfw: ['HFW', '#4b5563', '#eceff1'],
  };
  // A teacher types whichever comes to hand; both land on the same key. The
  // settings panel may say EAL and SEN in its own prose — that surface is the
  // teacher's — but the board shows only the letters.
  const SM_SRCALIAS = {
    e: 'eal', eal: 'eal', s: 'sen', sen: 'sen', hfw: 'hfw',
    pack: 'genre', genre: 'genre', bank: 'bank',
  };

  /* The climb, banded. Growth is continuous where rungs are discrete, so the
     sunflower opens rather than steps; the crosshair closes in rather than
     climbs, which is why it earns the top of the school — by Year 6 you are
     aiming, not reaching. A Reception class may want the flower where a Year 2
     class wants the rocket, so the band only picks the default. */
  function smLadderArt(kind, lvl) {
    const l = Math.max(0, Math.min(SM_LVLMAX, lvl | 0));
    const t = l / SM_LVLMAX;
    const g = ['#8b9aa2', '#6b8a86', '#0d6e66', '#a06010', '#b45309'][l] || '#8b9aa2';
    if (kind === 'sunflower') {
      const h = 6 + t * 12, r = 2 + t * 4.8, cy = (19 - h).toFixed(1);
      return '<svg viewBox="0 0 22 22"><path d="M11 20V' + (20 - h).toFixed(1) + '" stroke="#4f7a3a" stroke-width="2"/>'
        + (l > 0 ? '<path d="M11 ' + (20 - h / 2).toFixed(1) + 'l' + (2 + t * 3).toFixed(1) + ' -2" stroke="#4f7a3a" stroke-width="1.6"/>' : '')
        + '<circle cx="11" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="' + (l >= 3 ? '#f5c542' : '#cbd5c0') + '" stroke="' + g + '" stroke-width="1.4"/>'
        + (l >= 3 ? '<circle cx="11" cy="' + cy + '" r="' + (1.2 + t).toFixed(1) + '" fill="#8a5a2b"/>' : '')
        + (l === SM_LVLMAX ? '<g stroke="#f0a92b" stroke-width="1.2"><path d="M4 ' + cy + 'h2M16 ' + cy + 'h2"/></g>' : '')
        + '</svg>';
    }
    if (kind === 'vine') {
      const y = 17 - t * 12;
      return '<svg viewBox="0 0 22 22"><path d="M11 21V2" stroke="#4f7a3a" stroke-width="2"/>'
        + '<circle cx="11" cy="' + y.toFixed(1) + '" r="' + (2.6 + t * 1.4).toFixed(1) + '" fill="' + g + '"/>'
        + '<path d="M11 ' + (y + 3).toFixed(1) + 'q3 3 1 5" stroke="' + g + '" stroke-width="1.4" fill="none"/></svg>';
    }
    if (kind === 'rocket') {
      const y = 17 - t * 13;
      return '<svg viewBox="0 0 22 22"><circle cx="17" cy="4" r="2.6" fill="' + (l === SM_LVLMAX ? '#f5c542' : '#e8e2cf') + '"/>'
        + '<path d="M11 ' + y.toFixed(1) + 'l3 5h-6z" fill="' + g + '"/><path d="M11 ' + y.toFixed(1) + 'l0 -4" stroke="' + g + '" stroke-width="2"/>'
        + (l > 0 ? '<path d="M11 ' + (y + 6).toFixed(1) + 'v' + (l * 2.2).toFixed(1) + '" stroke="#e0a13a" stroke-width="1.8"/>' : '')
        + '</svg>';
    }
    const rr = 9.2 - t * 7;
    return '<svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="9.2" fill="none" stroke="#cfdad7" stroke-width="1.3"/>'
      + '<circle cx="11" cy="11" r="' + rr.toFixed(1) + '" fill="none" stroke="' + g + '" stroke-width="1.8"/>'
      + (l >= 3 ? '<circle cx="11" cy="11" r="' + (l === SM_LVLMAX ? 2 : 1.3) + '" fill="' + g + '"/>' : '')
      + '<path d="M11 1v3M11 18v3M1 11h3M18 11h3" stroke="' + g + '" stroke-width="1.3"/></svg>';
  }

  // ------------------------------------------------------------- the plans
  /* Three homes, one normalised shape: a plan comes from the bundled arc library,
     from the genre pack the toolkit already ships, or from the teacher's own
     rows. Whichever it came from, it is the same five parts by the time anything
     reads it, and arc.src lives INSIDE the arc rather than beside it — a sibling
     field is two writes and two chances to disagree about which plan the rows
     came from.

     Genres are a sort key for the picker and never a filter. An affinity that
     reads as a gate is the kind of key a later reader fixes into a restriction. */
  function smNormArc(raw, keepIds) {
    if (!raw || typeof raw !== 'object') return null;
    const name = gtStr(raw.name, GT_CAP.name);
    if (!name) return null;
    const rows = [];
    const seen = new Set();
    for (const r of Array.isArray(raw.rows) ? raw.rows : (Array.isArray(raw.structure) ? raw.structure : [])) {
      if (rows.length >= GT_CAP.struct) break;
      const box = gtStr(r && r.box, GT_CAP.box);
      if (!box) continue;
      // Row ids are D.uid() and NEVER 'r'+i. Strokes, gap lookups and every
      // beat's row are keyed by row id, so a positional id binds the old third
      // box's handwriting to the new plan's third box — the Problem's writing
      // appearing under "Choices". §6 already refuses matching anything by
      // position; this is that ban, on the id itself.
      let id = keepIds && r && typeof r.id === 'string' && r.id && r.id.length <= 40 ? r.id : D.uid();
      if (seen.has(id)) id = D.uid();
      seen.add(id);
      rows.push({
        id,
        // key is minted from the wording AS AUTHORED, in this pass, because
        // identity cannot be back-filled. Nothing reads it yet; the swap's
        // matcher is deferred and will.
        key: gtStr(r && r.key, GT_CAP.box) || gtSlug(box),
        box,
        hint: gtStr(r && r.hint, GT_CAP.hint),
        mood: gtMood(r && r.mood),
        edited: !!(r && r.edited),
      });
    }
    if (!rows.length) return null;
    const shape = raw.shape !== false;
    return {
      src: gtStr(raw.src || raw.id, GT_CAP.id) || null,
      name,
      band: GT_BAND_IDS.includes(raw.band) ? raw.band : null,
      shape,
      steps: raw.steps === 5 || raw.steps === 7 ? raw.steps : null,
      // A mood with no graph to seed is dead data that reads as authored.
      rows: rows.map((r) => (shape ? r : Object.assign(r, { mood: null }))),
    };
  }

  // Mirrors gtDefaults exactly, including the fresh-ids-on-every-read rule: two
  // story maps on one plan are two independent lesson artefacts, and sharing row
  // ids between them would bind one map's handwriting to the other's boxes.
  let smArcCache = null;
  function smArcLib() {
    if (!smArcCache) {
      const packs = Array.isArray(window.SAGE_ENGLISH_PACKS) ? window.SAGE_ENGLISH_PACKS : [];
      const out = [];
      for (const b of packs) {
        if (!b) continue;
        if (b.kind === 'arc') {
          for (const a of Array.isArray(b.arcs) ? b.arcs : []) {
            const n = smNormArc(a, false);
            if (n) out.push(n);
          }
        } else if (b.kind === 'genre' && Array.isArray(b.structure) && b.structure.length) {
          // the genre pack's own structure IS a plan — the toolkit and the story
          // map are describing the same boxes and there is no second list
          const n = smNormArc({
            id: b.id, name: b.name, band: null, shape: b.shape, rows: b.structure,
          }, false);
          if (n) out.push(n);
        }
      }
      smArcCache = out;
    }
    return smArcCache.map((a) => smNormArc(a, false));
  }

  // ------------------------------------------------------------- coercion
  /* Field by field, so an unknown key is dropped BY CONSTRUCTION rather than by a
     list of keys to delete — never a spread of the parsed value. This is the one
     door between a saved blob and everything downstream, and the discipline is
     what stops a hostile or a stale props object reaching a face. */
  const smWhite = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const smInt = (v, lo, hi, dflt) => {
    const n = Math.round(+v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };

  // ONE word normaliser, used by the pack seed, the capture bar, the paste rail
  // and the coercion alike — a second one is how a src alias works in one place
  // and not another.
  function smWord(raw) {
    const o = raw && typeof raw === 'object' ? raw : { w: raw };
    const w = gtStr(o.w, GT_CAP.word);
    if (!w) return null;
    const key = String(o.src == null ? '' : o.src).toLowerCase();
    return {
      w,
      src: SM_SRCALIAS[key] || 'bank',
      lvl: smInt(o.lvl, 0, SM_LVLMAX, 2),
      mood: gtMood(o.mood) || 'mid',
      beyond: !!o.beyond,
    };
  }

  function smNorm(p) {
    const arc = smNormArc(p.arc, true);
    p.arc = arc;
    p.allBands = !!p.allBands;
    p.shape = arc ? arc.shape : true;

    const rowIds = new Set(arc ? arc.rows.map((r) => r.id) : []);

    // TRACKS. Identity is the explicit `ch` field, never the array position —
    // the sentence builder's recorded regression is why. There, mount's
    // filter(Boolean) collapsed a positional pair, so filling "The broken one"
    // first PROMOTED the broken sentence into the "Done right" slot on the next
    // remount: the error presented as the model. Array position may never BE
    // identity. With ch on the entry the array can be any length, compaction is
    // harmless, and "no line ever changes colour because another was hidden" is
    // true by construction rather than by a ban on splice.
    const tracks = [];
    const tSeen = new Set();
    for (const t of Array.isArray(p.tracks) ? p.tracks : []) {
      if (tracks.length >= SM_CAP.lines) break;
      const name = gtStr(t && t.name, SM_CAP.track);
      if (!name) continue;
      let id = t && typeof t.id === 'string' && t.id && t.id.length <= 40 ? t.id : D.uid();
      if (tSeen.has(id)) id = D.uid();
      tSeen.add(id);
      tracks.push({
        id, name,
        on: !!(t && t.on),
        kind: smWhite(t && t.kind, ['actual', 'target'], 'actual'),
        ch: smInt(t && t.ch, 0, 2, 0),
      });
    }
    // at most one line on air per channel — the board never shows four
    for (let ch = 0; ch < 3; ch++) {
      let live = false;
      for (const t of tracks) {
        if (t.ch !== ch || !t.on) continue;
        if (live) t.on = false; else live = true;
      }
    }
    p.tracks = tracks;
    const visible = tracks.filter((t) => t.on);
    // armed is ONE id outside the entries, because `on` is three independent
    // truths and armed is one — and one truth stored in three places is a state
    // that can say two lines are armed at once. Resolved by walking CHANNELS,
    // never array order.
    p.armed = visible.some((t) => t.id === p.armed) ? p.armed
      : (smByChannel(visible)[0] || { id: null }).id;
    const tIds = new Set(tracks.map((t) => t.id));

    // BEATS. row is a box id and never an index, and MOUNT NEVER FILTERS THIS
    // ARRAY BY ROW ID: nothing but a hand ever deletes a beat. A one-line sweep
    // against live row ids is the erase-resurrect class of bug, and orphans go
    // in a tray instead — see the tray at the head of the map face.
    const beats = [];
    for (const b of Array.isArray(p.beats) ? p.beats : []) {
      if (beats.length >= SM_CAP.mapBeats) break;
      if (!b || typeof b !== 'object') continue;
      const v = {};
      const src = b.v && typeof b.v === 'object' ? b.v : {};
      // keyed by TRACK id, not by (emo, track): the latter makes a beat belong
      // to exactly one line, which makes "the same beat on two lines" —
      // the whole point of the graph — unrepresentable
      for (const k of Object.keys(src)) {
        if (!tIds.has(k)) continue;
        const n = Math.round(+src[k]);
        if (Number.isFinite(n)) v[k] = Math.max(-3, Math.min(3, n));
      }
      const vocab = [];
      for (const wd of Array.isArray(b.vocab) ? b.vocab : []) {
        const s = gtStr(wd, GT_CAP.word);
        // attached words are NOT pruned against the bank: a word the class chose
        // and attached is typed work, not derived state — deliberately the
        // opposite of what this file does to reveals, ticks and marks
        if (s && vocab.length < SM_CAP.vocabPerBeat && !vocab.includes(s)) vocab.push(s);
      }
      const img = typeof b.img === 'string' && b.img.slice(0, 5) === 'data:'
        && b.img.length <= SM_CAP.pic ? b.img : null;
      beats.push({
        id: typeof b.id === 'string' && b.id && b.id.length <= 40 ? b.id : D.uid(),
        row: gtStr(b.row, 40),
        // a fractional sort key within a box, so no INDEX is ever a reference and
        // a delete cannot shift what a later beat means
        ord: Number.isFinite(+b.ord) ? +b.ord : beats.length + 1,
        t: gtStr(b.t, SM_CAP.beat),
        note: gtStr(b.note, SM_CAP.note),
        img, vocab, v,
      });
    }
    p.beats = beats;

    // WORDS. Deduped case-insensitively through the one normaliser.
    const words = [];
    const wSeen = new Set();
    for (const raw of Array.isArray(p.words) ? p.words : []) {
      if (words.length >= GT_CAP.lang) break;
      const o = smWord(raw);
      if (!o || wSeen.has(o.w.toLowerCase())) continue;
      wSeen.add(o.w.toLowerCase());
      words.push(o);
    }
    p.words = words;
    p.wordsHidden = !!p.wordsHidden;
    // `shown` IS derived state — it is a per-word reveal against a live list —
    // so pruning it is right, and it is the exact opposite of b.vocab above
    const shown = {};
    const forms = new Set(words.map((o) => o.w));
    for (const k of Object.keys(p.shown && typeof p.shown === 'object' ? p.shown : {})) {
      if (forms.has(k)) shown[k] = true;
    }
    p.shown = shown;
    p.ladder = smWhite(p.ladder, SM_LADDERS, 'rocket');

    // MOMENTS. Snapshots, never references: renaming the plan later does not
    // change a recorded moment, because a moment is what happened.
    const moments = [];
    for (const m of Array.isArray(p.moments) ? p.moments : []) {
      if (moments.length >= SM_CAP.moments) break;
      const w = gtStr(m && m.w, GT_CAP.word);
      if (!w) continue;
      moments.push({
        w,
        score: smInt(m && m.score, 1, 5, 5),
        who: gtStr(m && m.who, 40) || null,
        box: gtStr(m && m.box, GT_CAP.box) || null,
        beat: gtStr(m && m.beat, SM_CAP.beat) || null,
        plan: gtStr(m && m.plan, GT_CAP.name) || null,
        unit: gtStr(m && m.unit, GT_CAP.name) || null,
        stage: smWhite(m && m.stage, SM_STAGE_IDS, 'model'),
        at: Number.isFinite(+(m && m.at)) ? +m.at : 0,
      });
    }
    p.moments = moments;

    // STROKES. Keyed by row id, exactly as p.beats[].row is — so the warning
    // that lives on the beats belongs here too, in the same breath: a sweep of
    // p.strokes against live row ids silently erases a class's modelled write.
    // Orphaned strokes are not RENDERED (there is no face to render them on) but
    // they are not deleted, and a box restored by name gets its writing back.
    const strokes = {};
    const raw = p.strokes && typeof p.strokes === 'object' ? p.strokes : {};
    let total = 0;
    for (const k of Object.keys(raw)) {
      const list = [];
      for (const s of Array.isArray(raw[k]) ? raw[k] : []) {
        if (list.length >= SM_CAP.strokesPerBox || total >= SM_CAP.strokesPerMap) break;
        if (!s || !Array.isArray(s.pts) || s.pts.length < 2) continue;
        let pts = s.pts.slice(0, SM_CAP.pointsPerStroke * 2)
          .map((n) => Math.round(+n) || 0);
        if (pts.length & 1) pts = pts.slice(0, -1);
        if (pts.length < 2) continue;
        const st = { c: /^#[0-9a-f]{3,8}$/i.test(String(s.c)) ? s.c : '#1e2c33', w: smInt(s.w, 1, 40, 6), pts };
        if (Array.isArray(s.pw) && s.pw.length === pts.length >> 1) {
          st.pw = s.pw.map((n) => smInt(n, 1, 60, st.w));
        }
        list.push(st);
        total++;
      }
      if (list.length) strokes[gtStr(k, 40)] = list;
    }
    p.strokes = strokes;

    p.rule = smWhite(p.rule, SM_RULE_IDS, 'lks2');
    p.lines = smInt(p.lines, SM_CAP.writeMin, SM_CAP.writeMax, SM_RULES[p.rule].lines);
    p.stage = smWhite(p.stage, SM_STAGE_IDS, 'model');
    p.lock = !!p.lock;
    p.room = smWhite(p.room, ['board', 'table'], 'board');
    p.face = smWhite(p.face, ['map', 'box', 'graph'], 'map');
    // shape:false suppresses the graph face entirely, the way the word bank face
    // is suppressed for a pack with no bank — the flag lives on the arc and is
    // never derived from the genre id, because a water-cycle explanation and a
    // diary are both "text" and only one of them is a story in time
    if (!p.shape && p.face === 'graph') p.face = 'map';
    p.refMode = smWhite(p.refMode, ['strip', 'side'], 'strip');
    p.coverMap = !!p.coverMap;
    p.coverBox = !!p.coverBox;
    p.coverGraph = !!p.coverGraph;
    p.steps = p.steps === 5 ? 5 : 7;
    const axis = [];
    for (let i = 0; i < p.steps; i++) {
      axis.push(gtStr((Array.isArray(p.axisWords) ? p.axisWords : [])[i], SM_CAP.axisWord)
        || SM_AXIS_WORDS[p.steps][i]);
    }
    p.axisWords = axis;
    // open stays pruned EMPTY, not filtered: a map opens showing the map, and a
    // panel is something a hand asks for
    p.open = null;
    p.capL = smInt(p.capL, 0, SM_LVLMAX, 2);
    p.capM = gtMood(p.capM) || 'mid';
    // rowIds is computed but deliberately unused against beats and strokes — see
    // the two comments above. Kept named so the next reader sees the omission is
    // a decision rather than an oversight.
    void rowIds;
    return p;
  }

  // ------------------------------------------------------------- derived reads
  // Channel order, never array order. The counterpoint reference and the gap
  // reference both resolve through here, so neither can silently re-point at a
  // different line because an entry moved or a line was deleted.
  const smByChannel = (list) => [0, 1, 2]
    .map((ch) => list.find((t) => t.ch === ch)).filter(Boolean);
  const smRows = (p) => (p.arc ? p.arc.rows : []);
  const smBeats = (p, rowId) => p.beats.filter((b) => b.row === rowId)
    .sort((a, b) => a.ord - b.ord);
  const smOrphans = (p) => {
    const ids = new Set(smRows(p).map((r) => r.id));
    return p.beats.filter((b) => !ids.has(b.row));
  };
  const smVisible = (p) => smByChannel(p.tracks.filter((t) => t.on));
  const smArmedTrack = (p) => p.tracks.find((t) => t.id === p.armed && t.on) || null;
  /* The reference is FIXED at channel order, never at whatever happens to be
     armed, because counterpoint is against the STORY's tone. That is what The
     Road is doing: bleak story, characters joking. A later tidy that re-points
     this at the armed line breaks the device silently, which is why it says so
     here, where the rule is written. */
  const smStoryLine = (p) => smByChannel(p.tracks.filter((t) => t.kind !== 'target'))[0] || null;
  const smActual = (p) => p.tracks.filter((t) => t.kind === 'actual');

  /* Two independent readings, never multiplied together. DIRECTION is the word's
     mood against the beat's tone; the SCORE never enters this at all. Words
     offered against the tone are a CHOICE, not a warning — The Road's characters
     crack jokes, and gallows humour and bathos are devices with names. So
     nothing anywhere calls one wrong. */
  function smReadWord(word, beatVal) {
    if (beatVal == null) return null;
    const sign = SM_MOODSIGN[word.mood || 'mid'];
    if (sign === 0) return { k: 'level', say: 'level' };
    if (beatVal !== 0 && Math.sign(sign) !== Math.sign(beatVal)) {
      return { k: 'counter', say: 'counterpoint' };
    }
    return { k: 'serves', say: 'serves the tone' };
  }

  /* The one thing that ties the three faces together: a box's target is set on
     the graph and READ where the writing happens. Without this the graph is a
     picture beside the work rather than the brief for it.

     Both numbers round to whole ones. A box averaging 0, 0 and −1 is about zero
     to a class; at −0.3 it is a spreadsheet talking, and this number gets read
     aloud. */
  function smGapOf(p, rowId) {
    if (!p.shape) return null;
    const act = smVisible(p).find((t) => t.kind === 'actual');
    const tgt = smVisible(p).find((t) => t.kind === 'target');
    if (!act || !tgt) return null;
    const list = smBeats(p, rowId);
    const a = list.filter((b) => b.v[act.id] != null).map((b) => b.v[act.id]);
    const g = list.filter((b) => b.v[tgt.id] != null).map((b) => b.v[tgt.id]);
    if (!a.length || !g.length) return null;
    const avg = (xs) => Math.round(xs.reduce((n, x) => n + x, 0) / xs.length);
    return { at: avg(a), want: avg(g) };
  }

  /* TWO tests, and they are two because the swap destroys nothing and they ask
     different questions. Folding them back into one is the drift to watch for,
     because the symmetry is inviting — and what it costs is a teacher told she
     may not change the spine on the grounds that she has typed one beat. */
  const smWritten = (p) => Object.keys(p.strokes || {}).some((k) => (p.strokes[k] || []).length);
  // Only ACTUAL values close the swap window. Seeding the target from a plan's
  // shape is a RESOURCE act that writes a value to every moody box, and counting
  // it here would let one gear tap permanently shut the window on a map holding
  // no class work at all. This is the same helper the reset and the work count
  // use — one restatement drifting looser is how the wrong sheet got ticked.
  const smPlotted = (p) => {
    const act = smActual(p);
    return p.beats.some((b) => act.some((t) => b.v[t.id] != null));
  };
  const smAxisSet = (p) => (p.axisWords || [])
    .some((s, i) => s !== (SM_AXIS_WORDS[p.steps] || [])[i]);

  /* What belongs to THIS class rather than to the resource, stated as a COUNT
     before it goes — a reset that does not say what it is about to take is a
     reset nobody trusts. */
  function smClassWork(p) {
    const boxes = Object.keys(p.strokes).filter((k) => (p.strokes[k] || []).length).length;
    const act = smActual(p);
    let plotted = 0;
    for (const b of p.beats) for (const t of act) if (b.v[t.id] != null) plotted++;
    const moments = p.moments.length;
    const bits = [];
    if (boxes) bits.push(boxes + ' box' + (boxes === 1 ? '' : 'es') + ' of writing');
    if (plotted) bits.push(plotted + ' plotted feeling' + (plotted === 1 ? '' : 's'));
    if (moments) bits.push(moments + ' recorded moment' + (moments === 1 ? '' : 's'));
    return { any: bits.length > 0, say: bits.join(', ').replace(/, ([^,]*)$/, ' and $1'), boxes, plotted, moments };
  }

  // ------------------------------------------------------------- the writing surface
  const smRuleSet = (p) => SM_RULES[p.rule] || SM_RULES.lks2;
  // "room for the last descender" — the 0.35 of a pitch below the final rule.
  // The sheet takes its viewBox from THIS, not from a literal, which is what
  // makes handwriting print as written at every band rather than only at the one
  // that happened to be eyeballed.
  const smWriteH = (p) => {
    const rs = smRuleSet(p);
    return Math.round(rs.pitch * p.lines + rs.pitch * 0.35);
  };
  function smRuleMarkup(p) {
    const rs = smRuleSet(p);
    let s = '';
    for (let i = 1; i <= p.lines; i++) {
      const y = rs.pitch * i;
      s += '<line x1="10" y1="' + y + '" x2="' + (SM_WRITE_W - 10) + '" y2="' + y
        + '" stroke="#b6c2d1" stroke-width="1.6"/>';
      // the letter a child aims at: sit on the solid line, reach the dashed one
      if (rs.guide) {
        const g = (y - rs.pitch * 0.45).toFixed(1);
        s += '<line x1="10" y1="' + g + '" x2="' + (SM_WRITE_W - 10) + '" y2="' + g
          + '" stroke="#cfd8e3" stroke-width="1.2" stroke-dasharray="9 7"/>';
      }
    }
    return s;
  }

  // ------------------------------------------------------------- the graph
  /* Geometry, shared by the face and the printed sheet so the two cannot
     disagree. Beats sit at a FIXED pitch from the band's left edge, taken from
     the CAP and never from the live count — dividing by how many beats a band
     holds means adding a fifth beat moves the four the class is already reading,
     which is the one thing this widget's whole creed forbids.

     ghosts and cover are OPTIONS and both are off for a sheet. A hollow dot on
     the zero line reads on paper as a plotted zero, and it is worse now that a
     placed TARGET dot is also hollow — a printed hollow dot would mean either
     "we want it here" or "nobody chose". No sheet draws a ghost and no sheet
     reads a cover flag. */
  function smGraphMarkup(p, o) {
    const compact = !!o.compact;
    const ghosts = !!o.ghosts;
    const cover = !!o.cover;
    const W = 1000, H = compact ? 200 : 440;
    const padL = compact ? 58 : 126, padR = 28, padT = 16, padB = compact ? 42 : 98;
    const rows = smRows(p);
    if (!rows.length) return { svg: '', W, H };
    const bw = (W - padL - padR) / rows.length;
    const zero = padT + (H - padT - padB) / 2, half = (H - padT - padB) / 2;
    const yOf = (v) => zero - (v / ((p.steps - 1) / 2)) * half;
    const DIA = compact ? 12 : 18, R = compact ? 5.5 : 8.5;
    const bx = (ri, bi, ch) => padL + ri * bw + (bw / (SM_CAP.beats + 1)) * (bi + 1) + (ch - 1) * DIA;
    const armed = ghosts ? (smArmedTrack(p) || {}).id : null;
    const vis = smVisible(p);
    let s = '';
    for (let i = 0; i < p.steps; i++) {
      const v = smValOfStep(i, p.steps), y = yOf(v), z = v === 0;
      s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y
        + '" stroke="' + (z ? '#aebbb7' : '#e9eeed') + '" stroke-width="' + (z ? 2 : 1) + '"/>';
      s += '<text x="' + (padL - 11) + '" y="' + (y + 4) + '" text-anchor="end" font-size="'
        + (compact ? 11 : 13) + '" font-family="' + GT_FONT + '" fill="' + (z ? '#5b6b7b' : '#7f8f96') + '">'
        + '<tspan font-weight="800" font-size="' + (compact ? 12 : 14) + '">' + xmlEsc(smSigned(v)) + '</tspan>'
        + (compact ? '' : '<tspan dx="7">' + xmlEsc(p.axisWords[i] || '') + '</tspan>') + '</text>';
    }
    rows.forEach((r, ri) => {
      if (ri) {
        s += '<line x1="' + (padL + ri * bw) + '" y1="' + padT + '" x2="' + (padL + ri * bw)
          + '" y2="' + (H - padB) + '" stroke="#e9eeed"/>';
      }
      if (!cover) {
        s += '<text x="' + (padL + ri * bw + bw / 2) + '" y="' + (H - padB + (compact ? 21 : 28))
          + '" text-anchor="middle" font-size="' + (compact ? 11 : 13.5)
          + '" font-weight="800" letter-spacing="0.4" font-family="' + GT_FONT
          + '" fill="#0f766e">' + xmlEsc(r.box.toUpperCase()) + '</text>';
      }
    });
    // the gap ribbon first, so both lines sit on top of it. Drawn at the CENTRE
    // lane deliberately — it describes a REGION, not a line, so it does not sit
    // exactly between the two polylines it is about.
    const act = vis.find((t) => t.kind === 'actual');
    const tgt = vis.find((t) => t.kind === 'target');
    if (act && tgt) {
      const a = [], g = [];
      rows.forEach((r, ri) => smBeats(p, r.id).forEach((b, bi) => {
        if (b.v[act.id] == null || b.v[tgt.id] == null) return;
        const x = bx(ri, bi, 1).toFixed(1);
        a.push(x + ',' + yOf(b.v[act.id]).toFixed(1));
        g.push(x + ',' + yOf(b.v[tgt.id]).toFixed(1));
      }));
      if (a.length > 1) {
        s += '<polygon points="' + a.concat(g.reverse()).join(' ') + '" fill="#7c3aed" opacity="'
          + (compact ? 0.09 : 0.11) + '"/>';
      }
    }
    for (const t of vis) {
      const pts = [];
      rows.forEach((r, ri) => smBeats(p, r.id).forEach((b, bi) => {
        // the line joins only PLACED dots: a line drawn through unplaced beats
        // would assert feelings nobody chose — and it prints
        if (b.v[t.id] != null) pts.push(bx(ri, bi, t.ch).toFixed(1) + ',' + yOf(b.v[t.id]).toFixed(1));
      }));
      if (pts.length > 1) {
        s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + SM_CH[t.ch].col
          + '" stroke-width="' + (compact ? 2.2 : 3.4) + '" stroke-linejoin="round" stroke-linecap="round"'
          + (t.kind === 'target' ? ' stroke-dasharray="' + (compact ? '6 4' : '9 6') + '"' : '') + '/>';
      }
    }
    rows.forEach((r, ri) => smBeats(p, r.id).forEach((b, bi) => {
      for (const t of vis) {
        const x = bx(ri, bi, t.ch);
        if (b.v[t.id] != null) s += smDot(x, yOf(b.v[t.id]), t.ch, t.kind === 'target', R, b.id);
        else if (t.id === armed) s += smDot(x, zero, t.ch, true, R, b.id);
      }
      // NO per-beat text label under the axis, and the arithmetic is why. Beats
      // sit at a fixed pitch of bw/(cap+1) so a new one cannot move the ones the
      // class is reading — at six boxes across a 1000-unit plot that pitch is
      // about 20 units, and at three boxes about 40. No wording fits either, so
      // the mock's 16-character label draws every beat in a box on top of the
      // one beside it. Measured on the board, 2026-07-31.
      //
      // The dot is the affordance instead: it carries data-beat, so tapping it
      // opens that beat's panel, which names it in full. The box name under the
      // axis is the label that survives, and it is the one that has room.
    }));
    return { svg: s, W, H };
  }
  function smDot(x, y, ch, hollow, R, id) {
    const col = SM_CH[ch].col;
    const f = hollow ? '#ffffff' : col, sw = hollow ? 2.4 : 1.8;
    const a = id ? ' data-beat="' + xmlEsc(id) + '"' : '';
    if (SM_CH[ch].shape === 'square') {
      return '<rect x="' + (x - R) + '" y="' + (y - R) + '" width="' + (2 * R) + '" height="' + (2 * R)
        + '" rx="2" fill="' + f + '" stroke="' + col + '" stroke-width="' + sw + '"' + a + '/>';
    }
    if (SM_CH[ch].shape === 'triangle') {
      return '<polygon points="' + x + ',' + (y - R - 1) + ' ' + (x + R + 1) + ',' + (y + R) + ' '
        + (x - R - 1) + ',' + (y + R) + '" fill="' + f + '" stroke="' + col + '" stroke-width="' + sw + '"' + a + '/>';
    }
    return '<circle cx="' + x + '" cy="' + y + '" r="' + R + '" fill="' + f + '" stroke="' + col
      + '" stroke-width="' + sw + '"' + a + '/>';
  }

  // ------------------------------------------------------------- the sheets
  /* Three SVG STRING emitters, not a port of an HTML sheet: print.js's lint
     requires a root <svg> with a viewBox and errors on <foreignObject> and on a
     <style> holding anything but @font-face, so none of a div-built sheet is
     buildable. Everything needed is already private in this file — gtSvg,
     gtHead's shrink-to-fit title, gtWidth's measured widths, gtWrap and xmlEsc.

     All three are ONE aspect (1000 × at least 1414), because openDialog plans
     page 1 freely and forces the rest to agree: a landscape graph sheet ticked
     beside a tall map sheet would letterbox catastrophically.

     No sheet reads a cover flag and no sheet draws a ghost. And no sheet carries
     a child's name — a moment's `who` is screen-only in v1, because the map
     sheet is the one that goes home in a book bag and a named child's attainment
     in thirty other families' bags is a disclosure nothing here has reasoned
     about. §14 rule 5's "no child names" governs PACK text and does NOT cover
     this, which is why it is said again, here. */
  const SM_SHEET_H = 1414;
  const smSheetTitle = (p, what) => (p.arc ? p.arc.name : 'Story map') + ' — ' + what;

  function smMapSvg(p) {
    const parts = [];
    let y = gtHead(parts, smSheetTitle(p, 'the map'), 10) + 34;
    const rows = smRows(p);
    for (const r of rows) {
      const list = smBeats(p, r.id);
      parts.push('<text x="' + GT_PAD + '" y="' + y + '" font-family="' + GT_FONT
        + '" font-size="21" font-weight="800" fill="#0f766e">' + xmlEsc(r.box.toUpperCase()) + '</text>');
      if (r.hint) {
        parts.push('<text x="' + (GT_PAD + gtWidth(r.box.toUpperCase(), 21, 800) + 14) + '" y="' + y
          + '" font-family="' + GT_FONT + '" font-size="15" font-style="italic" fill="#8b9aa2">'
          + xmlEsc(r.hint) + '</text>');
      }
      y += 12;
      if (!list.length) {
        y += 26;
        parts.push('<text x="' + GT_PAD + '" y="' + y + '" font-family="' + GT_FONT
          + '" font-size="15" font-style="italic" fill="#b6c2d1">nothing here yet</text>');
        y += 30;
        continue;
      }
      const cw = 172, gap = 14;
      const perRow = Math.max(1, Math.floor((GT_W - GT_PAD * 2 + gap) / (cw + gap)));
      let cellTop = y + 14;
      list.forEach((b, i) => {
        const col = i % perRow;
        if (col === 0 && i) cellTop += 176;
        const x = GT_PAD + col * (cw + gap);
        parts.push('<rect x="' + x + '" y="' + cellTop + '" width="' + cw + '" height="164" rx="9" fill="#ffffff" stroke="#cfdad7"/>');
        if (b.img) {
          parts.push('<image x="' + (x + 7) + '" y="' + (cellTop + 7) + '" width="' + (cw - 14)
            + '" height="70" preserveAspectRatio="xMidYMid slice" href="' + xmlEsc(b.img) + '"/>');
        } else {
          parts.push('<rect x="' + (x + 7) + '" y="' + (cellTop + 7) + '" width="' + (cw - 14)
            + '" height="70" rx="6" fill="none" stroke="#e4eae8" stroke-dasharray="5 5"/>');
        }
        const lines = gtWrap(b.t || '…', cw - 16, 13, 500).slice(0, 4);
        lines.forEach((ln, li) => parts.push('<text x="' + (x + 8) + '" y="' + (cellTop + 96 + li * 17)
          + '" font-family="' + GT_FONT + '" font-size="13" font-weight="500" fill="#1e2c33">' + xmlEsc(ln) + '</text>'));
        b.vocab.slice(0, 3).forEach((wd, wi) => parts.push('<text x="' + (x + 8) + '" y="' + (cellTop + 152 - wi * 15)
          + '" font-family="' + GT_FONT + '" font-size="11.5" font-weight="700" fill="#0a544e">' + xmlEsc(wd) + '</text>'));
      });
      y = cellTop + 190;
    }
    return gtSvg(parts.join(''), Math.max(SM_SHEET_H, y + 40));
  }

  function smBoxSvg(p) {
    const parts = [];
    let y = gtHead(parts, smSheetTitle(p, 'boxing up'), 10) + 30;
    const rs = smRuleSet(p);
    const wh = smWriteH(p);
    const colW = 250, gap = 20;
    const writeX = GT_PAD + colW + gap;
    const writeW = GT_W - GT_PAD - writeX;
    // the printed surface takes its height from the SAME ruleSet/lines pass the
    // face used, so the aspect is right at every band and at every line count
    const scale = writeW / SM_WRITE_W;
    for (const r of smRows(p)) {
      const list = smBeats(p, r.id);
      const cellH = Math.max(96, Math.round(wh * scale) + 22, list.length * 44 + 46);
      parts.push('<line x1="' + GT_PAD + '" y1="' + y + '" x2="' + (GT_W - GT_PAD) + '" y2="' + y
        + '" stroke="#dbe3e1"/>');
      parts.push('<text x="' + GT_PAD + '" y="' + (y + 26) + '" font-family="' + GT_FONT
        + '" font-size="17" font-weight="800" fill="#0f766e">' + xmlEsc(r.box.toUpperCase()) + '</text>');
      gtWrap(r.hint || '', colW - 6, 12.5, 400).slice(0, 2).forEach((ln, li) => parts.push(
        '<text x="' + GT_PAD + '" y="' + (y + 44 + li * 15) + '" font-family="' + GT_FONT
        + '" font-size="12.5" font-style="italic" fill="#8b9aa2">' + xmlEsc(ln) + '</text>'));
      let my = y + 74;
      for (const b of list) {
        gtWrap(b.t || '…', colW - 8, 12.5, 400).slice(0, 2).forEach((ln, li) => parts.push(
          '<text x="' + GT_PAD + '" y="' + (my + li * 15) + '" font-family="' + GT_FONT
          + '" font-size="12.5" fill="#40525c">' + xmlEsc(ln) + '</text>'));
        my += 34;
      }
      const ink = p.strokes[r.id] || [];
      const gy = y + 12;
      parts.push('<rect x="' + writeX + '" y="' + gy + '" width="' + writeW + '" height="'
        + Math.round(wh * scale) + '" rx="6" fill="#fffdf7" stroke="#e4eae8"/>');
      // Ruled UNDER the writing at the guided bands, because those are the bands
      // whose whole purpose is letter formation against a line — a child's
      // letters floating with no baseline defeats the sheet.
      const ruled = rs.guide || !ink.length;
      parts.push('<g transform="translate(' + writeX + ' ' + gy + ') scale(' + scale.toFixed(4) + ')">'
        + (ruled ? smRuleMarkup(p) : '')
        + (window.SagePen ? window.SagePen.markup(ink) : '') + '</g>');
      y += cellH;
    }
    return gtSvg(parts.join(''), Math.max(SM_SHEET_H, y + 40));
  }

  function smGraphSvg(p) {
    const parts = [];
    let y = gtHead(parts, smSheetTitle(p, 'the shape'), 10) + 20;
    const g = smGraphMarkup(p, { compact: false, ghosts: false, cover: false });
    if (!g.svg) return null;
    const w = GT_W - GT_PAD * 2;
    const scale = w / g.W;
    parts.push('<g transform="translate(' + GT_PAD + ' ' + y + ') scale(' + scale.toFixed(4) + ')">' + g.svg + '</g>');
    y += Math.round(g.H * scale) + 34;
    // A key that stands alone: swatch, wording, shape AND the dashed/solid
    // distinction — a shape-and-name key with no swatch regresses the rule that
    // a printed sheet has to be readable without the board beside it.
    let kx = GT_PAD;
    for (const t of smVisible(p)) {
      parts.push('<g transform="translate(' + kx + ' ' + y + ')">'
        + smDot(11, -5, t.ch, t.kind === 'target', 9, null)
        + '<line x1="26" y1="-5" x2="66" y2="-5" stroke="' + SM_CH[t.ch].col + '" stroke-width="3.4"'
        + (t.kind === 'target' ? ' stroke-dasharray="9 6"' : '') + '/>'
        + '<text x="76" y="0" font-family="' + GT_FONT + '" font-size="15" font-weight="700" fill="#1e2c33">'
        + xmlEsc(t.name) + (t.kind === 'target' ? ' — where we want it' : '') + '</text></g>');
      kx += 110 + gtWidth(t.name + (t.kind === 'target' ? ' — where we want it' : ''), 15, 700);
      if (kx > GT_W - 260) { kx = GT_PAD; y += 34; }
    }
    return gtSvg(parts.join(''), Math.max(SM_SHEET_H, y + 60));
  }

  /* Page kinds ARE face ids, and the presence test is THE SAME NAMED FUNCTION
     called from the builder's first line and from the kind list — because one
     restatement being looser is exactly how the wrong sheet got pre-ticked
     before. `i < 0 ? 0 : i` and never `|| 0`: (−1) || 0 is −1. */
  const SM_PAGES = [
    ['map', 'The map', smMapSvg],
    ['box', 'Boxing up', smBoxSvg],
    ['graph', 'The shape', smGraphSvg],
  ];
  function smHasPage(p, kind) {
    if (!p.arc || !smRows(p).length) return false;
    if (kind === 'graph') return !!p.shape && smVisible(p).length > 0;
    return true;
  }
  const smPageKinds = (p) => SM_PAGES.map((r) => r[0]).filter((k) => smHasPage(p, k));

  // ---------------------------------------------------------------- widget
  function register() {
    const { WIDGETS, el, iconEl, uid, clamp, save, toast } = D;
    const settingRowOr = (label, control) => (D.settingRow ? D.settingRow(label, control)
      : el('div', { class: 'row' }, el('span', {}, label), control));

    /* ---------------------------------------------------------------- story map */

    /* Seeding is EXPLICIT and TERMINAL, and the chain cannot bottom out: the
       deck's year band picks a plan, an unbanded plan is offered to everyone,
       and the last branch is a plan built from nothing. After seeding a spine
       always holds at least one box, which is what means no face needs a
       spine-less empty state.

       Seeded ONCE, never re-seeded on a later mount. The banded scalars are
       seeded in the SAME place from the SAME band — a swap that reseeds the rule
       and the ladder while the first mount does not is the banding decision
       quietly failing on the commonest path there is. */
    function smSeed(p, w) {
      const deck = (D.deck && D.deck()) || {};
      const band = gtBandFor(deck.yearGroup);
      const lib = smArcLib();
      // A band on a plan is a SPECIALISATION; no band means "offered at every year
      // group", so the general plan is the right default nearly everywhere — a
      // Year 4 class opening on a warning tale rather than the mountain is a
      // guess about their unit. The one place the band must win is ks1, where a
      // five-part mountain is genuinely too much and a three-part shape is the
      // whole KS1 curriculum.
      const banded = lib.find((a) => a.band && a.band === band);
      const general = lib.find((a) => !a.band);
      const arc = (band === 'ks1' ? banded || general : general || banded)
        || lib[0]
        || smNormArc({ name: 'Story map', rows: [{ box: 'Beginning' }, { box: 'Middle' }, { box: 'End' }] }, false);
      p.arc = arc;
      p.shape = arc.shape;
      // null means offer everything, never assume the youngest — so a deck with
      // no year group set gets SEVEN steps
      p.steps = arc.steps || (band === 'ks1' ? 5 : 7);
      p.axisWords = SM_AXIS_WORDS[p.steps].slice();
      p.ladder = SM_LADDER_BAND[band] || 'rocket';
      p.rule = smRuleBandFor(deck.yearGroup);
      p.lines = SM_RULES[p.rule].lines;
      p.tracks = [{ id: uid(), name: 'our draft', on: true, kind: 'actual', ch: 0 }];
      p.armed = p.tracks[0].id;
      // The bank's seed comes from the genre pack's own vocabulary, copied ONCE
      // — the copy is what the gear edits, so an edited pack cannot change a
      // class's words mid-unit and every snapshot carries the class's own list
      // free. Tagged pack words matter here: untagged, two of the three mood
      // groups read "nothing here" on day one and the shortfall diagnosis fires
      // at a teacher who has done nothing wrong.
      //
      // A plan taken from a GENRE pack seeds from that pack. A plan taken from
      // the arc library has no vocabulary of its own, and a shaped arc — a
      // mountain, a warning tale, a dilemma — is a narrative shape, so it seeds
      // from the narrative pack rather than opening on an empty bank. A shapeless
      // arc seeds from nothing, because instructions and an explanation want
      // their own words and a story's would be wrong.
      const packs = gtDefaults();
      const pack = packs.find((g) => g.id === arc.src)
        || (arc.shape ? packs.find((g) => g.id === 'narrative') : null);
      p.words = ((pack && pack.vocab) || []).slice(0, GT_CAP.lang)
        .map((v) => smWord({ w: v.w, src: 'genre', lvl: v.lvl, mood: v.mood })).filter(Boolean);
      void w;
    }

    // Refusals are rate-limited to one every 2.5 seconds. A child patting a
    // locked board fires a toast per pat otherwise, which is modelwrite's own
    // recorded fix and the reason it is copied rather than re-derived.
    let smLastRefusal = 0;
    function smRefuse(msg) {
      const now = Date.now();
      if (now - smLastRefusal < 2500) return;
      smLastRefusal = now;
      toast(msg);
    }

    WIDGETS.storymap = {
      title: 'Story map', icon: 'storymap', accent: '#c7d2fe', w: 1180, h: 660,
      defaults: () => ({
        arc: null, allBands: false, beats: [], tracks: [], armed: null,
        words: [], wordsHidden: false, shown: {}, ladder: 'rocket', moments: [],
        strokes: {}, rule: 'lks2', lines: 5,
        face: 'map', stage: 'model', lock: false, room: 'board',
        refMode: 'strip', coverMap: false, coverBox: false, coverGraph: false,
        steps: 7, axisWords: [], open: null, capL: 2, capM: 'mid',
      }),

      /* hasWork asks "is there anything here worth being able to get back", and
         that is a WIDER question than "did this class do anything". A prepped
         map — eleven beats, their pictures, a stocked bank, no class work at all
         — is the most valuable state in the widget, and losing a prep session to
         a bin sweep is the failure this exists to prevent. Defining it replaces
         widgetWorthKeeping's JSON-length fallback entirely. */
      hasWork(w) {
        const p = w.props || {};
        if (!p.arc) return false;
        if ((p.beats || []).length) return true;
        if (smWritten(p)) return true;
        if ((p.moments || []).length) return true;
        if (smPlotted(p)) return true;
        if ((p.tracks || []).length > 1) return true;
        if ((p.words || []).length) return true;
        if (smAxisSet(p)) return true;
        if ((p.arc.rows || []).some((r) => r.edited)) return true;
        return false;
      },

      toPrintablePages(w) {
        const p = w.props;
        const out = [];
        for (const [kind, label, build] of SM_PAGES) {
          if (!smHasPage(p, kind)) continue;
          const svg = build(p);
          if (svg) out.push({ svg, label });
        }
        return out;
      },
      printCurrent(w) {
        const i = smPageKinds(w.props).indexOf(w.props.face);
        return i < 0 ? 0 : i;
      },

      mount(body, w, api) {
        body.classList.add('mntray', 'smwidget');
        const p = w.props;
        smNorm(p);
        if (!p.arc) { smSeed(p, w); smNorm(p); save(); }

        // TRANSIENT, and deliberately not in props: a half-typed word in the
        // capture bar would make hasWork fire on a keystroke, and every keystroke
        // debounces a full save of the whole app.
        let focusBeat = null, capFocus = false;
        let capW = '', capBeyond = false, capWho = null;
        let tool = 'pen', pen = '#1e2c33';
        // Write areas are built ONCE and re-parented, never rebuilt: a render on
        // every capture-bar chip tap would otherwise tear down five surfaces,
        // orphan a stroke in flight and drop pointer capture.
        const areas = new Map();

        const locked = () => !!p.lock;
        const bump = () => { save(); };

        const titleEl = el('div', { class: 'sm-title' });
        const headEl = el('div', { class: 'sm-head' });
        const stageEl = el('div', { class: 'sm-stage' });
        const faceEl = el('div', { class: 'sm-face' });
        const barEl = el('div', { class: 'sm-bar' });
        body.append(titleEl, headEl, stageEl, faceEl, barEl);

        // ---------------------------------------------------------- chrome
        function paintChrome() {
          // The app draws the widget's own title bar and its gear and ⋮ — this row
          // carries only the two things that must be legible from the back of the
          // room without anyone reading the bar, and it is absent when neither
          // applies rather than standing empty.
          titleEl.textContent = '';
          if (p.room === 'table') titleEl.append(el('span', { class: 'sm-roomtag' }, 'small group'));
          if (locked()) titleEl.append(el('span', { class: 'sm-lockmark' }, '· locked'));
          titleEl.style.display = titleEl.firstChild ? '' : 'none';

          headEl.textContent = '';
          // the plan's name is content, not a control — it wraps and is never truncated
          headEl.append(el('span', { class: 'sm-plan' }, p.arc ? p.arc.name : 'No plan'));
          // The DECK's year band, never the plan's. A plan carrying no band means
          // "offered at every year group" — a property of the resource — where an
          // unset year group is a property of the deck and is the thing the
          // teacher can fix, one place away, under Set year group. Reading the
          // plan's band here told a Year 4 class it had no year group set.
          const band = gtBandFor((((D.deck && D.deck()) || {}).yearGroup));
          // never a blank pill: gtBandName returns '' for a null band by
          // construction, and a deck ships with no year group set, so the
          // year-less case is the common one and gets its own amber wording
          headEl.append(band
            ? el('span', { class: 'sm-bandchip' }, gtBandName(band))
            : el('span', { class: 'sm-bandchip none' }, 'No year group set'));

          stageEl.textContent = '';
          stageEl.className = 'sm-stage s-' + p.stage;
          for (const [id, label, gloss] of SM_STAGES) {
            stageEl.append(el('button', {
              class: 'sm-stbtn b-' + id + (p.stage === id ? ' on' : ''),
              title: gloss,
              // The STAGE gates NOTHING. It colours this band, it is stamped onto
              // a recorded moment, and it survives a reload — that is the whole
              // list. Two independent things, answering to different people: the
              // stage is the lesson's stance, the LOCK is whether the board takes
              // a hand at all, and that is always the teacher's discretion, never
              // the stage's. Do not wire stage → lock; a later reader will find
              // it inviting and it is exactly what this forbids.
              onclick: () => { p.stage = id; bump(); paintChrome(); },
            }, label));
          }
          stageEl.append(el('span', { class: 'sm-stseq' },
            'stage ' + (SM_STAGE_IDS.indexOf(p.stage) + 1) + ' of 3'));

          barEl.textContent = '';
          const pills = [['map', 'Text map'], ['box', 'Boxing up']];
          if (p.shape) pills.push(['graph', 'Emotion graph']);
          for (const [id, label] of pills) {
            barEl.append(el('button', {
              class: 'sm-pill f-' + id + (p.face === id ? ' on' : ''),
              onclick: () => {
                // Changing face SHUTS the panel, and it has to. Only the map and
                // the graph draw one — boxing up is a VIEW of the beats and
                // authors none — so an open beat carried onto that face is
                // invisible and still live, and every word tapped in the bank
                // would attach itself to a beat nobody can see. Commit first,
                // exactly as the lock does: a half-typed beat is the class's
                // words and changing face is not a reason to take them.
                if (p.open) commitOpenBeat();
                p.open = null;
                p.face = id;
                bump(); render();
              },
            }, label));
          }
          barEl.append(el('span', { class: 'sm-grow' }));
          barEl.append(el('button', {
            class: 'sm-barbtn' + (locked() ? ' lockon' : ' ghost'),
            onclick: () => {
              // A lock that discards a half-typed beat takes the class's words
              // away at the exact moment the teacher stopped taking them. Commit
              // first, then close.
              if (!locked() && p.open) commitOpenBeat();
              p.lock = !p.lock;
              if (locked()) p.open = null;
              bump(); render();
            },
          }, locked() ? '🔒 Locked' : 'Board open'));
          barEl.append(el('button', {
            class: 'sm-barbtn' + (coverFlag() ? ' on' : ''),
            onclick: () => { setCover(!coverFlag()); bump(); render(); },
          }, 'Cover'));
          barEl.append(el('button', {
            class: 'sm-barbtn ghost',
            onclick: () => openPrint(1),
          }, 'Print…'));
        }

        // One button reading a DIFFERENT FLAG per face. A single shared Cover
        // once blanked the word bank the class was writing from, which is the
        // recorded regression this shape exists to prevent.
        const coverFlag = () => (p.face === 'map' ? p.coverMap : p.face === 'box' ? p.coverBox : p.coverGraph);
        const setCover = (v) => {
          if (p.face === 'map') p.coverMap = v;
          else if (p.face === 'box') p.coverBox = v;
          else p.coverGraph = v;
        };

        function openPrint(budget) {
          if (!window.SagePrint) { toast('Printing is not available'); return; }
          let job = [];
          try { job = WIDGETS.storymap.toPrintablePages(w); } catch (err) { job = []; }
          if (!job.length) { toast('Nothing to print yet'); return; }
          SagePrint.openDialog(job, {
            title: 'Story map',
            current: WIDGETS.storymap.printCurrent(w),
            budget,
          });
        }

        // ---------------------------------------------------------- beats
        function newBeat(rowId) {
          const list = smBeats(p, rowId);
          const row = smRows(p).find((r) => r.id === rowId);
          if (list.length >= SM_CAP.beats) { smRefuse(smFullSay(row, list.length)); return null; }
          if (p.beats.length >= SM_CAP.mapBeats) { smRefuse('This map is full.'); return null; }
          const b = {
            id: uid(), row: rowId,
            ord: (list.length ? list[list.length - 1].ord : 0) + 1,
            t: '', note: '', img: null, vocab: [], v: {},
          };
          p.beats.push(b);
          p.open = b.id;
          focusBeat = b.id;
          bump();
          return b;
        }
        // ONE template, three sites: the standing note, the Enter chain and any
        // programmatic add. The refusal speaks the count the box ACTUALLY holds
        // rather than the cap, because after a swap a box can hold eleven.
        const smFullSay = (row, n) => (row ? row.box : 'This box') + ' has ' + n
          + ' beats — the next one wants a box of its own.';

        function commitOpenBeat() {
          const inp = faceEl.querySelector('.sm-beatin');
          const b = p.beats.find((x) => x.id === p.open);
          if (inp && b) b.t = gtStr(inp.value, SM_CAP.beat);
        }

        // ---------------------------------------------------------- the word bank
        /* The words are class-facing furniture, not a teacher's list: they sit on
           the board to be read, covered, and uncovered ONE AT A TIME, so a class
           earns them rather than being handed them. Same gradual release the rest
           of the widget runs on. It renders at the head of the map and the
           boxing-up faces and never on the graph. */
        function bankEl() {
          // An empty bank stays ABSENT — no empty mood frames — but the
          // capture bar must survive it: "a word they just offered" is how the
          // FIRST word arrives, and hiding the bar with the bank left a
          // shapeless arc (or a bank emptied in settings) with no on-board way
          // in at all. A locked empty bank renders nothing, as before.
          if (!p.words.length) {
            if (locked()) return null;
            const only = el('div', { class: 'sm-bank' });
            only.append(el('div', { class: 'sm-bankhead' },
              el('span', { class: 'sm-banktitle' }, 'Words for this')));
            only.append(captureEl());
            only.append(el('div', { class: 'sm-banknote' },
              'Nothing in the bank yet — capture the first word the moment a hand offers it.'));
            return only;
          }
          const box = el('div', { class: 'sm-bank' });
          const head = el('div', { class: 'sm-bankhead' });
          head.append(el('span', { class: 'sm-banktitle' }, 'Words for this'));
          head.append(el('span', { class: 'sm-grow' }));
          if (!locked()) {
            head.append(el('button', {
              class: 'sm-wbtn ghost',
              onclick: () => {
                p.wordsHidden = !p.wordsHidden;
                p.shown = {};
                bump(); render();
              },
            }, p.wordsHidden ? 'Uncover all' : 'Cover the words'));
          }
          box.append(head);
          if (!locked()) box.append(captureEl());

          const openBeat = p.beats.find((x) => x.id === p.open);
          const act = smVisible(p).find((t) => t.kind === 'actual');
          const wantVal = openBeat && act ? openBeat.v[act.id] : null;
          const want = wantVal == null ? null : (wantVal > 0 ? 'up' : wantVal < 0 ? 'down' : 'mid');

          for (const [mood, label, col] of SM_MOOD_META) {
            const list = p.words.filter((o) => o.mood === mood);
            const grp = el('div', {
              class: 'sm-moodgrp' + (list.length && list.length < 3 ? ' thin' : '')
                + (want === mood ? ' want' : ''),
            });
            const h = el('div', { class: 'sm-moodhead' });
            h.append(el('span', { class: 'sm-moodlab', style: 'color:' + col }, label));
            h.append(el('span', { class: 'sm-moodn' }, list.length ? list.length + ' words' : 'nothing here'));
            grp.append(h);
            if (!list.length) {
              grp.append(el('div', { class: 'sm-moodempty' },
                'No words for this part of the arc yet — the class cannot write what it cannot reach for.'));
            } else {
              const row = el('div', { class: 'sm-words' });
              for (const o of list) row.append(wordChip(o));
              grp.append(row);
            }
            box.append(grp);
          }
          if (p.wordsHidden) {
            const n = Object.keys(p.shown).length;
            box.append(el('div', { class: 'sm-banknote' },
              n + ' of ' + p.words.length + ' uncovered — tap a covered word to give it to them'));
          }
          box.append(el('div', { class: 'sm-banknote' }, coverageSay()));
          return box;
        }

        /* Checked against what THIS plan asks for, not against a neutral tally.
           A bank stocked only for the fall lets a class write the Problem well
           and the Opening badly, so the number that matters is the shortfall and
           not the total. A mood is SHORT when the plan wants it and the bank
           holds fewer than one more word than there are boxes wanting it. */
        function coverageSay() {
          const have = {}, need = {};
          for (const [m] of SM_MOOD_META) { have[m] = 0; need[m] = 0; }
          for (const o of p.words) have[o.mood]++;
          for (const r of smRows(p)) if (r.mood) need[r.mood]++;
          const short = SM_MOOD_META.map((x) => x[0])
            .filter((m) => need[m] > 0 && have[m] < need[m] + 1);
          if (!short.length) {
            return 'Across the arc: ' + SM_MOOD_META.map(([m]) => have[m] + ' ' + m).join(' · ')
              + ' — enough for every part of this plan.';
          }
          const m = short[0];
          const boxes = smRows(p).filter((r) => r.mood === m).map((r) => r.box);
          const names = boxes.length > 1
            ? boxes.slice(0, -1).join(', ') + ' and ' + boxes[boxes.length - 1] : boxes[0];
          return 'Short for this plan. ' + names + ' run ' + m + ' and the bank holds '
            + have[m] + ' word' + (have[m] === 1 ? '' : 's') + ' for that. '
            + 'A class cannot write what it cannot reach for.';
        }

        function wordChip(o) {
          const hidden = p.wordsHidden && !p.shown[o.w];
          const chip = el('button', {
            class: 'sm-word' + (hidden ? ' hid' : ''),
            onclick: () => {
              if (locked()) { smRefuse('The board is locked. Unlock it to let a hand use it.'); return; }
              if (hidden) { p.shown[o.w] = true; bump(); render(); return; }
              const b = p.beats.find((x) => x.id === p.open);
              if (b) { attachWord(b, o); return; }
              // The board tap CLIMBS and CLAMPS at the top. Wrapping a 5 back to
              // a 1 on a class-facing surface, with no undo and a cheerful toast,
              // is a silent reversal of a claim about the word. The descent lives
              // in the settings panel.
              if (o.lvl >= SM_LVLMAX) { smRefuse('“' + o.w + '” is already at the top of the scale.'); return; }
              o.lvl++;
              toast('“' + o.w + '” scored ' + (o.lvl + 1) + ' — ' + SM_LVLNAME[o.lvl] + '.');
              bump(); render();
            },
          });
          const lad = el('span', { class: 'sm-lad' });
          lad.innerHTML = smLadderArt(p.ladder, o.lvl);
          chip.append(lad, el('span', {}, o.w));
          const src = SM_SRC[o.src] || SM_SRC.bank;
          chip.append(el('span', {
            class: 'sm-tag', style: 'color:' + src[1] + ';background:' + src[2],
          }, src[0]));
          if (o.beyond) chip.append(el('span', { class: 'sm-beyond' }, '★'));
          return chip;
        }

        function attachWord(b, o) {
          if (b.vocab.includes(o.w)) {
            b.vocab = b.vocab.filter((x) => x !== o.w);
            bump(); render(); return;
          }
          if (b.vocab.length >= SM_CAP.vocabPerBeat) {
            smRefuse('Four words is the cap for one beat.');
            return;
          }
          b.vocab.push(o.w);
          const line = smStoryLine(p);
          const read = line ? smReadWord(o, b.v[line.id]) : null;
          if (read && read.k === 'counter') {
            toast('“' + o.w + '” cuts against ' + line.name + ' at ' + smSigned(b.v[line.id])
              + ' — counterpoint, and a choice.');
          }
          bump(); render();
        }

        /* A child offers a word mid-lesson and it is in the bank, scored, before
           the moment passes. This is the loop teachers actually love — and the
           chaining IS the feature: the score and the direction persist across
           commits, and every chip tap re-focuses the field, so a run of
           same-score words is type-Enter-type-Enter. Without that re-focus the
           loop breaks after one word. */
        function captureEl() {
          const bar = el('div', { class: 'sm-cap' });
          bar.append(el('span', { class: 'sm-caplab' }, 'A word they just offered'));
          const inp = el('input', {
            class: 'sm-capin', type: 'text', value: capW,
            placeholder: 'type it before the moment passes…',
            maxlength: String(GT_CAP.word + 1),
            oninput: (e) => { capW = e.target.value; },
            onkeydown: (e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitCapture(); }
              else if (e.key === 'Escape') { capW = ''; capBeyond = false; capWho = null; render(); }
            },
          });
          bar.append(inp);
          const scores = el('div', { class: 'sm-scores' });
          for (let i = 0; i <= SM_LVLMAX; i++) {
            const b = el('button', {
              class: 'sm-sp' + (!capBeyond && p.capL === i ? ' on' : ''),
              title: SM_LVLNAME[i],
              onclick: () => { p.capL = i; capBeyond = false; capFocus = true; bump(); render(); },
            });
            const g = el('span', { class: 'sm-spa' });
            g.innerHTML = smLadderArt(p.ladder, i);
            b.append(g, el('span', { class: 'sm-spn' }, String(i + 1)));
            scores.append(b);
          }
          scores.append(el('button', {
            class: 'sm-sp beyond' + (capBeyond ? ' on' : ''),
            title: 'beyond the scale — records a moment',
            onclick: () => { capBeyond = !capBeyond; capFocus = true; render(); },
          }, '★'));
          bar.append(scores);
          const moods = el('div', { class: 'sm-capmoods' });
          for (const [m, label, col] of SM_MOOD_META) {
            moods.append(el('button', {
              class: 'sm-capmood' + (p.capM === m ? ' on' : ''),
              style: p.capM === m ? 'background:' + col + ';border-color:' + col : 'color:' + col,
              title: label,
              onclick: () => { p.capM = m; capFocus = true; bump(); render(); },
            }, m === 'up' ? '↑' : m === 'down' ? '↓' : '–'));
          }
          bar.append(moods);
          bar.append(el('button', { class: 'sm-wbtn', onclick: () => commitCapture() }, 'Add'));

          /* "beyond" is not a sixth level. The scale is 1–5 and it has a top;
             this is a separate mark for the word a class produces once a term,
             kept separate because it is not a measurement — it is an EVENT, and
             an event carries context a number cannot. That context is what turns
             it into an insertion point for a report written from what happened
             rather than from stock phrasing. */
          if (capBeyond) {
            const who = el('div', { class: 'sm-whorow' });
            who.append(el('span', { class: 'sm-caplab' }, 'Who offered it? — optional, and it stays on this machine'));
            const names = (D.classNames ? D.classNames() : []);
            who.append(el('button', {
              class: 'sm-who' + (capWho == null ? ' on' : ''),
              onclick: () => { capWho = null; capFocus = true; render(); },
            }, 'the class'));
            for (const n of names.slice(0, 40)) {
              who.append(el('button', {
                class: 'sm-who' + (capWho === n ? ' on' : ''),
                onclick: () => { capWho = n; capFocus = true; render(); },
              }, n));
            }
            if (!names.length) {
              who.append(el('span', { class: 'sm-banknote' },
                'No class list on this deck — the moment records “the class”.'));
            }
            bar.append(who);
          }
          return bar;
        }

        function commitCapture() {
          const raw = String(capW || '');
          const wd = gtStr(raw, GT_CAP.word);
          if (!wd) { smRefuse('Type the word first.'); return; }
          // the cap is SPOKEN, never silent: a teacher who watches a word commit
          // shorter than she typed it cannot tell a cap from a bug from a lost save
          if (raw.trim().length > GT_CAP.word) {
            toast('That is longer than ' + GT_CAP.word + ' characters — kept the first ' + GT_CAP.word + '.');
          }
          if (p.words.some((o) => o.w.toLowerCase() === wd.toLowerCase())) {
            smRefuse('“' + wd + '” is already in the bank.');
            capW = ''; capFocus = true; render(); return;
          }
          if (p.words.length >= GT_CAP.lang) { smRefuse('The bank holds ' + GT_CAP.lang + ' words.'); return; }
          const lvl = capBeyond ? SM_LVLMAX : p.capL;
          p.words.push(smWord({ w: wd, src: 'bank', lvl, mood: p.capM, beyond: capBeyond }));
          if (capBeyond) recordMoment(wd);
          else toast('“' + wd + '” added — ' + SM_LVLNAME[lvl] + ', '
            + (p.capM === 'up' ? 'lifts' : p.capM === 'down' ? 'falls' : 'level') + '.');
          capW = ''; capBeyond = false;
          capFocus = true;
          bump(); render();
        }

        function recordMoment(wd) {
          const deck = (D.deck && D.deck()) || {};
          const b = p.beats.find((x) => x.id === p.open) || null;
          const row = b ? smRows(p).find((r) => r.id === b.row) : null;
          if (p.moments.length >= SM_CAP.moments) p.moments.pop();
          p.moments.unshift({
            w: wd, score: SM_LVLMAX + 1, who: capWho,
            box: row ? row.box : null,
            beat: b ? (b.t || null) : null,
            plan: p.arc ? p.arc.name : null,
            unit: gtStr(deck.subject || deck.name, GT_CAP.name) || null,
            stage: p.stage, at: Date.now(),
          });
          toast('“' + wd + '” recorded as a moment' + (capWho ? ' — ' + capWho : '')
            + '. It carries where and when with it.');
          capWho = null;
        }

        // ---------------------------------------------------------- text map face
        function mapFace() {
          const bank = bankEl();
          if (bank) faceEl.append(bank);
          const orphans = smOrphans(p);
          if (orphans.length) {
            const tray = el('div', { class: 'sm-tray' });
            tray.append(el('div', { class: 'sm-traylab' }, 'Beats with no box'));
            const row = el('div', { class: 'sm-beats' });
            for (const b of orphans) row.append(beatCard(b));
            tray.append(row);
            faceEl.append(tray);
          }
          for (const r of smRows(p)) {
            const band = el('div', { class: 'sm-band' });
            const head = el('div', { class: 'sm-bandhead' });
            head.append(el('span', { class: 'sm-boxname' }, r.box));
            if (r.hint) head.append(el('span', { class: 'sm-boxhint' }, r.hint));
            head.append(el('span', { class: 'sm-grow' }));
            const gap = gapChip(r.id);
            if (gap) head.append(gap);
            band.append(head);
            const list = smBeats(p, r.id);
            const row = el('div', { class: 'sm-beats' });
            for (const b of list) row.append(beatCard(b));
            if (list.length >= SM_CAP.beats) {
              row.append(el('div', { class: 'sm-capnote' }, smFullSay(r, list.length)));
            } else if (!locked()) {
              row.append(el('button', {
                class: 'sm-addbeat sm-big',
                title: 'Add a beat to ' + r.box,
                onclick: () => { newBeat(r.id); render(); },
              }, '+'));
            }
            band.append(row);
            if (p.open && list.some((b) => b.id === p.open)) band.append(panelEl(p.open));
            faceEl.append(band);
          }
          if (p.open && smOrphans(p).some((b) => b.id === p.open)) faceEl.append(panelEl(p.open));
        }

        function gapChip(rowId) {
          const g = smGapOf(p, rowId);
          if (!g) return null;
          const met = g.at === g.want;
          return el('span', { class: 'sm-gap' + (met ? ' met' : '') },
            met ? 'at ' + smSigned(g.at) + ' — where we wanted it'
              : 'at ' + smSigned(g.at) + ' → aiming for ' + smSigned(g.want));
        }

        function beatCard(b) {
          const sel = p.open === b.id;
          const card = el('button', {
            class: 'sm-beat' + (sel ? ' sel' : '') + (b.t ? '' : ' blank'),
            onclick: () => {
              if (locked()) { smRefuse('The board is locked. Unlock it to let a hand use it.'); return; }
              if (p.open === b.id) { commitOpenBeat(); p.open = null; }
              else { commitOpenBeat(); p.open = b.id; focusBeat = b.id; }
              bump(); render();
            },
          });
          const thumb = el('span', { class: 'sm-thumb' + (b.img ? '' : ' ghost') });
          // a picture and a ghost frame occupy the SAME footprint, so a picture
          // arriving can never change the card's size
          if (b.img) thumb.append(el('img', { src: b.img, alt: '' }));
          card.append(thumb);
          const txt = el('span', { class: 'sm-btext' + (b.t ? '' : ' blank') + (p.coverMap ? ' cov' : '') },
            b.t || 'not written yet');
          card.append(txt);
          if (!p.coverMap) {
            if (b.vocab.length) {
              const meta = el('span', { class: 'sm-bmeta' });
              const line = smStoryLine(p);
              for (const wd of b.vocab) {
                const o = p.words.find((x) => x.w === wd);
                const read = o && line ? smReadWord(o, b.v[line.id]) : null;
                meta.append(el('span', { class: read && read.k === 'counter' ? 'cp' : '' }, wd));
              }
              card.append(meta);
            }
            if (b.note) card.append(el('span', { class: 'sm-bnote' }, '“' + b.note + '”'));
          }
          return card;
        }

        // ---------------------------------------------------------- the beat panel
        function panelEl(id) {
          const b = p.beats.find((x) => x.id === id);
          if (!b) return el('span');
          const row = smRows(p).find((r) => r.id === b.row);
          const box = el('div', { class: 'sm-panel' });
          const top = el('div', { class: 'sm-ptop' });
          const inp = el('input', {
            class: 'sm-beatin', type: 'text', value: b.t,
            placeholder: 'what happens here…',
            oninput: (e) => {
              const v = e.target.value;
              if (v.length > SM_CAP.beat) {
                // the editor stops accepting at its target's cap and SAYS SO.
                // Nothing is ever clipped on commit: a teacher who watches two
                // sentences commit as one and a half cannot tell a cap from a bug
                // from a lost save, and the half she loses is the half the class
                // agreed.
                e.target.value = v.slice(0, SM_CAP.beat);
                smRefuse('A beat holds ' + SM_CAP.beat + ' characters.');
              }
              b.t = gtStr(e.target.value, SM_CAP.beat);
              // LIVE-PATCH the card, never re-render: the caret has to survive
              // every keystroke, and a render-on-input design loses it.
              const card = faceEl.querySelector('.sm-beat.sel');
              if (card) {
                const t = card.querySelector('.sm-btext');
                if (t) {
                  t.textContent = b.t || 'not written yet';
                  t.classList.toggle('blank', !b.t);
                }
                card.classList.toggle('blank', !b.t);
              }
              bump();
            },
            onkeydown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // the loop that runs a hundred times a lesson
                const list = smBeats(p, b.row);
                if (list.length >= SM_CAP.beats) { smRefuse(smFullSay(row, list.length)); return; }
                newBeat(b.row); render();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                p.open = null; bump(); render();
              }
            },
          });
          top.append(inp);
          top.append(el('button', {
            class: 'sm-pclose sm-big', title: 'Close',
            onclick: () => { commitOpenBeat(); p.open = null; bump(); render(); },
          }, '×'));
          box.append(top);
          box.append(el('div', { class: 'sm-enterhint' },
            'Enter starts the next beat in ' + (row ? row.box : 'this box') + '.'));

          /* The panel is unambiguously the TEACHER's surface — children do not
             touch the board — so Cover does NOT reach it. Covering the panel
             blinds the only person who is about to reveal the word, and you
             cannot type into a covered field. The board stays covered; the
             teacher can still work. */
          if (p.coverMap) {
            box.append(el('div', { class: 'sm-plab' }, 'Cover is on, so this beat stays covered on the board.'));
          }

          // pictures, as a row of options all visible at once — a cycle hides
          // every option but the next one
          if (!locked()) {
            box.append(el('div', { class: 'sm-plab' }, 'What it looks like'));
            const pick = el('div', { class: 'sm-pickrow' });
            pick.append(el('button', {
              class: 'sm-pick none' + (b.img ? '' : ' on'),
              onclick: () => { b.img = null; bump(); render(); },
            }, '—'));
            pick.append(el('button', {
              class: 'sm-pick',
              onclick: () => {
                // pickImage attaches img.onload only and has NO img.onerror, so a
                // HEIC or a corrupt JPEG never calls back at all — cancel and
                // failure are indistinguishable here. No spinner is shown for
                // that reason; a stuck one would be the visible bug.
                D.pickImage((data) => {
                  if (!data) return;
                  if (String(data).length > SM_CAP.pic) {
                    toast('That picture is too big for a beat — try a smaller one.');
                    return;
                  }
                  b.img = data; bump(); render();
                }, SM_CAP.picW);
              },
            }, '＋'));
            if (b.img) pick.append(el('img', { class: 'sm-pickimg', src: b.img, alt: '' }));
            box.append(pick);
          }

          // how it feels — one panel for every line, because per-line panels
          // would give one beat two notes, which is what b.v exists to prevent
          const armed = smArmedTrack(p);
          if (p.shape && armed && !locked()) {
            box.append(el('div', { class: 'sm-plab' },
              'Feeling on ' + armed.name + ' — taps write to this line only'));
            const chips = el('div', { class: 'sm-chiprow' });
            for (let i = 0; i < p.steps; i++) {
              const v = smValOfStep(i, p.steps);
              const on = b.v[armed.id] === v;
              chips.append(el('button', {
                class: 'sm-step' + (on ? ' set' : '') + (v === 0 ? ' mid' : ''),
                style: on ? 'background:' + SM_CH[armed.ch].col : '',
                // a TOGGLE, so 150 taps is byte-identical to none at an even count
                onclick: () => {
                  if (on) delete b.v[armed.id]; else b.v[armed.id] = v;
                  bump(); render();
                },
              }, el('span', { class: 'sm-num' }, smSigned(v)),
              el('span', { class: 'sm-wd' }, p.axisWords[i] || '')));
            }
            box.append(chips);
          }

          // the words, re-ordered under this beat's tone. Nothing is hidden and
          // nothing is called wrong.
          if (p.words.length && !locked()) {
            const line = smStoryLine(p);
            const val = line ? b.v[line.id] : null;
            const groups = val == null
              ? [['all of them', p.words]]
              : [
                [val === 0 ? 'level with it' : 'for this tone',
                  p.words.filter((o) => (val === 0 ? o.mood === 'mid' : SM_MOODSIGN[o.mood] === Math.sign(val)))],
                [val === 0 ? 'or tip it either way' : 'neutral',
                  p.words.filter((o) => (val === 0 ? o.mood !== 'mid' : o.mood === 'mid'))],
                ['against it — on purpose',
                  p.words.filter((o) => val !== 0 && SM_MOODSIGN[o.mood] === -Math.sign(val))],
              ];
            for (const [label, list] of groups) {
              if (!list.length) continue;
              box.append(el('div', { class: 'sm-plab' }, label));
              const row2 = el('div', { class: 'sm-words' });
              for (const o of list) {
                const chip = el('button', {
                  class: 'sm-word' + (b.vocab.includes(o.w) ? ' picked' : ''),
                  onclick: () => attachWord(b, o),
                }, o.w);
                const read = smReadWord(o, val);
                // the reading badge renders only when the word is ATTACHED
                if (read && b.vocab.includes(o.w)) {
                  chip.append(el('span', { class: 'sm-rd ' + read.k }, read.say));
                }
                row2.append(chip);
              }
              box.append(row2);
            }
          }

          if (!locked()) {
            box.append(el('div', { class: 'sm-plab' }, 'A note for you'));
            box.append(el('input', {
              class: 'sm-noteline', type: 'text', value: b.note,
              placeholder: 'a craft note, for you…',
              oninput: (e) => {
                if (e.target.value.length > SM_CAP.note) {
                  e.target.value = e.target.value.slice(0, SM_CAP.note);
                  smRefuse('A note holds ' + SM_CAP.note + ' characters.');
                }
                b.note = gtStr(e.target.value, SM_CAP.note);
                bump();
              },
            }));
            const mv = el('div', { class: 'sm-mvrow' });
            const list = smBeats(p, b.row);
            const i = list.indexOf(b);
            if (i > 0) {
              mv.append(el('button', {
                class: 'sm-mv',
                // ord is a FRACTIONAL sort key, so nothing is renumbered and no
                // index is ever a reference
                onclick: () => {
                  const prev = list[i - 1];
                  const before = i > 1 ? list[i - 2].ord : prev.ord - 1;
                  b.ord = (before + prev.ord) / 2;
                  bump(); render();
                },
              }, '← earlier'));
            }
            if (i >= 0 && i < list.length - 1) {
              mv.append(el('button', {
                class: 'sm-mv',
                onclick: () => {
                  const next = list[i + 1];
                  const after = i + 2 < list.length ? list[i + 2].ord : next.ord + 1;
                  b.ord = (next.ord + after) / 2;
                  bump(); render();
                },
              }, 'later →'));
            }
            mv.append(el('button', {
              class: 'sm-mv del',
              onclick: () => {
                D.confirmDialog('Delete this beat? Its picture, its words and its plotted feelings go with it.',
                  () => {
                    p.beats = p.beats.filter((x) => x.id !== b.id);
                    p.open = null; bump(); render();
                  }, { label: 'Delete', danger: true });
              },
            }, 'Delete beat'));
            box.append(mv);
          }
          return box;
        }

        // ---------------------------------------------------------- boxing up face
        /* A HANDWRITTEN ruled page. There are no typed cells anywhere: the left
           column is a VIEW of that box's beats — a view, so no beat is authored
           on this face and no band here carries a + beat — and the right is a
           ruled surface the teacher writes on while thirty children copy. Nothing
           written on the right touches the beats the class has been orally
           rehearsing from all week, which is now true in the strongest possible
           way: ink and beats share nothing at all. This is the move from
           imitation to innovation. */
        function boxFace() {
          const bank = bankEl();
          if (bank) faceEl.append(bank);
          if (!locked()) {
            const ctl = el('div', { class: 'sm-wctl' });
            ctl.append(el('button', {
              class: 'sm-wbtn ghost',
              onclick: () => {
                const i = (SM_RULE_IDS.indexOf(p.rule) + 1) % SM_RULE_IDS.length;
                p.rule = SM_RULE_IDS[i];
                p.lines = SM_RULES[p.rule].lines;
                const rs = SM_RULES[p.rule];
                toast(rs.name + ' — ' + p.lines + ' lines a box'
                  + (rs.guide ? ', with a midline to reach for' : ''));
                bump(); render();
              },
            }, 'Lines: ' + smRuleSet(p).name));
            ctl.append(el('button', {
              class: 'sm-wbtn ghost',
              onclick: () => {
                if (p.lines <= SM_CAP.writeMin) { smRefuse('Two lines is the floor.'); return; }
                p.lines--; bump(); render();
              },
            }, '−'));
            ctl.append(el('span', { class: 'sm-wcount' }, p.lines + ' lines'));
            ctl.append(el('button', {
              class: 'sm-wbtn ghost',
              onclick: () => {
                if (p.lines >= SM_CAP.writeMax) { smRefuse('Fourteen lines is as tall as a box goes.'); return; }
                p.lines++; bump(); render();
              },
            }, '+'));
            if (p.shape) {
              ctl.append(el('button', {
                class: 'sm-wbtn ghost',
                onclick: () => { p.refMode = p.refMode === 'side' ? 'strip' : 'side'; bump(); render(); },
              }, p.refMode === 'side' ? 'Shape beside' : 'Shape above'));
            }
            ctl.append(el('span', { class: 'sm-grow' }));
            // two NAMED entry points with two STATED budgets — not one control at
            // two settings, and the budget is remembered nowhere
            ctl.append(el('button', { class: 'sm-wbtn ghost', onclick: () => openPrint(8) }, 'Print for the wall…'));
            faceEl.append(ctl);
          } else {
            faceEl.append(el('div', { class: 'sm-locknote' },
              'Board locked — the boxes and the shape stay up to copy from.'));
          }

          const wrap = el('div', { class: 'sm-boxwrap' + (p.refMode === 'side' && p.shape ? ' side' : '') });
          if (p.shape && smVisible(p).length) {
            const ref = el('div', { class: 'sm-graphref' });
            const g = smGraphMarkup(p, { compact: true, ghosts: false, cover: false });
            if (g.svg) {
              ref.innerHTML = '<svg class="sm-graphsvg" viewBox="0 0 ' + g.W + ' ' + g.H + '" '
                + 'role="img" aria-label="The shape, for reference">' + g.svg + '</svg>';
              wrap.append(ref);
            }
          }
          const rowsWrap = el('div', { class: 'sm-boxrows' });
          for (const r of smRows(p)) rowsWrap.append(boxRow(r));
          wrap.append(rowsWrap);
          faceEl.append(wrap);
        }

        function boxRow(r) {
          const row = el('div', { class: 'sm-brow' });
          const left = el('div', { class: 'sm-bcol' });
          left.append(el('div', { class: 'sm-boxname' }, r.box));
          if (r.hint) left.append(el('div', { class: 'sm-boxhint' }, r.hint));
          const gap = gapChip(r.id);
          if (gap) left.append(gap);
          for (const b of smBeats(p, r.id)) {
            const chip = el('div', { class: 'sm-mchip' });
            const t = el('span', { class: 'sm-mt' + (b.img ? '' : ' ghost') });
            if (b.img) t.append(el('img', { src: b.img, alt: '' }));
            chip.append(t, el('span', { class: 'sm-mx' }, b.t || '…'));
            left.append(chip);
          }
          row.append(left);
          row.append(writeArea(r));
          return row;
        }

        /* The pen has to be beside the box you are writing in. One toolbar at the
           top of a 700px face is a stretch back up the wall for box 4, and on a
           wall-mounted board that stretch is the whole objection. So every
           writing row carries its own. Tool and ink are GLOBAL widget state; only
           Clear is per row. */
        function writeArea(r) {
          let a = areas.get(r.id);
          if (!a) {
            const NS = 'http://www.w3.org/2000/svg';
            const wrap = el('div', { class: 'sm-warea' });
            const tools = el('div', { class: 'sm-rowtools' });
            const svgWrap = el('div', { class: 'sm-wsvgwrap' });
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('class', 'sm-wsvg');
            const bg = document.createElementNS(NS, 'g');
            const layer = document.createElementNS(NS, 'g');
            svg.append(bg, layer);
            svgWrap.append(svg);
            wrap.append(tools, svgWrap);
            a = { wrap, tools, svg, bg, layer };
            a.pen = window.SagePen && window.SagePen.attach(svg, {
              view: () => [SM_WRITE_W, smWriteH(p)],
              strokes: () => (p.strokes[r.id] = p.strokes[r.id] || []),
              add: (s) => { p.strokes[r.id].push(s); },
              replace: (list) => { p.strokes[r.id] = list; },
              layer: () => a.layer,
              tool: () => tool,
              ink: () => pen,
              width: () => Math.max(3, Math.round(smRuleSet(p).pitch * 0.14)),
              eraseR: () => Math.max(9, Math.round(smRuleSet(p).pitch * 0.42)),
              cap: () => SM_CAP.strokesPerBox,
              capMsg: () => r.box + ' is full — start the next box.',
              locked: () => (locked()
                ? 'The board is locked. Unlock it to write, or to hand the pen over.'
                : p.coverBox ? 'Cover is on — the writing is hidden.' : ''),
              onRefuse: smRefuse,
              onChange: () => { paintInk(a, r); bump(); },
            });
            areas.set(r.id, a);
          }
          paintTools(a, r);
          paintInk(a, r);
          return a.wrap;
        }

        function paintTools(a, r) {
          a.tools.textContent = '';
          if (locked()) return;
          const mk = (label, on, fn, cls) => el('button', {
            class: 'sm-rt' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), onclick: fn,
          }, label);
          a.tools.append(mk('✎ Pen', tool === 'pen', () => { tool = 'pen'; render(); }));
          a.tools.append(mk('Rub out', tool === 'rub', () => { tool = 'rub'; render(); }));
          a.tools.append(el('span', { class: 'sm-rtsep' }));
          for (const c of ['#1e2c33', '#1d4ed8', '#a13b4b']) {
            a.tools.append(el('button', {
              class: 'sm-rtink' + (pen === c && tool === 'pen' ? ' on' : ''),
              style: 'background:' + c,
              title: 'ink',
              // picking an ink also switches back to the pen, because reaching
              // for a colour is never a request to rub out
              onclick: () => { pen = c; tool = 'pen'; render(); },
            }));
          }
          a.tools.append(el('span', { class: 'sm-rtsep' }));
          a.tools.append(mk('Clear ' + r.box, false, () => {
            if (!(p.strokes[r.id] || []).length) { smRefuse('Nothing written in ' + r.box + ' yet.'); return; }
            D.confirmDialog('Clear the writing in ' + r.box + '?', () => {
              if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Story map');
              p.strokes[r.id] = [];
              paintInk(a, r); bump();
            }, { label: 'Clear', danger: true });
          }, 'del'));
        }

        function paintInk(a, r) {
          const h = smWriteH(p);
          a.svg.setAttribute('viewBox', '0 0 ' + SM_WRITE_W + ' ' + h);
          const list = p.strokes[r.id] || [];
          // The ground, the rules and the placeholder are the BACKGROUND group;
          // the ink is its own. Only the group that changed is rebuilt, so a
          // score tap in the capture bar cannot tear down a surface.
          let bg = '<rect x="0" y="0" width="' + SM_WRITE_W + '" height="' + h + '" fill="'
            + (p.coverBox ? '#1e2c33' : '#fffdf7') + '"/>';
          if (!p.coverBox) {
            bg += smRuleMarkup(p);
            if (!list.length) {
              bg += '<text x="18" y="' + (smRuleSet(p).pitch * 0.92).toFixed(1)
                + '" font-family="' + GT_FONT + '" font-size="' + (smRuleSet(p).pitch * 0.5).toFixed(1)
                + '" font-style="italic" fill="#cfd8e3">write it here</text>';
            }
          }
          a.bg.innerHTML = bg;
          a.layer.innerHTML = p.coverBox || !window.SagePen ? '' : window.SagePen.markup(list);
        }

        // ---------------------------------------------------------- graph face
        function graphFace() {
          faceEl.append(legendEl());
          // every line off (possible only through imported props — the legend
          // and settings both refuse to kill the last one) leaves a grid with
          // no dots, no data-beat targets and no way in: say so instead
          if (!smVisible(p).length) {
            faceEl.append(el('div', { class: 'sm-empty' },
              'No line is on air — tap a legend chip above to switch one on.'));
            return;
          }
          const holder = el('div', { class: 'sm-graphhold' });
          const g = smGraphMarkup(p, { compact: false, ghosts: true, cover: p.coverGraph });
          if (!g.svg) {
            faceEl.append(el('div', { class: 'sm-empty' }, 'Beats start on the Text map.'));
            return;
          }
          holder.innerHTML = '<svg class="sm-graphsvg" viewBox="0 0 ' + g.W + ' ' + g.H + '" '
            + 'role="img" aria-label="Emotion graph">' + g.svg + '</svg>';
          holder.querySelectorAll('[data-beat]').forEach((n) => {
            n.style.cursor = 'pointer';
            n.addEventListener('click', () => {
              if (locked()) { smRefuse('The board is locked. Unlock it to let a hand use it.'); return; }
              const id = n.getAttribute('data-beat');
              p.open = p.open === id ? null : id;
              if (p.open) focusBeat = id;
              bump(); render();
            });
          });
          faceEl.append(holder);
          if (p.open) faceEl.append(panelEl(p.open));
        }

        /* The legend's three positions NEVER move: an empty channel renders a
           dashed, inert "free channel" chip that holds its place. ON (swatch
           filled) and ARMED (thicker border plus a halo) are two INDEPENDENT
           states — a chip can be on and not armed, and that is the common case. */
        function legendEl() {
          const lg = el('div', { class: 'sm-legend' });
          for (let ch = 0; ch < 3; ch++) {
            const onCh = p.tracks.filter((t) => t.ch === ch);
            const live = onCh.find((t) => t.on) || null;
            if (!onCh.length) {
              lg.append(el('span', { class: 'sm-lchip empty' }, 'free channel'));
              continue;
            }
            const shown = live || onCh[0];
            const chip = el('button', {
              class: 'sm-lchip' + (live ? '' : ' off') + (p.armed === (live && live.id) ? ' armed' : ''),
              style: 'color:' + SM_CH[ch].col,
              onclick: () => cycleChannel(ch),
            });
            chip.append(el('span', { class: 'sm-sw' + (live ? ' on' : '') }));
            chip.append(el('span', {}, shown.name + (live ? '' : ' (off)')));
            if (live && live.kind === 'target') chip.append(el('span', { class: 'sm-kd' }, 'target'));
            if (onCh.length > 1) {
              chip.append(el('span', { class: 'sm-kd' },
                (onCh.indexOf(shown) + 1) + ' of ' + onCh.length));
            }
            lg.append(chip);
          }
          return lg;
        }

        // FOUR outcomes, not three.
        function cycleChannel(ch) {
          if (locked()) { smRefuse('The board is locked. Unlock it to let a hand use it.'); return; }
          const onCh = p.tracks.filter((t) => t.ch === ch);
          if (!onCh.length) return;
          const live = onCh.find((t) => t.on);
          if (!live) { airLine(onCh[0].id); bump(); render(); return; }
          if (p.armed !== live.id) { p.armed = live.id; bump(); render(); return; }
          if (onCh.length > 1) {
            const nx = onCh[(onCh.indexOf(live) + 1) % onCh.length];
            airLine(nx.id);
            toast(nx.name + ' is on the ' + SM_CH[ch].name + ' channel now — ' + live.name + ' steps off.');
            bump(); render(); return;
          }
          // a graph with nothing visible has no destination for a chip and no
          // colour for a ghost
          if (smVisible(p).length === 1) { smRefuse('The last visible line stays — something has to be armed.'); return; }
          live.on = false;
          const q = smVisible(p)[0];
          p.armed = q ? q.id : null;
          bump(); render();
        }
        // the SINGLE mutation for "on air": everything else on that channel steps
        // off, this one steps on, and it is armed
        function airLine(id) {
          const t = p.tracks.find((x) => x.id === id);
          if (!t) return;
          for (const q of p.tracks) if (q.ch === t.ch) q.on = false;
          t.on = true;
          p.armed = t.id;
        }

        // ---------------------------------------------------------- render
        function render() {
          body.classList.toggle('sm-table', p.room === 'table');
          body.classList.toggle('sm-locked', locked());
          paintChrome();
          // detach the live surfaces before the wipe so their nodes, their
          // listeners and any pointer capture survive it
          for (const a of areas.values()) if (a.wrap.parentNode) a.wrap.remove();
          faceEl.textContent = '';
          if (!p.arc || !smRows(p).length) {
            faceEl.append(el('div', { class: 'sm-empty' }, 'No plan yet — pick one in settings.'));
            return;
          }
          if (p.face === 'map') mapFace();
          else if (p.face === 'box') boxFace();
          else graphFace();
          // focus is handed back by two one-shot flags consumed at the very end,
          // each set by the action that should give the keyboard back
          if (focusBeat) {
            const inp = faceEl.querySelector('.sm-beatin');
            if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
            focusBeat = null;
          }
          if (capFocus) {
            const ci = faceEl.querySelector('.sm-capin');
            if (ci) { ci.focus(); ci.setSelectionRange(ci.value.length, ci.value.length); }
            capFocus = false;
          }
        }
        render();
      },

      settings(box, w, api) {
        const p = w.props;
        smNorm(p);
        // smNorm REASSIGNS every collection (p.beats, p.words, p.moments,
        // p.strokes, p.tracks) — but the mounted board's closures still hold
        // the old objects, so anything written there after the gear opened
        // (a beat note mid-panel, a word tap without a render between) landed
        // on orphans and vanished at the next render while the UI said saved.
        // The same staleness rule setArc documents below, applied to the board:
        // remount it so every closure re-captures the normalised objects.
        // NOT api.refresh() — inside settings() that rebuilds the panel, which
        // re-enters settings(), which is a stack overflow. refreshAllOf
        // remounts the BOARD alone and leaves the panel out of the loop.
        api.refreshAllOf('storymap')();
        const redraw = () => { save(); api.refresh(); };

        /* THE STALENESS GUARD IS MANDATORY HERE, and it is mandatory BECAUSE the
           gear lives in the app's own settings panel: this function builds a
           panel holding a captured reference to p.arc, while api.refresh() is
           save-plus-remount and does not rebuild it. Always MUTATE the existing
           arc rather than swapping in a new one — the recorded failure is that
           edits went to a dead object and were silently lost while the live one
           was pruned against the new ids. `p.arc = next` is not the model to
           copy, and there are shipped call sites in this file that do it. */
        function setArc(next) {
          if (p.arc && typeof p.arc === 'object') Object.assign(p.arc, next);
          else p.arc = next;
          return p.arc;
        }

        // ---- the plan
        box.append(el('h4', {}, 'The plan'));
        box.append(el('div', { class: 'hint' },
          'Swapping a plan whole needs an empty map — re-word or add boxes instead once the class has started.'));
        // Asked at the moment of the tap, NEVER captured when this panel is
        // built. The settings panel is built once and api.refresh() does not
        // rebuild it, while bump() on the board is save() alone — so a gate read
        // here would still say "empty map" after a whole lesson had been written
        // into it, and the swap below would reach `p.strokes = {}` under a
        // comment promising it destroys nothing. The reset control at the foot
        // of this panel already does it this way, and this is the same hazard.
        const swapShut = () => smPlotted(p) || smWritten(p);
        for (const a of smArcLib()) {
          const cur = p.arc && a.name === p.arc.name;
          box.append(el('button', {
            class: 'sm-planbtn' + (cur ? ' cur' : ''),
            onclick: () => {
              // re-picking a byte-identical spine would pool every beat into the
              // first box to get back where you started, so it does nothing
              if (cur) return;
              if (swapShut()) {
                const bits = [];
                if (smPlotted(p)) bits.push('plotted feelings');
                if (smWritten(p)) bits.push('writing in a box');
                toast('This map has ' + bits.join(' and ') + ' on “' + p.arc.name
                  + '”. Re-word or add boxes instead — swapping a plan whole needs an empty map.');
                return;
              }
              if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Story map');
              const first = a.rows[0];
              const n = p.beats.length;
              // index 0 is where the beats are KEPT, never what they are MATCHED
              // to. A five-part → dilemma mapping by position would put the
              // Opening's beats under Dilemma and the Ending's under Moral, read
              // aloud to a class as their plan and printed as their plan. A guess
              // dressed as a placement is worse than no placement, because nobody
              // checks it.
              let ord = 1;
              for (const b of p.beats.slice().sort((x, y) => x.ord - y.ord)) {
                b.row = first.id;
                b.ord = ord++;
              }
              setArc(a);
              p.shape = a.shape;
              if (!p.shape && p.face === 'graph') p.face = 'map';
              // the banded scalars reseed from the INCOMING plan's band, in the
              // same place the first seed sets them
              const band = a.band || gtBandFor(((D.deck && D.deck()) || {}).yearGroup);
              p.ladder = SM_LADDER_BAND[band] || p.ladder;
              const nextSteps = a.steps || p.steps;
              if (nextSteps !== p.steps) {
                // words matched by VALUE, never by index — the outermost are the
                // ones dropped, and the confirm names both counts
                const was = p.axisWords.slice(), wasSteps = p.steps;
                p.steps = nextSteps;
                const next = [];
                for (let i = 0; i < p.steps; i++) {
                  const v = smValOfStep(i, p.steps);
                  const j = Array.from({ length: wasSteps }, (_, k) => k)
                    .find((k) => smValOfStep(k, wasSteps) === v);
                  next.push(j == null ? SM_AXIS_WORDS[p.steps][i] : was[j]);
                }
                p.axisWords = next;
              }
              // destroys nothing, because the window was open
              p.strokes = {};
              toast(n + ' beat' + (n === 1 ? '' : 's') + ' moved to ' + first.box);
              redraw();
            },
          }, el('span', { class: 'pn' }, a.name),
          el('span', { class: 'pb' }, (a.band ? gtBandName(a.band) : 'no band — offered at every year group')
            + ' · ' + a.rows.length + ' boxes' + (a.shape ? '' : ' · no emotion graph'))));
        }

        // ---- the lines
        box.append(el('h4', {}, 'The lines'));
        box.append(el('div', { class: 'hint' },
          'Three colours, because that is what a board can carry — but name as many lines as the '
          + 'story needs and put one on air at a time. A line is either where the writing IS, or '
          + 'where it should GET TO.'));
        for (const t of p.tracks) {
          const row = el('div', { class: 'sm-lrow' });
          row.append(el('input', {
            type: 'text', value: t.name, maxlength: String(SM_CAP.track),
            // An EMPTY field commits nothing. smNorm drops a nameless track and
            // then prunes every beat value keyed to its id, so backspacing this
            // box to blank would delete the line and the class's whole reading of
            // the story — silently, on the next reload, with no confirm and no
            // snapshot. Deleting a line is a deliberate act two controls along
            // that names what it takes ("Every feeling plotted on it goes too");
            // clearing a field to retype it is not that act.
            oninput: (e) => {
              const v = gtStr(e.target.value, SM_CAP.track);
              if (!v) return;
              t.name = v;
              save();
            },
            // and the field snaps back to what is actually stored, so a teacher
            // who tabs away from an empty box is never left looking at a blank
            // that does not match the board
            onblur: (e) => { e.target.value = t.name; },
          }));
          row.append(D.selectInput(SM_CH.map((c, i) => [String(i), c.name]), String(t.ch), (v) => {
            t.ch = smInt(v, 0, 2, 0); redraw();
          }));
          if (gtBandFor(((D.deck && D.deck()) || {}).yearGroup) !== 'ks1') {
            row.append(el('button', {
              class: 'sm-wbtn ghost',
              onclick: () => { t.kind = t.kind === 'target' ? 'actual' : 'target'; redraw(); },
            }, t.kind === 'target' ? 'where we want it' : 'where we are'));
          }
          row.append(el('button', {
            class: 'sm-wbtn ghost' + (t.on ? ' on' : ''),
            onclick: () => {
              if (t.on && p.tracks.filter((x) => x.on).length === 1) {
                toast('The last visible line stays — something has to be armed.');
                return;
              }
              if (t.on) t.on = false;
              else { for (const q of p.tracks) if (q.ch === t.ch) q.on = false; t.on = true; p.armed = t.id; }
              redraw();
            },
          }, t.on ? 'on air' : 'parked'));
          row.append(el('button', {
            class: 'sm-wbtn ghost del',
            onclick: () => {
              if (p.tracks.length === 1) { toast('A map keeps one line.'); return; }
              D.confirmDialog('Delete “' + t.name + '”? Every feeling plotted on it goes too.', () => {
                p.tracks = p.tracks.filter((x) => x.id !== t.id);
                for (const b of p.beats) delete b.v[t.id];
                smNorm(p);
                redraw();
              }, { label: 'Delete', danger: true });
            },
          }, '✕'));
          box.append(row);
        }
        if (p.tracks.length < SM_CAP.lines) {
          box.append(el('button', {
            class: 'sm-wbtn',
            onclick: () => {
              const used = new Set(p.tracks.map((t) => t.ch));
              const ch = [0, 1, 2].find((c) => !used.has(c));
              // ids are D.uid() and never 't'+length: delete a line, add another,
              // and a positional id collides with the dead one — and because b.v
              // is keyed by track id the two would share every plotted feeling
              p.tracks.push({
                id: uid(), name: 'line ' + (p.tracks.length + 1),
                on: ch != null, kind: 'actual', ch: ch == null ? 0 : ch,
              });
              redraw();
            },
          }, 'Add a line'));
        }

        if (p.shape) {
          box.append(el('button', {
            class: 'sm-wbtn',
            onclick: () => {
              const tgt = p.tracks.find((t) => t.kind === 'target');
              if (!tgt) { toast('No target line yet — mark a line as target under The lines first.'); return; }
              if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Story map');
              const lim = (p.steps - 1) / 2;
              let n = 0;
              for (const r of smRows(p)) {
                if (!r.mood) continue;
                const v = Math.max(-lim, Math.min(lim, SM_MOODVAL[r.mood]));
                for (const b of smBeats(p, r.id)) { b.v[tgt.id] = v; n++; }
              }
              toast('Target set on ' + n + ' beat' + (n === 1 ? '' : 's')
                + ' from the plan’s shape. Now argue with it.');
              redraw();
            },
          }, 'Seed the target line from this shape'));
        }

        // ---- the words
        box.append(el('h4', {}, 'The words'));
        box.append(el('div', { class: 'hint' },
          'A word’s score is DICTION — how rarely a primary writer reaches for it — and not how '
          + 'strong the feeling is: wistful is mild and scores top. Mood is a separate axis, and '
          + 'only mood decides counterpoint. Pack words arrive already tagged.'));
        const paste = el('textarea', {
          class: 'sm-paste', rows: '4',
          placeholder: 'one word a line · desolate, 5, down · first, then, next, S, 1',
        });
        box.append(paste);
        /* A comma is only a delimiter if what follows it is actually a source or
           a level. Otherwise the line is one phrase — "first, then, next" is SEN
           sequencing language, and splitting it on its commas destroys it. The
           tools are untidy, not the person. */
        function parsePaste() {
          const out = [];
          for (const raw of String(paste.value || '').split('\n')) {
            if (!raw.trim()) continue;
            const parts = raw.split(',').map((s) => s.trim());
            let lvl = null, mood = null, src = null;
            while (parts.length > 1) {
              const tail = parts[parts.length - 1].toLowerCase();
              if (mood == null && gtMood(tail)) { mood = tail; parts.pop(); continue; }
              if (lvl == null && /^[1-5]$/.test(tail)) { lvl = +tail - 1; parts.pop(); continue; }
              if (lvl == null && SM_LVLNAME.indexOf(tail) >= 0) { lvl = SM_LVLNAME.indexOf(tail); parts.pop(); continue; }
              if (src == null && SM_SRCALIAS[tail]) { src = SM_SRCALIAS[tail]; parts.pop(); continue; }
              break;
            }
            const o = smWord({
              w: parts.join(', '), src: src || 'bank',
              lvl: lvl == null ? 2 : lvl, mood: mood || 'mid',
            });
            if (o) out.push(o);
          }
          return out;
        }
        function addWords(list, replace) {
          if (!list.length) { toast('Paste a list first.'); return; }
          if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Story map');
          // never prunes attached words off beats: an attached word is typed work
          if (replace) p.words = [];
          let added = 0, dup = 0;
          for (const o of list) {
            if (p.words.length >= GT_CAP.lang) break;
            if (p.words.some((x) => x.w.toLowerCase() === o.w.toLowerCase())) { dup++; continue; }
            p.words.push(o); added++;
          }
          // say what happened in BOTH directions — silence is this rail's failure mode
          toast(added + ' word' + (added === 1 ? '' : 's') + ' added'
            + (dup ? ' · ' + dup + ' already there.' : '.'));
          paste.value = '';
          redraw();
        }
        const pasteRow = el('div', { class: 'sm-lrow' });
        pasteRow.append(el('button', { class: 'sm-wbtn', onclick: () => addWords(parsePaste(), false) }, 'Add these words'));
        pasteRow.append(el('button', {
          class: 'sm-wbtn ghost del',
          onclick: () => {
            const list = parsePaste();
            if (!list.length) { toast('Paste a list first.'); return; }
            D.confirmDialog('Replace all ' + p.words.length + ' words with these ' + list.length + '?',
              () => addWords(list, true), { label: 'Replace', danger: true });
          },
        }, 'Replace the whole list'));
        box.append(pasteRow);

        for (const o of p.words) {
          const row = el('div', { class: 'sm-lrow' });
          const lad = el('span', { class: 'sm-lad' });
          lad.innerHTML = smLadderArt(p.ladder, o.lvl);
          row.append(lad, el('span', { class: 'sm-wordname' }, o.w));
          row.append(el('button', {
            class: 'sm-wbtn ghost',
            onclick: () => { o.mood = o.mood === 'up' ? 'mid' : o.mood === 'mid' ? 'down' : 'up'; redraw(); },
          }, o.mood));
          row.append(el('button', {
            class: 'sm-wbtn ghost',
            onclick: () => { o.lvl = o.lvl > 0 ? o.lvl - 1 : 0; redraw(); },
          }, '−'));
          row.append(el('span', { class: 'sm-lvlname' }, (o.lvl + 1) + ' · ' + SM_LVLNAME[o.lvl]));
          row.append(el('button', {
            class: 'sm-wbtn ghost',
            onclick: () => { o.lvl = o.lvl < SM_LVLMAX ? o.lvl + 1 : SM_LVLMAX; redraw(); },
          }, '+'));
          row.append(el('button', {
            class: 'sm-wbtn ghost del',
            onclick: () => { p.words = p.words.filter((x) => x !== o); redraw(); },
          }, '✕'));
          box.append(row);
        }

        // ---- the climb
        box.append(el('h4', {}, 'The climb'));
        const lrow = el('div', { class: 'sm-lrow' });
        for (const k of SM_LADDERS) {
          const b = el('button', {
            class: 'sm-ladpick' + (p.ladder === k ? ' on' : ''),
            title: k,
            onclick: () => { p.ladder = k; redraw(); },
          });
          for (const lv of [0, 2, 4]) {
            const s = el('span', { class: 'sm-lad' });
            s.innerHTML = smLadderArt(k, lv);
            b.append(s);
          }
          lrow.append(b);
        }
        box.append(lrow);

        // ---- the room
        box.append(el('h4', {}, 'The room'));
        box.append(el('div', { class: 'hint' },
          'Everything here is sized for a wall three metres away and thirty children. Four children '
          + 'round a laptop is a different room: closer, smaller, and their hands SHOULD be on it. '
          + 'One setting, so it is a distance and not eleven separate sizes.'));
        const rrow = el('div', { class: 'sm-lrow' });
        for (const [id, label] of [['board', 'Whole class'], ['table', 'Small group']]) {
          rrow.append(el('button', {
            class: 'sm-wbtn' + (p.room === id ? '' : ' ghost'),
            onclick: () => {
              p.room = id;
              // THE ONE SANCTIONED EXCEPTION to "the lock is never the setting's":
              // in a small group the hands are the point. Switching BACK does not
              // re-lock — the unlock is a consequence of the room, the re-lock is
              // a teacher's decision.
              if (id === 'table' && p.lock) {
                p.lock = false;
                toast('Small group — board unlocked, because their hands are the point.');
              }
              redraw();
            },
          }, label));
        }
        box.append(rrow);

        // ---- moments
        if (p.moments.length) {
          box.append(el('h4', {}, 'Moments'));
          box.append(el('div', { class: 'hint' },
            'A flag is not a sixth level. “Beyond” is a separate mark for the word a class produces '
            + 'once a term — an EVENT, carrying which box, which text, which lesson and, if you said '
            + 'so, who. Moments stay on this machine and never print.'));
          for (const m of p.moments) {
            const mb = el('div', { class: 'sm-moment' });
            mb.append(el('b', {}, '“' + m.w + '”'));
            mb.append(el('span', { class: 'sm-ctx' },
              [m.who || 'the class', m.box ? 'at the ' + m.box : null, m.unit,
                SM_STAGE_NAME(m.stage)].filter(Boolean).join(' · ')));
            mb.append(el('button', {
              class: 'sm-wbtn ghost del',
              onclick: () => {
                if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Story map');
                p.moments = p.moments.filter((x) => x !== m);
                redraw();
              },
            }, 'Delete'));
            box.append(mb);
          }
          const m0 = p.moments[0];
          const ins = el('div', { class: 'sm-insert' });
          ins.append(el('div', { class: 'sm-insertlab' }, 'What a report can say'));
          ins.append(el('div', {}, 'During our ' + (m0.unit || 'unit') + ', '
            + (m0.who || 'the class') + ' offered “' + m0.w + '”'
            + (m0.box ? ' at the ' + m0.box : '')
            + ' — a word beyond what the year group is expected to reach for.'));
          ins.append(el('div', { class: 'sm-rhet' },
            (m0.who || 'The class') + ' has made good progress in writing this term.'));
          box.append(ins);
        }

        // ---- reset
        /* The plan, the beats, their pictures and the words are the RESOURCE —
           you built it once and it should outlive the class that used it. The
           handwriting, the plotted draft and the moments are THIS class's work.
           Reset clears the second and keeps the first. */
        box.append(el('h4', {}, 'A new class'));
        const work = smClassWork(p);
        box.append(el('div', { class: 'hint' },
          work.any ? 'This map holds ' + work.say + '.' : 'This map holds no class work yet.'));
        box.append(el('button', {
          class: 'sm-wbtn ghost del',
          onclick: () => {
            const cw = smClassWork(p);
            if (!cw.any) { toast('Nothing to clear — this map is already just the resource.'); return; }
            D.confirmDialog('Clear ' + cw.say + '? The plan, the beats, their pictures, the target '
              + 'line and the words all stay.', () => {
              // the largest destructive act a hand can perform here, and it
              // cannot refuse the way everything else does, so it must be
              // recoverable
              if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Story map');
              p.strokes = {};
              const act = smActual(p);
              for (const b of p.beats) for (const t of act) delete b.v[t.id];
              p.wordsHidden = false;
              p.shown = {};
              // moments are the most class-specific object in the widget: they
              // name children who have left
              p.moments = [];
              toast('Cleared ' + cw.say + '. Kept the plan, ' + p.beats.length + ' beats, their '
                + 'pictures, the target line and the words.');
              redraw();
            }, { label: 'Clear', danger: true });
          },
        }, 'Reset for a new class'));

        box.append(el('div', { class: 'hint' },
          'Three lessons, three bits of paper, all describing the same five or six boxes. The board '
          + 'is for MODELLING — the children write on their own boards, which is why the lock, the '
          + 'stage band and the covers are all first-class controls. This is a teaching tool, not a '
          + 'painting-by-numbers story maker.'));
      },
    };

    WIDGETS.genretoolkit = {
      title: 'Genre toolkit', icon: 'genretoolkit', accent: '#c7d2fe', w: 780, h: 560,
      defaults: () => ({
        genre: null, src: null, face: 'text',
        revealed: [], ticked: [], text: '', marks: [], active: null,
        allBands: false, size: 1, coverList: false, coverBank: false,
      }),
      toPrintablePages(w) {
        const p = w.props;
        const pages = [];
        // built FROM gtPageKinds, so the list printCurrent indexes into and the
        // list the dialog shows are the same list, in the same order
        for (const kind of gtPageKinds(p)) {
          const row = GT_PAGES.find((r) => r[0] === kind);
          const svg = row && row[2](p);
          if (svg) pages.push({ svg, label: row[1] });
        }
        for (const pg of gtColdHotPages(w)) pages.push(pg);
        return pages;
      },
      // One page ticked — SagePrint's paper-waste principle (print.js:751) —
      // and it is the CURRENT face's sheet: the screen is already the control.
      // Same shape as modelwrite's (modelwrite.js:929): find the page in the
      // list, fall back to the first one. No arithmetic to drift.
      printCurrent(w) {
        const p = w.props || {};
        const i = gtPageKinds(p).indexOf(GT_FACE_PAGE[p.face] || 'poster');
        return i < 0 ? 0 : i;
      },

      mount(body, w, api) {
        body.classList.add('mntray', 'gtwidget');
        const p = w.props;

        // ---- mount-time coercion: props may be years old or hand-edited ----
        // Normalised IN PLACE, keeping the same genre object. The settings panel
        // holds a reference to it and app.js remounts the widget without
        // rebuilding the panel (app.js:9200 is save() + remount()), so replacing
        // the object here orphaned the open panel: its edits went to a dead object
        // and were silently lost, while it still pruned the LIVE reveals, ticks
        // and marks against the new ids — losing a criterion's highlights while
        // keeping its old wording. Identity is what keeps the two in step.
        if (p.genre && typeof p.genre === 'object') {
          Object.assign(p.genre, gtNormalize(p.genre, true).genre);
        } else p.genre = null;
        const g = p.genre;
        const ids = new Set(g ? g.items.map((it) => it.id) : []);
        p.revealed = [...new Set((Array.isArray(p.revealed) ? p.revealed : []).filter((id) => ids.has(id)))];
        p.ticked = [...new Set((Array.isArray(p.ticked) ? p.ticked : []).filter((id) => ids.has(id)))];
        p.text = gtCleanText(p.text).text;
        p.marks = gtNormMarks(
          (Array.isArray(p.marks) ? p.marks : []).filter((m) => m && ids.has(m.item)),
          gtTokens(p.text).length,
        );
        if (!ids.has(p.active)) p.active = null;
        if (typeof p.src !== 'string') p.src = null;
        p.allBands = !!p.allBands;
        // Cover is per-face. A widget saved before that split carries one boolean;
        // read it as the checklist's, which is the face it was almost certainly on.
        if (typeof p.cover === 'boolean') {
          if (p.cover && p.coverList === undefined) p.coverList = true;
          delete p.cover;
        }
        p.coverList = !!p.coverList;
        p.coverBank = !!p.coverBank;
        p.size = clamp(p.size | 0, 0, 2);
        // 'bank' on a genre with three empty lists falls back, because §8.5 hides
        // that face rather than showing a blank panel
        if (!['list', 'text', 'bank'].includes(p.face) || (p.face === 'bank' && !gtHasBank(g))) {
          p.face = 'text';
        }

        const toks = gtTokens(p.text);
        let tkEls = [];
        // held so the bar can update the chip strip and the text size in place
        // rather than rebuilding the token DOM and losing the scroll position
        let chipsEl = null, textEl = null;

        const face = el('div', { class: 'gt-face grow' });
        const quick = el('div', { class: 'tclock-quick gt-quick' });
        body.append(face, quick);

        // Re-render only what changed. On the model text face the token container
        // IS the scroller, so a reveal or an active-criterion change must leave it
        // alone — otherwise every tap in a WAGOLL session scrolls the class back to
        // line one. Switching face is the only thing that rebuilds (paintAll).
        const commit = () => {
          save();
          if (p.face === 'text' && p.text) { paintChips(); restyle(0, toks.length - 1); }
          else if (p.face === 'bank') paintBank();
          else if (p.face === 'list') paintList();
          else paintAll();
          paintQuick();
        };
        const items = () => (g ? g.items : []);
        const byId = (id) => items().find((it) => it.id === id) || null;
        const colOf = (id) => gtColOf(g, id);
        const revealedItems = () => p.revealed.map(byId).filter(Boolean);
        const deckBand = () => gtBandFor((D.deck() || {}).yearGroup);
        // Reveal walks the deck's band; the chevron list shows every item, so any
        // criterion can still be revealed out of band — Glenn's call: the widget
        // follows the year group, the teacher overrules it
        const queue = () => {
          const band = p.allBands ? null : deckBand();
          return items().filter((it) => !p.revealed.includes(it.id) && (!band || it.band === band));
        };
        const marksOf = (id) => p.marks.filter((m) => m.item === id);

        // ---------------------------------------------------------- genre picker
        function paintPick() {
          face.replaceChildren();
          const grid = el('div', { class: 'gt-pick' });
          for (const def of gtDefaults()) {
            const words = GT_LANG.reduce((n, [k]) => n + (def.language[k] || []).length, 0);
            const look = gtLook(def.id);
            grid.append(el('button', {
              class: 'gt-pick-card',
              style: '--gt-tint:' + look.t + ';--gt-ink:' + look.k,
              onclick: () => {
                p.genre = def;
                p.src = def.id;
                p.revealed = []; p.ticked = []; p.marks = []; p.active = null;
                if (def.model) p.text = def.model;
                api.refresh();
              },
            },
            gtArtEl(def.id),
            el('span', { class: 'gt-pick-name' }, def.name),
            el('span', { class: 'gt-pick-sub' }, def.items.length + ' criteria · ' + words + ' words')));
          }
          face.append(
            el('div', { class: 'gt-pick-lead' }, 'Which genre is this unit?'),
            grid,
            el('div', { class: 'row gt-pick-row' },
              el('button', {
                class: 'btn ghost small',
                onclick: () => { p.genre = gtBlank(); p.src = null; api.refresh(); },
              }, 'Start blank'),
              el('button', {
                class: 'btn ghost small',
                onclick: () => gtOpenPack(w, api),
              }, 'Load a genre pack…')),
            // says what a pack IS, because the alternative reading cost a
            // teacher an afternoon: "Open a pack file…" sat here looking like
            // the way to put a model text in, and it only ever took .genre
            // files. The model text goes in on the Model text face.
            el('div', { class: 'hint' }, 'A genre pack is a set of criteria and a word bank — '
              + 'a school’s own, saved from here. Your model text goes in on the Model text '
              + 'face once a genre is picked. Every criterion here is our wording or the '
              + 'National Curriculum’s — no scheme’s, and Settings lets you change all of it.'),
          );
        }

        // ---------------------------------------------------------- checklist face
        function paintList() {
          face.replaceChildren();
          // §6's first line: the genre names itself. These criteria are on the
          // board for three weeks — untitled, they are just a list of rules.
          face.append(el('div', { class: 'gt-title' }, g.name));
          const list = el('div', { class: 'gt-list' + (p.coverList ? ' gt-covered' : '') });
          const shown = revealedItems();
          if (!shown.length) {
            list.append(el('div', { class: 'gt-none' },
              items().length
                ? 'Nothing revealed yet — press Reveal when you have taught the first one.'
                : 'No criteria yet. Add some in Settings.'));
          }
          /* A TICK IS THE CLASS SAYING "WE CAN DO THIS NOW". Nothing else sets
             it (Glenn, 2026-07-29).

             It used to tick itself the moment a criterion had a highlight, and
             then refuse to come off while the highlight existed. That conflated
             two different claims into one box: "we found this in the WAGOLL" and
             "we can do this". The first happens in the first lesson of the unit,
             the second takes three weeks — so the poster that went up on day one
             went up with every box the class had just found already ticked, and
             the tick printed too (gtPosterSvg). The one place the widget made a
             claim in front of a class that wasn't true.

             The highlights have not gone anywhere; they are shown next to the
             box as a COUNT, which is what they always were — evidence that the
             feature is in the model text, sitting beside the separate question
             of whether the class can use it yet. From one upwards, because
             "found once" is exactly as much evidence as the old rule needed to
             tick the box outright.

             In-flight decks are not migrated on purpose. A toolkit mid-unit
             loses the ticks it never earned and keeps its counts, which is the
             correction arriving rather than a loss. Hand ticks were always
             stored separately in p.ticked and are untouched. */
          for (const it of shown) {
            const n = marksOf(it.id).length;
            const on = p.ticked.includes(it.id);
            list.append(el('div', {
              class: 'gt-row' + (p.active === it.id ? ' gt-on' : ''),
              onclick: () => { p.active = p.active === it.id ? null : it.id; commit(); },
            },
            el('span', { class: 'gt-sw', style: 'background:' + colOf(it.id) }),
            el('span', { class: 'gt-crit' }, it.t),
            n ? el('span', {
              class: 'gt-ev',
              title: n === 1 ? 'Found once in the model text' : 'Found ' + n + ' times in the model text',
            }, String(n)) : null,
            el('button', {
              class: 'gt-tick' + (on ? ' on' : ''),
              title: on ? 'The class can do this — tap to take it back'
                : 'Tick when the class can do this',
              onclick: (e) => {
                e.stopPropagation();
                const at = p.ticked.indexOf(it.id);
                if (at < 0) p.ticked.push(it.id); else p.ticked.splice(at, 1);
                commit();
              },
            }, on ? iconEl('tick') : null)));
          }
          face.append(list);
        }

        // ---------------------------------------------------------- model text face
        function tokenCol(i, lo, hi) {
          if (lo != null && i >= lo && i <= hi) return colOf(p.active);
          const m = gtMarkAt(p.marks, i);
          return m ? colOf(m.item) : null;
        }
        // does the paint covering i also cover i-1? decides whether the gap before
        // token i is painted, so a phrase reads as one continuous highlight rather
        // than as striped words
        function sameRun(i, lo, hi) {
          if (i <= 0) return false;
          if (lo != null && i > lo && i <= hi) return true;
          if (lo != null && (i === lo || i - 1 === hi)) return false;
          const a = gtMarkAt(p.marks, i - 1), b = gtMarkAt(p.marks, i);
          return !!a && a === b;
        }
        function styleToken(i, lo, hi) {
          const rec = tkEls[i];
          if (!rec) return;
          const col = tokenCol(i, lo, hi);
          rec.tk.style.background = col || '';
          rec.tk.classList.toggle('on', !!col);
          if (rec.gap) rec.gap.style.background = col && sameRun(i, lo, hi) ? col : '';
        }
        function restyle(from, to, lo, hi) {
          const a = Math.max(0, from);
          const b = Math.min(toks.length - 1, to + 1);
          for (let i = a; i <= b; i++) styleToken(i, lo, hi);
        }

        // The chip strip is filled separately from the token DOM, because changing
        // the active criterion must NOT rebuild the tokens: the token container is
        // the scroller, so rebuilding it sends a teacher who has scrolled to
        // paragraph three back to the first line. That happens on every chip tap,
        // every Reveal and every Hide last — the core loop of a WAGOLL session.
        /* Bring the armed chip into view after a reveal. The strip is capped at
           42% of the face and a new chip always lands last, so on a full unit
           the thing just armed is the one thing off the bottom.

           Scrolls the STRIP and nothing else — deliberately not
           scrollIntoView(), which walks up and scrolls every scrollable
           ancestor it finds, and the ancestors here are the widget and the
           stage. A board that jumps because a chip needed 20px is the
           spatial-stability rule broken for the sake of keeping it. */
        function showActiveChip() {
          if (p.face !== 'text' || !chipsEl) return;
          const chip = chipsEl.querySelector('.gt-chip.on');
          if (!chip) return;
          const box = chipsEl.getBoundingClientRect();
          const r = chip.getBoundingClientRect();
          if (r.top < box.top) chipsEl.scrollTop -= (box.top - r.top);
          else if (r.bottom > box.bottom) chipsEl.scrollTop += (r.bottom - box.bottom);
        }

        function paintChips() {
          if (!chipsEl) return;
          chipsEl.replaceChildren();
          const shown = revealedItems();
          if (!shown.length) {
            chipsEl.append(el('span', { class: 'gt-chips-none' },
              'Reveal a criterion to start marking the text with it'));
          }
          for (const it of shown) {
            chipsEl.append(el('button', {
              class: 'gt-chip' + (p.active === it.id ? ' on' : ''),
              style: 'background:' + colOf(it.id),
              onclick: () => {
                p.active = p.active === it.id ? null : it.id;
                save();
                paintChips();
                restyle(0, toks.length - 1);
              },
            }, it.t));
          }
        }

        function paintText() {
          face.replaceChildren();
          tkEls = [];
          chipsEl = null;
          if (!p.text) { paintPaste(); return; }

          const chips = el('div', { class: 'gt-chips' });
          chipsEl = chips;
          paintChips();

          const wrap = el('div', { class: 'gt-text gt-size' + p.size });
          textEl = wrap;
          for (let i = 0; i < toks.length; i++) {
            const t = toks[i];
            let gap = null;
            if (t.pre) {
              gap = el('span', { class: 'gt-gap' }, t.pre);
              wrap.append(gap);
            }
            const tk = el('span', { class: 'gt-tk' }, t.s);
            tk.dataset.i = String(i);
            wrap.append(tk);
            tkEls.push({ tk, gap });
          }
          wrap.addEventListener('pointerdown', onDown);
          // chips, then the board. "New text…" used to sit under the text on its
          // own row; it lives on the bar now, so this face is the criteria the
          // class is marking with and the words they are marking — nothing else.
          face.append(chips, wrap);
          restyle(0, toks.length - 1);
        }

        function paintPaste() {
          const ta = el('textarea', {
            class: 'names-area gt-paste', rows: '6',
            placeholder: 'Paste your model text here — the WAGOLL the class is going to pull apart.',
          });
          const take = () => {
            const res = gtCleanText(ta.value);
            if (!res.text.trim()) { toast('Nothing to read there'); return; }
            if (res.clipped) toast('That was very long — kept the first part of it');
            p.text = res.text;
            p.marks = [];
            api.refresh();
          };
          // SageDocText reads Word and PDF as well as plain text (doctext.js).
          // Almost no teacher has a .txt of their WAGOLL — it is a Word file,
          // or a PDF that came round in an email — and asking for a conversion
          // in the ninety seconds before a lesson is asking them not to bother
          // (Glenn, 2026-07-29). If the module is somehow absent the old
          // plain-text path still works, so this face never dies.
          const DT = window.SageDocText;
          const fileIn = el('input', {
            type: 'file', style: 'display:none;',
            accept: (DT && DT.EXT) || '.txt,.md,.text,text/plain,text/markdown',
          });
          const openBtn = el('button', {
            class: 'btn ghost small',
            onclick: () => { if (!openBtn.disabled) fileIn.click(); },
          }, DT ? 'Open a document…' : 'Open a text file…');
          fileIn.addEventListener('change', () => {
            const f = (fileIn.files || [])[0];
            fileIn.value = '';
            if (!f) return;
            if (!DT) {
              if (f.size > GT_CAP.text * 8) { toast('That file is too big to read here'); return; }
              const fr = new FileReader();
              fr.onerror = () => toast('Could not read that file');
              fr.onload = () => { ta.value = String(fr.result || '').slice(0, GT_CAP.text * 2); take(); };
              fr.readAsText(f);
              return;
            }
            // a forty-page PDF takes a moment, and a button that looks dead is
            // how a teacher ends up opening the file three times
            openBtn.disabled = true;
            openBtn.textContent = 'Reading…';
            const done = () => {
              openBtn.disabled = false;
              openBtn.textContent = 'Open a document…';
            };
            DT.read(f, { maxChars: GT_CAP.text * 2 }).then((res) => {
              done();
              ta.value = res.text;
              take();
              // said after the text is in, not instead of it: the note is
              // always about something dropped, never about a failure
              if (res.note) toast(res.note);
            }).catch((err) => {
              done();
              toast((err && err.message) || 'Could not read that file');
            });
          });
          face.append(el('div', { class: 'gt-empty' },
            ta,
            el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;' },
              el('button', { class: 'btn small', onclick: take }, 'Use this text'),
              openBtn,
              fileIn),
            el('div', { class: 'hint' }, DT
              ? 'Paste it, or open a Word document, a PDF or a text file — the words come '
                + 'across, nothing else. A page or two is plenty. Once it is in, tap a word to '
                + 'mark it with whichever criterion is chosen, or drag across a phrase. '
                + 'Punctuation taps on its own, so a comma or an apostrophe can be marked by itself.'
              : 'Plain text — a page or two is plenty. Once it is in, tap a '
                + 'word to mark it with whichever criterion is chosen, or drag across a phrase. '
                + 'Punctuation taps on its own, so a comma or an apostrophe can be marked by itself.')));
        }

        const idxAt = (ev) => {
          const node = document.elementFromPoint(ev.clientX, ev.clientY);
          const tk = node && node.closest ? node.closest('.gt-tk') : null;
          if (!tk || !face.contains(tk)) return -1;
          const i = Number(tk.dataset.i);
          return Number.isInteger(i) ? i : -1;
        };

        function onDown(ev) {
          const from = idxAt(ev);
          if (from < 0) return;
          // nothing active: a tap reads out what is already there, and an unmarked
          // token does nothing at all — reading the text aloud with a finger on the
          // board must never paint by accident
          if (!p.active) {
            const m = gtMarkAt(p.marks, from);
            const it = m && byId(m.item);
            if (it) toast(it.t);
            return;
          }
          ev.preventDefault();
          const existing = gtMarkAt(p.marks, from);
          const drag = { to: from, id: ev.pointerId, erase: !!existing && existing.item === p.active };
          if (!drag.erase) restyle(from, from, from, from);
          const move = (e2) => {
            if (e2.pointerId !== drag.id) return;
            const at = idxAt(e2);
            if (at < 0 || at === drag.to) return;
            const oldLo = Math.min(from, drag.to), oldHi = Math.max(from, drag.to);
            drag.to = at;
            // a drag paints, even one that began on this item's own ink: erasing is
            // a tap, and a drag that started as one becomes a re-paint
            drag.erase = false;
            const lo = Math.min(from, drag.to), hi = Math.max(from, drag.to);
            restyle(Math.min(oldLo, lo), Math.max(oldHi, hi), lo, hi);
          };
          const up = (e2) => {
            if (e2.pointerId !== drag.id) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            // A CANCEL IS NOT A STROKE. The text is a real scroller with
            // touch-action: pan-y, so a finger swipe to scroll the WAGOLL hands the
            // gesture to the scroller and fires pointercancel — and committing on
            // that painted a highlight every single time a teacher scrolled, which
            // then auto-ticked the criterion and could not be un-ticked from the
            // checklist while the stray mark existed. preventDefault on pointerdown
            // does not help: touch scrolling is governed by touch-action.
            // english-word.js:2015 guards the same way.
            if (e2.type === 'pointercancel') { restyle(0, toks.length - 1); return; }
            const lo = Math.min(from, drag.to), hi = Math.max(from, drag.to);
            p.marks = drag.erase
              ? gtErase(p.marks, lo, hi, toks.length)
              : gtPaint(p.marks, lo, hi, p.active, toks.length);
            save();
            restyle(0, toks.length - 1);
            paintQuick(); // a first mark can tick a criterion, and the bar counts them
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }

        // ---------------------------------------------------------- word bank face
        function paintBank() {
          face.replaceChildren();
          const box = el('div', { class: 'gt-bank' + (p.coverBank ? ' gt-covered' : '') });
          for (const [key, label] of GT_LANG) {
            const words = g.language[key] || [];
            if (!words.length) continue; // a group with no words is omitted, not shown empty
            const cards = el('div', { class: 'gt-words' });
            for (const wd of words) cards.append(el('span', { class: 'gt-word' }, wd));
            box.append(el('div', { class: 'gt-grp' }, el('div', { class: 'gt-glab' }, label), cards));
          }
          face.append(box);
        }

        // ---------------------------------------------------------- the bar
        /* TWO DELIBERATE ROWS, not one row that happens to wrap.
           Glenn, 2026-07-29: "once the text is uploaded, the button height and
           placement goes awry." Measured, it did: the bar was one centred
           flex-wrap row whose membership changes with the face and the state
           (Cover on two faces, Size and New text only once a text is in, undo
           only once something is revealed), so every change re-centred every
           row and orphaned whatever fell over the edge — "Size 2 · Print…"
           alone on a second line. This is the sentence builder's V0.1 lesson
           applied here: a wrapping toolbar is design by accident, and the fix
           is explicit rows with anchored ends (iteration log, 2026-07-25).

           Row 1  [ faces ]················[ tools ][ Print… ]
           Row 2  [ Reveal: the criterion ..........][ › ][ ↺ ]

           The faces are pinned left and Print is pinned right on row 1, so the
           two things a teacher reaches for without looking never move. Reveal
           owns row 2 outright, which is what lets it carry a criterion in full
           without shoving anything. */
        function paintQuick() {
          quick.replaceChildren();
          if (!g) return;

          // ---- row 1: where you are, and the tools for being there
          const rowNav = el('div', { class: 'gt-row gt-row-nav' });
          // Model text first: it is where the unit starts — the class pulls the
          // WAGOLL apart, and the criteria and words come out of it. It is also
          // where a document is opened, which is the thing that was impossible
          // to find (Glenn's order, 2026-07-29).
          const faces = [['text', 'Model text']];
          if (gtHasBank(g)) faces.push(['bank', 'Word bank']);
          faces.push(['list', 'Checklist']);
          const seg = el('div', { class: 'gt-seg' });
          for (const [id, label] of faces) {
            seg.append(el('button', {
              class: 'btn ghost small' + (p.face === id ? ' gt-active' : ''),
              // the one control that genuinely rebuilds: a different face
              onclick: () => { p.face = id; save(); paintAll(); },
            }, label));
          }
          rowNav.append(seg, el('span', { class: 'grow' }));

          const tools = el('div', { class: 'gt-tools' });
          const band = deckBand();
          if (band) {
            tools.append(el('button', {
              class: 'btn ghost small' + (p.allBands ? ' gt-active' : ''),
              title: p.allBands ? 'Reveal walks every year'
                : 'Reveal walks ' + gtBandName(band) + ' — this deck’s year group',
              onclick: () => { p.allBands = !p.allBands; commit(); },
            }, p.allBands ? 'All years' : gtBandName(band)));
          }

          // no Cover on the model text face: covering the WAGOLL is what the mask
          // boxes in the book page widget are for.
          // Cover is PER FACE (§8.5), not one shared flag — covering the criteria
          // for a recall moment must not also blank the word bank the class is
          // writing from, and switching face must not carry a cover across.
          if (p.face !== 'text') {
            const key = p.face === 'bank' ? 'coverBank' : 'coverList';
            tools.append(el('button', {
              class: 'btn ghost small' + (p[key] ? ' gt-active' : ''),
              title: p.face === 'bank' ? 'Cover the words' : 'Cover the criteria',
              onclick: () => { p[key] = !p[key]; commit(); },
            }, 'Cover'));
          }

          if (p.face === 'text' && p.text) {
            tools.append(el('button', {
              class: 'btn ghost small',
              title: 'Text size on the board',
              // a class swap, not a rebuild — the tokens and the scroll stay put
              onclick: () => {
                p.size = (p.size + 1) % 3;
                save();
                if (textEl) textEl.className = 'gt-text gt-size' + p.size;
                paintQuick();
              },
            }, 'Size ' + (p.size + 1)));
            // moved off the reading surface and onto the bar: the board should
            // hold the model text and nothing else, and a button floating over
            // the last line of it was the only thing on that face that was not
            // the text
            tools.append(el('button', {
              class: 'btn ghost small',
              title: 'Put a different model text in',
              onclick: () => {
                D.confirmDialog('Put a different model text in? This clears the highlights on the '
                  + 'current one — they are tied to its words.', () => {
                  if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Genre toolkit');
                  p.text = ''; p.marks = [];
                  api.refresh();
                }, { label: 'Clear the text', danger: true });
              },
            }, 'New text…'));
          }

          // Print, pinned to the right-hand end and unconditional
          // (poster-print-design.md §3.1). This widget earns a bar control
          // because two of its three sheets carry what the class did — the
          // criteria in the order they met them, and the model text with their
          // marks on it. Ghost, not solid: solid is the one act a widget exists
          // to perform, and here that is Reveal. Never conditional on the face —
          // a control that comes and goes reflows the bar mid-lesson;
          // printCurrent already opens the dialog on the sheet showing.
          tools.append(el('button', {
            class: 'btn ghost small gt-print',
            title: 'Print — pick the pages worth the paper',
            onclick: () => {
              if (!window.SagePrint) { toast('Print engine not loaded'); return; }
              const def = WIDGETS.genretoolkit;
              let job = null, at = 0;
              try {
                job = def.toPrintablePages(w);
                at = def.printCurrent(w);
              } catch (err) {
                toast('Couldn’t prepare the page — ' + ((err && err.message) || 'unknown error'));
                return;
              }
              if (!job || !job.length) { toast('Nothing to print yet'); return; }
              SagePrint.openDialog(job, { title: def.title, current: at });
            },
          }, iconEl('print'), el('span', { class: 'gt-print-lab' }, 'Print…')));
          rowNav.append(tools);

          // ---- row 2: the act
          const rowAct = el('div', { class: 'gt-row gt-row-act' });
          const next = queue()[0] || null;
          rowAct.append(next
            ? el('button', {
              // in full, never clipped: the children read this to know what
              // they are about to be shown, and it is often the lesson's
              // learning intention. It wraps and takes the room it needs
              // (Glenn, 2026-07-29 — the same call as the chips).
              class: 'btn small gt-reveal',
              // Revealing ARMS it (Glenn, 2026-07-29). "Here is today's
              // criterion — now find it in the text" was the commonest next
              // move and it cost a hunt for a chip that always lands last in a
              // strip capped at 42% of the face. Deliberately only here and not
              // in the chevron menu: that reveals several at once, so arming
              // whichever happened to be tapped last would be arbitrary, and
              // the menu covers the strip that would show it.
              onclick: () => {
                p.revealed.push(next.id);
                p.active = next.id;
                commit();
                showActiveChip();
              },
            }, 'Reveal: ' + next.t)
            : el('button', {
              class: 'btn ghost small gt-dim gt-reveal',
              title: 'Nothing left to reveal in this band — the chevron reveals from any year',
              onclick: () => toast(items().length ? 'All of this band is revealed' : 'No criteria yet'),
            }, 'All revealed'));

          // a chevron rather than a long-press: long-press on a board is a coin
          // toss, and this list is how a criterion gets revealed out of band
          rowAct.append(el('button', {
            // stays lit while its menu is open, and a commit rebuilds this
            // button underneath an open menu, so the state is read here too
            class: 'btn ghost small gt-chev' + (revealMenu ? ' gt-active' : ''),
            title: 'Reveal any criterion — pick as many as you need',
            onclick: () => openRevealMenu(),
          }, iconEl('chevr')));

          // Always present, disabled when there is nothing to take back, so the
          // end of row 2 does not move the first time a criterion is revealed.
          const canUndo = p.revealed.length > 0;
          rowAct.append(el('button', {
            class: 'btn ghost small gt-undo' + (canUndo ? '' : ' gt-dim'),
            title: canUndo
              ? 'Un-reveal the last one — a misfire in front of thirty children needs one tap back'
              : 'Nothing revealed yet',
            onclick: () => {
              if (!canUndo) return;
              const id = p.revealed.pop();
              if (p.active === id) p.active = null;
              commit();
            },
          }, iconEl('undo')));

          quick.append(rowNav, rowAct);
        }

        /* The reveal-out-of-order menu STAYS OPEN while criteria are picked
           (Glenn, 2026-07-29). It used to close on the first tap, so putting up
           four criteria at the start of a lesson meant opening it four times.
           Each tap still reveals immediately — the act is live, and nothing is
           held back waiting for an OK that a dismissed menu would lose — but the
           menu repaints its own ticks in place and waits for the next one.

           Three ways out, and no fourth: the chevron toggles it shut, a tap
           anywhere off it closes it, Escape closes it. (The app-wide
           tap-off-to-close work is happening elsewhere; this is the widget's own
           handler and stays local so the two do not collide.) */
        let revealMenu = null;

        // The chevron's open/shut look is a class swap on the live element, NOT
        // a paintQuick(). closeRevealMenu runs from a capture-phase pointerdown,
        // and rebuilding the bar there would detach whatever the teacher was
        // actually pressing before its click could fire — tapping Print while
        // the menu was open would silently do nothing.
        const markChev = (open) => {
          const cv = quick.querySelector('.gt-chev');
          if (cv) cv.classList.toggle('gt-active', open);
        };

        function closeRevealMenu() {
          if (!revealMenu) return;
          revealMenu.el.remove();
          document.removeEventListener('pointerdown', revealMenu.away, true);
          document.removeEventListener('keydown', revealMenu.key, true);
          revealMenu = null;
          markChev(false);
        }

        function paintRevealMenu(menu) {
          menu.replaceChildren();
          for (const [bid, label] of GT_BANDS) {
            const inBand = items().filter((it) => it.band === bid);
            if (!inBand.length) continue;
            menu.append(el('div', { class: 'gt-menu-lab' }, label));
            for (const it of inBand) {
              const on = p.revealed.includes(it.id);
              menu.append(el('button', {
                class: 'gt-menu-it' + (on ? ' on' : ''),
                onclick: () => {
                  if (on) {
                    p.revealed = p.revealed.filter((x) => x !== it.id);
                    if (p.active === it.id) p.active = null;
                  } else p.revealed.push(it.id);
                  commit();          // the board, the chips and the bar
                  paintRevealMenu(menu); // and this menu's own ticks, in place
                },
              }, el('span', { class: 'gt-sw', style: 'background:' + colOf(it.id) }),
              el('span', { class: 'gt-menu-t' }, it.t), on ? iconEl('tick') : null));
            }
          }
          if (!menu.children.length) {
            menu.append(el('div', { class: 'gt-menu-lab' }, 'No criteria yet'));
            return;
          }
          menu.append(el('div', { class: 'gt-menu-foot' },
            'Tap as many as you need — the arrow closes this.'));
        }

        function openRevealMenu() {
          if (revealMenu) { closeRevealMenu(); return; } // the chevron toggles
          const menu = el('div', { class: 'gt-menu' });
          const away = (e) => {
            if (menu.contains(e.target)) return;
            // the chevron is a NEW element after every commit, so it is
            // recognised by class rather than by identity — otherwise the first
            // reveal orphans the anchor and the toggle stops working
            if (e.target.closest && e.target.closest('.gt-chev')) return;
            closeRevealMenu();
          };
          const key = (e) => { if (e.key === 'Escape') closeRevealMenu(); };
          revealMenu = { el: menu, away: away, key: key };
          paintRevealMenu(menu);
          // clear of the WHOLE bar, measured rather than assumed: the bar is two
          // rows now and grows again when a long criterion wraps, and the fixed
          // offset this used to carry put the menu over the model text — the one
          // thing §11 says it must never cover
          menu.style.bottom = (quick.offsetHeight + 12) + 'px';
          body.append(menu);
          markChev(true);
          setTimeout(() => {
            document.addEventListener('pointerdown', away, true);
            document.addEventListener('keydown', key, true);
          }, 0);
        }

        function paintAll() {
          // the genre's own colour off the picker card, carried into the
          // widget: the face you are on wears the tint the class chose the unit
          // by, so picker and toolkit read as one thing rather than a coloured
          // menu leading to a grey tool. An imported or renamed genre has no
          // entry and falls back to the widget's own accent, which is what
          // --acc already defaulted to.
          const look = p.src ? GT_LOOK[p.src] : null;
          body.style.setProperty('--acc', (look && look.t) || '#c7d2fe');
          // the same genre's deep ink, so the face you are on is stated in the
          // text and the ring as well as the fill — a pale fill alone was too
          // quiet across a projector (Glenn, 2026-07-29)
          body.style.setProperty('--acc-ink', (look && look.k) || '#4338ca');
          if (!g) { paintPick(); quick.replaceChildren(); return; }
          if (p.face === 'bank' && !gtHasBank(g)) p.face = 'text';
          if (p.face === 'text') paintText();
          else if (p.face === 'bank') paintBank();
          else paintList();
          paintQuick();
        }

        paintAll();
      },

      settings(box, w, api) {
        const p = w.props;
        if (!p.genre) {
          box.append(el('div', { class: 'hint' }, 'Pick a genre on the widget first.'),
            el('button', { class: 'btn ghost small', onclick: () => gtOpenPack(w, api) },
              'Load a genre pack…'));
          return;
        }
        const g = p.genre;

        const nameIn = el('input', { class: 'text-input', type: 'text', value: g.name, maxlength: '60' });
        nameIn.addEventListener('change', () => {
          g.name = gtStr(nameIn.value, GT_CAP.name) || 'Genre';
          nameIn.value = g.name;
          save();
          api.refresh();
        });

        // Three band textareas and three word bank ones, one entry per line. The
        // band is structural rather than something a teacher types, and a textarea
        // IS the list: saving replaces it outright (supersede, never accumulate).
        const areas = [];
        const mkArea = (rows, value, placeholder) => {
          const ta = el('textarea', { class: 'names-area gt-edit-area', rows: String(rows), placeholder });
          ta.value = value;
          areas.push(ta);
          return ta;
        };
        const bandAreas = GT_BANDS.map(([bid, label]) => ({
          bid,
          label,
          ta: mkArea(4, g.items.filter((it) => it.band === bid).map((it) => it.t).join('\n'),
            'One criterion per line'),
        }));
        const langAreas = GT_LANG.map(([key, label]) => ({
          key,
          label,
          ta: mkArea(3, (g.language[key] || []).join('\n'), 'One per line'),
        }));

        function applyEdits() {
          // Belt and braces on top of the identity fix in mount: if the genre
          // object this panel was built from is no longer the widget's, these
          // textareas describe a state that no longer exists. Applying them would
          // write old wording over new AND prune the live reveals and marks against
          // it. Rebuild instead, and say so rather than failing silently.
          if (p.genre !== g) {
            toast('The widget changed — reopening these settings');
            api.refresh();
            return;
          }
          // A line whose text is unchanged keeps its id, so re-wording ONE
          // criterion does not drop the reveals and marks on the other fifteen.
          // Matched by exact text within its band, first unmatched old item wins —
          // two identically worded criteria in one band resolve in order rather
          // than both claiming the same id.
          const pool = new Map();
          for (const it of g.items) {
            const key = it.band + ' ' + it.t;
            if (!pool.has(key)) pool.set(key, []);
            pool.get(key).push(it);
          }
          const next = [];
          let over = false;
          for (const { bid, ta } of bandAreas) {
            for (const line of String(ta.value || '').split('\n')) {
              const t = gtStr(line, GT_CAP.item);
              if (!t) continue;
              if (next.length >= GT_CAP.items) { over = true; break; }
              const bucket = pool.get(bid + ' ' + t);
              const reuse = bucket && bucket.shift();
              next.push(reuse || { id: uid(), t, band: bid });
            }
            if (over) break;
          }
          g.items = next;
          const live = new Set(next.map((it) => it.id));
          p.revealed = p.revealed.filter((id) => live.has(id));
          p.ticked = p.ticked.filter((id) => live.has(id));
          p.marks = gtNormMarks(p.marks.filter((m) => live.has(m.item)), gtTokens(p.text).length);
          if (!live.has(p.active)) p.active = null;

          for (const { key, ta } of langAreas) {
            g.language[key] = String(ta.value || '').split('\n')
              .map((s) => gtStr(s, GT_CAP.word)).filter(Boolean).slice(0, GT_CAP.lang);
          }
          if (!gtHasBank(g) && p.face === 'bank') p.face = 'text';
          if (over) toast('Kept the first ' + GT_CAP.items + ' criteria');
          save();
          api.refresh();
        }
        for (const ta of areas) ta.addEventListener('change', applyEdits);

        const genreRow = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;' });
        for (const def of gtDefaults()) {
          genreRow.append(el('button', {
            class: 'btn ghost small' + (p.src === def.id ? ' gt-active' : ''),
            onclick: () => {
              if (p.src === def.id) return;
              const swap = () => {
                if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, 'Genre toolkit');
                p.genre = def;
                p.src = def.id;
                p.revealed = []; p.ticked = []; p.marks = []; p.active = null;
                save();
                api.refresh();
              };
              if (p.revealed.length || p.marks.length) {
                D.confirmDialog('Switch to “' + def.name + '”? Every criterion is a different one, so '
                  + 'this unit’s reveals and highlights go. The model text stays.',
                swap, { label: 'Switch', danger: true });
              } else swap();
            },
          }, def.name));
        }

        box.append(
          settingRowOr('Genre name', nameIn),
          el('h4', {}, 'Criteria'),
          ...bandAreas.flatMap(({ label, ta }) => [el('div', { class: 'gt-edit-lab' }, label), ta]),
          el('div', { class: 'hint' }, 'One per line. These are the success criteria you reveal as you '
            + 'teach them. The band decides which ones Reveal walks for this deck’s year group — the '
            + 'chevron beside it can still reveal any of them.'),
          el('h4', {}, 'Word bank'),
          ...langAreas.flatMap(({ label, ta }) => [el('div', { class: 'gt-edit-lab' }, label), ta]),
          el('div', { class: 'hint' }, 'The genre’s words, for the board and for the wall. A box IS the '
            + 'list — save it and it replaces what was there, so nothing stale outlives an update. '
            + 'Empty all three and the word bank face gets out of your way.'),
          el('h4', {}, 'This pack'),
          genreRow,
          el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;' },
            el('button', {
              class: 'btn ghost small',
              onclick: () => {
                D.confirmDialog('Only share wording your school wrote. Rhymes, lens names and toolkit '
                  + 'text from paid schemes belong to their publishers.',
                () => gtSavePack(w), { label: 'Save the file', danger: false });
              },
            }, 'Save as a file…'),
            el('button', {
              class: 'btn ghost small',
              onclick: () => gtOpenPack(w, api),
            }, 'Load a genre pack…')),
          el('div', { class: 'hint' }, 'A pack is one plain file you own — hand it to next year’s '
            + 'teacher, or keep it as yours. Opening one replaces the criteria and the word bank here.'),
        );
      },
    };
  }

  window.SageEnglishText = {
    init(deps) {
      D = deps;
      register();
    },
  };
})();
