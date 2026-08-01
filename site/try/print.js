/* Sage Stage — poster print engine (SagePrint), v2.
   v1 shipped the engine slice (contract lint, tiling maths, page generation,
   assembly guides — verified by print-check.html). v2 adds the teacher-facing
   half: the print dialog (§4) and the window.print() route (§6), wired from
   app.js via init(deps) + openDialog(svg, opts). Nothing here writes app
   state. Build contract: docs/poster-print-design.md. */
(function () {
  'use strict';

  // All lengths in millimetres.
  const MARGIN = 10;   // per-sheet edge margin — every printer can do 10mm
  const OVERLAP = 12;  // glue strip between adjacent sheets (the 'lap' default)
  // Two assembly models, both real, chosen by the teacher (§7):
  //   lap  — sheets carry OVERLAP mm of DUPLICATED content; the next sheet laps
  //          over it and is glued from the front. Forgives a wobbly cut and
  //          printer drift; costs OVERLAP mm of poster per seam.
  //   butt — no overlap at all; both meeting edges are trimmed and the sheets
  //          are taped from BEHIND, face down (the blockposters.com model).
  //          Bigger poster per sheet and no registration fiddling; every
  //          interior cut has to be accurate.
  // 'widelap' exists because 12mm is a guess until someone glues four real
  // sheets together: it is enough to hold, but not much to hold ONTO with a
  // glue stick and a wobbly scissor line. 24mm doubles the strip a teacher can
  // actually press down, at the cost of 24mm of poster per seam.
  const WIDE_OVERLAP = 24;
  const OVERLAPS = { lap: OVERLAP, widelap: WIDE_OVERLAP, butt: 0 };
  const PAPERS = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
  const BUDGETS = [1, 2, 4, 8];
  const GREY = '#8a8f98'; // guide furniture — quiet on the wall, covered by assembly
  const SVGNS = 'http://www.w3.org/2000/svg';

  let jobCounter = 0; // unique id prefix per buildPages call — two jobs can share a page

  // ------------------------------------------------------------ contract lint
  // §2: refuse quietly broken SVG at the seam. Errors disable printing and
  // name the offender; warnings (user-imported rasters) print anyway.
  function lint(svg) {
    const errors = [];
    const warnings = [];
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
      return { errors: ['not an SVG element'], warnings };
    }
    if (!svg.getAttribute('viewBox')) {
      errors.push('missing viewBox — the print aspect is unknowable');
    }
    // the root element scans too — <svg onload=…> is as much a script vector
    // as any child (review finding, 2026-07-26)
    for (const el of [svg, ...svg.querySelectorAll('*')]) {
      const tag = el.nodeName.toLowerCase();
      if (tag === 'script') errors.push('<script> is not allowed in printable SVG');
      if (tag === 'foreignobject') errors.push('<foreignObject> is not allowed in printable SVG');
      if (tag === 'style') {
        // buildPages imports the SVG into the live document, where selector
        // styles are document-global — only the @font-face escape hatch may
        // ride in a <style> (review finding, 2026-07-26)
        const css = (el.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (!/^(@font-face\s*\{[^{}]*\}\s*)*$/.test(css)) {
          errors.push('<style> may only contain @font-face rules — selector styles would leak into the app');
        } else if (/@import|url\s*\(\s*["']?\s*(?:https?:)?\/\//i.test(css)) {
          errors.push('<style> pulls in an external resource');
        }
      }
      for (const at of el.attributes) {
        if (/^on/i.test(at.name)) errors.push('<' + tag + '> carries a script attribute (' + at.name + ')');
      }
      for (const attr of ['href', 'xlink:href', 'src']) {
        const v = el.getAttribute(attr);
        if (v == null) continue;
        const val = v.trim();
        if (val === '' || val.startsWith('#')) continue;
        if (val.startsWith('data:')) {
          if (tag === 'image') warnings.push('contains an imported picture — pictures may soften at poster size');
          continue;
        }
        errors.push('<' + tag + '> references an external resource (' + val.slice(0, 40) + ')');
      }
    }
    return { errors, warnings };
  }

  function parseSvg(input) {
    if (typeof input !== 'string') return input;
    const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
    return doc.documentElement;
  }

  // ------------------------------------------------------------- tiling maths
  // §5: enumerate sheet-orientation × grid within the sheet budget, keep the
  // candidate with the largest content scale (the biggest poster the budget
  // can make). Ties: fewer sheets, then portrait. Then recompute the rows and
  // columns actually touched and drop empty ones — the no-blank-sheets rule.
  function printableBox(paper, orientation) {
    const p = PAPERS[paper];
    const w = (orientation === 'landscape' ? p.h : p.w) - 2 * MARGIN;
    const h = (orientation === 'landscape' ? p.w : p.h) - 2 * MARGIN;
    return { pw: w, ph: h };
  }

  function coverage(pw, ph, rows, cols, ov) {
    return {
      W: cols * pw - (cols - 1) * ov,
      H: rows * ph - (rows - 1) * ov,
    };
  }

  function sheetsFor(extent, box, ov) {
    const along = (len, sheet) =>
      len <= sheet + 1e-6 ? 1 : Math.ceil((len - ov) / (sheet - ov) - 1e-9);
    return { cols: along(extent.w, box.pw), rows: along(extent.h, box.ph) };
  }

  function plan(input, opts) {
    const o = opts || {};
    const budget = BUDGETS.includes(o.budget) ? o.budget : 4;
    const paper = PAPERS[o.paper] ? o.paper : 'A4';
    // 'butt' is the default (2026-07-26, Glenn): an overlap repeats the writing
    // at the seam, and modelled writing that ghosts or doubles by a millimetre
    // is far more visible than a photo doing the same — and this work is a
    // class's own writing, which is not redone if the poster comes out wrong.
    const assembly = OVERLAPS[o.assembly] != null ? o.assembly : 'butt';
    const ov = OVERLAPS[assembly];
    // A multi-page job prints every page into one @page box, so the whole job
    // shares one sheet orientation — openDialog plans page 1 freely and forces
    // the rest to agree. Named @page rules per orientation would be the pure
    // fix; one constraint is simpler and every real adopter's pages share an
    // aspect anyway (modelwrite is 1000×1414 throughout).
    const only = o.orientation === 'portrait' || o.orientation === 'landscape' ? o.orientation : null;
    const label = typeof o.label === 'string' && o.label ? o.label.slice(0, 24) : null;

    const svg = parseSvg(input);
    if (!svg) return { ok: false, errors: ['not valid SVG'], warnings: [] };
    const verdict = lint(svg);
    if (verdict.errors.length) return { ok: false, errors: verdict.errors, warnings: verdict.warnings };

    const vb = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    const [minX, minY, vbW, vbH] = vb;
    if (!(vbW > 0) || !(vbH > 0)) {
      return { ok: false, errors: ['viewBox has no area'], warnings: verdict.warnings };
    }

    // portrait first, so an exact tie on scale and sheet count keeps portrait
    let best = null;
    for (const orientation of only ? [only] : ['portrait', 'landscape']) {
      const box = printableBox(paper, orientation);
      for (let rows = 1; rows <= budget; rows++) {
        for (let cols = 1; rows * cols <= budget; cols++) {
          const cov = coverage(box.pw, box.ph, rows, cols, ov);
          const scale = Math.min(cov.W / vbW, cov.H / vbH);
          const sheets = rows * cols;
          if (!best ||
              scale > best.scale + 1e-9 ||
              (Math.abs(scale - best.scale) <= 1e-9 && sheets < best.sheets)) {
            best = { orientation, box, scale, sheets };
          }
        }
      }
    }

    const rendered = { w: vbW * best.scale, h: vbH * best.scale };
    const real = sheetsFor(rendered, best.box, ov); // no-blank-sheets recompute
    const { pw, ph } = best.box;
    const cols = real.cols, rows = real.rows, sheets = rows * cols;

    const pages = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = r * cols + c + 1; // row-major: left → right, top → bottom
        pages.push({
          n, row: r, col: c,
          crop: { x: c * (pw - ov), y: r * (ph - ov) },
          neighbours: {
            up: r > 0 ? n - cols : 0,
            down: r < rows - 1 ? n + cols : 0,
            left: c > 0 ? n - 1 : 0,
            right: c < cols - 1 ? n + 1 : 0,
          },
        });
      }
    }

    return {
      ok: true,
      errors: [],
      warnings: verdict.warnings,
      source: { svg, minX, minY, vbW, vbH },
      meta: {
        paper, budget, assembly, overlap: ov, label,
        orientation: best.orientation,
        pw, ph, rows, cols, sheets,
        scale: best.scale,
        finished: rendered,
        usedFullBudget: sheets === budget,
      },
      pages,
    };
  }

  // §4: the honest summary line, reused by the dialog later.
  const dim = (mm) => mm >= 1000
    ? (Math.round(mm / 100) / 10) + ' m'
    : Math.round(mm / 10) + ' cm';

  function describe(p) {
    const m = p.meta;
    let s = m.sheets + ' sheet' + (m.sheets === 1 ? '' : 's') + ' of ' + m.paper +
      ' (' + m.orientation + ') · finished size ' +
      dim(m.finished.w) + ' × ' + dim(m.finished.h);
    if (!m.usedFullBudget) {
      s += ' — fewer than the ' + m.budget + '-sheet budget; nothing blank prints';
    }
    return s;
  }

  // §4.6: the same honesty for a multi-page job — the total that will actually
  // come out of the printer, which is the number that decides paper waste
  function describeJob(plans) {
    if (!plans.length) return '';
    if (plans.length === 1) return describe(plans[0]);
    const m = plans[0].meta;
    const sheets = plans.reduce((n, p) => n + p.meta.sheets, 0);
    const f = m.finished;
    return plans.length + ' pages · ' + sheets + ' sheets of ' + m.paper +
      ' (' + m.orientation + ') · each page ' + dim(f.w) + ' × ' + dim(f.h);
  }

  // --------------------------------------------------------- page generation
  // §6: one master, windowed per page via <use> and a cropped viewBox — never
  // rasterised, never duplicated. Guides are siblings drawn in poster mm.
  function mk(tag, attrs, text) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }

  function textEl(x, y, size, str, anchor, extra) {
    const t = mk('text', Object.assign({
      x, y, fill: GREY, 'font-size': size,
      'font-family': 'system-ui, sans-serif',
      'text-anchor': anchor || 'middle',
    }, extra || {}), str);
    return t;
  }

  function buildPages(p, opts) {
    const o = opts || {};
    const guides = o.guides !== false;
    const id = 'sp' + (++jobCounter) + '-master';
    const { pw, ph, scale } = p.meta;
    const frag = document.createDocumentFragment();

    // hidden defs holding the single master, scaled from user units to mm
    const defsSvg = mk('svg', { class: 'sp-defs', width: 0, height: 0, 'aria-hidden': 'true' });
    defsSvg.style.position = 'absolute';
    const defs = mk('defs', {});
    const master = mk('g', {
      id,
      transform: 'scale(' + scale + ') translate(' + -p.source.minX + ' ' + -p.source.minY + ')',
    });
    for (const child of Array.from(p.source.svg.childNodes)) {
      master.appendChild(document.importNode(child, true));
    }
    defs.appendChild(master);
    defsSvg.appendChild(defs);
    frag.appendChild(defsSvg);

    for (const page of p.pages) {
      const { x, y } = page.crop;
      const el = mk('svg', {
        class: 'sp-page',
        width: pw + 'mm', height: ph + 'mm',
        viewBox: x + ' ' + y + ' ' + pw + ' ' + ph,
      });
      el.appendChild(mk('use', { href: '#' + id }));
      if (guides) el.appendChild(buildGuides(page, p.meta, x, y));
      frag.appendChild(el);
    }
    return frag;
  }

  // ------------------------------------------------------------- sheet paper
  // §6/§7: the paper AROUND the printable box, shared by the preview and the
  // print route so the dialog cannot tell a different story from the printer.
  //
  // Leading edges carry a trim line, and this is a correctness rule, not
  // decoration. A sheet that laps on top brings its own MARGIN of opaque white
  // with it; that border lands on the previous sheet's content, which exists
  // on no other sheet, so MARGIN mm of writing is lost at every seam in both
  // axes. Widening OVERLAP cannot help — the margin always sits outside the
  // content it belongs to, so the loss just moves. Cutting the leading margin
  // off before gluing is the only fix that does not depend on borderless
  // printing. Found by Glenn on a real 4-sheet poster, 2026-07-26; the §9
  // physical assembly test had never been run.
  function sheetPaper(meta) {
    const paper = PAPERS[meta.paper];
    return {
      pageW: meta.orientation === 'landscape' ? paper.h : paper.w,
      pageH: meta.orientation === 'landscape' ? paper.w : paper.h,
    };
  }

  // ---------------------------------------------------------- edge furniture
  // THE RULE: nothing a teacher is told to cut towards may sit inside the
  // printable box. Every assembly mark lives in the MARGIN, and an edge that
  // has a neighbour always has a disposable one — cut away (butt: every
  // interior edge; lap: the leading edges) or covered by the sheet that laps
  // over it (lap: trailing edges). Margin furniture therefore self-erases for
  // real, which §7 only ever claimed.
  //
  // v1–v4 drew numbers, arrows and the map INSIDE the box: sheet 4's number
  // printed 3mm above its own bottom edge with nothing lapping over it, and
  // sheet 4's "◂ 3" arrow sat 2mm inside the edge that lies on top. Both
  // printed onto the finished wall, both sat where the scissors go
  // (Glenn, 2026-07-26 — "this absolutely cannot happen").
  //
  // The language is meant to be read at arm's length by someone who has never
  // assembled a poster: matching shapes pair the two halves of a seam, so you
  // find a ● and look for the other ●, and the word under it says whether that
  // edge is cut or lapped. No cross-referencing writing, no counting sheets.
  const CUT = '#4b5563'; // darker than GREY — cut marks must read at a glance

  function regPoly(cx, cy, r, n, rot) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + i * 2 * Math.PI / n;
      pts.push(Math.round((cx + r * Math.sin(a)) * 100) / 100,
        Math.round((cy - r * Math.cos(a)) * 100) / 100);
    }
    return pts.join(' ');
  }

  // eight shapes, all solid: enough that no sheet ever shows the same one twice
  const SEAM_SHAPES = [
    (x, y, r) => mk('circle', { cx: x, cy: y, r: r }),
    (x, y, r) => mk('polygon', { points: regPoly(x, y, r, 3, 0) }),
    (x, y, r) => mk('rect', { x: x - r * 0.82, y: y - r * 0.82, width: r * 1.64, height: r * 1.64 }),
    (x, y, r) => mk('polygon', { points: regPoly(x, y, r, 4, 0) }),
    (x, y, r) => mk('polygon', { points: regPoly(x, y, r, 3, Math.PI) }),
    (x, y, r) => mk('polygon', { points: regPoly(x, y, r, 5, 0) }),
    (x, y, r) => mk('polygon', { points: regPoly(x, y, r, 6, 0) }),
    (x, y, r) => mk('rect', { x: x - r, y: y - r * 0.42, width: r * 2, height: r * 0.84, rx: r * 0.42 }),
  ];

  const EDGE_NB = { left: 'left', right: 'right', top: 'up', bottom: 'down' };

  // a seam is named once and shares its shape with both sheets that meet on it
  function seamKey(page, edge) {
    const r = page.row, c = page.col;
    if (edge === 'right') return 'v' + r + '_' + c;
    if (edge === 'left') return 'v' + r + '_' + (c - 1);
    if (edge === 'bottom') return 'h' + r + '_' + c;
    return 'h' + (r - 1) + '_' + c;
  }
  function seamIndex(rows, cols) {
    const m = {};
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) m['v' + r + '_' + c] = i++;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) m['h' + r + '_' + c] = i++;
    return m;
  }
  function edgeRole(meta, page, edge) {
    if (!page.neighbours[EDGE_NB[edge]]) return null; // outer edge — leave the paper alone
    if (meta.assembly === 'butt') return 'cut';       // both meeting edges lose their white
    return edge === 'left' || edge === 'top' ? 'cut' : 'lap';
  }
  function edgeBand(edge, pageW, pageH) {
    const h = MARGIN / 2;
    if (edge === 'left') return { vert: true, cross: h, len: pageH, cut: MARGIN };
    if (edge === 'right') return { vert: true, cross: pageW - h, len: pageH, cut: pageW - MARGIN };
    if (edge === 'top') return { vert: false, cross: h, len: pageW, cut: MARGIN };
    return { vert: false, cross: pageH - h, len: pageW, cut: pageH - MARGIN };
  }

  function buildFurniture(page, meta) {
    const { pageW, pageH } = sheetPaper(meta);
    const seams = seamIndex(meta.rows, meta.cols);
    const svg = mk('svg', {
      class: 'sp-furniture', viewBox: '0 0 ' + pageW + ' ' + pageH,
      width: '100%', height: '100%', 'aria-hidden': 'true', preserveAspectRatio: 'none',
    });
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
    let numbered = false;

    for (const edge of ['top', 'left', 'right', 'bottom']) {
      const role = edgeRole(meta, page, edge);
      if (!role) continue;
      const b = edgeBand(edge, pageW, pageH);
      const shape = SEAM_SHAPES[seams[seamKey(page, edge)] % SEAM_SHAPES.length];
      const g = mk('g', { class: 'sp-edge sp-edge-' + edge + ' sp-role-' + role });

      if (role === 'cut') {
        // exactly on the content boundary: cutting along it removes white only
        g.appendChild(mk('line', Object.assign(
          { class: 'sp-cut sp-cut-' + edge, stroke: CUT, 'stroke-width': 0.7 },
          b.vert ? { x1: b.cut, y1: 0, x2: b.cut, y2: pageH }
            : { x1: 0, y1: b.cut, x2: pageW, y2: b.cut })));
        // Corner marks as well as the line. Scissors do not follow a hairline
        // across 300mm of paper — you line the blade up on two marks and cut
        // between them, which is what every trade printer's crop marks are for.
        // They are heavier than the line and sit at the very ends, in the
        // margin, so they go the same way the line does (Glenn, 2026-07-26).
        const TICK = 9;
        for (const at of [0, 1]) {
          const a = b.vert ? { x1: b.cut, x2: b.cut, y1: at ? pageH : 0, y2: at ? pageH - TICK : TICK }
            : { y1: b.cut, y2: b.cut, x1: at ? pageW : 0, x2: at ? pageW - TICK : TICK };
          g.appendChild(mk('line', Object.assign(
            { class: 'sp-crop', stroke: CUT, 'stroke-width': 1.6, 'stroke-linecap': 'butt' }, a)));
        }
      }
      // marks run ALONG the edge, not across it: the band is only MARGIN wide,
      // but the edge is 200–300mm long, so that is where the room is. Stacking
      // across capped the shape at ~2mm, which is invisible at arm's length.
      const nbN = page.neighbours[EDGE_NB[edge]];
      for (const t of [0.26, 0.74]) {
        const along = b.len * t;
        const cx = b.vert ? b.cross : along;
        const cy = b.vert ? along : b.cross;
        const mark = mk('g', {
          class: 'sp-seam',
          transform: 'translate(' + cx + ' ' + cy + ')' + (b.vert ? ' rotate(90)' : ''),
        });
        const sh = shape(-10.5, 0, 3);
        sh.setAttribute('fill', role === 'cut' ? CUT : GREY);
        if (role === 'lap') sh.setAttribute('fill-opacity', '0.55');
        mark.appendChild(sh);
        // Direction matters and must be unmissable. "GLUE → 2" read as "glue
        // this onto 2" when it meant "2 gets glued on here" — a teacher
        // following it literally inverts the lap order. So the cut edge names
        // where it goes, and the receiving edge names what arrives on it
        // (Glenn, 2026-07-26).
        mark.appendChild(textEl(-6, 1.3, 3.6,
          role === 'cut' ? 'CUT → ' + nbN : nbN + ' ON TOP',
          'start', { fill: CUT, 'font-weight': '600' }));
        g.appendChild(mark);
      }

      // the sheet's own number rides in the first disposable margin it has
      if (!numbered) {
        numbered = true;
        const cx = b.vert ? b.cross : b.len / 2;
        const cy = b.vert ? b.len / 2 : b.cross;
        const nm = mk('g', {
          class: 'sp-num',
          transform: 'translate(' + cx + ' ' + cy + ')' + (b.vert ? ' rotate(90)' : ''),
        });
        // the method is named on every sheet: in lap mode a sheet legitimately
        // carries both CUT and ON TOP marks, which reads as two methods bleeding
        // together unless the sheet says which one it is printed for.
        // The page comes first when the job has more than one: print three
        // pages at four sheets and twelve sheets hit the table at once, and
        // without the page on each the pile cannot be sorted.
        const line = (meta.label ? meta.label.toUpperCase() + ' · ' : '')
          + 'SHEET ' + page.n + ' of ' + meta.sheets
          + (meta.rows > 1 ? ' · row ' + (page.row + 1) : '')
          + ' · ' + (meta.assembly === 'butt' ? 'trim & tape' : 'overlap & glue');
        // shrink to fit the clear span between the two seam marks — a longer
        // line must never grow into them
        const clear = Math.max(30, b.len * 0.48 - 28);
        const size = Math.max(2.8, Math.min(4.6, clear / (line.length * 0.52)));
        nm.appendChild(textEl(0, size * 0.33, size, line, 'middle',
          { fill: CUT, 'font-weight': '600' }));
        g.appendChild(nm);
      }
      svg.appendChild(g);
    }
    return svg;
  }

  // wraps each .sp-page in its true sheet of paper. `mm` sizes it exactly for
  // the printer; without it the sheet is fluid for the dialog preview, where
  // percentage padding (always resolved against WIDTH, all four sides) keeps
  // the inset proportional — but `top` percentages resolve against HEIGHT, so
  // the two trim offsets are computed separately.
  function wrapSheets(frag, p, opts) {
    const mm = !!(opts && opts.mm);
    const { pageW, pageH } = sheetPaper(p.meta);
    const inset = mm ? MARGIN + 'mm' : (MARGIN / pageW * 100).toFixed(4) + '%';
    const topInset = mm ? MARGIN + 'mm' : (MARGIN / pageH * 100).toFixed(4) + '%';
    const box = mm
      ? 'width:' + pageW + 'mm;height:' + pageH + 'mm;'
      : 'width:100%;aspect-ratio:' + pageW + '/' + pageH + ';';
    const out = document.createDocumentFragment();
    let i = 0;
    for (const n of Array.from(frag.childNodes)) {
      if (!(n.nodeType === 1 && n.classList && n.classList.contains('sp-page'))) {
        out.appendChild(n); // the shared <defs> master rides along untouched
        continue;
      }
      const page = p.pages[i++];
      const sheet = document.createElement('div');
      sheet.className = 'sp-sheet';
      sheet.style.cssText = box + 'position:relative;box-sizing:border-box;padding:' + inset + ';';
      // the page svg carries an intrinsic mm size from buildPages; left alone it
      // sets the sheet's min-content height and blows the paper aspect open
      // (330×1119 instead of 330×467), which then shears the seam shapes into
      // ellipses. Neutralise it here rather than leaning on container CSS.
      n.style.cssText = 'display:block;width:100%;height:100%;';
      sheet.appendChild(n);
      // edge furniture ignores the guides tick: cut marks are correctness, not
      // decoration. It is an svg over the whole sheet, so it draws in the
      // margin the page svg can't reach, and scales identically in preview.
      if (page) sheet.appendChild(buildFurniture(page, p.meta));
      out.appendChild(sheet);
    }
    return out;
  }

  // ------------------------------------------------------------------ guides
  // §7, rewritten 2026-07-26: the ONLY thing that may be drawn inside the
  // printable box is the lap-mode glue strip, because the sheet that laps over
  // it genuinely covers it. Numbers, seam shapes and cut lines all moved to
  // buildFurniture, out in the margin — see the rule there.
  function buildGuides(page, meta, x, y) {
    const { pw, ph } = meta;
    const ov = meta.overlap == null ? OVERLAP : meta.overlap;
    const g = mk('g', { class: 'sp-guides' });
    const nb = page.neighbours;

    // glue strips first, so text renders above them. Butt-and-tape has no
    // overlap to shade and nothing to glue on the front — its whole seam
    // instruction is the trim line plus tape on the back.
    if (nb.right && ov > 0) {
      g.appendChild(mk('rect', {
        class: 'sp-strip-right', x: x + pw - ov, y, width: ov, height: ph,
        fill: GREY, 'fill-opacity': 0.06,
      }));
      g.appendChild(mk('line', {
        x1: x + pw - ov, y1: y, x2: x + pw - ov, y2: y + ph,
        stroke: GREY, 'stroke-width': 0.3, 'stroke-dasharray': '2 2',
      }));
      const cap = textEl(0, 0, 2.6, 'sheet ' + nb.right + ' goes on top of this strip');
      cap.setAttribute('transform',
        'translate(' + (x + pw - ov / 2) + ' ' + (y + ph / 2) + ') rotate(90)');
      g.appendChild(cap);
    }
    if (nb.down && ov > 0) {
      g.appendChild(mk('rect', {
        class: 'sp-strip-down', x, y: y + ph - ov, width: pw, height: ov,
        fill: GREY, 'fill-opacity': 0.06,
      }));
      g.appendChild(mk('line', {
        x1: x, y1: y + ph - ov, x2: x + pw, y2: y + ph - ov,
        stroke: GREY, 'stroke-width': 0.3, 'stroke-dasharray': '2 2',
      }));
      g.appendChild(textEl(x + pw / 2, y + ph - ov / 2 + 1, 2.6,
        'sheet ' + nb.down + ' goes on top of this strip'));
    }

    // Numbers, turn arrows and the assembly map used to be drawn here, inside
    // the box. They printed onto the wall and sat where the scissors go; they
    // now live in buildFurniture, out in the margin that gets cut or covered.
    return g;
  }

  // --------------------------------------------------------- contact sheet
  // A whole unit, small, on one sheet — for a planning folder, for evidence,
  // or just to see the shape of three weeks of writing at once. It is built as
  // an ordinary SVG and then goes through plan() like anything else, so it
  // prints, tiles and lints by exactly the same rules as a poster; there is no
  // second print path to keep in step.
  function buildContactSheet(list, title) {
    const W = 210, H = 297, PAD = 10, GAP = 5, HEAD = title ? 11 : 2, LAB = 4.5;
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const rows = Math.ceil(list.length / cols);
    const gridW = W - PAD * 2, gridH = H - PAD * 2 - HEAD;
    const cellW = (gridW - GAP * (cols - 1)) / cols;
    const cellH = (gridH - GAP * (rows - 1)) / rows;
    const svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W + 'mm', height: H + 'mm' });
    svg.appendChild(mk('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }));
    if (title) {
      svg.appendChild(textEl(PAD, PAD + 5, 5.4, title, 'start', { 'font-weight': '700' }));
      svg.appendChild(mk('line', {
        x1: PAD, y1: PAD + HEAD - 3, x2: W - PAD, y2: PAD + HEAD - 3,
        stroke: '#94a3b8', 'stroke-width': 0.4,
      }));
    }
    list.forEach((d, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const cx = PAD + c * (cellW + GAP);
      const cy = PAD + HEAD + r * (cellH + GAP);
      const boxH = cellH - LAB;
      // the page keeps its own proportions inside the cell, centred
      const src = d.svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
      const ar = (src[2] || 1) / (src[3] || 1);
      let iw = cellW, ih = iw / ar;
      if (ih > boxH) { ih = boxH; iw = ih * ar; }
      const ix = cx + (cellW - iw) / 2, iy = cy + (boxH - ih) / 2;
      const inner = d.svg.cloneNode(true);
      inner.setAttribute('x', ix);
      inner.setAttribute('y', iy);
      inner.setAttribute('width', iw);
      inner.setAttribute('height', ih);
      inner.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      inner.removeAttribute('style');
      svg.appendChild(mk('rect', {
        x: ix, y: iy, width: iw, height: ih, fill: '#ffffff',
        stroke: '#cbd5e1', 'stroke-width': 0.3,
      }));
      svg.appendChild(inner);
      svg.appendChild(textEl(cx + cellW / 2, cy + cellH - 0.6, 3,
        d.label || 'Page ' + (i + 1), 'middle', { fill: '#475569' }));
    });
    return svg;
  }

  // ------------------------------------------------------------------- PDF
  // The browser's own Save-as-PDF is still the best-quality route (it stays
  // vector), so this does not replace it — it exists because "print, then pick
  // Save as PDF in a dialog that looks different on every machine" is not a
  // thing to talk a TA through over the phone. One button, one file.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-sp="' + src + '"]')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.sp = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('could not load ' + src));
      document.head.appendChild(s);
    });
  }

  // One sheet as a SINGLE standalone SVG in millimetres: the printable box with
  // the page nested inside it, the margin furniture over the top, and the
  // <defs> master carried along so the <use> still resolves once the sheet is
  // cut out of the document.
  //
  // The first attempt rasterised the live DOM with html2canvas and hung: the
  // page svg is a <use> pointing at a master that lives OUTSIDE the .sp-sheet
  // being captured, which is exactly the case that library handles worst.
  // Serialising the SVG ourselves is faster, has no second rendering engine to
  // disagree with the printer, and is the same geometry the print route uses.
  function sheetSvg(p, pageIndex, guides) {
    const { pageW, pageH } = sheetPaper(p.meta);
    const { pw, ph } = p.meta;
    const frag = buildPages(p, { guides });
    const nodes = Array.from(frag.childNodes);
    const defsSvg = nodes.find((n) => n.classList && n.classList.contains('sp-defs'));
    const pages = nodes.filter((n) => n.classList && n.classList.contains('sp-page'));
    const pageEl = pages[pageIndex];
    if (!pageEl) return null;
    const out = mk('svg', {
      xmlns: SVGNS, 'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      width: pageW + 'mm', height: pageH + 'mm',
      viewBox: '0 0 ' + pageW + ' ' + pageH,
    });
    out.appendChild(mk('rect', { x: 0, y: 0, width: pageW, height: pageH, fill: '#ffffff' }));
    if (defsSvg) for (const d of Array.from(defsSvg.childNodes)) out.appendChild(d.cloneNode(true));
    // the page sits inside the 10mm margin — the same inset wrapSheets applies
    pageEl.setAttribute('x', MARGIN);
    pageEl.setAttribute('y', MARGIN);
    pageEl.setAttribute('width', pw);
    pageEl.setAttribute('height', ph);
    pageEl.removeAttribute('style');
    out.appendChild(pageEl);
    const furn = buildFurniture(p.pages[pageIndex], p.meta);
    for (const f of Array.from(furn.childNodes)) out.appendChild(f.cloneNode(true));
    return out;
  }

  function rasterise(svgEl, pxW, pxH) {
    return new Promise((resolve, reject) => {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      const done = (fn, arg) => { URL.revokeObjectURL(url); fn(arg); };
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = pxW; cv.height = pxH;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.drawImage(img, 0, 0, pxW, pxH);
        done(resolve, cv);
      };
      img.onerror = () => done(reject, new Error('sheet would not rasterise'));
      img.src = url;
    });
  }

  async function exportPdf(plans, guides, title, progress) {
    const say = progress || (() => {});
    const list = Array.isArray(plans) ? plans : [plans];
    say('Loading…');
    await loadScript('vendor/jspdf.umd.min.js?v=1');
    const jsPDFctor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFctor) throw new Error('PDF writer unavailable');
    const { pageW, pageH } = sheetPaper(list[0].meta);
    const orient = pageW > pageH ? 'l' : 'p';
    const DPI = 200;   // enough that a 2.2-unit ruling line stays a line
    const pxW = Math.round(pageW / 25.4 * DPI), pxH = Math.round(pageH / 25.4 * DPI);
    const doc = new jsPDFctor({ orientation: orient, unit: 'mm', format: [pageW, pageH], compress: true });
    let n = 0;
    const total = list.reduce((t, p) => t + p.pages.length, 0);
    for (const p of list) {
      for (let i = 0; i < p.pages.length; i++) {
        say('Sheet ' + (++n) + ' of ' + total + '…');
        const svg = sheetSvg(p, i, guides);
        if (!svg) continue;
        const canvas = await rasterise(svg, pxW, pxH);
        if (n > 1) doc.addPage([pageW, pageH], orient);
        doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageW, pageH);
        canvas.width = canvas.height = 0;   // let the bitmap go straight away
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    doc.setProperties({ title: title || 'Sage Stage print', creator: 'Sage Stage' });
    const name = String(title || 'sage-stage-print').replace(/[^\w\- ]+/g, '').trim()
      .replace(/\s+/g, '-') || 'print';
    // Desktop: the anchor below is a silent no-op in the webview — and worse,
    // the caller then toasted "PDF saved to your downloads". The native panel
    // both saves and says where. Returns 'saved' | 'cancelled' there; the
    // browser anchor path returns 'saved' as it always effectively did.
    if (window.SagePlatform && SagePlatform.saveBlob) {
      return SagePlatform.saveBlob(name + '.pdf', doc.output('blob'), 'PDF');
    }
    const url = URL.createObjectURL(doc.output('blob'));
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  }

  // ------------------------------------------------------------- dialog (§4)
  // filled by SagePrint.init(deps) from app.js at boot, the SageExport pattern
  let D = null;
  function init(deps) { D = deps; }

  // budgets sell the finished thing; the names shift with the paper
  const BUDGET_NAMES = {
    A4: { 1: 'A4', 2: 'about A3', 4: 'about A2', 8: 'about A1' },
    A3: { 1: 'A3', 2: 'about A2', 4: 'about A1', 8: 'about A0' },
  };

  function openDialog(input, opts) {
    if (!D) return;
    // §4.6: the input is one SVG (the original contract) or a list of
    // { svg, label } pages from a widget's toPrintablePages(). Everything after
    // this line treats the job as a list, so there is only one code path.
    const raw = Array.isArray(input) ? input : [{ svg: input, label: null }];
    const docs = [];
    for (const d of raw) {
      const parsed = parseSvg(d && d.svg !== undefined ? d.svg : d);
      if (!parsed || typeof parsed.nodeName !== 'string' || parsed.nodeName.toLowerCase() !== 'svg') continue;
      docs.push({ svg: parsed, label: (d && d.label) || null });
    }
    // §8: nothing usable toasts and never opens the dialog (nodeName guard
    // typed, so a truthy non-element can't crash the guard itself)
    if (!docs.length) {
      D.toast('Couldn’t prepare the page — the widget didn’t produce an SVG');
      return;
    }
    const multi = docs.length > 1;
    const jobTitle = (opts && opts.title) || '';
    // the page the teacher was on is the only one ticked: paper waste is the
    // point of the feature, so the safe default prints least
    const startAt = Math.min(Math.max(0, (opts && opts.current) | 0), docs.length - 1);
    // A caller can open the dialog already set up — the Cold/Hot comparison
    // asks for exactly two pages on one sheet, and the contact sheet is
    // already that, so it opens this rather than growing a second view.
    const only = opts && Array.isArray(opts.only) && opts.only.length
      ? opts.only.filter((i) => i >= 0 && i < docs.length) : null;
    const wantContact = !!(opts && opts.contact) && docs.length > 1;
    // The PICKER was never hardcoded — BUDGETS has always been offered in full.
    // What was missing is any way for a caller to open the dialog already on the
    // budget its own entry point means: "Print…" on a bar means one sheet each,
    // "Print for the wall…" means eight. Unrecognised values fall back to 4 the
    // same way plan() does, and the choice is NOT remembered anywhere, so a
    // teacher who printed a wall poster once does not print eight by accident
    // next week.
    const state = {
      budget: wantContact ? 1 : (BUDGETS.includes(opts && opts.budget) ? opts.budget : 4),
      paper: 'A4', assembly: 'butt', guides: true,
      contact: wantContact,
      sel: new Set(only || [startAt]),
    };
    const ASSEMBLY_NAMES = { butt: 'Trim & tape', lap: 'Overlap & glue', widelap: 'Wide overlap' };
    const ASSEMBLY_HINT = {
      butt: 'Every join is marked “cut” on both sheets. Cut them all, lay the sheets face down with the cut edges touching, and run masking tape down the back. Match the shapes — each join has the same shape on both sheets. The writing is never repeated, so nothing can double up.',
      lap: 'Each join is marked twice, and the two marks do different jobs: “cut → 4” is the edge you cut, “4 on top” is where it lands. Cut, then glue that edge down over the shaded strip on the matching shape. The strip repeats the writing, which forgives a wobbly cut — but a seam a millimetre out shows as doubled letters.',
      widelap: 'The same as Overlap & glue, with a ' + WIDE_OVERLAP + 'mm strip instead of ' + OVERLAP + 'mm — twice as much paper to press a glue stick onto, and far more forgiving of a wobbly cut. It costs ' + WIDE_OVERLAP + 'mm of poster at every join, so the finished thing is a little smaller. Use it if ' + OVERLAP + 'mm turned out to be too little to glue confidently.',
    };
    let plans = [];

    // Every page in a job prints into one @page box, so the job carries one
    // sheet orientation: page 1 plans freely and the rest are forced to agree.
    // The contact sheet is ONE composite page built from whatever is ticked,
    // planned by the same plan() as everything else — so it lints, tiles and
    // prints by the same rules rather than down a second path. It is held
    // BESIDE the per-page plans rather than replacing them: `plans` is indexed
    // by document all over this dialog, and swapping it for a one-element array
    // left the page chips reading plans[3] of a list of one.
    let contactPlan = null;
    function planContact() {
      const list = docs.map((d, i) => ({ svg: d.svg, label: d.label || 'Page ' + (i + 1), i }))
        .filter((d) => state.sel.has(d.i));
      if (!list.length) return null;
      return plan(buildContactSheet(list, jobTitle), {
        budget: state.budget, paper: state.paper, assembly: state.assembly, label: null,
      });
    }
    function planAll() {
      const base = (i) => ({
        budget: state.budget, paper: state.paper, assembly: state.assembly,
        label: multi ? (docs[i].label || 'Page ' + (i + 1)) : null,
      });
      const first = plan(docs[0].svg, base(0));
      const orientation = first.ok ? first.meta.orientation : null;
      return docs.map((d, i) => (i === 0 ? first
        : plan(d.svg, Object.assign(base(i), orientation ? { orientation } : {}))));
    }
    const chosen = () => (state.contact
      ? (contactPlan && contactPlan.ok ? [contactPlan] : [])
      : plans.map((p, i) => ({ p, i }))
        .filter((x) => state.sel.has(x.i) && x.p.ok)
        .map((x) => x.p));

    D.openModal('Print — ' + ((opts && opts.title) || 'widget'), (body, finish) => {
      const preview = D.el('div', { class: 'sp-prev' });
      const pageList = D.el('div', { class: 'sp-pages' });
      const readout = D.el('div', { class: 'sp-readout' });
      const notes = D.el('div', { class: 'sp-notes' });
      const budgetSeg = D.el('div', { class: 'sp-seg' });
      const paperSeg = D.el('div', { class: 'sp-seg' });
      const asmSeg = D.el('div', { class: 'sp-seg' });
      const asmHint = D.el('div', { class: 'hint' });
      const printBtn = D.el('button', { class: 'btn', onclick: doPrint }, 'Print');

      function segBtn(label, active, fn) {
        return D.el('button', {
          class: 'btn ghost sp-seg-btn' + (active ? ' active' : ''),
          onclick: fn,
        }, label);
      }
      function paintControls() {
        budgetSeg.innerHTML = '';
        for (const b of BUDGETS) {
          budgetSeg.append(segBtn(
            b + (b === 1 ? ' sheet' : ' sheets') + ' · ' + BUDGET_NAMES[state.paper][b],
            state.budget === b,
            () => { state.budget = b; paintControls(); repaint(); }));
        }
        paperSeg.innerHTML = '';
        for (const pp of Object.keys(PAPERS)) {
          paperSeg.append(segBtn(pp, state.paper === pp,
            () => { state.paper = pp; paintControls(); repaint(); }));
        }
        asmSeg.innerHTML = '';
        for (const a of Object.keys(ASSEMBLY_NAMES)) {
          asmSeg.append(segBtn(ASSEMBLY_NAMES[a], state.assembly === a,
            () => { state.assembly = a; paintControls(); repaint(); }));
        }
        asmHint.textContent = ASSEMBLY_HINT[state.assembly];
      }

      // a chip per page: its own thumbnail with the sheet split drawn over it,
      // so how a page divides is visible without rendering it full size
      function paintPages() {
        pageList.innerHTML = '';
        if (!multi) return;
        pageList.append(D.el('div', { class: 'sp-lab' },
          state.contact ? 'Pages on the contact sheet' : 'Pages'));
        const row = D.el('div', { class: 'sp-page-row' });
        docs.forEach((d, i) => {
          const p = plans[i];
          const ok = p && p.ok;
          const on = state.sel.has(i);
          const chip = D.el('button', {
            class: 'sp-page-chip' + (on ? ' active' : '') + (ok ? '' : ' bad'),
            // p can legitimately be missing — never dereference it unguarded,
            // because a throw in here aborts the whole repaint silently
            title: ok ? '' : (((p && p.errors) || []).join('; ')),
            onclick: () => {
              if (!ok) return; // a page that can't print can't be ticked
              if (on) state.sel.delete(i); else state.sel.add(i);
              paintPages(); paintPreview();
            },
          });
          const thumb = D.el('div', { class: 'sp-page-thumb' });
          const mini = d.svg.cloneNode(true);
          mini.removeAttribute('width');
          mini.removeAttribute('height');
          thumb.append(mini);
          if (ok) {
            const grid = document.createElementNS(SVGNS, 'svg');
            grid.setAttribute('class', 'sp-page-grid');
            grid.setAttribute('viewBox', '0 0 ' + p.meta.cols + ' ' + p.meta.rows);
            grid.setAttribute('preserveAspectRatio', 'none');
            for (let r = 0; r < p.meta.rows; r++) {
              for (let c = 0; c < p.meta.cols; c++) {
                grid.appendChild(mk('rect', {
                  x: c, y: r, width: 1, height: 1,
                  fill: 'none', stroke: CUT, 'stroke-width': 0.04,
                }));
              }
            }
            thumb.append(grid);
          }
          chip.append(thumb, D.el('span', { class: 'sp-page-name' },
            d.label || 'Page ' + (i + 1)));
          chip.append(D.el('span', { class: 'sp-page-sheets' },
            ok ? p.meta.sheets + (p.meta.sheets === 1 ? ' sheet' : ' sheets') : 'can’t print'));
          row.append(chip);
        });
        pageList.append(row);
        pageList.append(D.el('div', { class: 'row', style: 'gap:6px;margin-top:6px;' },
          D.el('button', {
            class: 'btn ghost small',
            onclick: () => {
              plans.forEach((p, i) => { if (p.ok) state.sel.add(i); });
              paintPages(); paintPreview();
            },
          }, 'All'),
          D.el('button', {
            class: 'btn ghost small',
            onclick: () => { state.sel.clear(); paintPages(); paintPreview(); },
          }, 'None')));
      }

      function paintPreview() {
        preview.innerHTML = '';
        notes.innerHTML = '';
        const bad = plans.filter((p) => !p.ok);
        // one broken page never kills the job — it is marked and skipped
        for (const p of bad) {
          for (const e of p.errors) {
            notes.append(D.el('div', { class: 'sp-err' },
              '⛔ ' + (p === plans[0] && !multi ? '' : '') + e));
          }
        }
        const seen = new Set();
        for (const p of plans) {
          if (!p.ok) continue;
          for (const wn of p.warnings) {
            if (seen.has(wn)) continue;
            seen.add(wn);
            notes.append(D.el('div', { class: 'sp-warn' }, '⚠️ ' + wn));
          }
        }
        const picked = chosen();
        printBtn.disabled = !picked.length;
        if (!picked.length) {
          readout.textContent = plans.some((p) => p.ok)
            ? 'No pages ticked — nothing would print.'
            : 'This page can’t print until the widget’s output is fixed.';
          return;
        }
        readout.textContent = describeJob(picked);
        // §4's promise, now literal: the preview draws the whole sheet — paper
        // edge, 10mm margins and cut marks — through the same wrapSheets the
        // printer gets. Showing only the printable box is what let the seam
        // defect hide (2026-07-26).
        for (const p of picked) {
          const block = D.el('div', { class: 'sp-doc' });
          if (multi) {
            block.append(D.el('div', { class: 'sp-doc-lab' },
              (p.meta.label || '') + ' · ' + describe(p)));
          }
          const grid = D.el('div', { class: 'sp-doc-grid' });
          grid.style.gridTemplateColumns = 'repeat(' + p.meta.cols + ', 1fr)';
          grid.append(wrapSheets(buildPages(p, { guides: state.guides }), p, { mm: false }));
          block.append(grid);
          preview.append(block);
        }
      }

      function repaint() {
        plans = planAll();
        contactPlan = state.contact ? planContact() : null;
        paintPages(); paintPreview();
      }

      function doPrint() {
        const picked = chosen();
        if (!picked.length) return;
        printRoute(picked, state.guides, jobTitle);
      }

      const guidesTick = D.el('input', { type: 'checkbox' });
      guidesTick.checked = true;
      guidesTick.addEventListener('change', () => { state.guides = guidesTick.checked; paintPreview(); });

      // the whole unit, small, on one sheet — a record for planning or evidence
      const contactTick = D.el('input', { type: 'checkbox' });
      contactTick.checked = state.contact;
      contactTick.addEventListener('change', () => {
        state.contact = contactTick.checked;
        // a contact sheet of nothing is a blank page — tick everything that can
        // print rather than showing an empty one
        if (state.contact) {
          if (!state.sel.size) plans.forEach((p, i) => { if (p && p.ok) state.sel.add(i); });
          state.budget = 1;   // "on one sheet" is the whole point of it
          paintControls();
        }
        repaint();
      });
      const contactRow = multi
        ? D.el('label', { class: 'sp-guides-row' }, contactTick,
          ' Contact sheet — every ticked page, small, on one sheet')
        : null;

      const pdfBtn = D.el('button', {
        class: 'btn ghost',
        title: 'Write a PDF straight to your downloads, without going through the print dialog',
        onclick: async () => {
          const picked = chosen();
          if (!picked.length) return;
          const was = pdfBtn.textContent;
          pdfBtn.disabled = true;
          try {
            const r = await exportPdf(picked, state.guides, jobTitle || 'Sage Stage print',
              (m) => { pdfBtn.textContent = m; });
            // a cancelled save panel is a decision, not a success to announce
            if (r === 'saved') D.toast(window.SagePlatform ? 'PDF saved' : 'PDF saved to your downloads');
          } catch (err) {
            D.toast('Couldn’t write the PDF — use Print and choose “Save as PDF” instead.');
          } finally {
            pdfBtn.disabled = false;
            pdfBtn.textContent = was;
          }
        },
      }, 'Save PDF');

      body.append(D.el('div', { class: 'sp-dialog' },
        preview,
        D.el('div', { class: 'sp-ctrl' },
          pageList,
          contactRow,
          // "Size", not "Poster size": the first option is one sheet of A4, so
          // poster names only the big end of this control, never the control
          // (and never the action). Matches its sibling labels, which are
          // single nouns — Paper, Assembly.
          D.el('div', { class: 'sp-lab' }, 'Size'), budgetSeg,
          D.el('div', { class: 'sp-lab' }, 'Paper'), paperSeg,
          D.el('div', { class: 'sp-lab' }, 'Assembly'), asmSeg, asmHint,
          D.el('label', { class: 'sp-guides-row' }, guidesTick, ' Assembly guides'),
          readout, notes,
          D.el('div', { class: 'hint' },
            'Every mark is in the border, so it all disappears when you cut — nothing prints onto the finished poster. Cut edges carry heavier marks at both ends: line the scissors up on those two and cut between them. An edge with no mark is an outside edge: leave it alone. Nothing leaves this device.'),
          D.el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px;' },
            D.el('button', { class: 'btn ghost', onclick: () => finish() }, 'Close'),
            pdfBtn, printBtn),
        )));
      paintControls();
      repaint();
    });
  }

  // -------------------------------------------------------- print route (§6)
  // A hidden print-only root; @page margin 0 is deliberate twice over — our
  // 10mm insets become the only margin system, and the browser's own URL/date
  // header-footer (which lives in margin space) is suppressed.
  // the print root, built but not printed — exported so a PDF harness can
  // exercise the real route rather than a copy of it that drifts
  // takes one plan or a list of them (a multi-page job, §4.6) — every plan in a
  // job shares a sheet orientation, so one @page rule covers them all
  function buildPrintRoot(plans, guides) {
    const list = Array.isArray(plans) ? plans : [plans];
    const { pageW, pageH } = sheetPaper(list[0].meta);
    const root = document.createElement('div');
    root.id = 'sage-print-root';
    const style = document.createElement('style');
    style.textContent = '@page { size: ' + pageW + 'mm ' + pageH + 'mm; margin: 0; }';
    root.appendChild(style);
    // each sheet is a box sized exactly to the paper with the 10mm inset as
    // padding — never a margin that fragmentation rules can renegotiate
    // (review finding, 2026-07-26). wrapSheets also lays the margin furniture;
    // the preview calls the same function, so they agree.
    for (const p of list) {
      root.appendChild(wrapSheets(buildPages(p, { guides }), p, { mm: true }));
    }
    return root;
  }

  let printCleanupTimer = null;
  function printRoute(p, guides, title) {
    clearTimeout(printCleanupTimer); // a fresh run owns the cleanup, not the last one's timer
    const stale = document.getElementById('sage-print-root');
    if (stale) stale.remove(); // idempotent: a cancelled run must not stack
    const root = buildPrintRoot(p, guides);
    document.body.appendChild(root);
    document.body.classList.add('sp-printing');

    const prevTitle = document.title;
    if (title) document.title = title; // names the job and the Save-as-PDF file
    const cleanup = () => {
      root.remove();
      document.body.classList.remove('sp-printing');
      document.title = prevTitle;
      window.removeEventListener('afterprint', cleanup);
    };

    // Desktop: window.print() is a NO-OP in the webview (wry wires no print
    // delegate) — the old code left sp-printing set and the title overwritten
    // for the session, and nothing printed. The webview plugin's print command
    // runs the real macOS/Windows print dialog, and @media print CSS applies.
    // afterprint never fires on this path, so cleanup rides on a timer; the
    // root and body class are invisible on screen (print-media rules only), so
    // the only user-visible job here is putting the window title back, and the
    // stale-root sweep above keeps repeated prints tidy regardless.
    if (window.SagePlatform && SagePlatform.printPage) {
      window.addEventListener('afterprint', cleanup); // harmless if it ever arrives
      SagePlatform.printPage().then((ok) => {
        if (!ok) D.toast('Couldn’t open the print dialog — use Save PDF instead.');
        printCleanupTimer = setTimeout(cleanup, 120000);
      });
      return;
    }

    window.addEventListener('afterprint', cleanup); // fires on cancel too
    window.print();
  }

  // ------------------------------------------------------------------ export
  window.SagePrint = {
    VERSION: 9,
    MARGIN, OVERLAP, WIDE_OVERLAP, OVERLAPS, PAPERS, BUDGETS,
    lint, plan, describe, describeJob, buildPages, wrapSheets, buildPrintRoot,
    buildContactSheet, exportPdf,
    init, openDialog,
  };
})();
