/* Sage Stage — screen export (PNG / PDF / PPTX).
   Everything runs locally: vendored libraries under vendor/ are lazy-loaded at
   export time, screens are rendered off-screen from saved state, and nothing in
   this file writes to state or localStorage. */
(function () {
  'use strict';

  // filled by SageExport.init(deps) from app.js at boot
  let D = null;

  // widget types whose live content (cross-origin iframes / camera streams)
  // cannot be rasterized — they export as labeled placeholder cards instead
  const PLACEHOLDER_TYPES = { embed: 1, video: 1, webcam: 1, pdf: 1 };

  const VENDOR = {
    html2canvas: 'vendor/html2canvas.min.js?v=1',
    jszip: 'vendor/jszip.min.js?v=1',
    jspdf: 'vendor/jspdf.umd.min.js?v=1',
    pptxgen: 'vendor/pptxgen.bundle.min.js?v=1',
  };

  // ---------------------------------------------------------------- helpers

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

  function withTimeout(promise, ms, what) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms)),
    ]);
  }

  // Yield to the paint loop, but never stall. Two browser behaviours make a
  // naive rAF-or-setTimeout yield dangerous in hidden/occluded tabs: rAF is
  // suppressed entirely, and *chained* setTimeouts get intensively throttled
  // (up to one tick per minute at nesting depth ≥5). MessageChannel tasks are
  // exempt, so the fallback timer is armed from a fresh MessageChannel task
  // each time — its nesting level resets and the worst case stays ~1s.
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

  function sanitizeFilename(name) {
    return (name || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'sage-stage';
  }

  // first #hex in a background value — the guaranteed-paintable base color
  function baseHex(bg) {
    const m = /#[0-9a-fA-F]{3,8}/.exec(bg && bg.value || '');
    return m ? m[0] : '#0f766e';
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!/^data:/.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('background image failed to load'));
      img.src = src;
    });
  }

  function coverDraw(ctx, img, cw, ch) {
    const scale = Math.max(cw / img.width, ch / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  function releaseCanvas(cv) {
    if (cv) { cv.width = 0; cv.height = 0; }
  }

  // generalized from the draw-pad's exportPNG: native save dialog when the
  // browser has one, anchor download otherwise
  async function downloadBlob(blob, name, description, mime, ext) {
    // Desktop first. In the webview, showSaveFilePicker doesn't exist and a
    // blob anchor does NOTHING — this function then toasted "downloading to
    // your Downloads folder" over that nothing, which is the worst possible
    // behaviour for an export button. The platform save panel is real.
    if (window.SagePlatform && SagePlatform.saveBlob) {
      const r = await SagePlatform.saveBlob(name, blob, description);
      if (r === 'saved') { D.toast('Saved “' + name + '”'); return true; }
      return false;
    }
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description, accept: { [mime]: [ext] } }],
        });
        const ws = await handle.createWritable();
        await ws.write(blob);
        await ws.close();
        D.toast('Saved as “' + handle.name + '”');
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // user cancelled
        // picker failed for another reason — fall through to anchor download
      }
    }
    const a = D.el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    D.toast('“' + name + '” is downloading to your Downloads folder');
    return true;
  }

  // ---------------------------------------------------------------- screen data

  // this screen's widgets plus siblings' "show on all screens" widgets,
  // deduped by id and sorted by z — mirrors renderScreen's collection
  function widgetsFor(index) {
    const ss = D.screens();
    const sc = ss[index];
    const toShow = [...sc.widgets];
    const shown = new Set(toShow.map((w) => w.id));
    ss.forEach((s, i) => {
      if (i === index) return;
      for (const w of s.widgets) {
        if (w.everywhere && !shown.has(w.id)) { toShow.push(w); shown.add(w.id); }
      }
    });
    return toShow.sort((a, b) => (a.z || 0) - (b.z || 0));
  }

  // this screen's ink plus siblings' "show on all screens" ink, in the same
  // order the live board paints them (own first, then everywhere)
  function inkFor(index) {
    const ss = D.screens();
    const sc = ss[index];
    const list = [...D.screenInk(sc)];
    for (const s of ss) {
      if (s === sc) continue;
      for (const stroke of D.screenInk(s)) if (stroke.everywhere) list.push(stroke);
    }
    return list;
  }

  // clickable regions worth preserving in PDF/PPTX output
  function linksFor(widgets) {
    const links = [];
    for (const w of widgets) {
      let url = null, label = null;
      if (w.type === 'link') { url = w.props.url; label = w.props.label; }
      else if (w.type === 'embed' || w.type === 'video' || w.type === 'pdf') url = w.props.url;
      else if (w.type === 'qr' && /^https?:\/\//i.test(w.props.text || '')) url = w.props.text;
      if (url && /^https?:\/\//i.test(url)) {
        links.push({ url, label: label || url, x: w.x, y: w.y, w: w.w, h: w.h });
      }
    }
    return links;
  }

  // plain-text content of text widgets — carried into PPTX speaker notes
  function textNotesFor(widgets) {
    const notes = [];
    for (const w of widgets) {
      if (w.type !== 'text' || !w.props.html) continue;
      const text = window.SageSanitize.text(w.props.html).replace(/\s+\n/g, '\n').trim();
      if (text) notes.push(text);
    }
    return notes;
  }

  // ---------------------------------------------------------------- off-screen mount

  function elideUrl(url, max = 60) {
    return url.length > max ? url.slice(0, max - 1) + '…' : url;
  }

  function placeholderCard(def, w) {
    const detail = w.type === 'webcam' ? 'Camera' : (w.props.url ? elideUrl(w.props.url) : 'No URL set');
    return D.el('div', { class: 'export-placeholder' },
      D.el('div', { class: 'export-placeholder-icon' }, D.iconEl(def.icon)),
      D.el('div', { class: 'export-placeholder-title' }, def.title),
      D.el('div', { class: 'export-placeholder-url' }, detail));
  }

  // rebuild the widget shell without any of mountWidget's live wiring: no
  // instance registry, no pointer handlers, and a no-op api so def.mount can
  // never reach save(). Mounts get a deep clone of the widget, so mount-time
  // prop mutations (timers, games) never touch real state.
  function mountForExport(container, w, cleanups) {
    const def = D.WIDGETS[w.type];
    if (!def) return;
    const body = D.el('div', { class: 'widget-body' });
    const widgetEl = D.el('div', {
      class: 'widget' + (w.locked ? ' locked' : ''),
      style: `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;z-index:${w.z || 10};`,
    });
    const header = D.el('div', { class: 'widget-header', style: '--acc:' + (def.accent || '#c7d2fe') },
      D.el('span', { class: 'widget-title' }, D.iconEl(def.icon), def.title));
    widgetEl.append(header, body);
    container.append(widgetEl);
    D.applyTheme(widgetEl, w);

    if (PLACEHOLDER_TYPES[w.type]) {
      body.append(placeholderCard(def, w));
      return;
    }
    const stubApi = {
      openMenu() {}, toggleSettings() {}, removeSelf() {}, resizeToFit() {},
      refresh() {}, refreshAllOf() { return () => {}; },
    };
    try {
      const wClone = JSON.parse(JSON.stringify(w));
      const cleanup = def.mount.call(def, body, wClone, stubApi);
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } catch (err) {
      // a widget that fails to mount still exports as a labeled card
      body.innerHTML = '';
      body.append(placeholderCard(def, w));
    }
  }

  function buildExportStage(sc, widgets, cleanups) {
    const stage = D.el('div', {
      id: 'exportStage',
      style: `position:fixed;left:-10000px;top:0;width:${window.innerWidth}px;height:${window.innerHeight}px;overflow:hidden;pointer-events:none;`,
    });
    // color/gradient backgrounds render via CSS in the html2canvas pass;
    // image backgrounds are drawn natively underneath, so stay transparent here
    const bg = sc.background || {};
    if (bg.type !== 'image') stage.style.background = bg.value || '';
    const still = document.createElement('style');
    still.textContent = '#exportStage, #exportStage * { animation: none !important; transition: none !important; }';
    stage.append(still);
    for (const w of widgets) mountForExport(stage, w, cleanups);
    document.body.append(stage);
    return stage;
  }

  // ---------------------------------------------------------------- rasterization

  // deckThumb-style native wireframe: base color + background image + one chip
  // per widget + full ink. Used when the rich DOM capture fails — a screen
  // always exports as something legible.
  function schematicLayer(ctx, widgets, cssW, cssH) {
    const rounded = (x, y, w, h, r) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h); // older Safari: square corners are fine
    };
    for (const w of widgets) {
      const def = D.WIDGETS[w.type];
      const x = Math.max(0, Math.min(w.x, cssW - 40));
      const y = Math.max(0, Math.min(w.y, cssH - 30));
      const ww = Math.min(w.w, cssW - x);
      const wh = Math.min(w.h, cssH - y);
      ctx.save();
      rounded(x, y, ww, wh, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      rounded(x, y, ww, Math.min(30, wh), [14, 14, 0, 0]);
      ctx.fillStyle = (def && def.accent) || '#c7d2fe';
      ctx.fill();
      ctx.fillStyle = '#22303c';
      ctx.font = '700 14px Quicksand, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText((def && def.title) || w.type, x + 12, y + 15, ww - 24);
      ctx.restore();
    }
  }

  // returns { canvas, links, notes, degraded, hasPhotoBg } — read-only against state
  async function rasterScreen(index, S, richCapture) {
    const sc = D.screens()[index];
    // same guard deckThumb carries, for the same reason: a hidden or minimised
    // window reports 0×0, and a 0×0 raster reaches jsPDF as format [0,0] —
    // "Invalid argument passed to jsPDF.scale" with no page ever produced
    const cssW = window.innerWidth || 1280, cssH = window.innerHeight || 720;
    const widgets = widgetsFor(index);
    const bg = sc.background || {};

    const out = document.createElement('canvas');
    out.width = Math.round(cssW * S);
    out.height = Math.round(cssH * S);
    const ctx = out.getContext('2d');

    // 1. base fill — the export is never blank
    ctx.fillStyle = baseHex(bg);
    ctx.fillRect(0, 0, out.width, out.height);

    // 2. photo background, drawn natively (CORS-safe or data URL)
    let hasPhotoBg = false;
    if (bg.type === 'image' && bg.value) {
      try {
        const img = await withTimeout(loadImage(bg.value), 8000, 'background image');
        coverDraw(ctx, img, out.width, out.height);
        hasPhotoBg = true;
      } catch (err) { /* keep the base fill */ }
    }

    // 3. widget layer — rich DOM capture, falling back to the schematic
    let degraded = false;
    let captured = false;
    if (richCapture) {
      const cleanups = [];
      let stage = null;
      try {
        stage = buildExportStage(sc, widgets, cleanups);
        // let layout settle and ResizeObserver-driven sizing (stickers, clocks)
        // run before the capture
        await nextFrame();
        await nextFrame();
        const layer = await withTimeout(window.html2canvas(stage, {
          scale: S,
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          logging: false,
        }), 10000, 'screen capture');
        ctx.drawImage(layer, 0, 0, out.width, out.height);
        releaseCanvas(layer);
        captured = true;
      } catch (err) {
        degraded = true;
      } finally {
        for (const fn of cleanups) { try { fn(); } catch (e) { /* widget cleanup */ } }
        if (stage) stage.remove();
      }
    } else {
      degraded = true;
    }
    if (!captured) {
      ctx.save();
      ctx.scale(S, S);
      // the rich pass draws color/gradient backgrounds itself; the schematic
      // only has the base fill, so gradients flatten to their first color
      schematicLayer(ctx, widgets, cssW, cssH);
      ctx.restore();
    }

    // 4. ink on its own transparent layer so eraser strokes (destination-out)
    // erase ink only, then composite on top — same as the live board
    const strokes = inkFor(index);
    if (strokes.length) {
      const inkCv = document.createElement('canvas');
      inkCv.width = out.width;
      inkCv.height = out.height;
      const ic = inkCv.getContext('2d');
      ic.scale(S, S);
      for (const s of strokes) {
        try { D.paintStroke(ic, s); } catch (e) { /* skip a malformed stroke */ }
      }
      ctx.drawImage(inkCv, 0, 0);
      releaseCanvas(inkCv);
    }

    return {
      canvas: out,
      links: linksFor(widgets),
      notes: textNotesFor(widgets),
      degraded,
      hasPhotoBg,
    };
  }

  const canvasToBlob = (cv, type, quality) =>
    new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality));

  // ---------------------------------------------------------------- worker packaging
  // Browsers throttle the timer-based chunk scheduling inside JSZip (and the
  // copy bundled in PptxGenJS) to ~1 tick/second in hidden or occluded tabs,
  // which turns packaging into a minutes-long stall if the teacher switches
  // tabs mid-export. Workers are exempt from that throttling, so the zip/pptx
  // assembly runs there when possible; the main-thread path stays as fallback.

  function runWorker(src, message, transfers, timeoutMs) {
    return new Promise((resolve, reject) => {
      let worker = null;
      try {
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      } catch (err) { reject(err); return; }
      const fail = (e) => { worker.terminate(); reject(e instanceof Error ? e : new Error(String(e))); };
      const timer = setTimeout(() => fail(new Error('packaging timed out')), timeoutMs || 120000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        if (e.data && e.data.ok) resolve(e.data);
        else reject(new Error(e.data && e.data.err || 'packaging failed'));
      };
      worker.onerror = (e) => { clearTimeout(timer); fail(e.message || 'worker error'); };
      worker.postMessage(message, transfers || []);
    });
  }

  const ZIP_WORKER = `
    self.onmessage = async (e) => {
      try {
        importScripts(e.data.lib);
        const zip = new self.JSZip();
        for (const f of e.data.files) zip.file(f.name, f.buf);
        const buf = await zip.generateAsync({ type: 'arraybuffer' });
        self.postMessage({ ok: true, buf }, [buf]);
      } catch (err) { self.postMessage({ ok: false, err: String(err && err.message || err) }); }
    };`;

  const PPTX_WORKER = `
    const b64 = (buf) => {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(bin);
    };
    self.onmessage = async (e) => {
      try {
        importScripts(e.data.lib);
        const d = e.data;
        const pptx = new self.PptxGenJS();
        pptx.defineLayout({ name: 'SAGE_WIDE', width: 13.333, height: 7.5 });
        pptx.layout = 'SAGE_WIDE';
        pptx.title = d.deckName;
        pptx.author = 'Sage Stage';
        const SW = 13.333, SH = 7.5;
        for (const sl of d.slides) {
          const slide = pptx.addSlide();
          slide.background = { color: sl.base };
          const imgAspect = sl.pxW / sl.pxH;
          let iw, ih;
          if (imgAspect > SW / SH) { iw = SW; ih = SW / imgAspect; }
          else { ih = SH; iw = SH * imgAspect; }
          const ix = (SW - iw) / 2, iy = (SH - ih) / 2;
          slide.addImage({ data: 'data:image/' + sl.type + ';base64,' + b64(sl.buf), x: ix, y: iy, w: iw, h: ih, altText: sl.title });
          for (const L of sl.links) {
            slide.addText(' ', {
              x: ix + L.rx * iw, y: iy + L.ry * ih,
              w: Math.max(0.2, L.rw * iw), h: Math.max(0.2, L.rh * ih),
              hyperlink: { url: L.url, tooltip: L.label },
            });
          }
          slide.addNotes(sl.notes);
        }
        const buf = await pptx.write('arraybuffer');
        self.postMessage({ ok: true, buf }, [buf]);
      } catch (err) { self.postMessage({ ok: false, err: String(err && err.message || err) }); }
    };`;

  const vendorUrl = (file) => new URL(file, window.location.href).href;

  // ---------------------------------------------------------------- writers

  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  async function writePngs(shots, deckName, progress) {
    if (shots.length === 1) {
      const blob = await canvasToBlob(shots[0].canvas, 'image/png');
      releaseCanvas(shots[0].canvas);
      await downloadBlob(blob, sanitizeFilename(shots[0].title) + '.png', 'PNG image', 'image/png', '.png');
      return;
    }
    const files = [];
    for (let i = 0; i < shots.length; i++) {
      progress('Packaging ' + (i + 1) + ' / ' + shots.length + '…');
      const blob = await canvasToBlob(shots[i].canvas, 'image/png');
      releaseCanvas(shots[i].canvas);
      // screenTitle already numbers the screen ("3 - Media"), so the name sorts
      files.push({ name: sanitizeFilename(shots[i].title) + '.png', buf: await blob.arrayBuffer() });
      await nextFrame();
    }
    progress('Building the zip…');
    let zipBlob;
    try {
      // structured-clone (no transfer): the buffers stay usable for the fallback
      const res = await runWorker(ZIP_WORKER, { lib: vendorUrl(VENDOR.jszip), files });
      zipBlob = new Blob([res.buf], { type: 'application/zip' });
    } catch (err) {
      // worker unavailable (old browser, blocked blob workers) — package inline
      await loadScript(VENDOR.jszip);
      const zip = new window.JSZip();
      for (const f of files) zip.file(f.name, f.buf);
      zipBlob = await zip.generateAsync({ type: 'blob' });
    }
    await downloadBlob(zipBlob, sanitizeFilename(deckName) + '-screens.zip', 'ZIP archive', 'application/zip', '.zip');
  }

  async function writePdf(shots, deckName, progress) {
    await loadScript(VENDOR.jspdf);
    const { jsPDF } = window.jspdf;
    // page size in pt matches the raster's CSS-pixel aspect (1 px = 0.75 pt)
    let doc = null;
    for (let i = 0; i < shots.length; i++) {
      progress('Building page ' + (i + 1) + ' / ' + shots.length + '…');
      const shot = shots[i];
      const cssW = shot.canvas.width / shot.scale, cssH = shot.canvas.height / shot.scale;
      const pw = cssW * 0.75, ph = cssH * 0.75;
      const orientation = pw > ph ? 'l' : 'p';
      if (!doc) doc = new jsPDF({ orientation, unit: 'pt', format: [pw, ph], compress: true });
      else doc.addPage([pw, ph], orientation);
      // always JPEG: the rasters are opaque by construction (base fill), and
      // jsPDF embeds JPEG directly while PNG goes through a very slow pure-JS
      // alpha-splitting path (seconds per page at 2x scale)
      doc.addImage(shot.canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
      releaseCanvas(shot.canvas);
      for (const L of shot.links) {
        doc.link(L.x * 0.75, L.y * 0.75, L.w * 0.75, L.h * 0.75, { url: L.url });
      }
      await nextFrame();
    }
    doc.setProperties({ title: deckName, creator: 'Sage Stage' });
    await downloadBlob(doc.output('blob'), sanitizeFilename(deckName) + '.pdf', 'PDF document', 'application/pdf', '.pdf');
  }

  async function writePptx(shots, deckName, progress) {
    // encode every slide's raster + layout data first, then package off-thread
    const slides = [];
    for (let i = 0; i < shots.length; i++) {
      progress('Building slide ' + (i + 1) + ' / ' + shots.length + '…');
      const shot = shots[i];
      const type = shot.hasPhotoBg ? 'jpeg' : 'png';
      const blob = await canvasToBlob(shot.canvas, 'image/' + type, 0.9);
      const cssW = shot.canvas.width / shot.scale, cssH = shot.canvas.height / shot.scale;
      let notes = shot.title;
      if (shot.notes.length) notes += '\n\n' + shot.notes.join('\n\n');
      slides.push({
        buf: await blob.arrayBuffer(),
        type,
        pxW: shot.canvas.width,
        pxH: shot.canvas.height,
        title: shot.title,
        base: shot.base.replace('#', '').slice(0, 6),
        notes,
        // link rects as fractions of the image so the worker needs no viewport math
        links: shot.links.map((L) => ({
          url: L.url, label: L.label,
          rx: L.x / cssW, ry: L.y / cssH, rw: L.w / cssW, rh: L.h / cssH,
        })),
      });
      releaseCanvas(shot.canvas);
      await nextFrame();
    }
    progress('Building the PowerPoint file…');
    let blob;
    try {
      const res = await runWorker(PPTX_WORKER, { lib: vendorUrl(VENDOR.pptxgen), deckName, slides });
      blob = new Blob([res.buf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    } catch (err) {
      // worker unavailable — assemble inline (slow in a backgrounded tab, but works)
      await loadScript(VENDOR.pptxgen);
      const pptx = new window.PptxGenJS();
      pptx.defineLayout({ name: 'SAGE_WIDE', width: 13.333, height: 7.5 });
      pptx.layout = 'SAGE_WIDE';
      pptx.title = deckName;
      pptx.author = 'Sage Stage';
      const SW = 13.333, SH = 7.5;
      for (const sl of slides) {
        const slide = pptx.addSlide();
        slide.background = { color: sl.base };
        const imgAspect = sl.pxW / sl.pxH;
        let iw, ih;
        if (imgAspect > SW / SH) { iw = SW; ih = SW / imgAspect; }
        else { ih = SH; iw = SH * imgAspect; }
        const ix = (SW - iw) / 2, iy = (SH - ih) / 2;
        slide.addImage({ data: 'data:image/' + sl.type + ';base64,' + bufToBase64(sl.buf), x: ix, y: iy, w: iw, h: ih, altText: sl.title });
        for (const L of sl.links) {
          slide.addText(' ', {
            x: ix + L.rx * iw, y: iy + L.ry * ih,
            w: Math.max(0.2, L.rw * iw), h: Math.max(0.2, L.rh * ih),
            hyperlink: { url: L.url, tooltip: L.label },
          });
        }
        slide.addNotes(sl.notes);
      }
      blob = await pptx.write('blob');
    }
    await downloadBlob(blob, sanitizeFilename(deckName) + '.pptx', 'PowerPoint presentation',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx');
  }

  // ---------------------------------------------------------------- export run

  async function runExport(indices, format, progress) {
    const deckName = D.viewDeck().name || 'Sage Stage screens';
    const S = Math.min(2, 3840 / window.innerWidth);

    // rich capture needs html2canvas; without it every screen uses the schematic
    let richCapture = false;
    try {
      await loadScript(VENDOR.html2canvas);
      richCapture = typeof window.html2canvas === 'function';
    } catch (err) { /* schematic for all */ }
    await document.fonts.ready;

    const shots = [];
    const failed = [];
    let degradedCount = richCapture ? 0 : indices.length;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const title = D.screenTitle(idx);
      progress('Rendering ' + (i + 1) + ' / ' + indices.length + ' — ' + title + '…');
      await nextFrame();
      try {
        const shot = await rasterScreen(idx, S, richCapture);
        if (shot.degraded && richCapture) degradedCount++;
        shots.push({
          canvas: shot.canvas, links: shot.links, notes: shot.notes,
          hasPhotoBg: shot.hasPhotoBg, title, scale: S,
          base: baseHex(D.screens()[idx].background),
        });
      } catch (err) {
        failed.push(title);
      }
    }
    if (!shots.length) throw new Error('No screens could be rendered');

    if (format === 'png') await writePngs(shots, deckName, progress);
    else if (format === 'pdf') await writePdf(shots, deckName, progress);
    else await writePptx(shots, deckName, progress);

    return { exported: shots.length, failed, degradedCount };
  }

  // ---------------------------------------------------------------- dialog

  const FORMATS = [
    { id: 'png', title: 'PNG images', desc: 'One picture per screen — a .zip when exporting several. Great for printing and sharing.' },
    { id: 'pdf', title: 'PDF', desc: 'One page per screen with clickable links. Ideal for handouts and substitute notes.' },
    { id: 'pptx', title: 'PowerPoint', desc: 'One slide per screen — opens in PowerPoint, Google Slides or Keynote. Text lands in speaker notes.' },
  ];

  function openDialog(indices) {
    if (!D) return;
    if (!indices || !indices.length) { D.toast('No screens selected'); return; }
    let format = 'png';
    let running = false;
    D.openModal('Export screens', (body, finish) => {
      const cards = [];
      const pick = (id) => {
        format = id;
        for (const c of cards) c.classList.toggle('active', c.dataset.format === format);
      };
      const chooser = D.el('div', { class: 'export-formats' });
      for (const f of FORMATS) {
        const card = D.el('button', {
          class: 'export-format-card' + (f.id === format ? ' active' : ''),
          'data-format': f.id,
          onclick: () => pick(f.id),
        }, D.el('div', { class: 'export-format-title' }, f.title),
          D.el('div', { class: 'export-format-desc' }, f.desc));
        cards.push(card);
        chooser.append(card);
      }

      const count = indices.length === 1
        ? '1 screen: ' + D.screenTitle(indices[0])
        : indices.length + ' screens selected';

      const startBtn = D.el('button', { class: 'btn', onclick: () => start() }, 'Export');
      body.append(
        D.el('p', { style: 'margin-top:0;font-weight:700;' }, count),
        chooser,
        D.el('div', { class: 'hint' },
          'Live content (videos, embeds, camera, documents) exports as a labeled card with its link. Nothing leaves this device.'),
        D.el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px;' },
          D.el('button', { class: 'btn ghost', onclick: () => finish() }, 'Cancel'),
          startBtn),
      );

      async function start() {
        if (running) return;
        running = true;
        body.innerHTML = '';
        const bar = D.el('div', { class: 'export-progress-fill' });
        const label = D.el('div', { class: 'export-progress-label' }, 'Preparing…');
        body.append(label, D.el('div', { class: 'export-progress' }, bar));
        let step = 0;
        const total = indices.length * 2 + 1; // render + package per screen, roughly
        const progress = (msg) => {
          label.textContent = msg;
          bar.style.width = Math.min(96, Math.round((++step / total) * 100)) + '%';
        };
        try {
          const result = await runExport(indices, format, progress);
          bar.style.width = '100%';
          const problems = [];
          if (result.degradedCount) {
            problems.push(result.degradedCount === 1
              ? '1 screen was exported as a simplified layout.'
              : result.degradedCount + ' screens were exported as simplified layouts.');
          }
          for (const t of result.failed) problems.push('Skipped: ' + t);
          if (problems.length) {
            body.innerHTML = '';
            body.append(
              D.el('p', { style: 'font-weight:700;margin-top:0;' }, 'Exported ' + result.exported + ' screen' + (result.exported === 1 ? '' : 's') + ' with warnings:'),
              D.el('ul', { class: 'export-warnings' }, problems.map((p) => D.el('li', {}, p))),
              D.el('div', { class: 'row', style: 'justify-content:flex-end;' },
                D.el('button', { class: 'btn', onclick: () => finish() }, 'Done')),
            );
          } else {
            finish();
          }
        } catch (err) {
          body.innerHTML = '';
          body.append(
            D.el('p', { style: 'margin-top:0;' }, '⚠️ Export failed: ' + (err && err.message || 'unknown error')),
            D.el('div', { class: 'row', style: 'justify-content:flex-end;' },
              D.el('button', { class: 'btn ghost', onclick: () => finish() }, 'Close')),
          );
        }
      }
    });
  }

  window.SageExport = {
    init(deps) { D = deps; },
    openDialog,
  };
})();
