# Vendored export libraries

All files are unmodified official dist builds, pinned and served locally (no CDN at
runtime). Loaded lazily by `export.js` only when an export runs — never at app boot.

| File | Library | Version | Source | SHA-256 |
|---|---|---|---|---|
| `html2canvas.min.js` | html2canvas | 1.4.1 | npm `html2canvas/dist/html2canvas.min.js` | `e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb` |
| `jszip.min.js` | JSZip | 3.10.1 | npm `jszip/dist/jszip.min.js` | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |
| `jspdf.umd.min.js` | jsPDF | 2.5.2 | npm `jspdf/dist/jspdf.umd.min.js` | `85ba2cc3ff858a20fa49fe6e457bec863ea40b55a9f3725e58a940e62f6f61a4` |
| `pptxgen.bundle.min.js` | PptxGenJS | 3.12.0 | npm `pptxgenjs/dist/pptxgen.bundle.js` | `cd078ca9e91c6f9e061ee0a3c310d6ff157c3a71b1dea7f40fd53818017266ff` |

Audit notes (2026-07-19):
- Globals defined: `html2canvas`, `JSZip`, `window.jspdf.jsPDF`, `PptxGenJS`.
  The pptxgen bundle also defines `window.JSZip` (it concatenates JSZip's UMD);
  both copies are JSZip 3.x and API-compatible, and formats load lazily, so the
  overlap is harmless.
- No network activity in our usage: html2canvas's XHR path only activates with a
  `proxy` option (unset); pptxgen's XHR only fires for remote image URLs (we pass
  data URLs exclusively); jsPDF/JSZip make no requests.
- JSZip (standalone and the copy bundled in pptxgen) schedules its chunked zip
  assembly through a `setimmediate` polyfill that browsers throttle to ~1
  tick/second in hidden or occluded tabs — packaging appears to hang. export.js
  therefore runs JSZip/PptxGenJS inside a Web Worker (exempt from that
  throttling) and keeps the main-thread path only as a fallback.

Verify integrity: `shasum -a 256 vendor/*.js`
