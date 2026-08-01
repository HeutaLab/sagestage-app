/* Sage Stage — Modelled writing (the flip-chart easel, replaced).
   Design: docs/modelled-writing-design.md. Split out of english-word.js at v2
   (2026-07-26) because the paper slice roughly tripled it and english-word.js
   was already 254KB — same boot pattern as export.js / print.js, registered at
   app boot via SageModelWrite.init(deps).

   v2 (the paper slice) adds, all per PAGE rather than per widget:
     · rulings   plain · 4-line · alternating solid/dotted · alternating
                 solid/solid · unlined
     · heights   a five-step ladder whose middle three are v1's s/m/l exactly,
                 so no saved page's ink shifts off its lines
     · layout    two nullable divider positions — a vertical rule (lined | plain)
                 and a picture band across the top — which between them give the
                 four layouts without a single enum branch
     · pictures  imported printouts and clipart, placed freely, always under
                 the ink because teachers write ON them
*/
(function () {
  'use strict';

  let D = null; // injected by SageModelWrite.init from app.js

  const MW_W = 1000, MW_H = 1414;          // page space: A4 portrait, integer units
  // 0–3 write, 4–7 highlight. Highlighter colours were appended rather than
  // inserted, so a stroke saved as c:4 is still the same yellow it always was.
  const MW_INKS = [
    '#111827', '#1d4ed8', '#dc2626', '#15803d',            // pen: black blue red green
    '#fde047', '#f9a8d4', '#7dd3fc', '#fdba74',            // highlighter: yellow pink sky orange
  ];
  const MW_INK_NAMES = ['Black', 'Blue', 'Red', 'Green', 'Yellow', 'Pink', 'Sky', 'Orange'];
  const MW_HL = 4;                          // first highlighter index
  const MW_HL_LAST = 7;                     // last highlighter index

  // A school's own colours, set once for the whole app. Stroke colour is stored
  // as an INDEX, so these are APPENDED at 8+ and never overwrite 0–7 — the same
  // discipline that let four highlighters arrive without moving the yellow a
  // stroke had already been written in. The trade this does make is that
  // editing school colour 1 restyles writing already done in school colour 1,
  // because that is what a named palette slot means; the settings panel says so.
  const MW_SCHOOL_AT = 8, MW_SCHOOL_MAX = 6;
  let MW_SCHOOL = [];
  const mwHex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);

  // §8.1's marking palette. Reserved ABOVE the school range rather than
  // appended to MW_INKS, because MW_SCHOOL_AT is baked into every saved stroke
  // that uses a school colour — shifting it would repaint them.
  //   14  purple editing pen — the convention in most English primaries
  //   15  marking highlighter A   \ two colours with school-set MEANINGS and
  //   16  marking highlighter B   / polarity ("tickled pink / green for growth"
  //                                 is one convention of several, so it is a
  //                                 setting rather than a decision made here)
  const MW_MARK_AT = 14;
  const MW_MARK_PEN = MW_MARK_AT, MW_MARK_A = MW_MARK_AT + 1, MW_MARK_B = MW_MARK_AT + 2;
  const MW_MARK_LAST = MW_MARK_B;
  const MW_MARK_PEN_COL = '#7e22ce';
  const MW_MARK_DEFAULT = {
    a: { c: '#86efac', label: 'Good here' },
    b: { c: '#f9a8d4', label: 'Think again' },
  };
  let MW_MARKING = { a: Object.assign({}, MW_MARK_DEFAULT.a), b: Object.assign({}, MW_MARK_DEFAULT.b) };

  const mwIsHL = (c) => (c >= MW_HL && c <= MW_HL_LAST) || c === MW_MARK_A || c === MW_MARK_B;
  function inkAt(i) {
    if (i === MW_MARK_PEN) return MW_MARK_PEN_COL;
    if (i === MW_MARK_A) return MW_MARKING.a.c;
    if (i === MW_MARK_B) return MW_MARKING.b.c;
    if (i >= MW_SCHOOL_AT) return MW_SCHOOL[i - MW_SCHOOL_AT] || MW_INKS[0];
    return MW_INKS[i] || MW_INKS[0];
  }
  function inkName(i) {
    if (i === MW_MARK_PEN) return 'Editing pen';
    if (i === MW_MARK_A) return MW_MARKING.a.label;
    if (i === MW_MARK_B) return MW_MARKING.b.label;
    if (i >= MW_SCHOOL_AT) return 'School colour ' + (i - MW_SCHOOL_AT + 1);
    return MW_INK_NAMES[i] || 'Ink';
  }
  // 16 was a guess, and a unit built across weeks hits it (Glenn). Raised to 40
  // with a nudge on the way past 24 rather than a wall: the real limit is the
  // browser's storage, which the app now measures and warns about directly, so
  // the page count no longer has to stand in for it.
  const MW_PAGE_CAP = 40, MW_PAGE_SOFT = 24, MW_STROKE_CAP = 600;

  // The ladder. Steps 1–3 are v1's s/m/l (64/88/120) to the unit, so migrating
  // a saved widget moves nothing; the two new steps extend the range at both
  // ends. Labelled by the printed A4 spacing — a neutral fact a teacher can
  // measure against their own exercise books, and it claims no year group
  // (mixed-age and SEN classes make year labels a liability).
  const MW_SIZES = [48, 64, 88, 120, 160];
  const MW_GROUPS = [72, 96, 128, 176, 235]; // 4-line group heights, same trick
  const MW_SIZE_MM = [10, 13, 18, 25, 34];
  const MW_RULINGS = ['plain', '4line', 'altdot', 'altsolid', 'none'];

  // ------------------------------------------------- the teaching payload
  // §8.1's tags: what a page IS in the unit, rather than what is on it. All
  // three are display labels — they change no behaviour, which is exactly what
  // the spec asks for. They print, because a Cold and a Hot task side by side
  // on the wall IS the progress evidence.
  const MW_STAGES = [
    ['modelled', 'Modelled', 'I do — watch how I write this'],
    ['shared', 'Shared', 'We do — you tell me, I scribe'],
    ['guided', 'Guided', 'We do — you write, I steer'],
    ['independent', 'Independent', 'You do — off you go'],
  ];
  const MW_STAGE_COL = {
    modelled: '#1d4ed8', shared: '#0891b2', guided: '#15803d', independent: '#b45309',
  };
  const MW_BOOKENDS = [['cold', 'Cold task', '#64748b'], ['hot', 'Hot task', '#dc2626']];
  const mwStage = (k) => MW_STAGES.find((s) => s[0] === k) || null;
  const mwBookend = (k) => MW_BOOKENDS.find((s) => s[0] === k) || null;
  // the neutral trio, per §8.1 — schools with a branded lens system type
  // their own in, which is why these are only the defaults
  const MW_LENS_DEFAULT = ['A sense idea', 'A grammar tool', 'A literary device'];

  // Pictures live in the same localStorage key as every deck in the app, so
  // they are budgeted, degraded in quality steps and refused politely at the
  // floor — the word bank's discipline, at a bigger scale because a printout
  // is a page not a card. `src` is a data URI today and becomes a file path in
  // the Tauri era with no data-model change.
  const MW_IMG_MAX = 180 * 1024;             // encoded data-URL characters
  const MW_UNIT_BUDGET = 1.2 * 1024 * 1024;  // every picture in one writing unit
  const MW_IMG_PER_PAGE = 6;
  const MW_IMG_STEPS = [[1100, 0.82], [900, 0.78], [760, 0.72], [620, 0.66], [500, 0.6], [400, 0.5]];

  // Pen thicknesses are stored per stroke; a stroke saved before v2 has no `w`
  // and falls back to v1's 6, so nothing already written changes weight.
  const MW_PEN_W = [4, 7, 12];
  const MW_PEN_DEFAULT = 6;
  const MW_HL_W = [20, 30, 44];
  const MW_HL_DEFAULT = 30;
  // The eraser rubs, so its radius is the size of the rubber: small enough to
  // take the 'e' out of a joined 'ie' without touching the 'i'.
  const MW_ERASE_R = [12, 24, 42];
  const MW_BAR_AT = ['top', 'bottom', 'left', 'right'];

  // Colour cues on the tool pills: a teacher glancing at an IWB from two metres
  // finds a colour far faster than a word in a row of identical grey. Hue
  // encodes the FAMILY, not the position — the two that take marks away share
  // one, and Pen and Highlighter carry whichever ink they are actually set to,
  // so the pill doubles as "what am I holding". (Glenn, 2026-07-26.)
  const MW_CUE = {
    erase: '#b45309', lift: '#b45309',     // takes marks away
    lasso: '#6366f1',                      // moves marks
    pic: '#0891b2',                        // adds something
    mark: '#7e22ce',                       // marking: the editing-pen purple
    paper: '#15803d',                      // the page itself
    undo: '#64748b',                       // history, deliberately quiet
    clear: '#dc2626',                      // the one that destroys
  };
  const mwAlpha = (hex, a) => hex + a;     // #rrggbb + aa — 8-digit hex

  const MW_STACKS = new WeakMap(); // per-widget undo stacks — survive settings remounts
  // one clipboard for the whole app: lifting an exemplar sentence off one page
  // and pasting it onto another is the point (Glenn's item 8)
  let MW_CLIP = null;

  const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+n || 0)));

  // ------------------------------------------------------------------ paper
  function mwPaper(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const p = {
      ruling: MW_RULINGS.includes(o.ruling) ? o.ruling : 'plain',
      size: Number.isInteger(+o.size) && +o.size >= 0 && +o.size < MW_SIZES.length ? +o.size : 2,
      vAt: o.vAt == null ? null : clampInt(o.vAt, 250, 750),
      hAt: o.hAt == null ? null : clampInt(o.hAt, 200, 1000),
    };
    return p;
  }
  const mwPaperCopy = (p) => ({ ruling: p.ruling, size: p.size, vAt: p.vAt, hAt: p.hAt });

  // The lined zone: the page inset by its margins, minus everything right of
  // the vertical rule and above the picture band. ONE rect, feeding the live
  // render, the thumbnails and toPrintable() alike — the v1 rule that the lines
  // a class watches being written on are the lines that print, now holding
  // across splits too.
  function mwZone(paper) {
    const x = 40;
    const right = paper.vAt == null ? MW_W - 40 : paper.vAt - 18;
    const y = paper.hAt == null ? 0 : paper.hAt;
    return { x, y, w: Math.max(80, right - x), h: MW_H - y };
  }

  function mwRulingLines(paper) {
    const z = mwZone(paper);
    const out = [];
    const bottom = MW_H - 40;
    const P = MW_SIZES[paper.size];
    // v1's exact offsets on a full-height zone, so no saved page shifts; a
    // shorter gap below a picture band, where the band is the breathing space
    const top = z.y ? z.y + 60 : 140;
    if (paper.ruling === 'plain') {
      for (let y = top; y <= bottom; y += P) out.push({ y, kind: 'base' });
    } else if (paper.ruling === 'altdot' || paper.ruling === 'altsolid') {
      // Alternating: writing on the solid lines, next day's coloured swap on the
      // faint line directly above. Line height stays the gap between WRITING
      // lines, so the annotation space is spent out of the page, not out of the
      // letter size — "Y2 lines" mean the same thing on every paper.
      const half = Math.round(P / 2);
      const faint = paper.ruling === 'altdot' ? 'faintdash' : 'faint';
      for (let y = top - half; y <= bottom; y += half) {
        if (y < 40) continue;
        out.push({ y, kind: Math.round((y - top) / half) % 2 === 0 ? 'base' : faint });
      }
    } else if (paper.ruling === '4line') {
      const g = MW_GROUPS[paper.size];
      for (let t = z.y ? z.y + 40 : 110; t + g <= bottom; t += Math.round(g * 1.5)) {
        out.push({ y: t, kind: 'light' });
        out.push({ y: Math.round(t + g * 0.33), kind: 'light' });
        out.push({ y: Math.round(t + g * 0.66), kind: 'base' });
        out.push({ y: t + g, kind: 'dash' });
      }
    }
    for (const l of out) { l.x1 = z.x; l.x2 = z.x + z.w; }
    return out;
  }

  const MW_LINE_STYLE = {
    base: { c: '#64748b', w: 2.2, o: 1 },
    light: { c: '#b6c2d1', w: 1.6, o: 1 },
    dash: { c: '#b6c2d1', w: 1.6, o: 1, d: '14 10' },
    faint: { c: '#64748b', w: 1.8, o: 0.5 },
    faintdash: { c: '#64748b', w: 1.8, o: 0.5, d: '14 10' },
  };

  // ------------------------------------------------------------------- ink
  function mwStrokeAttrs(s) {
    const hl = mwIsHL(s.c);
    return {
      stroke: inkAt(s.c),
      width: s.w > 0 ? s.w : (hl ? MW_HL_DEFAULT : MW_PEN_DEFAULT),
      opacity: hl ? 0.4 : 1,
    };
  }

  // quadratic-through-midpoints over the thinned points — marker, not polyline
  function mwStrokePath(pts) {
    if (pts.length < 4) return 'M ' + pts[0] + ' ' + pts[1] + ' l 0.5 0';
    let d = 'M ' + pts[0] + ' ' + pts[1];
    if (pts.length === 4) return d + ' L ' + pts[2] + ' ' + pts[3];
    for (let i = 2; i + 3 < pts.length; i += 2) {
      const mx = Math.round((pts[i] + pts[i + 2]) / 2), my = Math.round((pts[i + 1] + pts[i + 3]) / 2);
      d += ' Q ' + pts[i] + ' ' + pts[i + 1] + ' ' + mx + ' ' + my;
    }
    return d + ' L ' + pts[pts.length - 2] + ' ' + pts[pts.length - 1];
  }

  // ---------------------------------------------------- pressure and speed
  // Every mark used to be a constant-width marker line. Children copy
  // letterforms from what the teacher models, and real handwriting thins and
  // thickens — so a stroke can now carry a width PER POINT (`pw`), taken from
  // stylus pressure where the board reports it and from how fast the hand is
  // moving where it doesn't.
  //
  // A varying stroke cannot be drawn by `stroke-width`, so it is drawn as its
  // own OUTLINE and filled: left edge out, round cap, right edge back, round
  // cap, close. One path element either way, so the DOM cost, the thumbnails
  // and the print are all unchanged — and a stroke with no `pw` still takes
  // the old constant-width branch, byte for byte, so nothing already written
  // shifts by a hair.
  const MW_VAR_MIN = 0.55, MW_VAR_MAX = 1.45;   // multiples of the chosen nib
  function mwOutline(pts, pw) {
    const n = pts.length >> 1;
    const hAt = (i) => Math.max(0.4, (pw[i] || pw[0] || 6) / 2);
    if (n < 2) {
      const r = hAt(0), x = pts[0], y = pts[1];
      return 'M' + (x - r) + ' ' + y + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0'
        + 'a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0Z';
    }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const xi = pts[i * 2], yi = pts[i * 2 + 1];
      // tangent from the neighbours either side, so the offset follows the
      // curve rather than the last segment
      const px = i > 0 ? pts[i * 2 - 2] : xi, py = i > 0 ? pts[i * 2 - 1] : yi;
      const qx = i < n - 1 ? pts[i * 2 + 2] : xi, qy = i < n - 1 ? pts[i * 2 + 3] : yi;
      let tx = qx - px, ty = qy - py;
      const tl = Math.sqrt(tx * tx + ty * ty);
      if (tl < 1e-6) { tx = 1; ty = 0; } else { tx /= tl; ty /= tl; }
      const h = hAt(i);
      L.push(r1(xi - ty * h), r1(yi + tx * h));
      R.push(r1(xi + ty * h), r1(yi - tx * h));
    }
    // end tangent, for the two caps
    const t1 = tan(pts, n - 1), t0 = tan(pts, 0);
    const hE = hAt(n - 1), hS = hAt(0);
    let d = 'M' + L[0] + ' ' + L[1] + smooth(L);
    // round cap over the tip: sweep 0 is the outward bulge with y pointing down
    d += 'A' + r1(hE) + ' ' + r1(hE) + ' 0 0 0 ' + R[R.length - 2] + ' ' + R[R.length - 1];
    d += smoothRev(R);
    d += 'A' + r1(hS) + ' ' + r1(hS) + ' 0 0 0 ' + L[0] + ' ' + L[1] + 'Z';
    return d;
    function tan(p, i) {
      const a = i > 0 ? i - 1 : i, b = i < n - 1 ? i + 1 : i;
      return [p[b * 2] - p[a * 2], p[b * 2 + 1] - p[a * 2 + 1]];
    }
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  // the same quadratic-through-midpoints smoothing the centreline uses, so an
  // outlined stroke and a plain one curve identically
  function smooth(a) {
    if (a.length < 6) return a.length >= 4 ? 'L' + a[2] + ' ' + a[3] : '';
    let d = '';
    for (let i = 2; i + 3 < a.length; i += 2) {
      d += 'Q' + a[i] + ' ' + a[i + 1] + ' ' + r1((a[i] + a[i + 2]) / 2) + ' ' + r1((a[i + 1] + a[i + 3]) / 2);
    }
    return d + 'L' + a[a.length - 2] + ' ' + a[a.length - 1];
  }
  function smoothRev(a) {
    const b = [];
    for (let i = a.length - 2; i >= 0; i -= 2) b.push(a[i], a[i + 1]);
    return 'L' + b[0] + ' ' + b[1] + smooth(b);
  }

  // How wide the nib is at this instant. Pressure leads where a stylus reports
  // it; everywhere else — finger, mouse, most interactive whiteboards — speed
  // is the only real signal, and it is a good one: you slow down on the part
  // of a letter you are being careful about, which is exactly where the line
  // should be heaviest.
  function mwNib(base, pressure, speed, isPen) {
    let f;
    if (isPen && pressure > 0 && pressure < 1) {
      f = (0.55 + pressure * 0.9) * (1.1 - Math.min(1, speed / 2.5) * 0.28);
    } else {
      f = 1.22 - Math.min(1, speed / 2.2) * 0.55;
    }
    return Math.max(base * MW_VAR_MIN, Math.min(base * MW_VAR_MAX, base * f));
  }

  // Part-erase: the rubber takes out only what it touches and the stroke
  // survives as the runs either side of the hole. Glenn's case — a joined "ie"
  // where the e must go and the i must stay, because losing the i can turn the
  // rest into another word and cost most of a modelled sentence.
  //
  // Two earlier attempts, both recorded because the second looked like a fix:
  // v1 dropped whole POINTS, so the hole was the size of the point spacing
  // rather than the rubber ("the eraser's amount is erratic"). v2 subdivided
  // the nearby segments to 3 units first, which made the hole right but left
  // the survivors carrying those points — so they were simplified again
  // afterwards, and since a rubber DRAG runs the whole cycle dozens of times on
  // one stroke, the simplification's error compounded until a box's corner
  // wandered off and the shape closed itself with a diagonal.
  // The version below solves the intersection instead. See mwErasePart.
  const mwHasW = (s) => !!(s.pw && s.pw.length === s.pts.length >> 1);

  // Every stroke derived from another one — an eraser run, a lasso cut, a copy,
  // a duplicated page — goes through here. It used to be five hand-written
  // object literals, and every one of them silently dropped `sh`: rub the top
  // off a ruled box and the remaining corners came back through the handwriting
  // smoothing as CURVES (Glenn, with the screenshots, 2026-07-26). A box exists
  // precisely for not having rounded corners, so the flag has to survive
  // everything that survives.
  // The originals are carried straight through. There was a simplification pass
  // here; it had to go, because it is lossy and a rubber DRAG calls this dozens
  // of times on the same stroke, so its error compounded into a wandering line.
  // Nothing now adds points that would need removing again.
  function mwDerive(s, pts, pw) {
    const out = { c: s.c, w: s.w, pts };
    if (pw) out.pw = pw;
    if (s.sh) out.sh = 1;
    return out;
  }

  // Where does the segment A→B pass through the rubber? Solves the line/circle
  // intersection and returns the parameter interval inside it, or null.
  function mwSegCircle(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay;
    const fx = ax - cx, fy = ay - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return (fx * fx + fy * fy <= r * r) ? [0, 1] : null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) return null;               // misses, or grazes at one point
    const sq = Math.sqrt(disc);
    let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
    if (t1 <= 0 || t0 >= 1) return null;
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
    return t1 > t0 ? [t0, t1] : null;
  }

  /* The rubber cuts each stroke EXACTLY where the circle crosses it, and keeps
     every original point either side untouched.

     Solving the intersection is exact, adds at most two points per cut, needs
     no densify and no thinning, and — the property that actually matters — is
     IDEMPOTENT: rubbing near a stroke without touching it changes nothing at
     all, so a drag cannot accumulate anything. */
  function mwErasePart(s, x, y, r) {
    const pts = s.pts, pw = mwHasW(s) ? s.pw : null;
    const n = pts.length >> 1;
    const runs = [];
    let cur = [], curW = pw ? [] : null, cut = false;
    const W = (i) => (pw ? pw[i] : 0);
    const lerpW = (i, j, t) => (pw ? Math.round(pw[i] + (pw[j] - pw[i]) * t) : 0);
    const push = (px, py, w) => { cur.push(px, py); if (curW) curW.push(w); };
    const flush = () => {
      if (cur.length >= 4) runs.push({ pts: cur, pw: curW });
      cur = []; curW = pw ? [] : null;
    };
    const at = (px, py) => (px - x) ** 2 + (py - y) ** 2 <= r * r;

    if (n === 1) return at(pts[0], pts[1]) ? [] : null;

    // Every point is classified DIRECTLY by whether it is in the circle; the
    // intersection is used only to place the cut. Inferring the state from the
    // intersection instead latched it: a run whose first point sits exactly on
    // the rubber's edge makes the next segment merely GRAZE the circle, which
    // has no proper crossing — so "we are inside" never cleared and the whole
    // rest of the stroke was thrown away.
    let prevIn = at(pts[0], pts[1]);
    if (prevIn) cut = true; else push(pts[0], pts[1], W(0));

    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1];
      const bx = pts[i * 2 + 2], by = pts[i * 2 + 3];
      const bIn = at(bx, by);
      const iv = mwSegCircle(ax, ay, bx, by, x, y, r);
      const cutAt = (t) => push(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t),
        lerpW(i, i + 1, t));
      if (!prevIn && !bIn) {
        // both ends outside — but the middle may still dip through the rubber
        if (iv) { cut = true; cutAt(iv[0]); flush(); cutAt(iv[1]); }
        push(bx, by, W(i + 1));
      } else if (!prevIn && bIn) {
        cut = true;                       // the ink runs into the rubber
        if (iv) cutAt(iv[0]);
        flush();
      } else if (prevIn && !bIn) {
        cut = true;                       // and comes back out
        if (iv) cutAt(iv[1]);
        push(bx, by, W(i + 1));
      } else {
        cut = true;                       // both ends inside: this bit is gone
      }
      prevIn = bIn;
    }
    flush();
    if (!cut) return null; // untouched: hand back nothing so the stroke stays put
    return runs.map((k) => mwDerive(s, k.pts, k.pw));
  }

  // The lasso cuts as well as selects: whatever falls inside the loop comes
  // away, so a teacher can pull the suffix off a cursive word exactly as they
  // would with scissors and a post-it on a flipchart. A stroke wholly inside
  // is simply selected; a stroke partly inside is split, the inside part
  // selected and the rest left on the page. (Glenn, 2026-07-26.)
  function mwLassoCut(strokes, poly) {
    const kept = [], picked = [];
    for (const s of strokes) {
      let inCount = 0;
      for (let i = 0; i < s.pts.length; i += 2) if (mwInPoly(poly, s.pts[i], s.pts[i + 1])) inCount++;
      const n = s.pts.length / 2;
      if (!inCount) { kept.push(s); continue; }
      if (inCount === n) { kept.push(s); picked.push(s); continue; }
      // partial: split into inside and outside runs, cutting each straddling
      // segment at the exact point it crosses the loop. Bisection rather than
      // subdivision, for the same reason the rubber uses an intersection: the
      // originals stay untouched and only ONE point is added per crossing.
      const pts = s.pts, pw = mwHasW(s) ? s.pw : null;
      const cnt = pts.length >> 1;
      let run = [], runW = pw ? [] : null;
      let runIn = mwInPoly(poly, pts[0], pts[1]);
      const flush = () => {
        if (run.length >= 4) {
          const made = mwDerive(s, run, runW);
          kept.push(made);
          if (runIn) picked.push(made);
        }
        run = []; runW = pw ? [] : null;
      };
      run.push(pts[0], pts[1]);
      if (runW) runW.push(pw[0]);
      for (let i = 0; i < cnt - 1; i++) {
        const ax = pts[i * 2], ay = pts[i * 2 + 1];
        const bx = pts[i * 2 + 2], by = pts[i * 2 + 3];
        const nextIn = mwInPoly(poly, bx, by);
        if (nextIn !== runIn) {
          // find where it crosses, to within a fraction of a unit
          let lo = 0, hi = 1;
          for (let k = 0; k < 18; k++) {
            const m = (lo + hi) / 2;
            if (mwInPoly(poly, ax + (bx - ax) * m, ay + (by - ay) * m) === runIn) lo = m; else hi = m;
          }
          const t = (lo + hi) / 2;
          const cxp = Math.round(ax + (bx - ax) * t), cyp = Math.round(ay + (by - ay) * t);
          const cwp = pw ? Math.round(pw[i] + (pw[i + 1] - pw[i]) * t) : 0;
          run.push(cxp, cyp);
          if (runW) runW.push(cwp);
          flush();
          runIn = nextIn;
          run.push(cxp, cyp);
          if (runW) runW.push(cwp);
        }
        run.push(bx, by);
        if (runW) runW.push(pw ? pw[i + 1] : 0);
      }
      flush();
    }
    return { kept, picked };
  }

  // ray casting — the lasso is freehand, so the test has to take any polygon
  function mwInPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
    }
    return inside;
  }
  function mwBounds(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of list) {
      for (let i = 0; i < s.pts.length; i += 2) {
        if (s.pts[i] < x0) x0 = s.pts[i];
        if (s.pts[i] > x1) x1 = s.pts[i];
        if (s.pts[i + 1] < y0) y0 = s.pts[i + 1];
        if (s.pts[i + 1] > y1) y1 = s.pts[i + 1];
      }
    }
    return { x0, y0, x1, y1 };
  }

  function mwStrokeHit(s, x, y, r) {
    const q = mwIsHL(s.c) ? r + 15 : r + 3; // fat strokes are easier to catch
    const pts = s.pts;
    if (pts.length === 2) { const dx = pts[0] - x, dy = pts[1] - y; return dx * dx + dy * dy <= q * q; }
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3];
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
      const px = x1 + t * dx - x, py = y1 + t * dy - y;
      if (px * px + py * py <= q * q) return true;
    }
    return false;
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ---------------------------------------------------------------- render
  // inner markup shared by the live page, the thumbnails and the print.
  // opts.screen adds the affordances that must never reach paper.
  function mwPageInner(page, opts) {
    const o = opts || {};
    const paper = page.paper;
    const z = mwZone(paper);
    const parts = ['<rect x="0" y="0" width="' + MW_W + '" height="' + MW_H + '" fill="#ffffff"/>'];

    // A swatch is 56px of a 1000-unit page, so a 2.2-unit rule lands at a tenth
    // of a pixel and every paper looks identically blank. Weight (and dash
    // length) are scaled up for swatches ONLY — spacing, layout and which lines
    // exist stay exactly true, so a swatch still can't misrepresent the paper.
    const kw = o.swatch ? 4.5 : 1;
    for (const ln of mwRulingLines(paper)) {
      const st = MW_LINE_STYLE[ln.kind] || MW_LINE_STYLE.base;
      parts.push('<line x1="' + ln.x1 + '" y1="' + ln.y + '" x2="' + ln.x2 + '" y2="' + ln.y + '"'
        + ' stroke="' + st.c + '" stroke-width="' + (st.w * kw) + '" stroke-opacity="' + st.o + '"'
        + (st.d ? ' stroke-dasharray="' + (o.swatch ? '30 22' : st.d) + '"' : '') + '/>');
    }

    // dividers print as hairlines: quiet paper furniture on the wall, and on
    // the A4 child's copy a blank picture-band page is a usable draw-here /
    // write-there worksheet
    if (paper.vAt != null) {
      parts.push('<line x1="' + paper.vAt + '" y1="40" x2="' + paper.vAt + '" y2="' + (MW_H - 40)
        + '" stroke="' + (o.swatch ? '#94a3b8' : '#cbd5e1') + '" stroke-width="' + (1.8 * kw) + '"/>');
    }
    if (paper.hAt != null) {
      parts.push('<line x1="40" y1="' + paper.hAt + '" x2="' + (MW_W - 40) + '" y2="' + paper.hAt
        + '" stroke="' + (o.swatch ? '#94a3b8' : '#cbd5e1') + '" stroke-width="' + (1.8 * kw) + '"/>');
    }
    // a swatch shows the picture band as a tint rather than a dashed box: the
    // box is a screen affordance on the real page, the tint is just "this is
    // where a picture goes"
    if (o.swatch && paper.hAt != null) {
      parts.push('<rect x="40" y="40" width="' + (MW_W - 80) + '" height="' + (paper.hAt - 60)
        + '" fill="#cbd5e1" fill-opacity="0.4"/>');
    }

    // the dashed "put a picture here" box is screen-only, and only while the
    // band is empty — once it holds a picture it would just be noise
    if (o.screen && paper.hAt != null && !page.imgs.length) {
      parts.push('<rect x="56" y="46" width="' + (MW_W - 112) + '" height="' + (paper.hAt - 92)
        + '" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="18 14" rx="8"/>');
    }

    // pictures sit UNDER the ink: teachers write on the printouts
    for (const im of page.imgs) parts.push(mwImgSvg(im, o));

    for (const s of page.strokes) {
      parts.push(mwStrokeSvg(s));
    }

    // Verbal-feedback stamps sit ABOVE the ink: the whole point is that they
    // are visible over the writing they refer to.
    for (const st of (page.stamps || [])) parts.push(mwStampSvg(st));

    // The teaching tags ride in the page's top margin, where there is no
    // ruling and nothing is ever written. They print, because a Cold page and
    // a Hot page pinned side by side is the evidence the tag exists for.
    if (!o.swatch) parts.push(mwTagsSvg(page));
    return parts.join('');
  }

  // One stroke, either way round. The branch is the presence of `pw`, so the
  // two kinds sit side by side on the same page and print the same.
  // ---------------------------------------------------- stamps and the tags
  // The VF stamp: a teacher marks "we talked about this" against a line, which
  // in a book is a rubber stamp and here is a tap. Deliberately not a stroke —
  // it must survive the eraser and never be half-rubbed-out.
  function mwStampSvg(st) {
    const r = 26;
    return '<g transform="translate(' + st.x + ' ' + st.y + ')">'
      + '<circle cx="0" cy="0" r="' + r + '" fill="#ffffff" fill-opacity="0.9"'
      + ' stroke="' + MW_MARK_PEN_COL + '" stroke-width="3.4"/>'
      + '<text x="0" y="8" text-anchor="middle" font-size="23" font-weight="700"'
      + ' font-family="system-ui, sans-serif" fill="' + MW_MARK_PEN_COL + '">VF</text></g>';
  }

  function mwTagsSvg(page) {
    const chips = [];
    const be = mwBookend(page.bookend);
    if (be) chips.push({ text: be[1], col: be[2], solid: true });
    const stg = mwStage(page.stage);
    if (stg) chips.push({ text: stg[1], col: MW_STAGE_COL[stg[0]], solid: false });
    if (page.lens) chips.push({ text: 'Lens: ' + page.lens, col: '#475569', solid: false });
    if (!chips.length) return '';
    let x = 40;
    const out = [];
    for (const c of chips) {
      // 9.6 units per character is the measured average for this size in a
      // system sans — near enough that a chip never clips its own text
      const w = Math.round(c.text.length * 9.6) + 26;
      out.push('<g><rect x="' + x + '" y="14" width="' + w + '" height="34" rx="17"'
        + ' fill="' + (c.solid ? c.col : '#ffffff') + '" fill-opacity="' + (c.solid ? 1 : 0.9) + '"'
        + ' stroke="' + c.col + '" stroke-width="2"/>'
        + '<text x="' + (x + w / 2) + '" y="37" text-anchor="middle" font-size="19"'
        + ' font-weight="650" font-family="system-ui, sans-serif"'
        + ' fill="' + (c.solid ? '#ffffff' : c.col) + '">' + esc(c.text) + '</text></g>');
      x += w + 10;
      if (x > MW_W - 60) break;   // never run off the page
    }
    return out.join('');
  }

  // ---------------------------------------------------------------- pictures
  // Printouts come in crooked and with a margin of nothing round the edge, so
  // a placed picture carries a rotation and a crop as well as a rectangle.
  //   rot   degrees, about the picture's own centre
  //   crop  {l, t, r, b} as fractions of the placed box trimmed off each side
  // Both are presentation only — `src` is never re-encoded, so a crop can be
  // pulled back out again and cropping twice costs nothing in quality.
  // The clip needs an id, and the same page is rendered up to four times into
  // ONE document (page, thumbnail, scrub preview, print), so ids are stamped
  // per render pass rather than per picture — duplicate ids would have every
  // copy clipped by whichever one the browser saw last.
  let mwClipSeq = 0;
  const mwCrop = (c) => {
    if (!c || typeof c !== 'object') return null;
    const f = (v) => Math.max(0, Math.min(0.45, +v || 0));
    const o = { l: f(c.l), t: f(c.t), r: f(c.r), b: f(c.b) };
    return (o.l || o.t || o.r || o.b) ? o : null;
  };
  function mwImgSvg(im, o) {
    const rot = +im.rot || 0;
    const crop = mwCrop(im.crop);
    let inner = '<image href="' + esc(im.src) + '" x="' + im.x + '" y="' + im.y
      + '" width="' + im.w + '" height="' + im.h + '" preserveAspectRatio="none"/>';
    if (crop) {
      const id = 'mwc' + (++mwClipSeq);
      const cx = im.x + im.w * crop.l, cy = im.y + im.h * crop.t;
      const cw = Math.max(1, im.w * (1 - crop.l - crop.r));
      const ch = Math.max(1, im.h * (1 - crop.t - crop.b));
      inner = '<clipPath id="' + id + '"><rect x="' + cx + '" y="' + cy
        + '" width="' + cw + '" height="' + ch + '"/></clipPath>'
        + '<g clip-path="url(#' + id + ')">' + inner + '</g>';
    }
    if (rot) {
      inner = '<g transform="rotate(' + (Math.round(rot * 10) / 10) + ' '
        + (im.x + im.w / 2) + ' ' + (im.y + im.h / 2) + ')">' + inner + '</g>';
    }
    // on screen, a cropped picture shows the trimmed-away part as a ghost while
    // the Picture tool has it selected, so a teacher can see what they cut and
    // drag it back — it never reaches paper
    if (o && o.screen && o.ghost === im.id && crop) {
      inner = '<g opacity="0.18">' + '<image href="' + esc(im.src) + '" x="' + im.x + '" y="' + im.y
        + '" width="' + im.w + '" height="' + im.h + '" preserveAspectRatio="none"/></g>' + inner;
    }
    return inner;
  }

  // a ruled shape is a polyline: run it through the midpoint smoothing that
  // makes handwriting look like handwriting and a box comes out with rounded
  // corners, which is the one thing a box is for not having
  function mwPolyPath(pts) {
    let d = 'M' + pts[0] + ' ' + pts[1];
    for (let i = 2; i + 1 < pts.length; i += 2) d += 'L' + pts[i] + ' ' + pts[i + 1];
    return d;
  }
  function mwStrokeSvg(s) {
    const a = mwStrokeAttrs(s);
    if (s.sh) {
      return '<path d="' + mwPolyPath(s.pts) + '" fill="none" stroke="' + a.stroke + '"'
        + ' stroke-width="' + a.width + '" stroke-opacity="' + a.opacity + '"'
        + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    if (s.pw && s.pw.length === s.pts.length >> 1) {
      return '<path d="' + mwOutline(s.pts, s.pw) + '" fill="' + a.stroke + '"'
        + ' fill-opacity="' + a.opacity + '" stroke="none"/>';
    }
    return '<path d="' + mwStrokePath(s.pts) + '" fill="none" stroke="' + a.stroke + '"'
      + ' stroke-width="' + a.width + '" stroke-opacity="' + a.opacity + '"'
      + ' stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function mwPageSvg(page) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + MW_W + ' ' + MW_H + '">'
      + mwPageInner(page) + '</svg>';
  }

  // ------------------------------------------------------------- pictures
  // degrade in quality steps until the encoded string fits the budget, then
  // refuse — never silently drop, never silently mangle (v1 §3 rule)
  function mwFitImage(dataUrl, cb) {
    if (typeof dataUrl !== 'string' || !/^data:image\//.test(dataUrl)) { cb(null); return; }
    if (dataUrl.length <= MW_IMG_MAX) { cb(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      for (const [wMax, q] of MW_IMG_STEPS) {
        const src = img.width || wMax;
        const scale = Math.min(1, wMax / src);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(src * scale));
        cv.height = Math.max(1, Math.round((img.height || wMax) * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const out = cv.toDataURL('image/jpeg', q);
        if (out.length <= MW_IMG_MAX) { cb(out, cv.width / cv.height); return; }
      }
      cb(null);
    };
    img.onerror = () => cb(null);
    img.src = dataUrl;
  }

  const mwUnitBytes = (p) => p.pages.reduce(
    (n, pg) => n + pg.imgs.reduce((m, im) => m + im.src.length, 0), 0);

  // the school palette is app-wide, so it is read once at boot and refreshed
  // whenever the settings panel changes it
  function loadSchoolInks() {
    const raw = typeof D.getPref === 'function' ? D.getPref('mwSchoolInks', []) : [];
    MW_SCHOOL = (Array.isArray(raw) ? raw : []).map(mwHex).filter(Boolean).slice(0, MW_SCHOOL_MAX);
    const m = typeof D.getPref === 'function' ? D.getPref('mwMarking', null) : null;
    MW_MARKING = {
      a: {
        c: (m && mwHex(m.a && m.a.c)) || MW_MARK_DEFAULT.a.c,
        label: (m && m.a && typeof m.a.label === 'string' && m.a.label.trim())
          ? m.a.label.trim().slice(0, 18) : MW_MARK_DEFAULT.a.label,
      },
      b: {
        c: (m && mwHex(m.b && m.b.c)) || MW_MARK_DEFAULT.b.c,
        label: (m && m.b && typeof m.b.label === 'string' && m.b.label.trim())
          ? m.b.label.trim().slice(0, 18) : MW_MARK_DEFAULT.b.label,
      },
    };
  }
  function loadLenses() {
    const raw = typeof D.getPref === 'function' ? D.getPref('mwLenses', null) : null;
    const list = (Array.isArray(raw) ? raw : [])
      .map((t) => (typeof t === 'string' ? t.trim().slice(0, 40) : ''))
      .filter(Boolean).slice(0, 6);
    return list.length ? list : MW_LENS_DEFAULT.slice();
  }

  function register() {
    const { WIDGETS, el, save, toast, uid, clamp } = D;
    loadSchoolInks();
    const NS = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    };

    // The school's colours: set once here, available in every modelled writing
    // widget on every deck. They sit in tier 2 beside the four writing inks
    // rather than lengthening tier 1 — Glenn's own call, and the same rule the
    // rest of this toolbar is built on.
    function buildPalette(api) {
      const wrap = el('div', {});
      const row = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;align-items:center;' });
      const commit = () => {
        if (typeof D.setPref === 'function') D.setPref('mwSchoolInks', MW_SCHOOL.slice());
        paint();
        // every open writing widget shows the same palette, so they all repaint
        if (api && api.refreshAllOf) api.refreshAllOf('modelwrite')();
        else if (api && api.refresh) api.refresh();
      };
      function paint() {
        row.innerHTML = '';
        MW_SCHOOL.forEach((hex, i) => {
          const inp = el('input', { type: 'color', class: 'mw-pal-swatch', title: 'School colour ' + (i + 1) });
          inp.value = hex;
          inp.addEventListener('change', () => {
            const v = mwHex(inp.value);
            if (!v) return;
            MW_SCHOOL[i] = v;
            commit();
          });
          row.append(el('span', { class: 'mw-pal-cell' }, inp,
            el('button', {
              class: 'mw-pal-x', title: 'Remove this colour',
              onclick: () => { MW_SCHOOL.splice(i, 1); commit(); },
            }, '✕')));
        });
        if (MW_SCHOOL.length < MW_SCHOOL_MAX) {
          row.append(el('button', {
            class: 'btn ghost small',
            title: 'Add one of your school’s colours to the pen row',
            onclick: () => { MW_SCHOOL.push('#7c3aed'); commit(); },
          }, '+ Add a colour'));
        }
      }
      paint();
      wrap.append(
        D.settingRow ? D.settingRow('School colours', row)
          : el('div', { class: 'row' }, el('span', {}, 'School colours'), row),
        el('div', { class: 'hint' }, 'Set once, for every writing page on every deck — house colours for '
          + 'headings, or the ones your marking policy uses. They appear after the four writing inks on the '
          + 'pen row. Changing one also changes writing already done in it, because it is the same slot; the '
          + 'four standard inks never move, so nothing else on the page can shift.'),
      );
      return wrap;
    }

    // §8.1's "two highlighters with school-set meanings and polarity". Which
    // colour means what is a school policy, not a fact — "tickled pink and
    // green for growth" is one convention and plenty of schools invert it —
    // so both the colour and the words belong to the teacher.
    function buildMarking(api) {
      const wrap = el('div', {});
      const row = el('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap;align-items:center;' });
      const commit = () => {
        if (typeof D.setPref === 'function') {
          D.setPref('mwMarking', { a: Object.assign({}, MW_MARKING.a), b: Object.assign({}, MW_MARKING.b) });
        }
        if (api && api.refreshAllOf) api.refreshAllOf('modelwrite')();
        else if (api && api.refresh) api.refresh();
      };
      for (const key of ['a', 'b']) {
        const col = el('input', { type: 'color', class: 'mw-pal-swatch', title: 'Highlighter colour' });
        col.value = MW_MARKING[key].c;
        col.addEventListener('change', () => {
          const v = mwHex(col.value);
          if (v) { MW_MARKING[key].c = v; commit(); }
        });
        const lab = el('input', {
          type: 'text', class: 'text-input mw-mark-label', maxlength: '18',
          placeholder: key === 'a' ? 'Good here' : 'Think again',
        });
        lab.value = MW_MARKING[key].label;
        lab.addEventListener('change', () => {
          MW_MARKING[key].label = lab.value.trim().slice(0, 18) || MW_MARK_DEFAULT[key].label;
          lab.value = MW_MARKING[key].label;
          commit();
        });
        row.append(el('span', { class: 'mw-mark-pair' }, col, lab));
      }
      wrap.append(
        D.settingRow ? D.settingRow('Marking code', row)
          : el('div', { class: 'row' }, el('span', {}, 'Marking code'), row),
        el('div', { class: 'hint' }, 'Your school’s two marking highlighters and what each one means. '
          + 'The words show on the toolbar next to the colour, so the class can read the code off the '
          + 'board rather than having to remember it. The editing pen is purple and the VF stamp marks '
          + 'where you gave feedback out loud.'),
      );
      return wrap;
    }

    // §8.1's focus lenses. The neutral trio ships as the default; a school with
    // a branded lens system types its own in and never sees ours again.
    function buildLenses(api) {
      const wrap = el('div', {});
      const area = el('textarea', { class: 'names-area mw-lens-area', rows: '3', placeholder: MW_LENS_DEFAULT.join('\n') });
      area.value = loadLenses().join('\n');
      area.addEventListener('change', () => {
        const list = area.value.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 6);
        if (typeof D.setPref === 'function') D.setPref('mwLenses', list);
        area.value = loadLenses().join('\n');
        if (api && api.refreshAllOf) api.refreshAllOf('modelwrite')();
      });
      wrap.append(
        D.settingRow ? D.settingRow('Focus lenses', area)
          : el('div', { class: 'row' }, el('span', {}, 'Focus lenses'), area),
        el('div', { class: 'hint' }, 'One per line, up to six. A page can carry today’s lens — what the '
          + 'class is looking for while you write — and it prints with the page. Leave it blank for the '
          + 'neutral three: a sense idea, a grammar tool, a literary device.'),
      );
      return wrap;
    }

    WIDGETS.modelwrite = {
      // shorter than v1's 760: at that height the widget ran under the stage's
      // own dock on a laptop screen (Glenn, 2026-07-26)
      title: 'Modelled writing', icon: 'modelwrite', accent: '#fbcfe8', w: 640, h: 620,
      defaults: () => ({
        pages: [{ id: uid(), name: '', locked: false, strokes: [], imgs: [], paper: mwPaper(null) }],
        cur: null,
        newPaper: mwPaper(null),
      }),
      toPrintable(w) {
        const p = w.props;
        const pg = (p.pages || []).find((x) => x && x.id === p.cur) || (p.pages || [])[0];
        // a blank ruled page prints on purpose — it's handwriting paper
        return pg ? mwPageSvg(pg) : null;
      },
      // §4.6: the whole washing line, so the teacher ticks the pages worth the
      // paper. Most of a unit is working-out; only some pages are a Big Write.
      toPrintablePages(w) {
        return (w.props.pages || []).map((pg, i) => ({
          svg: mwPageSvg(pg),
          // a named page names itself in the print dialog too, so ticking the
          // pages worth the paper is done by meaning rather than by number
          label: pg.name || (mwBookend(pg.bookend) ? mwBookend(pg.bookend)[1] : 'Page ' + (i + 1)),
        }));
      },
      printCurrent(w) {
        const i = (w.props.pages || []).findIndex((x) => x && x.id === w.props.cur);
        return i < 0 ? 0 : i;
      },
      // a unit holds work the moment there is a mark or a picture anywhere in
      // it — a blank one closes without a word, so the question only ever
      // appears when there is genuinely something to lose
      hasWork(w) {
        return (w.props.pages || []).some((pg) => pg
          && ((pg.strokes && pg.strokes.length) || (pg.imgs && pg.imgs.length)
            || (pg.stamps && pg.stamps.length)));
      },

      mount(body, w, api) {
        body.classList.add('mwwidget');
        const p = w.props;

        // ---- mount hardening + v1 migration (phonemetiles pattern)
        // a widget saved before v2 carries widget-level ruling/lineSize; stamp
        // that paper onto every page, seed the new-page default from it, and
        // drop the old keys. No saved page changes appearance.
        let legacy = null;
        if (p.ruling || p.lineSize) {
          legacy = mwPaper({
            ruling: p.ruling,
            size: { s: 1, m: 2, l: 3 }[p.lineSize] != null ? { s: 1, m: 2, l: 3 }[p.lineSize] : 2,
          });
          delete p.ruling; delete p.lineSize;
        }
        p.newPaper = mwPaper(p.newPaper || legacy);
        p.barAt = MW_BAR_AT.includes(p.barAt) ? p.barAt : 'top';
        // where the page-turn buttons sit vertically, as a fraction of the page:
        // teachers move them out of the way when they need the writing space
        p.turnY = typeof p.turnY === 'number' && p.turnY >= 0.08 && p.turnY <= 0.92 ? p.turnY : 0.5;
        p.pages = (Array.isArray(p.pages) ? p.pages : []).filter((pg) => pg && typeof pg === 'object').slice(0, MW_PAGE_CAP);
        const seenIds = new Set();
        for (const pg of p.pages) {
          pg.id = typeof pg.id === 'string' && pg.id && !seenIds.has(pg.id) ? pg.id : uid();
          seenIds.add(pg.id);
          // a page can carry a name ("Cold write", "Model 1", "Big Write") so
          // the washing line is navigable by meaning rather than by counting
          // thumbnails, and a lock so a finished Big Write survives a stray
          // stylus touch from a child walking past the board
          pg.name = typeof pg.name === 'string' ? pg.name.slice(0, 28) : '';
          pg.locked = !!pg.locked;
          // §8.1 teaching tags — display labels, no behaviour
          if (!mwStage(pg.stage)) delete pg.stage;
          if (!mwBookend(pg.bookend)) delete pg.bookend;
          if (typeof pg.lens === 'string' && pg.lens.trim()) pg.lens = pg.lens.trim().slice(0, 40);
          else delete pg.lens;
          pg.stamps = (Array.isArray(pg.stamps) ? pg.stamps : [])
            .filter((s) => s && typeof s === 'object').slice(0, 40);
          for (const s of pg.stamps) {
            s.id = typeof s.id === 'string' && s.id ? s.id : uid();
            s.x = clampInt(s.x, 0, MW_W);
            s.y = clampInt(s.y, 0, MW_H);
          }
          if (!pg.stamps.length) delete pg.stamps;
          pg.paper = mwPaper(pg.paper || legacy);
          pg.strokes = (Array.isArray(pg.strokes) ? pg.strokes : [])
            .filter((s) => s && Array.isArray(s.pts) && s.pts.length >= 2 && s.pts.length % 2 === 0)
            .slice(0, MW_STROKE_CAP);
          for (const s of pg.strokes) {
            s.c = Number.isInteger(+s.c) && +s.c >= 0 && +s.c < MW_SCHOOL_AT + MW_SCHOOL_MAX ? +s.c : 0;
            // no `w` means a stroke written before pen thicknesses existed
            if (s.w != null) s.w = clampInt(s.w, 2, 40);
            // load-time sanitisation of foreign saves: per-axis clamp and a
            // hard per-stroke point bound (review findings, 2026-07-26)
            if (s.pts.length > 8000) s.pts = s.pts.slice(0, 8000);
            s.pts = s.pts.map((n, i) => clamp(Math.round(+n || 0), 0, i % 2 ? MW_H : MW_W));
            // per-point widths: keep only if they still line up with the points
            // after the clamping above, otherwise the stroke falls back to its
            // single `w` and renders as it always did rather than as a mess
            if (Array.isArray(s.pw) && s.pw.length === s.pts.length >> 1) {
              s.pw = s.pw.map((n) => clampInt(n, 1, 60));
            } else if (s.pw != null) {
              delete s.pw;
            }
            if (s.sh) s.sh = 1; else delete s.sh;
          }
          pg.imgs = (Array.isArray(pg.imgs) ? pg.imgs : [])
            .filter((im) => im && typeof im.src === 'string' && /^data:image\//.test(im.src))
            .slice(0, MW_IMG_PER_PAGE);
          for (const im of pg.imgs) {
            im.id = typeof im.id === 'string' && im.id ? im.id : uid();
            im.w = clampInt(im.w, 40, MW_W);
            im.h = clampInt(im.h, 40, MW_H);
            im.x = clampInt(im.x, 0, MW_W - im.w);
            im.y = clampInt(im.y, 0, MW_H - im.h);
            // rotation and crop are presentation, so a bad one is dropped
            // rather than allowed to hide the picture it describes
            im.rot = Number.isFinite(+im.rot) ? Math.round(((+im.rot % 360) + 360) % 360 * 10) / 10 : 0;
            if (im.rot === 0) delete im.rot;
            const c = mwCrop(im.crop);
            if (c) im.crop = c; else delete im.crop;
          }
        }
        // built AFTER the loop above, so it has to carry the same shape by hand
        // or it is the one page in the app missing `name` and `locked`
        if (!p.pages.length) {
          p.pages.push({ id: uid(), name: '', locked: false, strokes: [], imgs: [], paper: mwPaper(null) });
        }
        if (!p.pages.some((pg) => pg.id === p.cur)) p.cur = p.pages[0].id;

        // Tool identity is separate from what the tool is set to. That split is
        // the whole point of the two-tier bar: the TOOLS never move, and their
        // settings live in a row of their own. It also means picking up the
        // eraser and putting it down again returns the pen exactly as it was.
        let tool = 'pen';      // 'pen' | 'hl' | 'erase' | 'lift' | 'lasso' | 'pic'
        let ink = 0;           // pen colour, index into MW_INKS (0–3)
        let hlW = 1;           // highlighter width, index into MW_HL_W
        let hlInk = MW_HL;     // highlighter colour, index into MW_INKS (4–7)
        let drawing = null;    // single-pointer lock while a stroke is live
        let liveEl = null;
        let selImg = null;     // selected picture id (Picture tool only)
        let paperOpen = false; // while the paper panel is open the page edits its LAYOUT
        let penW = 1;          // index into MW_PEN_W
        let eraseR = 1;        // index into MW_ERASE_R
        let lasso = null;      // live lasso polygon while dragging
        let sel = [];          // strokes picked up by the lasso
        let softWarned = false; // the "this unit is getting long" nudge, once
        let shape = 'free';    // pen edge: 'free' | 'line' | 'box'
        let markInk = MW_MARK_A;  // which marking colour is in hand
        let markStamp = false;    // the VF stamp is up, so a tap places one
        const stacks = MW_STACKS.get(w) || new Map();
        MW_STACKS.set(w, stacks);
        const ask = D.confirmDialog || ((m, onYes) => { if (window.confirm(m)) onYes(); });
        const stack = () => { if (!stacks.has(p.cur)) stacks.set(p.cur, []); return stacks.get(p.cur); };

        // ------------------------------------------------- undo that persists
        // Undo used to hold live stroke OBJECTS and find them again with
        // indexOf, which works beautifully in memory and cannot survive a
        // reload: after a restart every stroke is a different object and every
        // route back was gone. Ops are now positional — an index and, where
        // needed, the stroke's value — which is sound because undo is strictly
        // LIFO: when an op is popped the array is exactly as that op left it.
        // The history then serialises, and lives in IndexedDB rather than
        // localStorage, where 50 ops (a lasso op carries a whole page of
        // strokes) would have eaten the live state's 5MB budget.
        const UNDO_KEY = 'mw-undo:' + w.id;
        const UNDO_BUDGET = 400 * 1024;   // per unit, newest ops win
        const touched = new Set();        // pages edited this session — never clobbered by the async load
        let undoTimer = null;
        const opWeight = (op) => {
          let n = 40;
          const add = (s) => { n += 24 + (s && s.pts ? s.pts.length * 4 : 0); };
          if (op.s) add(op.s);
          if (op.was && op.was.pts) add(op.was);
          if (Array.isArray(op.was)) op.was.forEach(add);
          if (Array.isArray(op.removed)) op.removed.forEach((r) => add(r.s));
          if (Array.isArray(op.moved)) op.moved.forEach((m) => { n += 8 + (m.pts ? m.pts.length * 4 : 0); });
          if (op.im && op.im.src) n += op.im.src.length;
          return n;
        };
        function saveStacks() {
          if (!window.SageSnapshots) return;
          clearTimeout(undoTimer);
          undoTimer = setTimeout(() => {
            const out = {};
            let total = 0;
            // newest ops across the whole unit win the budget, so the page
            // being written on keeps its history while a page from Monday
            // gives its up first
            const flat = [];
            for (const [pid, ops] of stacks) ops.forEach((op, i) => flat.push({ pid, i, op }));
            flat.sort((a, b) => b.i - a.i);
            for (const f of flat) {
              const wgt = opWeight(f.op);
              if (total + wgt > UNDO_BUDGET) continue;
              total += wgt;
              (out[f.pid] = out[f.pid] || []).push(f.op);
            }
            for (const pid in out) out[pid].reverse(); // back into oldest-first order
            SageSnapshots.putAux(UNDO_KEY, out);
          }, 1200);
        }
        const pushUndo = (op) => {
          const st = stack();
          touched.add(p.cur);
          st.push(op);
          if (st.length > 50) st.shift();
          saveStacks();
        };
        if (window.SageSnapshots && !stacks.size) {
          SageSnapshots.getAux(UNDO_KEY).then((data) => {
            if (!data || typeof data !== 'object') return;
            const live = new Set(p.pages.map((pg) => pg.id));
            for (const pid in data) {
              // a page edited since mount keeps the history it earned; a page
              // that has since been deleted gets nothing
              if (touched.has(pid) || !live.has(pid) || !Array.isArray(data[pid])) continue;
              if (stacks.has(pid) && stacks.get(pid).length) continue;
              stacks.set(pid, data[pid].filter((op) => op && typeof op.t === 'string').slice(-50));
            }
          }).catch(() => { /* no history is survivable; a broken mount is not */ });
        }

        body.innerHTML = '';
        const tools = el('div', { class: 'mw-tools' });
        const bar = el('div', { class: 'mw-bar' });      // tier 1: never reflows
        const opts = el('div', { class: 'mw-opts' });    // tier 2: the live tool's settings
        tools.append(bar, opts);
        const stage = el('div', { class: 'mw-stage' });
        const pageBox = el('div', { class: 'mw-pagebox' });
        const svg = svgEl('svg', { viewBox: '0 0 ' + MW_W + ' ' + MW_H, class: 'mw-page' });
        pageBox.append(svg);
        // page-turn buttons pinned to the page's own left and right borders,
        // draggable up and down because they must never sit on the writing
        const turnL = el('button', { class: 'mw-turn mw-turn-l', title: 'Previous page' }, '‹');
        const turnR = el('button', { class: 'mw-turn mw-turn-r', title: 'Next page' }, '›');
        pageBox.append(turnL, turnR);
        // The zoom cluster lives on the page's own corner rather than in the
        // toolbar: tier 1 is full, and three controls that appear and disappear
        // would be exactly the reflow the two-tier bar exists to prevent.
        const zOut = el('button', { class: 'mw-zbtn', title: 'Zoom out' }, '−');
        const zLab = el('button', { class: 'mw-zlab', title: 'Back to the whole page' }, '100%');
        const zIn = el('button', { class: 'mw-zbtn', title: 'Zoom in — for letter formation, and for a more precise lasso and eraser' }, '+');
        const zHand = el('button', { class: 'mw-zbtn mw-zhand', title: 'Move the page under your hand (only when zoomed in)' }, '✋');
        const zoomBox = el('div', { class: 'mw-zoom' }, zOut, zLab, zIn, zHand);
        pageBox.append(zoomBox);

        // ------------------------------------------------ Big Write focus mode
        // §8.1, and the camera principle: widget first, Focus for the room. It
        // is a MODE of this widget, not a second one — the page being written
        // on is the same page, so nothing has to be moved into it and nothing
        // is lost coming out. Everything it adds is calm and low-chrome: the
        // room is meant to be writing, not reading the screen.
        let bigWrite = false, bwEnd = 0, bwTick = null;
        const bwBar = el('div', { class: 'mw-bw' });
        function bwFmt(ms) {
          const s = Math.max(0, Math.round(ms / 1000));
          return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }
        function paintBigWrite() {
          body.classList.toggle('mw-bigwrite', bigWrite);
          if (!bigWrite) { bwBar.remove(); return; }
          bwBar.innerHTML = '';
          const pg = page();
          const clock = el('span', { class: 'mw-bw-clock' },
            bwEnd ? bwFmt(bwEnd - Date.now()) : '—');
          bwBar.append(
            el('span', { class: 'mw-bw-title' }, 'Big Write'),
            pg.lens ? el('span', { class: 'mw-bw-lens' }, pg.lens) : null,
            el('span', { class: 'grow' }),
            clock,
            ...[5, 10, 15, 20].map((m) => el('button', {
              class: 'btn ghost small', title: 'Write for ' + m + ' minutes',
              onclick: () => { bwEnd = Date.now() + m * 60000; startBwTick(); },
            }, m + 'm')),
            el('button', {
              class: 'btn ghost small', title: 'Stop the clock',
              onclick: () => { bwEnd = 0; stopBwTick(); paintBigWrite(); },
            }, 'Stop'),
            el('button', {
              class: 'btn small', title: 'Leave Big Write and bring the tools back',
              onclick: () => setBigWrite(false),
            }, 'Done'),
          );
          if (!bwBar.parentElement) body.insertBefore(bwBar, stage);
        }
        function startBwTick() {
          stopBwTick();
          bwTick = setInterval(() => {
            const left = bwEnd - Date.now();
            const c = bwBar.querySelector('.mw-bw-clock');
            if (c) c.textContent = bwEnd ? bwFmt(left) : '—';
            if (bwEnd && left <= 0) {
              bwEnd = 0; stopBwTick();
              toast('Pens down — Big Write time is up', { ms: 8000 });
              paintBigWrite();
            }
          }, 500);
          paintBigWrite();
        }
        function stopBwTick() { if (bwTick) { clearInterval(bwTick); bwTick = null; } }
        function setBigWrite(on) {
          bigWrite = !!on;
          if (!bigWrite) { bwEnd = 0; stopBwTick(); }
          closePop(); closePageMenu();
          paintBigWrite(); paintAll();
        }
        zOut.addEventListener('click', () => setZoom(zoomI - 1));
        zIn.addEventListener('click', () => setZoom(zoomI + 1));
        zLab.addEventListener('click', () => setZoom(0));
        zHand.addEventListener('click', () => {
          if (zoomI === 0) { toast('Zoom in first — there is nothing to move at 100%'); return; }
          panning = !panning;
          applyView();
        });
        stage.append(pageBox);
        const strip = el('div', { class: 'mw-strip' });
        const pop = el('div', { class: 'mw-pop', style: 'display:none' });
        // bar position is a per-teacher constant, not a mid-lesson change:
        // right- or left-handed, standing either side of the board, and EYFS
        // boards hung low enough that the bar wants to be underneath
        body.dataset.barAt = p.barAt;
        body.append(tools, pop, stage, strip);
        // the scrub preview floats over the widget, NOT inside the strip —
        // inside it would scroll away with the thumbnails and be wiped by
        // every paintStrip
        const peekWrap = el('div', { class: 'mw-peek-wrap' });
        body.append(peekWrap);

        const page = () => p.pages.find((pg) => pg.id === p.cur) || p.pages[0];
        const paper = () => page().paper;

        // ------------------------------------------------------ zoom and pan
        // Letter formation on a board is done at the size of a letter, not at
        // the size of an A4 page shrunk into a widget — and the lasso and the
        // part-eraser are only as precise as the pixels under them. Zoom is a
        // VIEW, never data: the viewBox moves, the page and every stroke on it
        // are untouched, so nothing about what prints can change here.
        // Deliberately not saved: a teacher who reopens a unit should find the
        // whole page, the way they left the paper — not yesterday's close-up.
        const MW_ZOOMS = [1, 1.5, 2, 3, 4];
        let zoomI = 0, panX = 0, panY = 0;
        const zoom = () => MW_ZOOMS[zoomI];
        const viewW = () => MW_W / zoom();
        const viewH = () => MW_H / zoom();
        function clampPan() {
          panX = clamp(panX, 0, MW_W - viewW());
          panY = clamp(panY, 0, MW_H - viewH());
        }
        function applyView() {
          clampPan();
          svg.setAttribute('viewBox', Math.round(panX) + ' ' + Math.round(panY)
            + ' ' + Math.round(viewW()) + ' ' + Math.round(viewH()));
          zoomBox.classList.toggle('mw-zoomed', zoomI > 0);
          if (zoomI === 0) panning = false;
          pageBox.classList.toggle('mw-panning', panning);
          zLab.textContent = Math.round(zoom() * 100) + '%';
          zHand.classList.toggle('mw-zactive', panning);
          zOut.disabled = zoomI === 0;
          zIn.disabled = zoomI === MW_ZOOMS.length - 1;
        }
        // zoom about the middle of what is currently on screen, so the thing
        // being looked at stays being looked at
        function setZoom(i) {
          const cx = panX + viewW() / 2, cy = panY + viewH() / 2;
          zoomI = clamp(i, 0, MW_ZOOMS.length - 1);
          panX = cx - viewW() / 2;
          panY = cy - viewH() / 2;
          if (zoomI === 0) { panX = 0; panY = 0; panning = false; }
          applyView();
        }
        let panning = false;   // the hand: drag moves the page instead of writing

        // ------------------------------------------------------------ paint
        function paintPage() {
          svg.innerHTML = mwPageInner(page(), {
            screen: true,
            ghost: tool === 'pic' ? selImg : null,   // show what a crop cut away
          });
          liveEl = null;
          const pg = page();
          // selection chrome and divider handles live OUTSIDE mwPageInner, so
          // they can never reach paper
          if (tool === 'pic' && selImg) {
            const im = pg.imgs.find((x) => x.id === selImg);
            if (im) {
              svg.append(svgEl('rect', {
                class: 'mw-selbox', x: im.x, y: im.y, width: im.w, height: im.h,
                fill: 'none', stroke: '#0e7490', 'stroke-width': 4, 'stroke-dasharray': '12 8',
              }));
              svg.append(svgEl('rect', {
                class: 'mw-handle', x: im.x + im.w - 34, y: im.y + im.h - 34,
                width: 34, height: 34, rx: 6, fill: '#0e7490',
              }));
              // crop grips, one per edge: dragging an edge inwards trims that
              // side of the printout. Cropping by dragging the picture's own
              // edge is what a teacher expects; a panel of four numbers is not.
              for (const g of cropGrips(im)) {
                svg.append(svgEl('rect', {
                  class: 'mw-cropgrip', x: g.x, y: g.y, width: g.w, height: g.h, rx: 5,
                  fill: '#f59e0b', 'fill-opacity': 0.9,
                }));
              }
            }
          }
          if (lasso && lasso.length >= 4) {
            svg.append(svgEl('polyline', {
              class: 'mw-lasso', points: lasso.join(' '), fill: 'rgba(14,116,144,.08)',
              stroke: '#0e7490', 'stroke-width': 4, 'stroke-dasharray': '16 12',
              'stroke-linejoin': 'round',
            }));
          }
          if (sel.length) {
            const b = mwBounds(sel);
            svg.append(svgEl('rect', {
              class: 'mw-selbox', x: b.x0 - 14, y: b.y0 - 14,
              width: b.x1 - b.x0 + 28, height: b.y1 - b.y0 + 28,
              fill: 'rgba(14,116,144,.07)', stroke: '#0e7490', 'stroke-width': 4,
              'stroke-dasharray': '14 10', rx: 10,
            }));
          }
          if (paperOpen) {
            const pa = pg.paper;
            if (pa.vAt != null) {
              svg.append(svgEl('rect', {
                class: 'mw-grip', x: pa.vAt - 12, y: 40, width: 24, height: MW_H - 80,
                fill: '#0e7490', 'fill-opacity': 0.18,
              }));
            }
            if (pa.hAt != null) {
              svg.append(svgEl('rect', {
                class: 'mw-grip', x: 40, y: pa.hAt - 12, width: MW_W - 80, height: 24,
                fill: '#0e7490', 'fill-opacity': 0.18,
              }));
            }
          }
        }
        function paintThumbActive() {
          const i = p.pages.indexOf(page());
          const th = strip.children[i];
          const ts = th && th.querySelector('svg');
          if (ts) ts.innerHTML = mwPageInner(page());
        }

        // cue is the pill's family colour; the tint costs no width, which a dot
        // would (nine dots pushed tier 1 back onto two rows)
        function toolBtn(label, active, title, fn, cue, icon) {
          const b = el('button', {
            class: 'btn ghost small mw-pill' + (active ? ' mw-active' : ''), title, onclick: fn,
          },
          icon && D.iconEl ? D.iconEl(icon) : null,
          el('span', { class: 'mw-pill-lab' }, label));
          if (cue) {
            b.style.setProperty('--cue', cue);
            b.style.setProperty('--cue-bg', mwAlpha(cue, active ? '38' : '1c'));
            b.style.setProperty('--cue-bd', mwAlpha(cue, active ? 'ff' : '66'));
            b.style.setProperty('--acc', mwAlpha(cue, '55'));
          }
          return b;
        }

        // Tier 1 wrapping to two rows is the one thing this bar must never do —
        // a second row moves every control a teacher reaches for. Icons are the
        // answer, but words are better wherever there is room for them, so the
        // row keeps its words until they would cost a second row and drops to
        // icons alone at exactly that point. The active tool is still named, in
        // tier 2, which is where its settings already say it.
        // The decision is "does the content need more width than the row has",
        // measured ONCE per repaint and then compared. Deciding it from the
        // bar's own height instead meant toggling the class inside the resize
        // observer that watches the bar — which re-enters the observer and can
        // leave the row stuck in whichever state it happened to be in. Width is
        // the honest input anyway: dropping the words changes the row's height,
        // never its width, so this converges on the first pass.
        let barNeed = 0;
        function fitBar() {
          // a vertical bar is a column of words at its widest — always icons
          if (p.barAt === 'left' || p.barAt === 'right') { bar.classList.add('mw-compact'); return; }
          if (!barNeed) {
            const was = bar.classList.contains('mw-compact');
            bar.classList.remove('mw-compact');
            for (const k of bar.children) {
              if (!k.classList.contains('grow')) barNeed += k.offsetWidth + 4;
            }
            if (was) bar.classList.add('mw-compact');
          }
          if (!barNeed) return;
          bar.classList.toggle('mw-compact', bar.clientWidth < barNeed);
        }

        // ------------------------------------------------------ the two tiers
        // TIER 1 — the tools. This row is identical whatever is selected, so a
        // teacher's reach for "Clear" lands on Clear even after picking up the
        // eraser. Options used to be injected here, which shoved every button
        // to their right along and put the eraser's sizes eight controls away
        // from the eraser (Glenn, 2026-07-26). Nothing contextual belongs here.
        const setTool = (t) => {
          tool = t; selImg = null; sel = []; closePop(); paintTools(); paintPage();
        };
        function paintBar() {
          bar.innerHTML = '';
          barNeed = 0;   // the row's contents changed; re-measure what it needs
          // a school colour the teacher has since removed must not leave the
          // pen pointing at nothing
          if (ink >= MW_SCHOOL_AT && ink - MW_SCHOOL_AT >= MW_SCHOOL.length) ink = 0;
          bar.append(
            // Pen and Highlighter wear the ink they are set to, so the pill
            // says what you are holding without being read
            toolBtn('Pen', tool === 'pen', 'Write — colour and thickness are below',
              () => setTool('pen'), inkAt(ink), 'marker'),
            toolBtn('Highlighter', tool === 'hl', 'Highlight over the writing',
              () => setTool('hl'), inkAt(hlInk), 'hilite'),
            toolBtn('Eraser', tool === 'erase', 'Rubs out only what it touches — take the e out of a joined “ie” and the i stays',
              () => setTool('erase'), MW_CUE.erase, 'eraser'),
            toolBtn('Lift', tool === 'lift', 'Lift a whole stroke off in one tap — the fastest way to undo a modelled word',
              () => setTool('lift'), MW_CUE.lift, 'lift'),
            toolBtn('Lasso', tool === 'lasso', 'Draw round some writing to move it, or copy it to another page',
              () => setTool('lasso'), MW_CUE.lasso, 'lasso'),
            toolBtn('Picture', tool === 'pic', 'Add a printout or clipart — it sits under your writing',
              () => setTool('pic'), MW_CUE.pic, 'image'),
            toolBtn('Marking', tool === 'mark', 'Mark the writing with the class — your two highlighter meanings, the editing pen and the VF stamp',
              () => setTool('mark'), MW_CUE.mark, 'tick'),
            el('span', { class: 'mw-sep' }),
            toolBtn('Paper', paperOpen, 'This page’s paper — lines, layout and line height',
              () => { paperOpen ? closePop() : openPop(); }, MW_CUE.paper, 'paper'),
            el('span', { class: 'mw-sep' }),
            toolBtn('Undo', false, 'Undo (this page)', undo, MW_CUE.undo, 'undo'),
            toolBtn('Clear', false, 'Clear this page', clearPage, MW_CUE.clear, 'trash'),
            el('span', { class: 'grow' }),
            el('button', {
              class: 'btn ghost small mw-bwbtn', title: 'Big Write — the page, a clock and nothing else',
              onclick: () => setBigWrite(true),
            }, D.iconEl ? D.iconEl('spot') : '◎', el('span', { class: 'mw-pill-lab' }, 'Big Write')),
            el('button', {
              class: 'btn small mw-print', title: 'Print — pick the pages worth the paper',
              onclick: () => {
                if (drawing) return;
                if (!window.SagePrint) { toast('Print engine not loaded'); return; }
                SagePrint.openDialog(WIDGETS.modelwrite.toPrintablePages(w), {
                  title: 'Modelled writing', current: p.pages.indexOf(page()),
                });
              },
            }, D.iconEl('print'), el('span', { class: 'mw-pill-lab' }, 'Print…')),
          );
        }

        // TIER 2 — whatever the live tool is set to. Always present, always in
        // the same place, so its contents change but its home never does. This
        // is where a longer palette or a new tool's settings go, rather than
        // lengthening tier 1.
        function sizeRow(values, current, labels, onPick, cls, px) {
          const row = el('span', { class: 'mw-family mw-nibs' });
          values.forEach((v, i) => {
            const b = el('button', {
              class: 'mw-nib' + (cls || '') + (current === i ? ' active' : ''),
              title: labels[i], onclick: () => { onPick(i); paintOpts(); },
            });
            b.style.setProperty('--nib', px(i) + 'px');
            row.append(b);
          });
          return row;
        }
        function optLabel(text) { return el('span', { class: 'mw-opt-lab' }, text); }
        function optBtn(label, title, fn, cls) {
          return el('button', { class: 'btn ghost small' + (cls || ''), title, onclick: fn }, label);
        }

        function paintOpts() {
          opts.innerHTML = '';
          if (tool === 'pen') {
            const inks = el('span', { class: 'mw-family' });
            // only the writing colours here — the highlighter is its own tool
            // now, so it no longer has to masquerade as a fifth pen. The
            // school's own colours follow them in the same row: tier 2 is where
            // a longer palette belongs, rather than a longer tier 1.
            const swatchIdx = [];
            for (let i = 0; i < MW_INKS.length; i++) if (!mwIsHL(i)) swatchIdx.push(i);
            for (let i = 0; i < MW_SCHOOL.length; i++) swatchIdx.push(MW_SCHOOL_AT + i);
            swatchIdx.forEach((i) => {
              const b = el('button', {
                class: 'mw-tool' + (ink === i ? ' active' : '') + (i >= MW_SCHOOL_AT ? ' mw-school' : ''),
                title: inkName(i),
                onclick: () => { ink = i; paintTools(); },  // the Pen pill wears this colour
              });
              b.style.setProperty('--ink', inkAt(i));
              inks.append(b);
            });
            // Straight edges for the plain side of a split page — a story
            // mountain, a boxed-up plan, a table of contrasting conjunctions.
            // A modifier on the pen rather than a tool of its own: tier 1 is
            // full, and these are the same pen in the same colour.
            const shapes = el('span', { class: 'mw-family mw-shapes' });
            [['free', 'Freehand', 'scribble'], ['line', 'Straight line', 'linetool'],
              ['box', 'Box', 'recttool']].forEach(([k, t, ic]) => {
              shapes.append(el('button', {
                class: 'mw-nib mw-shape' + (shape === k ? ' active' : ''),
                title: t, onclick: () => { shape = k; paintOpts(); },
              }, D.iconEl ? D.iconEl(ic) : t[0]));
            });
            opts.append(optLabel('Pen'), inks,
              sizeRow(MW_PEN_W, penW, ['Fine', 'Medium', 'Thick'],
                (i) => { penW = i; }, '', (i) => 5 + i * 4),
              shapes);
          } else if (tool === 'hl') {
            const hls = el('span', { class: 'mw-family' });
            for (let i = MW_HL; i <= MW_HL_LAST; i++) {
              const b = el('button', {
                class: 'mw-tool mw-hl' + (hlInk === i ? ' active' : ''),
                title: MW_INK_NAMES[i], onclick: () => { hlInk = i; paintTools(); },
              });
              b.style.setProperty('--ink', MW_INKS[i]);
              hls.append(b);
            }
            opts.append(optLabel('Highlighter'), hls,
              sizeRow(MW_HL_W, hlW, ['Narrow', 'Medium', 'Broad'],
                (i) => { hlW = i; }, ' mw-hlnib', (i) => 8 + i * 5));
          } else if (tool === 'erase') {
            opts.append(optLabel('Eraser'),
              sizeRow(MW_ERASE_R, eraseR, ['Small', 'Medium', 'Large'],
                (i) => { eraseR = i; }, ' mw-rub', (i) => 6 + i * 5));
          } else if (tool === 'lift') {
            opts.append(optLabel('Lift'),
              el('span', { class: 'mw-opt-hint' }, 'Tap a stroke to take the whole thing off.'));
          } else if (tool === 'lasso') {
            opts.append(optLabel('Lasso'));
            if (sel.length) {
              opts.append(
                optBtn('Copy', 'Copy the selected writing — paste it on any page', copySel),
                optBtn('Delete', 'Delete the selected writing', delSel, ' mw-dangerp'));
            }
            if (MW_CLIP && MW_CLIP.length) {
              opts.append(optBtn('Paste', 'Paste the copied writing onto this page', pasteSel));
            }
            if (!sel.length) {
              opts.append(el('span', { class: 'mw-opt-hint' },
                'Draw a loop over some writing — whatever falls inside comes away.'));
            }
          } else if (tool === 'mark') {
            // §8.1's marking palette: two highlighters carrying the school's
            // own meanings, the purple editing pen, and the VF stamp. The
            // meanings are LABELLED here rather than left as colours to
            // remember — a marking code only works if the room can read it.
            const pick = (i, label, isHL) => {
              const b = el('button', {
                class: 'mw-mark' + (markInk === i ? ' active' : ''),
                title: isHL ? 'Highlight — ' + label : label,
                onclick: () => { markInk = i; markStamp = false; paintTools(); },
              },
              el('span', { class: 'mw-mark-dot' + (isHL ? ' hl' : '') }),
              el('span', {}, label));
              b.style.setProperty('--ink', inkAt(i));
              return b;
            };
            opts.append(optLabel('Marking'),
              pick(MW_MARK_A, MW_MARKING.a.label, true),
              pick(MW_MARK_B, MW_MARKING.b.label, true),
              pick(MW_MARK_PEN, 'Editing pen', false),
              el('button', {
                class: 'mw-mark mw-mark-vf' + (markStamp ? ' active' : ''),
                title: 'VF stamp — tap the page where you gave verbal feedback',
                onclick: () => { markStamp = !markStamp; paintTools(); },
              }, el('span', { class: 'mw-mark-vfdot' }, 'VF'), el('span', {}, 'Stamp')),
              el('span', { class: 'mw-opt-hint' }, markStamp
                ? 'Tap the page to stamp. Tap a stamp again to take it off.'
                : 'Marking goes on top of the writing, in the colours your school uses.'));
          } else if (tool === 'pic') {
            opts.append(optLabel('Picture'),
              optBtn('Add a picture', 'Import a picture into this page', addImage));
            const im = selImg ? page().imgs.find((q) => q.id === selImg) : null;
            if (im) {
              // Straightening is a slider because a printout is out by three or
              // four degrees, not by ninety — the quarter turns are there for
              // the picture that came in on its side.
              const slide = el('input', {
                type: 'range', min: '-15', max: '15', step: '0.5', class: 'mw-rot',
                title: 'Straighten a crooked printout',
              });
              // the slider is the FINE part only: total rotation minus whatever
              // quarter turns the picture has been given
              slide.value = String(clamp(Math.round(((+im.rot || 0) - quarter(im)) * 2) / 2, -15, 15));
              let rotWas = null;
              slide.addEventListener('pointerdown', () => { rotWas = imgWas(im); });
              slide.addEventListener('input', () => {
                im.rot = Math.round((quarter(im) + parseFloat(slide.value)) * 10) / 10;
                paintPage();
              });
              const done = () => {
                if (rotWas && JSON.stringify(imgWas(im)) !== JSON.stringify(rotWas)) {
                  pushUndo({ t: 'imgrect', id: im.id, was: rotWas });
                }
                rotWas = null; save(); paintThumbActive();
              };
              slide.addEventListener('change', done);
              const turn = (deg) => {
                const was = imgWas(im);
                im.rot = Math.round(((+im.rot || 0) + deg) % 360 * 10) / 10;
                pushUndo({ t: 'imgrect', id: im.id, was });
                save(); paintPage(); paintThumbActive(); paintOpts();
              };
              opts.append(
                optBtn('⟲', 'Turn a quarter turn anticlockwise', () => turn(-90)),
                optBtn('⟳', 'Turn a quarter turn clockwise', () => turn(90)),
                el('span', { class: 'mw-opt-lab' }, 'Straighten'), slide,
                im.crop ? optBtn('Undo trim', 'Put the trimmed edges back',
                  () => {
                    const was = imgWas(im);
                    im.crop = null;
                    pushUndo({ t: 'imgrect', id: im.id, was });
                    save(); paintPage(); paintThumbActive(); paintOpts();
                  }) : el('span', { class: 'mw-opt-hint' }, 'Drag an orange edge to trim the picture.'),
                optBtn('Remove', 'Remove the selected picture', delImage, ' mw-dangerp'));
            }
          }
        }

        const paintTools = () => { paintBar(); paintOpts(); fitBar(); };
        // the widget is resizable, so the fit has to be re-decided when it is
        // resized — not only when a tool is picked
        if (api && typeof api.onResize === 'function') api.onResize(() => fitBar());
        window.addEventListener('resize', fitBar);   // and when the board itself changes

        // --------------------------------------------------------- the paper
        function swatch(pap, on, title, fn) {
          const b = el('button', { class: 'mw-sw' + (on ? ' active' : ''), title, onclick: fn });
          const s = svgEl('svg', { viewBox: '0 0 ' + MW_W + ' ' + MW_H });
          s.innerHTML = mwPageInner({ paper: pap, strokes: [], imgs: [] }, { swatch: true });
          b.append(s);
          return b;
        }
        function paintPop() {
          pop.innerHTML = '';
          const pa = paper();
          const setP = (patch) => {
            if (page().locked) { lockedRefusal(); return; }
            Object.assign(pa, patch);
            if (popTick.checked) p.newPaper = mwPaperCopy(pa);
            save(); paintPop(); paintPage(); paintThumbActive();
          };
          const lines = el('div', { class: 'mw-sw-row' });
          [['plain', 'Writing lines'], ['4line', 'Handwriting (4-line)'],
            ['altdot', 'Alternating — dotted'], ['altsolid', 'Alternating — solid'],
            ['none', 'Unlined']].forEach(([r, t]) => {
            lines.append(swatch(Object.assign(mwPaperCopy(pa), { ruling: r, vAt: null, hAt: null }),
              pa.ruling === r, t, () => setP({ ruling: r })));
          });
          const layouts = el('div', { class: 'mw-sw-row' });
          [[null, null, 'Whole page'], [500, null, 'Lined | plain'],
            [null, 480, 'Picture | lined'], [500, 480, 'Picture + lined | plain']].forEach(([v, h, t]) => {
            layouts.append(swatch(Object.assign(mwPaperCopy(pa), { vAt: v, hAt: h }),
              (pa.vAt == null) === (v == null) && (pa.hAt == null) === (h == null), t,
              () => setP({ vAt: v, hAt: h })));
          });
          const sizes = el('div', { class: 'mw-size-row' });
          MW_SIZE_MM.forEach((mm, i) => {
            sizes.append(el('button', {
              class: 'mw-size' + (pa.size === i ? ' active' : ''),
              style: 'font-size:' + (10 + i * 1.6) + 'px',
              title: mm + 'mm between writing lines when printed at A4',
              onclick: () => setP({ size: i }),
            }, String(mm)));
          });
          // Saved papers: a teacher who has built "Y2 story page" out of a
          // ruling, a height and a picture band should never have to build it
          // again. Stored app-wide, so a paper made in one unit is there in the
          // next one — the picker is the slow part, not the choosing.
          const saved = loadPapers();
          const setsRow = el('div', { class: 'mw-sets' });
          saved.forEach((entry, i) => {
            const chip = el('button', {
              class: 'mw-set', title: 'Use “' + entry.name + '” on this page',
              onclick: () => setP(mwPaperCopy(mwPaper(entry.paper))),
            });
            const s = svgEl('svg', { viewBox: '0 0 ' + MW_W + ' ' + MW_H });
            s.innerHTML = mwPageInner({ paper: mwPaper(entry.paper), strokes: [], imgs: [] }, { swatch: true });
            chip.append(s, el('span', { class: 'mw-set-name' }, entry.name));
            chip.append(el('button', {
              class: 'mw-set-x', title: 'Forget this paper',
              onclick: (e) => {
                e.stopPropagation();
                const list = loadPapers();
                list.splice(i, 1);
                savePapers(list);
                paintPop();
              },
            }, '✕'));
            setsRow.append(chip);
          });
          setsRow.append(el('button', {
            class: 'mw-set mw-set-add',
            title: 'Save this page’s paper under a name you will recognise next term',
            onclick: () => savePaperAs(mwPaperCopy(pa)),
          }, '+', el('span', { class: 'mw-set-name' }, 'Save this')));

          pop.append(
            el('div', { class: 'mw-sw-lab' }, 'Lines'), lines,
            el('div', { class: 'mw-sw-lab' }, 'Layout'), layouts,
            el('div', { class: 'mw-sw-lab' }, 'Line height (mm at A4)'), sizes,
            el('div', { class: 'mw-sw-lab' }, 'Your papers'), setsRow,
            el('label', { class: 'mw-pop-tick' }, popTick, ' Use this paper for new pages too'),
            el('div', { class: 'hint' }, 'Changes this page only. Drag the blue bars on the page to move a divider. Your writing never moves.'),
          );
        }
        const popTick = el('input', { type: 'checkbox' });
        popTick.checked = true;

        const MW_PAPER_SETS = 8;
        function loadPapers() {
          const raw = typeof D.getPref === 'function' ? D.getPref('mwPapers', []) : [];
          return (Array.isArray(raw) ? raw : [])
            .filter((x) => x && typeof x.name === 'string' && x.paper)
            .slice(0, MW_PAPER_SETS);
        }
        function savePapers(list) {
          if (typeof D.setPref === 'function') D.setPref('mwPapers', list.slice(0, MW_PAPER_SETS));
        }
        function savePaperAs(paperObj) {
          const list = loadPapers();
          if (list.length >= MW_PAPER_SETS) {
            toast('That’s eight saved papers — forget one first'); return;
          }
          const open = D.openModal;
          const commitName = (name) => {
            const n = String(name || '').trim().slice(0, 24);
            if (!n) return;
            list.push({ name: n, paper: paperObj });
            savePapers(list);
            paintPop();
            toast('Saved — “' + n + '” is on the paper panel from now on');
          };
          if (typeof open !== 'function') {
            // same fallback rule as renamePage: the app dialog first — the
            // desktop webview's window.prompt shows nothing and returns null
            if (typeof D.promptDialog === 'function') {
              D.promptDialog('Name this paper', 'Y2 story page', (v) => commitName(v), { label: 'Save' });
              return;
            }
            commitName(window.prompt('Name this paper', 'Y2 story page'));
            return;
          }
          open('Save this paper', (bodyEl, finish) => {
            const inp = el('input', { type: 'text', class: 'text-input', maxlength: '24', placeholder: 'Y2 story page' });
            const go = () => { commitName(inp.value); finish(); };
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
            bodyEl.append(
              el('p', {}, 'Name it the way you would say it out loud — “Y2 story page”, “Handwriting Fri”, '
                + '“Plan | draft”. It appears on the paper panel in every writing unit you open.'),
              inp,
              el('div', { class: 'row', style: 'justify-content:flex-end;' },
                el('button', { class: 'btn', onclick: go }, 'Save')),
            );
            setTimeout(() => inp.focus(), 30);
          });
        }
        function openPop() { paperOpen = true; pop.style.display = ''; paintPop(); paintTools(); paintPage(); }
        function closePop() {
          if (!paperOpen) return;
          paperOpen = false; pop.style.display = 'none'; paintTools(); paintPage();
        }

        // -------------------------------------------------------- the strip
        // The washing line skims like a book: press anywhere on the strip and a
        // big preview follows your finger across the pages, so a teacher finds
        // the page by its writing rather than by counting thumbnails. Release
        // lands on it — a plain tap is just the shortest possible scrub.
        const peek = el('div', { class: 'mw-peek', style: 'display:none' });
        const peekSvg = svgEl('svg', { viewBox: '0 0 ' + MW_W + ' ' + MW_H });
        const peekLab = el('div', { class: 'mw-peek-lab' });
        peek.append(peekSvg, peekLab);
        peekWrap.append(peek);
        function pageAt(clientX) {
          const kids = Array.from(strip.querySelectorAll('.mw-thumb'));
          let best = null, bestD = Infinity;
          kids.forEach((n, i) => {
            const r = n.getBoundingClientRect();
            const d = Math.abs(clientX - (r.left + r.width / 2));
            if (d < bestD) { bestD = d; best = i; }
          });
          return best;
        }
        function showPeek(i) {
          const pg = p.pages[i];
          if (!pg) return;
          peekSvg.innerHTML = mwPageInner(pg);
          peekLab.textContent = 'Page ' + (i + 1) + ' of ' + p.pages.length;
          peek.style.display = '';
        }
        // One gesture on the strip does two jobs, split by TIME rather than by
        // where you press — a hidden handle on a 44px thumbnail is not findable
        // on an interactive whiteboard. Move straight away and it is the scrub
        // that was already there; hold still for 400ms and the page lifts off
        // the line and follows you to a new position. The ⋯ menu carries the
        // same move as two plain buttons, because a hold-and-drag on a wall-
        // mounted board is not something to make anyone depend on.
        const HOLD_MS = 400;
        strip.addEventListener('pointerdown', (e) => {
          if (drawing) return;
          if (e.target.closest('.mw-add') || e.target.closest('.mw-thumb-x')
            || e.target.closest('.mw-thumb-m')) return;
          const thumb = e.target.closest('.mw-thumb');
          if (!thumb) return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          closePageMenu();
          const from = pageAt(e.clientX);
          let at = from, mode = 'scrub', hold = null;
          const startX = e.clientX;
          showPeek(at);

          const lift = () => {
            mode = 'drag';
            peek.style.display = 'none';
            thumb.classList.add('mw-dragging');
            strip.classList.add('mw-reordering');
            paintDrop(at);
          };
          hold = setTimeout(lift, HOLD_MS);

          const mv = (ev) => {
            const n = pageAt(ev.clientX);
            if (mode === 'scrub') {
              // a real movement means this was a scrub all along
              if (Math.abs(ev.clientX - startX) > 8) { clearTimeout(hold); hold = null; }
              if (n !== at) { at = n; showPeek(at); }
            } else if (n !== at) {
              at = n; paintDrop(at);
            }
          };
          const up = () => {
            clearTimeout(hold);
            strip.removeEventListener('pointermove', mv);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            peek.style.display = 'none';
            thumb.classList.remove('mw-dragging');
            strip.classList.remove('mw-reordering');
            clearDrop();
            if (mode === 'drag') {
              const pg = p.pages[from];
              if (pg && at !== from) {
                dropPageAt(pg, at);
                toast('Moved to position ' + (at + 1));
              } else { paintStrip(); }
              return;
            }
            const pg = p.pages[at];
            if (pg && pg.id !== p.cur) { p.cur = pg.id; selImg = null; sel = []; save(); paintAll(); }
          };
          try { strip.setPointerCapture(e.pointerId); } catch (_) { /* belt-and-braces */ }
          strip.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        });
        const clearDrop = () => {
          for (const n of strip.querySelectorAll('.mw-droptarget')) n.classList.remove('mw-droptarget');
        };
        function paintDrop(i) {
          clearDrop();
          const kids = strip.querySelectorAll('.mw-thumb');
          if (kids[i]) kids[i].classList.add('mw-droptarget');
        }

        function paintStrip() {
          strip.innerHTML = '';
          p.pages.forEach((pg, i) => {
            const cell = el('div', { class: 'mw-cell' });
            const th = el('div', {
              class: 'mw-thumb' + (pg.id === p.cur ? ' active' : '') + (pg.locked ? ' mw-locked' : ''),
              title: (pg.name ? pg.name + ' — page ' + (i + 1) : 'Page ' + (i + 1))
                + (pg.locked ? ' (locked)' : '') + '\nHold to pick it up and move it along the line',
            });
            th.dataset.pid = pg.id;
            const ts = svgEl('svg', { viewBox: '0 0 ' + MW_W + ' ' + MW_H });
            ts.innerHTML = mwPageInner(pg);
            th.append(ts);
            if (pg.locked) th.append(el('span', { class: 'mw-lockbadge', title: 'Locked' }, '🔒'));
            if (pg.id === p.cur) {
              th.append(el('button', {
                class: 'mw-thumb-m', title: 'This page — name, copy, lock, move',
                onclick: (e) => { e.stopPropagation(); openPageMenu(pg, e.currentTarget); },
              }, '⋯'));
              th.append(el('button', {
                class: 'mw-thumb-x', title: p.pages.length === 1 ? 'Clear this page' : 'Delete this page',
                onclick: (e) => { e.stopPropagation(); delPage(pg); },
              }, '✕'));
            }
            cell.append(th, el('div', {
              class: 'mw-cell-lab' + (pg.name ? ' named' : ''),
            }, pageLabel(pg, i)));
            strip.append(cell);
          });
          strip.append(el('button', {
            class: 'mw-add', title: 'New page on the washing line',
            onclick: () => { if (!drawing) newPage(null, null); },
          }, '+'));
          // keep the page being written on in view once the line runs past the
          // width of the widget — Glenn's 8–10 page mark
          const act = strip.querySelector('.mw-thumb.active');
          if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }

        // The per-page menu. It hangs off the thumbnail rather than joining the
        // toolbar, because tier 1 must not grow a control that only sometimes
        // applies — that is the reflow defect this widget already fixed once.
        let pageMenu = null;
        function closePageMenu() {
          if (pageMenu) { pageMenu.remove(); pageMenu = null; }
        }
        document.addEventListener('pointerdown', (e) => {
          if (pageMenu && !e.target.closest('.mw-pagemenu') && !e.target.closest('.mw-thumb-m')) closePageMenu();
        }, true);
        function openPageMenu(pg, anchor) {
          if (pageMenu) { closePageMenu(); return; }
          const i = pageIdx(pg);
          const row = (label, title, fn, cls) => el('button', {
            class: 'mw-pm-item' + (cls || ''), title,
            onclick: () => { closePageMenu(); fn(); },
          }, label);
          pageMenu = el('div', { class: 'mw-pagemenu' },
            row(pg.name ? 'Rename…' : 'Name this page…',
              'Cold write · Model 1 · Big Write — so the line reads as a sequence', () => renamePage(pg)),
            row('Duplicate', 'Copy this page — try the same sentence another way', () => dupPage(pg)),
            row(pg.locked ? 'Unlock' : 'Lock',
              pg.locked ? 'Allow writing on this page again'
                : 'Nothing can be written on it — for a finished Big Write on a board children walk past',
              () => toggleLock(pg)),
            el('div', { class: 'mw-pm-sep' }),
            row('◀ Move left', 'Move this page one place earlier in the unit',
              () => movePage(pg, -1), i <= 0 ? ' mw-pm-off' : ''),
            row('Move right ▶', 'Move this page one place later in the unit',
              () => movePage(pg, 1), i >= p.pages.length - 1 ? ' mw-pm-off' : ''),
            el('div', { class: 'mw-pm-sep' }),
            // §8.1: what this page IS in the unit. Display labels only — they
            // set the room's expectations and print as evidence, and change
            // nothing about how the page behaves.
            // §8.1's compare view: the Cold and the Hot task side by side, and
            // printable on one sheet. The contact sheet already IS side by side
            // on one sheet, so this opens that with exactly those two ticked
            // rather than growing a second way of showing the same thing.
            (p.pages.some((q) => q.bookend === 'cold') && p.pages.some((q) => q.bookend === 'hot'))
              ? row('Compare Cold & Hot', 'The two tasks side by side — and one sheet of progress evidence for the wall',
                () => {
                  if (!window.SagePrint) { toast('Print engine not loaded'); return; }
                  const only = [];
                  p.pages.forEach((q, k) => { if (q.bookend === 'cold' || q.bookend === 'hot') only.push(k); });
                  SagePrint.openDialog(WIDGETS.modelwrite.toPrintablePages(w), {
                    title: 'Cold and Hot task', only, contact: true,
                  });
                })
              : null,
            el('div', { class: 'mw-pm-lab' }, 'Cold / Hot'),
            el('div', { class: 'mw-pm-chips' },
              ...MW_BOOKENDS.map(([k, label, col]) => el('button', {
                class: 'mw-pm-chip' + (pg.bookend === k ? ' on' : ''),
                style: '--chip:' + col,
                title: k === 'cold' ? 'The task at the start of the unit, before any teaching'
                  : 'The same task at the end — the two side by side are the progress',
                onclick: () => {
                  if (pg.bookend === k) delete pg.bookend; else pg.bookend = k;
                  closePageMenu(); save(); paintAll();
                },
              }, label))),
            el('div', { class: 'mw-pm-lab' }, 'Gradual release'),
            el('div', { class: 'mw-pm-chips' },
              ...MW_STAGES.map(([k, label, hint]) => el('button', {
                class: 'mw-pm-chip' + (pg.stage === k ? ' on' : ''),
                style: '--chip:' + MW_STAGE_COL[k], title: hint,
                onclick: () => {
                  if (pg.stage === k) delete pg.stage; else pg.stage = k;
                  closePageMenu(); save(); paintAll();
                },
              }, label))),
            el('div', { class: 'mw-pm-lab' }, 'Today’s lens'),
            el('div', { class: 'mw-pm-chips' },
              ...loadLenses().map((t) => el('button', {
                class: 'mw-pm-chip' + (pg.lens === t ? ' on' : ''),
                style: '--chip:#475569', title: 'What the class is looking for on this page',
                onclick: () => {
                  if (pg.lens === t) delete pg.lens; else pg.lens = t;
                  closePageMenu(); save(); paintAll();
                },
              }, t))),
          );
          document.body.append(pageMenu);
          const r = anchor.getBoundingClientRect();
          const mh = pageMenu.offsetHeight, mw2 = pageMenu.offsetWidth;
          const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
          pageMenu.style.left = Math.max(8, Math.min(r.left, vw - mw2 - 8)) + 'px';
          // above the thumbnail by preference: the strip is at the bottom edge
          pageMenu.style.top = (r.top - mh - 6 > 8 ? r.top - mh - 6 : Math.min(r.bottom + 6, vh - mh - 8)) + 'px';
        }
        // ------------------------------------------------------ page turning
        function goPage(step) {
          if (drawing) return;
          const i = p.pages.indexOf(page()) + step;
          if (i < 0 || i >= p.pages.length) return;
          p.cur = p.pages[i].id; selImg = null; sel = []; save(); paintAll();
        }
        function paintTurns() {
          const i = p.pages.indexOf(page());
          turnL.style.display = i > 0 ? '' : 'none';
          turnR.style.display = i < p.pages.length - 1 ? '' : 'none';
          turnL.style.top = turnR.style.top = (p.turnY * 100) + '%';
        }
        turnL.addEventListener('click', () => goPage(-1));
        turnR.addEventListener('click', () => goPage(1));
        // drag either button up or down to move both out of the writing space
        for (const b of [turnL, turnR]) {
          b.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            let moved = false;
            const r = pageBox.getBoundingClientRect();
            const mv = (ev) => {
              const f = (ev.clientY - r.top) / (r.height || 1);
              if (Math.abs(f - p.turnY) > 0.01) moved = true;
              p.turnY = Math.max(0.08, Math.min(0.92, f));
              paintTurns();
            };
            const up = () => {
              b.removeEventListener('pointermove', mv);
              b.removeEventListener('pointerup', up);
              b.removeEventListener('pointercancel', up);
              if (moved) { save(); b.dataset.dragged = '1'; setTimeout(() => delete b.dataset.dragged, 0); }
            };
            try { b.setPointerCapture(e.pointerId); } catch (_) { /* belt-and-braces */ }
            b.addEventListener('pointermove', mv);
            b.addEventListener('pointerup', up);
            b.addEventListener('pointercancel', up);
          });
          // a drag must not also turn the page
          b.addEventListener('click', (e) => { if (b.dataset.dragged) e.stopImmediatePropagation(); }, true);
        }

        const paintAll = () => {
          body.dataset.barAt = p.barAt;
          paintTools(); if (paperOpen) paintPop(); paintPage(); paintStrip(); paintTurns();
          applyView();
        };
        // Ctrl/⌘ + wheel is the zoom every drawing app has; a bare wheel is
        // left alone so the widget never eats the page scroll.
        svg.addEventListener('wheel', (e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          setZoom(zoomI + (e.deltaY < 0 ? 1 : -1));
        }, { passive: false });

        // ------------------------------------------------------ mutations
        function undo() {
          if (drawing) return; // the lock covers every mutating control
          if (page().locked) { lockedRefusal(); return; }
          const op = stack().pop();
          if (!op) { toast('Nothing to undo on this page'); return; }
          const pg = page();
          if (op.t === 'add') {
            // positional, not identity: the op is only ever popped when the
            // array is exactly as this op left it, so the index still points
            // at the stroke that was added — and it survives a reload
            const i = op.i != null ? op.i : pg.strokes.length - 1;
            if (i >= 0 && i < pg.strokes.length) pg.strokes.splice(i, 1);
          } else if (op.t === 'erase') {
            pg.strokes.splice(Math.min(op.i, pg.strokes.length), 0, op.s);
          } else if (op.t === 'imgadd') {
            const i = pg.imgs.findIndex((x) => x.id === op.im.id);
            if (i >= 0) pg.imgs.splice(i, 1);
            if (selImg === op.im.id) selImg = null;
          } else if (op.t === 'imgdel') {
            pg.imgs.splice(Math.min(op.i, pg.imgs.length), 0, op.im);
          } else if (op.t === 'imgrect') {
            const im = pg.imgs.find((x) => x.id === op.id);
            if (im) Object.assign(im, op.was);
          } else if (op.t === 'rub') {
            // put the rubbed letter back whole: drop the runs, restore the original
            pg.strokes.splice(Math.min(op.i, pg.strokes.length), op.n, op.was);
          } else if (op.t === 'multi') {
            for (let k = op.removed.length - 1; k >= 0; k--) {
              pg.strokes.splice(Math.min(op.removed[k].i, pg.strokes.length), 0, op.removed[k].s);
            }
          } else if (op.t === 'multiadd') {
            // a paste lands contiguously at the end, so one splice takes it off
            if (op.n > 0 && op.i >= 0) pg.strokes.splice(op.i, op.n);
          } else if (op.t === 'move') {
            for (const m of op.moved) {
              const s = pg.strokes[m.i];
              if (s) s.pts = m.pts;
            }
          } else if (op.t === 'stampadd') {
            pg.stamps = (pg.stamps || []).filter((s) => s.id !== op.id);
          } else if (op.t === 'stampdel') {
            pg.stamps = pg.stamps || [];
            pg.stamps.splice(Math.min(op.i, pg.stamps.length), 0, op.st);
          } else if (op.t === 'strokes') {
            pg.strokes = op.was; // one step puts a cut word back together
          }
          sel = sel.filter((s) => pg.strokes.includes(s));
          saveStacks(); save(); paintPage(); paintThumbActive();
        }
        // Clear and Delete are the two acts the recently-closed bin never saw:
        // they destroy a page without closing anything, so nothing was ever
        // kept. Both now copy the whole unit to the snapshot store first, which
        // is why "three days of writing" now has a route back from either.
        const snapBefore = (label) => {
          if (typeof D.snapshotBefore === 'function') D.snapshotBefore(w, label);
        };
        function clearPage() {
          if (drawing) return;
          const pg = page();
          if (pg.locked) { lockedRefusal(); return; }
          if (!pg.strokes.length && !pg.imgs.length) return;
          // the app's own confirm overlay — native confirm() is unreliable in
          // fullscreen/kiosk and kicks Chrome out of fullscreen mid-lesson
          ask('Clear this page’s writing and pictures?', () => {
            snapBefore('before clearing ' + pageName(pg));
            pg.strokes = []; pg.imgs = []; stacks.delete(pg.id); selImg = null;
            saveStacks(); save(); paintPage(); paintThumbActive();
          }, { label: 'Clear' });
        }
        function delPage(pg) {
          if (drawing) return;
          // a lock has to resist the delete too, or it only protects against
          // the accident nobody was worried about
          if (pg.locked) {
            toast('That page is locked — unlock it from the ⋯ menu first', { ms: 4000 });
            return;
          }
          if (p.pages.length === 1) { clearPage(); return; } // never zero pages
          ask('Delete ' + pageName(pg) + ' from the unit?', () => {
            const i = p.pages.indexOf(pg);
            if (i < 0) return;
            snapBefore('before deleting ' + pageName(pg));
            p.pages.splice(i, 1); stacks.delete(pg.id);
            p.cur = p.pages[Math.min(i, p.pages.length - 1)].id;
            selImg = null; saveStacks(); save(); paintAll();
          }, { label: 'Delete' });
        }
        // ------------------------------------------------- pages as a document
        // Add and delete was the whole of page management, which made the unit
        // a pad. Duplicate is the core modelled-writing move — "let's try that
        // sentence another way" was impossible without rewriting it by hand;
        // reorder is how a unit assembled out of order across weeks gets put
        // right; lock is how a finished Big Write survives the rest of the day.
        const pageIdx = (pg) => p.pages.indexOf(pg);
        const pageName = (pg) => (pg && pg.name ? '“' + pg.name + '”' : 'page ' + (pageIdx(pg) + 1));
        const pageLabel = (pg, i) => (pg.name || String(i + 1));

        function newPage(at, seed) {
          if (p.pages.length >= MW_PAGE_CAP) {
            toast('That’s a full washing line — print this unit and start the next one');
            return null;
          }
          const pg = seed || { id: uid(), strokes: [], imgs: [], paper: mwPaperCopy(p.newPaper), name: '', locked: false };
          p.pages.splice(at == null ? p.pages.length : at, 0, pg);
          if (p.pages.length === MW_PAGE_SOFT && !softWarned) {
            softWarned = true;
            toast('This unit is getting long — printing it and starting a fresh one keeps the washing line readable.', { ms: 7000 });
          }
          p.cur = pg.id; selImg = null; sel = [];
          save(); paintAll();
          return pg;
        }
        function dupPage(pg) {
          if (drawing) return;
          if (p.pages.length >= MW_PAGE_CAP) {
            toast('That’s a full washing line — print this unit and start the next one'); return;
          }
          const copy = {
            id: uid(),
            name: pg.name ? (pg.name + ' again').slice(0, 28) : '',
            locked: false,             // a copy is for working on, never born locked
            paper: mwPaperCopy(pg.paper),
            strokes: pg.strokes.map((s) => mwDerive(s, s.pts.slice(), s.pw ? s.pw.slice() : null)),
            imgs: pg.imgs.map((im) => ({ id: uid(), src: im.src, x: im.x, y: im.y, w: im.w, h: im.h, rot: im.rot })),
          };
          newPage(pageIdx(pg) + 1, copy);
          toast('Copied — try the sentence another way on this one');
        }
        function movePage(pg, dir) {
          if (drawing) return;
          const i = pageIdx(pg), j = i + dir;
          if (i < 0 || j < 0 || j >= p.pages.length) return;
          p.pages.splice(j, 0, p.pages.splice(i, 1)[0]);
          save(); paintAll();
        }
        function dropPageAt(pg, j) {
          const i = pageIdx(pg);
          if (i < 0 || j < 0 || j >= p.pages.length || i === j) return;
          p.pages.splice(j, 0, p.pages.splice(i, 1)[0]);
          save(); paintAll();
        }
        function toggleLock(pg) {
          pg.locked = !pg.locked;
          save(); paintAll();
          toast(pg.locked
            ? 'Page locked — nothing can be written on it until you unlock it'
            : 'Page unlocked');
        }
        function renamePage(pg) {
          const open = D.openModal;
          if (typeof open !== 'function') {
            // window.prompt is a no-op in the desktop webview; the app's own
            // dialog is the fallback that actually appears
            if (typeof D.promptDialog === 'function') {
              D.promptDialog('Name this page', pg.name || '', (v) => {
                pg.name = v.trim().slice(0, 28); save(); paintAll();
              }, { label: 'Name' });
              return;
            }
            const v = window.prompt('Name this page', pg.name || '');
            if (v != null) { pg.name = v.trim().slice(0, 28); save(); paintAll(); }
            return;
          }
          open('Name ' + pageName(pg), (bodyEl, finish) => {
            const inp = el('input', {
              type: 'text', class: 'text-input', maxlength: '28',
              placeholder: 'Cold write · Model 1 · Big Write',
            });
            inp.value = pg.name || '';
            const commit = () => {
              pg.name = inp.value.trim().slice(0, 28);
              save(); paintAll(); finish();
            };
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
            bodyEl.append(
              el('p', {}, 'A name shows under the thumbnail, so the washing line reads as a sequence of lessons rather than a row of pictures.'),
              inp,
              el('div', { class: 'row', style: 'justify-content:flex-end;gap:6px;' },
                el('button', {
                  class: 'btn ghost',
                  onclick: () => { pg.name = ''; save(); paintAll(); finish(); },
                }, 'No name'),
                el('button', { class: 'btn', onclick: commit }, 'Save')),
            );
            setTimeout(() => { inp.focus(); inp.select(); }, 30);
          });
        }
        // The refusal a locked page gives, said once per attempt rather than
        // per pointermove — an eraser dragged across a locked page would
        // otherwise fire forty toasts.
        let lockedNagAt = 0;
        function lockedRefusal() {
          const now = Date.now();
          if (now - lockedNagAt < 2500) return true;
          lockedNagAt = now;
          toast('This page is locked — unlock it from the ⋯ menu on its thumbnail', { ms: 4000 });
          return true;
        }

        // Lift: the whole stroke goes in one tap — v1's behaviour, kept as its
        // own tool because undoing a whole modelled word is still the fastest
        // thing a teacher does with an eraser.
        function liftAt(x, y) {
          const pg = page();
          let hit = false;
          for (let i = pg.strokes.length - 1; i >= 0; i--) {
            if (mwStrokeHit(pg.strokes[i], x, y, 12)) {
              const s = pg.strokes.splice(i, 1)[0];
              pushUndo({ t: 'erase', s, i });
              hit = true;
            }
          }
          if (hit) { paintPage(); paintThumbActive(); }
        }
        // Eraser: rubs, so a stroke can come back as the runs either side of
        // the hole. The undo op carries the original and its replacements, so
        // one Undo puts the letter back whole.
        function rubAt(x, y) {
          const pg = page();
          const r = MW_ERASE_R[eraseR];
          let hit = false;
          for (let i = pg.strokes.length - 1; i >= 0; i--) {
            const s = pg.strokes[i];
            if (!mwStrokeHit(s, x, y, r)) continue;
            const made = mwErasePart(s, x, y, r);
            if (!made) continue;
            pg.strokes.splice(i, 1, ...made);
            pushUndo({ t: 'rub', i, was: s, n: made.length });
            hit = true;
          }
          if (hit) { paintPage(); paintThumbActive(); }
        }

        // A stamp is a separate object, not a stroke, so the eraser can never
        // half-rub one out and leave a smear of purple that used to mean
        // something. Tap an existing stamp to take it off.
        function stampAt(x, y) {
          const pg = page();
          const hit = (pg.stamps || []).find((s) => (s.x - x) ** 2 + (s.y - y) ** 2 <= 34 * 34);
          if (hit) {
            const i = pg.stamps.indexOf(hit);
            pg.stamps.splice(i, 1);
            pushUndo({ t: 'stampdel', st: hit, i });
          } else {
            if ((pg.stamps || []).length >= 40) { toast('That is a lot of stamps for one page'); return; }
            const st = { id: uid(), x: clampInt(x, 0, MW_W), y: clampInt(y, 0, MW_H) };
            pg.stamps = pg.stamps || [];
            pg.stamps.push(st);
            pushUndo({ t: 'stampadd', id: st.id });
          }
          save(); paintPage(); paintThumbActive();
        }

        function copySel() {
          if (!sel.length) return;
          MW_CLIP = sel.map((s) => mwDerive(s, s.pts.slice(), mwHasW(s) ? s.pw.slice() : null));
          toast(sel.length === 1 ? 'Copied — paste it on any page' : 'Copied ' + sel.length + ' strokes');
          paintOpts();
        }
        function delSel() {
          if (!sel.length) return;
          const pg = page();
          const removed = [];
          for (const s of sel) {
            const i = pg.strokes.indexOf(s);
            if (i >= 0) removed.push({ s, i: i });
          }
          removed.sort((a, b) => b.i - a.i);
          for (const r of removed) pg.strokes.splice(r.i, 1);
          pushUndo({ t: 'multi', removed });
          sel = []; save(); paintAll();
        }
        function pasteSel() {
          if (!MW_CLIP || !MW_CLIP.length) return;
          const pg = page();
          if (pg.locked) { lockedRefusal(); return; }
          if (pg.strokes.length + MW_CLIP.length > MW_STROKE_CAP) {
            toast('That page is full — start a new page on the line'); return;
          }
          // offset so the paste is visibly its own copy, clamped onto the page
          const b = mwBounds(MW_CLIP);
          let dx = 40, dy = 40;
          if (b.x1 + dx > MW_W - 10) dx = Math.min(0, MW_W - 10 - b.x1);
          if (b.y1 + dy > MW_H - 10) dy = Math.min(0, MW_H - 10 - b.y1);
          const made = MW_CLIP.map((s) => mwDerive(s,
            s.pts.map((n, i) => clamp(n + (i % 2 ? dy : dx), 0, i % 2 ? MW_H : MW_W)),
            s.pw ? s.pw.slice() : null));
          const at = pg.strokes.length;
          pg.strokes.push(...made);
          pushUndo({ t: 'multiadd', i: at, n: made.length });
          sel = made.slice(); tool = 'lasso';
          save(); paintAll();
        }

        function addImage() {
          if (drawing) return;
          const pg = page();
          if (pg.locked) { lockedRefusal(); return; }
          if (pg.imgs.length >= MW_IMG_PER_PAGE) {
            toast('That’s plenty of pictures for one page'); return;
          }
          D.pickImage((data) => {
            mwFitImage(data, (out, ratio) => {
              if (!out) { toast('That picture is too detailed to store — try a simpler one'); return; }
              if (mwUnitBytes(p) + out.length > MW_UNIT_BUDGET) {
                toast('This writing unit is full of pictures — remove one first'); return;
              }
              // land it in the picture band if the page has one, else centred
              const pa = pg.paper;
              const r = ratio || 1.4;
              let bw, bh, bx, by;
              if (pa.hAt != null) {
                bh = Math.round((pa.hAt - 92) * 0.9); bw = Math.round(bh * r);
                if (bw > MW_W - 140) { bw = MW_W - 140; bh = Math.round(bw / r); }
                bx = Math.round((MW_W - bw) / 2); by = Math.round(46 + (pa.hAt - 92 - bh) / 2);
              } else {
                bw = Math.round((MW_W - 80) * 0.55); bh = Math.round(bw / r);
                if (bh > MW_H * 0.5) { bh = Math.round(MW_H * 0.5); bw = Math.round(bh * r); }
                bx = Math.round((MW_W - bw) / 2); by = Math.round((MW_H - bh) / 2);
              }
              const im = {
                id: uid(), src: out,
                w: clampInt(bw, 40, MW_W), h: clampInt(bh, 40, MW_H),
                x: clampInt(bx, 0, MW_W - 40), y: clampInt(by, 0, MW_H - 40),
              };
              pg.imgs.push(im);
              pushUndo({ t: 'imgadd', im });
              selImg = im.id; tool = 'pic';
              save(); paintAll();
            });
          }, 1400);
        }
        // where the four crop grips sit, given the picture's current crop —
        // on the cropped edge, so they follow the trim as it is dragged
        const GRIP = 26;
        function cropGrips(im) {
          const c = im.crop || { l: 0, t: 0, r: 0, b: 0 };
          const x0 = im.x + im.w * (c.l || 0), x1 = im.x + im.w * (1 - (c.r || 0));
          const y0 = im.y + im.h * (c.t || 0), y1 = im.y + im.h * (1 - (c.b || 0));
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          return [
            { side: 'l', x: x0 - GRIP / 2, y: my - GRIP / 2, w: GRIP, h: GRIP },
            { side: 'r', x: x1 - GRIP / 2, y: my - GRIP / 2, w: GRIP, h: GRIP },
            { side: 't', x: mx - GRIP / 2, y: y0 - GRIP / 2, w: GRIP, h: GRIP },
            { side: 'b', x: mx - GRIP / 2, y: y1 - GRIP / 2, w: GRIP, h: GRIP },
          ];
        }
        const quarter = (im) => Math.round((+im.rot || 0) / 90) * 90;
        const imgWas = (im) => ({
          x: im.x, y: im.y, w: im.w, h: im.h,
          rot: im.rot || 0,
          crop: im.crop ? { l: im.crop.l, t: im.crop.t, r: im.crop.r, b: im.crop.b } : null,
        });
        function setCrop(im, side, ux, uy) {
          const c = Object.assign({ l: 0, t: 0, r: 0, b: 0 }, im.crop || {});
          if (side === 'l') c.l = clamp((ux - im.x) / im.w, 0, 0.45);
          else if (side === 'r') c.r = clamp((im.x + im.w - ux) / im.w, 0, 0.45);
          else if (side === 't') c.t = clamp((uy - im.y) / im.h, 0, 0.45);
          else c.b = clamp((im.y + im.h - uy) / im.h, 0, 0.45);
          im.crop = (c.l || c.t || c.r || c.b) ? c : null;
        }

        function delImage() {
          const pg = page();
          const i = pg.imgs.findIndex((x) => x.id === selImg);
          if (i < 0) return;
          const im = pg.imgs.splice(i, 1)[0];
          pushUndo({ t: 'imgdel', im, i });
          selImg = null; save(); paintAll();
        }

        // ------------------------------------------------------------ input
        const toUnits = (e) => {
          // map through the real meet-transform: CSS can distort the svg box in
          // narrow widgets, and preserveAspectRatio letterboxes the content —
          // input must letterbox identically or ink lands away from the pen tip.
          // The viewBox is the zoom, so the same mapping has to read it rather
          // than assume the whole page, or zoomed ink lands somewhere else.
          const r = svg.getBoundingClientRect();
          const vw = viewW(), vh = viewH();
          const scale = Math.min(r.width / vw, r.height / vh) || 1;
          const padX = (r.width - vw * scale) / 2;
          const padY = (r.height - vh * scale) / 2;
          return [
            clamp(Math.round(panX + (e.clientX - r.left - padX) / scale), 0, MW_W),
            clamp(Math.round(panY + (e.clientY - r.top - padY) / scale), 0, MW_H),
          ];
        };

        svg.addEventListener('pointerdown', (e) => {
          if (drawing) return; // a second finger on the IWB must not corrupt the stroke
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.preventDefault();
          try { svg.setPointerCapture(e.pointerId); } catch (_) { /* capture is belt-and-braces */ }
          const [x, y] = toUnits(e);
          const pg = page();

          // the hand: while it is up, a drag moves the page rather than writing
          // on it, so the same gesture cannot do two things at once
          if (panning) {
            drawing = { ptr: e.pointerId, pan: true, sx: e.clientX, sy: e.clientY, px: panX, py: panY };
            return;
          }

          // A locked page takes nothing at all — not ink, not the eraser, not a
          // dragged picture, not a divider. Half a lock is worse than none.
          if (pg.locked) { lockedRefusal(); return; }

          // while the paper panel is open the page edits its LAYOUT, not its
          // ink — a divider you can only nudge deliberately can't be nudged
          // by a stroke that starts near it mid-lesson
          if (paperOpen) {
            const pa = pg.paper;
            if (pa.vAt != null && Math.abs(x - pa.vAt) <= 26) { drawing = { ptr: e.pointerId, div: 'v' }; return; }
            if (pa.hAt != null && Math.abs(y - pa.hAt) <= 26) { drawing = { ptr: e.pointerId, div: 'h' }; return; }
            return;
          }

          if (tool === 'pic') {
            const im = pg.imgs.find((q) => q.id === selImg);
            // crop grips first: they sit inside the picture, so the move that
            // would otherwise claim the press has to lose to them
            if (im) {
              for (const g of cropGrips(im)) {
                if (x >= g.x - 6 && x <= g.x + g.w + 6 && y >= g.y - 6 && y <= g.y + g.h + 6) {
                  drawing = { ptr: e.pointerId, crop: im, side: g.side, was: imgWas(im) };
                  return;
                }
              }
            }
            if (im && x >= im.x + im.w - 40 && x <= im.x + im.w + 6
              && y >= im.y + im.h - 40 && y <= im.y + im.h + 6) {
              drawing = { ptr: e.pointerId, res: im, was: imgWas(im) };
              return;
            }
            let hit = null;
            for (let i = pg.imgs.length - 1; i >= 0; i--) {
              const q = pg.imgs[i];
              if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) { hit = q; break; }
            }
            selImg = hit ? hit.id : null;
            if (hit) drawing = { ptr: e.pointerId, mv: hit, ox: x - hit.x, oy: y - hit.y, was: imgWas(hit) };
            paintOpts(); paintPage();
            return;
          }

          if (tool === 'lasso') {
            // inside an existing selection? drag it. Otherwise draw a new loop.
            if (sel.length) {
              const b = mwBounds(sel);
              if (x >= b.x0 - 12 && x <= b.x1 + 12 && y >= b.y0 - 12 && y <= b.y1 + 12) {
                drawing = {
                  ptr: e.pointerId, move: true, lx: x, ly: y,
                  // index + the points as they were: positional so the op can
                  // be written to disk and still mean something after a reload
                  from: sel.map((s) => ({ i: pg.strokes.indexOf(s), s, pts: s.pts.slice() }))
                    .filter((m) => m.i >= 0),
                };
                return;
              }
            }
            sel = [];
            lasso = [x, y];
            drawing = { ptr: e.pointerId, lasso: true };
            paintOpts(); paintPage();
            return;
          }
          // the VF stamp: a tap places one, a tap on one takes it off again
          if (tool === 'mark' && markStamp) {
            drawing = { ptr: e.pointerId, stampDone: true };
            stampAt(x, y);
            return;
          }
          if (tool === 'lift') { drawing = { lift: true, ptr: e.pointerId }; liftAt(x, y); return; }
          if (tool === 'erase') { drawing = { erase: true, ptr: e.pointerId }; rubAt(x, y); return; }
          if (pg.strokes.length >= MW_STROKE_CAP) { toast('That page is full — start a new page on the line'); return; }
          // the mark is the TOOL's current setting, not the tool itself
          const mc = tool === 'hl' ? hlInk : tool === 'mark' ? markInk : ink;
          const mw = tool === 'hl' ? MW_HL_W[hlW]
            : tool === 'mark' ? (mwIsHL(markInk) ? MW_HL_W[1] : MW_PEN_W[0])
              : MW_PEN_W[penW];
          // Only the PEN varies. A highlighter is a chisel: it lays down one
          // width by design, and a tapering highlight would read as a mistake.
          const isPen = e.pointerType === 'pen';
          // a ruled line or a box is drawn with a straight edge, so it takes
          // one even weight — a tapering box would read as a wobble
          const drawnShape = tool === 'pen' && shape !== 'free' ? shape : null;
          // the editing pen varies like any other pen; a marking highlighter
          // does not, for the same reason the ordinary highlighter does not
          const varying = (tool === 'pen' || (tool === 'mark' && markInk === MW_MARK_PEN))
            && !drawnShape && p.varWidth !== false;
          const nib0 = varying ? mwNib(mw, e.pressure, 0, isPen) : 0;
          drawing = {
            ptr: e.pointerId, pts: [x, y], c: mc, w: mw, pg,
            pw: varying ? [Math.round(nib0)] : null,
            vw: nib0, lt: e.timeStamp || performance.now(), pen: isPen,
            shape: drawnShape, ax: x, ay: y,
          };
          const a = mwStrokeAttrs({ c: mc, w: mw });
          if (drawing.pw) {
            liveEl = svgEl('path', {
              fill: a.stroke, 'fill-opacity': a.opacity, stroke: 'none',
              d: mwOutline(drawing.pts, drawing.pw),
            });
          } else {
            liveEl = svgEl('path', {
              fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
              d: mwStrokePath(drawing.pts),
            });
            liveEl.setAttribute('stroke', a.stroke);
            liveEl.setAttribute('stroke-width', a.width);
            liveEl.setAttribute('stroke-opacity', a.opacity);
          }
          svg.append(liveEl);
        });

        svg.addEventListener('pointermove', (e) => {
          if (!drawing || e.pointerId !== drawing.ptr) return;
          if (drawing.pan) {
            // move in SCREEN pixels converted to page units, so the page keeps
            // up with the hand exactly at every zoom level
            const r = svg.getBoundingClientRect();
            const scale = Math.min(r.width / viewW(), r.height / viewH()) || 1;
            panX = drawing.px - (e.clientX - drawing.sx) / scale;
            panY = drawing.py - (e.clientY - drawing.sy) / scale;
            applyView();
            return;
          }
          const [x, y] = toUnits(e);
          if (drawing.div) {
            const pa = page().paper;
            if (drawing.div === 'v') pa.vAt = clampInt(x, 250, 750);
            else pa.hAt = clampInt(y, 200, 1000);
            paintPage();
            return;
          }
          if (drawing.crop) {
            setCrop(drawing.crop, drawing.side, x, y);
            paintPage();
            return;
          }
          if (drawing.res) {
            const im = drawing.res;
            im.w = clampInt(Math.max(60, x - im.x), 60, MW_W - im.x);
            im.h = clampInt(Math.max(60, y - im.y), 60, MW_H - im.y);
            paintPage();
            return;
          }
          if (drawing.mv) {
            const im = drawing.mv;
            im.x = clampInt(x - drawing.ox, 0, MW_W - im.w);
            im.y = clampInt(y - drawing.oy, 0, MW_H - im.h);
            paintPage();
            return;
          }
          if (drawing.lasso) {
            const n = lasso.length;
            const dx = x - lasso[n - 2], dy = y - lasso[n - 1];
            if (dx * dx + dy * dy < 64) return;
            lasso.push(x, y);
            paintPage();
            return;
          }
          if (drawing.move) {
            const dx = x - drawing.lx, dy = y - drawing.ly;
            drawing.lx = x; drawing.ly = y;
            for (const s of sel) {
              s.pts = s.pts.map((n, i) => clamp(n + (i % 2 ? dy : dx), 0, i % 2 ? MW_H : MW_W));
            }
            paintPage();
            return;
          }
          if (drawing.lift) { liftAt(x, y); return; }
          if (drawing.erase) { rubAt(x, y); return; }
          if (!liveEl) return; // belt-and-braces: a repaint mid-stroke must not throw
          // a shape is rebuilt from its two corners on every move, so the
          // teacher drags it out and it snaps straight as they go
          if (drawing.shape) {
            drawing.pts = drawing.shape === 'line'
              ? [drawing.ax, drawing.ay, x, y]
              : [drawing.ax, drawing.ay, x, drawing.ay, x, y, drawing.ax, y, drawing.ax, drawing.ay];
            liveEl.setAttribute('d', mwPolyPath(drawing.pts));
            return;
          }
          const n = drawing.pts.length;
          const dx = x - drawing.pts[n - 2], dy = y - drawing.pts[n - 1];
          if (dx * dx + dy * dy < 16) return; // thinning: a point must earn 4 units
          drawing.pts.push(x, y);
          if (drawing.pw) {
            const now = e.timeStamp || performance.now();
            const dt = Math.max(1, now - drawing.lt);
            const target = mwNib(drawing.w, e.pressure, Math.sqrt(dx * dx + dy * dy) / dt, drawing.pen);
            // ease towards it: raw pressure jitters on cheap styluses and a
            // width that flickers point-to-point looks like a fault, not a nib
            drawing.vw = drawing.vw ? drawing.vw * 0.62 + target * 0.38 : target;
            drawing.pw.push(Math.round(drawing.vw));
            drawing.lt = now;
            liveEl.setAttribute('d', mwOutline(drawing.pts, drawing.pw));
            return;
          }
          liveEl.setAttribute('d', mwStrokePath(drawing.pts));
        });

        const finish = (e) => {
          if (!drawing || e.pointerId !== drawing.ptr) return;
          const d = drawing;
          drawing = null; liveEl = null;
          if (d.pan) return;   // panning changes the view, never the page
          if (d.div) { save(); paintThumbActive(); if (paperOpen) paintPop(); return; }
          if (d.res || d.mv || d.crop) {
            const im = d.res || d.mv || d.crop;
            if (JSON.stringify(imgWas(im)) !== JSON.stringify(d.was)) {
              pushUndo({ t: 'imgrect', id: im.id, was: d.was });
            }
            save(); paintThumbActive();
            return;
          }
          if (d.lasso) {
            const pg = page();
            if (lasso && lasso.length >= 6) {
              const before = pg.strokes;
              const { kept, picked } = mwLassoCut(before, lasso);
              // only record an undo step if the loop actually cut something;
              // a snapshot of the old array is cheap because cutting makes new
              // stroke objects and never mutates the originals
              if (kept.length !== before.length || kept.some((s, i) => s !== before[i])) {
                pushUndo({ t: 'strokes', was: before });
                pg.strokes = kept.slice(0, MW_STROKE_CAP);
              }
              sel = picked.filter((s) => pg.strokes.includes(s));
            } else {
              sel = [];
            }
            lasso = null;
            if (!sel.length) toast('Draw a loop over the writing you want — whatever falls inside comes away');
            save(); paintOpts(); paintPage(); paintThumbActive();
            return;
          }
          if (d.move) {
            if (d.from.some((m) => m.pts.join() !== m.s.pts.join())) {
              // drop the live reference — only the index and the old points go
              // to disk, and keeping `s` would make the record unserialisable
              pushUndo({ t: 'move', moved: d.from.map((m) => ({ i: m.i, pts: m.pts })) });
            }
            save(); paintThumbActive(); paintPage();
            return;
          }
          if (d.erase || d.lift) { save(); return; }
          // commit to the page the stroke STARTED on; if that page is gone,
          // drop the ink rather than stamp it onto a different page
          const home = p.pages.includes(d.pg) ? d.pg : null;
          if (home && home.strokes.length < MW_STROKE_CAP) {
            // a two-point "shape" is a tap, not a line — drop it rather than
            // leave a dot the teacher did not mean to make
            if (d.shape && d.pts.length <= 2) { paintPage(); return; }
            const s = { c: d.c, w: d.w, pts: d.pts };
            if (d.pw) s.pw = d.pw;              // per-point widths, when the stroke has them
            if (d.shape) s.sh = 1;              // ruled: render as a polyline, sharp corners
            home.strokes.push(s);
            if (home.id === p.cur) pushUndo({ t: 'add', i: home.strokes.length - 1 });
            save();
            paintThumbActive();
          }
          paintPage();
        };
        svg.addEventListener('pointerup', finish);
        svg.addEventListener('pointercancel', finish);

        paintAll();
        // the window listener and the page menu both outlive the body, so the
        // mount hands back the way to take them with it
        return () => {
          window.removeEventListener('resize', fitBar);
          closePageMenu();
          stopBwTick();
          clearTimeout(undoTimer);
        };
      },

      settings(box, w, api) {
        const p = w.props;
        loadSchoolInks();
        // where the bar lives is a per-teacher constant — handedness and which
        // side of the board you stand — so it belongs in setup, not on the bar
        const sides = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;' });
        MW_BAR_AT.forEach((side) => {
          sides.append(el('button', {
            class: 'btn ghost small' + ((p.barAt || 'top') === side ? ' mw-active' : ''),
            onclick: () => { p.barAt = side; D.save(); api.refresh(); },
          }, side[0].toUpperCase() + side.slice(1)));
        });
        const varRow = el('label', { class: 'row', style: 'gap:8px;align-items:center;cursor:pointer;' });
        const varTick = el('input', { type: 'checkbox' });
        varTick.checked = p.varWidth !== false;
        varTick.addEventListener('change', () => { p.varWidth = varTick.checked; D.save(); });
        varRow.append(varTick, el('span', {}, 'Pen line thins and thickens'));
        box.append(
          D.settingRow ? D.settingRow('Toolbar side', sides)
            : el('div', { class: 'row' }, el('span', {}, 'Toolbar side'), sides),
          varRow,
          el('div', { class: 'hint' }, 'A real pen presses heavier where the hand slows down, and that is what children copy off the board. On a stylus board the line follows pressure; everywhere else it follows how fast you are writing. Turn it off for a single even weight — writing already on the page never changes either way.'),
          buildPalette(api),
          buildMarking(api),
          buildLenses(api),
          el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px;' },
            el('button', {
              class: 'btn ghost small',
              title: 'Give every page in this unit the paper the current page uses',
              onclick: () => {
                const cur = (p.pages || []).find((x) => x && x.id === p.cur) || (p.pages || [])[0];
                if (!cur) return;
                for (const pg of p.pages) pg.paper = mwPaperCopy(cur.paper);
                p.newPaper = mwPaperCopy(cur.paper);
                D.save(); api.refresh();
              },
            }, 'Use this page’s paper everywhere')),
          el('div', { class: 'hint' }, 'The flip-chart easel, replaced: write with the class by hand, page by page across the unit — the strip along the bottom is the washing line. Paper is set per page on the bar: writing lines, 4-line handwriting, alternating lines for modelling how to edit, a plain column for ideation, or a picture band for labelling and three-part stories. Pictures go under your writing, so you can write straight onto a printout. Print any page wall-sized or as 1 sheet of A4 for children to read at their tables — and tick only the pages worth the paper. A blank ruled page prints on purpose; it’s handwriting paper.'),
        );
      },
    };
  }

  /* ------------------------------------------------------- the pen, lent out
     The story map writes by hand too: a ruled box beside each part of the plan,
     modelled on the board while thirty children copy it onto their own boards.
     It needs THIS pen rather than another one, and the reason is mwErasePart —
     whose header records two rubbers that looked right and were not, one of
     which latched and threw away the rest of a stroke. A second implementation
     re-earns those bugs and hands a teacher two rubbers that behave differently.

     So the SHARED LAYER is promoted and no widget is split, which is the rule
     docs/story-map-design.md §13 sets for exactly this case. Everything below is
     a read of what is already in this file: modelwrite's own mount does not go
     through it and is untouched, so nothing already written can shift.

     A stroke is { c, w, pts:[x,y,…], pw:[…] } in both widgets, so the maths
     needs no translation at the seam. The stroke's own coordinate space is the
     host's viewBox — never pixels — which is what makes a resize unable to move
     a child's ink. */
  const SP_THIN = 16;                 // 4 units squared: a point must earn its place

  const spHasW = (s) => !!(s && s.pw && s.pts && s.pw.length === s.pts.length >> 1);
  // Variable-width strokes are drawn as their own filled outline; a stroke with
  // no per-point width takes the constant-width centreline, byte for byte as the
  // page does, so the two widgets cannot render the same stroke differently.
  const spPathOf = (s) => (spHasW(s) ? mwOutline(s.pts, s.pw) : mwStrokePath(s.pts));

  // The meet-transform, computed by hand. Scaling the client offset by the
  // bounding rect alone is only correct while the element box matches the
  // viewBox aspect; the moment a surface sits in a grid cell with a constrained
  // height, preserveAspectRatio letterboxes it and the ink lands away from the
  // pen tip. This was a review finding on mount()'s toUnits and it is the same
  // finding here — the shortcut is the obvious thing to write.
  function spUnits(svg, e, vw, vh) {
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / vw, r.height / vh) || 1;
    const padX = (r.width - vw * scale) / 2;
    const padY = (r.height - vh * scale) / 2;
    const x = Math.round((e.clientX - r.left - padX) / scale);
    const y = Math.round((e.clientY - r.top - padY) / scale);
    return [Math.max(0, Math.min(vw, x)), Math.max(0, Math.min(vh, y))];
  }

  // Strokes as an SVG string, for a printed sheet. The same path maths the
  // screen uses, so handwriting prints as written rather than as a redraw.
  function spMarkup(strokes) {
    let out = '';
    for (const s of strokes || []) {
      if (!s || !s.pts || s.pts.length < 2) continue;
      const c = /^#[0-9a-fA-F]{3,8}$/.test(String(s.c)) ? s.c : '#1e2c33';
      out += spHasW(s)
        ? '<path d="' + spPathOf(s) + '" fill="' + c + '" stroke="none"/>'
        : '<path d="' + spPathOf(s) + '" fill="none" stroke="' + c + '" stroke-width="'
          + (+s.w > 0 ? +s.w : 6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return out;
  }

  /* attach(svg, o) — the interaction layer, as a factory.

     The host owns the strokes and the repaint; this owns the pointer stream and
     nothing else. o carries:
       view()      → [w, h] in viewBox units
       strokes()   → the live array for THIS surface
       add(s)      → push a committed stroke
       replace(a)  → swap the array wholesale (the rubber's only write)
       layer()     → the element the live path is appended to  (optional)
       tool/ink/width/eraseR/cap                              (optional readers)
       locked()    → falsy, or the refusal to speak            (optional)
       onRefuse(msg) / onChange('draw'|'erase')                (optional)

     Returns { destroy }. */
  function spAttach(svg, o) {
    const NS = 'http://www.w3.org/2000/svg';
    let drawing = null, liveEl = null;
    const read = (k, dflt) => (typeof o[k] === 'function' ? o[k]() : dflt);

    const rubAt = (x, y) => {
      const r = read('eraseR', 14);
      const arr = o.strokes() || [];
      const out = [];
      let hit = false;
      for (const s of arr) {
        const parts = mwErasePart(s, x, y, r);
        // null means untouched, and it is not the same as []: an unhit stroke is
        // handed back the object it already was, never a rebuilt copy of it.
        if (parts === null) { out.push(s); continue; }
        hit = true;
        for (const q of parts) out.push(q);
      }
      if (!hit) return false;
      o.replace(out);
      return true;
    };

    const down = (e) => {
      // One pointer owns a stroke. A second finger on an interactive whiteboard
      // is the commonest input there is, and without this the two interleave
      // into a single zig-zag that erases as one object.
      if (drawing) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const refusal = read('locked', '');
      if (refusal) { if (o.onRefuse) o.onRefuse(refusal); return; }
      const v = o.view();
      const [x, y] = spUnits(svg, e, v[0] || 1, v[1] || 1);
      const erasing = read('tool', 'pen') === 'rub';
      if (!erasing) {
        const cap = read('cap', 0);
        if (cap && (o.strokes() || []).length >= cap) {
          if (o.onRefuse) o.onRefuse(read('capMsg', 'That box is full — start the next box.'));
          return;
        }
      }
      e.preventDefault();
      // Belt and braces, never the mechanism: every move re-checks the pointer
      // id, so a board that declines capture still draws one clean stroke.
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* as above */ }
      if (erasing) {
        drawing = { ptr: e.pointerId, erase: true, took: false };
        if (rubAt(x, y)) drawing.took = true;
        return;
      }
      const w = read('width', 6);
      drawing = {
        ptr: e.pointerId, pts: [x, y], pw: [Math.round(w)], w,
        c: read('ink', '#1e2c33'), vw: 0, lt: e.timeStamp || performance.now(),
        pen: e.pointerType === 'pen',
      };
      liveEl = document.createElementNS(NS, 'path');
      liveEl.setAttribute('fill', drawing.c);
      liveEl.setAttribute('stroke', 'none');
      liveEl.setAttribute('d', mwOutline(drawing.pts, drawing.pw));
      (read('layer', null) || svg).append(liveEl);
    };

    const move = (e) => {
      if (!drawing || e.pointerId !== drawing.ptr) return;
      const v = o.view();
      const [x, y] = spUnits(svg, e, v[0] || 1, v[1] || 1);
      if (drawing.erase) { if (rubAt(x, y)) drawing.took = true; return; }
      const n = drawing.pts.length;
      const dx = x - drawing.pts[n - 2], dy = y - drawing.pts[n - 1];
      if (dx * dx + dy * dy < SP_THIN) return;
      drawing.pts.push(x, y);
      const now = e.timeStamp || performance.now();
      const dt = Math.max(1, now - drawing.lt);
      const target = mwNib(drawing.w, e.pressure, Math.sqrt(dx * dx + dy * dy) / dt, drawing.pen);
      drawing.vw = drawing.vw ? drawing.vw * 0.62 + target * 0.38 : target;
      drawing.pw.push(Math.round(drawing.vw));
      drawing.lt = now;
      // one live path, set once per point — never a rebuild of the surface
      if (liveEl) liveEl.setAttribute('d', mwOutline(drawing.pts, drawing.pw));
    };

    // Nulled before any branch work, so a throw downstream cannot leave the
    // surface locked against the next stroke.
    const finish = (e) => {
      const d = drawing;
      if (!d || (e && e.pointerId !== d.ptr)) return;
      drawing = null;
      const live = liveEl;
      liveEl = null;
      if (e) { try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ } }
      if (d.erase) {
        if (d.took && o.onChange) o.onChange('erase');
        return;
      }
      if (d.pts.length >= 2) {
        o.add({ c: d.c, w: d.w, pts: d.pts, pw: d.pw });
        // the host repaints here, so the live path is removed AFTER its
        // committed twin is on the surface and nothing flickers
        if (o.onChange) o.onChange('draw');
      }
      if (live && live.parentNode) live.remove();
    };

    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
    return {
      destroy() {
        svg.removeEventListener('pointerdown', down);
        svg.removeEventListener('pointermove', move);
        svg.removeEventListener('pointerup', finish);
        svg.removeEventListener('pointercancel', finish);
        drawing = null;
        liveEl = null;
      },
    };
  }

  window.SagePen = {
    VERSION: 1,
    strokePath: mwStrokePath,
    outline: mwOutline,
    nib: mwNib,
    erasePart: mwErasePart,
    pathOf: spPathOf,
    hasWidths: spHasW,
    markup: spMarkup,
    units: spUnits,
    attach: spAttach,
  };

  window.SageModelWrite = {
    init(deps) {
      D = deps;
      register();
    },
  };
})();
