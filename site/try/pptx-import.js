/* Sage Stage — PowerPoint (.pptx) import.
   The OOXML zip is parsed right here in the browser (vendored JSZip) — the file
   never leaves the device. Each slide becomes one screen, imported as a new
   deck, in one of two shapes:
     • pictures — the slide is rebuilt as a DOM approximation (background,
       images, shapes, styled text) and flattened to a JPEG that becomes the
       screen background;
     • widgets  — text boxes become editable Text widgets and pictures become
       Image widgets, positioned to match the slide.
   Fidelity is approximate by design: charts, SmartArt, WordArt and exotic
   geometry degrade to their text or are skipped and reported. */
(function () {
  'use strict';

  let D = null; // injected by SagePptxImport.init from app.js

  const VENDOR = {
    jszip: 'vendor/jszip.min.js?v=1',
    html2canvas: 'vendor/html2canvas.min.js?v=1',
  };

  const scriptPromises = {};
  function loadScript(src) {
    if (!scriptPromises[src]) {
      scriptPromises[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => {
          delete scriptPromises[src];
          s.remove();
          reject(new Error('Could not load ' + src.split('?')[0]));
        };
        document.head.append(s);
      });
    }
    return scriptPromises[src];
  }

  // rAF is suppressed in hidden/occluded tabs and chained setTimeouts get
  // throttled hard there; MessageChannel tasks are exempt, so the fallback
  // timer is armed from a fresh MessageChannel task each time (same pattern as
  // export.js) — a mid-import tab switch can't stall the run.
  const mcYield = (() => {
    const ch = new MessageChannel();
    const queue = [];
    ch.port1.onmessage = () => { const fn = queue.shift(); if (fn) fn(); };
    return () => new Promise((r) => { queue.push(r); ch.port2.postMessage(null); });
  })();
  const nextFrame = () => new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    requestAnimationFrame(done);
    mcYield().then(() => setTimeout(done, 250));
  });

  // ---------------------------------------------------------------- xml helpers
  // OOXML is namespaced (p:, a:, r:); matching on localName keeps the walk
  // immune to prefix choices and works with DOMParser's XML documents.

  const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const kids = (n, name) => (n ? [...n.children].filter((c) => c.localName === name) : []);
  const kid = (n, name) => (n ? [...n.children].find((c) => c.localName === name) || null : null);
  const walk = (n, ...names) => { for (const name of names) { n = kid(n, name); if (!n) return null; } return n; };
  const rAttr = (n, name) => (n && (n.getAttributeNS(R_NS, name) || n.getAttribute('r:' + name))) || null;
  const num = (n, name, dflt) => {
    const v = n && n.getAttribute(name);
    const parsed = v == null || v === '' ? NaN : parseInt(v, 10);
    return Number.isFinite(parsed) ? parsed : dflt;
  };

  async function loadXml(zip, path) {
    const f = zip.file(path);
    if (!f) return null;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    return doc.querySelector('parsererror') ? null : doc.documentElement;
  }

  // 'ppt/slides' + '../media/image1.png' → 'ppt/media/image1.png'
  function resolvePath(fromDir, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = (fromDir ? fromDir.split('/') : []).concat(target.split('/'));
    const out = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p && p !== '.') out.push(p);
    }
    return out.join('/');
  }

  // rels of a part, keyed by Id: { type (last path segment), path | url }
  async function loadRels(zip, partPath) {
    const cut = partPath.lastIndexOf('/');
    const dir = cut < 0 ? '' : partPath.slice(0, cut);
    const name = cut < 0 ? partPath : partPath.slice(cut + 1);
    const root = await loadXml(zip, (dir ? dir + '/' : '') + '_rels/' + name + '.rels');
    const map = {};
    if (root) {
      for (const r of kids(root, 'Relationship')) {
        const external = r.getAttribute('TargetMode') === 'External';
        map[r.getAttribute('Id')] = {
          type: (r.getAttribute('Type') || '').split('/').pop(),
          url: external ? r.getAttribute('Target') : null,
          path: external ? null : resolvePath(dir, r.getAttribute('Target') || ''),
        };
      }
    }
    return map;
  }
  const relOfType = (rels, type) => Object.values(rels).find((r) => r.type === type) || null;

  // ---------------------------------------------------------------- colors

  const PRST_COLORS = {
    white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', lime: '#00ff00',
    blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', gray: '#808080',
    grey: '#808080', silver: '#c0c0c0', maroon: '#800000', navy: '#000080', teal: '#008080',
    aqua: '#00ffff', cyan: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', olive: '#808000',
    darkGray: '#404040', lightGray: '#d3d3d3', darkRed: '#8b0000', darkBlue: '#00008b', darkGreen: '#006400',
  };
  // theme slots referenced under their text/background aliases
  const SCHEME_ALIAS = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };

  const hexToRgb = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

  // shade/tint/lumMod/lumOff live as children of the color element; values are
  // thousandths of a percent. This is an approximation of the OOXML math but
  // lands close enough for slide fills.
  function applyColorMods(hex, node) {
    let [r, g, b] = hexToRgb(hex);
    const factor = (name) => {
      const c = kid(node, name);
      return c ? num(c, 'val', 100000) / 100000 : null;
    };
    const shade = factor('shade');
    if (shade != null) { r *= shade; g *= shade; b *= shade; }
    const tint = factor('tint');
    if (tint != null) {
      r = r * tint + 255 * (1 - tint);
      g = g * tint + 255 * (1 - tint);
      b = b * tint + 255 * (1 - tint);
    }
    const lumMod = factor('lumMod'), lumOff = factor('lumOff');
    if (lumMod != null || lumOff != null) {
      // scale HSL luminance by interpolating toward black or white
      const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
      const l2 = Math.max(0, Math.min(1, l * (lumMod == null ? 1 : lumMod) + (lumOff || 0)));
      if (l2 < l && l > 0) { const k = l2 / l; r *= k; g *= k; b *= k; }
      else if (l2 > l && l < 1) {
        const k = (l2 - l) / (1 - l);
        r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
      }
    }
    return rgbToHex(r, g, b);
  }

  // resolve the color child (srgbClr / schemeClr / sysClr / prstClr) of `node`
  function colorOf(node, theme) {
    if (!node) return null;
    let c = kid(node, 'srgbClr');
    if (c) return applyColorMods('#' + c.getAttribute('val'), c);
    c = kid(node, 'schemeClr');
    if (c) {
      const key = c.getAttribute('val');
      const base = theme[SCHEME_ALIAS[key] || key];
      return base ? applyColorMods(base, c) : null;
    }
    c = kid(node, 'sysClr');
    if (c) return '#' + (c.getAttribute('lastClr') || '000000');
    c = kid(node, 'prstClr');
    if (c) return PRST_COLORS[c.getAttribute('val')] || '#808080';
    return null;
  }

  function parseTheme(root) {
    const map = {};
    const scheme = root && root.getElementsByTagNameNS('*', 'clrScheme')[0];
    if (scheme) {
      for (const c of [...scheme.children]) {
        const s = kid(c, 'srgbClr'), sys = kid(c, 'sysClr');
        map[c.localName] = s ? '#' + s.getAttribute('val') : sys ? '#' + (sys.getAttribute('lastClr') || '000000') : null;
      }
    }
    return map;
  }

  // ---------------------------------------------------------------- fills

  // {kind:'color'|'gradient'|'image'|'none', ...} or null = inherit/unknown
  function fillOf(holder, theme, rels) {
    if (!holder) return null;
    if (kid(holder, 'noFill')) return { kind: 'none' };
    const sf = kid(holder, 'solidFill');
    if (sf) {
      const v = colorOf(sf, theme);
      return v ? { kind: 'color', value: v } : { kind: 'none' };
    }
    const gf = kid(holder, 'gradFill');
    if (gf) {
      const stops = kids(kid(gf, 'gsLst') || gf, 'gs')
        .map((g) => ({ pos: num(g, 'pos', 0) / 1000, color: colorOf(g, theme) || '#888888' }))
        .sort((a, b) => a.pos - b.pos);
      if (!stops.length) return null;
      // OOXML angle: 60000ths of a degree, 0° pointing right; CSS 0deg points up
      const lin = kid(gf, 'lin');
      const deg = Math.round(num(lin, 'ang', 5400000) / 60000) + 90;
      return {
        kind: 'gradient',
        value: `linear-gradient(${deg}deg, ${stops.map((s) => `${s.color} ${Math.round(s.pos)}%`).join(', ')})`,
      };
    }
    const bf = kid(holder, 'blipFill');
    if (bf) {
      const rid = rAttr(kid(bf, 'blip'), 'embed');
      const rel = rid && rels[rid];
      if (rel && rel.path) return { kind: 'image', path: rel.path, tile: !!kid(bf, 'tile') };
      return { kind: 'none' };
    }
    return null;
  }

  function bgOf(root, theme, rels) {
    const bg = walk(root, 'cSld', 'bg');
    if (!bg) return null;
    const pr = kid(bg, 'bgPr');
    if (pr) return fillOf(pr, theme, rels);
    const ref = kid(bg, 'bgRef'); // theme fill reference — settle for its color
    if (ref) {
      const v = colorOf(ref, theme);
      return v ? { kind: 'color', value: v } : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- geometry

  function xfrmOf(holder) {
    const x = holder && kid(holder, 'xfrm');
    const off = kid(x, 'off'), ext = kid(x, 'ext');
    if (!off || !ext) return null;
    const chOff = kid(x, 'chOff'), chExt = kid(x, 'chExt');
    return {
      x: num(off, 'x', 0), y: num(off, 'y', 0), w: num(ext, 'cx', 0), h: num(ext, 'cy', 0),
      rot: num(x, 'rot', 0) / 60000,
      flipH: x.getAttribute('flipH') === '1', flipV: x.getAttribute('flipV') === '1',
      chX: chOff ? num(chOff, 'x', 0) : null, chY: chOff ? num(chOff, 'y', 0) : null,
      chW: chExt ? num(chExt, 'cx', 0) : null, chH: chExt ? num(chExt, 'cy', 0) : null,
    };
  }

  // group transforms compose to a plain scale + offset (rotation of groups is
  // rare in teacher decks and ignored)
  const IDENT = { sx: 1, sy: 1, dx: 0, dy: 0 };
  function composeGroup(ctx, g) {
    const sx = g.chW ? g.w / g.chW : 1;
    const sy = g.chH ? g.h / g.chH : 1;
    return {
      sx: ctx.sx * sx, sy: ctx.sy * sy,
      dx: ctx.dx + ctx.sx * (g.x - (g.chX || 0) * sx),
      dy: ctx.dy + ctx.sy * (g.y - (g.chY || 0) * sy),
    };
  }
  const applyCtx = (ctx, r) => ({
    ...r,
    x: ctx.sx * r.x + ctx.dx, y: ctx.sy * r.y + ctx.dy,
    w: r.w * ctx.sx, h: r.h * ctx.sy,
  });

  // ---------------------------------------------------------------- text

  // paragraph default sizes (pt) when a run carries no explicit size — the real
  // values live in master list styles, which we don't chase
  const PH_SIZE = { title: 36, ctrTitle: 40, subTitle: 24 };
  // slides that skip layout placeholders still need somewhere to land, as
  // fractions of the slide box
  const PH_RECT = {
    title: [0.05, 0.04, 0.9, 0.16],
    ctrTitle: [0.08, 0.3, 0.84, 0.24],
    subTitle: [0.08, 0.58, 0.84, 0.14],
    body: [0.05, 0.24, 0.9, 0.68],
  };

  function parseTxBody(tx, theme, rels, phType) {
    const defSize = PH_SIZE[phType] || 18;
    const bodyPr = kid(tx, 'bodyPr');
    const fit = bodyPr && kid(bodyPr, 'normAutofit');
    const fontScale = fit ? num(fit, 'fontScale', 100000) / 100000 : 1;
    const insets = {
      l: num(bodyPr, 'lIns', 91440), r: num(bodyPr, 'rIns', 91440),
      t: num(bodyPr, 'tIns', 45720), b: num(bodyPr, 'bIns', 45720),
    };
    const paras = [];
    for (const p of kids(tx, 'p')) {
      const pPr = kid(p, 'pPr');
      const para = {
        algn: pPr ? pPr.getAttribute('algn') : null,
        lvl: num(pPr, 'lvl', 0),
        bullet: pPr && kid(pPr, 'buNone') ? null
          : pPr && kid(pPr, 'buAutoNum') ? 'num'
          : pPr && kid(pPr, 'buChar') ? '•' : undefined, // undefined = not stated
        runs: [],
      };
      for (const node of [...p.children]) {
        if (node.localName === 'r' || node.localName === 'fld') {
          const rPr = kid(node, 'rPr');
          const t = kid(node, 't');
          const sz = rPr && rPr.getAttribute('sz');
          const link = (() => {
            const h = rPr && kid(rPr, 'hlinkClick');
            const rel = h && rels[rAttr(h, 'id')];
            return rel && rel.url ? rel.url : null;
          })();
          para.runs.push({
            text: t ? t.textContent : '',
            sizePt: (sz ? parseInt(sz, 10) / 100 : defSize) * fontScale,
            b: !!(rPr && rPr.getAttribute('b') === '1'),
            i: !!(rPr && rPr.getAttribute('i') === '1'),
            u: !!(rPr && rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none'),
            color: rPr ? colorOf(kid(rPr, 'solidFill'), theme) : null,
            link,
          });
        } else if (node.localName === 'br') {
          para.runs.push({ br: true });
        }
      }
      paras.push(para);
    }
    const hasText = paras.some((p) => p.runs.some((r) => (r.text || '').trim()));
    // heuristic: body placeholders are bulleted by default in nearly every
    // template, but the flag lives in master list styles we don't parse
    if (phType === 'body' && paras.filter((p) => p.runs.some((r) => (r.text || '').trim())).length > 1) {
      for (const p of paras) if (p.bullet === undefined) p.bullet = '•';
    }
    return {
      paras, hasText, insets,
      anchor: (bodyPr && bodyPr.getAttribute('anchor')) || 't',
    };
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // shared HTML builder for both stage rendering and Text-widget content.
  // pxPerPt converts run sizes into the target coordinate space.
  function parasToHtml(paras, pxPerPt) {
    const out = [];
    let autoNum = 0;
    for (const p of paras) {
      const nonEmpty = p.runs.some((r) => (r.text || '').trim());
      autoNum = p.bullet === 'num' ? autoNum + 1 : 0;
      const styles = [];
      if (p.algn === 'ctr') styles.push('text-align:center');
      else if (p.algn === 'r') styles.push('text-align:right');
      else if (p.algn === 'just') styles.push('text-align:justify');
      if (p.lvl) styles.push('padding-left:' + p.lvl * 1.2 + 'em');
      const firstSize = (p.runs.find((r) => r.sizePt) || { sizePt: 18 }).sizePt;
      styles.push('font-size:' + Math.max(6, Math.round(firstSize * pxPerPt)) + 'px');
      const spans = [];
      if (nonEmpty && p.bullet) spans.push(esc(p.bullet === 'num' ? autoNum + '. ' : p.bullet + ' '));
      for (const r of p.runs) {
        if (r.br) { spans.push('<br>'); continue; }
        if (!r.text) continue;
        const rs = ['font-size:' + Math.max(6, Math.round(r.sizePt * pxPerPt)) + 'px'];
        if (r.b) rs.push('font-weight:800');
        if (r.i) rs.push('font-style:italic');
        if (r.u) rs.push('text-decoration:underline');
        if (r.color) rs.push('color:' + r.color);
        let span = `<span style="${rs.join(';')}">${esc(r.text)}</span>`;
        // a slide's hyperlink is whatever the External relationship said it
        // was, and this markup goes straight into a text widget
        const link = r.link && window.SageSanitize.url(r.link);
        if (link) span = `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${span}</a>`;
        spans.push(span);
      }
      out.push(`<div style="${styles.join(';')}">${spans.length ? spans.join('') : '<br>'}</div>`);
    }
    return out.join('');
  }

  const plainText = (paras) => paras
    .map((p) => p.runs.map((r) => r.text || '').join(''))
    .filter((s) => s.trim())
    .join('\n');

  // ---------------------------------------------------------------- shape tree

  function phOf(sp) {
    return walk(sp, 'nvSpPr', 'nvPr', 'ph');
  }

  function collectPlaceholders(root, map, ctx) {
    const tree = walk(root, 'cSld', 'spTree');
    if (!tree) return;
    for (const sp of kids(tree, 'sp')) {
      const ph = phOf(sp);
      if (!ph) continue;
      const key = (ph.getAttribute('type') || 'body') + '|' + (ph.getAttribute('idx') || '');
      const rect = xfrmOf(kid(sp, 'spPr'));
      if (rect && !(key in map)) map[key] = applyCtx(ctx || IDENT, rect);
    }
  }

  function placeholderRect(phMap, type, idx) {
    return phMap[(type || 'body') + '|' + (idx || '')]
      || Object.entries(phMap).find(([k]) => k.startsWith((type || 'body') + '|'))?.[1]
      || null;
  }

  // walks a spTree and appends flat elements (slide-EMU coords) to out
  function walkTree(tree, ctx, S) {
    for (const node of [...tree.children]) {
      const name = node.localName;
      if (name === 'sp') {
        parseSp(node, ctx, S);
      } else if (name === 'pic') {
        const rect = xfrmOf(kid(node, 'spPr'));
        const rid = rAttr(walk(node, 'blipFill', 'blip'), 'embed');
        const rel = rid && S.rels[rid];
        if (rect && rel && rel.path) {
          S.elements.push({ kind: 'image', ...applyCtx(ctx, rect), path: rel.path });
        } else if (rid) {
          S.skipped.media++;
        }
      } else if (name === 'grpSp') {
        const g = xfrmOf(kid(node, 'grpSpPr'));
        walkTree(node, g ? composeGroup(ctx, g) : ctx, S);
      } else if (name === 'graphicFrame') {
        parseFrame(node, ctx, S);
      } else if (name === 'AlternateContent') {
        // Office wraps newer features here; Fallback holds the compatible markup
        const branch = kid(node, 'Fallback') || kid(node, 'Choice');
        if (branch) walkTree(branch, ctx, S);
      } else if (name === 'cxnSp') {
        S.skipped.shapes++;
      }
    }
  }

  function parseSp(sp, ctx, S) {
    const ph = phOf(sp);
    const phType = ph ? ph.getAttribute('type') || 'body' : null;
    if (phType === 'sldNum' || phType === 'ftr' || phType === 'dt') return; // chrome, not content
    const spPr = kid(sp, 'spPr');
    let rect = xfrmOf(spPr);
    if (rect) rect = applyCtx(ctx, rect);
    else if (ph) rect = placeholderRect(S.phMap, phType, ph.getAttribute('idx'));
    const tx = kid(sp, 'txBody');
    const text = tx ? parseTxBody(tx, S.theme, S.rels, phType) : null;
    if (!rect) {
      // nothing anchors it — give text a sensible default box, drop the rest
      if (!text || !text.hasText) return;
      const f = PH_RECT[phType] || [0.1, 0.3, 0.8, 0.4];
      rect = { x: f[0] * S.w, y: f[1] * S.h, w: f[2] * S.w, h: f[3] * S.h, rot: 0 };
    }
    const geomNode = spPr && kid(spPr, 'prstGeom');
    const el = {
      kind: 'shape',
      ...rect,
      geom: geomNode ? geomNode.getAttribute('prst') : 'rect',
      fill: fillOf(spPr, S.theme, S.rels),
      line: (() => {
        const ln = spPr && kid(spPr, 'ln');
        if (!ln || kid(ln, 'noFill')) return null;
        const color = colorOf(kid(ln, 'solidFill'), S.theme);
        return color ? { color, w: num(ln, 'w', 9525) } : null;
      })(),
      text: text && text.hasText ? text : null,
      phType,
    };
    // invisible empty boxes carry nothing worth importing
    if (!el.text && (!el.fill || el.fill.kind === 'none') && !el.line) return;
    S.elements.push(el);
  }

  function parseFrame(frame, ctx, S) {
    const rect = xfrmOf(frame);
    const data = walk(frame, 'graphic', 'graphicData');
    const uri = (data && data.getAttribute('uri')) || '';
    const tbl = data && kid(data, 'tbl');
    if (tbl && rect) {
      // tables flatten to one line per row — content survives, grid doesn't
      const paras = [];
      for (const tr of kids(tbl, 'tr')) {
        const cells = kids(tr, 'tc').map((tc) => {
          const body = kid(tc, 'txBody');
          return body ? plainText(parseTxBody(body, S.theme, S.rels, null).paras) : '';
        });
        paras.push({
          algn: null, lvl: 0, bullet: null,
          runs: [{ text: cells.join('   |   '), sizePt: 14, b: paras.length === 0 }],
        });
      }
      S.elements.push({
        kind: 'shape', ...applyCtx(ctx, rect), geom: 'rect',
        fill: { kind: 'color', value: '#ffffff' }, line: { color: '#94a3b8', w: 9525 },
        text: { paras, hasText: true, anchor: 't', insets: { l: 91440, r: 91440, t: 45720, b: 45720 } },
        phType: null,
      });
    } else if (uri.includes('chart') || uri.includes('diagram') || uri.includes('ole')) {
      S.skipped.charts++;
    }
  }

  // ---------------------------------------------------------------- parse driver

  async function parseFile(file, progress) {
    await loadScript(VENDOR.jszip);
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] === 0xd0 && head[1] === 0xcf) {
      throw new Error('This is the old .ppt format. Open it in PowerPoint (or Google Slides) and save as .pptx, then try again.');
    }
    if (head[0] !== 0x50 || head[1] !== 0x4b) {
      throw new Error("That file doesn't look like a PowerPoint .pptx.");
    }
    const zip = await window.JSZip.loadAsync(buf);
    const pres = await loadXml(zip, 'ppt/presentation.xml');
    if (!pres) throw new Error('No presentation found inside the file.');
    const presRels = await loadRels(zip, 'ppt/presentation.xml');
    const sldSz = kid(pres, 'sldSz');
    const W = num(sldSz, 'cx', 12192000), H = num(sldSz, 'cy', 6858000);
    const slidePaths = kids(kid(pres, 'sldIdLst'), 'sldId')
      .map((n) => { const rel = presRels[rAttr(n, 'id')]; return rel && rel.path; })
      .filter(Boolean);
    if (!slidePaths.length) throw new Error('No slides found in the file.');

    const layoutCache = new Map();
    const skipped = { charts: 0, media: 0, shapes: 0 };
    const slides = [];

    for (let i = 0; i < slidePaths.length; i++) {
      if (progress) progress('Reading slide ' + (i + 1) + ' / ' + slidePaths.length + '…');
      const path = slidePaths[i];
      const root = await loadXml(zip, path);
      if (!root) continue;
      const rels = await loadRels(zip, path);

      // layout + master give us theme colors, placeholder positions and
      // inherited backgrounds; cache them per layout part
      let inherited = { theme: {}, phMap: {}, bg: null };
      const layoutRel = relOfType(rels, 'slideLayout');
      if (layoutRel) {
        if (!layoutCache.has(layoutRel.path)) {
          const layoutRoot = await loadXml(zip, layoutRel.path);
          const layoutRels = await loadRels(zip, layoutRel.path);
          const masterRel = layoutRoot && relOfType(layoutRels, 'slideMaster');
          const masterRoot = masterRel && await loadXml(zip, masterRel.path);
          const masterRels = masterRel ? await loadRels(zip, masterRel.path) : {};
          const themeRel = masterRel && relOfType(masterRels, 'theme');
          const theme = parseTheme(themeRel && await loadXml(zip, themeRel.path));
          const phMap = {};
          collectPlaceholders(layoutRoot, phMap, IDENT);
          if (masterRoot) collectPlaceholders(masterRoot, phMap, IDENT);
          const bg = (layoutRoot && bgOf(layoutRoot, theme, layoutRels))
            || (masterRoot && bgOf(masterRoot, theme, masterRels)) || null;
          layoutCache.set(layoutRel.path, { theme, phMap, bg });
        }
        inherited = layoutCache.get(layoutRel.path);
      }

      const S = {
        w: W, h: H, rels, theme: inherited.theme, phMap: inherited.phMap,
        elements: [], skipped,
      };
      S.bg = bgOf(root, S.theme, rels) || inherited.bg;
      const tree = walk(root, 'cSld', 'spTree');
      if (tree) walkTree(tree, IDENT, S);

      const titleEl = S.elements.find((e) => e.text && (e.phType === 'title' || e.phType === 'ctrTitle'));
      slides.push({
        bg: S.bg, elements: S.elements,
        title: titleEl ? plainText(titleEl.text.paras).split('\n')[0].slice(0, 40) : '',
      });
    }
    if (!slides.length) throw new Error('None of the slides could be read.');
    return {
      zip, slides, skipped,
      slideW: W, slideH: H,
      name: (file.name || 'PowerPoint').replace(/\.pptx?$/i, ''),
    };
  }

  // ---------------------------------------------------------------- media

  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
  };

  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to decode'));
    img.src = src;
  });

  function hasAlpha(ctx, w, h) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < d.length; i += 64) if (d[i] < 250) return true;
    } catch (e) { /* tainted canvas can't happen with data URLs, but be safe */ }
    return false;
  }

  // media file → data URL. Small files keep their original bytes (crisper, and
  // GIF animation / SVG vectors survive); big rasters are downscaled so
  // localStorage stays healthy. Returns null for formats a browser can't draw
  // (EMF/WMF/TIFF).
  async function mediaDataUrl(zip, path, maxW, cache) {
    const key = path + '@' + maxW;
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const ext = (path.split('.').pop() || '').toLowerCase();
        const mime = MIME[ext];
        const f = zip.file(path);
        if (!f || !mime) return null;
        const buf = await f.async('arraybuffer');
        const raw = 'data:' + mime + ';base64,' + bufToBase64(buf);
        if (mime === 'image/svg+xml' || buf.byteLength < 300_000) return raw;
        try {
          const img = await loadImage(raw);
          const scale = Math.min(1, maxW / img.width);
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          const out = hasAlpha(ctx, cv.width, cv.height)
            ? cv.toDataURL('image/png')
            : cv.toDataURL('image/jpeg', 0.85);
          cv.width = cv.height = 0;
          return out.length < raw.length ? out : raw;
        } catch (e) {
          return raw; // undecodable — keep the original bytes and hope
        }
      })());
    }
    return cache.get(key);
  }

  // ---------------------------------------------------------------- pictures mode

  function cssBackground(style, bg) {
    if (!bg) { style.background = '#ffffff'; return; }
    if (bg.kind === 'color') style.background = bg.value;
    else if (bg.kind === 'gradient') style.background = bg.value;
    else if (bg.kind === 'image' && bg.src) {
      style.backgroundImage = `url(${bg.src})`;
      if (bg.tile) style.backgroundRepeat = 'repeat';
      else { style.backgroundSize = '100% 100%'; }
      style.backgroundColor = '#ffffff';
    } else style.background = '#ffffff';
  }

  function buildSlideDom(slide, slideW, slideH, RW) {
    const k = RW / slideW; // px per EMU
    const RH = Math.round(slideH * k);
    const pxPerPt = 12700 * k;
    const stage = document.createElement('div');
    stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${RW}px;height:${RH}px;overflow:hidden;`
      + `font-family:Arial,'Helvetica Neue',sans-serif;line-height:1.2;pointer-events:none;`;
    cssBackground(stage.style, slide.bg);

    for (const e of slide.elements) {
      const x = Math.round(e.x * k), y = Math.round(e.y * k);
      const w = Math.max(1, Math.round(e.w * k)), h = Math.max(1, Math.round(e.h * k));
      const rot = e.rot ? `rotate(${e.rot}deg)` : '';
      const flip = e.flipH ? ' scaleX(-1)' : '';
      if (e.kind === 'image') {
        if (!e.src) continue;
        const img = document.createElement('img');
        img.src = e.src;
        img.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
        if (rot || flip) img.style.transform = rot + flip;
        stage.append(img);
      } else if (e.kind === 'shape') {
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
        if (rot || flip) box.style.transform = rot + flip;
        if (e.fill && e.fill.kind !== 'none') cssBackground(box.style, e.fill);
        if (e.line) box.style.border = `${Math.max(1, Math.round(e.line.w * k))}px solid ${e.line.color}`;
        if (e.geom === 'ellipse') box.style.borderRadius = '50%';
        else if (e.geom && e.geom.startsWith('round')) box.style.borderRadius = Math.round(Math.min(w, h) * 0.16) + 'px';
        if (e.text) {
          const t = e.text;
          const inner = document.createElement('div');
          const justify = t.anchor === 'ctr' ? 'center' : t.anchor === 'b' ? 'flex-end' : 'flex-start';
          inner.style.cssText = 'position:absolute;display:flex;flex-direction:column;'
            + `justify-content:${justify};`
            + `left:${Math.round(t.insets.l * k)}px;right:${Math.round(t.insets.r * k)}px;`
            + `top:${Math.round(t.insets.t * k)}px;bottom:${Math.round(t.insets.b * k)}px;`;
          inner.innerHTML = parasToHtml(t.paras, pxPerPt);
          box.append(inner);
        }
        stage.append(box);
      }
    }
    return { stage, RH };
  }

  // plain-canvas fallback when html2canvas is unavailable or chokes: background
  // + images + wrapped plain text — legible, if unstyled
  async function fallbackRaster(slide, slideW, slideH, RW) {
    const k = RW / slideW;
    const RH = Math.round(slideH * k);
    const cv = document.createElement('canvas');
    cv.width = RW; cv.height = RH;
    const ctx = cv.getContext('2d');
    const baseHex = /#[0-9a-fA-F]{3,8}/.exec((slide.bg && slide.bg.value) || '');
    ctx.fillStyle = baseHex ? baseHex[0] : '#ffffff';
    ctx.fillRect(0, 0, RW, RH);
    if (slide.bg && slide.bg.kind === 'image' && slide.bg.src) {
      try { ctx.drawImage(await loadImage(slide.bg.src), 0, 0, RW, RH); } catch (e) { /* keep fill */ }
    }
    for (const e of slide.elements) {
      const x = e.x * k, y = e.y * k, w = e.w * k, h = e.h * k;
      if (e.kind === 'image' && e.src) {
        try { ctx.drawImage(await loadImage(e.src), x, y, w, h); } catch (err) { /* skip */ }
      } else if (e.kind === 'shape') {
        if (e.fill && e.fill.kind === 'color') { ctx.fillStyle = e.fill.value; ctx.fillRect(x, y, w, h); }
        if (e.text) {
          let ty = y + 4;
          for (const p of e.text.paras) {
            const size = Math.max(8, ((p.runs.find((r) => r.sizePt) || { sizePt: 18 }).sizePt) * 12700 * k);
            const color = (p.runs.find((r) => r.color) || {}).color || '#1e293b';
            ctx.font = '600 ' + Math.round(size) + 'px Arial, sans-serif';
            ctx.fillStyle = color;
            ctx.textBaseline = 'top';
            const words = p.runs.map((r) => r.text || '').join('').split(/\s+/).filter(Boolean);
            let line = '';
            for (const word of words) {
              const probe = line ? line + ' ' + word : word;
              if (ctx.measureText(probe).width > w - 8 && line) {
                ctx.fillText(line, x + 4, ty); ty += size * 1.25; line = word;
              } else line = probe;
            }
            if (line) { ctx.fillText(line, x + 4, ty); ty += size * 1.25; }
          }
        }
      }
    }
    return cv;
  }

  // ---------------------------------------------------------------- screen builders

  // resolve every media reference on a slide into data URLs (mutates elements)
  async function resolveMedia(parsed, slide, k, cache) {
    if (slide.bg && slide.bg.kind === 'image' && !slide.bg.src) {
      slide.bg.src = await mediaDataUrl(parsed.zip, slide.bg.path, 1600, cache);
      if (!slide.bg.src) { parsed.skipped.media++; slide.bg = { kind: 'color', value: '#ffffff' }; }
    }
    for (const e of slide.elements) {
      if (e.kind === 'image' && !e.src) {
        const maxW = Math.min(1600, Math.max(200, Math.ceil(e.w * k * 1.25)));
        e.src = await mediaDataUrl(parsed.zip, e.path, maxW, cache);
        if (!e.src) parsed.skipped.media++;
      }
      if (e.kind === 'shape' && e.fill && e.fill.kind === 'image' && !e.fill.src) {
        e.fill.src = await mediaDataUrl(parsed.zip, e.fill.path, 1200, cache);
        if (!e.fill.src) e.fill = { kind: 'none' };
      }
    }
  }

  async function slideToPicture(parsed, slide, RW, quality, cache) {
    await resolveMedia(parsed, slide, RW / parsed.slideW, cache);
    let canvas = null;
    if (typeof window.html2canvas === 'function') {
      const { stage, RH } = buildSlideDom(slide, parsed.slideW, parsed.slideH, RW);
      document.body.append(stage);
      try {
        await nextFrame();
        canvas = await window.html2canvas(stage, {
          scale: 1, width: RW, height: RH,
          backgroundColor: null, logging: false, useCORS: true,
        });
      } catch (e) {
        canvas = null;
      } finally {
        stage.remove();
      }
    }
    if (!canvas) canvas = await fallbackRaster(slide, parsed.slideW, parsed.slideH, RW);
    const url = canvas.toDataURL('image/jpeg', quality);
    canvas.width = canvas.height = 0;
    return { background: { type: 'image', value: url }, widgets: [] };
  }

  // widget headers sit above the body inside the widget box; shifting the box
  // up by the header height keeps the *content* where the slide put it
  const HEADER_H = 30;

  async function slideToWidgets(parsed, slide, cache) {
    // 0×0 when the window is hidden/minimised mid-import — fall back rather
    // than placing every widget at NaN
    const VW = window.innerWidth || 1280, VH = window.innerHeight || 720;
    const k = Math.min(VW / parsed.slideW, VH / parsed.slideH); // px per EMU
    const ox = (VW - parsed.slideW * k) / 2;
    const oy = (VH - parsed.slideH * k) / 2;
    await resolveMedia(parsed, slide, k, cache);

    let background = { type: 'color', value: '#ffffff' };
    if (slide.bg) {
      if (slide.bg.kind === 'color') background = { type: 'color', value: slide.bg.value };
      else if (slide.bg.kind === 'gradient') background = { type: 'gradient', value: slide.bg.value };
      else if (slide.bg.kind === 'image' && slide.bg.src) background = { type: 'image', value: slide.bg.src };
    }

    const widgets = [];
    let z = 10;
    for (const e of slide.elements) {
      const x = Math.round(ox + e.x * k), y = Math.round(oy + e.y * k);
      const w = Math.max(90, Math.round(e.w * k)), h = Math.max(50, Math.round(e.h * k));
      if (e.kind === 'image' && e.src) {
        widgets.push({
          type: 'image', theme: 'clear',
          x, y: y - HEADER_H, w, h: h + HEADER_H, z: ++z,
          props: { src: e.src, fit: 'contain' },
        });
      } else if (e.kind === 'shape' && e.text) {
        const firstRun = e.text.paras.flatMap((p) => p.runs).find((r) => (r.text || '').trim()) || {};
        const first = e.text.paras[0] || {};
        widgets.push({
          type: 'text', theme: 'clear',
          x, y: y - HEADER_H, w, h: h + HEADER_H, z: ++z,
          props: {
            html: parasToHtml(e.text.paras, 12700 * k),
            size: Math.max(10, Math.min(120, Math.round((firstRun.sizePt || 18) * 12700 * k))),
            align: first.algn === 'ctr' ? 'center' : first.algn === 'r' ? 'right' : 'left',
            color: firstRun.color || '#22303c',
            font: "'Quicksand', ui-rounded, sans-serif",
          },
        });
      } else {
        parsed.skipped.shapes++; // decorative shape with no text — no widget for it
      }
    }
    return { background, widgets };
  }

  async function runImport(parsed, mode, progress, isCancelled) {
    const n = parsed.slides.length;
    const cache = new Map();
    const screens = [];
    if (mode === 'pictures') {
      try { await loadScript(VENDOR.html2canvas); } catch (e) { /* fallback raster covers it */ }
    }
    // longer decks get compressed harder so the whole thing fits in localStorage
    const RW = n > 24 ? 1024 : n > 12 ? 1280 : 1440;
    const quality = n > 24 ? 0.78 : 0.82;
    for (let i = 0; i < n; i++) {
      if (isCancelled()) return null;
      progress('Building slide ' + (i + 1) + ' / ' + n + '…');
      await nextFrame();
      const slide = parsed.slides[i];
      let screen;
      try {
        screen = mode === 'pictures'
          ? await slideToPicture(parsed, slide, RW, quality, cache)
          : await slideToWidgets(parsed, slide, cache);
      } catch (e) {
        screen = { background: { type: 'color', value: '#ffffff' }, widgets: [] };
      }
      screen.name = slide.title || 'Slide ' + (i + 1);
      screens.push(screen);
    }
    return screens;
  }

  // ---------------------------------------------------------------- dialog

  const MODES = [
    {
      id: 'pictures', title: 'Slides as pictures',
      desc: 'Each slide becomes a screen background — closest look to the original. Add widgets and draw on top.',
    },
    {
      id: 'widgets', title: 'Editable text & images',
      desc: 'Text boxes become Text widgets and pictures become Image widgets you can move, restyle and reuse.',
    },
  ];

  function pickFile(cb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    input.addEventListener('change', () => { if (input.files[0]) cb(input.files[0]); });
    input.click();
  }

  // targetDeckId: import into that existing deck (slides land after its current
  // screens) instead of creating a new deck
  function openDialog(preFile, targetDeckId) {
    if (!D) return;
    D.openModal('Import PowerPoint', (body, finish) => {
      let mode = 'pictures';
      let parsed = null;
      let cancelled = false;

      const progressUi = () => {
        body.innerHTML = '';
        const bar = D.el('div', { class: 'export-progress-fill' });
        const label = D.el('div', { class: 'export-progress-label' }, 'Preparing…');
        body.append(label, D.el('div', { class: 'export-progress' }, bar),
          D.el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px;' },
            D.el('button', { class: 'btn ghost', onclick: () => { cancelled = true; finish(); } }, 'Cancel')));
        let step = 0;
        const total = (parsed ? parsed.slides.length : 8) + 2;
        return (msg) => {
          label.textContent = msg;
          bar.style.width = Math.min(96, Math.round((++step / total) * 100)) + '%';
        };
      };

      async function parse(file) {
        const progress = progressUi();
        try {
          parsed = await parseFile(file, progress);
          if (cancelled) return;
          chooser();
        } catch (err) {
          if (cancelled) return;
          body.innerHTML = '';
          body.append(
            D.el('p', { style: 'margin-top:0;' }, '⚠️ ' + (err && err.message || 'Could not read that file.')),
            D.el('div', { class: 'row', style: 'justify-content:flex-end;' },
              D.el('button', { class: 'btn ghost', onclick: () => finish() }, 'Close')),
          );
        }
      }

      function chooser() {
        body.innerHTML = '';
        const cards = [];
        const pick = (id) => {
          mode = id;
          for (const c of cards) c.classList.toggle('active', c.dataset.mode === mode);
        };
        const grid = D.el('div', { class: 'export-formats' });
        for (const m of MODES) {
          const card = D.el('button', {
            class: 'export-format-card' + (m.id === mode ? ' active' : ''),
            'data-mode': m.id, onclick: () => pick(m.id),
          }, D.el('div', { class: 'export-format-title' }, m.title),
            D.el('div', { class: 'export-format-desc' }, m.desc));
          cards.push(card);
          grid.append(card);
        }
        body.append(
          D.el('p', { style: 'margin-top:0;font-weight:700;' },
            parsed.slides.length + ' slide' + (parsed.slides.length === 1 ? '' : 's') + ' — “' + parsed.name + '”'),
          grid,
          D.el('div', { class: 'hint' },
            'The deck is rebuilt locally, so fancy effects, charts and animations are simplified. Nothing leaves this device.'),
          D.el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px;' },
            D.el('button', { class: 'btn ghost', onclick: () => finish() }, 'Cancel'),
            D.el('button', { class: 'btn', onclick: () => start() }, 'Import')),
        );
      }

      async function start() {
        const progress = progressUi();
        try {
          const screens = await runImport(parsed, mode, progress, () => cancelled);
          if (!screens || cancelled) return;
          const deck = targetDeckId
            ? D.appendImportedScreens(targetDeckId, screens)
            : D.addImportedDeck(parsed.name, screens);
          if (!deck) throw new Error('The deck no longer exists.');
          D.toast((targetDeckId ? 'Added ' : 'Imported ') + screens.length + ' slide' + (screens.length === 1 ? '' : 's') + ' into “' + deck.name + '”');
          const problems = [];
          const sk = parsed.skipped;
          if (sk.charts) problems.push(sk.charts + ' chart/diagram element' + (sk.charts === 1 ? '' : 's') + " couldn't be imported.");
          if (sk.media) problems.push(sk.media + ' picture' + (sk.media === 1 ? '' : 's') + ' were in a format browsers can\'t show (e.g. WMF/EMF clip art).');
          if (mode === 'widgets' && sk.shapes) problems.push(sk.shapes + ' decorative shape' + (sk.shapes === 1 ? '' : 's') + ' were left out.');
          const bytes = JSON.stringify(screens).length;
          if (bytes > 3_000_000) {
            problems.push('This deck is big (~' + (bytes / 1_000_000).toFixed(1) + ' MB of ~5 MB of browser storage). If saving fails, delete old decks or re-import with "Editable text & images".');
          }
          if (!problems.length) { finish(); return; }
          body.innerHTML = '';
          body.append(
            D.el('p', { style: 'font-weight:700;margin-top:0;' }, 'Imported with notes:'),
            D.el('ul', { class: 'export-warnings' }, problems.map((p) => D.el('li', {}, p))),
            D.el('div', { class: 'row', style: 'justify-content:flex-end;' },
              D.el('button', { class: 'btn', onclick: () => finish() }, 'Done')),
          );
        } catch (err) {
          body.innerHTML = '';
          body.append(
            D.el('p', { style: 'margin-top:0;' }, '⚠️ Import failed: ' + (err && err.message || 'unknown error')),
            D.el('div', { class: 'row', style: 'justify-content:flex-end;' },
              D.el('button', { class: 'btn ghost', onclick: () => finish() }, 'Close')),
          );
        }
      }

      if (preFile) {
        parse(preFile);
      } else {
        body.append(
          D.el('p', { style: 'margin-top:0;' }, targetDeckId
            ? 'Add slides from a presentation to this deck — they appear after the screens already there.'
            : 'Bring an existing presentation onto your classroom screen — every slide becomes a screen in a new deck.'),
          D.el('div', { class: 'row' },
            D.el('button', { class: 'btn', onclick: () => pickFile((f) => parse(f)) }, 'Choose a .pptx file…')),
          D.el('div', { class: 'hint' }, 'Tip: you can also drop a .pptx anywhere on the screen. Everything stays on this device.'),
        );
      }
    });
  }

  window.SagePptxImport = {
    init(deps) { D = deps; },
    openDialog,
  };
})();
