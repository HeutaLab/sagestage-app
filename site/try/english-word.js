/* Sage Stage — English widgets, Sound & Word grains.
   Design: docs/english-widgets-design.md (§5–§6) and docs/phoneme-tiles-design.md.
   Slice 1: phoneme tiles — grapheme tiles dragged into word frames with the sound
   support (dot / bar / split-digraph arc) drawn underneath, the counters grammar
   throughout. Slice 2: word class sorter (§6.3) — word cards dragged into
   labelled class columns, open sort or checked, trap words flagged as
   discussion gold. Slice 3: word bank (§6.2, docs/word-bank-design.md) —
   vocabulary harvested onto a corkboard, tiered into lanes, opened big for the
   deep-teach routine. Registered into the app at boot via SageEnglishWord.init(deps),
   the export.js dependency-injection pattern. */
(function () {
  'use strict';

  let D = null; // injected by SageEnglishWord.init from app.js

  // ---------------------------------------------------------------- phonics pack
  // The default ships in english-packs.js (Letters and Sounds 2007, OGL). The
  // normaliser runs even on our own file so imported school packs (P2) inherit
  // the same hardening free: caps per the set design §9, charset-checked
  // graphemes, text only ever rendered via textContent.
  const GRAPHEME_RE = /^([a-z]{1,5}|[a-z]_[a-z])$/;
  function normalizePhonics(raw) {
    const phases = [];
    for (const ph of Array.isArray(raw && raw.phases) ? raw.phases.slice(0, 8) : []) {
      if (!ph || typeof ph !== 'object') continue;
      const id = String(ph.id == null ? phases.length + 2 : ph.id).slice(0, 4);
      const name = String(ph.name || 'Phase ' + id).slice(0, 30);
      let count = 0;
      const sets = [];
      for (const set of Array.isArray(ph.sets) ? ph.sets : []) {
        const clean = [];
        for (const g of Array.isArray(set) ? set : []) {
          const s = String(g || '').toLowerCase().trim();
          if (count < 60 && GRAPHEME_RE.test(s)) { clean.push(s); count++; }
        }
        if (clean.length) sets.push(clean);
      }
      const tricky = (Array.isArray(ph.tricky) ? ph.tricky : [])
        .map((t) => String(t || '').trim().slice(0, 30))
        .filter((t) => t && /^[A-Za-z' -]+$/.test(t))
        .slice(0, 40);
      phases.push({ id, name, sets, tricky });
    }
    return { phases };
  }
  // "Sound talk" is deliberately silent — the teacher voices each pure sound
  // (set design principle 6). Said once per session, at the moment it matters.
  let sayHintToasted = false;

  let packCache = null;
  function phonicsPack() {
    if (!packCache) {
      const banks = Array.isArray(window.SAGE_ENGLISH_PACKS) ? window.SAGE_ENGLISH_PACKS : [];
      packCache = normalizePhonics(banks.find((b) => b && b.kind === 'phonics'));
    }
    return packCache;
  }

  const FRAMES = [['blank', 'Blank'], ['vc', 'VC'], ['cvc', 'CVC'], ['ccvc', 'CCVC'], ['cvcc', 'CVCC'], ['ccvcc', 'CCVCC']];
  const BOXES = { blank: 0, vc: 2, cvc: 3, ccvc: 4, cvcc: 4, ccvcc: 5 };
  // three proficiency levels, chosen at the moment of running sound talk; the
  // stored keys predate the labels, so existing widgets keep their pace.
  // Labels are deliberately generic proficiency words — never a scheme's.
  const PACES = [
    ['slow', 'New', 'First teach — the slowest beat: time to model each pure sound and hear it echoed'],
    ['steady', 'Practising', 'Guided practice — steady beats, getting quicker'],
    ['brisk', 'Fluent', 'Quick recall — fast sound-talk for confident blenders'],
  ];
  const PACE_MS = { slow: 2200, steady: 1300, brisk: 750 };
  // §4.3 of the set design: the deck's year group sets the phonics window
  const yearPhase = (yg) => (yg === '1' ? '4' : yg && yg !== 'R' ? '5' : '2');
  const isSplit = (g) => g.includes('_');
  // frame cells a tile claims: a split digraph holds its box and the one two
  // along — the arc vaults the consonant's box in between (§5.1)
  const claimed = (it) => (it.cell == null ? [] : isSplit(it.g) ? [it.cell, it.cell + 2] : [it.cell]);

  // ---------------------------------------------- sound mat print (SagePrint)
  // First adopter of the poster seam (docs/poster-print-design.md §10): the
  // wall sound mat — cumulative GPCs to the resolved phase, grouped and
  // labelled per phase, sound buttons underneath (dot / bar / arc, §5.1), the
  // resolved phase's tricky words as cards at the foot. Pure vector, attribute
  // styling only, no ids, no external references; every string is XML-escaped
  // (tricky words may carry apostrophes). One known §2-checklist deviation,
  // logged: text rides the system font stack until chrome-font embedding lands.
  const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESC[c]);

  function ptSoundMatSvg(p) {
    const pack = phonicsPack();
    const ids = pack.phases.map((x) => x.id);
    if (!ids.length) return null;
    // mirrors the mount-time phaseId(): widget override, else deck year group
    const auto = yearPhase(D.deck().yearGroup);
    const phId = p.phase && ids.includes(p.phase) ? p.phase
      : ids.includes(auto) ? auto : ids[0];
    const upTo = pack.phases.slice(0, ids.indexOf(phId) + 1);
    const groups = upTo.filter((ph) => ph.sets.length);
    const tricky = upTo[upTo.length - 1].tricky;
    const total = groups.reduce((a, ph) => a + ph.sets.reduce((b, s) => b + s.length, 0), 0);
    if (!total && !tricky.length) return null;

    const COLS = total > 40 ? 10 : total > 18 ? 8 : 6;
    const T = 96, G = 14, PAD = 32, SOUND = 30, ROWH = T + SOUND + G;
    const W = PAD * 2 + COLS * T + (COLS - 1) * G;
    const INK = '#111827', ACC = '#0e7490', PINK = '#db2777';
    const FONT = ' font-family="system-ui, sans-serif"';
    const parts = [];
    let y = PAD;

    const label = upTo.length > 1
      ? 'Phases ' + upTo[0].id + '–' + upTo[upTo.length - 1].id
      : upTo[0].name;
    parts.push('<text x="' + (W / 2) + '" y="' + (y + 24) + '" font-size="34" font-weight="700"'
      + ' text-anchor="middle" fill="' + INK + '"' + FONT + '>' + xmlEsc('Sound mat · ' + label) + '</text>');
    y += 56;

    for (const ph of groups) {
      if (groups.length > 1) {
        parts.push('<text x="' + PAD + '" y="' + (y + 20) + '" font-size="24" font-weight="700"'
          + ' fill="' + ACC + '"' + FONT + '>' + xmlEsc(ph.name) + '</text>');
        y += 38;
      }
      let col = 0;
      for (const set of ph.sets) for (const g of set) {
        const x = PAD + col * (T + G);
        const cx = x + T / 2;
        parts.push('<rect x="' + x + '" y="' + y + '" width="' + T + '" height="' + T + '" rx="12"'
          + ' fill="#ffffff" stroke="' + ACC + '" stroke-width="2.5"/>');
        parts.push('<text x="' + cx + '" y="' + (y + T / 2 + 12) + '" font-size="34" font-weight="700"'
          + ' text-anchor="middle" fill="' + INK + '"' + FONT + '>' + xmlEsc(g.replace('_', '-')) + '</text>');
        const sy = y + T + 16;
        if (isSplit(g)) {
          // arc: two letters, one sound, vaulting the middle
          parts.push('<path d="M ' + (cx - 30) + ' ' + sy + ' Q ' + cx + ' ' + (sy - 20) + ' '
            + (cx + 30) + ' ' + sy + '" fill="none" stroke="' + ACC + '" stroke-width="3.5"/>');
        } else if (g.length > 1) {
          parts.push('<rect x="' + (cx - 24) + '" y="' + (sy - 4) + '" width="48" height="8" rx="4"'
            + ' fill="' + ACC + '"/>');
        } else {
          parts.push('<circle cx="' + cx + '" cy="' + (sy - 1) + '" r="7" fill="' + ACC + '"/>');
        }
        col++;
        if (col === COLS) { col = 0; y += ROWH; }
      }
      if (col > 0) y += ROWH;
      y += 8;
    }

    if (tricky.length) {
      parts.push('<text x="' + PAD + '" y="' + (y + 20) + '" font-size="24" font-weight="700"'
        + ' fill="' + PINK + '"' + FONT + '>' + xmlEsc('Tricky words — read by sight') + '</text>');
      y += 38;
      const TW = 172, TH = 64;
      const perRow = Math.max(1, Math.floor((W - PAD * 2 + G) / (TW + G)));
      let col = 0;
      for (const t of tricky) {
        const x = PAD + col * (TW + G);
        parts.push('<rect x="' + x + '" y="' + y + '" width="' + TW + '" height="' + TH + '" rx="14"'
          + ' fill="#fce7f3" stroke="' + PINK + '" stroke-width="2.5"/>');
        parts.push('<text x="' + (x + TW / 2) + '" y="' + (y + TH / 2 + 9) + '" font-size="26"'
          + ' font-weight="700" text-anchor="middle" fill="' + INK + '"' + FONT + '>' + xmlEsc(t) + '</text>');
        col++;
        if (col === perRow) { col = 0; y += TH + G; }
      }
      if (col > 0) y += TH + G;
    }

    const H = y + PAD - G;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">'
      + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>'
      + parts.join('') + '</svg>';
  }

  // Modelled writing moved to modelwrite.js at v2 (2026-07-26): the paper
  // slice roughly tripled it and this file was already 254KB.

  // ------------------------------------------------------- word class sorter
  // §6.3: word cards sorted into labelled class columns. Column sets follow the
  // NC appendix-2 terminology windows: Y2 noun/verb/adjective/adverb, Y3 adds
  // preposition & conjunction, Y4 up runs all eight. Deliberate boundary from
  // the design doc: word class ≠ thematic role — no subject/object columns
  // here, ever; roles belong to the sentence builder's Colourful Semantics.
  const WS_CLASSES = [
    ['noun', 'Noun'], ['verb', 'Verb'], ['adjective', 'Adjective'], ['adverb', 'Adverb'],
    ['preposition', 'Preposition'], ['conjunction', 'Conjunction'],
    ['pronoun', 'Pronoun'], ['determiner', 'Determiner'],
  ];
  const WS_LABEL = Object.fromEntries(WS_CLASSES);
  const WS_ABBR = {
    noun: 'n', verb: 'v', adjective: 'adj', adverb: 'adv',
    preposition: 'prep', conjunction: 'conj', pronoun: 'pron', determiner: 'det',
  };
  // import tokens: full names and chip abbreviations, plus the two aliases
  // still on school walls — "connective" (older NC wording) and "article"
  const WS_TOKEN = (() => {
    const m = {};
    for (const [id] of WS_CLASSES) m[id] = id;
    for (const [id, ab] of Object.entries(WS_ABBR)) m[ab] = id;
    m.connective = 'conjunction';
    m.article = 'determiner';
    return m;
  })();
  const WS_WINDOWS = { 2: 4, 3: 6, 4: 8 }; // window id → how many classes are in play
  const wsYearWin = (yg) => (yg === '3' ? '3' : yg && +yg >= 4 ? '4' : '2'); // R/1 sort with the Y2 set
  const wsWin = (p, yg) => (p.year && WS_WINDOWS[p.year] ? p.year : wsYearWin(yg));

  // ------------------------------------------------------- sentence builder
  // docs/sentence-builder-design.md §7. Combining and expanding are the spine
  // — the EEF's two named sentence-construction techniques — and NC grammar
  // terminology is a filter and a label, never the organising unit: the one
  // RCT of exactly this modality (whole-class IWB grammar sequenced by NC Y2
  // terms) returned a null on writing (Wyse 2026, d=0.03). The widget is the
  // front half of a lesson; the Over-to-you stage exists to end its part and
  // put the children on paper.
  const SB_TRACK_CAP = 24;
  const SB_TRAY_CAP = 30;
  const SB_ALT_CAP = 4;   // alternatives to compare — four is a wall's worth
  const SB_CARD_MAX = 28;
  const SB_SRC_MAX = 120;
  const SB_MODES = ['combine', 'expand', 'build', 'roles', 'fixit'];
  const SB_YEARS = ['R', '1', '2', '3', '4', '5', '6'];
  const sbYearNum = (yg) => (yg === 'R' ? 0 : +yg || 0);
  // joining words and punctuation arrive cumulatively with the year — the
  // year FILTERS what is offered; it is never a ladder shown to the class
  const SB_JOINS = [
    ['R', ['and']],
    ['2', ['but', 'or', 'so', 'because', 'when', 'if', 'that']],
    ['3', ['after', 'before', 'while', 'although', 'as', 'until']],
    ['4', ['even though', 'since']],
    ['5', ['who', 'which', 'where', 'whose']],
  ];
  const SB_PUNCTS = [
    ['R', ['.', '!', '?', ',']],
    ['2', ['’']],
    ['3', ['“', '”']],
    ['5', ['(', ')', '—']],
    ['6', [':', ';']],
  ];
  const sbCumulative = (table, yg) => {
    const n = sbYearNum(yg);
    const out = [];
    for (const [min, items] of table) if (sbYearNum(min) <= n) out.push(...items);
    return out;
  };
  const SB_ALL_JOINS = new Set(sbCumulative(SB_JOINS, '6'));
  // expand prompts: the question words ARE the interface (the design's
  // low-metalanguage floor); the grammar name is an overlay, off by default
  const SB_PROMPTS = [
    ['1', 'What like?', 'adjective — expanded noun phrase'],
    ['2', 'Where?', 'adverbial of place'],
    ['2', 'When?', 'adverbial of time'],
    ['3', 'How?', 'adverbial of manner'],
  ];
  // role slots, grown by year: Reception starts with Who + Doing what
  const SB_ROLES = [
    ['who', 'Who?', 'R'], ['doing', 'Doing what?', 'R'], ['what', 'What?', '1'],
    ['where', 'Where?', '2'], ['when', 'When?', '3'], ['like', 'What like?', '4'],
  ];
  const SB_ROLE_TERM = {
    who: 'subject', doing: 'verb', what: 'object',
    where: 'adverbial · place', when: 'adverbial · time', like: 'adjective',
  };
  // Two palettes. The hues carry no evidential weight — only their
  // consistency does (PenCRU 2018) — so the palette is a school choice held
  // per widget. 'sage' is widely-separated saturated hues that survive a
  // badly calibrated projector; 'cs' is the traditional Colourful Semantics
  // set for schools trained on it (its brown and grey are the projector-weak
  // ones, and its yellow/blue collide with Shape Coding's meanings — hence
  // presets, never one hard-coded mapping).
  const SB_PALETTES = {
    sage: { who: '#1d4ed8', doing: '#ea580c', what: '#047857', where: '#9333ea', when: '#be123c', like: '#0e7490' },
    cs: { who: '#ea580c', doing: '#ca8a04', what: '#16a34a', where: '#2563eb', when: '#92400e', like: '#6b7280' },
  };
  // the five modes ARE the scheme of learning, so they stay on the surface
  // with plain-word subtitles (V0.1 decision 9) — folding them behind a
  // chip was tried in the mock and rejected: hiding them hides the lesson
  const SB_MODE_PILLS = [
    ['combine', 'Combine', 'two into one', 'Combine — the class merges two short sentences into one better one'],
    ['expand', 'Expand', 'grow it', 'Expand — grow a plain sentence: where, when, what like'],
    ['build', 'Build', 'free build', 'Build — a free sentence line from cards and tiles'],
    ['roles', 'Roles', 'question slots', 'Roles — coloured question slots the sentence reads along'],
    ['fixit', 'Fix it', 'mend it', 'Fix it — mend a broken sentence, right one first'],
  ];
  // empty-slot scaffolds: example words a child can lean on, per question —
  // ghost grey, gone the moment a real card lands. Teacher-editable in ⚙
  // (topic words, not ours); these are only the stock fallback.
  const SB_ROLE_EG = {
    who: 'the dog · a girl · my nan',
    doing: 'ran · was hiding · jumped',
    what: 'the ball · a sandwich · the door',
    where: 'in the park · at school · under the bed',
    when: 'yesterday · at night · after tea',
    like: 'quickly · happily · with a smile',
  };
  // sentence banks (V0.1 decision 14): neutral topic sets, year-banded, two
  // taps to load into the face being taught. Fixes break STRUCTURE — order,
  // capitals, punctuation — never spelling: a misspelling on the big screen
  // can stick as looking right, the one harm the research documents.
  const SB_BANKS = [
    { yrs: ['R', '1'], topic: 'Pets', pairs: [['The dog ran fast.', 'It reached the gate.'], ['The cat sat still.', 'It watched the birds.']], bases: ['The dog dug a hole', 'The cat sat on the mat'], fixes: [['The dog barked all night.', 'the dog barked all night'], ['The cat drank her milk.', 'the cat drank her milk']] },
    { yrs: ['R', '1'], topic: 'Under the sea', pairs: [['The crab hid.', 'The waves rolled in.'], ['The fish swam away.', 'A shark came near.']], bases: ['The fish swam in the sea', 'A crab hid under a rock'], fixes: [['The whale is big.', 'big is the whale.']] },
    { yrs: ['R', '1'], topic: 'In the playground', pairs: [['Sam ran to the slide.', 'He went down fast.'], ['The bell rang.', 'We lined up.']], bases: ['We played on the swings', 'The ball rolled away'], fixes: [['We lined up at the door.', 'we lined up at the door']] },
    { yrs: ['2', '3'], topic: 'The seaside', pairs: [['The tide came in.', 'The nets were full.'], ['The lighthouse blinked.', 'The ships kept away.']], bases: ['The waves crashed on the rocks', 'We built a sandcastle on the beach'], fixes: [['The gulls cried over the harbour.', 'the gulls cried over the harbour']] },
    { yrs: ['2', '3'], topic: 'Romans', pairs: [['The soldiers marched.', 'They were tired.'], ['Rome grew quickly.', 'Its army was strong.']], bases: ['The soldiers built a straight road', 'The villa had a mosaic floor'], fixes: [['The villa had a mosaic floor.', 'the villa had a mosaic floor'], ['The soldiers marched to the fort.', 'The soldiers marched to the fort']] },
    { yrs: ['2', '3'], topic: 'Rainforest', pairs: [['The canopy is dark.', 'Little light gets through.'], ['The frogs are tiny.', 'They are very loud.']], bases: ['Monkeys swing through the trees', 'The river winds through the forest'], fixes: [['The parrots screech at dawn.', 'the parrots screech at dawn']] },
    { yrs: ['4', '5'], topic: 'Ancient Egypt', pairs: [['The Nile flooded every year.', 'The farmers were glad.'], ['The pyramid took years to build.', 'Thousands worked on it.']], bases: ['The scribe wrote on papyrus', 'The tomb lay hidden for centuries'], fixes: [['The pharaoh’s tomb was sealed.', 'the pharaohs tomb was sealed']] },
    { yrs: ['4', '5'], topic: 'Space', pairs: [['The rocket rose slowly.', 'The ground shook.'], ['The moon has no air.', 'Astronauts wear suits.']], bases: ['The astronaut floated in silence', 'The stars burned far away'], fixes: [['The launch was delayed until dawn.', 'the launch was delayed until dawn']] },
    { yrs: ['4', '5'], topic: 'Vikings', pairs: [['The longship cut through the waves.', 'The wind filled its sail.'], ['The traders sailed far.', 'They brought back silver.']], bases: ['The Vikings crossed the cold sea', 'The village stood by the fjord'], fixes: [['The raid began at first light.', 'The raid began at first light']] },
    { yrs: ['6', '6'], topic: 'World War Two', pairs: [['The sirens wailed.', 'Everyone hurried to the shelter.'], ['Rationing was strict.', 'People grew their own food.']], bases: ['The evacuees waited on the platform', 'The searchlights swept the sky'], fixes: [['The blackout began at dusk.', 'the blackout began at dusk']] },
    { yrs: ['6', '6'], topic: 'Mountains', pairs: [['The climbers set off at dawn.', 'The summit was still far above.'], ['The air grew thin.', 'Every step became harder.']], bases: ['The glacier moved slower than a snail', 'The ridge fell away on both sides'], fixes: [['Although the path was steep, they kept going.', 'although the path was steep they kept going']] },
    { yrs: ['6', '6'], topic: 'The river', pairs: [['The river begins as a trickle.', 'It ends as a flood.'], ['The current looked calm.', 'It was dangerously strong.']], bases: ['The heron stood perfectly still', 'The bridge groaned under the weight'], fixes: [['After the rain, the river burst its banks.', 'after the rain the river burst its banks']] },
  ];
  // typed text is data, never markup — same rule as the rest of the file.
  // Controls, zero-widths and bidi overrides go too: a U+202E in a hand-edited
  // deck would visually reverse the class screen, and a zero-width makes two
  // identical-looking cards behave differently.
  const sbClean = (s) => String(s || '')
    .replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
  const sbNewCard = (t, k) => ({ id: D.uid(), t: sbClean(t).slice(0, SB_CARD_MAX), k: k === 'p' ? 'p' : 'w', cap: false, slot: null });
  const SB_TIGHT = new Set(['.', ',', '!', '?', ':', ';', '’', ')', '”', '…']);
  const SB_OPEN = new Set(['(', '“', '‘']);
  // deal a typed sentence into cards: leading/trailing punctuation peels into
  // its own tiles so the class can move it; in-word apostrophes stay put
  function sbDeal(sentence) {
    const out = [];
    for (const raw of sbClean(sentence).split(' ')) {
      if (!raw) continue;
      let word = raw;
      const lead = [];
      while (word && SB_OPEN.has(word[0])) { lead.push(word[0]); word = word.slice(1); }
      const tail = [];
      while (word && SB_TIGHT.has(word[word.length - 1])) { tail.unshift(word[word.length - 1]); word = word.slice(0, -1); }
      for (const c of lead) out.push(sbNewCard(c, 'p'));
      if (word) out.push(sbNewCard(word, 'w'));
      for (const c of tail) out.push(sbNewCard(c, 'p'));
    }
    return out.slice(0, SB_TRACK_CAP);
  }
  // cap FLIPS the first letter's case rather than only capitalising: a
  // dealt "They" must be able to go lowercase when it lands mid-sentence
  // in a combine — the aA toggle is the teaching moment either way
  const sbShow = (c) => {
    if (!c.cap || c.k !== 'w' || !c.t) return c.t;
    const f = c.t.charAt(0);
    return (f === f.toUpperCase() ? f.toLowerCase() : f.toUpperCase()) + c.t.slice(1);
  };
  // the sentence as it would be written: words spaced, closers tight against
  // the word before them, openers tight against the word after
  function sbText(cards) {
    let s = '';
    let openHold = false;
    for (const c of cards) {
      const t = sbShow(c);
      if (!t) continue;
      if (c.k === 'p' && SB_TIGHT.has(t)) { s += t; openHold = false; continue; }
      s += (s && !openHold ? ' ' : '') + t;
      openHold = c.k === 'p' && SB_OPEN.has(t);
    }
    return s;
  }

  // Our own bank. Single-class words are chosen so the class a primary child
  // meets first is the only defensible answer at this level; the multi-class
  // words at the end are the traps — dealt sparingly, ringed gold at check
  // time as the discussion the widget exists to start.
  const WS_BANK = [
    ['dog', ['noun']], ['castle', ['noun']], ['river', ['noun']], ['teacher', ['noun']],
    ['biscuit', ['noun']], ['thunder', ['noun']], ['pocket', ['noun']], ['garden', ['noun']],
    ['decide', ['verb']], ['vanish', ['verb']], ['arrive', ['verb']], ['listen', ['verb']],
    ['build', ['verb']], ['chase', ['verb']], ['invent', ['verb']], ['wriggle', ['verb']],
    ['enormous', ['adjective']], ['ancient', ['adjective']], ['fierce', ['adjective']], ['gentle', ['adjective']],
    ['curious', ['adjective']], ['magnificent', ['adjective']], ['slippery', ['adjective']], ['golden', ['adjective']],
    ['quickly', ['adverb']], ['softly', ['adverb']], ['suddenly', ['adverb']], ['carefully', ['adverb']],
    ['often', ['adverb']], ['always', ['adverb']], ['soon', ['adverb']], ['greedily', ['adverb']],
    ['under', ['preposition']], ['behind', ['preposition']], ['during', ['preposition']], ['across', ['preposition']],
    ['between', ['preposition']], ['against', ['preposition']], ['beneath', ['preposition']], ['towards', ['preposition']],
    ['and', ['conjunction']], ['but', ['conjunction']], ['because', ['conjunction']], ['although', ['conjunction']],
    ['or', ['conjunction']], ['unless', ['conjunction']], ['while', ['conjunction']], ['whenever', ['conjunction']],
    ['she', ['pronoun']], ['they', ['pronoun']], ['we', ['pronoun']], ['him', ['pronoun']],
    ['it', ['pronoun']], ['ours', ['pronoun']], ['myself', ['pronoun']], ['everyone', ['pronoun']],
    ['the', ['determiner']], ['a', ['determiner']], ['an', ['determiner']], ['every', ['determiner']],
    ['each', ['determiner']], ['several', ['determiner']],
    // traps — words that change class by use
    ['light', ['noun', 'verb', 'adjective']], ['run', ['noun', 'verb']],
    ['fast', ['adjective', 'adverb']], ['back', ['noun', 'verb', 'adjective', 'adverb']],
    ['watch', ['noun', 'verb']], ['play', ['noun', 'verb']], ['hard', ['adjective', 'adverb']],
    ['her', ['pronoun', 'determiner']], ['that', ['determiner', 'pronoun', 'conjunction']],
    ['round', ['noun', 'verb', 'adjective', 'adverb', 'preposition']],
  ];

  // the columns on screen: the year window, narrowed by the teacher's picks —
  // an empty pick falls back to the whole window so a widget can never be columnless
  function wsActive(p, yg) {
    const ids = WS_CLASSES.slice(0, WS_WINDOWS[wsWin(p, yg)]).map(([id]) => id);
    const picked = Array.isArray(p.only) ? ids.filter((id) => p.only.includes(id)) : ids;
    return picked.length ? picked : ids;
  }

  function wsShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // a trap only counts as one when 2+ of its classes have columns on screen —
  // 'her' is no trap in a Y2 window that shows neither pronoun nor determiner
  const wsTrap = (ans, act) => ans.filter((c) => act.includes(c)).length >= 2;

  function wsDeal(act, trapsOnly) {
    const traps = WS_BANK.filter(([, a]) => wsTrap(a, act));
    let picked;
    if (trapsOnly) {
      picked = wsShuffle(traps.slice()).slice(0, 8);
    } else {
      const per = act.length <= 4 ? 3 : 2; // ~12–18 cards whatever the window
      picked = [];
      for (const cl of act) {
        picked.push(...wsShuffle(WS_BANK.filter(([, a]) => a.length === 1 && a[0] === cl)).slice(0, per));
      }
      picked.push(...wsShuffle(traps.slice()).slice(0, 2));
    }
    return wsShuffle(picked.map(([wd, a]) => ({ id: D.uid(), w: wd, ans: a.slice(), col: null })));
  }

  // fresh deal for the current columns; the teacher's own words survive it,
  // and the deal never doubles a word they already have (bank "round" must
  // not land beside an imported "round")
  function wsRedeal(p, yg, trapsOnly) {
    const kept = (Array.isArray(p.cards) ? p.cards : []).filter((c) => c.custom);
    for (const c of kept) { c.col = null; delete c.m; }
    const have = new Set(kept.map((c) => c.w.toLowerCase()));
    p.cards = [...wsDeal(wsActive(p, yg), trapsOnly).filter((c) => !have.has(c.w.toLowerCase())), ...kept];
    p.dealt = true;
  }

  // school word lists arrive as pasted text or a CSV. Two shapes parse:
  // a grid with a header row (word, Noun, Verb, …) where each class has its
  // own column — a cell counts as a tick whether it holds the class name or
  // just a mark (x, yes, ✓) — and free-form lines: the word, then its classes
  // after a comma/tab/colon (full names, chip abbreviations, "connective"/
  // "article" aliases; plurals tolerated). A plain word list — most school
  // lists carry no classes — imports as open words with no ticks. Case is
  // kept: Christmas, Mr and Mrs stay capitalised.
  function wsParseList(text) {
    const cards = [];
    const seen = new Set();
    let skipped = 0;
    let colMap = null; // from a header row: cell index → the class that column carries
    const classOf = (tok) => {
      let t = tok.toLowerCase().replace(/[^a-z]/g, '');
      if (!t) return null;
      if (!WS_TOKEN[t] && t.endsWith('s')) t = t.slice(0, -1);
      return WS_TOKEN[t] || null;
    };
    for (let line of String(text || '').split(/\r\n|\r|\n/)) {
      line = line.replace(/[‘’]/g, "'").replace(/[–—]/g, '-').trim();
      if (!line) continue;
      // single-character splits: empty cells survive, keeping grid columns aligned
      const cells = line.split(/[,\t;:]/);
      // wrapping quotes go; interior apostrophes stay — don't and o'clock are real list words
      const w = cells.shift().replace(/^["'\s]+|["'\s]+$/g, '').replace(/[^A-Za-z' -]/g, '')
        .replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!w || !/[A-Za-z]/.test(w)) { skipped++; continue; }
      const key = w.toLowerCase();
      if (key === 'word' || key === 'words') {
        colMap = {};
        cells.forEach((cell, i) => { const id = classOf(cell); if (id) colMap[i] = id; });
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const ans = [];
      cells.forEach((cell, i) => {
        const toks = cell.split(/[\s/|]+/).filter(Boolean);
        if (!toks.length) return;
        let named = false;
        for (const tok of toks) {
          const id = classOf(tok);
          if (id) { named = true; if (!ans.includes(id)) ans.push(id); }
        }
        // a mark that names no class ticks the class of the column it sits in
        if (!named && colMap && colMap[i] && !ans.includes(colMap[i])) ans.push(colMap[i]);
      });
      cards.push({ w, ans });
      if (cards.length >= 60) break;
    }
    return { cards, skipped };
  }

  // the download doubles as the template: current round in import format,
  // or three worked examples when the round is empty.
  // The grid mirrors the sorter itself — a column per class, headed by the
  // class NAME, with a word's classes sitting in their own columns. Headers
  // are the columns on screen plus any class a word in the round carries, so
  // nothing is ever dropped. A header the app "didn't write" makes a teacher
  // stop and email rather than edit (Glenn, 2026-07-23) — every column they
  // might fill must arrive pre-labelled.
  function wsListCsv(cards, act) {
    const rows = cards && cards.length ? cards : [
      { w: 'light', ans: ['noun', 'verb', 'adjective'] },
      { w: 'again', ans: ['adverb'] },
      { w: 'Christmas', ans: ['noun'] },
    ];
    const used = new Set();
    for (const c of rows) for (const a of (c.ans || [])) used.add(a);
    let ids = WS_CLASSES.map(([id]) => id)
      .filter((id) => (Array.isArray(act) && act.includes(id)) || used.has(id));
    if (!ids.length) ids = WS_CLASSES.slice(0, 4).map(([id]) => id);
    const head = ['word', ...ids.map((id) => WS_LABEL[id])];
    const line = (c) => [c.w, ...ids.map((id) => ((c.ans || []).includes(id) ? WS_LABEL[id] : ''))].join(',');
    return head.join(',') + '\n' + rows.map(line).join('\n') + '\n';
  }

  // ------------------------------------------------------------- word bank
  // §6.2 and docs/word-bank-design.md: vocabulary harvested mid-discussion
  // lands on a corkboard, groups into tier lanes, and opens big for the
  // deep-teach routine. The humble one, used every lesson.
  const WB_TIER_DEFAULTS = ['Everyday words', 'Power words', 'Subject words'];
  const WB_CAP = 60;
  const WB_TEXT_MAX = 140;
  const WB_IMG_MAX = 64 * 1024; // encoded data-URL characters, not pixels
  const WB_IMG_FLOOR = 14 * 1024; // small, but still a recognisable picture
  const WB_IMG_SOFT = 20;
  const WB_SET_BUDGET = 1.5 * 1024 * 1024; // every picture in one imported set
  const WB_FILE_MAX = 12 * 1024 * 1024; // refuse to even parse beyond this
  const WB_COLS = 5, WB_ROWS = 5;

  // a word has to contain a letter: the charset keeps hyphens, apostrophes and
  // spaces (well-known, o'clock, ice cream), which on their own would turn the
  // rule lines and separators of a pasted school handout into cards
  const wbWord = (s) => {
    const t = String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[^A-Za-z' -]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, 24);
    return /[A-Za-z]/.test(t) ? t : '';
  };
  const wbLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, WB_TEXT_MAX);
  // no lane is called "a<b" — dropping angle brackets keeps a downloaded set
  // from putting markup-looking text in a heading the class reads
  const wbLabel = (s, i) => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || WB_TIER_DEFAULTS[i];

  const wbCard = (word) => ({
    id: D.uid(), w: word, x: 0.5, y: 0.5, tier: null, pin: false, pic: true,
    img: null, def: '', eg: '', act: '', home: '', syl: 0,
  });

  // How wide a card will be, as a fraction of the board. Card font scales with
  // board width (boardFont below), so the fraction holds at any size: measured
  // against the real thing, an 8-letter card is 0.143 of the board across.
  const wbHalfW = (word) => (0.46 * String(word || '').length + 1.4) / 68;
  // and a picture card is two and a half times the height of a plain one — a
  // set arrives full of them, and treating every card as text-height sat them
  // straight on top of each other
  const wbHalfH = (hasImg) => (hasImg ? 0.115 : 0.052);

  // where a new card lands. The board is teacher-arranged and nothing already
  // placed may move, so capture walks a virtual grid bottom-up and takes the
  // first cell where this word's card clears every card already down. The test
  // is real box separation, not centre distance: "extraordinary" is twice the
  // width of "sleet" and a cell-pitch rule would sit them on top of each other.
  function wbFreeSlot(words, word, hasImg) {
    const dx = 1 / (WB_COLS + 1), dy = 0.16;
    const cells = [];
    for (let r = 0; r < WB_ROWS; r++) {
      for (let c = 0; c < WB_COLS; c++) {
        // the bin sits in the bottom-right corner at every size — a card parked
        // under it reads as already thrown away
        if (r === 0 && c === WB_COLS - 1) continue;
        cells.push({ x: dx * (c + 1), y: 0.86 - r * dy });
      }
    }
    if (!words.length) return cells[0];
    const half = wbHalfW(word), halfH = wbHalfH(hasImg);
    // gap left over after separating the two boxes; negative means they overlap
    const separation = (cell) => Math.min(...words.map((o) => Math.max(
      Math.abs(o.x - cell.x) - (half + wbHalfW(o.w) + 0.012),
      Math.abs(o.y - cell.y) - (halfH + wbHalfH(!!o.img) + 0.01),
    )));
    for (const cell of cells) if (separation(cell) >= 0) return cell;
    // Every cell is crowded — 60 cards genuinely do not fit a board with room
    // to spare. Tile them instead: the grid repeats, nudged diagonally each
    // pass, so every card still gets its own coordinate. Two cards on the exact
    // same point is the outcome to avoid at all costs — the one underneath is a
    // word the class cannot see, tap or drag back out.
    const pass = Math.floor(words.length / cells.length) + 1;
    const cell = cells[words.length % cells.length];
    return {
      x: D.clamp(cell.x + pass * 0.035, 0.03, 0.97),
      y: D.clamp(cell.y - pass * 0.035, 0.06, 0.94),
    };
  }

  // the first-sound chip: the longest grapheme in the phonics pack the word
  // starts with, so chip shows ch and shark shows sh. Split digraphs are
  // medial by definition (a_e) — they can never start a word. Derived on
  // read, never stored, so editing a word re-derives it.
  let wbGraphemeCache = null;
  function wbGraphemes() {
    if (!wbGraphemeCache) {
      const all = new Set();
      for (const ph of phonicsPack().phases) {
        for (const set of ph.sets) for (const g of set) if (!isSplit(g)) all.add(g);
      }
      wbGraphemeCache = [...all].sort((a, b) => b.length - a.length);
    }
    return wbGraphemeCache;
  }
  function wbFirstSound(word) {
    const s = String(word || '').toLowerCase();
    if (!s) return '';
    for (const g of wbGraphemes()) if (s.startsWith(g)) return g;
    return s[0];
  }

  // pickImage caps the pixel width; the bank caps the ENCODED size too, so one
  // detailed photo can't quietly eat the storage budget a whole deck shares.
  // Re-encode down a ladder, then refuse rather than store something
  // oversized — app save() already shouts when storage is full, and this is
  // what keeps the bank from routinely putting it there.
  function wbFitImage(dataUrl, max, cb) {
    if (typeof dataUrl !== 'string' || !/^data:image\//.test(dataUrl)) { cb(null); return; }
    if (dataUrl.length <= max) { cb(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      for (const [wMax, q] of [[420, 0.72], [340, 0.64], [260, 0.58], [190, 0.5], [140, 0.45], [100, 0.4]]) {
        const src = img.width || wMax;
        const scale = Math.min(1, wMax / src);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(src * scale));
        cv.height = Math.max(1, Math.round((img.height || wMax) * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const out = cv.toDataURL('image/jpeg', q);
        if (out.length <= max) { cb(out); return; }
      }
      cb(null);
    };
    img.onerror = () => cb(null);
    img.src = dataUrl;
  }

  // A set built on someone else's machine must not be able to fill this one.
  // Every picture in an imported set is re-fitted against a budget shared
  // across the set, so a 60-photo download lands as 60 smaller photos rather
  // than as a deck that can no longer save.
  function wbFitSet(cards, done) {
    const withImg = cards.filter((c) => c.img);
    if (!withImg.length) { done(cards, 0); return; }
    const per = Math.max(WB_IMG_FLOOR, Math.min(WB_IMG_MAX, Math.floor(WB_SET_BUDGET / withImg.length)));
    let left = withImg.length, dropped = 0;
    for (const c of withImg) {
      wbFitImage(c.img, per, (out) => {
        if (!out) dropped++;
        c.img = out;
        if (--left === 0) done(cards, dropped);
      });
    }
  }

  // mount-time hardening, the phonemetiles/wordsort pattern: everything that
  // reaches the board has been clamped, anything unrecoverable is dropped, and
  // duplicate ids are healed (two cards sharing one would drag as a pair).
  function wbSanitize(p) {
    p.tiers = WB_TIER_DEFAULTS.map((_, i) => wbLabel(Array.isArray(p.tiers) ? p.tiers[i] : '', i));
    p.view = p.view === 'lanes' ? 'lanes' : 'board';
    p.impReplace = p.impReplace !== false;
    const seen = new Set();
    const ids = new Set();
    const out = [];
    for (const c of Array.isArray(p.words) ? p.words : []) {
      if (!c || typeof c !== 'object' || out.length >= WB_CAP) continue;
      const word = wbWord(c.w);
      if (!word) continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let id = typeof c.id === 'string' && c.id ? c.id : D.uid();
      if (ids.has(id)) id = D.uid();
      ids.add(id);
      out.push({
        id, w: word,
        x: D.clamp(+c.x || 0.5, 0.02, 0.98),
        y: D.clamp(+c.y || 0.5, 0.02, 0.98),
        tier: c.tier === 1 || c.tier === 2 || c.tier === 3 ? c.tier : null,
        pin: !!c.pin,
        pic: c.pic !== false,   // whether THIS word is showing its picture
        // bounded like every other field, not just format-checked: a restored
        // backup or an imported deck can carry an image the picker never sized,
        // and one 4MB card would exhaust the storage the whole app shares.
        // Dropping the picture keeps the word and its teaching notes.
        img: typeof c.img === 'string' && c.img.length <= WB_IMG_MAX && /^data:image\//.test(c.img) ? c.img : null,
        def: wbLine(c.def), eg: wbLine(c.eg), act: wbLine(c.act), home: wbLine(c.home),
        syl: Math.max(0, Math.min(6, Math.floor(+c.syl || 0))),
      });
    }
    p.words = out;
  }

  // ---- word bank sets: the whole bank in one file ----------------------
  // Filling four lines for twenty words by hand is an evening's work and no
  // teacher does it twice, so a prepared set has to arrive complete. Every
  // column is named, which also means a teacher can hand the blank template
  // to an AI and paste the filled sheet straight back (Glenn, 2026-07-23).

  // A real CSV reader, not a split(','): a meaning line contains commas
  // ("to shake because you are cold, or frightened") and the sorter's plain
  // split would shred it. Quoted fields, embedded commas and newlines, ""
  // escapes. Tabs count as separators too — that is what a spreadsheet puts
  // on the clipboard when a teacher copies a block of cells.
  function wbCsvRows(text) {
    // a sheet saved by Excel or Sheets comes back with the byte order mark we
    // wrote; it must not become part of the first header cell
    const s = String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch !== '"') cell += ch;
        else if (s[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // header names we answer to — a teacher writing their own sheet, or an AI
  // filling one, should not have to guess our exact wording
  const WB_HEADS = [
    ['w', ['word', 'words', 'vocabulary', 'vocab']],
    ['tier', ['tier', 'lane', 'tierlane', 'group']],
    ['def', ['meaning', 'definition', 'whatitmeans', 'def', 'definitions']],
    ['eg', ['sentence', 'inasentence', 'example', 'examplesentence', 'insentence']],
    ['act', ['action', 'showme', 'gesture', 'actions']],
    ['home', ['homelanguage', 'inourhomelanguage', 'home', 'eal', 'translation', 'firstlanguage']],
    ['syl', ['beats', 'syllables', 'syls', 'claps']],
    // the escape hatch when a filename cannot be made to match — and, on the
    // way out, a checklist telling you what to name each picture
    ['pic', ['picture', 'image', 'img', 'photo', 'pictures', 'images']],
  ];
  const wbHeadField = (cell) => {
    const t = String(cell || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!t) return null;
    for (const [field, names] of WB_HEADS) if (names.includes(t)) return field;
    return null;
  };

  // a tier cell may say 1/2/3, the lane's own name, or the standard name —
  // a school that renamed its lanes Anchor/Goldilocks/Step-on writes those
  const wbTierOf = (cell, tiers) => {
    const t = String(cell || '').trim().toLowerCase();
    if (!t) return null;
    if (t === '1' || t === '2' || t === '3') return +t;
    for (let i = 0; i < 3; i++) {
      for (const name of [tiers && tiers[i], WB_TIER_DEFAULTS[i]]) {
        const n = String(name || '').toLowerCase();
        if (n && (t === n || t === n.split(' ')[0])) return i + 1;
      }
    }
    return null;
  };

  // ---- matching pictures to words by filename ----------------------------
  // The tools are not tidy and the person is not at fault for that. Real
  // output from an image model is `01-look.png` … `20-chip.png` — numbered,
  // because that keeps the files in the sheet's order in Finder. An exact
  // `look.png` convention would have matched none of twenty. So both sides
  // are normalised until they meet.
  //
  // Stripping leading digits is safe rather than a guess: the word charset
  // has never allowed digits, so a number at the front of a filename
  // definitionally is not part of the word.
  const wbBase = (path) => String(path || '').split('/').pop();
  const wbNorm = (name) => wbBase(name)
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')     // extension
    .replace(/^[0-9]+[\s._-]*/, '')          // leading index: 01- 02_ 3.
    .replace(/[_-]+/g, ' ')                  // separators read as spaces
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // a name that is nothing but a number is a row of the sheet, 1-based
  const wbIndexOf = (name) => {
    const bare = wbBase(name).replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
    return /^[0-9]{1,3}$/.test(bare) ? parseInt(bare, 10) : null;
  };

  /* cards: parsed rows, in sheet order. pics: Map of name -> Uint8Array.
     Resolves every card's picture and reports both directions, because at
     twenty words the person needs a checklist rather than a mystery. */
  function wbAttachPictures(cards, pics) {
    const claimed = new Set();
    const take = (key) => {
      const bytes = pics.get(key);
      const mime = wbImageMime(bytes);
      if (!mime) return false;
      claimed.add(key);
      return wbBytesToData(bytes, mime);
    };
    // an explicit picture column wins over everything
    for (const c of cards) {
      if (!c.img || /^data:/.test(c.img)) continue;
      const exact = [...pics.keys()].find((k) => k === c.img || wbBase(k) === wbBase(c.img));
      const got = exact ? take(exact) : false;
      c.img = got || null;
    }
    // then by name
    const byNorm = new Map();
    for (const key of pics.keys()) {
      if (claimed.has(key)) continue;
      const n = wbNorm(key);
      if (n && !byNorm.has(n)) byNorm.set(n, key);
    }
    for (const c of cards) {
      if (c.img) continue;
      const key = byNorm.get(wbNorm(c.w));
      if (key && !claimed.has(key)) c.img = take(key) || null;
    }
    // last resort: a file called nothing but a number is that row of the sheet
    for (const key of pics.keys()) {
      if (claimed.has(key)) continue;
      const idx = wbIndexOf(key);
      const c = idx ? cards[idx - 1] : null;
      if (c && !c.img) c.img = take(key) || null;
    }
    return {
      missing: cards.filter((c) => !c.img).map((c) => c.w),
      spare: [...pics.keys()].filter((k) => !claimed.has(k)).map(wbBase),
    };
  }

  // ---- the contact-sheet slicer ------------------------------------------
  // An image model will hold the line on "no text" across a whole sheet but
  // bakes the word into every tile the moment you ask for one on its own, so
  // the picture for a set arrives as one grid (Glenn, 2026-07-24). Rather than
  // make a person screenshot and rename twenty tiles, the widget cuts the
  // sheet itself. The hard part is that an AI grid is NOT even — cells drift a
  // few pixels — so the cut is found from the gutters, the near-uniform bands
  // of background between tiles, not from dividing by a count.

  function wbLoadImageFile(file, cb) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cb(img); };
    img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  // background is the sheet's paper colour — the median of its border pixels,
  // which are background on every contact sheet there is
  function wbSheetBg(d, w, h) {
    const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const edge = [];
    for (let x = 0; x < w; x += 2) { edge.push(at(x, 0)); edge.push(at(x, h - 1)); }
    for (let y = 0; y < h; y += 2) { edge.push(at(0, y)); edge.push(at(w - 1, y)); }
    const med = (k) => { const s = edge.map((c) => c[k]).sort((a, b) => a - b); return s[s.length >> 1] || 0; };
    return [med(0), med(1), med(2)];
  }

  // find the grid by projecting "is this background?" onto each axis: a
  // column that is almost all background is a vertical gutter, and the strips
  // of not-gutter between them are where the tiles actually sit — uneven
  // spacing included. Returns column and row bands as [start,end] fractions.
  function wbGridFromImage(img) {
    const maxD = 600;
    const scale = Math.min(1, maxD / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const bg = wbSheetBg(d, w, h);
    const TOL = 62;
    const isBg = (x, y) => {
      const i = (y * w + x) * 4;
      return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < TOL;
    };
    const colBg = new Float32Array(w), rowBg = new Float32Array(h);
    for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) if (isBg(x, y)) n++; colBg[x] = n / h; }
    for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (isBg(x, y)) n++; rowBg[y] = n / w; }
    // content bands: runs where the background fraction stays below the gutter
    // line, wider than a floor so a stray dark row is not called a tile
    const bands = (sig, len) => {
      const out = [];
      let start = -1;
      for (let i = 0; i < len; i++) {
        const gutter = sig[i] > 0.82;
        if (!gutter) { if (start < 0) start = i; }
        else if (start >= 0) { if (i - start >= len * 0.035) out.push([start / len, i / len]); start = -1; }
      }
      if (start >= 0 && len - start >= len * 0.035) out.push([start / len, 1]);
      return out;
    };
    return { cols: bands(colBg, w), rows: bands(rowBg, h), bg };
  }

  // crop one cell from the full-resolution image, then trim the uniform paper
  // margin back to the drawing itself so the thumbnail is the art, not a tile
  // adrift in background. A cell that trims to nothing (a blank square) is null.
  function wbCropTile(img, cell, bg) {
    const W = img.width, H = img.height;
    const sx = Math.max(0, Math.round(cell.x0 * W)), sy = Math.max(0, Math.round(cell.y0 * H));
    const sw = Math.min(W - sx, Math.round((cell.x1 - cell.x0) * W));
    const sh = Math.min(H - sy, Math.round((cell.y1 - cell.y0) * H));
    if (sw < 6 || sh < 6) return null;
    const cv = document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    const far = (x, y) => {
      const i = (y * sw + x) * 4;
      return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 74;
    };
    const rowHas = (y) => { for (let x = 0; x < sw; x++) if (far(x, y)) return true; return false; };
    const colHas = (x) => { for (let y = 0; y < sh; y++) if (far(x, y)) return true; return false; };
    let top = 0, bottom = sh - 1, left = 0, right = sw - 1;
    while (top < bottom && !rowHas(top)) top++;
    while (bottom > top && !rowHas(bottom)) bottom--;
    while (left < right && !colHas(left)) left++;
    while (right > left && !colHas(right)) right--;
    const tw = right - left + 1, th = bottom - top + 1;
    if (tw < 8 || th < 8) return null;
    const px = Math.round(tw * 0.06), py = Math.round(th * 0.06);
    const l = Math.max(0, left - px), t = Math.max(0, top - py);
    const r = Math.min(sw - 1, right + px), b = Math.min(sh - 1, bottom + py);
    const ow = r - l + 1, oh = b - t + 1;
    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    out.getContext('2d').drawImage(cv, l, t, ow, oh, 0, 0, ow, oh);
    return out.toDataURL('image/jpeg', 0.85);
  }

  const wbEvenBands = (n) => {
    const m = 0.006, out = [];
    for (let i = 0; i < n; i++) out.push([i / n + m, (i + 1) / n - m]);
    return out;
  };

  // The confirm screen. Detection is the default; the Across/Down steppers let
  // a person override it to an even N×M when a sheet defeats the gutters, so
  // the same panel is both the smart cut and the manual one.
  //
  // Mapping is POSITIONAL, not shift-on-skip: tile position i belongs to word
  // i, always. A blank or dud tile leaves that one word without a picture and
  // every other word stays put — a gap in the middle must not slide the whole
  // rest of the set onto the wrong pictures. Order is fixed instead by tap-to-
  // swap (tap one tile, tap another, they trade places — better than dragging
  // on a whiteboard), and a corner ✕ drops a picture a word should not get.
  // onDone gets [{wordIndex, img}] for the words that ended up with a picture.
  function wbOpenSlicer(file, words, onDone) {
    if (!words.length) { D.toast('Add your words first, then bring the picture sheet in to fill them'); return; }
    D.toast('Reading the picture sheet…');
    wbLoadImageFile(file, (img) => {
      if (!img) { D.toast('That image could not be opened'); return; }
      const det = wbGridFromImage(img);
      const bg = det.bg;
      const across = det.cols.length || 5;
      let colEdges = det.cols.length ? det.cols.slice() : wbEvenBands(across);
      let rowEdges = det.rows.length ? det.rows.slice() : wbEvenBands(Math.max(1, Math.ceil(words.length / across)));
      let crops = [];            // crops[i] = dataURL or null, by grid position
      const dropped = new Set(); // positions a person tapped ✕ on
      let picked = null;         // the position selected for a swap

      const grid = D.el('div', { class: 'wb-slice-grid' });
      const note = D.el('div', { class: 'wb-slice-note' });
      const acrossLab = D.el('b', {}, String(colEdges.length));
      const downLab = D.el('b', {}, String(rowEdges.length));

      const cells = () => {
        const out = [];
        for (const rw of rowEdges) for (const cl of colEdges) out.push({ x0: cl[0], x1: cl[1], y0: rw[0], y1: rw[1] });
        return out;
      };
      const recut = () => {
        crops = cells().map((c) => wbCropTile(img, c, bg));
        dropped.clear();
        picked = null;
        acrossLab.textContent = String(colEdges.length);
        downLab.textContent = String(rowEdges.length);
        render();
      };
      const on = (i) => !!crops[i] && !dropped.has(i);
      const tapTile = (i) => {
        if (picked === null) { picked = i; render(); return; } // pick up
        if (picked === i) { picked = null; render(); return; }  // put down
        const t = crops[picked]; crops[picked] = crops[i]; crops[i] = t; // swap
        picked = null;
        render();
      };
      function render() {
        grid.innerHTML = '';
        crops.forEach((c, i) => {
          const word = i < words.length ? words[i] : null;
          const off = !on(i);
          const tile = D.el('div', {
            class: 'wb-slice-tile' + (off ? ' skip' : '') + (picked === i ? ' picked' : ''),
            title: picked === null ? 'Tap to pick up, then tap another to swap them' : 'Tap to drop it here',
            onclick: () => tapTile(i),
          });
          if (c) {
            tile.append(D.el('img', { src: c, alt: '', draggable: 'false' }));
            // the corner ✕ drops the picture from this word without swapping;
            // stopPropagation so it does not also count as a pick-up tap
            tile.append(D.el('button', {
              class: 'wb-slice-x', title: dropped.has(i) ? 'Give this word its picture back' : 'This word should not get this picture',
              onclick: (e) => { e.stopPropagation(); dropped.has(i) ? dropped.delete(i) : dropped.add(i); render(); },
            }, dropped.has(i) ? '↺' : '×'));
          } else {
            tile.append(D.el('div', { class: 'wb-slice-blank' }, '—'));
          }
          tile.append(D.el('span', { class: 'wb-slice-cap' + (word ? '' : ' spare') },
            word ? word.w : 'spare — no word'));
          grid.append(tile);
        });
        let assigned = 0;
        for (let i = 0; i < words.length; i++) if (on(i)) assigned++;
        const short = words.length - assigned;
        note.textContent = `${assigned} picture${assigned === 1 ? '' : 's'} · ${words.length} word${words.length === 1 ? '' : 's'}`
          + (short > 0 ? ` — ${short} word${short === 1 ? '' : 's'} with no picture yet` : ' — one each');
      }

      const step = (which, get, set) => D.el('span', { class: 'tq-step ft-seg' },
        D.el('button', { class: 'tq-btn', title: 'Fewer', onclick: () => set(get() - 1) }, '−'),
        D.el('span', { class: 'wb-slice-steplab' }, which === 'across' ? acrossLab : downLab),
        D.el('button', { class: 'tq-btn', title: 'More', onclick: () => set(get() + 1) }, '+'));

      const setCols = (n) => { colEdges = wbEvenBands(Math.max(1, Math.min(12, n))); recut(); };
      const setRows = (n) => { rowEdges = wbEvenBands(Math.max(1, Math.min(14, n))); recut(); };

      const overlay = D.el('div', { class: 'wb-slicer' },
        D.el('div', { class: 'wb-slicer-card' },
          D.el('div', { class: 'wb-slicer-head' },
            D.el('div', {},
              D.el('h3', {}, 'Cut up your picture sheet'),
              D.el('p', {}, 'Each picture sits under its word. Tap two tiles to swap them; tap ✕ to drop one.')),
            D.el('div', { class: 'wb-slice-steppers' },
              D.el('span', { class: 'wb-slice-steplabel' }, 'Across'), step('across', () => colEdges.length, setCols),
              D.el('span', { class: 'wb-slice-steplabel' }, 'Down'), step('down', () => rowEdges.length, setRows))),
          grid,
          D.el('div', { class: 'wb-slicer-foot' },
            note,
            D.el('span', { class: 'grow' }),
            D.el('button', { class: 'btn ghost small', onclick: close }, 'Cancel'),
            D.el('button', { class: 'btn small wb-slice-go', onclick: use }, 'Use these pictures'))));

      function close() {
        document.removeEventListener('keydown', onEsc);
        overlay.remove();
      }
      function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
      function use() {
        const assignments = [];
        for (let i = 0; i < words.length; i++) if (on(i)) assignments.push({ wordIndex: i, img: crops[i] });
        close();
        if (!assignments.length) { D.toast('No pictures chosen'); return; }
        onDone(assignments);
      }

      document.addEventListener('keydown', onEsc);
      document.body.append(overlay);
      recut();
    });
  }

  // Two shapes parse. A sheet with a named header row carries the whole card
  // — word, tier, meaning, sentence, action, home language, beats. Anything
  // else is read as a plain list, first cell per line, exactly as before: the
  // live-harvest paste that already works must keep working.
  function wbParseSet(text, tiers) {
    const rows = wbCsvRows(text);
    let map = null;
    let start = 0;
    for (let r = 0; r < rows.length && r < 5; r++) {
      const first = wbHeadField(rows[r][0]);
      if (first === 'w' && rows[r].length > 1) {
        map = {};
        rows[r].forEach((cell, i) => { const f = wbHeadField(cell); if (f && !(f in map)) map[f] = i; });
        start = r + 1;
        break;
      }
    }
    const out = [];
    const seen = new Set();
    let skipped = 0;
    for (let r = start; r < rows.length; r++) {
      const cells = rows[r];
      if (!cells.length) continue;
      const raw = String(cells[map ? map.w : 0] || '').replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
      const word = wbWord(raw.replace(/^["'\s]+|["'\s]+$/g, ''));
      if (!word) { if (cells.some((c) => String(c).trim())) skipped++; continue; }
      const key = word.toLowerCase();
      // an unheaded list can still open with the word "word" — only a real
      // header row is skipped, and that was already consumed above
      if (!map && (key === 'word' || key === 'words')) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = { w: word };
      if (map) {
        const at = (f) => (map[f] == null ? '' : String(cells[map[f]] == null ? '' : cells[map[f]]));
        for (const f of ['def', 'eg', 'act', 'home']) {
          const v = wbLine(at(f));
          if (v) card[f] = v;
        }
        const tier = wbTierOf(at('tier'), tiers);
        if (tier) card.tier = tier;
        const beats = parseInt(at('syl'), 10);
        if (beats >= 0 && beats <= 6) card.syl = beats;
        const pic = at('pic').trim();
        if (pic && /^[A-Za-z0-9 ._/-]{1,120}$/.test(pic) && !pic.includes('..')) card.img = pic;
      }
      out.push(card);
      if (out.length >= WB_CAP) break;
    }
    return { cards: out, skipped, rich: !!map };
  }

  // ---- the set file: a whole bank, pictures and all, in one file --------
  // Other apps of this kind have online banks you download from and upload
  // into, and a spreadsheet cannot carry a picture — so a set travels as one
  // zip named <set>.wordbank.zip: an ordinary archive every machine opens,
  // holding a readable sheet, the app's own copy, a preview page and a folder
  // of real photographs. What makes it "tight to the widget" is the envelope
  // inside, not the name — an extension is only a rename, and a bespoke one
  // only earns "there is no application set to open this document". A file
  // that fails this check
  // cannot load. It rides the sage-pack@1 envelope from the English set
  // design (§9) so the same file can later be published on a school's own
  // bank and listed beside templates without changing format.
  const WB_PACK_FORMAT = 'sage-pack@1';
  const WB_PACK_KIND = 'wordbank';

  // hardened like sanitizeTemplate: caps everywhere, unknown keys dropped,
  // every string sliced, every picture format- and size-checked. This file
  // came off the internet — it is not trusted, only parsed.
  function wbParsePack(text) {
    const s = String(text == null ? '' : text);
    if (s.length > WB_FILE_MAX) return { error: 'That set file is too big to open' };
    if (!/^\s*\{/.test(s)) return null; // not JSON at all: let the sheet reader have it
    let raw;
    try { raw = JSON.parse(s); } catch (e) { return { error: 'That file is not a word bank set — it could not be read' }; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'That file is not a word bank set' };
    if (raw.format !== WB_PACK_FORMAT || raw.kind !== WB_PACK_KIND) {
      return { error: 'That is not a word bank set — check the file, or use a sheet instead' };
    }
    const cards = [];
    const seen = new Set();
    let over = 0;
    for (const c of Array.isArray(raw.words) ? raw.words : []) {
      if (!c || typeof c !== 'object') continue;
      if (cards.length >= WB_CAP) { over++; continue; }
      const w = wbWord(c.w);
      if (!w) continue;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const card = { w };
      for (const f of ['def', 'eg', 'act', 'home']) {
        const v = wbLine(c[f]);
        if (v) card[f] = v;
      }
      if (c.tier === 1 || c.tier === 2 || c.tier === 3) card.tier = c.tier;
      const syl = Math.floor(+c.syl || 0);
      if (syl > 0 && syl <= 6) card.syl = syl;
      // a picture is either inline (an older single-file set) or the name of
      // a file in the archive, resolved next and dropped if it is not there.
      // Pictures are re-fitted against the set budget after that, so the only
      // job here is to refuse anything that is plainly neither.
      if (typeof c.img === 'string' && c.img) {
        if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/.test(c.img)) card.img = c.img;
        else if (/^[A-Za-z0-9 ._/-]{1,120}$/.test(c.img) && !c.img.includes('..')) card.img = c.img;
      }
      cards.push(card);
    }
    if (!cards.length) return { error: 'That set has no words in it' };
    const tiers = Array.isArray(raw.tiers) && raw.tiers.length
      ? WB_TIER_DEFAULTS.map((_, i) => wbLabel(raw.tiers[i], i)) : null;
    return {
      cards, tiers, over,
      name: String(raw.name == null ? '' : raw.name).replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  }

  const wbSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'word-bank-set';

  // ---- pictures in and out of the archive ----
  // A picture is judged by its own first bytes, never by its file extension —
  // which is also how SVG stays out without a rule of its own: it is text, so
  // it can never match an image signature.
  function wbImageMime(b) {
    if (!b || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return null;
  }
  function wbBytesToData(bytes, mime) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return 'data:' + mime + ';base64,' + btoa(s);
  }
  function wbDataToBytes(dataUrl) {
    const comma = String(dataUrl).indexOf(',');
    if (comma < 0) return null;
    const meta = dataUrl.slice(0, comma);
    if (!/;base64$/.test(meta)) return null;
    let bin;
    try { bin = atob(dataUrl.slice(comma + 1)); } catch (e) { return null; }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out, mime: (meta.match(/^data:([^;]+)/) || [])[1] || 'image/jpeg' };
  }
  const WB_EXT = { 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/jpeg': 'jpg' };

  const wbEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Every set carries a page that shows it. Unpack the archive, double-click
  // this, and the whole bank is there — words, meanings, sentences and the
  // photographs — in any browser, with no Sage Stage and no internet. A file
  // a teacher cannot look inside is a file they cannot trust.
  function wbPreviewHtml(set) {
    const tier = (t) => (t ? set.tiers[t - 1] || WB_TIER_DEFAULTS[t - 1] : '');
    // A page opened from a folder cannot read the sheet beside it — browsers
    // block that for file:// — so it can never refresh itself. It must say
    // what it is, or someone edits set.csv, opens this to admire the work,
    // and sees the old set with no error and no clue.
    let saved = '';
    try { saved = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { saved = ''; }
    const card = (w) => `    <article class="w${w.tier ? ' t' + w.tier : ''}">
      ${w.img ? `<img src="${wbEsc(w.img)}" alt="${wbEsc(w.w)}">` : '<div class="noimg">no picture</div>'}
      <div class="body">
        <h2>${wbEsc(w.w)}</h2>
        ${w.tier ? `<p class="tier">${wbEsc(tier(w.tier))}</p>` : ''}
        ${w.def ? `<p><b>What it means</b><br>${wbEsc(w.def)}</p>` : ''}
        ${w.eg ? `<p><b>In a sentence</b><br>${wbEsc(w.eg)}</p>` : ''}
        ${w.act ? `<p><b>Show me</b><br>${wbEsc(w.act)}</p>` : ''}
        ${w.home ? `<p><b>In our home language</b><br>${wbEsc(w.home)}</p>` : ''}
        ${w.syl ? `<p class="beats">${w.syl} beat${w.syl === 1 ? '' : 's'}</p>` : ''}
      </div>
    </article>`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${wbEsc(set.name)} — word bank set</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #f6f8f7; color: #22303c; }
  header { max-width: 1100px; margin: 0 auto 20px; }
  h1 { margin: 0 0 4px; font-size: 30px; }
  .sub { color: #5b6b7b; margin: 0; }
  .grid { max-width: 1100px; margin: 0 auto; display: grid; gap: 16px;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .w { background: #fff; border: 1px solid #dbe3e8; border-left: 7px solid #cbd5e1;
       border-radius: 12px; overflow: hidden; }
  .w.t1 { border-left-color: #94a3b8; } .w.t2 { border-left-color: #f59e0b; }
  .w.t3 { border-left-color: #14b8a6; }
  .w img { width: 100%; height: 150px; object-fit: cover; display: block; }
  .noimg { height: 46px; background: #eef2f5; }
  .body { padding: 12px 14px 16px; }
  h2 { margin: 0 0 2px; font-size: 23px; }
  .tier { margin: 0 0 10px; font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .04em; color: #0f766e; }
  p { margin: 0 0 9px; font-size: 15px; }
  b { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #0f766e; }
  .beats { color: #5b6b7b; font-size: 13px; margin: 0; }
  .snap { max-width: 1100px; margin: 0 auto 18px; padding: 10px 14px; border-radius: 10px;
          background: #fff6e0; border: 1px solid #f0d69a; color: #6b4f10; font-size: 13px; }
  footer { max-width: 1100px; margin: 26px auto 0; color: #5b6b7b; font-size: 13px; }
  @media (prefers-color-scheme: dark) {
    body { background: #131a1f; color: #e6edf3; }
    .w { background: #1b242b; border-color: #2c3941; }
    .noimg { background: #222d35; } .sub, .beats, footer { color: #93a4b3; }
    .snap { background: #33280f; border-color: #5c4715; color: #f0d69a; }
  }
</style>
</head>
<body>
<header>
  <h1>${wbEsc(set.name)}</h1>
  <p class="sub">${set.words.length} word${set.words.length === 1 ? '' : 's'} · a Sage Stage word bank set</p>
</header>
<p class="snap">This page is a snapshot of the set as it was saved${saved ? ' on ' + wbEsc(saved) : ''}. If you have
changed <code>set.csv</code> since, your changes are real but this page will not show them — it cannot read the
spreadsheet beside it.</p>
<div class="grid">
${set.words.map(card).join('\n')}
</div>
<footer>
  <p><b>To use this set:</b> open Sage Stage, add a <b>Word bank</b>, open its settings and choose
  <b>Open a set or sheet</b>, then pick the <code>.wordbank.zip</code> this page came from — or select
  <code>set.csv</code> and the <code>images</code> together.</p>
  <p><b>To change it:</b> edit <code>set.csv</code> in Excel, Numbers or Google Sheets. That is the file
  that counts. (<code>set.json</code> is the app’s own copy — editing it does nothing.)</p>
  <p><b>To add a picture:</b> put it in the <code>images</code> folder named after its word —
  <code>shark.png</code>, or <code>19-shark.png</code>; capitals, hyphens and underscores all read the same.</p>
</footer>
</body>
</html>
`;
  }

  // The set as files. set.json stays short and readable — a picture is a
  // reference to a real file in images/, not a wall of base64 — so a teacher
  // who opens the archive sees words they recognise and photographs they can
  // double-click. That readability is the whole reason this is an archive.
  function wbPackFiles(p, name) {
    const files = [];
    const used = new Set();
    const words = p.words.map((c) => {
      const o = { w: c.w };
      if (c.tier) o.tier = c.tier;
      for (const f of ['def', 'eg', 'act', 'home']) if (c[f]) o[f] = c[f];
      if (c.syl) o.syl = c.syl;
      if (c.img) {
        const parsed = wbDataToBytes(c.img);
        const mime = parsed && wbImageMime(parsed.bytes);
        if (mime) {
          // named after the word, so the folder reads like the bank does
          const base = wbSlug(c.w) || 'picture';
          let file = base + '.' + WB_EXT[mime];
          for (let n = 2; used.has(file); n++) file = base + '-' + n + '.' + WB_EXT[mime];
          used.add(file);
          files.push({ name: 'images/' + file, data: parsed.bytes });
          o.img = 'images/' + file;
        }
      }
      return o;   // pin and board position stay behind: they are this teacher's, not the set's
    });
    const set = {
      format: WB_PACK_FORMAT, kind: WB_PACK_KIND,
      id: wbSlug(name), name: name || 'Word bank set',
      note: 'A Sage Stage word bank set. Open preview.html to see it. To change it, edit set.csv — that is the one that counts; this file is the app’s own copy and editing it does nothing. '
        + 'The pictures are in the images folder: name a picture after its word and it comes in with the set.',
      tiers: p.tiers.slice(),
      words,
    };
    // The sheet is the file a person edits, so it travels with the set —
    // otherwise the folder is a dead end: the thing you open is not the thing
    // you can change. set.csv wins on import; set.json is the exact record.
    files.unshift({ name: 'set.json', data: JSON.stringify(set, null, 2) });
    files.unshift({ name: 'set.csv', data: wbSetCsv(p.words, p.tiers) });
    files.unshift({ name: 'preview.html', data: wbPreviewHtml(set, name) });
    return files;
  }

  // The download doubles as the template — the sorter's rule, and the reason
  // it works: every column a teacher (or an AI) might fill arrives already
  // labelled with a name that means something. An empty bank writes three
  // worked rows so the sheet teaches its own format.
  function wbSetCsv(words, tiers) {
    const head = ['word', 'picture', 'tier', 'meaning', 'sentence', 'action', 'home language', 'beats'];
    const rows = words.length ? words : [
      { w: 'shiver', tier: 2, def: 'to shake because you are cold or frightened', eg: 'She began to shiver as the wind cut across the playground.', act: 'wrap your arms round yourself and tremble', home: '', syl: 2 },
      { w: 'habitat', tier: 3, def: 'the place where a plant or animal lives', eg: 'A rock pool is the habitat of a hermit crab.', act: '', home: '', syl: 3 },
      { w: 'look', tier: 1, def: '', eg: '', act: '', home: '', syl: 1 },
    ];
    const q = (v) => {
      const s = String(v == null ? '' : v);
      return /["\n\t,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // the picture column doubles as the naming checklist: it says what to call
    // each file, so the person knows exactly what to ask the image model for
    const line = (c) => [
      c.w, 'images/' + wbSlug(c.w) + '.png',
      c.tier ? (tiers && tiers[c.tier - 1]) || WB_TIER_DEFAULTS[c.tier - 1] : '',
      c.def || '', c.eg || '', c.act || '', c.home || '', c.syl || '',
    ].map(q).join(',');
    // The byte order mark is not decoration. Several versions of Excel read
    // and re-save a plain CSV as Windows-1252, which mangles drżeć, café,
    // Arabic and Urdu — exactly the column the home-language line lives in.
    return '﻿' + head.join(',') + '\n' + rows.map(line).join('\n') + '\n';
  }

  function register() {
    const { WIDGETS, el, uid, clamp, save, toast, settingRow, checkRow, selectInput } = D;

    WIDGETS.phonemetiles = {
      title: 'Phoneme tiles', icon: 'phonemetiles', accent: '#a5f3fc', w: 660, h: 540,
      defaults: () => ({ items: [], frame: 'cvc', phase: null, tricky: false, target: '', covered: false, pace: 'steady' }),
      toPrintable(w) { return ptSoundMatSvg(w.props); },
      mount(body, w) {
        body.classList.add('mntray', 'ptwidget');
        const p = w.props;
        const pack = phonicsPack();
        p.items = (Array.isArray(p.items) ? p.items : []).filter((it) => it && typeof it.g === 'string' && it.g.length <= 30);
        for (const it of p.items) {
          it.k = it.k === 't' ? 't' : 'g';
          it.x = clamp(+it.x || 0.5, 0, 1);
          it.y = clamp(+it.y || 0.5, 0, 1);
          if (it.cell != null) it.cell = Math.max(0, Math.floor(+it.cell || 0));
        }

        let popId = null, dragging = false, zTop = 40, binEl = null, sweepEl = null;
        let flashT = null, flashing = false;
        let sayT = [];
        const tileEls = new Map(); // item id -> mounted element, for the say highlight

        const mat = el('div', { class: 'ct-mat pt-mat grow' });
        const tray = el('div', { class: 'pt-tray' });
        const quick = el('div', { class: 'tclock-quick' });
        body.append(mat, tray, quick);

        const commit = () => { save(); paint(); };
        const boxes = () => BOXES[p.frame] || 0;
        // the blend covers the word, not the frame: the sweep track and ball
        // stop at the last filled box, so trailing empty boxes take no beat
        const sweepSpan = (n) => {
          let last = -1;
          for (const it of p.items) {
            if (it.k !== 'g' || it.cell == null) continue;
            for (const c of claimed(it)) if (c > last) last = c;
          }
          return last >= 0 ? Math.min(last + 1, n) : n;
        };
        const phaseId = () => {
          const ids = pack.phases.map((x) => x.id);
          if (p.phase && ids.includes(p.phase)) return p.phase;
          const auto = yearPhase(D.deck().yearGroup);
          return ids.includes(auto) ? auto : ids[0] || '2';
        };
        const curPhase = () => pack.phases.find((x) => x.id === phaseId()) || { id: '2', name: 'Phase 2', sets: [], tricky: [] };
        const phasesUpTo = () => pack.phases.slice(0, pack.phases.findIndex((x) => x.id === phaseId()) + 1);

        // all geometry flows from the mat size — resizing the widget resizes
        // frame, tiles and sound buttons together (the counters rule)
        function geom() {
          const W = mat.clientWidth || 600, H = mat.clientHeight || 320;
          const n = boxes();
          const g = { W, H, n };
          g.s = n ? clamp(Math.min((W * 0.92) / n, H * 0.4), 34, 116) : clamp(Math.min(W, H) / 5.5, 40, 116);
          g.d = g.s * 0.86;
          g.fx = (W - g.s * n) / 2;
          g.fy = H * 0.12 + (p.target ? Math.min(H * 0.1, 34) : 0);
          return g;
        }
        const cellCenter = (i, g) => (i == null || i < 0 || i >= g.n ? null : [g.fx + (i + 0.5) * g.s, g.fy + g.s / 2]);

        // dropping claims the nearest free box; a split tile needs its pair box
        // free too and never starts nearer the end than two boxes from it
        function snapItem(it, g) {
          it.cell = null;
          if (it.k === 't' || !g.n) return;
          const px = it.x * g.W, py = it.y * g.H;
          if (py < g.fy - g.s * 0.6 || py > g.fy + g.s * 1.6) return;
          const taken = new Set();
          for (const o of p.items) if (o !== it) for (const c of claimed(o)) taken.add(c);
          let best = null, bd = Infinity;
          for (let i = 0; i < g.n; i++) {
            if (taken.has(i)) continue;
            if (isSplit(it.g) && (i + 2 >= g.n || taken.has(i + 2))) continue;
            const c = cellCenter(i, g);
            const dd = Math.hypot(c[0] - px, c[1] - py);
            if (dd < bd) { bd = dd; best = i; }
          }
          if (best != null && bd < g.s * 1.3) {
            it.cell = best;
            const c = cellCenter(best, g);
            it.x = c[0] / g.W;
            it.y = c[1] / g.H;
          }
        }

        // stale cells (frame switched, pack edited, double claims) drop loose
        function sanitizeCells() {
          const n = boxes();
          const seen = new Set();
          for (const it of p.items) {
            if (it.cell == null) continue;
            const cells = claimed(it);
            if (it.k === 't' || cells.some((c) => c < 0 || c >= n || seen.has(c))) { it.cell = null; continue; }
            for (const c of cells) seen.add(c);
          }
        }

        function adoptLoose() {
          const g = geom();
          for (const it of p.items) if (it.cell == null && it.k === 'g') snapItem(it, g);
        }

        // ---- drag (counters grammar: drag to move, bin or off-mat removes) ----
        function dragItem(elc, it, e0, isNew, place) {
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
            if (!moved && it.cell != null) {
              // leaving a box: its sound button comes off with the tile
              for (const c of claimed(it)) { const sg = mat.querySelector('.pt-sg-c' + c); if (sg) sg.remove(); }
              it.cell = null;
            }
            moved = true;
            elc.classList.add('ct-drag');
            mat.classList.add('ct-dragging');
            const r = mat.getBoundingClientRect();
            it.x = clamp((ev.clientX - r.left) / r.width, 0.02, 0.98);
            it.y = clamp((ev.clientY - r.top) / r.height, 0.02, 0.98);
            place(elc, it, g);
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
              popId = it.id;
              if (isNew) { // a plain tap on the tray: drop the tile loose below the frame
                it.x = clamp(0.1 + (p.items.length % 7) * 0.115, 0.04, 0.82);
                it.y = 0.84;
              }
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

        // ---- mounting the three tile kinds ----
        const placeTile = (elc, it, g) => {
          // a claimed box wins over x/y — presets store cells with untouched x/y
          const c = it.k === 'g' ? cellCenter(it.cell, g) : null;
          const px = c ? c[0] : it.x * g.W, py = c ? c[1] : it.y * g.H;
          elc.style.left = px - elc.offsetWidth / 2 + 'px';
          elc.style.top = py - elc.offsetHeight / 2 + 'px';
        };
        const placeSplit = (elc, it, g) => {
          const d = g.d;
          const inCell = it.cell != null;
          elc.classList.toggle('pt-split-loose', !inCell);
          if (inCell) {
            const c0 = cellCenter(it.cell, g), c2 = cellCenter(it.cell + 2, g);
            elc.style.left = c0[0] - d / 2 + 'px';
            elc.style.top = c0[1] - d / 2 + 'px';
            elc.style.width = c2[0] - c0[0] + d + 'px';
            elc.style.height = d + 'px';
          } else {
            elc.style.left = it.x * g.W - d * 0.8 + 'px';
            elc.style.top = it.y * g.H - d * 0.45 + 'px';
            elc.style.width = d * 1.6 + 'px';
            elc.style.height = d * 0.9 + 'px';
          }
          for (const h of elc.querySelectorAll('.pt-half')) {
            h.style.width = (inCell ? d : d * 0.68) + 'px';
            h.style.height = (inCell ? d : d * 0.9) + 'px';
            h.style.fontSize = d * 0.42 + 'px';
          }
        };

        function mountTile(it, g) {
          let elc;
          if (it.k === 'g' && isSplit(it.g)) {
            const [a, b] = it.g.split('_');
            elc = el('div', { class: 'pt-split' + (popId === it.id ? ' bm-pop' : '') },
              el('span', { class: 'pt-half', title: 'Split digraph — its two halves sit two boxes apart' }, a),
              svgEl(`<svg class="pt-splitarc" viewBox="0 0 40 12" preserveAspectRatio="none"><path d="M3 3 Q20 14 37 3" fill="none" stroke="#b45309" stroke-width="2.5" stroke-linecap="round"/></svg>`),
              el('span', { class: 'pt-half' }, b));
            for (const h of elc.querySelectorAll('.pt-half')) {
              h.addEventListener('pointerdown', (e) => { if (!p.covered) dragItem(elc, it, e, false, placeSplit); });
            }
            placeSplit(elc, it, g);
          } else {
            const trick = it.k === 't';
            elc = el('button', {
              class: (trick ? 'pt-tile pt-trick' : 'pt-tile') + (popId === it.id ? ' bm-pop' : ''),
              title: trick ? 'Tricky word — read it by sight' : 'Drag to move — drop it in a frame box, on the bin, or off the mat',
            }, it.g);
            elc.style.height = (trick ? g.d * 0.72 : g.d) + 'px';
            if (!trick) elc.style.width = g.d + 'px';
            elc.style.fontSize = g.d * (trick ? 0.34 : 0.44) + 'px';
            elc.addEventListener('pointerdown', (e) => { if (!p.covered) dragItem(elc, it, e, false, placeTile); });
            mat.append(elc); // needs offsetWidth for centring, so append first
            placeTile(elc, it, g);
            tileEls.set(it.id, elc);
            return elc;
          }
          mat.append(elc);
          tileEls.set(it.id, elc);
          return elc;
        }

        function svgEl(html) {
          const tpl = el('div', { html });
          return tpl.firstElementChild;
        }

        // ---- frame, sound buttons, sweep, target ----
        function drawFrame(g) {
          if (!g.n) return;
          mat.append(el('div', {
            class: 'ct-frame',
            style: `left:${g.fx}px;top:${g.fy}px;width:${g.s * g.n}px;height:${g.s}px;background-size:${g.s}px ${g.s}px;`,
          }));
          const hs = clamp(g.s * 0.42, 20, 48);
          const parts = [];
          for (const it of p.items) {
            if (it.cell == null || it.k !== 'g') continue;
            const cls = `pt-sg pt-sg-c${it.cell}`;
            const cx = (it.cell + 0.5) * g.s;
            const r = clamp(g.s * 0.085, 4.5, 9);
            if (isSplit(it.g)) {
              parts.push(`<path class="${cls}" d="M${cx} ${hs * 0.22} Q${cx + g.s} ${hs * 1.05} ${cx + 2 * g.s} ${hs * 0.22}" stroke-width="${r * 0.95}" fill="none" stroke-linecap="round"/>`);
            } else if (it.g.length > 1) {
              parts.push(`<line class="${cls}" x1="${it.cell * g.s + g.s * 0.2}" y1="${hs * 0.3}" x2="${(it.cell + 1) * g.s - g.s * 0.2}" y2="${hs * 0.3}" stroke-width="${r * 1.5}" stroke-linecap="round"/>`);
            } else {
              parts.push(`<circle class="${cls}" cx="${cx}" cy="${hs * 0.3}" r="${r}"/>`);
            }
          }
          const strip = svgEl(`<svg class="pt-sounds" viewBox="0 0 ${g.s * g.n} ${hs}" width="${g.s * g.n}" height="${hs}">${parts.join('')}</svg>`);
          strip.style.left = g.fx + 'px';
          strip.style.top = g.fy + g.s + 4 + 'px';
          mat.append(strip);
          sweepEl = el('div', { class: 'pt-sweep' }, el('i'), el('b'));
          sweepEl.style.cssText = `left:${g.fx}px;top:${g.fy + g.s + 4 + hs + 3}px;width:${g.s * sweepSpan(g.n)}px;height:${clamp(g.s * 0.16, 9, 17)}px;`;
          mat.append(sweepEl);
        }

        function editTarget() {
          // D.promptDialog, never window.prompt — the desktop webview has no
          // native prompt at all (returns null without showing anything)
          D.promptDialog('Target word (leave blank to remove):', p.target || '', (v) => {
            p.target = v.trim().slice(0, 20);
            commit();
          }, { label: 'Set' });
        }

        function drawTarget() {
          if (!p.target) return;
          mat.append(el('button', { class: 'pt-target', title: 'The word to build — tap to change it', onclick: editTarget }, p.target));
        }

        // ---- sound-talk then blend sweep (teacher voices the sounds, §5.1) ----
        function stopSay() {
          for (const t of sayT) clearTimeout(t);
          sayT = [];
          mat.classList.remove('pt-talking');
          for (const nEl of mat.querySelectorAll('.pt-pulse, .pt-say')) nEl.classList.remove('pt-pulse', 'pt-say');
          if (sweepEl) sweepEl.classList.remove('run');
        }
        function sayIt() {
          stopSay();
          if (p.covered) { toast('Uncover the mat first'); return; }
          const seq = p.items.filter((i) => i.cell != null && i.k === 'g').sort((a, b) => a.cell - b.cell);
          if (!seq.length) { toast('Put some tiles in the frame first'); return; }
          if (!sayHintToasted) {
            sayHintToasted = true;
            toast('You’re the voice — say each pure sound as its grapheme lights up, then blend along the sweep.');
          }
          const n = boxes();
          const ms = PACE_MS[p.pace] || 1300;
          const hold = ms * 0.72; // lit long enough to model the pure sound and hear it echoed
          const setSay = (it, on) => {
            const elc = tileEls.get(it.id);
            if (elc) elc.classList.toggle('pt-say', on);
            const sg = mat.querySelector('.pt-sg-c' + it.cell);
            if (sg) sg.classList.toggle('pt-pulse', on);
          };
          // everything dims; one grapheme at a time takes the light — a child
          // who shares no language with the label still knows whose turn it is
          mat.classList.add('pt-talking');
          seq.forEach((it, idx) => {
            sayT.push(setTimeout(() => setSay(it, true), 250 + idx * ms));
            sayT.push(setTimeout(() => setSay(it, false), 250 + idx * ms + hold));
          });
          // then the blend: the ball glides under the word and each grapheme
          // relights as it passes — the finger-sweep, made followable
          const span = sweepSpan(n);
          const sweepMs = Math.max(1200, span * ms * 0.45);
          sayT.push(setTimeout(() => {
            if (!sweepEl) return;
            sweepEl.style.setProperty('--sweep-ms', sweepMs + 'ms');
            sweepEl.classList.add('run');
            for (const it of seq) {
              const cells = claimed(it);
              sayT.push(setTimeout(() => setSay(it, true), (cells[0] / span) * sweepMs));
              sayT.push(setTimeout(() => setSay(it, false), Math.min(sweepMs, ((cells[cells.length - 1] + 1) / span) * sweepMs)));
            }
            sayT.push(setTimeout(stopSay, sweepMs + 250));
          }, 250 + seq.length * ms + 400));
        }

        // subitising's cousin: reveal for a two-second look, then hide (recall)
        function flash() {
          clearTimeout(flashT);
          stopSay();
          flashing = true;
          p.covered = false;
          paint();
          flashT = setTimeout(() => { flashing = false; p.covered = true; commit(); }, 2000);
        }

        // ---- tray ----
        function addFromTray(g2, kind, e) {
          if (p.covered) { toast('Uncover the mat first'); return; }
          if (p.items.length >= 40) { toast('That’s plenty of tiles for one mat!'); return; }
          const r = mat.getBoundingClientRect();
          const it = {
            id: uid(), g: g2, k: kind, cell: null,
            x: clamp((e.clientX - r.left) / r.width, 0.04, 0.96),
            y: clamp((e.clientY - r.top) / r.height, 0.04, 0.96),
          };
          p.items.push(it);
          const elc = mountTile(it, geom());
          dragItem(elc, it, e, true, it.k === 'g' && isSplit(it.g) ? placeSplit : placeTile);
        }

        function paintTray() {
          tray.innerHTML = '';
          if (!pack.phases.length) {
            tray.append(el('span', { class: 'pt-ph' }, 'No phonics pack loaded — check english-packs.js'));
            return;
          }
          const ph = curPhase();
          if (p.tricky) {
            for (const t of ph.tricky) {
              const chip = el('button', { class: 'pt-tray-tile pt-trickchip', title: 'Tap to add this tricky word — read it by sight' }, t);
              chip.addEventListener('pointerdown', (e) => addFromTray(t, 't', e));
              tray.append(chip);
            }
            if (!ph.tricky.length) tray.append(el('span', { class: 'pt-ph' }, 'No tricky words in this phase'));
          } else {
            const group = phasesUpTo();
            for (const phx of group) {
              if (!phx.sets.length) continue;
              if (group.length > 1) tray.append(el('span', { class: 'pt-ph', title: phx.name }, 'Ph ' + phx.id));
              for (const set of phx.sets) for (const g2 of set) {
                const t = el('button', { class: 'pt-tray-tile', title: 'Tap to add — or drag straight into the frame' }, g2.replace('_', '-'));
                t.addEventListener('pointerdown', (e) => addFromTray(g2, 'g', e));
                tray.append(t);
              }
            }
          }
          if (ph.tricky.length) {
            tray.append(el('button', {
              class: 'pt-star' + (p.tricky ? ' active' : ''),
              title: 'Swap the tray between graphemes and this phase’s tricky words',
              onclick: () => { p.tricky = !p.tricky; save(); paintTray(); },
            }, '★ Tricky'));
          }
        }

        // ---- quick bar ----
        function paintQuick() {
          quick.innerHTML = '';
          const ph = phaseId();
          quick.append(...[
            el('span', { class: 'tq-step ft-seg' }, ...FRAMES.map(([id, label]) => el('button', {
              class: 'tq-btn' + (p.frame === id ? ' active' : ''),
              title: 'Choose the word frame',
              onclick: () => {
                if (p.frame === id) return;
                p.frame = id;
                for (const it of p.items) it.cell = null;
                adoptLoose();
                commit();
              },
            }, label))),
            pack.phases.length > 1 ? el('span', { class: 'tq-step ft-seg' }, ...pack.phases.map((x) => el('button', {
              class: 'tq-btn' + (ph === x.id ? ' active' : ''),
              title: p.phase ? 'Phonics phase — set for this widget' : 'Phonics phase — following the deck’s year group',
              onclick: () => { p.phase = x.id; commit(); },
            }, x.id))) : null,
            el('span', { class: 'tq-step ft-seg', title: 'No audio: you voice the pure sounds — pick the pace that matches who’s following' },
              el('span', { class: 'pt-saylab' }, 'Sound talk'),
              ...PACES.map(([id, label, tip]) => el('button', {
                class: 'tq-btn' + (p.pace === id ? ' active' : ''),
                title: tip,
                onclick: () => { p.pace = id; save(); paintQuick(); sayIt(); },
              }, label))),
            el('button', { class: 'tq-btn', title: 'Show everything for two seconds, then hide it (recall)', onclick: flash }, 'Flash'),
            el('button', {
              class: 'tq-btn' + (p.covered ? ' active' : ''), title: 'Hide the mat behind a cover',
              onclick: () => { clearTimeout(flashT); flashing = false; p.covered = !p.covered; commit(); },
            }, 'Cover'),
            el('button', { class: 'tq-btn', title: 'Set the word to build — it shows above the frame', onclick: editTarget }, 'Word'),
            el('button', { class: 'tq-btn', title: 'Take every tile off the mat', onclick: () => { p.items = []; commit(); } }, 'Clear'),
          ].filter(Boolean));
        }

        // the tray shows every tile, always — so its tile size must answer to
        // both dimensions: as big as fits the width in rows that leave the mat
        // at least ~60% of the widget. Few tiles → large; Phase 5's ~70 → smaller.
        function traySize() {
          const count = 2 + (p.tricky
            ? curPhase().tricky.length
            : phasesUpTo().reduce((a, x) => a + x.sets.reduce((b, s) => b + s.length, 0), 0));
          const W = mat.clientWidth || 600;
          const budget = Math.max(64, (body.clientHeight || 480) * 0.4);
          for (let f = 26; f > 12; f--) {
            const perRow = Math.max(1, Math.floor(W / (f * 2.5)));
            if (Math.ceil(count / perRow) * f * 2.2 <= budget) return f;
          }
          return 12;
        }

        function paint() {
          stopSay();
          mat.innerHTML = '';
          sweepEl = null;
          tileEls.clear();
          sanitizeCells();
          body.style.setProperty('--pt-tray', traySize() + 'px');
          const g = geom();
          drawFrame(g);
          drawTarget();
          binEl = el('div', { class: 'ct-bin', title: 'Drag a tile here to bin it' }, '🗑');
          mat.append(binEl);
          for (const it of p.items) mountTile(it, g);
          if (p.covered) mat.append(el('div', { class: 'ct-blind' }, '?'));
          else if (!p.items.length) {
            mat.append(el('div', { class: 'bm-empty ct-hint' }, boxes() ? 'Tap a tray tile to add it — drag it into the frame' : 'Tap a tray tile to add it to the mat'));
          }
          popId = null;
          paintTray();
          paintQuick();
        }

        // repaint only when the mat truly changes size — ResizeObserver also
        // fires on observe and on sub-pixel settles, and a spurious paint()
        // would stopSay() a sound-talk run that just started
        let matW = 0, matH = 0;
        const sizeChanged = () => {
          const w2 = mat.clientWidth, h2 = mat.clientHeight;
          if (Math.abs(w2 - matW) < 1 && Math.abs(h2 - matH) < 1) return false;
          matW = w2; matH = h2;
          return true;
        };
        const ro = new ResizeObserver(() => { if (!dragging && sizeChanged()) paint(); });
        ro.observe(mat);
        sizeChanged();
        paint();
        return () => { ro.disconnect(); clearTimeout(flashT); stopSay(); };
      },

      settings(box, w, api) {
        const el2 = D.el;
        const pack = phonicsPack();
        const preset = (label, make) => el2('button', {
          class: 'btn ghost small',
          onclick: () => { Object.assign(w.props, make()); api.refresh(); },
        }, label);
        const T = (g, cell) => ({ id: D.uid(), g, k: 'g', x: 0.5, y: 0.5, cell });
        box.append(
          el2('div', { class: 'hint' }, 'Start from a word:'),
          el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
            preset('CVC — cat', () => ({ frame: 'cvc', phase: '2', tricky: false, covered: false, target: 'cat', items: [T('c', 0), T('a', 1), T('t', 2)] })),
            preset('Digraph — chip', () => ({ frame: 'cvc', phase: '3', tricky: false, covered: false, target: 'chip', items: [T('ch', 0), T('i', 1), T('p', 2)] })),
            preset('Split — make', () => ({ frame: 'cvcc', phase: '5', tricky: false, covered: false, target: 'make', items: [T('m', 0), T('a_e', 1), T('k', 2)] })),
            preset('Tricky flash', () => ({ tricky: true, covered: true, target: '', items: [] })),
          ),
          settingRow('Phase', selectInput(
            [['', 'Auto (deck year group)'], ...pack.phases.map((x) => [x.id, x.name])],
            w.props.phase || '',
            (v) => { w.props.phase = v || null; api.refresh(); },
          )),
          settingRow('Frame', selectInput(FRAMES, w.props.frame || 'cvc', (v) => {
            w.props.frame = v;
            for (const it of w.props.items || []) it.cell = null;
            api.refresh();
          })),
          settingRow('Word', el2('input', {
            class: 'text-input', value: w.props.target || '', placeholder: 'shows above the frame',
            onchange: (e) => { w.props.target = e.target.value.trim().slice(0, 20); api.refresh(); },
          })),
          el2('div', { class: 'hint' }, 'Tap a tray tile to add it — or drag it straight into a frame box · sound buttons draw themselves: a dot under one letter, a bar under a digraph, an arc under a split digraph (its halves sit two boxes apart, vaulting the consonant between — make is m·a_e·k in a 4-box frame) · “Sound talk” has no audio on purpose: pick New, Practising or Fluent for the pace and each grapheme lights in turn while you voice the pure sounds (/m/ never “muh”), then the ball sweeps for blending · grow a word by swapping one tile: cat → chat · ★ swaps the tray to tricky words, read by sight · Flash shows everything for two seconds, then hides it · the phase follows the deck’s year group until you pick one.'),
        );
      },
    };

    WIDGETS.wordsort = {
      title: 'Word class sorter', icon: 'wordsort', accent: '#d9f99d', w: 760, h: 520,
      defaults: () => ({ cards: [], year: null, only: null, dealt: false, impReplace: true }),
      mount(body, w) {
        body.classList.add('mntray', 'wswidget');
        const p = w.props;
        p.cards = (Array.isArray(p.cards) ? p.cards : [])
          .filter((c) => c && typeof c.w === 'string' && c.w.length <= 30)
          .slice(0, 60);
        for (const c of p.cards) {
          c.ans = (Array.isArray(c.ans) ? c.ans : []).filter((a) => WS_LABEL[a]);
          if (c.col != null && !WS_LABEL[c.col]) c.col = null;
          if (c.m !== 'ok' && c.m !== 'no') delete c.m;
        }
        // one card per word — heals rounds saved before the redeal learned not
        // to double a word the teacher already had
        const seenW = new Set();
        p.cards = p.cards.filter((c) => {
          const k = c.w.toLowerCase();
          if (seenW.has(k)) return false;
          seenW.add(k);
          return true;
        });
        p.impReplace = p.impReplace !== false;

        let popId = null, dragging = false, binEl = null;

        const cols = el('div', { class: 'ws-cols grow' });
        const pool = el('div', { class: 'ws-pool' });
        const quick = el('div', { class: 'tclock-quick' });
        body.append(cols, pool, quick);

        const commit = () => { save(); paint(); };
        const act = () => wsActive(p, D.deck().yearGroup);

        // first mount deals a hand, so the widget lands ready to sort
        if (!p.dealt) {
          p.dealt = true;
          if (!p.cards.length) p.cards = wsDeal(act());
          save();
        }

        // cards shrink to fit the narrowest column: bounded by the longest
        // word on the mat, so "magnificent" never bursts an eight-column round
        function fontFor(a) {
          const n = Math.max(1, a.length);
          const colW = ((cols.clientWidth || 700) - (n - 1) * 8 - 12) / n;
          const maxLen = Math.max(4, ...p.cards.map((c) => c.w.length));
          return clamp(Math.floor(Math.min(colW / (maxLen * 0.62 + 1.4), colW / 7)), 11, 24);
        }

        // ---- drag: lift a ghost, drop on a column, the pool, or the bin ----
        function dragCard(elc, c, e0) {
          if (dragging) return;
          e0.preventDefault();
          dragging = true;
          const pid = e0.pointerId;
          const x0 = e0.clientX, y0 = e0.clientY;
          let ghost = null, over = null;
          const target = (ev) => {
            // the bin is pointer-events:none (taps pass through to the mat),
            // so it is rect-tested first — hit-testing can never return it
            if (binEl) {
              const b = binEl.getBoundingClientRect();
              if (ev.clientX >= b.left - 8 && ev.clientX <= b.right + 8 && ev.clientY >= b.top - 8 && ev.clientY <= b.bottom + 8) return { kind: 'bin' };
            }
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!under) return null;
            const col = under.closest('.ws-col');
            if (col && cols.contains(col)) return { kind: 'col', el: col, id: col.dataset.cl };
            if (under.closest('.ws-pool') === pool) return { kind: 'pool', el: pool };
            return body.contains(under) ? { kind: 'body' } : null;
          };
          const move = (ev) => {
            if (ev.pointerId !== pid) return;
            if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
            if (!ghost) {
              ghost = elc.cloneNode(true);
              ghost.classList.add('ws-ghost');
              ghost.style.fontSize = getComputedStyle(elc).fontSize;
              document.body.append(ghost);
              elc.classList.add('ws-lift');
              cols.classList.add('ws-dragging'); // brightens the bin, as on the phoneme mat
            }
            ghost.style.left = ev.clientX + 'px';
            ghost.style.top = ev.clientY + 'px';
            const t = target(ev);
            const overEl = t && (t.kind === 'col' || t.kind === 'pool') ? t.el : null;
            if (over !== overEl) {
              if (over) over.classList.remove('ws-over');
              over = overEl;
              if (over) over.classList.add('ws-over');
            }
            if (binEl) binEl.classList.toggle('hot', !!t && t.kind === 'bin');
            ghost.classList.toggle('ct-out', !t || t.kind === 'bin');
          };
          const up = (ev) => {
            if (ev.pointerId !== pid) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            dragging = false;
            cols.classList.remove('ws-dragging');
            if (over) over.classList.remove('ws-over');
            if (binEl) binEl.classList.remove('hot');
            if (!ghost) { popId = c.id; paint(); return; } // plain tap: pop, a "read me" moment
            ghost.remove();
            elc.classList.remove('ws-lift');
            if (ev.type === 'pointercancel') { paint(); return; }
            const t = target(ev);
            if (!t || t.kind === 'bin') p.cards = p.cards.filter((x) => x !== c); // off the widget = binned, the counters grammar
            else if (t.kind === 'col') { delete c.m; c.col = t.id; }
            else if (t.kind === 'pool') { delete c.m; c.col = null; }
            commit();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }

        // ---- check: mark what's placed; traps ring gold either way ----
        function checkNow() {
          const a = act();
          const placed = p.cards.filter((c) => c.col);
          if (!placed.length) { toast('Sort some cards into columns first'); return; }
          let ok = 0, no = 0, open = 0, gold = 0;
          for (const c of placed) {
            if (!c.ans.length) { delete c.m; open++; continue; }
            c.m = c.ans.includes(c.col) ? 'ok' : 'no';
            c.m === 'ok' ? ok++ : no++;
            if (wsTrap(c.ans, a)) gold++;
          }
          commit();
          if (!ok && !no) { toast('Open sort — none of the placed words has answer classes set'); return; }
          toast(`${ok} ✓ · ${no} ✗` + (gold ? ` · ${gold} discussion gold` : '') + (open ? ` · ${open} open` : ''));
        }

        function mountCard(c, a) {
          const trap = wsTrap(c.ans, a);
          const marked = c.m === 'ok' || c.m === 'no';
          const elc = el('button', {
            class: 'ws-card' + (popId === c.id ? ' bm-pop' : '')
              + (c.m === 'ok' ? ' ws-ok' : c.m === 'no' ? ' ws-no' : '')
              + (marked && trap ? ' ws-gold' : ''),
            title: marked && trap
              ? 'Discussion gold — can be: ' + c.ans.map((x) => WS_LABEL[x] || x).join(' · ')
              : 'Drag into a column · the bin takes it out of the round',
          }, c.w);
          if (marked) elc.append(el('span', { class: 'ws-badge' }, c.m === 'no' ? '✗' : trap ? '★' : '✓'));
          elc.addEventListener('pointerdown', (e) => dragCard(elc, c, e));
          return elc;
        }

        function paint() {
          cols.innerHTML = '';
          pool.innerHTML = '';
          const a = act();
          // a column that left the window drops its cards back to the pool
          for (const c of p.cards) if (c.col && !a.includes(c.col)) { c.col = null; delete c.m; }
          body.style.setProperty('--ws-fs', fontFor(a) + 'px');
          for (const id of a) {
            cols.append(el('div', { class: 'ws-col', 'data-cl': id },
              el('div', { class: 'ws-col-h', title: WS_LABEL[id] }, WS_LABEL[id]),
              el('div', { class: 'ws-col-cards' }, ...p.cards.filter((c) => c.col === id).map((c) => mountCard(c, a)))));
          }
          binEl = el('div', { class: 'ct-bin', title: 'Drag a card here to take it out of the round' }, '🗑');
          cols.append(binEl);
          const loose = p.cards.filter((c) => !c.col);
          pool.append(...loose.map((c) => mountCard(c, a)));
          if (!p.cards.length) pool.append(el('span', { class: 'ws-poolhint' }, 'No cards — tap “New words” to deal a set'));
          else if (!loose.length) pool.append(el('span', { class: 'ws-poolhint' }, 'All sorted — Check, or drag a card back down here'));
          popId = null;
          paintQuick();
        }

        function paintQuick() {
          quick.innerHTML = '';
          const winId = wsWin(p, D.deck().yearGroup);
          quick.append(
            el('span', { class: 'tq-step ft-seg' }, ...[['2', 'Y2'], ['3', 'Y3'], ['4', 'Y4+']].map(([id, label]) => el('button', {
              class: 'tq-btn' + (winId === id ? ' active' : ''),
              title: (p.year ? 'Terminology window — set for this widget' : 'Terminology window — following the deck’s year group')
                + ' · switching deals fresh words for the new columns',
              onclick: () => { p.year = id; p.only = null; wsRedeal(p, D.deck().yearGroup); commit(); },
            }, label))),
            el('button', { class: 'tq-btn', title: 'Mark every placed card — a gold ring is a word that lives in more than one column: talk about it', onclick: checkNow }, 'Check'),
            el('button', { class: 'tq-btn', title: 'Deal a fresh set of cards — words you added yourself stay', onclick: () => { wsRedeal(p, D.deck().yearGroup); commit(); } }, 'New words'),
            el('button', { class: 'tq-btn', title: 'Send every card back to the pool', onclick: () => { for (const c of p.cards) { c.col = null; delete c.m; } commit(); } }, 'Unsort'),
          );
        }

        // guarded like the phoneme mat: repaint only on a real size change
        let cw = 0, ch = 0;
        const sizeChanged = () => {
          const w2 = cols.clientWidth, h2 = cols.clientHeight;
          if (Math.abs(w2 - cw) < 1 && Math.abs(h2 - ch) < 1) return false;
          cw = w2; ch = h2;
          return true;
        };
        const ro = new ResizeObserver(() => { if (!dragging && sizeChanged()) paint(); });
        ro.observe(cols);
        sizeChanged();
        paint();
        return () => ro.disconnect();
      },

      settings(box, w, api) {
        const el2 = D.el;
        const p = w.props;
        const yg = D.deck().yearGroup;
        const a = wsActive(p, yg);
        const winIds = WS_CLASSES.slice(0, WS_WINDOWS[wsWin(p, yg)]).map(([id]) => id);
        const preset = (label, make) => el2('button', {
          class: 'btn ghost small',
          onclick: () => { make(); api.refresh(); },
        }, label);

        const addInput = el2('input', { class: 'text-input grow', placeholder: 'add a word…', maxlength: '24' });
        const addWord = () => {
          const v = addInput.value.trim().replace(/[‘’]/g, "'").replace(/[^A-Za-z' -]/g, '').slice(0, 24);
          if (!v) return;
          if (p.cards.length >= 60) { D.toast('That’s plenty of cards for one round'); return; }
          p.cards.push({ id: D.uid(), w: v, ans: [], col: null, custom: true });
          addInput.value = '';
          api.refresh();
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addWord(); });

        // ---- bulk import / template download (school lists, en masse) ----
        // replace-vs-add is a saved widget setting, not a per-panel flag — a
        // fresh panel silently resetting it to "replace" once ate a 26-card round
        const impText = el2('textarea', {
          class: 'text-input ws-imp', rows: '4',
          placeholder: 'light, noun, verb, adjective\nagain, adverb\nChristmas, noun\nwater',
        });
        const applyImport = () => {
          const { cards, skipped } = wsParseList(impText.value);
          if (!cards.length) { D.toast('No words found — one word per line, classes after a comma'); return; }
          if (p.impReplace !== false) p.cards = [];
          const byWord = new Map(p.cards.map((c) => [c.w.toLowerCase(), c]));
          let added = 0, updated = 0, full = 0;
          for (const nc of cards) {
            const ex = byWord.get(nc.w.toLowerCase());
            if (ex) { ex.ans = nc.ans; delete ex.m; ex.custom = true; updated++; }
            else if (p.cards.length >= 60) full++;
            else {
              const card = { id: D.uid(), w: nc.w, ans: nc.ans, col: null, custom: true };
              p.cards.push(card);
              byWord.set(nc.w.toLowerCase(), card);
              added++;
            }
          }
          p.dealt = true;
          api.refresh();
          D.toast(`${added} added` + (updated ? ` · ${updated} updated` : '')
            + (skipped ? ` · ${skipped} lines skipped` : '') + (full ? ` · ${full} over the 60-card cap` : ''));
        };
        const fileIn = el2('input', { type: 'file', accept: '.csv,.txt,text/plain,text/csv', style: 'display:none;' });
        fileIn.addEventListener('change', () => {
          const f = fileIn.files && fileIn.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => { impText.value = String(rd.result || '').slice(0, 20000); applyImport(); };
          rd.readAsText(f);
        });
        const download = () => {
          const csv = wsListCsv(p.cards, wsActive(p, D.deck().yearGroup));
          const blob = new Blob([csv], { type: 'text/csv' });
          if (window.SagePlatform && SagePlatform.saveBlob) {
            SagePlatform.saveBlob('word-sorter-list.csv', blob, 'CSV').then((r) => {
              if (r === 'saved') D.toast('Saved');
            });
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = el2('a', { href: url, download: 'word-sorter-list.csv' });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        };

        const editRow = (c) => el2('div', { class: 'ws-edrow' },
          el2('b', {}, c.w),
          el2('span', { class: 'ws-chips' }, ...winIds.map((id) => el2('button', {
            class: 'ws-chip' + (c.ans.includes(id) ? ' active' : ''),
            title: WS_LABEL[id] + ' — tick every class that counts as right',
            onclick: (e) => {
              c.ans = c.ans.includes(id) ? c.ans.filter((x) => x !== id) : [...c.ans, id];
              delete c.m;
              e.target.classList.toggle('active');
              D.save();
            },
          }, WS_ABBR[id]))),
          el2('button', { class: 'ws-edx', title: 'Remove this word', onclick: () => { p.cards = p.cards.filter((x) => x !== c); api.refresh(); } }, '×'));

        box.append(
          el2('div', { class: 'hint' }, 'Start from:'),
          el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
            preset('Nouns & verbs', () => { p.only = ['noun', 'verb']; wsRedeal(p, yg); }),
            preset('Whole year set', () => { p.only = null; wsRedeal(p, yg); }),
            preset('Discussion words', () => { p.only = null; wsRedeal(p, yg, true); }),
          ),
          settingRow('Year', selectInput([
            ['', 'Auto (deck year group)'],
            ['2', 'Y2 — noun · verb · adjective · adverb'],
            ['3', 'Y3 — adds preposition & conjunction'],
            ['4', 'Y4+ — all eight classes'],
          ], p.year || '', (v) => { p.year = v || null; p.only = null; wsRedeal(p, yg); api.refresh(); })),
          el2('div', { class: 'hint' }, 'Columns on screen:'),
          el2('div', { class: 'row', style: 'flex-wrap:wrap; gap:2px 12px;' }, ...winIds.map((id) => checkRow(WS_LABEL[id], a.includes(id), (on) => {
            const next = winIds.filter((x) => (x === id ? on : a.includes(x)));
            if (!next.length) { D.toast('Keep at least one column'); api.refresh(); return; }
            p.only = next.length === winIds.length ? null : next;
            api.refresh();
          }))),
          el2('div', { class: 'hint' }, 'Words in this round — tick every class that counts as right (more than one tick makes it a discussion word):'),
          el2('div', { class: 'ws-edit' }, ...p.cards.map(editRow)),
          el2('div', { class: 'row' }, addInput, el2('button', { class: 'btn ghost small', onclick: addWord }, 'Add')),
          el2('div', { class: 'hint' }, 'Import your school’s list: paste or upload, one word per line — word first, then its classes (light, noun, verb, adjective) and the ticks fill themselves. A plain word list works too; those words arrive with no ticks, so Check leaves them alone until you tick them. Download saves this round as a CSV grid that mirrors the sorter: a column per class with its name at the top, and each word’s classes marked in their own columns — the class name or a simple x both count when you re-import.'),
          impText,
          el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
            el2('button', { class: 'btn ghost small', onclick: applyImport }, 'Import pasted list'),
            el2('button', { class: 'btn ghost small', onclick: () => fileIn.click() }, 'Upload file…'),
            el2('button', { class: 'btn ghost small', onclick: download }, 'Download list'),
            fileIn),
          checkRow('Replace the round (untick to add to it)', p.impReplace !== false, (v) => { p.impReplace = v; D.save(); }),
          el2('div', { class: 'hint' }, 'Drag each card into its column, then Check marks the placed ones — a word with no ticks stays unmarked, so leave ticks off for an open sort. A gold ring is a trap that fits more than one column (light is a noun, a verb and an adjective): correct wherever it lands, and worth talking about. No subject or object columns on purpose — those are jobs a word does in a sentence, not word classes; the sentence builder will handle them.'),
        );
      },
    };

    WIDGETS.wordbank = {
      title: 'Word bank', icon: 'wordbank', accent: '#fde68a', w: 720, h: 520,
      defaults: () => ({ words: [], tiers: WB_TIER_DEFAULTS.slice(), view: 'board', impReplace: true }),
      mount(body, w) {
        body.classList.add('mntray', 'wbwidget');
        const p = w.props;
        wbSanitize(p);

        // popId is state (a popped card wears its book chip until something
        // else happens); animId is the one-shot that plays the pop.
        // openIds is a SET, not one id: closely-linked subject words —
        // germinate and metamorphosis — need to be open side by side so the
        // class can see what they share and where they differ (Glenn,
        // 2026-07-24). Insertion order also gives the stacking order.
        let popId = null, animId = null, teachId = null, dragging = false, binEl = null, zTop = 10;
        const openIds = new Set();

        const board = el('div', { class: 'ct-mat wb-board grow' });
        const lanes = el('div', { class: 'wb-lanes grow' });
        const pool = el('div', { class: 'wb-pool' });
        const teach = el('div', { class: 'wb-teach grow' });
        const quick = el('div', { class: 'tclock-quick wb-quick' });
        body.append(board, lanes, pool, teach, quick);

        const commit = () => { save(); paint(); };
        const isBoard = () => p.view !== 'lanes';
        const byId = (id) => p.words.find((c) => c.id === id) || null;

        // ---- capture: the quick bar is built once, so the input keeps focus
        // and its caret through every repaint (a rebuilt bar loses both mid-word)
        const capIn = el('input', {
          class: 'text-input grow wb-cap', maxlength: '24',
          placeholder: 'harvest a word…', title: 'Type a word and press Enter — it lands on the board',
        });
        function addWord() {
          const word = wbWord(capIn.value);
          if (!word) { capIn.value = ''; return; }
          const dup = p.words.find((c) => c.w.toLowerCase() === word.toLowerCase());
          capIn.value = '';
          if (dup) { toast('“' + dup.w + '” is already in the bank'); return; }
          if (p.words.length >= WB_CAP) { toast('That’s a full bank — bin a word to make room'); return; }
          const c = Object.assign(wbCard(word), wbFreeSlot(p.words, word));
          p.words.push(c);
          popId = animId = c.id;
          commit();
          capIn.focus();
        }
        capIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addWord(); });
        const viewBtn = (id, label, tip) => el('button', {
          class: 'tq-btn', title: tip,
          onclick: () => { if (p.view !== id) { p.view = id; popId = null; commit(); } },
        }, label);
        const boardBtn = viewBtn('board', 'Board', 'The corkboard — arrange words where you want them');
        const lanesBtn = viewBtn('lanes', 'Lanes', 'Sort words into your three tiers — the board keeps its layout');
        // Pictures off is a teaching move, not a display setting: show the
        // picture as the way in, then take it away and let the word carry it
        // alone. Cards stay exactly where they are — only the picture goes.
        // the bulk shortcut over the per-word setting: all on, or all off
        const picBtn = el('button', {
          class: 'tq-btn wb-picbtn',
          onclick: () => {
            const withImg = p.words.filter((c) => c.img);
            const anyShown = withImg.some((c) => c.pic !== false);
            for (const c of withImg) c.pic = !anyShown;
            commit();
          },
        }, '🖼 Pictures');
        quick.append(
          capIn,
          el('button', { class: 'tq-btn wb-addbtn', title: 'Add this word to the bank', onclick: addWord }, 'Add'),
          picBtn,
          el('span', { class: 'tq-step ft-seg' }, boardBtn, lanesBtn),
        );

        // ---- one card component, both views ----
        // Three states. A tap pops the card, a second tap opens it where it
        // stands, and the book chip goes to the full teach card. The teaching
        // moment happens ON the board: replacing the whole widget to show one
        // word throws away the wall the class is reading from.
        const WB_REVEAL = [['def', 'What it means'], ['eg', 'In a sentence'], ['act', 'Show me'], ['home', 'In our home language']];
        function addReveal(elc, c) {
          const filled = WB_REVEAL.filter(([k]) => c[k]);
          // The picture belongs to the teaching moment, per word: some words
          // need the picture every time, some never do, and the teacher
          // decides at the point of asking (Glenn, 2026-07-24). A span, not a
          // button — the card itself is a button and cannot nest one.
          const picToggle = c.img ? el('span', {
            class: 'wb-picrow' + (c.pic !== false ? ' on' : ''),
            onpointerdown: (e) => { e.stopPropagation(); e.preventDefault(); c.pic = c.pic === false; commit(); },
          }, c.pic !== false ? '🖼 Hide the picture' : '🖼 Show the picture') : null;
          elc.append(el('div', { class: 'wb-reveal' },
            ...filled.map(([k, lab]) => el('div', { class: 'wb-rline' },
              el('span', { class: 'wb-rlab' }, lab),
              el('span', { class: 'wb-rval' }, c[k]))),
            filled.length ? null : el('div', { class: 'wb-rempty' }, 'Nothing written for this word yet — open it big to fill it in'),
            picToggle,
          ));
        }
        function mountCard(c) {
          const open = openIds.has(c.id);
          const showPic = c.img && c.pic !== false;
          const elc = el('button', {
            class: 'wb-card' + (animId === c.id ? ' bm-pop' : '') + (popId === c.id ? ' wb-popped' : '')
              + (open ? ' wb-open' : '') + (showPic ? ' wb-pic' : '') + (c.tier ? ' wb-t' + c.tier : ''),
            title: c.w + (c.pin ? ' — pinned' : '')
              + (open ? ' · tap to close it again' : ' · tap to show what it means, drag to move it'),
          });
          if (showPic) elc.append(el('img', { class: 'wb-thumb', src: c.img, alt: c.w, draggable: 'false' }));
          elc.append(el('span', { class: 'wb-w' }, c.w));
          if (c.pin) elc.append(el('span', { class: 'wb-pinned', title: 'Pinned' }, '📌'));
          if (popId === c.id || open) {
            // a span, not a button: a button inside a button is invalid, and
            // the card itself already answers a second tap
            elc.append(el('span', {
              class: 'wb-book', title: 'Open this word big — picture, beats and the writing lines',
              onpointerdown: (e) => { e.stopPropagation(); e.preventDefault(); openTeach(c.id); },
            }, '📖'));
          }
          elc.addEventListener('pointerdown', (e) => (isBoard() ? dragBoard(elc, c, e) : dragLane(elc, c, e)));
          return elc;
        }

        const tap = (c) => {
          // opening one never closes another — that is the whole point
          if (openIds.has(c.id)) { openIds.delete(c.id); paint(); return; }
          if (popId === c.id) { openIds.add(c.id); popId = null; paint(); return; }
          popId = animId = c.id;
          paint();
        };

        // ---- board: absolute cards, the counters grammar ----
        // x,y is where the WORD sits, not where the card box sits. Anchoring on
        // the word is what lets a picture be switched on mid-lesson without the
        // tile jumping: the card grows upward around the word and the word
        // stays exactly where the teacher (and their annotations) left it.
        // Anchoring on the box moved the word every time the card changed size.
        const wordAnchor = (elc) => {
          const wEl = elc.querySelector('.wb-w');
          if (!wEl) return { dx: elc.offsetWidth / 2, dy: elc.offsetHeight / 2 };
          return { dx: wEl.offsetLeft + wEl.offsetWidth / 2, dy: wEl.offsetTop + wEl.offsetHeight / 2 };
        };
        const placeCard = (elc, c) => {
          const W = board.clientWidth || 600, H = board.clientHeight || 320;
          const a = wordAnchor(elc);
          elc.style.left = c.x * W - a.dx + 'px';
          elc.style.top = c.y * H - a.dy + 'px';
        };
        function dragBoard(elc, c, e0) {
          if (dragging) return;
          e0.preventDefault();
          const pid = e0.pointerId;
          const x0 = e0.clientX, y0 = e0.clientY;
          let moved = false;
          dragging = true;
          elc.style.zIndex = ++zTop;
          // keep the grab: the card follows the finger from wherever it was
          // taken hold of, rather than snapping its word under the pointer
          const br0 = board.getBoundingClientRect();
          const grabX = (x0 - br0.left) / br0.width - c.x;
          const grabY = (y0 - br0.top) / br0.height - c.y;
          const isOut = (ev) => {
            const r = board.getBoundingClientRect();
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
            // an open card travels WITH its meanings — nudging a card mid-
            // lesson must not shut it
            moved = true;
            elc.classList.add('ct-drag');
            board.classList.add('ct-dragging');
            const r = board.getBoundingClientRect();
            c.x = clamp((ev.clientX - r.left) / r.width - grabX, 0.02, 0.98);
            c.y = clamp((ev.clientY - r.top) / r.height - grabY, 0.02, 0.98);
            placeCard(elc, c);
            if (binEl) binEl.classList.toggle('hot', overBin(ev));
            elc.classList.toggle('ct-out', isOut(ev) || overBin(ev));
          };
          const up = (ev) => {
            if (ev.pointerId !== pid) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            dragging = false;
            board.classList.remove('ct-dragging');
            if (!moved) { tap(c); return; }
            // a pinned card still bins: the pin marks a favourite, it is not a lock
            if (ev.type !== 'pointercancel' && (isOut(ev) || overBin(ev))) p.words = p.words.filter((x) => x !== c);
            commit();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }

        // ---- lanes: the sorter's ghost drag, tiers instead of classes ----
        function dragLane(elc, c, e0) {
          if (dragging) return;
          e0.preventDefault();
          dragging = true;
          const pid = e0.pointerId;
          const x0 = e0.clientX, y0 = e0.clientY;
          let ghost = null, over = null;
          const target = (ev) => {
            // the bin is pointer-events:none so taps fall through; rect-test it
            // first or hit-testing can never return it
            if (binEl) {
              const b = binEl.getBoundingClientRect();
              if (ev.clientX >= b.left - 8 && ev.clientX <= b.right + 8 && ev.clientY >= b.top - 8 && ev.clientY <= b.bottom + 8) return { kind: 'bin' };
            }
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!under) return null;
            const lane = under.closest('.wb-lane');
            if (lane && lanes.contains(lane)) return { kind: 'lane', el: lane, tier: +lane.dataset.tier };
            if (under.closest('.wb-pool') === pool) return { kind: 'pool', el: pool };
            return body.contains(under) ? { kind: 'body' } : null;
          };
          const move = (ev) => {
            if (ev.pointerId !== pid) return;
            if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
            if (!ghost) {
              ghost = elc.cloneNode(true);
              ghost.classList.add('ws-ghost');
              ghost.style.fontSize = getComputedStyle(elc).fontSize;
              document.body.append(ghost);
              elc.classList.add('ws-lift');
              lanes.classList.add('ct-dragging');
            }
            ghost.style.left = ev.clientX + 'px';
            ghost.style.top = ev.clientY + 'px';
            const t = target(ev);
            const overEl = t && (t.kind === 'lane' || t.kind === 'pool') ? t.el : null;
            if (over !== overEl) {
              if (over) over.classList.remove('ws-over');
              over = overEl;
              if (over) over.classList.add('ws-over');
            }
            if (binEl) binEl.classList.toggle('hot', !!t && t.kind === 'bin');
            ghost.classList.toggle('ct-out', !t || t.kind === 'bin');
          };
          const up = (ev) => {
            if (ev.pointerId !== pid) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            dragging = false;
            lanes.classList.remove('ct-dragging');
            if (over) over.classList.remove('ws-over');
            if (binEl) binEl.classList.remove('hot');
            if (!ghost) { tap(c); return; }
            ghost.remove();
            elc.classList.remove('ws-lift');
            if (ev.type === 'pointercancel') { paint(); return; }
            const t = target(ev);
            // tiering never touches x/y — flipping back to the board finds
            // every card exactly where the teacher left it
            if (!t || t.kind === 'bin') p.words = p.words.filter((x) => x !== c);
            else if (t.kind === 'lane') c.tier = t.tier;
            else if (t.kind === 'pool') c.tier = null;
            commit();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }

        // ---- teach card: the deep-teach routine, one word at a time ----
        function openTeach(id) {
          teachId = id;
          popId = animId = null;   // open panels survive a trip to the big card
          paint();
        }
        function closeTeach() {
          teachId = null;
          paint();
        }
        function editLine(c, key, label) {
          D.promptDialog(label + ':', c[key] || '', (v) => {
            c[key] = wbLine(v);     // blank clears it; Cancel never reaches here
            commit();
          }, { label: 'Set' });
        }
        function pickCardImage(c) {
          D.pickImage((data) => {
            wbFitImage(data, WB_IMG_MAX, (out) => {
              if (!out) { toast('That picture is too detailed to store — try a simpler one'); return; }
              const others = p.words.filter((x) => x !== c && x.img).length;
              c.img = out;
              commit();
              if (others + 1 >= WB_IMG_SOFT) toast('That’s plenty of pictures for one bank — they take up storage');
            });
          }, 480);
        }
        function paintTeach() {
          teach.innerHTML = '';
          const c = byId(teachId);
          if (!c) { teachId = null; return; }
          const line = (key, label, placeholder) => el('div', {
            class: 'wb-line' + (c[key] ? '' : ' wb-line-empty'),
            title: 'Tap to write it — leave it blank to clear',
            onclick: () => editLine(c, key, label),
          }, el('span', { class: 'wb-linelab' }, label), el('span', { class: 'wb-lineval' }, c[key] || placeholder));

          const dots = el('div', { class: 'wb-syls', title: c.syl ? 'Tap a dot to clap it' : 'Count the beats in the word' });
          for (let i = 0; i < c.syl; i++) {
            dots.append(el('button', {
              class: 'wb-syl', title: 'Clap!',
              onclick: (e) => {
                const d = e.currentTarget;
                d.classList.remove('wb-clap');
                void d.offsetWidth; // restart the animation on a repeat tap
                d.classList.add('wb-clap');
              },
            }));
          }
          if (!c.syl) dots.append(el('span', { class: 'wb-sylhint' }, 'no beats set'));

          teach.append(
            el('div', { class: 'wb-teach-top' },
              el('button', { class: 'tq-btn', title: 'Back to the bank', onclick: closeTeach }, '← Back'),
              el('span', { class: 'grow' }),
              el('button', {
                class: 'tq-btn wb-pinbtn' + (c.pin ? ' on' : ''),
                title: c.pin ? 'Pinned as a favourite — tap to unpin' : 'Pin this word as a favourite',
                onclick: () => { c.pin = !c.pin; commit(); },
              }, c.pin ? '📌 Pinned' : '📌 Pin'),
              el('button', {
                class: 'tq-btn', title: 'Take this word out of the bank',
                onclick: () => { p.words = p.words.filter((x) => x !== c); closeTeach(); save(); },
              }, 'Remove'),
            ),
            el('div', { class: 'wb-teach-head' },
              el('button', {
                class: 'wb-slot' + (c.img ? ' wb-slot-full' : ''),
                title: c.img ? 'Tap to swap the picture' : 'Tap to add a picture',
                onclick: () => pickCardImage(c),
              }, c.img ? el('img', { src: c.img, alt: c.w, draggable: 'false' }) : el('span', { class: 'wb-slot-hint' }, '＋\npicture')),
              el('div', { class: 'wb-teach-word' },
                el('div', { class: 'wb-big' },
                  el('span', { class: 'wb-bigw' }, c.w),
                  el('span', { class: 'wb-sound', title: 'First sound' }, wbFirstSound(c.w))),
                el('div', { class: 'wb-sylrow' },
                  el('button', { class: 'tq-btn wb-step', title: 'Fewer beats', onclick: () => { c.syl = Math.max(0, c.syl - 1); commit(); } }, '−'),
                  dots,
                  el('button', { class: 'tq-btn wb-step', title: 'More beats', onclick: () => { c.syl = Math.min(6, c.syl + 1); commit(); } }, '+')),
              ),
              c.img ? el('button', { class: 'wb-imgx', title: 'Remove the picture', onclick: () => { c.img = null; commit(); } }, '×') : null,
            ),
            line('def', 'What it means', 'tap to write a child-friendly meaning…'),
            line('eg', 'In a sentence', 'tap to write an example sentence…'),
            line('act', 'Show me', 'tap to write an action or gesture…'),
            line('home', 'In our home language', 'tap to write it in a child’s home language…'),
          );
        }

        // ---- painting ----
        function boardFont() {
          const W = board.clientWidth || 620;
          return clamp(Math.round(W / 34), 13, 24);
        }
        function laneFont() {
          const colW = ((lanes.clientWidth || 700) - 24) / 3;
          const maxLen = Math.max(4, ...p.words.map((c) => c.w.length));
          return clamp(Math.floor(Math.min(colW / (maxLen * 0.62 + 1.4), colW / 7)), 11, 22);
        }
        function paintBoard() {
          board.innerHTML = '';
          body.style.setProperty('--wb-fs', boardFont() + 'px');
          binEl = el('div', { class: 'ct-bin', title: 'Drag a word here to take it out of the bank' }, '🗑');
          board.append(binEl);
          for (const c of p.words) {
            const elc = mountCard(c);
            board.append(elc);   // append first: placing needs the measured width
            placeCard(elc, c);
            // The panel hangs off the card, so the card never changes size or
            // has to move. Its own place is worked out in pixels and CLAMPED
            // inside the board: the first version flipped it above whenever it
            // did not fit below, which sent it off the top of the widget where
            // it simply vanished. Below if it fits, above if that fits, and
            // otherwise nudged to sit fully on the board — never off-screen.
            if (openIds.has(c.id)) {
              const W = board.clientWidth || 600, H = board.clientHeight || 320;
              addReveal(elc, c);
              elc.style.zIndex = 900 + [...openIds].indexOf(c.id);
              const panel = elc.querySelector('.wb-reveal');
              if (panel) {
                const cl = elc.offsetLeft, ct = elc.offsetTop;
                const pw = panel.offsetWidth, ph = panel.offsetHeight;
                const a = wordAnchor(elc);
                const below = elc.offsetHeight + 7;
                let left, top;
                if (ct + below + ph <= H - 6) {
                  // below the card — its bottom never moves, because a picture
                  // grows the card upward from the word
                  top = below;
                  left = a.dx - pw / 2;
                } else {
                  // no room below: go to the SIDE, level with the word, never
                  // above. Above is anchored to the card's top, which is the
                  // one edge a picture moves — so switching a picture on threw
                  // the panel up the screen and off it. Level with the word it
                  // cannot move at all, and it never covers the picture.
                  top = a.dy - ph / 2;
                  left = cl + elc.offsetWidth + 7 + pw <= W - 6 ? elc.offsetWidth + 7 : -pw - 7;
                }
                left = clamp(left, 6 - cl, Math.max(6 - cl, W - 6 - pw - cl));
                top = clamp(top, 6 - ct, Math.max(6 - ct, H - 6 - ph - ct));
                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
              }
            }
          }
          if (!p.words.length) {
            board.append(el('div', { class: 'bm-empty ct-hint' }, 'Type a word below to harvest it — cards pin to this board like a working wall.'));
          }
        }
        function paintLanes() {
          lanes.innerHTML = '';
          pool.innerHTML = '';
          body.style.setProperty('--wb-fs', laneFont() + 'px');
          // in a lane the card grows within its column — the column scrolls,
          // and no card leaves the position the teacher put it in
          const mountOne = (c) => {
            const elc = mountCard(c);
            if (openIds.has(c.id)) addReveal(elc, c);
            return elc;
          };
          for (let t = 1; t <= 3; t++) {
            lanes.append(el('div', { class: 'wb-lane wb-t' + t, 'data-tier': String(t) },
              el('div', { class: 'wb-lane-h', title: p.tiers[t - 1] }, p.tiers[t - 1]),
              el('div', { class: 'wb-lane-cards' }, ...p.words.filter((c) => c.tier === t).map(mountOne))));
          }
          binEl = el('div', { class: 'ct-bin', title: 'Drag a word here to take it out of the bank' }, '🗑');
          lanes.append(binEl);
          const loose = p.words.filter((c) => !c.tier);
          pool.append(...loose.map(mountOne));
          if (!p.words.length) pool.append(el('span', { class: 'wb-poolhint' }, 'No words yet — harvest one below'));
          else if (!loose.length) pool.append(el('span', { class: 'wb-poolhint' }, 'Every word is in a lane — drag one back down here to untier it'));
        }
        function paint() {
          const teaching = !!byId(teachId);
          if (!teaching) teachId = null;
          const onBoard = isBoard();
          board.style.display = !teaching && onBoard ? '' : 'none';
          lanes.style.display = !teaching && !onBoard ? '' : 'none';
          pool.style.display = !teaching && !onBoard ? '' : 'none';
          teach.style.display = teaching ? '' : 'none';
          quick.style.display = teaching ? 'none' : '';
          boardBtn.classList.toggle('active', onBoard);
          lanesBtn.classList.toggle('active', !onBoard);
          const withImg = p.words.filter((c) => c.img);
          const shown = withImg.filter((c) => c.pic !== false).length;
          picBtn.disabled = !withImg.length;
          picBtn.classList.toggle('active', shown > 0);
          picBtn.classList.toggle('wb-picoff', withImg.length > 0 && shown === 0);
          picBtn.textContent = !withImg.length ? '🖼 Pictures'
            : shown === 0 ? '🖼 Pictures off'
              : shown === withImg.length ? '🖼 Pictures' : `🖼 Pictures ${shown}/${withImg.length}`;
          picBtn.title = !withImg.length ? 'No pictures in this bank yet'
            : shown === 0 ? 'All pictures hidden — tap to show them again'
              : 'Hide every picture and leave just the words · open a single word to show or hide just that one';
          if (teaching) { paintTeach(); binEl = null; }
          else if (onBoard) paintBoard();
          else paintLanes();
          animId = null;
        }

        // tapping the empty board puts the open card away again
        board.addEventListener('pointerdown', (e) => {
          if (e.target === board && (popId || openIds.size)) { popId = null; openIds.clear(); paint(); }
        });
        const onKey = (e) => {
          if (e.key !== 'Escape') return;
          if (teachId) closeTeach();
          else if (openIds.size || popId) { openIds.clear(); popId = null; paint(); }
        };
        document.addEventListener('keydown', onKey);

        // guarded like both siblings: repaint only on a real size change, never
        // mid-drag (a repaint would drop the element being dragged)
        let bw = 0, bh = 0;
        const sizeChanged = () => {
          const w2 = body.clientWidth, h2 = body.clientHeight;
          if (Math.abs(w2 - bw) < 1 && Math.abs(h2 - bh) < 1) return false;
          bw = w2; bh = h2;
          return true;
        };
        const ro = new ResizeObserver(() => { if (!dragging && sizeChanged()) paint(); });
        ro.observe(body);
        sizeChanged();
        paint();
        return () => { ro.disconnect(); document.removeEventListener('keydown', onKey); };
      },

      settings(box, w, api) {
        const el2 = D.el;
        const p = w.props;
        // chips carry the lane's own name, cut to fit — "Goldilocks" reads as
        // "Goldilo…" rather than a bare number, so a renamed lane still says
        // which one it is. The full name is on the title.
        const short = (s) => {
          const first = s.split(' ')[0];
          return first.length > 8 ? first.slice(0, 7) + '…' : first;
        };

        const addInput = el2('input', { class: 'text-input grow', placeholder: 'add a word…', maxlength: '24' });
        const addWord = () => {
          const word = wbWord(addInput.value);
          if (!word) return;
          if (p.words.some((c) => c.w.toLowerCase() === word.toLowerCase())) { D.toast('“' + word + '” is already in the bank'); return; }
          if (p.words.length >= WB_CAP) { D.toast('That’s a full bank — remove a word to make room'); return; }
          p.words.push(Object.assign(wbCard(word), wbFreeSlot(p.words, word)));
          addInput.value = '';
          api.refresh();
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addWord(); });

        const impText = el2('textarea', {
          class: 'text-input wb-imp', rows: '4',
          placeholder: 'word,tier,meaning,sentence,action,home language,beats\nshiver,Power words,to shake with cold,"She began to shiver, cold to the bone.",tremble,,2\n\n— or just one word per line, to harvest as you go',
        });
        const WB_ROW_FIELDS = ['def', 'eg', 'act', 'home', 'tier', 'syl', 'img'];
        // One merge, whichever door the words came in by — a pasted sheet or a
        // whole set file. Membership replace, not wipe-and-rebuild, and a
        // filled field updates while an absent one leaves well alone: a
        // teacher who downloads their set, fixes one column and brings it back
        // must not lose the lines they typed on the board in between. The pin
        // and the place on the board are never the file's business at all —
        // where a card sits is this teacher's work, not the set author's.
        const mergeIn = (rows, tail) => {
          const before = p.words.length;
          let removed = 0;
          if (p.impReplace !== false) {
            const wanted = new Set(rows.map((x) => x.w.toLowerCase()));
            p.words = p.words.filter((c) => wanted.has(c.w.toLowerCase()));
            removed = before - p.words.length;
          }
          const have = new Map(p.words.map((c) => [c.w.toLowerCase(), c]));
          let added = 0, updated = 0, full = 0;
          for (const row of rows) {
            const ex = have.get(row.w.toLowerCase());
            if (ex) {
              let touched = false;
              for (const f of WB_ROW_FIELDS) {
                if (row[f] != null && row[f] !== '' && ex[f] !== row[f]) { ex[f] = row[f]; touched = true; }
              }
              if (touched) updated++;
              continue;
            }
            if (p.words.length >= WB_CAP) { full++; continue; }
            const c = Object.assign(wbCard(row.w), wbFreeSlot(p.words, row.w, !!row.img));
            for (const f of WB_ROW_FIELDS) if (row[f] != null && row[f] !== '') c[f] = row[f];
            p.words.push(c);
            have.set(row.w.toLowerCase(), c);
            added++;
          }
          api.refresh();
          D.toast(`${added} added` + (updated ? ` · ${updated} updated` : '') + (removed ? ` · ${removed} removed` : '')
            + (full ? ` · ${full} over the ${WB_CAP}-word cap` : '') + (tail || ''));
        };

        // One way in, whichever door the set came through: a zip, a folder's
        // worth of files, or text in the box. Everything reduces to "some
        // words, and some pictures to match against them".
        const applyBundle = (cards, pics, tiers, tail) => {
          // a set author's lane names only take over a bank still using ours —
          // a school that renamed its lanes keeps its own wording
          if (tiers && p.tiers.every((t, i) => t === WB_TIER_DEFAULTS[i])) p.tiers = tiers;
          const report = pics && pics.size ? wbAttachPictures(cards, pics) : { missing: [], spare: [] };
          const pictured = cards.filter((c) => c.img).length;
          if (pictured) D.toast(`Fitting ${pictured} picture${pictured === 1 ? '' : 's'}…`);
          wbFitSet(cards, (out, dropped) => {
            mergeIn(out, (pictured ? ` · ${pictured - dropped} picture${pictured - dropped === 1 ? '' : 's'}` : '')
              + (dropped ? ` · ${dropped} too big to keep` : '') + (tail || ''));
            // then the checklist, both directions — at twenty words the
            // person needs to know exactly what to fix, not that "some"
            // pictures did not arrive
            const say = [];
            if (pics && pics.size && report.missing.length) say.push(`No picture yet for: ${report.missing.slice(0, 8).join(', ')}${report.missing.length > 8 ? ` and ${report.missing.length - 8} more` : ''}`);
            if (report.spare.length) say.push(`Matched no word: ${report.spare.slice(0, 6).join(', ')}${report.spare.length > 6 ? ` and ${report.spare.length - 6} more` : ''}`);
            if (say.length) setTimeout(() => D.toast(say.join(' · ')), 2600);
          });
        };

        // text on its own: a set file, a sheet, or a plain list. A picture
        // named in text has no folder to come from, so it is reported missing
        // rather than silently ignored.
        const applyText = (text, pics) => {
          const pack = wbParsePack(text);
          if (pack && pack.error) { D.toast(pack.error); return true; }
          if (pack) { applyBundle(pack.cards, pics, pack.tiers, pack.over ? ` · ${pack.over} over the ${WB_CAP}-word cap` : ''); return true; }
          const { cards, skipped, rich } = wbParseSet(text, p.tiers);
          if (!cards.length) { D.toast('No words found — one word per line, or a sheet headed “word”'); return false; }
          applyBundle(cards, pics, null, (skipped ? ` · ${skipped} lines skipped` : '') + (rich ? ' · meanings included' : ''));
          return true;
        };
        const applyImport = () => applyText(impText.value, null);

        // the archive: a sheet and the app's own copy beside a folder of real
        // pictures. set.csv wins — it is the file a person edits, and picking
        // the other one would mean their work silently did nothing.
        const openArchive = async (buffer) => {
          let entries;
          try { entries = await window.SageZip.read(buffer); }
          catch (e) { D.toast('That set file could not be opened'); return; }
          const find = (re) => { for (const k of entries.keys()) if (re.test(k)) return k; return null; };
          const csvKey = find(/(^|\/)set\.csv$/i);
          const jsonKey = find(/(^|\/)set\.json$/i);
          const key = csvKey || jsonKey;
          if (!key) { D.toast('That is not a word bank set — there is no set.csv or set.json inside it'); return; }
          const pics = new Map();
          for (const [k, v] of entries) if (!/(^|\/)(set\.(csv|json)|preview\.html)$/i.test(k) && wbImageMime(v)) pics.set(k, v);
          const used = applyText(window.SageZip.decodeText(entries.get(key)), pics);
          if (used && csvKey && jsonKey) {
            setTimeout(() => D.toast('Used set.csv — that is the file to edit'), 1300);
          }
        };

        // a folder's worth of files, selected together: the sheet plus its
        // pictures. Zipping is right for sending a set; it should not be a
        // tax on building one.
        const openFiles = async (files) => {
          const read = (f, how) => new Promise((res) => {
            const rd = new FileReader();
            rd.onload = () => res(rd.result);
            rd.onerror = () => res(null);
            how === 'text' ? rd.readAsText(f) : rd.readAsArrayBuffer(f);
          });
          const pics = new Map();
          const texts = [];
          for (const f of files) {
            if (f.size > WB_FILE_MAX) continue;
            const buf = await read(f, 'buffer');
            if (!buf) continue;
            const bytes = new Uint8Array(buf);
            if (wbImageMime(bytes)) { pics.set(f.name, bytes); continue; }
            if (window.SageZip && window.SageZip.looksZip(buf)) { await openArchive(buf); return; }
            texts.push({ name: f.name, text: new TextDecoder().decode(bytes) });
          }
          if (!texts.length) {
            D.toast(pics.size ? 'Those are pictures only — add the sheet (set.csv) as well' : 'Nothing there we could read');
            return;
          }
          // the sheet, if it is named like one; otherwise the first text file
          const pick = texts.find((t) => /set\.csv$/i.test(t.name)) || texts.find((t) => /\.csv$/i.test(t.name)) || texts[0];
          if (!/^\s*\{/.test(pick.text)) impText.value = pick.text.slice(0, 20000);
          applyText(pick.text, pics);
        };

        const saveBlob = (blob, filename) => {
          // desktop: blob anchors are silent no-ops in the webview — the
          // platform's native save panel is the only route that produces a file
          if (window.SagePlatform && SagePlatform.saveBlob) {
            SagePlatform.saveBlob(filename, blob).then((r) => {
              if (r === 'saved') D.toast('Saved');
            });
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = el2('a', { href: url, download: filename });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        };
        const downloadSheet = () => saveBlob(new Blob([wbSetCsv(p.words, p.tiers)], { type: 'text/csv;charset=utf-8' }), 'word-bank-sheet.csv');
        const downloadSet = () => {
          if (!p.words.length) { D.toast('There are no words to save yet'); return; }
          // Sharing sets between teachers is the point, not a risk to manage
          // (Glenn, 2026-07-23: "This creates community") — so no nagging about
          // pictures. The one guard that stays is the set design's §9 nudge,
          // and only for what it was actually written to catch: a school's
          // phonics scheme wording travelling further than its licence does.
          D.promptDialog('Name this set — it travels with the file, pictures and all.', 'Word bank set', (name) => {
            const clean = String(name).replace(/\s+/g, ' ').trim().slice(0, 60) || 'Word bank set';
            if (!window.SageZip) { D.toast('Cannot build a set file here — zip.js did not load'); return; }
            // .zip, because the operating system has to know what this is. A
            // bespoke extension only produced "There is no application set to
            // open the document" — a dead end every time anyone double-clicks
            // (Glenn, 2026-07-24). "wordbank" stays in the name so the file
            // still says which widget it belongs to.
            saveBlob(window.SageZip.write(wbPackFiles(p, clean)), wbSlug(clean) + '.wordbank.zip');
          }, {
            label: 'Save',
            hint: 'Sharing beyond your own school? Use your own wording rather than your phonics scheme’s.',
          });
        };
        // multiple, so the sheet and its twenty pictures can be selected in
        // one go. What a file IS beats what it is called throughout, so a
        // renamed set still opens and a .zip full of sheets still reads.
        const fileIn = el2('input', {
          type: 'file', multiple: 'multiple', style: 'display:none;',
          accept: '.zip,.wordbank,.json,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,application/zip,application/json,text/plain,text/csv,image/*',
        });
        fileIn.addEventListener('change', () => {
          const files = [...(fileIn.files || [])];
          fileIn.value = '';
          if (!files.length) return;
          if (files.length === 1 && files[0].size > WB_FILE_MAX) { D.toast('That file is too big to open'); return; }
          openFiles(files);
        });
        // a folder picker as well: twenty pictures and a sheet is a folder,
        // and picking one is fewer clicks than selecting twenty-one files
        const folderIn = el2('input', { type: 'file', style: 'display:none;' });
        folderIn.setAttribute('webkitdirectory', '');
        folderIn.addEventListener('change', () => {
          const files = [...(folderIn.files || [])];
          folderIn.value = '';
          if (files.length) openFiles(files);
        });

        // the contact sheet: one image of every word's picture in a grid.
        // Words come in first (from a sheet, or typed); this fills their
        // pictures. onDone gets the tiles paired to p.words by index.
        const sliceIn = el2('input', { type: 'file', accept: '.png,.jpg,.jpeg,.gif,.webp,image/*', style: 'display:none;' });
        const onSliced = (assignments) => {
          for (const a of assignments) if (p.words[a.wordIndex]) p.words[a.wordIndex].img = a.img;
          wbFitSet(p.words, (out, dropped) => {
            D.save();
            api.refresh();
            D.toast(`${assignments.length} picture${assignments.length === 1 ? '' : 's'} added`
              + (dropped ? ` · ${dropped} too big to keep` : ''));
          });
        };
        sliceIn.addEventListener('change', () => {
          const f = sliceIn.files && sliceIn.files[0];
          sliceIn.value = '';
          if (f) wbOpenSlicer(f, p.words, onSliced);
        });

        const wordRow = (c) => el2('div', { class: 'wb-edrow' },
          el2('b', {}, c.w),
          el2('span', { class: 'wb-chips' }, ...[1, 2, 3].map((t) => el2('button', {
            class: 'wb-chip wb-t' + t + (c.tier === t ? ' active' : ''),
            title: p.tiers[t - 1] + ' — tap again to take it out of the lanes',
            onclick: (e) => {
              c.tier = c.tier === t ? null : t;
              D.save();
              for (const sib of e.currentTarget.parentNode.children) sib.classList.remove('active');
              if (c.tier === t) e.currentTarget.classList.add('active');
            },
          }, short(p.tiers[t - 1])))),
          el2('button', {
            class: 'wb-edpin' + (c.pin ? ' active' : ''), title: 'Pin as a favourite',
            onclick: (e) => { c.pin = !c.pin; D.save(); e.currentTarget.classList.toggle('active', c.pin); },
          }, '📌'),
          el2('button', { class: 'ws-edx', title: 'Remove this word', onclick: () => { p.words = p.words.filter((x) => x !== c); api.refresh(); } }, '×'));

        box.append(
          el2('div', { class: 'hint' }, 'Your three tier names — the middle lane is the one worth teaching explicitly, and the third is where science and history vocabulary lands. Leave one blank to put the standard name back.'),
          ...WB_TIER_DEFAULTS.map((def, i) => settingRow('Lane ' + (i + 1), el2('input', {
            class: 'text-input grow', value: p.tiers[i] || def, maxlength: '24', placeholder: def,
            onchange: (e) => { p.tiers[i] = wbLabel(e.target.value, i); api.refresh(); },
          }))),
          el2('div', { class: 'hint' }, `Words in this bank (${p.words.length}/${WB_CAP}) — tap a lane chip to tier a word:`),
          el2('div', { class: 'wb-edit' }, ...p.words.map(wordRow)),
          el2('div', { class: 'row' }, addInput, el2('button', { class: 'btn ghost small', onclick: addWord }, 'Add')),
          el2('div', { class: 'hint' }, 'Bring in a whole prepared bank rather than building it word by word. A set saves as an ordinary zip file (.wordbank.zip) with everything inside it, pictures and all — share one with your year group, or open one you have been sent. Double-click it like any zip to see what you have got: preview.html lays the whole set out with its photographs, no Sage Stage needed, and set.csv is the spreadsheet to edit. You can open a whole folder, or pick the sheet and its pictures together — no need to zip anything up yourself.'),
          el2('div', { class: 'hint' }, 'Building one with an AI: save the sheet, ask an AI to fill in the columns, then ask an image tool for a picture per word. Name each picture after its word and put them in a folder with the sheet. Numbers in front are fine — 01-look.png, 18-food-chain.png and Look.PNG all find their word.'),
          (() => {
            const promptText = 'I am making a vocabulary word bank for a primary class.\n\n'
              + 'First, fill in this spreadsheet for the topic and year group below. Keep every column, one row per word:\n'
              + 'word, picture, tier, meaning, sentence, action, home language, beats\n'
              + '· tier is Everyday words, Power words or Subject words — put the words worth teaching explicitly in Power words, and the topic vocabulary in Subject words\n'
              + '· meaning is child-friendly, one short line\n'
              + '· sentence shows the word in use, in the classroom or the topic\n'
              + '· action is a gesture the class can do\n'
              + '· home language: leave blank unless I tell you a language\n'
              + '· beats is the number of syllables\n'
              + '· picture: images/<word>.png\n\n'
              + 'Then give me an image prompt for each word, all in one consistent style:\n'
              + '"Simple vector illustration of [WORD], clean bold outlines, child-friendly, isolated on a plain white background, minimal detail, NO TEXT OR LETTERING IN THE IMAGE."\n'
              + '(No text in the picture — the card already prints the word underneath it.)\n\n'
              + 'Topic: \nYear group: \nNumber of words: ';
            const box = el2('textarea', { class: 'text-input wb-imp wb-promptbox', rows: '3', readonly: 'readonly', style: 'display:none;' });
            box.value = promptText;
            return el2('div', {},
              el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
                el2('button', {
                  class: 'btn small wb-act help',
                  title: 'Copy a ready-made prompt to paste into an AI, then add your topic at the bottom',
                  onclick: () => {
                    box.style.display = box.style.display === 'none' ? '' : 'none';
                    if (box.style.display === '') { box.select(); }
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(promptText).then(
                        () => D.toast('Prompt copied — paste it into your AI and add your topic'),
                        () => D.toast('Copy blocked — the prompt is selected below, copy it with ⌘C'),
                      );
                    } else {
                      D.toast('The prompt is selected below — copy it with ⌘C');
                    }
                  },
                }, 'Copy the AI prompt')),
              box);
          })(),
          impText,
          el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
            el2('button', { class: 'btn small wb-act in', onclick: () => fileIn.click() }, 'Open a set or sheet…'),
            el2('button', { class: 'btn small wb-act in', title: 'Pick the whole folder — the sheet and its pictures together', onclick: () => folderIn.click() }, 'Open a folder…'),
            el2('button', { class: 'btn small wb-act in', onclick: applyImport }, 'Import pasted sheet'),
            fileIn, folderIn),
          el2('div', { class: 'hint', style: 'margin-top:6px;' }, 'Got your pictures as one grid from an AI? Bring your words in first, then cut the grid into pictures here — it lines the tiles up with your words and you check them before they land.'),
          el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
            el2('button', {
              class: 'btn small wb-act in lead', title: 'Cut one contact-sheet image into a picture for each word',
              onclick: () => { if (!p.words.length) { D.toast('Add your words first, then cut up the picture sheet'); return; } sliceIn.click(); },
            }, 'Cut up a picture sheet…'),
            sliceIn),
          el2('div', { class: 'row', style: 'flex-wrap:wrap;' },
            el2('button', { class: 'btn small wb-act out', onclick: downloadSet }, 'Save set (with pictures)'),
            el2('button', { class: 'btn small wb-act out', onclick: downloadSheet }, 'Save sheet (no pictures)')),
          checkRow('Replace the bank (untick to add to it)', p.impReplace !== false, (v) => { p.impReplace = v; D.save(); }),
          el2('div', { class: 'hint' }, 'Importing never overwrites with nothing: a filled field updates the card, an empty one leaves what is there alone, and where a card sits on your board — and what you have pinned — is yours alone, never the file’s. Replacing keeps every word that is on the new set exactly as it stands and clears out the rest. Pictures from a set are re-sized to fit this machine, so a big download cannot fill up your storage. After an import you are told what to fix: which words are still without a picture, and which pictures matched no word.'),
          el2('div', { class: 'hint' }, 'Type a word into the bar and it lands on the board — nothing already there moves, because the layout is yours. Tap a card to pop it, tap again and it opens where it stands so the class can read what it means without losing the wall; 📖 opens it big for the picture, the beats to clap and the writing lines. Lanes sorts the same cards into your three tiers without disturbing the board. Drag a card to the bin to take it out.'),
        );
      },
    };

    // ---- sentence builder -------------------------------------------------
    // docs/sentence-builder-design.md §7. One track engine, five faces.
    // What the widget may claim about itself: manipulation, oral rehearsal
    // and staging — never writing-quality gains. No length affordances
    // anywhere: nothing here counts words or celebrates a longer sentence.
    WIDGETS.sentencebuilder = {
      title: 'Sentence builder', icon: 'sentencebuilder', accent: '#fbcfe8', w: 860, h: 620,
      defaults: () => ({
        mode: 'combine', stage: 'model', track: [], trackT: [], togSrc: '',
        tray: [], srcs: [], alts: [],
        year: null, terms: false, pace: 'steady', palette: 'sage',
        flagged: [], fixed: false, dealt: false, grown: false, dealtSrcs: [],
        roleEg: {}, bankTopic: '',
      }),
      mount(body, w) {
        body.classList.add('mntray', 'sbwidget');
        const p = w.props;
        // props may be years old or hand-imported: coerce everything
        p.mode = SB_MODES.includes(p.mode) ? p.mode : 'combine';
        p.stage = ['model', 'together', 'you'].includes(p.stage) ? p.stage : 'model';
        // ids are healed like wbSanitize's: an empty or shared id makes both
        // cards pop at once and lets binning one strip the other's flag
        const seenIds = new Set();
        const fixCards = (a, cap) => (Array.isArray(a) ? a : [])
          .map((c) => {
            if (!c || typeof c.t !== 'string') return null;
            const t = sbClean(c.t).slice(0, SB_CARD_MAX);
            if (!t) return null;
            let id = typeof c.id === 'string' && c.id && c.id.length <= 40 ? c.id : uid();
            if (seenIds.has(id)) id = uid();
            seenIds.add(id);
            return { id, t, k: c.k === 'p' ? 'p' : 'w', cap: !!c.cap, slot: SB_ROLES.some(([k]) => k === c.slot) ? c.slot : null };
          })
          .filter(Boolean)
          .slice(0, cap);
        p.track = fixCards(p.track, SB_TRACK_CAP);
        // Together's own line (V0.1 decision 3): the line faces keep one
        // track per stage so going back a step never costs the step —
        // Model's line is never touched by the class's rebuild. Roles and
        // fix-it keep the one shared board. togSrc remembers WHICH modelled
        // sentence seeded Together, so a stage flip only re-seeds when a
        // NEW sentence has been modelled.
        p.trackT = fixCards(p.trackT, SB_TRACK_CAP);
        // the cap must EXCEED any sbText the line can produce (24 cards ×
        // 28 chars + spaces ≈ 700): a togSrc truncated shorter than the
        // sentence it names would fail the re-seed comparison after every
        // remount and wipe the class's rebuild
        p.togSrc = typeof p.togSrc === 'string' ? sbClean(p.togSrc).slice(0, 800) : '';
        p.tray = fixCards(p.tray, SB_TRAY_CAP);
        // srcs are POSITIONAL in fix-it — 0 is "done right", 1 is "the broken
        // one" — so they are never compacted there: filter(Boolean) would
        // promote the broken sentence into the slot every panel reads as
        // correct, and the class would be shown the error as the model
        p.srcs = (Array.isArray(p.srcs) ? p.srcs : []).slice(0, 3).map((s) => sbClean(s).slice(0, SB_SRC_MAX));
        if (p.mode === 'fixit') {
          p.srcs = p.srcs.slice(0, 2);
          while (p.srcs.length && !p.srcs[p.srcs.length - 1]) p.srcs.pop();
        } else {
          p.srcs = p.srcs.filter(Boolean);
        }
        p.alts = (Array.isArray(p.alts) ? p.alts : []).map((s) => sbClean(s).slice(0, 160)).filter(Boolean).slice(0, SB_ALT_CAP);
        p.year = SB_YEARS.includes(p.year) ? p.year : null;
        p.palette = SB_PALETTES[p.palette] ? p.palette : 'sage';
        p.pace = PACE_MS[p.pace] ? p.pace : 'steady';
        p.terms = !!p.terms;
        // p.modelSnap is retired by the per-stage lines: the model IS the
        // reference view now, so the remembered-text strip has no job left
        delete p.modelSnap;
        p.dealt = !!p.dealt;   // fix-it's flag: the broken sentence is out
        p.grown = !!p.grown;   // expand's flag: the base sentence was dealt
        p.fixed = !!p.fixed;
        // empty-slot scaffolds: teacher topic words, ' · ' between examples
        const egIn = p.roleEg && typeof p.roleEg === 'object' ? p.roleEg : {};
        p.roleEg = {};
        for (const [rk] of SB_ROLES) {
          const v = typeof egIn[rk] === 'string' ? sbClean(egIn[rk]).slice(0, 80) : '';
          if (v) p.roleEg[rk] = v;
        }
        p.bankTopic = typeof p.bankTopic === 'string' ? p.bankTopic.slice(0, 40) : '';
        // flags only mean anything on cards that exist — pruning here is both
        // the cap and the cleanup, so a stale blob can never grow the store
        const liveIds = new Set([...p.track, ...p.trackT, ...p.tray].map((c) => c.id));
        p.flagged = (Array.isArray(p.flagged) ? p.flagged : []).filter((id) => typeof id === 'string' && liveIds.has(id));
        p.dealtSrcs = (Array.isArray(p.dealtSrcs) ? p.dealtSrcs : []).filter((i) => Number.isInteger(i) && i >= 0 && i < 3);
        // v30 migration: a deck saved mid-lesson in Together (one shared
        // line, no trackT) must not load looking wiped — seed Together's
        // copy from the shared track once. Only a v30 deck can be in this
        // state (v31 sets togSrc whenever it seeds), so the guard is exact.
        if (p.stage === 'together' && ['combine', 'expand', 'build'].includes(p.mode)
          && !p.trackT.length && p.track.length && !p.togSrc) {
          p.togSrc = sbText(p.track);
          p.trackT = p.track.map((c) => ({ id: uid(), t: c.t, k: c.k, cap: !!c.cap, slot: null }));
          save();
        }
        // expand starts with its plain sentence already on the line
        if (p.mode === 'expand' && p.srcs[0] && !p.grown && !p.track.length) {
          p.track = sbDeal(p.srcs[0]);
          p.grown = true;
          save();
        }

        let popId = null, dragging = false, dealing = false, lastW = 0, lastH = 0;
        let sayT = [], dealT = [], flyEls = [], sweepEl = null, lineEl = null, tilesEl = null, trayCardsEl = null;
        const cardEls = new Map();

        // ---- the four zones (V0.1 decision 1): reference rail · the
        // sentence slab · ONE waiting band · the bar. Dashes mean "drop
        // here" and nothing else.
        const mat = el('div', { class: 'sb-mat grow' });
        const band = el('div', { class: 'sb-tray' });
        // two docks at the right end of the waiting band, revealed only
        // while a card is in the air (V0.1 decision 7): +1 duplicates
        // (little words live many times in one sentence), the bin removes
        // for good. They sit OUTSIDE the cards row's scroll clip, so
        // scrolling can never turn either into an invisible drop zone.
        const dupEl = el('div', { class: 'sb-dock dup', title: 'Drop a card here for another copy' }, '+1');
        const binEl = el('div', { class: 'sb-dock bin', title: 'Drop a card here to bin it' }, '🗑');
        const docks = el('div', { class: 'sb-docks' }, dupEl, binEl);
        const qLeft = el('span', { class: 'sb-qleft' });
        // the add cluster is built ONCE and lives outside the repaint zone:
        // a rebuilt input loses focus AND caret mid-word, and every lost
        // focus costs a mouse click (the v27 house rule)
        const addInput = el('input', { class: 'text-input sb-add', placeholder: 'Type a word or phrase…', maxlength: String(SB_CARD_MAX) });
        const addWrap = el('span', { class: 'sb-addwrap' });
        const addChip = el('button', { class: 'btn ghost small sb-chip', title: 'Add your own word or phrase card' }, '+ card');
        const addCluster = el('span', { class: 'sb-addcluster' }, addChip, addWrap);
        const quick = el('div', { class: 'tclock-quick sb-quick' });
        quick.append(qLeft, addCluster);
        body.append(mat, band, quick);

        const commit = () => { save(); paint(); };
        // the ceremony lock: while Deal it back is walking cards to the
        // tray, every control is a spectator — same rule as the mock
        const guard = (fn) => (...a) => { if (dealing) return; fn(...a); };
        const yearOf = () => p.year || D.deck().yearGroup || '2';
        // the roles palette is a DECK setting: within-child consistency is
        // the one property the colours actually carry (PenCRU), so every
        // sentence builder a class sees must agree. p.palette survives only
        // as a legacy fallback for widgets made before this rule.
        const paletteOf = () => {
          const d = D.deck();
          if (SB_PALETTES[d.sbPalette]) return d.sbPalette;
          return SB_PALETTES[p.palette] ? p.palette : 'sage';
        };
        const roleSet = () => SB_ROLES.filter(([, , min]) => sbYearNum(min) <= sbYearNum(yearOf()));
        const placedInRole = (key) => p.track.filter((c) => c.slot === key);
        const isLineFace = () => p.mode === 'combine' || p.mode === 'expand' || p.mode === 'build';
        // the active line: Together works its own copy in the line faces;
        // roles and fix-it share the one board across stages
        const activeLine = () => (isLineFace() && p.stage === 'together' ? p.trackT : p.track);
        // reading order in roles mode is the slot order, not placement order
        const lineCards = () => (p.mode === 'roles' ? roleSet().flatMap(([key]) => placedInRole(key)) : activeLine());
        const sentenceNow = () => sbText(lineCards());

        // the word bank dock: a bank sharing THIS screen feeds the tray.
        // The widget's own id finds its screen exactly — deck.current can
        // point elsewhere while a pinned screen is being viewed.
        const bankWords = () => {
          const d = D.deck();
          const scr = (d.screens || []).find((s2) => (s2.widgets || []).some((x) => x && x.id === w.id));
          const wb = scr && (scr.widgets || []).find((x) => x && x.type === 'wordbank' && x.props && Array.isArray(x.props.words) && x.props.words.length);
          if (!wb) return [];
          return wb.props.words.map((c) => sbClean(c && c.w).slice(0, SB_CARD_MAX)).filter(Boolean).slice(0, 24);
        };

        // ---- say-it: oral rehearsal, word by word, then the blend sweep ----
        function stopSay() {
          for (const t of sayT) clearTimeout(t);
          sayT = [];
          mat.classList.remove('sb-talking');
          for (const n2 of mat.querySelectorAll('.sb-say')) n2.classList.remove('sb-say');
          if (sweepEl) sweepEl.classList.remove('run');
        }
        function sayIt() {
          if (dealing) return;
          stopSay();
          const seq = lineCards().filter((c) => c.k === 'w');
          if (!seq.length) { toast('Build a sentence first'); return; }
          nudgeEnd();
          const ms = PACE_MS[p.pace] || 1300;
          const hold = ms * 0.72;
          const setSay = (c, on) => { const e2 = cardEls.get(c.id); if (e2) e2.classList.toggle('sb-say', on); };
          mat.classList.add('sb-talking');
          seq.forEach((c, i) => {
            sayT.push(setTimeout(() => setSay(c, true), 200 + i * ms));
            sayT.push(setTimeout(() => setSay(c, false), 200 + i * ms + hold));
          });
          const sweepMs = Math.max(1200, seq.length * ms * 0.45);
          sayT.push(setTimeout(() => {
            if (!sweepEl) { stopSay(); return; }
            sweepEl.style.setProperty('--sweep-ms', sweepMs + 'ms');
            sweepEl.classList.add('run');
            seq.forEach((c, i) => {
              sayT.push(setTimeout(() => setSay(c, true), (i / seq.length) * sweepMs));
              sayT.push(setTimeout(() => setSay(c, false), Math.min(sweepMs, ((i + 1) / seq.length) * sweepMs)));
            });
            sayT.push(setTimeout(stopSay, sweepMs + 250));
          }, 200 + seq.length * ms + 400));
        }
        // the no-full-stop nudge: the punctuation row hops — nothing blocks
        function nudgeEnd() {
          const cards = lineCards();
          const last = cards[cards.length - 1];
          const done = last && last.k === 'p' && ['.', '!', '?'].includes(last.t);
          if (!done && cards.length && tilesEl) {
            tilesEl.classList.remove('sb-nudge');
            void tilesEl.offsetWidth;
            tilesEl.classList.add('sb-nudge');
          }
        }

        const addToLine = (c) => {
          const L = activeLine();
          if (L.length >= SB_TRACK_CAP) { toast('That’s a long sentence — say it, keep it, or clear the line'); return false; }
          L.push(c);
          return true;
        };
        const keep = () => {
          const s = sentenceNow();
          if (!s) { toast('Build a sentence first'); return; }
          if (p.alts.length >= SB_ALT_CAP) { toast('Four to compare is plenty — let one go to keep another'); return; }
          nudgeEnd();
          p.alts.push(s.slice(0, 160));
          commit();
        };
        // ---- Deal it back: Together's move, now a watchable ceremony ----
        // (V0.1 decision 4). The data moves FIRST — save, no paint — so a
        // remount mid-ceremony can never lose a card. The animation then
        // walks the STALE DOM: words peel off in reading order ~320ms apart
        // and fly to the tray, shrinking as they land; punctuation fades
        // (its tiles are already out). Cap-aware — overflow words STAY on
        // the line, the same never-silently-delete rule as drops. The bar
        // is locked (guard) until the last card lands.
        const stopDeal = () => {
          for (const t of dealT) clearTimeout(t);
          dealT = [];
          for (const f of flyEls) f.remove();
          flyEls = [];
          dealing = false;
        };
        function dealBack() {
          // both locks: a ceremony must not start under a held card (a
          // second finger on a whiteboard), and never twice
          if (dealing || dragging) return;
          stopSay(); // a running chant must not highlight cards mid-flight
          const src = (p.mode === 'roles' ? lineCards() : p.trackT).slice();
          if (!src.length) { toast('Build a sentence first — then hand it over'); return; }
          const words = src.filter((c) => c.k === 'w');
          const room = Math.max(0, SB_TRAY_CAP - p.tray.length);
          const moved = words.slice(0, room);
          const movedIds = new Set(moved.map((c) => c.id));
          const fadeIds = new Set(src.filter((c) => c.k === 'p').map((c) => c.id));
          const strip = (a) => a.filter((c) => !movedIds.has(c.id) && !fadeIds.has(c.id));
          if (p.mode === 'roles') p.track = strip(p.track);
          else p.trackT = strip(p.trackT);
          for (const c of moved) { c.slot = null; p.tray.push(c); }
          if (words.length > moved.length) toast('The tray is full — some tiles stayed on the line');
          popId = null;
          save();
          const done = () => {
            stopDeal();
            paint();
            toast(p.mode === 'roles' ? 'The class rebuilds the slots from the tray.' : 'The class rebuilds it from the tray — flip to Model any time to peek.');
          };
          if (matchMedia('(prefers-reduced-motion: reduce)').matches || !moved.length) { done(); return; }
          dealing = true;
          // landing pads: hidden clones in the tray row reserve each card's
          // place, revealed as its flyer arrives
          const oldHint = trayCardsEl && trayCardsEl.querySelector('.sb-linehint');
          if (oldHint) oldHint.remove();
          const pads = new Map();
          for (const c of moved) {
            const pad = el('button', { class: 'sb-card' + (c.k === 'p' ? ' sb-p' : '') + (c.k === 'w' && SB_ALL_JOINS.has(c.t.toLowerCase()) ? ' sb-join' : ''), style: 'visibility:hidden;' }, sbShow(c));
            if (trayCardsEl) trayCardsEl.append(pad);
            pads.set(c.id, pad);
          }
          let i = 0;
          const step = () => {
            if (i >= src.length) { dealT.push(setTimeout(done, 520)); return; }
            const c = src[i];
            const elc = cardEls.get(c.id);
            i++;
            if (elc && fadeIds.has(c.id)) {
              elc.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
              elc.style.opacity = '0';
              elc.style.transform = 'scale(0.5)';
            } else if (elc && movedIds.has(c.id) && pads.get(c.id)) {
              const pad = pads.get(c.id);
              const from = elc.getBoundingClientRect();
              // the tray row is a scroll clip: bring the pad into view
              // BEFORE measuring, or the flyer aims at a clipped position
              // and visibly lands outside the tray
              pad.scrollIntoView({ block: 'nearest' });
              const to = pad.getBoundingClientRect();
              const fly = elc.cloneNode(true);
              fly.classList.remove('sb-popped', 'sb-flag', 'sb-say');
              fly.classList.add('sb-fly');
              for (const m of fly.querySelectorAll('.sb-mini')) m.remove(); // a popped card's bubbles must not fly with it
              fly.style.left = from.left + 'px';
              fly.style.top = from.top + 'px';
              fly.style.fontSize = getComputedStyle(elc).fontSize;
              fly.style.transition = 'left 0.48s cubic-bezier(.5,.08,.35,1), top 0.48s cubic-bezier(.5,.08,.35,1), font-size 0.48s ease';
              document.body.append(fly);
              flyEls.push(fly);
              elc.style.visibility = 'hidden';
              const endFont = getComputedStyle(pad).fontSize;
              requestAnimationFrame(() => requestAnimationFrame(() => {
                fly.style.left = to.left + 'px';
                fly.style.top = to.top + 'px';
                fly.style.fontSize = endFont;
              }));
              dealT.push(setTimeout(() => { fly.remove(); flyEls = flyEls.filter((f) => f !== fly); pad.style.visibility = ''; }, 500));
            }
            dealT.push(setTimeout(step, 320));
          };
          step();
        }
        const addCard = () => {
          if (dealing) return;
          const t = sbClean(addInput.value);
          if (!t) return;
          const c = sbNewCard(t, 'w');
          if (p.mode === 'roles') {
            if (p.tray.length >= SB_TRAY_CAP) { toast('The tray is full — bin a card to make room'); return; }
            p.tray.push(c);
          } else if (!addToLine(c)) return;
          addInput.value = '';
          commit();
          addInput.focus();
        };
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCard(); });
        addWrap.append(addInput, el('button', { class: 'btn ghost small', onclick: addCard }, 'Add'));
        // opens on the chip, closes only on click-away; focusout ignores
        // moves WITHIN the cluster so the Add button's click can land
        addChip.addEventListener('click', () => {
          if (dealing) return;
          const opening = !addWrap.classList.contains('open');
          addWrap.classList.toggle('open', opening);
          if (opening) setTimeout(() => addInput.focus(), 0);
        });
        addCluster.addEventListener('focusout', (e) => {
          if (!e.relatedTarget || !addCluster.contains(e.relatedTarget)) addWrap.classList.remove('open');
        });

        // ---- drag: magnet feel (V0.1 decision 6) — dimmed shadow at the
        // origin, ghost on the finger, teal caret for the landing gap, lit
        // slot or tray under it. The docks are rect-tested: the ghost rides
        // under the finger, so elementFromPoint alone can be fooled at
        // their edges, and a hidden dock must still catch its drop.
        function dragCard(elc, c, e0, origin) {
          if (dragging || dealing) return; // a second finger must not start a second drag
          if (p.stage === 'you') return;
          e0.preventDefault();
          const pid = e0.pointerId;
          const x0 = e0.clientX, y0 = e0.clientY;
          let moved = false, ghost = null;
          dragging = true;
          const caret = el('span', { class: 'sb-caret' });
          const overRect = (elx, ev) => {
            if (!elx) return false;
            const b = elx.getBoundingClientRect();
            return ev.clientX >= b.left - 8 && ev.clientX <= b.right + 8 && ev.clientY >= b.top - 8 && ev.clientY <= b.bottom + 8;
          };
          const target = (ev) => {
            // dup is tested FIRST: the padded rects overlap in the gap
            // between the docks, and an ambiguous drop should copy
            // (harmless) rather than delete
            if (overRect(dupEl, ev)) return { kind: 'dup' };
            if (overRect(binEl, ev)) return { kind: 'bin' };
            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!under) return null;
            const slot = under.closest('.sb-slot');
            if (slot && mat.contains(slot)) return { kind: 'slot', key: slot.dataset.role };
            if (lineEl && under.closest('.sb-line') === lineEl) return { kind: 'line' };
            if (trayCardsEl && under.closest('.sb-cards') === trayCardsEl) return { kind: 'tray' };
            return body.contains(under) ? { kind: 'body' } : null;
          };
          const setHot = (t) => {
            for (const s of mat.querySelectorAll('.sb-slot.hot')) s.classList.remove('hot');
            if (t && t.kind === 'slot') {
              const s = mat.querySelector('.sb-slot[data-role="' + t.key + '"]');
              if (s) s.classList.add('hot');
            }
            if (trayCardsEl) trayCardsEl.classList.toggle('hot', !!t && t.kind === 'tray' && origin !== 'tray');
            binEl.classList.toggle('hot', !!t && t.kind === 'bin');
            dupEl.classList.toggle('hot', !!t && t.kind === 'dup');
          };
          // insertion index among the line's cards: row first, then midpoint
          const lineIdx = (ev) => {
            const kids = [...lineEl.querySelectorAll('.sb-card')].filter((k) => k !== elc);
            let idx = kids.length;
            for (let i = 0; i < kids.length; i++) {
              const r = kids[i].getBoundingClientRect();
              if (ev.clientY < r.top - 4) { idx = i; break; }
              if (ev.clientY <= r.bottom + 4 && ev.clientX < r.left + r.width / 2) { idx = i; break; }
            }
            return { idx, kids };
          };
          const move = (ev) => {
            if (ev.pointerId !== pid) return;
            if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
            if (!moved) {
              moved = true;
              ghost = elc.cloneNode(true);
              ghost.classList.add('ws-ghost');
              for (const m of ghost.querySelectorAll('.sb-mini')) m.remove(); // the finger ghost is the card, not its popped bubbles
              ghost.style.fontSize = getComputedStyle(elc).fontSize;
              document.body.append(ghost);
              elc.classList.add('ws-lift');
              mat.classList.add('ct-dragging');
              body.classList.add('ct-dragging'); // the bin hangs off the body, not the scrolling mat
            }
            ghost.style.left = ev.clientX + 'px';
            ghost.style.top = ev.clientY + 'px';
            const t = target(ev);
            if (t && t.kind === 'line') {
              const { idx, kids } = lineIdx(ev);
              if (idx >= kids.length) lineEl.append(caret);
              else lineEl.insertBefore(caret, kids[idx]);
            } else caret.remove();
            setHot(t);
            ghost.classList.toggle('ct-out', !t || t.kind === 'body');
          };
          const up = (ev) => {
            if (ev.pointerId !== pid) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            dragging = false;
            // read the drop position BEFORE any chrome changes: removing
            // the caret reflows the line, and un-hiding happens only after
            // the hit-test — a dock must catch a drop while still on screen
            const t = ev.type === 'pointercancel' ? { kind: 'body' } : target(ev);
            const drop = t && t.kind === 'line' ? lineIdx(ev) : null;
            caret.remove();
            if (ghost) ghost.remove();
            elc.classList.remove('ws-lift');
            mat.classList.remove('ct-dragging');
            body.classList.remove('ct-dragging');
            setHot(null);
            // a ceremony that started under this drag owns the board now —
            // the drop must not mutate state or repaint over its pads
            if (dealing) return;
            // a CANCELLED gesture (palm rejection, system swipe) must not
            // count as a tap — placing a card the teacher never tapped
            if (!moved) { if (ev.type !== 'pointercancel') tapCard(c, origin); return; }
            // remember where the card came from: when a destination is full
            // it goes back exactly there, never silently over a cap that the
            // next remount would truncate — deleting a card the teacher placed
            const fromTrack = p.track.includes(c);
            const fromTrackT = p.trackT.includes(c);
            const fromSlot = c.slot;
            const pull = () => {
              p.track = p.track.filter((x) => x !== c);
              p.trackT = p.trackT.filter((x) => x !== c);
              p.tray = p.tray.filter((x) => x !== c);
            };
            const putBack = () => {
              c.slot = fromSlot;
              if (fromTrack) p.track.push(c);
              else if (fromTrackT) p.trackT.push(c);
              else p.tray.push(c);
            };
            // a missed drop snaps home — only the bin dock deletes, never
            // the empty air around the widget (V0.1: dashes and docks are
            // the only drop meanings)
            if (!t || t.kind === 'body') { paint(); return; }
            if (t.kind === 'bin') {
              pull();
              if (popId === c.id) popId = null;
              p.flagged = p.flagged.filter((x) => x !== c.id);
            } else if (t.kind === 'dup') {
              // +1: a copy lands in the tray, the original snaps home —
              // "the" and "had" live many times in one sentence
              if (p.tray.length >= SB_TRAY_CAP) toast('The tray is full — bin a card to make room');
              else p.tray.push({ id: uid(), t: c.t, k: c.k, cap: false, slot: null });
            } else if (t.kind === 'line') {
              pull();
              c.slot = null;
              const L = activeLine();
              if (L.length >= SB_TRACK_CAP) { toast('That’s a long sentence — say it, keep it, or clear the line'); putBack(); }
              else L.splice(Math.min(drop ? drop.idx : L.length, L.length), 0, c);
            } else if (t.kind === 'slot') {
              pull();
              if (p.track.length >= SB_TRACK_CAP) {
                // the board cap counts the line faces' sentence too (one
                // shared track) — invisible here, so the toast must say
                // where the room went or the teacher is refused by a
                // board that looks empty
                const hidden = p.track.filter((x) => !x.slot).length;
                toast(hidden ? 'The board is full — the sentence on the line faces counts too. Clear the line in ⚙ or bin cards.' : 'That’s a full board of cards — bin one to make room');
                putBack();
              } else { c.slot = t.key; p.track.push(c); }
            } else if (t.kind === 'tray') {
              pull();
              if (p.tray.length >= SB_TRAY_CAP) { toast('The tray is full — bin a card to make room'); putBack(); }
              else { c.slot = null; p.tray.push(c); }
            }
            commit();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }
        // a tap on a tray card PLACES it (the whiteboard tempo rule: the
        // common act is one touch); a tap on a line card opens its options
        function tapCard(c, origin) {
          if (dealing) return;
          if (origin === 'tray' && p.mode !== 'roles') {
            if (!addToLine(c)) return;
            p.tray = p.tray.filter((x) => x !== c);
            commit();
            return;
          }
          popId = popId === c.id ? null : c.id;
          paint();
        }

        function mountCard(c, origin) {
          const isJoin = c.k === 'w' && SB_ALL_JOINS.has(c.t.toLowerCase());
          const elc = el('button', {
            class: 'sb-card' + (c.k === 'p' ? ' sb-p' : '') + (isJoin ? ' sb-join' : '')
              + (popId === c.id ? ' sb-popped' : '')
              + (p.mode === 'fixit' && p.flagged.includes(c.id) ? ' sb-flag' : ''),
            title: origin === 'tray' && p.mode !== 'roles' ? 'Tap to put it on the line · drag to place it' : 'Tap for options · drag to move',
          }, sbShow(c));
          if (popId === c.id) {
            // minis are spans (a button cannot nest in the card button),
            // so they carry the button role and a keyboard path themselves;
            // guarded against BOTH locks — a second finger mid-drag would
            // repaint under the held card
            const mini = (cls, title, label, act) => {
              const m = el('span', {
                class: 'sb-mini ' + cls, title, role: 'button', tabindex: '0', 'aria-label': title,
                onpointerdown: (e) => { e.stopPropagation(); e.preventDefault(); if (dealing || dragging) return; act(); },
                onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); if (dealing || dragging) return; act(); } },
              }, label);
              return m;
            };
            if (c.k === 'w') {
              elc.append(mini('cap', 'Flip the capital letter', 'aA', () => { c.cap = !c.cap; commit(); }));
            }
            if (p.mode === 'fixit') {
              elc.append(mini('flagb', 'Mark this as where the problem is', '⚑', () => {
                p.flagged = p.flagged.includes(c.id) ? p.flagged.filter((x) => x !== c.id) : [...p.flagged, c.id];
                commit();
              }));
            }
            // × takes a card OFF THE LINE, back to the tray — only the bin
            // dock deletes (the mock's rule). Punctuation just goes: its
            // tiles are already out. A tray card's × does delete: it is
            // already off the line, so "out" can only mean gone.
            elc.append(mini('x', origin === 'tray' ? 'Take this card out' : 'Send this card back to the tray', '×', () => {
              if (origin !== 'tray' && c.k === 'w') {
                if (p.tray.length >= SB_TRAY_CAP) { toast('The tray is full — bin a card to make room'); return; }
                p.track = p.track.filter((x) => x !== c);
                p.trackT = p.trackT.filter((x) => x !== c);
                c.slot = null;
                p.tray.push(c);
              } else {
                p.track = p.track.filter((x) => x !== c);
                p.trackT = p.trackT.filter((x) => x !== c);
                p.tray = p.tray.filter((x) => x !== c);
              }
              p.flagged = p.flagged.filter((x) => x !== c.id);
              popId = null;
              commit();
            }));
          }
          elc.addEventListener('pointerdown', (e) => dragCard(elc, c, e, origin));
          cardEls.set(c.id, elc);
          return elc;
        }

        // the mode seg carries the scheme's plain-word subtitles and the
        // INK level of the colour grammar: the active face is solid ink,
        // because "which face am I on" outranks every tool on the bar
        const modeSeg = (set2) => el('span', { class: 'tq-step ft-seg sb-modeseg' }, ...SB_MODE_PILLS.map(([id, label, sub, tip]) => el('button', {
          class: 'tq-btn' + (p.mode === id ? ' active' : ''), title: tip,
          onclick: guard(() => { if (p.mode !== id) set2(id); }),
        }, label, el('span', { class: 'sb-turn' }, sub))));
        // the stage seg is its own builder: each pill carries its turn AND
        // its traffic-light colour (red watch me / amber we build / green
        // go) — the declared turn is the whole visible difference between
        // Model and Together, and the class is already conditioned on the
        // lights. docs/sentence-builder-design.md stage notes.
        const SB_STAGES = [
          ['model', 'Model', 'I do — think aloud as you build', 'my turn'],
          ['together', 'Together', 'We do — the class calls, you place', 'our turn'],
          ['you', 'Over to you', 'You do — say it, write it, check it', 'your turn'],
        ];
        const stageSeg = (set2) => el('span', { class: 'tq-step ft-seg sb-stageseg' }, ...SB_STAGES.map(([id, label, tip, sub]) => el('button', {
          class: 'tq-btn sb-st-' + id + (p.stage === id ? ' active' : ''), title: tip,
          onclick: guard(() => { if (p.stage !== id) set2(id); }),
        }, label, el('span', { class: 'sb-turn' }, sub))));

        // dealt-ness is per SOURCE, never per word: 'The dog barked' and
        // 'The cat hissed' must yield two 'the' cards, because the combined
        // sentence needs both and nearly every real pair shares the/a/it.
        // Only a repeat tap of the SAME source is a no-op.
        const dealSrc = (s, i) => {
          if (p.dealtSrcs.includes(i)) { toast('That sentence is already out — its cards are in the tray'); return; }
          // all-or-nothing: a partial deal re-dealt after making room would
          // duplicate the words that fit the first time
          const words = sbDeal(s).filter((c) => c.k === 'w'); // words only — the punctuation tiles are already out
          if (p.tray.length + words.length > SB_TRAY_CAP) { toast('Not enough room in the tray — bin some cards first'); return; }
          for (const c of words) p.tray.push(c);
          p.dealtSrcs.push(i);
          commit();
        };

        function paintHandoff() {
          // the whole point of this stage: the widget goes quiet and the
          // writing starts. Fix-it hands off on the CORRECTED sentence —
          // the mended shape is the last thing the class sees.
          // fallback order: the class's rebuild, then the modelled line,
          // then the last kept sentence — never a scold when one exists.
          // The rebuild only leads while it belongs to the CURRENT model
          // (togSrc says which sentence seeded it): after a new sentence
          // is modelled, a stale rebuild must not front the handoff.
          const cur = sbText(p.track);
          const rebuilt = isLineFace() && p.trackT.length && (!cur || cur === p.togSrc) ? sbText(p.trackT) : '';
          const s = p.mode === 'fixit' ? (p.srcs[0] || sentenceNow()) : (rebuilt || sbText(p.mode === 'roles' ? lineCards() : p.track) || p.alts[p.alts.length - 1] || '');
          const stems = p.mode === 'combine' ? p.srcs : [];
          mat.append(el('div', { class: 'sb-handoff' },
            el('div', { class: 'sb-cue' }, 'Over to you'),
            s ? el('div', { class: 'sb-big' }, s) : el('div', { class: 'sb-cue' }, 'Build a sentence together first — then hand it over.'),
            ...(p.alts.length ? [el('div', { class: 'sb-alts' }, ...p.alts.map((a) => el('div', { class: 'sb-alt quiet' }, a)))] : []),
            ...(stems.length ? [el('div', { class: 'sb-stems' }, el('span', { class: 'sb-cue' }, 'Your starters:'), ...stems.map((x) => el('div', { class: 'sb-src quiet' }, el('span', { class: 'grow' }, x)))) ] : []),
            el('div', { class: 'sb-steps' }, ...['Say yours out loud', 'Write it', 'Check with your talk partner'].map((t, i) =>
              el('span', { class: 'sb-step' }, el('b', {}, String(i + 1)), t))),
          ));
        }

        function paint() {
          stopSay();
          cardEls.clear();
          // the teacher's scroll position survives the rebuild — every tap
          // commits, and snapping the view to the top on each one would move
          // the screen the teacher chose (the spatial-stability rule)
          const keepScroll = mat.scrollTop;
          const keepTrayScroll = trayCardsEl ? trayCardsEl.scrollTop : 0; // the tray row scrolls too — same spatial-stability rule
          mat.innerHTML = '';
          band.innerHTML = '';
          qLeft.innerHTML = '';
          sweepEl = lineEl = tilesEl = trayCardsEl = null;
          body.classList.toggle('sb-terms', !!p.terms);
          const yg = yearOf();
          // board-scale type (V0.1 decision 2): the CAP itself grows with
          // the widget — a board-sized widget wants 60px targets, not a
          // phone floor. Small widgets keep today's 30px ceiling.
          // An EMPTY board holds a moderate base instead of ballooning to
          // the cap: the empty-state chars fallback used to blow the type
          // (and everything em-sized on it — hints, slot scaffolds, the
          // baseline rows) up to maximum, so every mode's empty face
          // shouted at a different height and roles overflowed into a
          // scroll. Quiet until there are words to be big about.
          const capPx = clamp(Math.round(body.clientWidth / 20), 30, 64);
          const chars = lineCards().reduce((n2, c) => n2 + c.t.length + 1, 0);
          mat.style.setProperty('--sb-fs', (chars
            ? clamp((body.clientWidth * 0.86) / Math.max(chars * 0.6, 10), 15, capPx)
            : Math.min(34, capPx)) + 'px');

          // the bar is TWO deliberate rows, not one accidental wrap (flex
          // order + a full-width break): faces + act buttons on the first,
          // whose-turn + the voice on the second. The act cluster keeps the
          // same right-hand corner on any width.
          const mseg = modeSeg((m) => {
            const prev = p.mode;
            if (prev === 'fixit' && p.dealt && !p.fixed) toast('Show it fixed first — the mended sentence is the one to leave on screen');
            p.mode = m;
            popId = null;
            if (m === 'expand' && p.srcs[0] && !p.grown && !p.track.length) { p.track = sbDeal(p.srcs[0]); p.grown = true; }
            // ARRIVING in fix-it always restarts its ceremony — the ceremony
            // IS read-it-right-first, and dealt/fixed left behind by another
            // mode would skip it. A mend interrupted by a reload still
            // resumes: remounts go through mount(), which never resets.
            if (m === 'fixit' && prev !== 'fixit') { p.dealt = false; p.fixed = false; p.flagged = []; }
            commit();
          });
          mseg.style.order = '1';
          const sseg = stageSeg((s2) => {
            if (s2 === 'you' && p.mode === 'fixit' && p.dealt && !p.fixed) { p.fixed = true; p.flagged = []; } // handing off IS the fix reveal — and the reveal clears the flags (closing-image rule)
            // Together opens holding a COPY of the modelled sentence — and
            // re-seeds only when a NEW sentence has been modelled, so a
            // half-rebuilt line survives any amount of flipping back to
            // peek (V0.1: going back a step must never cost the step)
            if (s2 === 'together' && isLineFace()) {
              const cur = sbText(p.track);
              if (cur && cur !== p.togSrc) {
                p.trackT = p.track.map((c2) => ({ id: uid(), t: c2.t, k: c2.k, cap: !!c2.cap, slot: null }));
                p.togSrc = cur;
              }
            }
            p.stage = s2;
            popId = null;
            commit();
          });
          sseg.style.order = '6';
          qLeft.append(
            mseg,
            el('span', { class: 'sb-qgap', style: 'order:2;' }),
            el('span', { class: 'sb-qbreak', style: 'order:5;' }),
            sseg,
          );

          addCluster.classList.toggle('hidden', p.stage === 'you');
          // the handoff quietens the whole screen: the waiting band leaves
          // too, not just its contents — an empty strip is still a strip
          band.style.display = p.stage === 'you' ? 'none' : '';
          if (p.stage === 'you') { paintHandoff(); mat.scrollTop = keepScroll; return; }

          // beats ARM, Say it FIRES (V0.1 decision 5): the pace pills only
          // set the beat — "are you ready for Fluent now?" is the cue, and
          // the wait is deliberate. Only the teal button plays; changing
          // the beat mid-chant stops the chant. No audio: the teacher
          // voices it. Each beat pill carries its own plain-word sub —
          // the same two-line language as every other pill on the bar, so
          // no orphaned "beat" label doing the explaining from outside.
          const SB_PACE_TIPS = {
            slow: 'New — first time: slow beat, the class echoes each word',
            steady: 'Practising — the class says it with you, getting quicker',
            brisk: 'Fluent — say it like talking, then the sweep blends it',
          };
          const SB_PACE_SUBS = { slow: 'slow beat', steady: 'steady beat', brisk: 'like talking' };
          const say = el('span', { class: 'tq-step ft-seg sb-sayseg', title: 'Set the beat, then press Say it — word by word, then the blend along the sweep' },
            ...PACES.map(([id, label]) => el('button', {
              class: 'tq-btn' + (p.pace === id ? ' active' : ''), title: SB_PACE_TIPS[id],
              onclick: guard(() => { stopSay(); p.pace = id; save(); paint(); }),
            }, label, el('span', { class: 'sb-turn' }, SB_PACE_SUBS[id]))),
            el('button', { class: 'tq-btn sb-go', title: 'Play the beat: each word takes the light, then the sweep blends the sentence', onclick: guard(sayIt) }, '🗣 Say it'));
          say.style.order = '8';
          qLeft.append(el('span', { class: 'sb-qgap', style: 'order:7;' }), say);
          // the act cluster: one span, order 3, always the bar's right corner
          const leads = el('span', { class: 'sb-leads', style: 'order:3;' });
          qLeft.append(leads);
          if (p.mode === 'fixit') {
            if (p.srcs[0] && p.srcs[1] && !p.dealt) {
              leads.append(el('button', {
                class: 'btn small sb-lead', title: 'The class has read it right — now bring in the one that needs mending',
                onclick: guard(() => { p.track = sbDeal(p.srcs[1]); p.dealt = true; p.fixed = false; p.flagged = []; popId = null; commit(); }),
              }, 'Bring in the broken one'));
            } else if (p.dealt && !p.fixed) {
              // the reveal clears the flags too: gold look-here rings must not
              // go on glowing under the Fixed banner (the closing-image rule)
              leads.append(el('button', { class: 'btn small sb-lead', title: 'End on the mended sentence — never on the error', onclick: guard(() => { p.fixed = true; p.flagged = []; commit(); }) }, '✓ Show it fixed'));
            } else if (p.fixed) {
              leads.append(el('button', {
                class: 'btn ghost small', title: 'Run the same mend again',
                onclick: guard(() => { p.dealt = false; p.fixed = false; p.flagged = []; p.track = []; popId = null; commit(); }),
              }, '↺ Do it again'));
            }
          } else {
            // the walking lead: ONE solid teal button that walks the lesson
            // — ↓ Deal a sentence (combine's empty start) → ✓ Keep →
            // ↩ Deal it back (Together). When Deal it back leads, Keep
            // goes ghost: solid teal means "press to act", one at a time.
            const undealt = p.srcs.findIndex((s2, i) => s2 && !p.dealtSrcs.includes(i));
            if (p.stage === 'together' && lineCards().length) {
              leads.append(el('button', {
                class: 'btn small sb-lead', title: 'Return the tiles to the tray — the class rebuilds the sentence from memory; your model waits on the red pill',
                onclick: guard(dealBack),
              }, '↩ Deal it back'));
              leads.append(el('button', { class: 'btn small sb-leadghost', title: 'Keep this sentence to compare — then build it another way', onclick: guard(keep) }, '✓ Keep'));
            } else if (p.mode === 'combine' && p.stage === 'model' && !activeLine().length && !p.tray.length && undealt !== -1) {
              leads.append(el('button', {
                class: 'btn small sb-lead', title: 'Deal this sentence’s words into the tray',
                onclick: guard(() => dealSrc(p.srcs[undealt], undealt)),
              }, '↓ Deal a sentence'));
            } else {
              const hasSentence = !!sentenceNow();
              leads.append(el('button', { class: 'btn small ' + (hasSentence ? 'sb-lead' : 'sb-leadghost'), title: 'Keep this sentence to compare — then build it another way', onclick: guard(keep) }, '✓ Keep'));
            }
          }

          // ---- reference rail: only on screen when it has something to
          // show — sources, prompts, kept sentences, fix-it's strips ----
          const rail = el('div', { class: 'sb-rail' });
          if (p.mode === 'combine') {
            const live = p.srcs.map((s2, i) => [s2, i]).filter(([s2]) => s2); // fixit-shaped ['', x] must not render an empty chip
            if (live.length) {
              rail.append(el('div', { class: 'sb-srcs' }, ...live.map(([s2, i]) => el('button', {
                class: 'sb-src' + (p.dealtSrcs.includes(i) ? ' dealt' : ''), title: 'Deal this sentence’s words into the tray',
                onclick: guard(() => dealSrc(s2, i)),
              }, el('span', { class: 'grow' }, s2), el('small', {}, p.dealtSrcs.includes(i) ? '✓ out' : '↓ deal')))));
            } else {
              rail.append(el('div', { class: 'sb-ghosthint' }, 'Put two short sentences in ⚙ — or pick a topic from its sentence banks.'));
            }
          }
          if (p.mode === 'expand') {
            if (p.srcs[0]) rail.append(el('div', { class: 'sb-src quiet' }, el('span', { class: 'grow' }, p.srcs[0]), el('small', {}, 'our sentence')));
            const prompts = SB_PROMPTS.filter(([min]) => sbYearNum(min) <= sbYearNum(yg));
            if (prompts.length) {
              rail.append(el('div', { class: 'sb-prompts' }, ...prompts.map(([, q, term]) => el('span', { class: 'sb-prompt' }, q,
                p.terms ? el('span', { class: 'sb-term' }, term) : null))));
            }
          }
          if (p.mode === 'fixit') {
            if (!p.srcs[0] || !p.srcs[1]) {
              rail.append(el('div', { class: 'sb-ghosthint' }, 'Set it up in ⚙ — the sentence done right first, then the broken version.'));
            } else if (!p.dealt) {
              rail.append(el('div', { class: 'sb-model' }, el('small', {}, 'Read it right first:'), el('span', {}, p.srcs[0])));
            } else if (!p.fixed && !p.flagged.length) {
              // the flag lives behind tap-to-pop, so the live flow cues it —
              // otherwise the default is exactly the unaided hunt §4 forbids
              rail.append(el('div', { class: 'sb-ghosthint' }, 'Show them where: tap the card with the problem, then ⚑.'));
            }
          }
          if (p.alts.length && p.mode !== 'fixit') {
            rail.append(el('div', { class: 'sb-alts' }, ...p.alts.map((s2, i) => el('div', { class: 'sb-alt' },
              el('span', { class: 'grow' }, s2),
              el('button', { class: 'sb-altx', title: 'Let this one go', onclick: guard(() => { p.alts.splice(i, 1); commit(); }) }, '×')))));
          }
          if (rail.childNodes.length) mat.append(rail);

          // ---- the sentence slab: the upper zone, the work itself ----
          const slab = el('div', { class: 'sb-slab' });
          if (p.mode === 'roles') {
            const pal = SB_PALETTES[paletteOf()];
            // a shrunk year window must not orphan cards: a card whose slot
            // is no longer shown drops back to the tray where the class can
            // see it. When the tray is FULL the card stays put in its
            // hidden slot — invisible but safe beats deleted (it comes back
            // when the year returns, or moves on a later paint when room
            // frees up). Mutations here must save: paint alone leaves the
            // move in memory only.
            const keys = new Set(roleSet().map(([k]) => k));
            let orphanMoved = 0, orphanHeld = 0;
            for (const c of [...p.track]) {
              if (c.slot && !keys.has(c.slot)) {
                if (p.tray.length < SB_TRAY_CAP) {
                  c.slot = null;
                  p.track = p.track.filter((x) => x !== c);
                  p.tray.push(c);
                  orphanMoved++;
                } else orphanHeld++;
              }
            }
            if (orphanMoved) {
              save();
              if (orphanHeld) toast('The tray is full — some cards are waiting in hidden slots until there’s room');
            }
            const readout = sentenceNow();
            slab.append(el('div', { class: 'sb-readout' + (readout ? '' : ' empty') }, readout || 'Fill the slots — the sentence reads itself along here'));
            slab.append(el('div', { class: 'sb-slots' }, ...roleSet().map(([key, q]) => {
              const cards = placedInRole(key);
              // an empty slot scaffolds (V0.1 decision 11): topic examples
              // in ghost grey — the shape of what belongs there — gone the
              // moment a real card lands
              const egWords = (p.roleEg[key] || SB_ROLE_EG[key] || '').split('·').map((x) => x.trim()).filter(Boolean).slice(0, 4);
              return el('div', { class: 'sb-slot', 'data-role': key, style: `--sbc:${pal[key]};` },
                el('div', { class: 'sb-slot-h' }, q, p.terms ? el('span', { class: 'sb-term' }, SB_ROLE_TERM[key]) : null),
                ...cards.map((c) => mountCard(c, 'slot')),
                cards.length ? null : el('span', { class: 'sb-eg' }, el('i', {}, 'like…'), ...egWords.map((x) => el('span', {}, x))));
            })));
          } else if (p.mode === 'fixit' && p.fixed) {
            // the closing image fills the slab: the mended sentence, big,
            // green, centred — the last thing the class sees of the mend
            slab.append(el('div', { class: 'sb-fixedbanner' },
              el('small', {}, 'Fixed'),
              el('div', { class: 'sb-fixbig' }, p.srcs[0])));
          } else if (p.mode !== 'fixit' || (p.dealt && !p.fixed)) {
            lineEl = el('div', { class: 'sb-line' });
            if (!activeLine().length) {
              lineEl.append(el('span', { class: 'sb-linehint' },
                p.stage === 'together' && p.togSrc ? 'Rebuild it from memory — the cards are in the tray'
                : p.mode === 'combine' ? 'Deal a sentence above, then build ONE better one here'
                : p.mode === 'expand' ? 'Grow the sentence here — where, when, what like'
                : 'Build the sentence here — tap a card or a tile below'));
            }
            for (const c of activeLine()) lineEl.append(mountCard(c, 'line'));
            slab.append(lineEl);
          }
          if (lineCards().length && (p.mode === 'roles' || lineEl)) {
            sweepEl = el('div', { class: 'sb-sweep' }, el('i'), el('b'));
            slab.append(sweepEl);
          }
          if (slab.childNodes.length) mat.append(slab);

          // ---- the waiting band: ONE zone — cards row (with the docks at
          // its right end) and the tiles row ----
          const bank = p.mode === 'fixit' ? [] : bankWords();
          if (bank.length) {
            band.append(el('div', { class: 'sb-bank' },
              el('span', { class: 'sb-tilecap' }, 'from the word bank:'),
              ...bank.map((t) => el('button', {
                class: 'sb-bankchip', title: 'Bring this word in',
                onclick: guard(() => {
                  const c = sbNewCard(t, 'w');
                  if (p.mode === 'roles') { if (p.tray.length >= SB_TRAY_CAP) { toast('The tray is full — bin a card to make room'); return; } p.tray.push(c); }
                  else if (!addToLine(c)) return;
                  commit();
                }),
              }, t))));
          }
          trayCardsEl = el('div', { class: 'sb-cards' });
          if (!p.tray.length) trayCardsEl.append(el('span', { class: 'sb-linehint' }, p.mode === 'roles' ? 'Cards wait here — drag them into a slot' : 'Cards wait here'));
          for (const c of p.tray) trayCardsEl.append(mountCard(c, 'tray'));
          band.append(el('div', { class: 'sb-cardsrow' }, trayCardsEl, docks));
          trayCardsEl.scrollTop = keepTrayScroll;

          // tiles live in every face except fix-it's joins (a mend brings
          // its own words): the line faces take a tile straight to the
          // line; roles takes it to the tray, where the slots draw from
          const tileAdd = (c) => {
            if (p.mode === 'roles') {
              if (p.tray.length >= SB_TRAY_CAP) { toast('The tray is full — bin a card to make room'); return; }
              p.tray.push(c);
              commit();
            } else if (addToLine(c)) commit();
          };
          tilesEl = el('div', { class: 'sb-tiles' });
          const joins = sbCumulative(SB_JOINS, yg);
          if (joins.length && p.mode !== 'fixit') {
            tilesEl.append(el('span', { class: 'sb-tilecap' }, p.terms ? 'joining words · conjunctions:' : 'joining words:'));
            for (const t of joins) tilesEl.append(el('button', { class: 'sb-tile', onclick: guard(() => tileAdd(sbNewCard(t, 'w'))) }, t));
          }
          // punctuation is ONE atomic family: it right-aligns as a unit and
          // wraps as a unit — never split mid-row with a stray full stop
          // left behind on the joins' line
          const punctGrp = el('span', { class: 'sb-tilegrp' }, el('span', { class: 'sb-tilecap' }, 'punctuation:'));
          for (const t of sbCumulative(SB_PUNCTS, yg)) punctGrp.append(el('button', { class: 'sb-tile p', onclick: guard(() => tileAdd(sbNewCard(t, 'p'))) }, t));
          tilesEl.append(punctGrp);
          band.append(tilesEl);

          // ---- phase the handwriting rules to the content ----
          // the rules used to tile up from the box bottom while the cards
          // centred in the leftover space — two systems with no shared
          // reference, so whether a word sat on a line was a coincidence
          // of widget height, and every face landed differently (struck
          // through here, hanging mid-gap there). Now the grid is phased
          // from the first row itself: one rule lands exactly under the
          // cards' feet (or the hint's baseline) and the rhythm is the
          // REAL row height, so the writing sits on the lines in every
          // face, at every size.
          if (lineEl) {
            const first = lineEl.querySelector('.sb-card') || lineEl.querySelector('.sb-linehint');
            if (first) {
              const fsNow = parseFloat(mat.style.getPropertyValue('--sb-fs')) || 20;
              const isCard = first.classList.contains('sb-card');
              const rowH = Math.max(24, Math.round(isCard ? first.offsetHeight + fsNow * 0.28 : fsNow * 2.05));
              const lr = lineEl.getBoundingClientRect();
              const fr = first.getBoundingClientRect();
              const y = Math.round(fr.bottom - lr.top + (isCard ? 5 : 7));
              lineEl.style.backgroundImage = 'linear-gradient(to bottom, rgba(15, 118, 110, 0.15) 2px, transparent 2px)';
              lineEl.style.backgroundSize = '100% ' + rowH + 'px';
              lineEl.style.backgroundPosition = '0 ' + y + 'px';
            } else {
              lineEl.style.backgroundImage = 'none';
            }
          }
          mat.scrollTop = keepScroll;
        }

        const sizeChanged = () => {
          const cw = body.clientWidth, ch = body.clientHeight;
          const changed = cw !== lastW || ch !== lastH;
          lastW = cw; lastH = ch;
          return changed;
        };
        const ro = new ResizeObserver(() => { if (!dragging && !dealing && sizeChanged()) paint(); });
        ro.observe(body);
        sizeChanged(); // prime the dimensions: the observer fires on observe
        const onKey = (e) => { if (e.key === 'Escape' && popId && !dragging && !dealing) { popId = null; paint(); } };
        document.addEventListener('keydown', onKey);
        paint();
        return () => { ro.disconnect(); stopSay(); stopDeal(); document.removeEventListener('keydown', onKey); };
      },
      settings(box, w, api) {
        const el2 = D.el;
        const p = w.props;
        const deck = D.deck();
        const lines = (v) => v.split('\n').map((s) => sbClean(s).slice(0, SB_SRC_MAX)).filter(Boolean);
        const effYear = () => (SB_YEARS.includes(p.year) ? p.year : null) || deck.yearGroup || '2';
        const yrLabel = (y) => (y === 'R' ? 'Reception' : 'Year ' + y);
        // a section announces itself: rule, strong heading, one plain line
        // saying what the teacher is looking at (V0.1 decision 13) —
        // first-timers should never have to guess
        const sph = (t, sub) => {
          box.append(el2('div', { class: 'sb-sph' }, t));
          if (sub) box.append(el2('div', { class: 'sb-spsub' }, sub));
        };

        sph('Set it up', 'Which face of the scheme you are teaching, and the year it is pitched for.');
        box.append(
          settingRow('Mode', selectInput(SB_MODE_PILLS.map(([id, , , full]) => [id, full]), p.mode, (v) => {
            const prev = p.mode;
            p.mode = SB_MODES.includes(v) ? v : 'combine';
            if (p.mode === 'fixit' && prev !== 'fixit') { p.dealt = false; p.fixed = false; p.flagged = []; } // same restart rule as the quick seg
            api.refresh();
          })),
          settingRow('Year', selectInput([['', 'Auto (deck year group)'], ...SB_YEARS.map((y) => [y, yrLabel(y)])], p.year || '', (v) => {
            p.year = SB_YEARS.includes(v) ? v : null;
            api.refresh();
          })),
          el2('div', { class: 'hint' }, 'The year filters which joining words, punctuation and slots are out — it is never a ladder on screen. The question words are the floor; grammar names are an overlay.'),
          checkRow('Show the grammar names (the question words stay either way)', !!p.terms, (v) => { p.terms = v; api.refresh(); }),
        );
        // the honesty line the design requires: below Y4 the combining trials
        // simply don't exist, and the tool must say so to the teacher (never
        // to the class)
        if (sbYearNum(effYear()) < 4 && (p.mode === 'combine' || p.mode === 'expand' || p.mode === 'build')) {
          box.append(el2('div', { class: 'hint' }, 'Straight talk for below Year 4: this is a reasoned extrapolation, not a proven effect — the sentence-combining trials sit at Y4 and up. The cards take the transcription load off young writers, which is the argument for it, not a measured result.'));
        }
        if (p.mode === 'combine') {
          sph('The two sentences', 'The short sentences the class will combine — one per line, up to three.');
          const ta = el2('textarea', { class: 'text-input sb-ta', rows: '3', placeholder: 'One short sentence per line — up to three.\nSara was hungry\nShe had not had breakfast' });
          ta.value = p.srcs.join('\n');
          ta.addEventListener('change', () => { p.srcs = lines(ta.value).slice(0, 3); p.dealtSrcs = []; api.refresh(); });
          box.append(
            ta,
            el2('div', { class: 'hint' }, 'The class combines them into one better one — and keeps more than one answer, because comparing two good sentences is the teaching.'),
          );
        }
        if (p.mode === 'expand') {
          sph('The sentence to grow', 'The plain sentence that starts on the line — the class grows it.');
          box.append(settingRow('Sentence', el2('input', {
            class: 'text-input grow', value: p.srcs[0] || '', maxlength: String(SB_SRC_MAX), placeholder: 'The boy walked through the forest',
            onchange: (e) => { p.srcs = [sbClean(e.target.value).slice(0, SB_SRC_MAX)].filter(Boolean); p.dealtSrcs = []; p.track = p.srcs[0] ? sbDeal(p.srcs[0]) : []; p.grown = !!p.srcs[0]; api.refresh(); },
          })));
        }
        if (p.mode === 'roles') {
          sph('Slots and colours', 'The palette is a deck-wide school choice; the ghost examples are your topic words.');
          const deckPal = () => (SB_PALETTES[deck.sbPalette] ? deck.sbPalette : (SB_PALETTES[p.palette] ? p.palette : 'sage'));
          box.append(
            settingRow('Colours', selectInput([['sage', 'Bold — made for projectors'], ['cs', 'Traditional Colourful Semantics']], deckPal(), (v) => {
              // a DECK setting: every sentence builder this class sees must
              // agree — within-child consistency is the one property the
              // colours carry (PenCRU)
              deck.sbPalette = SB_PALETTES[v] ? v : 'sage';
              D.save();
              if (api.refreshAllOf) api.refreshAllOf('sentencebuilder')();
              api.refresh();
            })),
            el2('div', { class: 'hint' }, 'One choice for the whole deck — every sentence builder this class sees follows it, because changing colours mid-year costs the class its bearings. The traditional set’s brown and grey are the ones a tired projector loses first.'),
          );
          const rs = SB_ROLES.filter(([, , min]) => sbYearNum(min) <= sbYearNum(effYear()));
          for (const [key, q] of rs) {
            box.append(settingRow(q, el2('input', {
              class: 'text-input grow', value: p.roleEg[key] || '', maxlength: '80', placeholder: SB_ROLE_EG[key],
              onchange: (e) => { const v = sbClean(e.target.value).slice(0, 80); if (v) p.roleEg[key] = v; else delete p.roleEg[key]; api.refresh(); },
            })));
          }
          box.append(el2('div', { class: 'hint' }, 'Shown in ghost grey inside an empty slot — “like… the dog · a girl”. Put “ · ” between examples; leave blank for the stock set. Topic words work hardest here.'));
        }
        if (p.mode === 'fixit') {
          sph('The mend', 'The correct sentence first, then the version the class will mend.');
          box.append(
            settingRow('Done right', el2('input', {
              class: 'text-input grow', value: p.srcs[0] || '', maxlength: String(SB_SRC_MAX), placeholder: 'The dog barked all night.',
              onchange: (e) => { p.srcs = [sbClean(e.target.value).slice(0, SB_SRC_MAX), p.srcs[1] || '']; p.dealtSrcs = []; p.dealt = false; p.fixed = false; p.flagged = []; p.track = []; api.refresh(); },
            })),
            settingRow('The broken one', el2('input', {
              class: 'text-input grow', value: p.srcs[1] || '', maxlength: String(SB_SRC_MAX), placeholder: 'the dog barked all night',
              onchange: (e) => { p.srcs = [p.srcs[0] || '', sbClean(e.target.value).slice(0, SB_SRC_MAX)]; p.dealtSrcs = []; p.dealt = false; p.fixed = false; p.flagged = []; p.track = []; api.refresh(); },
            })),
            el2('div', { class: 'hint' }, 'Right one first, on purpose: the class reads the correct shape before the broken one appears, you flag where the problem is (tap a card, then ⚑) rather than making them hunt, they mend it by moving cards — and “Show it fixed” puts the right sentence back as the last thing on screen. An error is for fixing together, never for leaving up.'),
            el2('div', { class: 'hint' }, 'Break the structure, not the spelling — wrong order, a missing capital, lost punctuation. A misspelled word on the big screen can stick in children’s memory as looking right, which is the one harm the research actually documents.'),
          );
        }

        // ---- sentence banks (V0.1 decision 14): year-banded topic sets,
        // two taps to load into the face being taught ----
        sph('Sentence banks — ' + yrLabel(effYear()), 'Ready-made sentences by topic. Pick a topic, then Use one to load it into the face you are teaching.');
        const n = sbYearNum(effYear());
        const topics = SB_BANKS.filter((b) => sbYearNum(b.yrs[0]) <= n && n <= sbYearNum(b.yrs[1]))
          .map((b) => ({ topic: b.topic, pairs: b.pairs, bases: b.bases, fixes: b.fixes }));
        // the teacher's own imports live on the DECK, keyed by year — the
        // same home as sbPalette, hand-editable, so sanitise on the way in
        const rawMine = deck.sbBank && typeof deck.sbBank === 'object' ? deck.sbBank[effYear()] : null;
        const mine = rawMine && typeof rawMine === 'object' ? {
          topic: 'My import',
          pairs: (Array.isArray(rawMine.pairs) ? rawMine.pairs : []).map((x) => (Array.isArray(x) ? [sbClean(x[0]).slice(0, SB_SRC_MAX), sbClean(x[1]).slice(0, SB_SRC_MAX)] : null)).filter((x) => x && x[0] && x[1]).slice(0, 30),
          bases: (Array.isArray(rawMine.bases) ? rawMine.bases : []).map((x) => sbClean(x).slice(0, SB_SRC_MAX)).filter(Boolean).slice(0, 30),
          fixes: [],
        } : null;
        if (mine && (mine.pairs.length || mine.bases.length)) topics.push(mine);
        if (topics.length) {
          const trow = el2('div', { class: 'sb-topics' });
          for (const b of topics) {
            trow.append(el2('button', {
              class: 'sb-topic' + (p.bankTopic === b.topic ? ' on' : ''),
              onclick: () => { p.bankTopic = p.bankTopic === b.topic ? '' : b.topic; api.refresh(); },
            }, b.topic));
          }
          box.append(trow);
        } else {
          box.append(el2('div', { class: 'hint' }, 'No banked sentences for this year yet — paste your own below.'));
        }
        const open = topics.find((b) => b.topic === p.bankTopic);
        if (open) {
          const items = p.mode === 'combine' ? open.pairs.map((pr) => ({
            label: pr[0] + '  ·  ' + pr[1],
            use: () => { p.srcs = [pr[0], pr[1]]; p.dealtSrcs = []; api.refresh(); toast('Loaded into Combine — deal when ready'); },
          })) : p.mode === 'expand' ? open.bases.map((b2) => ({
            label: b2,
            use: () => { p.srcs = [b2]; p.dealtSrcs = []; p.track = sbDeal(b2); p.grown = true; api.refresh(); toast('On the line — grow it'); },
          })) : p.mode === 'fixit' ? open.fixes.map((f2) => ({
            label: f2[0],
            use: () => { p.srcs = [f2[0], f2[1]]; p.dealtSrcs = []; p.dealt = false; p.fixed = false; p.flagged = []; p.track = []; api.refresh(); toast('Loaded — read it right first'); },
          })) : open.bases.map((b2) => ({
            label: b2,
            use: () => {
              let full = false;
              for (const c of sbDeal(b2)) {
                if (c.k !== 'w') continue; // words only — the punctuation tiles are already out
                if (p.tray.length >= SB_TRAY_CAP) { full = true; break; }
                p.tray.push(c);
              }
              api.refresh();
              toast(full ? 'The tray filled up — some words stayed behind' : 'Words dealt to the tray');
            },
          }));
          if (!items.length) box.append(el2('div', { class: 'hint' }, 'Nothing in this topic for the current mode — switch mode or pick another topic.'));
          for (const it of items) {
            box.append(el2('div', { class: 'sb-bankitem' }, el2('span', { class: 'grow' }, it.label), el2('button', { class: 'sb-use', onclick: it.use }, 'Use')));
          }
        }

        sph('Add your own — a term at a time', 'Paste as many as you like, one per line. Put “ / ” between two sentences to make a Combine pair.');
        const ta2 = el2('textarea', { class: 'text-input sb-ta', rows: '4', placeholder: 'The tide came in. / The nets were full.\nThe lighthouse blinked.' });
        const impBtn = el2('button', {
          class: 'sb-act',
          onclick: () => {
            const raw = lines(ta2.value);
            if (!raw.length) { toast('Paste some sentences first'); return; }
            const y = effYear();
            deck.sbBank = deck.sbBank && typeof deck.sbBank === 'object' ? deck.sbBank : {};
            // rebuild from the SANITISED view, never the raw store: junk in
            // a hand-edited deck must not ride forward or eat the caps
            const bucket = mine ? { pairs: mine.pairs.slice(), bases: mine.bases.slice() } : { pairs: [], bases: [] };
            let np = 0, nb = 0;
            for (const ln of raw) {
              if (ln.includes('/')) {
                const [a, b3] = ln.split('/').map((s) => sbClean(s).slice(0, SB_SRC_MAX));
                if (a && b3 && bucket.pairs.length < 30) { bucket.pairs.push([a, b3]); np++; }
              } else if (bucket.bases.length < 30) { bucket.bases.push(ln); nb++; }
            }
            deck.sbBank[y] = bucket;
            D.save();
            p.bankTopic = 'My import';
            api.refresh();
            toast(np + (np === 1 ? ' pair' : ' pairs') + ' and ' + nb + (nb === 1 ? ' single' : ' singles') + ' filed under ' + yrLabel(y) + ' · My import');
          },
        }, 'Add to my bank');
        box.append(ta2, el2('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;' }, impBtn,
          // Clear shows whenever ANYTHING is stored for this year — a
          // bucket full of junk the sanitiser filters to nothing must
          // still be clearable, or the bank is wedged
          ...(rawMine ? [el2('button', {
            class: 'sb-dangerp',
            onclick: () => {
              if (deck.sbBank) delete deck.sbBank[effYear()];
              D.save();
              if (p.bankTopic === 'My import') p.bankTopic = '';
              api.refresh();
              toast('Your imports for ' + yrLabel(effYear()) + ' are gone');
            },
          }, 'Clear my imports')] : [])));

        sph('Tidy up', 'Wipe what is on screen — the banks and your imports are untouched.');
        box.append(el2('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;' },
          el2('button', { class: 'sb-dangerp', onclick: () => {
            // clears the line the teacher is LOOKING at: Together wipes the
            // class's rebuild; Model wipes the model and its seed memory
            if ((p.mode === 'combine' || p.mode === 'expand' || p.mode === 'build') && p.stage === 'together') p.trackT = [];
            else { p.track = []; p.togSrc = ''; }
            p.flagged = [];
            if (p.mode === 'fixit') p.dealt = false;
            api.refresh();
          } }, 'Clear the line'),
          el2('button', { class: 'sb-dangerp', onclick: () => { p.tray = []; p.dealtSrcs = []; api.refresh(); } }, 'Clear the tray'),
          el2('button', { class: 'sb-dangerp', onclick: () => { p.alts = []; api.refresh(); } }, 'Clear kept sentences'),
        ));
        box.append(el2('div', { class: 'hint' }, 'This widget is the front half of a lesson: build and rehearse the sentence together, then Over to you hands it off — the writing happens on paper, not in here. A word bank on the same screen feeds its words into the tray by itself.'));
      },
    };
  }

  window.SageEnglishWord = {
    init(deps) {
      D = deps;
      register();
    },
  };
})();
