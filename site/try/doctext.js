/* Sage Stage — plain text out of the files teachers actually have.

   Why this exists: the Genre Toolkit puts a model text on the board and the
   class marks it up together. Until now it would only take a .txt, and almost
   no teacher has one — the WAGOLL is a Word document, or a PDF that came round
   in an email. Asking for a .txt in the ninety seconds before a lesson starts
   is really asking them not to bother.

   So this reads .docx and .pdf too, here on the device, with nothing vendored
   and nothing on the network. Only the words come across: no fonts, no
   colours, no pictures, no layout. Line breaks DO come across, because the
   widget treats a newline as a hard line break and a blank line as a stanza
   gap, and a poem welded into one long paragraph is no use to anybody.

   Three readers behind one door:
     • plain text — decode the bytes and hand them over;
     • .docx      — a zip, so SageZip.read opens it and a small scan lifts the
                    words out of word/document.xml. Nothing to vendor;
     • .pdf       — there is no PDF reader in vendor/ and the rule is that no
                    new one may be added, so the whole thing is hand-rolled
                    below: xref, object streams, fonts, /ToUnicode and all.

   Nothing here touches document or DOMParser, in any of the three. That is
   deliberate rather than accidental: it keeps every reader testable under
   plain node — which is how all of this was built and regression-tested —
   and it lets the module run in a Web Worker if a forty-page PDF ever needs
   to come off the main thread.

   read() never throws anything a teacher cannot act on. When a file genuinely
   cannot be read, the message says what to do instead; when something was
   dropped on the way, `note` says so in one sentence rather than quietly
   handing over half a text and letting them find out on the board. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- limits

     A teacher picks the wrong file sometimes — the 60 MB scanned prospectus
     instead of the two-page WAGOLL. Both caps exist so that mistake costs a
     sentence rather than the lesson. maxBytes is checked before we read a
     byte; maxChars and maxPages stop a 200-page PDF from spending a minute
     building text nobody wants. All three are overridable by the caller. */
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_CHARS = 300000;
  const MAX_PAGES = 200;

  /* ---------------------------------------------------------- work budgets

     The caps above bound the file. These bound the WORK, which is a different
     thing entirely: 8 KB of PDF can ask for two gigabytes of output, and 9 KB
     of .docx can ask for a million empty paragraphs. A teacher standing in
     front of thirty children cannot tell a frozen tab from a dead one, and
     both cost the lesson, so every loop below that can grow with something
     other than the file size has a ceiling and a teacher-facing refusal.

     Each number is set where no real classroom file can reach it:

     MAX_STREAM_BYTES — one decompressed stream. The input is capped at 8 MB,
       and the biggest thing inside a real .docx is word/document.xml: the
       300,000-character maximum we will ever put on the board is about 2 MB of
       it, and a 40-page WAGOLL is nearer 200 KB. 48 MB is twenty times the
       largest text this widget can display and two hundred times a typical
       one. PDF content streams are smaller again.
     MAX_TOTAL_BYTES — everything decompressed out of one file added up, so
       that a thousand streams just under the per-stream cap cannot add up to
       a gigabyte.
     MAX_CONTENT_BYTES — content-stream bytes actually WALKED, across the whole
       document. A page of text is 2–10 KB of operators, so 200 pages of solid
       text is about 2 MB; 16 MB is eight times that. This is a separate budget
       from the decode one because pages are allowed to share a stream, and a
       shared stream is decoded once but walked once per page.
     MAX_CMAP_WRITES / _TOTAL — /ToUnicode entries, per font and per document.
       A two-byte font can address 65,536 codes in total, so 200,000 writes is
       three passes over the entire code space of one font; 1,000,000 across
       the document is fifteen such fonts. A WAGOLL has between one and eight
       fonts, each mapping a few hundred codes. */
  const MAX_STREAM_BYTES = 48 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 96 * 1024 * 1024;
  const MAX_CONTENT_BYTES = 16 * 1024 * 1024;
  const MAX_CMAP_WRITES = 200000;
  const MAX_CMAP_WRITES_TOTAL = 1000000;
  // Text fragments kept for one PDF page's layout pass.
  const MAX_ITEMS = 200000;
  // Glyphs decoded from ONE show operator. A real Tj holds a line of text —
  // tens of bytes, hundreds at the outside. This is a thousand times that,
  // and it is here because a content stream is allowed to be one unterminated
  // "(" and sixteen megabytes: an object per byte is a gigabyte.
  const MAX_GLYPHS = 1 << 20;
  /* Floor on the characters the .docx scan will accumulate. The real ceiling
     is computed per call as four times the caller's own maxChars, so it can
     never discard a character that would have been displayed — read() clips
     to maxChars immediately afterwards. What it does stop is <![CDATA[
     followed by four million ampersands and no closing bracket: 5 KB of
     .docx, and 860 MB of resident string before this existed. */
  const MAX_DOC_CHARS = 8 * 1024 * 1024;

  /* One sentence for every "there is more inside this than a model text".
     It is deliberately the same sentence whichever budget tripped: the teacher
     cannot act on which one, and the action is the same either way. */
  function tooMuchInside(what) {
    const e = new Error('That ' + what + ' is too big to read — there’s far more inside it '
      + 'than will fit on the board. Copy just the part you want and paste it in.');
    e.code = 'TOO_BIG';
    e.teacherFacing = true;
    return e;
  }
  const streamTooBig = () => tooMuchInside('file');

  /* ------------------------------------------------------------- byte sink

     Every filter below used to push into a plain JS array. That is eight bytes
     of heap per byte of output, which is why a bomb that decoded to 2 GB of
     *bytes* asked V8 for 16 GB of old-space and took the tab down with an
     uncatchable abort rather than tripping any cap we could write. A doubling
     Uint8Array costs one byte per byte, and — the part that matters — it can
     refuse before it allocates. */
  class ByteSink {
    constructor(limit) {
      this.buf = new Uint8Array(1024);
      this.n = 0;
      this.limit = limit > 0 ? Math.min(limit, MAX_STREAM_BYTES) : MAX_STREAM_BYTES;
    }
    room(k) {
      const need = this.n + k;
      if (need > this.limit) throw streamTooBig();
      if (need > this.buf.length) {
        let cap = this.buf.length;
        while (cap < need) cap *= 2;
        if (cap > this.limit) cap = this.limit;
        const b = new Uint8Array(cap);
        b.set(this.buf.subarray(0, this.n));
        this.buf = b;
      }
    }
    push(v) { this.room(1); this.buf[this.n++] = v; }
    fill(v, k) { if (k <= 0) return; this.room(k); this.buf.fill(v & 255, this.n, this.n + k); this.n += k; }
    copy(src, from, k) {
      if (k <= 0) return;
      const end = Math.min(src.length, from + k);
      const take = end - from;
      if (take <= 0) return;
      this.room(take);
      this.buf.set(src.subarray(from, end), this.n);
      this.n += take;
    }
    each(arr) { this.room(arr.length); for (let i = 0; i < arr.length; i++) this.buf[this.n++] = arr[i]; }
    // A view, not a copy: the sink is thrown away straight after.
    view() { return this.buf.subarray(0, this.n); }
    // A compact copy, for the handful of results that are kept.
    take() { return this.buf.slice(0, this.n); }
  }

  /* --------------------------------------------------------------- inflate

     THE one place anything is decompressed. The browser has DecompressionStream
     and nothing else; node has zlib. Keeping both behind this single function
     is what lets the node harness inject zlib and change nothing else about
     the module — and it is the reason every case below can be regression
     tested outside a browser at all.

     A truncated or slightly-corrupt stream keeps whatever decoded before the
     damage instead of losing the whole page: half a paragraph on the board is
     worth more to a teacher than an error. */
  async function inflateStream(u8, limit) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot unpack compressed files.');
    }
    // Deflate goes to 1032:1, so 8 KB of PDF is a 8 MB stream and 500 KB of
    // .docx is half a gigabyte. The reader is drained a chunk at a time so the
    // cap is checked BEFORE the next chunk is asked for; an ArrayBuffer is not
    // old-space, so no heap setting would have saved us here.
    const cap = limit > 0 ? Math.min(limit, MAX_STREAM_BYTES) : MAX_STREAM_BYTES;
    let best = null;
    let over = false;
    // FlateDecode is zlib-wrapped, but plenty of producers emit raw deflate.
    for (const format of ['deflate', 'deflate-raw']) {
      const chunks = [];
      let n = 0;
      let clean = false;
      try {
        const reader = new Blob([u8]).stream().pipeThrough(new DecompressionStream(format)).getReader();
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          chunks.push(r.value);
          n += r.value.length;
          if (n > cap) {
            over = true;
            try { await reader.cancel(); } catch (e) { /* already gone */ }
            break;
          }
        }
        clean = !over;
      } catch (e) { /* keep what arrived, then try the other format */ }
      // A stream that overflows in one framing overflows in the other; there
      // is nothing to gain from decoding another half-gigabyte to find out.
      if (over) throw streamTooBig();
      if (!n) continue;
      const out = new Uint8Array(n);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      if (clean) return out;
      if (!best || out.length > best.length) best = out;
    }
    if (best) return best;
    throw new Error('inflate failed');
  }

  /* ----------------------------------------------------------------- bytes */

  const asU8 = (v) => (v instanceof Uint8Array ? v
    : v instanceof ArrayBuffer ? new Uint8Array(v)
    : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
    : null);

  const startsWith = (b, sig) => {
    if (!b || b.length < sig.length) return false;
    for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false;
    return true;
  };

  // "%PDF" is allowed to sit a little way in: some mailers and scanners glue a
  // few junk bytes on the front and every real reader copes, so we do too.
  function findsPdfHeader(b) {
    const limit = Math.min(b.length - 4, 1024);
    for (let i = 0; i <= limit; i++) {
      if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true;
    }
    return false;
  }

  const SIG_ZIP = [0x50, 0x4b, 0x03, 0x04];   // PK.. — a .docx is a zip
  const SIG_ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
  const SIG_OLE = [0xd0, 0xcf, 0x11, 0xe0];   // the old .doc / .xls container
  const SIG_RTF = [0x7b, 0x5c, 0x72, 0x74];   // {\rt

  /* ------------------------------------------------------------ plain text

     Almost everything is UTF-8, and TextDecoder with fatal:true tells us for
     certain rather than silently sprinkling U+FFFD through the text. The two
     fallbacks are the ones that actually turn up in a staffroom: Notepad's
     "Unicode" save is UTF-16, and anything that has been round a Windows
     machine from before 2010 is windows-1252. */
  function decodeText(bytes) {
    if (bytes.length >= 2) {
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
      if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    let s;
    try {
      s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try { s = new TextDecoder('windows-1252').decode(bytes); }
      catch (e2) { s = new TextDecoder('utf-8').decode(bytes); }
    }
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s;
  }

  /* Control characters that no keyboard produces. Something full of them is
     not text however the file has been named, and saying so is kinder than
     putting a screenful of mojibake on the board in front of the class.

     This is judged on the DECODED string and not on the raw bytes, which
     matters: a UTF-16 file — Notepad's "Unicode" save — has a zero as every
     other byte, and a byte-level test calls the teacher's own typing binary. */
  function looksBinary(s) {
    const n = Math.min(s.length, 4096);
    if (!n) return false;
    let bad = 0;
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i);
      if (c === 0) return true;
      if (c === 0xfffd) { bad++; continue; }        // decoded to nothing legible
      if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) bad++;
    }
    return bad / n > 0.05;
  }

  /* Line endings are normalised because the widget reads a newline as a hard
     line break; a stray \r would show up as one blank line too many. Leading
     and trailing blank lines go, interior ones stay — they are the teacher's
     stanza gaps and guessing which were accidental is not our call.

     THE BLANK-END TRIM IS AN INDEX SCAN AND ONE SLICE, NOT shift(), and that
     is not a style preference. The obvious `while (!out[0].trim())
     out.shift()` is quadratic on V8: shift() memmoves the whole backing store
     down one slot, so a file that opens with a million blank lines costs a
     million memmoves of a million elements. Measured in Chrome, 400,000
     leading blanks took 97 seconds and a million never finished — and 4 MB of
     CRLF, or a 9 KB .docx of a million empty <w:p/>, is all it takes to get
     there. JavaScriptCore's shift() is O(1) and is unaffected, which is
     precisely why this survived so long: it is a Chrome/Edge cliff, and Chrome
     and Edge are what a school laptop runs. */
  function trimBlankEnds(lines) {
    const n = lines.length;
    let a = 0;
    while (a < n && !lines[a].trim()) a++;
    let b = n;
    while (b > a && !lines[b - 1].trim()) b--;
    return (a === 0 && b === n) ? lines : lines.slice(a, b);
  }

  function tidyPlainText(s) {
    const out = s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t ]+$/, ''));
    return trimBlankEnds(out).join('\n');
  }

  /* ================================================================ WORD

     Plain text out of a .docx.

     A .docx is a zip, and SageZip.read already gives us path -> Uint8Array, so
     there is nothing to vendor. All this section does is turn word/document.xml
     into the words the teacher typed, in the order they typed them.

     WHY A HAND-ROLLED SCAN AND NOT DOMParser (deliberate; pptx-import.js does
     use DOMParser and this is a considered deviation from it):
       • it stays DOM-free, so the module runs unchanged in a Web Worker and —
         the reason that actually paid off — under plain node, which is how
         every case here was regression-tested against a corpus of real
         generator output;
       • we want text only. A DOM walk builds a full tree of rPr/tblPr/theme
         noise we immediately throw away; a targeted linear scan over the
         handful of elements that carry characters is smaller, faster on a
         40-page WAGOLL, and easier to reason about when something goes wrong
         in front of a class;
       • the scan never backtracks, so a malformed file cannot hang it.

     The rules, in the order they matter:
       1. Adjacent <w:t> runs inside a paragraph concatenate with NOTHING
          between them. Word splits runs mid-word ("extra"|"ordin"|"ary")
          whenever formatting changes; any separator at all breaks the
          teacher's words. The spaces are already inside the <w:t> payloads —
          that is what the xml:space="preserve" on every one of them is for.
          So we never trim one.
       2. Each <w:p> is one line. An empty <w:p> is therefore an empty line,
          which is exactly how a teacher makes a stanza gap.
       3. <w:br/> and <w:cr/> are line breaks inside a paragraph — poems again.
       4. <w:tab/> becomes a single space (the widget collapses tabs anyway).
       5. Table cells are joined with ' · ' and each row is one line. A tab
          would be invisible on the board and "Noun    Verb" reads as one
          phrase from the back of the room; the dot keeps the cell boundary
          visible to the class without looking like markup.
       6. Field codes (<w:instrText>, and anything between a fldChar begin and
          its separate) and tracked deletions (<w:del>, <w:delText>,
          <w:moveFrom>) are machine noise or text the teacher already removed.
          Dropped.
       7. Only the main document part is read. Globbing word/*.xml would put
          the school template's "Year 4 Literacy — Autumn Term" header on the
          board.

     Blank lines are NOT collapsed. Three empty paragraphs stay three blank
     lines, because in this widget a blank line is a paragraph gap and guessing
     which of the teacher's gaps were "accidental" is not our call. */

  // ------------------------------------------------------------------ entities
  // textutil and Word escape only & < > ; curly quotes, em dashes and ellipses
  // arrive as literal UTF-8 and must be left exactly alone. The named set plus
  // numeric forms is there for the other producers (Google Docs, LibreOffice,
  // XSLT pipelines) that do emit &quot; and &#8217;.
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function fromCodePoint(n, raw) {
    if (!isFinite(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return raw;
    try { return String.fromCodePoint(n); } catch (e) { return raw; }
  }

  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s; // the overwhelmingly common case
    // one pass, so "&amp;lt;" decodes to the literal "&lt;" and not to "<"
    return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g,
      (raw, dec, hex, name) => {
        if (dec !== undefined) return fromCodePoint(parseInt(dec, 10), raw);
        if (hex !== undefined) return fromCodePoint(parseInt(hex, 16), raw);
        return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : raw;
      });
  }

  // --------------------------------------------------------------- element sets
  /* Whole subtrees with nothing a teacher typed in them. Skipping the *Pr
     property bags is not just tidiness: <w:pPr><w:tabs><w:tab w:pos="720"/> holds
     an element called w:tab that is a tab *stop*, not a tab character, and would
     otherwise sprinkle spaces through every indented paragraph. */
  const SKIP = new Set([
    'pPr', 'rPr', 'tblPr', 'trPr', 'tcPr', 'tblGrid', 'sectPr', 'numPr', 'tabs',
    'tblPrEx', 'framePr', 'settings', 'background',
    // field codes and tracked-change residue
    'instrText', 'delInstrText', 'delText', 'del', 'moveFrom',
    // change-tracking property records, which contain nested pPr/rPr
    'pPrChange', 'rPrChange', 'tblPrChange', 'trPrChange', 'tcPrChange', 'sectPrChange',
  ]);

  const CELL_SEP = ' · '; // middle dot: a cell boundary the back row can see

  /* ------------------------------------------------------------------ <w:sym>

     A character from a symbol font. Word does not store a Unicode character
     for these — it stores the FONT NAME and a code in the private-use area,
     because the glyph only means anything in that font — so there is nothing
     for the scan to pick up and the run reads as a hole.

     The hole is not silent, and that is what makes this worth fixing. Word
     keeps the spaces around a symbol in the neighbouring <w:t> runs: "Tick ",
     the symbol, " done". Drop the symbol and the line reads "Tick  done" with
     a double space in it, which on the board is a visible gap in the middle of
     a sentence and in the word bank is an empty entry.

     BOTH halves of the fix are needed, and neither alone is enough:

       • MAP the handful of codes a primary teacher's document actually
         contains. A tick in a success-criteria list is content — "✓ I have
         used a fronted adverbial" is a line the class reads out — and dropping
         it changes what the sentence says. These are the codes Word's own
         bullet library and its Insert Symbol dialogue reach for, and their
         Unicode equivalents are exact, not approximations.

       • DROP everything else and swallow one of the two spaces. Wingdings has
         a smiling face, an envelope, a pointing hand and two hundred others
         with no dependable Unicode equivalent; guessing one puts a character
         on the board that the teacher did not write, which is worse than a
         gap. Wingdings 2 and 3 and Webdings are a different mapping again and
         are deliberately not here — a wrong tick is worse than no tick.

     Codes arrive as private-use (F0FC) or bare (FC); both are accepted. */
  const SYM_FONTS = {
    wingdings: {
      0x6c: '●', 0x6e: '■', 0x6f: '□', 0xa7: '▪',   // the bullet-library shapes
      0xfb: '✗', 0xfc: '✓', 0xfd: '☒', 0xfe: '☑',   // tick, cross, and the two boxes
    },
    symbol: {
      0xb7: '•',                                     // Word's default bullet
      0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓',
    },
  };

  function symChar(attrs) {
    const fm = /w:font\s*=\s*(['"])([^'"]*)\1/.exec(attrs) || /\bfont\s*=\s*(['"])([^'"]*)\1/.exec(attrs);
    const cm = /w:char\s*=\s*(['"])([^'"]*)\1/.exec(attrs) || /\bchar\s*=\s*(['"])([^'"]*)\1/.exec(attrs);
    if (!fm || !cm) return '';
    const table = SYM_FONTS[fm[2].trim().toLowerCase()];
    if (!table) return '';
    let code = parseInt(cm[2].trim(), 16);
    if (!isFinite(code)) return '';
    if (code >= 0xf000 && code <= 0xf0ff) code -= 0xf000;   // the private-use form
    return table[code] || '';
  }

  /* Word writes a text box twice — once as <mc:Choice Requires="wps"> and again
     as an <mc:Fallback> for readers that predate DrawingML. Both halves contain
     the same <w:txbxContent>, so reading both duplicates every word in every text
     box. We keep the Choice and drop the Fallback. */
  function isFallback(qname) {
    return qname === 'mc:Fallback' || qname === 'Fallback';
  }

  // ------------------------------------------------------------------ the scan
  /* Returns { lines, sawTable, sawPicture, sawTracked }.
     Element matching is on the local name, but only for the w: prefix (or no
     prefix). DrawingML in the same file uses a:t and a:p for chart and SmartArt
     labels; matching those would break paragraphs in places the teacher never
     did. Text boxes still come through, because their bodies are w:p inside
     w:txbxContent. */
  function scanDocumentXml(xml, charCap) {
    const lines = [];
    const paraStack = [];     // <w:p> can nest via a text box inside a run
    const tblStack = [];      // { row: [] | null, cell: [] | null }
    let depth = 0;            // depth of the element currently open
    let skipAt = -1;          // depth of the outermost skipped element, or -1
    let tAt = -1;             // depth of the open <w:t>, or -1
    let tPreserve = false;
    let tBuf = '';
    const fldStack = [];      // one entry per open field: true while in its code

    let sawTable = false, sawPicture = false, sawTracked = false;
    /* Open <w:drawing>/<w:pict>/<w:object> elements, innermost last, each
       carrying whether a <w:txbxContent> has turned up inside it.

       This exists because "a picture" and "a text box" are the SAME element in
       a .docx. Word wraps a text box in <w:pict> (the VML form, which is what
       every "Insert → Text Box" in a school-issued template still produces) or
       in <w:drawing> (the DrawingML form), and the words inside it come
       through perfectly — they are w:p paragraphs in a w:txbxContent. Setting
       sawPicture the moment the wrapper opened meant a WAGOLL whose model text
       sits in a text box was handed over complete, with a note underneath it
       saying "Pictures were left out — only the words come across." Nothing
       had been left out. The teacher's only way to check a note like that is
       to read the original, which is the job the note was supposed to save.

       So the wrapper is judged when it CLOSES, on what was actually in it. A
       real image announces itself either way: <a:blip> and <v:imagedata> set
       sawPicture directly, so a picture inside a text box still counts. */
    const picStack = [];
    function closePicture(e) { if (!e.text) sawPicture = true; }

    const inField = () => { for (let i = 0; i < fldStack.length; i++) if (fldStack[i]) return true; return false; };
    const live = () => skipAt < 0 && !inField();

    // A line produced at table-nesting level k belongs to the nearest enclosing
    // open cell above k, or to the document if there is none.
    function emitAt(k, line) {
      for (let j = k - 1; j >= 0; j--) {
        const f = tblStack[j];
        if (f.cell) { f.cell.push(line); return; }
      }
      lines.push(line);
    }

    const para = () => (paraStack.length ? paraStack[paraStack.length - 1] : null);
    /* Set when a <w:sym> we could not map has just been thrown away — see
       SYM_FONTS. The spaces around a symbol live in the runs either side of
       it, so the next run to arrive gives up one leading space if the run
       before it ended with one; anything else and the paragraph keeps every
       space the teacher typed. Cleared by the first add() either way. */
    let symDropped = false;
    function add(str) {
      if (!str) return;
      let p = para();
      if (!p) { p = []; paraStack.push(p); } // defensive: never drop characters
      if (symDropped) {
        symDropped = false;
        if (str.charCodeAt(0) === 32 && p.length && p[p.length - 1].slice(-1) === ' ') {
          str = str.slice(1);
          if (!str) return;
        }
      }
      p.push(str);
      chars += str.length;
    }

    function flushT() {
      // xml:space="preserve" means keep it verbatim, and Word puts it on every
      // run that has a leading or trailing space. Without it the spec allows
      // trimming — but producers omit it far more often than they mean to, so we
      // only discard payloads that are pure XML indentation (whitespace
      // containing a newline), which is never something anyone typed.
      let text = decodeEntities(tBuf);
      if (!tPreserve && /^\s*$/.test(text) && /[\r\n]/.test(text)) text = '';
      if (live()) add(text);
      tAt = -1; tBuf = ''; tPreserve = false;
    }

    function closeParagraph() {
      const p = paraStack.pop();
      emitAt(tblStack.length, p ? p.join('') : '');
      // A field code region never spans a paragraph in practice, so an unbalanced
      // fldChar begin must not swallow the rest of the document.
      for (let i = 0; i < fldStack.length; i++) fldStack[i] = false;
    }

    const len = xml.length;
    let i = 0;
    let tail = ''; // text after the last complete tag, if the file was cut short
    /* Characters taken so far, against MAX_DOC_CHARS. Everything else in this
       scan is bounded by the length of the XML, but one open <![CDATA[ with
       four million ampersands after it is not: the payload is copied, the
       ampersands are doubled to survive the entity pass, and then the entity
       regex walks the lot. Five kilobytes of .docx, 860 MB resident. The
       ceiling is twenty-six times what the board can ever show, so it cannot
       reach a real model text. */
    let chars = 0;
    const cap = charCap > 0 ? charCap : MAX_DOC_CHARS;
    const roomLeft = () => cap - chars - tBuf.length;
    while (i < len) {
      if (roomLeft() <= 0) break;
      const lt = xml.indexOf('<', i);
      if (lt < 0) { tail = xml.slice(i, Math.min(len, i + roomLeft())); break; }
      if (lt > i && tAt >= 0) tBuf += xml.slice(i, Math.min(lt, i + roomLeft()));

      // <![CDATA[ ... ]]> — raw, no entity decoding
      if (xml.startsWith('<![CDATA[', lt)) {
        const end = xml.indexOf(']]>', lt + 9);
        const stop = end < 0 ? len : end;
        if (tAt >= 0) {
          // Divided by five, because a payload of nothing but '&' becomes five
          // characters per character on the way through the escape below, and
          // then the entity pass has to walk all of it back again.
          const clip = Math.min(stop, lt + 9 + Math.max(0, Math.floor(roomLeft() / 5)));
          const cd = xml.slice(lt + 9, clip);
          tBuf += cd.indexOf('&') < 0 ? cd : cd.replace(/&/g, '&amp;'); // survive the later decode
        }
        i = end < 0 ? len : end + 3;
        continue;
      }
      if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt + 4); i = e < 0 ? len : e + 3; continue; }
      if (xml.startsWith('<?', lt)) { const e = xml.indexOf('?>', lt + 2); i = e < 0 ? len : e + 2; continue; }
      if (xml.startsWith('<!', lt)) { const e = xml.indexOf('>', lt + 2); i = e < 0 ? len : e + 1; continue; }

      // find the tag's '>', respecting quoted attribute values
      let j = lt + 1, quote = 0;
      while (j < len) {
        const c = xml.charCodeAt(j);
        if (quote) { if (c === quote) quote = 0; }
        else if (c === 34 || c === 39) quote = c;
        else if (c === 62) break; // '>'
        j++;
      }
      if (j >= len) break; // an unterminated tag: its text was already taken above
      const tag = xml.slice(lt + 1, j);
      i = j + 1;

      const closing = tag.charCodeAt(0) === 47; // '/'
      const selfClosing = tag.charCodeAt(tag.length - 1) === 47;
      let body = tag.slice(closing ? 1 : 0, selfClosing ? tag.length - 1 : tag.length);
      let sp = body.search(/[\s]/);
      const qname = (sp < 0 ? body : body.slice(0, sp)).trim();
      const attrs = sp < 0 ? '' : body.slice(sp);
      const colon = qname.indexOf(':');
      const prefix = colon < 0 ? '' : qname.slice(0, colon);
      const local = colon < 0 ? qname : qname.slice(colon + 1);
      const isW = prefix === 'w' || prefix === '';

      if (closing) {
        if (tAt === depth) flushT();
        if (skipAt === depth) skipAt = -1;
        // Depth-matched, so it is safe outside the skipAt guard: nothing is
        // ever pushed while a subtree is being thrown away.
        while (picStack.length && picStack[picStack.length - 1].at === depth) closePicture(picStack.pop());
        if (isW && skipAt < 0) {
          if (local === 'p') closeParagraph();
          else if (local === 'tc') {
            const f = tblStack[tblStack.length - 1];
            if (f && f.cell) { if (f.row) f.row.push(f.cell.join(' ').trim()); f.cell = null; }
          } else if (local === 'tr') {
            const f = tblStack[tblStack.length - 1];
            if (f && f.row) {
              const cells = f.row.slice();
              while (cells.length && !cells[cells.length - 1]) cells.pop(); // trailing empties add only dots
              emitAt(tblStack.length - 1, cells.join(CELL_SEP));
              f.row = null;
            }
          } else if (local === 'tbl') {
            if (tblStack.length) tblStack.pop();
          }
        }
        depth--;
        continue;
      }

      if (!selfClosing) depth++;
      const at = selfClosing ? depth + 1 : depth; // notional depth of this element

      if (skipAt >= 0) continue; // already inside something we are throwing away

      if (isFallback(qname)) { if (!selfClosing) skipAt = at; continue; }

      if (isW && SKIP.has(local)) {
        /* Only the DELETING changes count. A tracked insertion (w:ins) is not
           in SKIP at all — its text is kept, which is what "accept all" would
           have done — and the *Change property records are formatting history,
           so neither of those is something a teacher has lost. What they HAVE
           lost is the deleted text, and they cannot tell by looking. */
        if (local === 'del' || local === 'delText' || local === 'moveFrom' || local === 'delInstrText') sawTracked = true;
        if (!selfClosing) skipAt = at;
        continue;
      }

      if (!isW) {
        if (local === 'blip' || local === 'imagedata') sawPicture = true;
        continue; // a:, wps:, v:, mc: wrappers carry no w: text of their own
      }

      switch (local) {
        case 'p':
          paraStack.push([]);
          if (selfClosing) closeParagraph(); // <w:p/> is a blank line
          break;
        case 'tbl':
          sawTable = true;
          if (!selfClosing) tblStack.push({ row: null, cell: null });
          break;
        case 'tr': {
          const f = tblStack[tblStack.length - 1];
          if (f) f.row = [];
          break;
        }
        case 'tc': {
          const f = tblStack[tblStack.length - 1];
          if (f) { if (!f.row) f.row = []; f.cell = []; }
          break;
        }
        case 't':
          if (tAt < 0) {
            tAt = at; tBuf = '';
            tPreserve = /xml:space\s*=\s*(['"])preserve\1/.test(attrs);
            if (selfClosing) { tAt = -1; } // <w:t/> is an empty run, nothing to add
          }
          break;
        case 'br':
        case 'cr':
          if (live()) add('\n');
          break;
        case 'tab':
          if (live()) add(' ');
          break;
        case 'noBreakHyphen':
          if (live()) add('-');
          break;
        case 'sym':
          if (live()) {
            const ch = symChar(attrs);
            if (ch) add(ch);
            else symDropped = true;
          }
          break;
        // softHyphen is a hint about where a word *may* break; it is not a character
        /* A field's CODE is suppressed and its RESULT is kept, so a page
           number, a date or a cross-reference arrives as the words Word last
           put on the page. Nothing is missing, so there is nothing to tell the
           teacher — this used to set a `sawField` flag that nobody ever read. */
        case 'fldChar': {
          const m = /w:fldCharType\s*=\s*(['"])([^'"]*)\1/.exec(attrs) || /fldCharType\s*=\s*(['"])([^'"]*)\1/.exec(attrs);
          const kind = m ? m[2] : '';
          if (kind === 'begin') fldStack.push(true);
          else if (kind === 'separate') { if (fldStack.length) fldStack[fldStack.length - 1] = false; }
          else if (kind === 'end') { fldStack.pop(); }
          break;
        }
        case 'drawing':
        case 'pict':
        case 'object':
          // Decided when it closes, on what turned out to be inside — a text
          // box and a picture are the same element here. See picStack.
          if (selfClosing) sawPicture = true;
          else picStack.push({ at, text: false });
          break;
        case 'txbxContent':
          // Every wrapper still open is a text box, not a picture: the
          // DrawingML form nests wps:txbx one level inside w:drawing, and a
          // text box inside a text box is a shape group.
          for (let k = 0; k < picStack.length; k++) picStack[k].text = true;
          break;
        default:
          break;
      }
    }

    // A file that was truncated mid-save still has the teacher's words in it, and
    // the last of them sit after the final '<' with no closing tag to flush them.
    if (tAt >= 0) { tBuf += tail; flushT(); }
    while (paraStack.length) closeParagraph(); // an unterminated <w:p> still counts
    while (picStack.length) closePicture(picStack.pop()); // ditto an unterminated <w:pict>
    return { lines, sawTable, sawPicture, sawTracked };
  }

  // ------------------------------------------------------------- normalisation
  /* Right-strip each line, drop blank lines at both ends. Interior blanks are
     load-bearing (stanza gaps) and are left exactly as the document had them.
     The trim is trimBlankEnds() for the reason spelled out where it is
     defined: a .docx that opens with a million empty <w:p/> is 9 KB on disk. */
  function tidyDocLines(lines) {
    // Only spaces and tabs come off the end. A trailing non-breaking space is a
    // character the teacher (or Word) actually put there, so it stays.
    const rstrip = (s) => s.replace(/[ \t]+$/, '');
    const flat = [];
    for (const l of lines) {
      for (const part of String(l).replace(/\r\n?/g, '\n').split('\n')) flat.push(rstrip(part));
    }
    return trimBlankEnds(flat).join('\n');
  }

  // ------------------------------------------------------------- the main part
  const RE_MAIN = /^word\/document\d*\.xml$/;

  function findMainPart(files) {
    // The package relationships are the correct answer; "word/document.xml" is
    // only the convention. Note the Type must *end* with /officeDocument — the
    // extended-properties Type contains that word too, halfway along its path.
    const rels = files.get('_rels/.rels');
    if (rels) {
      const xml = decodeBytes(rels);
      const re = /<Relationship\b[^>]*>/g;
      let m;
      while ((m = re.exec(xml))) {
        const tag = m[0];
        const type = /Type\s*=\s*(['"])([^'"]*)\1/.exec(tag);
        if (!type || !/\/officeDocument$/.test(type[2])) continue;
        const target = /Target\s*=\s*(['"])([^'"]*)\1/.exec(tag);
        if (!target) continue;
        const path = target[2].replace(/^\/+/, '');
        if (files.has(path)) return path;
      }
    }
    if (files.has('word/document.xml')) return 'word/document.xml';
    for (const name of files.keys()) if (RE_MAIN.test(name)) return name;
    return null;
  }

  let decoder = null;
  function decodeBytes(bytes) {
    if (!decoder) decoder = new TextDecoder('utf-8');
    const s = decoder.decode(bytes);
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  }

  // ------------------------------------------------------------------- exported
  /* files: Map of path -> Uint8Array, exactly what SageZip.read returns.
     Returns { text, note }. Throws an Error whose message is fit to show a
     teacher when there is nothing readable in the package. */
  function docxText(files, opts) {
    if (!files || typeof files.get !== 'function' || typeof files.has !== 'function') {
      throw new Error('That file could not be opened as a Word document.');
    }
    const main = findMainPart(files);
    if (!main) throw new Error('That .docx has no readable document part.');

    /* TextDecoder is the last place an enormous document part can bite, and it
       bites in a way that reads as the wrong problem: V8 caps a string at
       512 MB, so an 800 MB word/document.xml made decode() throw and the
       catch below reported "no readable document part" — which sends the
       teacher off to re-save a file whose only fault is its size. openZip
       refuses that archive long before we get here now, but the size is
       checked and the decode failure is reported honestly either way, because
       a stored (uncompressed) part never goes through the zip inflate cap. */
    const partBytes = files.get(main);
    if (partBytes && partBytes.length > MAX_STREAM_BYTES) throw tooMuchInside('Word document');
    let xml;
    try { xml = decodeBytes(partBytes); }
    catch (e) { throw tooMuchInside('Word document'); }
    if (!xml || xml.indexOf('<') < 0) throw new Error('That .docx has no readable document part.');

    /* Four times what the caller will actually keep, floored at
       MAX_DOC_CHARS. Anything past this is text read() is about to throw
       away, so the ceiling cannot cost a teacher a word — see the comment
       on MAX_DOC_CHARS. */
    const want = (opts && opts.maxChars > 0) ? opts.maxChars : MAX_CHARS;
    const r = scanDocumentXml(xml, Math.max(MAX_DOC_CHARS, want * 4));
    const text = tidyDocLines(r.lines);

    const notes = [];
    if (!text) notes.push('That document opened fine, but there is no text in it.');
    else {
      if (r.sawTable) notes.push('Table cells are shown on one line with · between them.');
      if (r.sawPicture) notes.push('Pictures were left out — only the words come across.');
      /* Deleted text is the one thing a .docx can be hiding that a teacher
         cannot spot by reading what came across. The whole document is taken
         as though every change had been accepted, which is almost always the
         version they want on the board — but if the WAGOLL still has last
         year's sentence struck through in it, that sentence is gone and they
         should know before the class asks about it. */
      if (r.sawTracked) notes.push('That document has tracked changes in it. Everything is shown as though the changes were accepted, so deleted text is not there.');
    }
    return { text, note: notes.join(' ') };
  }

  /* ============================================================== SPREADSHEET

     Plain text out of an .xlsx.

     WHY THIS EXISTS
     A class register is a spreadsheet. Not usually a Word document, almost
     never a .txt — it is the file the office emailed round in September, or an
     export from the MIS opened once in Excel and saved. Until now this module
     recognised one and turned it away with "copy the cells you want and paste
     them in", which is honest and is also the ninety-seconds-before-a-lesson
     conversion that the rest of this file exists to refuse.

     An .xlsx is a zip like a .docx, so SageZip already opens it. What comes out
     is deliberately tab-separated: the name reader on the other side was built
     for what Excel puts on the clipboard, and that is tab-separated too, so a
     register opened from a file and a register copied out of a window arrive
     the same way and are read by the same code.

     Two things a naive walk gets wrong. Cell text mostly is not in the sheet:
     `t="s"` means the value is an index into xl/sharedStrings.xml, and reading
     the index as the name gives a register of numbers. And cells are sparse —
     an empty column is simply absent, so cells have to be placed by the column
     in their `r` reference or every row after a gap shifts left. */

  const XL_MAX_ROWS = 5000;

  // "BC7" -> 54. Letters only; the row number is not our business here.
  function colOf(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break; // not A-Z: the digits have started
      n = n * 26 + (c - 64);
    }
    return n > 0 ? n - 1 : 0;
  }

  /* The shared string table: one <si> per entry, and an entry can be split
     across several <t> runs when part of it was styled differently, so the
     runs inside one <si> are concatenated rather than taken separately. */
  function sharedStrings(xml) {
    const out = [];
    if (!xml) return out;
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
    let m;
    while ((m = re.exec(xml))) {
      const inner = m[1] || '';
      let s = '';
      const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = tre.exec(inner))) s += decodeEntities(t[1]);
      out.push(s);
    }
    return out;
  }

  function sheetRows(xml, shared, maxChars) {
    const rows = [];
    let chars = 0;
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      if (rows.length >= XL_MAX_ROWS || chars >= maxChars) break;
      const inner = rm[1] || '';
      const cells = [];
      const cRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm;
      while ((cm = cRe.exec(inner))) {
        const attrs = cm[1] || '';
        const body = cm[2] || '';
        const rAt = /\br="([A-Z]+)\d+"/.exec(attrs);
        const at = /\bt="([a-zA-Z]+)"/.exec(attrs);
        const type = at ? at[1] : 'n';
        let val = '';
        if (type === 'inlineStr') {
          const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
          let t;
          while ((t = tre.exec(body))) val += decodeEntities(t[1]);
        } else {
          const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
          const raw = v ? decodeEntities(v[1]) : '';
          // 's' is an index into the shared table; 'str' is a formula's own
          // text result; anything else is already the literal in the cell
          val = type === 's' ? (shared[+raw] || '') : raw;
        }
        val = val.replace(/[\t\r\n]+/g, ' ').trim();
        const col = rAt ? colOf(rAt[1]) : cells.length;
        while (cells.length < col) cells.push('');
        cells[col] = val;
        chars += val.length + 1;
      }
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      rows.push(cells.join('\t'));
    }
    while (rows.length && !rows[rows.length - 1]) rows.pop();
    return rows;
  }

  /* files: Map of path -> Uint8Array, as SageZip.read returns.
     Returns { text, note }. Throws a sentence a teacher can act on. */
  function xlsxText(files, opts) {
    const want = (opts && opts.maxChars > 0) ? opts.maxChars : MAX_CHARS;
    let shared = [];
    const ss = files.get('xl/sharedStrings.xml');
    if (ss) {
      try { shared = sharedStrings(decodeBytes(ss)); } catch (e) { shared = []; }
    }
    /* Which sheet holds the register? Following workbook.xml through its
       relationships is the correct answer and a lot of code for a question a
       register never really asks. The sheet with the most text in it is right
       whenever there is only one that matters, and right more often than
       "sheet1.xml" is when a workbook opens on an empty tab. */
    let best = null;
    let bestCells = -1;
    for (const path of files.keys()) {
      if (path.indexOf('xl/worksheets/') !== 0 || !/\.xml$/i.test(path)) continue;
      let rows;
      try { rows = sheetRows(decodeBytes(files.get(path)), shared, want); } catch (e) { continue; }
      const filled = rows.reduce((n, r) => n + r.split('\t').filter(Boolean).length, 0);
      if (filled > bestCells) { bestCells = filled; best = rows; }
    }
    if (!best) throw new Error('That spreadsheet has no sheet in it that I could read.');
    const notes = [];
    if (best.length >= XL_MAX_ROWS) notes.push('That is a very long sheet, so only the first part has been brought in.');
    return { text: best.join('\n'), note: notes.join(' ') };
  }

  /* ================================================================= PDF

     Plain text out of a PDF, hand-rolled, no dependencies.

     WHY THIS EXISTS
     A teacher has a model text open in Word or Google Docs, saves it as a PDF,
     and wants it on the board in the next thirty seconds. Only the words
     matter: no styling, no images, no layout. Line breaks matter, because
     poems are a real use case.

     WHY THE XREF FIRST
     A brute scan for `N G obj … endobj` is cheaper and handles damaged files,
     and it is a genuinely reasonable choice — it is kept below as the fallback,
     for reasons that follow. It is not sufficient on its own for one reason
     that decides the target case: PDF 1.5+ producers — which includes Word
     2016+, LibreOffice 7 and Google Docs export — put most objects INSIDE
     `/Type /ObjStm` compressed object streams. Those objects have no
     `N G obj` header anywhere in the file; a scan finds the container and
     nothing else, and the page tree, the font dicts and the /ToUnicode CMaps
     all live in there. Following trailer -> xref (classic table or
     `/Type /XRef` stream) -> ObjStm is the only way to see them.

     Two further things the xref buys, both of which are the things that have
     to be right:
       - PAGE ORDER comes from the page tree (/Root -> /Pages -> /Kids), which
         is authoritative. Object number order is not: incrementally updated
         files routinely have page 7 at a lower object number than page 2.
       - PER-PAGE FONT RESOURCES come from each page's own /Resources, with
         proper inheritance from the /Pages node. Guessing "the first font dict
         in the file" is exactly the mistake a Word-exported PDF punishes (14
         unused WinAnsi fonts declared ahead of the one Identity-H font that is
         actually used).

     WHY THE WHOLE-FILE SCAN IS STILL HERE, AS THE FALLBACK
     Every piece of the xref machinery is a place where a slightly-damaged file
     stops us dead — a stale startxref, a byte offset that is off by the length
     of a Windows line ending, a linearised file whose first xref section is a
     lie. Those files still open fine in Preview, and a teacher will not accept
     "your PDF is malformed" as an answer. So when the startxref is missing or
     lies, when an object fails to parse at its stated offset, or when the page
     tree comes back empty, we scan the whole file for "N G obj … endobj"
     instead. It costs one pass over a few hundred kilobytes, it does not care
     whether any offset in the file is correct, and it finds objects in damaged
     and incrementally-updated files that a strict reader would refuse. In a
     file that has been incrementally updated a scan sees superseded objects
     too; we let the LAST definition in the file win, which is what an
     incremental update means in practice.

     Between the two we see everything a real reader would, without ever having
     to trust an offset. Modern files work properly; damaged files still work.

     INFLATE IS INJECTED
     Every call goes through inflateStream() at the top of this file, so node
     can hand us zlib and the browser hands us DecompressionStream, and nothing
     else in here changes. That hook is async, which is why pdfText is. */

  /* ---------------------------------------------------------------- bytes */

  function toU8(b) {
    if (b instanceof Uint8Array) return b;
    if (b && b.buffer instanceof ArrayBuffer) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    return new Uint8Array(b || 0);
  }

  function latin1(buf, a, b) {
    let s = '';
    for (let i = a; i < b; i += 4096) {
      const j = Math.min(b, i + 4096);
      s += String.fromCharCode.apply(null, buf.subarray(i, j));
    }
    return s;
  }

  function bytesMatch(buf, pos, str) {
    if (pos < 0 || pos + str.length > buf.length) return false;
    for (let i = 0; i < str.length; i++) if (buf[pos + i] !== str.charCodeAt(i)) return false;
    return true;
  }

  function indexOfStr(buf, str, from) {
    const first = str.charCodeAt(0);
    const last = buf.length - str.length;
    for (let i = Math.max(0, from); i <= last; i++) {
      if (buf[i] !== first) continue;
      let ok = true;
      for (let j = 1; j < str.length; j++) if (buf[i + j] !== str.charCodeAt(j)) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }

  function lastIndexOfStr(buf, str, from) {
    const first = str.charCodeAt(0);
    for (let i = Math.min(from, buf.length - str.length); i >= 0; i--) {
      if (buf[i] !== first) continue;
      let ok = true;
      for (let j = 1; j < str.length; j++) if (buf[i + j] !== str.charCodeAt(j)) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }

  /* --------------------------------------------------------------- errors */

  function pdfError(code, message) {
    const e = new Error(message);
    e.code = code;
    e.teacherFacing = true;
    return e;
  }

  /* ------------------------------------------------------- character sets */

  const WS = new Uint8Array(256);
  [0, 9, 10, 12, 13, 32].forEach(c => { WS[c] = 1; });
  const DELIM = new Uint8Array(256);
  [0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25].forEach(c => { DELIM[c] = 1; });
  const REG = new Uint8Array(256);
  for (let i = 0; i < 256; i++) REG[i] = (WS[i] || DELIM[i]) ? 0 : 1;

  /* ------------------------------------------------------- object classes */

  class Name {
    constructor(n) { this.name = n; }
  }
  const NAME_CACHE = new Map();
  function mkName(s) {
    let v = NAME_CACHE.get(s);
    if (!v) { v = new Name(s); NAME_CACHE.set(s, v); }
    return v;
  }

  class Ref {
    constructor(num, gen) { this.num = num; this.gen = gen; }
  }

  class PStr {
    constructor(bytes) { this.bytes = bytes; }
  }

  class Op {
    constructor(op) { this.op = op; }
  }

  class Dict {
    constructor() { this.m = Object.create(null); }
    get(k) { return this.m[k]; }
    set(k, v) { this.m[k] = v; }
    has(k) { return k in this.m; }
    keys() { return Object.keys(this.m); }
  }

  class PStream {
    constructor(dict, buf, start, end) {
      this.dict = dict; this.buf = buf; this.start = start; this.end = end;
    }
    raw() { return this.buf.subarray(this.start, this.end); }
  }

  const ARR_END = Symbol(']');
  const DICT_END = Symbol('>>');

  /* --------------------------------------------------------------- lexer */

  class Lexer {
    constructor(buf, pos) { this.b = buf; this.p = pos | 0; }

    skip() {
      const b = this.b;
      while (this.p < b.length) {
        const c = b[this.p];
        if (WS[c]) { this.p++; continue; }
        if (c === 0x25) { // '%' comment
          while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++;
          continue;
        }
        break;
      }
    }

    readRegular() {
      const b = this.b, s = this.p;
      while (this.p < b.length && REG[b[this.p]]) this.p++;
      return latin1(b, s, this.p);
    }

    readName() {
      const b = this.b;
      this.p++; // '/'
      let out = '';
      while (this.p < b.length && REG[b[this.p]]) {
        let c = b[this.p];
        if (c === 0x23 && this.p + 2 < b.length) {
          const h = parseInt(latin1(b, this.p + 1, this.p + 3), 16);
          if (!isNaN(h)) { out += String.fromCharCode(h); this.p += 3; continue; }
        }
        out += String.fromCharCode(c);
        this.p++;
      }
      return mkName(out);
    }

    readNumber() {
      const s = this.readRegular();
      const v = parseFloat(s);
      return isFinite(v) ? v : 0;
    }

    /* Both string readers collect into a ByteSink rather than a plain array.
       They are bounded by the buffer either way, but the buffer can now be a
       48 MB decoded stream, and an unterminated "(" in one of those is 48
       million tagged words — 384 MB — where the bytes themselves are 48. */
    readLiteralString() {
      const b = this.b;
      this.p++; // '('
      const out = new ByteSink(b.length - this.p + 2);
      let depth = 1;
      while (this.p < b.length) {
        let c = b[this.p++];
        if (c === 0x5c) { // backslash
          if (this.p >= b.length) break;
          const e = b[this.p++];
          switch (e) {
            case 0x6e: out.push(10); break;             // n
            case 0x72: out.push(13); break;             // r
            case 0x74: out.push(9); break;              // t
            case 0x62: out.push(8); break;              // b
            case 0x66: out.push(12); break;             // f
            case 0x28: out.push(0x28); break;
            case 0x29: out.push(0x29); break;
            case 0x5c: out.push(0x5c); break;
            case 13: if (b[this.p] === 10) this.p++; break; // line continuation
            case 10: break;
            default:
              if (e >= 0x30 && e <= 0x37) {            // octal, up to 3 digits
                let v = e - 0x30;
                for (let k = 0; k < 2; k++) {
                  const d = b[this.p];
                  if (d >= 0x30 && d <= 0x37) { v = v * 8 + (d - 0x30); this.p++; } else break;
                }
                out.push(v & 0xff);
              } else out.push(e);
          }
          continue;
        }
        if (c === 0x28) { depth++; out.push(c); continue; }
        if (c === 0x29) { depth--; if (depth === 0) break; out.push(c); continue; }
        out.push(c);
      }
      return out.take();
    }

    readHexString() {
      const b = this.b;
      this.p++; // '<'
      const out = new ByteSink(Math.floor((b.length - this.p) / 2) + 2);
      let hi = -1;
      while (this.p < b.length) {
        const c = b[this.p++];
        if (c === 0x3e) break;
        let v = -1;
        if (c >= 0x30 && c <= 0x39) v = c - 0x30;
        else if (c >= 0x41 && c <= 0x46) v = c - 55;
        else if (c >= 0x61 && c <= 0x66) v = c - 87;
        else continue;
        if (hi < 0) hi = v; else { out.push((hi << 4) | v); hi = -1; }
      }
      if (hi >= 0) out.push(hi << 4);
      return out.take();
    }

    // Returns a value, an Op, ARR_END, DICT_END, or undefined at EOF.
    next(depth) {
      depth = depth || 0;
      for (;;) {
        this.skip();
        if (this.p >= this.b.length) return undefined;
        const c = this.b[this.p];
        if (c === 0x2f) return this.readName();
        if (c === 0x28) return new PStr(this.readLiteralString());
        if (c === 0x3c) {
          if (this.b[this.p + 1] === 0x3c) { this.p += 2; return this.readDict(depth + 1); }
          return new PStr(this.readHexString());
        }
        if (c === 0x5b) { this.p++; return this.readArray(depth + 1); }
        if (c === 0x5d) { this.p++; return ARR_END; }
        if (c === 0x3e) { this.p += (this.b[this.p + 1] === 0x3e) ? 2 : 1; return DICT_END; }
        if (c === 0x7b || c === 0x7d) { this.p++; return new Op(c === 0x7b ? '{' : '}'); }
        if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) return this.numberOrRef();
        const kw = this.readRegular();
        if (kw === '') { this.p++; continue; }   // stray delimiter: skip it
        if (kw === 'true') return true;
        if (kw === 'false') return false;
        if (kw === 'null') return null;
        return new Op(kw);
      }
    }

    numberOrRef() {
      const n = this.readNumber();
      if (!Number.isInteger(n) || n < 0) return n;
      const save = this.p;
      this.skip();
      const c = this.b[this.p];
      if (c >= 0x30 && c <= 0x39) {
        const g = this.readNumber();
        if (Number.isInteger(g) && g >= 0) {
          this.skip();
          if (this.readRegular() === 'R') return new Ref(n, g);
        }
      }
      this.p = save;
      return n;
    }

    readDict(depth) {
      const d = new Dict();
      if (depth > 96) return d;
      for (;;) {
        const k = this.next(depth);
        if (k === undefined || k === DICT_END) break;
        if (k === ARR_END) continue;
        if (!(k instanceof Name)) continue;          // malformed key: skip
        const v = this.next(depth);
        if (v === undefined || v === DICT_END) break;
        if (v === ARR_END) continue;
        if (v instanceof Op) continue;
        d.set(k.name, v);
      }
      return d;
    }

    readArray(depth) {
      const a = [];
      if (depth > 96) return a;
      for (;;) {
        const v = this.next(depth);
        if (v === undefined || v === ARR_END || v === DICT_END) break;
        if (v instanceof Op) continue;
        a.push(v);
        if (a.length > 200000) break;
      }
      return a;
    }
  }

  /* ------------------------------------------------------------- filters

     FlateDecode goes through inflateStream() at the top of this file, which is
     the single place anything is decompressed. pdfText's opts.inflate overrides
     it, and that is the whole of the node harness's injection.

     EVERY filter here is bounded, and they are bounded the same way: output
     goes into a ByteSink carrying MAX_STREAM_BYTES, which refuses before it
     allocates. Three of the five are expanding filters and none of the
     expansion ratios is small — RunLength is 128:1, LZW is about 1000:1,
     ASCII85's 'z' is 4:1, and Flate is 1032:1 — so "bounded by the input" is
     no bound at all when the input is a file a teacher was emailed. */

  function asciiHexDecode(d) {
    // Contracting (2:1), but the sink still carries the ceiling so that a
    // chain like [/FlateDecode /ASCIIHexDecode] cannot walk past it.
    const out = new ByteSink(Math.floor(d.length / 2) + 2);
    let hi = -1;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (c === 0x3e) break;
      let v = -1;
      if (c >= 0x30 && c <= 0x39) v = c - 0x30;
      else if (c >= 0x41 && c <= 0x46) v = c - 55;
      else if (c >= 0x61 && c <= 0x66) v = c - 87;
      else continue;
      if (hi < 0) hi = v; else { out.push((hi << 4) | v); hi = -1; }
    }
    if (hi >= 0) out.push(hi << 4);
    return out.view();
  }

  function ascii85Decode(d) {
    // 'z' is one byte in and four out, so this one does expand.
    const out = new ByteSink(d.length * 4 + 8);
    let tuple = 0, count = 0, i = 0;
    if (d[0] === 0x3c && d[1] === 0x7e) i = 2;
    for (; i < d.length; i++) {
      const c = d[i];
      if (WS[c]) continue;
      if (c === 0x7e) break;                       // '~>'
      if (c === 0x7a && count === 0) { out.fill(0, 4); continue; }
      if (c < 0x21 || c > 0x75) continue;
      tuple = tuple * 85 + (c - 0x21);
      if (++count === 5) {
        out.each([(tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255]);
        tuple = 0; count = 0;
      }
    }
    if (count > 0) {
      for (let k = count; k < 5; k++) tuple = tuple * 85 + 84;
      const b = [(tuple / 16777216) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255];
      for (let k = 0; k < count - 1; k++) out.push(b[k]);
    }
    return out.view();
  }

  /* RunLengthDecode expands 128:1 — two bytes in, 128 out — and it used to be
     the one filter here with no ceiling at all. 8 KB of PDF behind a
     FlateDecode reached about 2 GB, and because a plain JS array is old-space
     that was not a catchable error but a V8 abort: the "Aw, Snap!" a teacher
     cannot recover from mid-lesson. Now it is a run of Uint8Array.fill inside
     the same budget as everything else, which is both bounded and very much
     faster than pushing a byte at a time. */
  function runLengthDecode(d) {
    const out = new ByteSink(MAX_STREAM_BYTES);
    let i = 0;
    while (i < d.length) {
      const n = d[i++];
      if (n === 128) break;
      if (n < 128) {
        const want = n + 1;
        const got = Math.max(0, Math.min(d.length, i + want) - i);
        out.copy(d, i, got);
        out.fill(0, want - got);   // a run cut off by the end of the stream
        i += want;
      }
      else { out.fill(d[i++] | 0, 257 - n); }
    }
    return out.view();
  }

  function lzwDecode(data, earlyChange) {
    const early = earlyChange === 0 ? 0 : 1;
    // Was 1<<26 entries in a plain array — 67 million tagged words, over half
    // a gigabyte of old space for 64 MB of bytes. Same ceiling as every other
    // filter now, and one byte per byte.
    const out = new ByteSink(MAX_STREAM_BYTES);
    let dict = new Array(4096), dictLen = 258, codeLen = 9, prev = null;
    const reset = () => {
      dict = new Array(4096);
      for (let i = 0; i < 256; i++) dict[i] = [i];
      dictLen = 258; codeLen = 9; prev = null;
    };
    reset();
    let bitBuf = 0, bitCnt = 0, p = 0;
    for (;;) {
      while (bitCnt < codeLen) {
        if (p >= data.length) return out.view();
        bitBuf = ((bitBuf << 8) | data[p++]) >>> 0; bitCnt += 8;
      }
      const code = (bitBuf >>> (bitCnt - codeLen)) & ((1 << codeLen) - 1);
      bitCnt -= codeLen;
      if (code === 256) { reset(); continue; }
      if (code === 257) break;
      let entry;
      if (code < dictLen && dict[code]) entry = dict[code];
      else if (prev) entry = prev.concat(prev[0]);
      else break;
      out.each(entry);
      if (prev && dictLen < 4096) dict[dictLen++] = prev.concat(entry[0]);
      prev = entry;
      if (dictLen + early >= (1 << codeLen) && codeLen < 12) codeLen++;
    }
    return out.view();
  }

  function applyPredictor(data, p) {
    const pred = p.Predictor | 0;
    if (pred < 2) return data;
    const colors = p.Colors || 1, bpc = p.BitsPerComponent || 8, columns = p.Columns || 1;
    const bpp = Math.max(1, Math.ceil(colors * bpc / 8));
    const rowLen = Math.ceil(colors * bpc * columns / 8);
    if (pred === 2) {
      if (bpc !== 8) return data;
      const rows = Math.floor(data.length / rowLen);
      for (let r = 0; r < rows; r++) {
        const off = r * rowLen;
        for (let i = bpp; i < rowLen; i++) data[off + i] = (data[off + i] + data[off + i - bpp]) & 255;
      }
      return data;
    }
    // PNG predictors
    const nRows = Math.floor(data.length / (rowLen + 1));
    const out = new Uint8Array(nRows * rowLen);
    let prevRow = new Uint8Array(rowLen);
    for (let r = 0; r < nRows; r++) {
      const ft = data[r * (rowLen + 1)];
      const src = data.subarray(r * (rowLen + 1) + 1, r * (rowLen + 1) + 1 + rowLen);
      const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
      cur.set(src);
      switch (ft) {
        case 0: break;
        case 1: for (let i = bpp; i < rowLen; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255; break;
        case 2: for (let i = 0; i < rowLen; i++) cur[i] = (cur[i] + prevRow[i]) & 255; break;
        case 3: for (let i = 0; i < rowLen; i++) {
          const left = i >= bpp ? cur[i - bpp] : 0;
          cur[i] = (cur[i] + ((left + prevRow[i]) >> 1)) & 255;
        } break;
        case 4: for (let i = 0; i < rowLen; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0, b = prevRow[i], c = i >= bpp ? prevRow[i - bpp] : 0;
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          cur[i] = (cur[i] + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c))) & 255;
        } break;
        default: break;
      }
      prevRow = cur;
    }
    return out;
  }

  /* ------------------------------------------------------------ encodings */

  /* Code -> unicode tables. Built as compact strings so they can be eyeballed.
   * WinAnsi is CP1252; MacRoman is the Mac OS Roman table. Codes 0x00-0x7F are
   * ASCII in both. StandardEncoding differs in the ASCII range at 0x27 / 0x60. */

  const WIN_HIGH =
    '€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž�' +
    '�‘’“”•–—˜™š›œ�žŸ';

  const MAC_HIGH =
    'ÄÅÇÉÑÖÜáàâäãåçéè' +
    'êëíìîïñóòôöõúùûü' +
    '†°¢£§•¶ß®©™´¨≠ÆØ' +
    '∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
    '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ' +
    '–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ' +
    '‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ' +
    'ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

  function buildTable(highStr, tweaks) {
    const t = new Array(256).fill('');
    for (let i = 32; i < 127; i++) t[i] = String.fromCharCode(i);
    for (let i = 0; i < 128; i++) {
      const ch = highStr.charCodeAt(i);
      t[128 + i] = (ch === 0xFFFD) ? '' : String.fromCharCode(ch);
    }
    if (tweaks) for (const k of Object.keys(tweaks)) t[k | 0] = tweaks[k];
    return t;
  }

  const WIN_ANSI = (function () {
    // CP1252: 0xA0-0xFF are Latin-1.
    let high = WIN_HIGH;
    for (let i = 0xA0; i <= 0xFF; i++) high += String.fromCharCode(i);
    return buildTable(high, { 0xA0: ' ', 0xAD: '-' });
  })();

  const MAC_ROMAN = buildTable(MAC_HIGH, { 0xCA: ' ' });

  const STANDARD = (function () {
    const t = new Array(256).fill('');
    for (let i = 32; i < 127; i++) t[i] = String.fromCharCode(i);
    t[0x27] = '’'; t[0x60] = '‘';
    const high = {
      0xA1: '¡', 0xA2: '¢', 0xA3: '£', 0xA4: '⁄', 0xA5: '¥', 0xA6: 'ƒ',
      0xA7: '§', 0xA8: '¤', 0xA9: "'", 0xAA: '“', 0xAB: '«', 0xAC: '‹',
      0xAD: '›', 0xAE: 'ﬁ', 0xAF: 'ﬂ', 0xB1: '–', 0xB2: '†', 0xB3: '‡',
      0xB4: '·', 0xB6: '¶', 0xB7: '•', 0xB8: '‚', 0xB9: '„', 0xBA: '”',
      0xBB: '»', 0xBC: '…', 0xBD: '‰', 0xBF: '¿', 0xC1: '`', 0xC2: '´',
      0xC3: 'ˆ', 0xC4: '˜', 0xC5: '¯', 0xC6: '˘', 0xC7: '˙', 0xC8: '¨',
      0xCA: '˚', 0xCB: '¸', 0xCD: '˝', 0xCE: '˛', 0xCF: 'ˇ', 0xD0: '—',
      0xE1: 'Æ', 0xE3: 'ª', 0xE8: 'Ł', 0xE9: 'Ø', 0xEA: 'Œ', 0xEB: 'º',
      0xF1: 'æ', 0xF5: 'ı', 0xF8: 'ł', 0xF9: 'ø', 0xFA: 'œ', 0xFB: 'ß'
    };
    for (const k of Object.keys(high)) t[k | 0] = high[k];
    return t;
  })();

  /* Glyph name -> unicode, needed only for /Differences arrays. The two long
   * strings are positional: ASCII names map to 32..126, Latin names to
   * 0xA1..0xFF. That is exactly how the AGL lays them out. */
  const GLYPH_NAMES = (function () {
    const m = Object.create(null);
    const ascii = ('space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft ' +
      'parenright asterisk plus comma hyphen period slash zero one two three four five six seven ' +
      'eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R ' +
      'S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g ' +
      'h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde').split(' ');
    ascii.forEach((n, i) => { m[n] = String.fromCharCode(32 + i); });
    const latin = ('exclamdown cent sterling currency yen brokenbar section dieresis copyright ' +
      'ordfeminine guillemotleft logicalnot hyphensoft registered macron degree plusminus twosuperior ' +
      'threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright ' +
      'onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring ' +
      'AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde ' +
      'Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis ' +
      'Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave ' +
      'eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ' +
      'ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ' +
      'ydieresis').split(' ');
    latin.forEach((n, i) => { if (!(n in m)) m[n] = String.fromCharCode(0xA1 + i); });
    const extra = {
      quoteleft: '‘', quoteright: '’', quotedblleft: '“', quotedblright: '”',
      quotesinglbase: '‚', quotedblbase: '„', endash: '–', emdash: '—',
      dagger: '†', daggerdbl: '‡', bullet: '•', ellipsis: '…',
      perthousand: '‰', guilsinglleft: '‹', guilsinglright: '›', fraction: '⁄',
      florin: 'ƒ', fi: 'ﬁ', fl: 'ﬂ', Euro: '€', trademark: '™',
      Scaron: 'Š', scaron: 'š', Zcaron: 'Ž', zcaron: 'ž', Ydieresis: 'Ÿ',
      OE: 'Œ', oe: 'œ', circumflex: 'ˆ', tilde: '˜', breve: '˘',
      dotaccent: '˙', ring: '˚', ogonek: '˛', caron: 'ˇ', hungarumlaut: '˝',
      dotlessi: 'ı', lslash: 'ł', Lslash: 'Ł', minus: '−', nbspace: ' ',
      softhyphen: '-', middot: '·', nonbreakingspace: ' '
    };
    for (const k of Object.keys(extra)) m[k] = extra[k];
    return m;
  })();

  function glyphNameToUnicode(n) {
    if (!n) return '';
    if (n in GLYPH_NAMES) return GLYPH_NAMES[n];
    let m = /^uni([0-9A-Fa-f]{4,6})$/.exec(n);
    if (m) return String.fromCodePoint(parseInt(m[1], 16));
    m = /^u([0-9A-Fa-f]{4,6})$/.exec(n);
    if (m) return String.fromCodePoint(parseInt(m[1], 16));
    // "g12", "cid12", "index12", "C12": glyph indices, not characters. Unknowable.
    return '';
  }

  /* --------------------------------------------------------------- CMaps */

  function beInt(bytes) {
    let v = 0;
    for (let i = 0; i < bytes.length; i++) v = (v << 8) | bytes[i];
    return v >>> 0;
  }

  function utf16beToStr(bytes) {
    if (bytes.length === 1) return String.fromCharCode(bytes[0]);
    let s = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }

  function cmapDst(v) {
    if (v instanceof PStr) return utf16beToStr(v.bytes);
    if (v instanceof Name) return glyphNameToUnicode(v.name);
    return null;
  }

  /* Parses a /ToUnicode CMap (and, if given one, an embedded /Encoding CMap).
   * Returns { map: Map<code,string>, byteLens: Set<number> }.
   *
   * `budget` is a shared { left } counter, one per document. It is the second
   * of two ceilings and both are needed, because the cost here is not in the
   * tokens but in the WRITES:
   *
   *   <0000> <FFFF> <0041>
   *
   * is twenty-two bytes of file and 65,536 map.set calls with a freshly built
   * string in each. Six thousand of those fit in 1.4 KB and cost 393 million
   * writes — half a minute of frozen tab from a file that fits in a text
   * message. The old `guard > 4000000` counts lexer tokens and never sees it:
   * six thousand ranges is eighteen thousand tokens. And the parse is per
   * font, so a per-font cap alone still loses to two hundred fonts, which is
   * why the document-wide counter is threaded through as well.
   *
   * A two-byte font can address 65,536 codes in total. MAX_CMAP_WRITES is
   * three times that for one font, MAX_CMAP_WRITES_TOTAL fifteen times it for
   * the whole document. A real WAGOLL has one to eight fonts mapping a few
   * hundred codes each; a full CJK face maps perhaps twenty thousand. */
  function parseCMap(data, budget) {
    const map = new Map();
    const byteLens = new Set();
    const lx = new Lexer(data, 0);
    let guard = 0;
    let mine = MAX_CMAP_WRITES;
    let full = false;
    // Every write to the map goes through here, and the first refusal stops
    // the whole parse rather than grinding through the remaining ranges.
    function put(code, s) {
      if (mine <= 0 || (budget && budget.left <= 0)) { full = true; return false; }
      map.set(code, s);
      mine--;
      if (budget) budget.left--;
      return true;
    }
    for (;;) {
      if (full) break;
      if (++guard > 4000000) break;
      const t = lx.next();
      if (t === undefined) break;
      if (!(t instanceof Op)) continue;
      const op = t.op;
      if (op === 'begincodespacerange') {
        for (;;) {
          const a = lx.next();
          if (a === undefined || a instanceof Op) break;
          const b = lx.next();
          if (b === undefined || b instanceof Op) break;
          if (a instanceof PStr) byteLens.add(a.bytes.length);
        }
      } else if (op === 'beginbfchar') {
        for (;;) {
          if (full) break;
          const a = lx.next();
          if (a === undefined || a instanceof Op) break;
          const b = lx.next();
          if (b === undefined || b instanceof Op) break;
          if (a instanceof PStr) {
            const s = cmapDst(b);
            if (s !== null && s !== '') { put(beInt(a.bytes), s); byteLens.add(a.bytes.length); }
          }
        }
      } else if (op === 'beginbfrange') {
        for (;;) {
          if (full) break;
          const a = lx.next();
          if (a === undefined || a instanceof Op) break;
          const b = lx.next();
          if (b === undefined || b instanceof Op) break;
          const c = lx.next();
          if (c === undefined || c instanceof Op) break;
          if (!(a instanceof PStr) || !(b instanceof PStr)) continue;
          byteLens.add(a.bytes.length);
          const lo = beInt(a.bytes), hi = beInt(b.bytes);
          if (hi < lo || hi - lo > 65535) continue;
          if (Array.isArray(c)) {
            for (let i = 0; i <= hi - lo && i < c.length; i++) {
              const s = cmapDst(c[i]);
              if (s !== null && s !== '' && !put(lo + i, s)) break;
            }
          } else if (c instanceof PStr) {
            const units = [];
            const bb = c.bytes;
            if (bb.length === 1) units.push(bb[0]);
            else for (let i = 0; i + 1 < bb.length; i += 2) units.push((bb[i] << 8) | bb[i + 1]);
            if (!units.length) continue;
            const u = units.slice();
            const last = u.length - 1;
            const base = units[last];
            for (let code = lo; code <= hi; code++) {
              u[last] = (base + (code - lo)) & 0xffff;
              if (!put(code, String.fromCharCode.apply(null, u))) break;
            }
          }
        }
      }
    }
    return { map, byteLens };
  }

  /* ---------------------------------------------------------- the document */

  class PDFDocument {
    constructor(buf, opts) {
      this.buf = buf;
      this.inflate = (opts && opts.inflate) || inflateStream;
      this.xref = new Map();          // num -> {type:1,offset} | {type:2,stm,idx}
      this.cache = new Map();         // num -> value
      this.objstm = new Map();        // stm num -> {data, first, pairs}
      this.streamCache = new Map();   // PStream -> Uint8Array
      this.scanned = null;            // num -> offset (brute-force fallback)
      this.scanExtra = new Map();     // num -> value (from ObjStm during fallback)
      this.trailer = null;
      this.headerShift = 0;
      this.xrefOk = false;
      this.warnings = [];
      // Decompressed bytes, added up over every stream in the file. Each
      // stream is separately capped at MAX_STREAM_BYTES; this is what stops a
      // thousand streams each just under that cap from adding up to a
      // gigabyte, which is the same "Aw, Snap!" arrived at the slow way.
      this.decodedTotal = 0;
      // /ToUnicode writes left for the whole document — see parseCMap.
      this.cmapBudget = { left: MAX_CMAP_WRITES_TOTAL };
    }

    async init() {
      const hdr = indexOfStr(this.buf, '%PDF-', 0);
      if (hdr < 0 || hdr > 4096) {
        throw pdfError('NOT_PDF', "That doesn't look like a PDF file — I couldn't find anything to read in it.");
      }
      this.headerShift = hdr;
      try {
        const sx = lastIndexOfStr(this.buf, 'startxref', this.buf.length - 1);
        if (sx >= 0) {
          const lx = new Lexer(this.buf, sx + 9);
          const off = lx.next();
          if (typeof off === 'number') await this.readXrefChain(off);
        }
      } catch (e) { this.warnings.push('xref: ' + e.message); }
      if (!this.trailer || !this.trailer.get('Root')) {
        // No usable trailer: fall back to a full-file object scan.
        await this.ensureScan(true);
        if (!this.trailer) this.trailer = await this.findTrailerByScan();
        // A scanned trailer has no /Encrypt to check, so note whether the file
        // mentions encryption at all — it changes which message the teacher gets.
        this.maybeEncrypted = indexOfStr(this.buf, '/Encrypt', 0) >= 0;
      }
      this.xrefOk = this.xref.size > 0;
    }

    mergeTrailer(d) {
      if (!d) return;
      if (!this.trailer) { this.trailer = d; return; }
      for (const k of d.keys()) if (!this.trailer.has(k)) this.trailer.set(k, d.get(k));
    }

    async readXrefChain(start) {
      const seen = new Set();
      let pos = start;
      let hops = 0;
      while (pos != null && hops++ < 64) {
        if (seen.has(pos)) break;
        seen.add(pos);
        let sec = null;
        try { sec = await this.readXrefSection(pos); } catch (e) { this.warnings.push('xref@' + pos + ': ' + e.message); }
        if (!sec && this.headerShift && !seen.has(pos + this.headerShift)) {
          // Offsets are relative to the header, which is not at byte 0.
          pos = pos + this.headerShift;
          seen.add(pos);
          try { sec = await this.readXrefSection(pos); } catch (e) { /* give up on this hop */ }
        }
        if (!sec) break;
        this.mergeTrailer(sec.trailer);
        if (sec.xrefStm != null && !seen.has(sec.xrefStm)) {
          seen.add(sec.xrefStm);
          try { const s2 = await this.readXrefSection(sec.xrefStm); if (s2) this.mergeTrailer(s2.trailer); } catch (e) { /* hybrid extras are optional */ }
        }
        const prev = sec.trailer ? sec.trailer.get('Prev') : null;
        pos = (typeof prev === 'number') ? prev : null;
      }
    }

    async readXrefSection(pos) {
      if (!(pos >= 0) || pos >= this.buf.length) return null;
      const lx = new Lexer(this.buf, pos);
      lx.skip();
      if (bytesMatch(this.buf, lx.p, 'xref')) return this.readClassicXref(lx);
      const obj = await this.parseIndirectAt(pos, null);
      if (!obj || !(obj.value instanceof PStream)) return null;
      return this.readXrefStream(obj.value);
    }

    readClassicXref(lx) {
      lx.p += 4;
      for (;;) {
        lx.skip();
        if (bytesMatch(this.buf, lx.p, 'trailer')) {
          lx.p += 7;
          const t = lx.next();
          const d = (t instanceof Dict) ? t : null;
          const xs = d ? d.get('XRefStm') : null;
          return { trailer: d, xrefStm: (typeof xs === 'number') ? xs : null };
        }
        const start = lx.next();
        if (typeof start !== 'number') return { trailer: null, xrefStm: null };
        const count = lx.next();
        if (typeof count !== 'number' || count < 0 || count > 5000000) return { trailer: null, xrefStm: null };
        for (let i = 0; i < count; i++) {
          lx.skip();
          const off = lx.next();
          const gen = lx.next();
          const kind = lx.next();
          if (typeof off !== 'number' || typeof gen !== 'number') return { trailer: null, xrefStm: null };
          const k = (kind instanceof Op) ? kind.op : 'n';
          const num = start + i;
          if (k === 'n' && !this.xref.has(num)) this.xref.set(num, { type: 1, offset: off, gen });
        }
      }
    }

    async readXrefStream(st) {
      const d = st.dict;
      const data = await this.getStreamData(st);
      const W = d.get('W');
      if (!Array.isArray(W) || W.length < 3) return { trailer: d, xrefStm: null };
      const w = W.map(x => (typeof x === 'number' ? x : 0));
      const size = typeof d.get('Size') === 'number' ? d.get('Size') : 0;
      let index = d.get('Index');
      if (!Array.isArray(index) || index.length < 2) index = [0, size];
      const rowLen = w.reduce((a, b) => a + b, 0);
      if (rowLen <= 0) return { trailer: d, xrefStm: null };
      let p = 0;
      const readField = (n) => {
        if (n === 0) return null;
        let v = 0;
        for (let i = 0; i < n; i++) v = v * 256 + (data[p++] | 0);
        return v;
      };
      for (let s = 0; s + 1 < index.length; s += 2) {
        const first = index[s] | 0, n = index[s + 1] | 0;
        for (let i = 0; i < n; i++) {
          if (p + rowLen > data.length) break;
          const f1 = readField(w[0]);
          const f2 = readField(w[1]);
          const f3 = readField(w[2]);
          const type = (f1 === null) ? 1 : f1;
          const num = first + i;
          if (this.xref.has(num)) continue;
          if (type === 1) this.xref.set(num, { type: 1, offset: f2 || 0, gen: f3 || 0 });
          else if (type === 2) this.xref.set(num, { type: 2, stm: f2 || 0, idx: f3 || 0 });
        }
      }
      return { trailer: d, xrefStm: null };
    }

    /* ---- object access ---- */

    async parseIndirectAt(offset, expectNum) {
      if (!(offset >= 0) || offset >= this.buf.length) return null;
      const lx = new Lexer(this.buf, offset);
      const num = lx.next();
      if (typeof num !== 'number') return null;
      const gen = lx.next();
      if (typeof gen !== 'number') return null;
      const kw = lx.next();
      if (!(kw instanceof Op) || kw.op !== 'obj') return null;
      if (expectNum != null && num !== expectNum) return null;
      let value = lx.next();
      if (value === undefined) return null;
      if (value instanceof Op) value = null;
      // stream?
      const save = lx.p;
      lx.skip();
      if (value instanceof Dict && bytesMatch(this.buf, lx.p, 'stream')) {
        let p = lx.p + 6;
        if (this.buf[p] === 13) p++;
        if (this.buf[p] === 10) p++;
        let end = -1;
        let len = value.get('Length');
        if (len instanceof Ref) {
          try { len = await this.resolve(len); } catch (e) { len = null; }
        }
        if (typeof len === 'number' && len >= 0 && p + len <= this.buf.length) {
          const probe = new Lexer(this.buf, p + len);
          probe.skip();
          if (bytesMatch(this.buf, probe.p, 'endstream')) end = p + len;
        }
        if (end < 0) {
          const e = indexOfStr(this.buf, 'endstream', p);
          end = e < 0 ? this.buf.length : e;
          while (end > p && (this.buf[end - 1] === 10 || this.buf[end - 1] === 13)) end--;
        }
        value = new PStream(value, this.buf, p, end);
      } else {
        lx.p = save;
      }
      return { num, gen, value };
    }

    async ensureScan(expandObjStm) {
      if (this.scanned) {
        if (expandObjStm && !this._objStmExpanded) await this.expandAllObjStm();
        return;
      }
      const map = new Map();
      const b = this.buf;
      for (let i = 0; i + 3 <= b.length; i++) {
        if (b[i] !== 0x6f || b[i + 1] !== 0x62 || b[i + 2] !== 0x6a) continue;    // "obj"
        if (i + 3 < b.length && REG[b[i + 3]]) continue;
        let j = i - 1;
        while (j >= 0 && WS[b[j]]) j--;
        const genEnd = j + 1;
        while (j >= 0 && b[j] >= 0x30 && b[j] <= 0x39) j--;
        const genStart = j + 1;
        if (genStart === genEnd) continue;
        while (j >= 0 && WS[b[j]]) j--;
        const numEnd = j + 1;
        if (numEnd === genStart) continue;
        while (j >= 0 && b[j] >= 0x30 && b[j] <= 0x39) j--;
        const numStart = j + 1;
        if (numStart === numEnd) continue;
        if (j >= 0 && REG[b[j]]) continue;
        const num = parseInt(latin1(b, numStart, numEnd), 10);
        if (isFinite(num)) map.set(num, numStart);
        i += 2;
      }
      this.scanned = map;
      if (expandObjStm) await this.expandAllObjStm();
    }

    async expandAllObjStm() {
      this._objStmExpanded = true;
      for (const [num, off] of this.scanned) {
        let o = null;
        try { o = await this.parseIndirectAt(off, num); } catch (e) { continue; }
        if (!o || !(o.value instanceof PStream)) continue;
        const t = o.value.dict.get('Type');
        if (!(t instanceof Name) || t.name !== 'ObjStm') continue;
        try {
          const parsed = await this.loadObjStm(num, o.value);
          if (!parsed) continue;
          for (let i = 0; i < parsed.pairs.length; i++) {
            const [onum, ooff] = parsed.pairs[i];
            if (this.scanned.has(onum) || this.scanExtra.has(onum)) continue;
            const lx = new Lexer(parsed.data, parsed.first + ooff);
            const v = lx.next();
            this.scanExtra.set(onum, v === undefined || v instanceof Op ? null : v);
          }
        } catch (e) { /* one bad object stream should not sink the file */ }
      }
    }

    async findTrailerByScan() {
      // Any object with /Type /Catalog will do as a root.
      await this.ensureScan(true);
      const nums = Array.from(new Set([...this.scanned.keys(), ...this.scanExtra.keys()])).sort((a, b) => a - b);
      for (const n of nums) {
        let v = null;
        try { v = await this.get(n); } catch (e) { continue; }
        if (v instanceof Dict) {
          const t = v.get('Type');
          if (t instanceof Name && t.name === 'Catalog') {
            const d = new Dict();
            d.set('Root', new Ref(n, 0));
            return d;
          }
        }
      }
      return null;
    }

    async loadObjStm(num, stream) {
      if (this.objstm.has(num)) return this.objstm.get(num);
      let entry = null;
      const st = stream || await this.get(num);
      if (st instanceof PStream) {
        const data = await this.getStreamData(st);
        const n = await this.resolve(st.dict.get('N'));
        const first = await this.resolve(st.dict.get('First'));
        if (typeof n === 'number' && typeof first === 'number') {
          const lx = new Lexer(data, 0);
          const pairs = [];
          for (let i = 0; i < n; i++) {
            const a = lx.next(), b = lx.next();
            if (typeof a !== 'number' || typeof b !== 'number') break;
            pairs.push([a, b]);
          }
          entry = { data, first, pairs };
        }
      }
      this.objstm.set(num, entry);
      return entry;
    }

    async get(num) {
      if (this.cache.has(num)) return this.cache.get(num);
      this.cache.set(num, null);            // cycle guard
      let val = null;
      const e = this.xref.get(num);
      try {
        if (e && e.type === 1) {
          let o = await this.parseIndirectAt(e.offset, num);
          if (!o && this.headerShift) o = await this.parseIndirectAt(e.offset + this.headerShift, num);
          if (o) val = o.value;
        } else if (e && e.type === 2) {
          const st = await this.loadObjStm(e.stm, null);
          if (st) {
            let pair = st.pairs[e.idx];
            if (!pair || pair[0] !== num) pair = st.pairs.find(p => p[0] === num);
            if (pair) {
              const lx = new Lexer(st.data, st.first + pair[1]);
              const v = lx.next();
              val = (v === undefined || v instanceof Op) ? null : v;
            }
          }
        }
      } catch (err) { val = null; }
      if (val === null || val === undefined) {
        // Fall back to the brute-force scan for this object.
        try {
          await this.ensureScan(false);
          const off = this.scanned.get(num);
          if (off != null) {
            const o = await this.parseIndirectAt(off, num);
            if (o) val = o.value;
          }
          if ((val === null || val === undefined) && this.scanExtra.has(num)) val = this.scanExtra.get(num);
        } catch (err) { /* leave null */ }
      }
      if (val === undefined) val = null;
      this.cache.set(num, val);
      return val;
    }

    async resolve(v) {
      let n = 0;
      while (v instanceof Ref && n++ < 32) v = await this.get(v.num);
      return v;
    }

    async num(v, dflt) {
      const r = await this.resolve(v);
      return typeof r === 'number' ? r : dflt;
    }

    /* Decodes one stream, once, inside two budgets: each filter carries the
       per-stream ceiling itself (see the filters section) and the running
       total is checked here. Anything that trips either throws a
       teacher-facing Error; every caller of this either has a try/catch that
       turns that into a skipped page or a note, or is high enough up to show
       it to the teacher, so nothing leaks a raw internal failure. */
    async getStreamData(st) {
      if (this.streamCache.has(st)) {
        const hit = this.streamCache.get(st);
        // A REFUSAL IS CACHED TOO. Pages are allowed to share a content
        // stream, and if the shared one is a 400 MB bomb then every page asks
        // for it again: decoding the first 48 MB and then refusing, two
        // hundred times over, is eight seconds of frozen tab for a file we had
        // already correctly said no to on page one.
        if (hit instanceof Error) throw hit;
        return hit;
      }
      try {
        return await this.decodeStream(st);
      } catch (e) {
        this.streamCache.set(st, e instanceof Error ? e : new Error(String(e)));
        throw e;
      }
    }

    async decodeStream(st) {
      const spend = (n) => {
        this.decodedTotal += n;
        if (this.decodedTotal > MAX_TOTAL_BYTES) throw streamTooBig();
      };
      let data = st.raw();
      const d = st.dict;
      let filters = await this.resolve(d.get('Filter'));
      if (filters instanceof Name) filters = [filters];
      if (Array.isArray(filters) && filters.length) {
        let parms = await this.resolve(d.has('DecodeParms') ? d.get('DecodeParms') : d.get('DP'));
        if (!Array.isArray(parms)) parms = [parms];
        for (let i = 0; i < filters.length; i++) {
          const f = await this.resolve(filters[i]);
          const nm = (f instanceof Name) ? f.name : '';
          const pd = await this.resolve(parms[i]);
          const p = {};
          if (pd instanceof Dict) {
            p.Predictor = await this.num(pd.get('Predictor'), 1);
            p.Colors = await this.num(pd.get('Colors'), 1);
            p.BitsPerComponent = await this.num(pd.get('BitsPerComponent'), 8);
            p.Columns = await this.num(pd.get('Columns'), 1);
            p.EarlyChange = await this.num(pd.get('EarlyChange'), 1);
          }
          switch (nm) {
            case 'FlateDecode': case 'Fl':
              data = toU8(await this.inflate(data, MAX_STREAM_BYTES));
              if (data.length > MAX_STREAM_BYTES) throw streamTooBig();
              if (p.Predictor > 1) data = applyPredictor(data, p);
              break;
            case 'LZWDecode': case 'LZW':
              data = lzwDecode(data, p.EarlyChange);
              if (p.Predictor > 1) data = applyPredictor(data, p);
              break;
            case 'ASCIIHexDecode': case 'AHx': data = asciiHexDecode(data); break;
            case 'ASCII85Decode': case 'A85': data = ascii85Decode(data); break;
            case 'RunLengthDecode': case 'RL': data = runLengthDecode(data); break;
            case 'Crypt': break;
            default:
              // DCTDecode / JPXDecode / CCITTFaxDecode / JBIG2Decode: image data.
              // Never valid for a content stream; hand back nothing.
              data = new Uint8Array(0);
              break;
          }
          // Charged per FILTER, not per stream: a chain like
          // [/FlateDecode /RunLengthDecode] is two expansions, and the first
          // one is real work whatever the second does with it.
          spend(data.length);
        }
      }
      this.streamCache.set(st, data);
      return data;
    }

    // resources -> /Font (or /XObject) -> name, all resolved
    async resource(resources, category, name) {
      const res = await this.resolve(resources);
      if (!(res instanceof Dict)) return null;
      const cat = await this.resolve(res.get(category));
      if (!(cat instanceof Dict)) return null;
      return this.resolve(cat.get(name));
    }
  }

  /* ------------------------------------------------------------ page tree */

  /* How many pages we will even look at. Nothing a class reads is anywhere
     near this; it is here so a malformed or circular page tree terminates.
     `pages.capped` records that we stopped counting rather than ran out, so
     the note can say "more than 4000" instead of inventing a total. */
  const PAGE_CAP = 4000;

  async function collectPages(doc) {
    const pages = [];
    pages.capped = false;
    const seen = new Set();
    const root = await doc.resolve(doc.trailer ? doc.trailer.get('Root') : null);
    const pagesNode = (root instanceof Dict) ? await doc.resolve(root.get('Pages')) : null;

    async function walk(node, inherited, depth) {
      if (!(node instanceof Dict) || depth > 64) return;
      if (pages.length >= PAGE_CAP) { pages.capped = true; return; }
      if (seen.has(node)) return;
      seen.add(node);
      const inh = Object.assign({}, inherited);
      for (const k of ['Resources', 'MediaBox', 'Rotate']) {
        if (node.has(k)) inh[k] = node.get(k);
      }
      const type = await doc.resolve(node.get('Type'));
      const isPage = (type instanceof Name) && type.name === 'Page';
      const kids = isPage ? null : await doc.resolve(node.get('Kids'));
      if (Array.isArray(kids) && kids.length) {
        for (const k of kids) await walk(await doc.resolve(k), inh, depth + 1);
      } else if (isPage || node.has('Contents')) {
        pages.push({ dict: node, inh });
      }
    }

    if (pagesNode) await walk(pagesNode, {}, 0);

    if (!pages.length) {
      // Fallback: every object that says it is a page, in object-number order.
      await doc.ensureScan(true);
      const nums = Array.from(new Set([...doc.xref.keys(), ...doc.scanned.keys(), ...doc.scanExtra.keys()]))
        .sort((a, b) => a - b);
      for (const n of nums) {
        let v = null;
        try { v = await doc.get(n); } catch (e) { continue; }
        if (v instanceof Dict) {
          const t = v.get('Type');
          if (t instanceof Name && t.name === 'Page') pages.push({ dict: v, inh: {} });
        }
        if (pages.length >= PAGE_CAP) { pages.capped = true; break; }
      }
    }
    return pages;
  }

  /* ----------------------------------------------------------------- fonts */

  const FALLBACK_FONT = {
    composite: false, bytes: 1, enc: WIN_ANSI, toUni: null, widths: null, first: 0,
    missing: 500, dw: 500, cidW: null, subtype: '', name: '(none)', identityNoMap: false
  };

  function fontDecode(f, bytes) {
    const out = [];
    if (bytes.length > MAX_GLYPHS) bytes = bytes.subarray(0, MAX_GLYPHS);
    if (f.composite) {
      const step = f.bytes || 2;
      for (let i = 0; i + step <= bytes.length; i += step) {
        let code = 0;
        for (let k = 0; k < step; k++) code = (code << 8) | bytes[i + k];
        let s = f.toUni ? f.toUni.map.get(code) : undefined;
        if (s === undefined && f.cmapText) s = f.cmapText.map.get(code);
        const w = (f.cidW && f.cidW.has(code)) ? f.cidW.get(code) : f.dw;
        out.push({ code, str: s === undefined ? '' : s, w, spaceByte: false });
      }
      return out;
    }
    for (let i = 0; i < bytes.length; i++) {
      const code = bytes[i];
      let s;
      if (f.toUni) s = f.toUni.map.get(code);
      if (s === undefined && f.enc) s = f.enc[code];
      if (s === undefined || s === null) s = '';
      let w;
      if (f.widths && code >= f.first && code - f.first < f.widths.length) w = f.widths[code - f.first];
      if (typeof w !== 'number' || !isFinite(w)) w = (typeof f.missing === 'number') ? f.missing : 500;
      out.push({ code, str: s, w, spaceByte: code === 32 });
    }
    return out;
  }

  async function parseCIDWidths(doc, W) {
    const map = new Map();
    if (!Array.isArray(W)) return map;
    let i = 0;
    while (i < W.length) {
      const a = await doc.resolve(W[i]);
      if (typeof a !== 'number') { i++; continue; }
      const nxt = await doc.resolve(W[i + 1]);
      if (Array.isArray(nxt)) {
        for (let k = 0; k < nxt.length; k++) {
          const v = await doc.resolve(nxt[k]);
          if (typeof v === 'number') map.set(a + k, v);
        }
        i += 2;
      } else if (typeof nxt === 'number') {
        const w = await doc.resolve(W[i + 2]);
        if (typeof w === 'number' && nxt >= a && nxt - a < 70000) {
          for (let c = a; c <= nxt; c++) map.set(c, w);
        }
        i += 3;
      } else i += 2;
    }
    return map;
  }

  async function buildFont(doc, dict) {
    const f = {
      composite: false, bytes: 1, enc: null, toUni: null, cmapText: null, widths: null,
      first: 0, missing: undefined, dw: 500, cidW: null, subtype: '', name: '', identityNoMap: false
    };
    const st = await doc.resolve(dict.get('Subtype'));
    f.subtype = (st instanceof Name) ? st.name : '';
    const bf = await doc.resolve(dict.get('BaseFont'));
    f.name = (bf instanceof Name) ? bf.name : '';

    const tu = await doc.resolve(dict.get('ToUnicode'));
    if (tu instanceof PStream) {
      try { f.toUni = parseCMap(await doc.getStreamData(tu), doc.cmapBudget); } catch (e) { f.toUni = null; }
    }
    if (f.toUni && f.toUni.map.size === 0) f.toUni = null;

    if (f.subtype === 'Type0') {
      f.composite = true;
      f.bytes = 2;
      f.dw = 1000;
      const enc = await doc.resolve(dict.get('Encoding'));
      if (enc instanceof PStream) {
        try {
          f.cmapText = parseCMap(await doc.getStreamData(enc), doc.cmapBudget);
          if (f.cmapText.byteLens.size === 1 && f.cmapText.byteLens.has(1)) f.bytes = 1;
        } catch (e) { /* assume Identity-H shape */ }
      }
      if (f.toUni && f.toUni.byteLens.size === 1 && f.toUni.byteLens.has(1)) f.bytes = 1;
      const dfs = await doc.resolve(dict.get('DescendantFonts'));
      const df = Array.isArray(dfs) ? await doc.resolve(dfs[0]) : null;
      if (df instanceof Dict) {
        const dw = await doc.resolve(df.get('DW'));
        if (typeof dw === 'number') f.dw = dw;
        f.cidW = await parseCIDWidths(doc, await doc.resolve(df.get('W')));
      }
      // An Identity-H subset with no /ToUnicode carries glyph ids, not text.
      f.identityNoMap = !f.toUni && !f.cmapText;
      return f;
    }

    // Simple font
    f.bytes = 1;
    const fc = await doc.resolve(dict.get('FirstChar'));
    f.first = typeof fc === 'number' ? fc : 0;
    const w = await doc.resolve(dict.get('Widths'));
    if (Array.isArray(w)) {
      f.widths = [];
      for (const x of w) {
        const v = await doc.resolve(x);
        f.widths.push(typeof v === 'number' ? v : 0);
      }
    }
    let flags = 0;
    const fd = await doc.resolve(dict.get('FontDescriptor'));
    if (fd instanceof Dict) {
      const mw = await doc.resolve(fd.get('MissingWidth'));
      if (typeof mw === 'number') f.missing = mw;
      const fl = await doc.resolve(fd.get('Flags'));
      if (typeof fl === 'number') flags = fl;
    }

    // Base encoding, then /Differences on top.
    let base = STANDARD;
    const symbolic = !!(flags & 4) && !(flags & 32);
    if (symbolic) base = WIN_ANSI;              // best available guess for a symbolic subset
    const enc = await doc.resolve(dict.get('Encoding'));
    let diffs = null;
    if (enc instanceof Name) {
      if (enc.name === 'WinAnsiEncoding') base = WIN_ANSI;
      else if (enc.name === 'MacRomanEncoding') base = MAC_ROMAN;
      else if (enc.name === 'StandardEncoding' || enc.name === 'MacExpertEncoding') base = STANDARD;
    } else if (enc instanceof Dict) {
      const be = await doc.resolve(enc.get('BaseEncoding'));
      if (be instanceof Name) {
        if (be.name === 'WinAnsiEncoding') base = WIN_ANSI;
        else if (be.name === 'MacRomanEncoding') base = MAC_ROMAN;
        else base = STANDARD;
      }
      diffs = await doc.resolve(enc.get('Differences'));
    }
    const table = base.slice();
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const it0 of diffs) {
        const it = await doc.resolve(it0);
        if (typeof it === 'number') code = it | 0;
        else if (it instanceof Name) {
          if (code >= 0 && code < 256) table[code] = glyphNameToUnicode(it.name);
          code++;
        }
      }
    }
    f.enc = table;
    return f;
  }

  /* -------------------------------------------------------------- matrices */

  const IDENT = [1, 0, 0, 1, 0, 0];

  function mul(m, n) {
    return [
      m[0] * n[0] + m[1] * n[2],
      m[0] * n[1] + m[1] * n[3],
      m[2] * n[0] + m[3] * n[2],
      m[2] * n[1] + m[3] * n[3],
      m[4] * n[0] + m[5] * n[2] + n[4],
      m[4] * n[1] + m[5] * n[3] + n[5]
    ];
  }

  /* Where a fragment sits, measured along its own baseline rather than along
     the page. For upright text (m = [1,0,0,1,…], which is almost everything)
     `along` and `across` are exactly x and y. For rotated text — a landscape
     header, a label up the side of a table — they are distance along the
     baseline and distance across it, which is what "same line" and "further
     right" actually mean. Without this, three lines of rotated text share one
     page-y and weld into a single line. */
  function project(m) {
    const norm = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
    if (!(norm > 1e-9)) return { along: m[4], across: m[5] };
    return {
      along: (m[0] * m[4] + m[1] * m[5]) / norm,
      across: (m[0] * m[5] - m[1] * m[4]) / norm,
    };
  }

  /* ------------------------------------------------------- content renderer */

  // A TJ adjustment more negative than this is treated as a word gap.
  // Kerning pairs are typically -10..-60; a space is 250-330 thousandths.
  const TJ_SPACE = -150;
  // Gap between two separately positioned runs, as a fraction of font size,
  // beyond which we insert a space.
  const GAP_SPACE = 0.18;

  class Renderer {
    constructor(doc) {
      this.doc = doc;
      this.items = [];
      this.fontCache = new Map();
      this.showOps = 0;
      this.mapped = 0;
      this.dropped = 0;
      this.images = 0;
      this.formDepthGuard = new Set();
      /* Content-stream bytes left to walk, for the WHOLE document — see
         MAX_CONTENT_BYTES. This has to be cumulative and it has to live here
         rather than per page, because pages are allowed to share a content
         stream: 429 KB of PDF can be two hundred pages all pointing at one
         big stream, which decodes once (so the decode budget never sees it)
         and is then walked two hundred times. Over two minutes, measured.
         The per-stream operator guard misses it too, because a stream of
         nothing but whitespace is consumed inside Lexer.skip() without ever
         producing a token to count. Bytes are the only honest unit. */
      this.contentLeft = MAX_CONTENT_BYTES;
      this.contentCapped = false;
    }

    async fontFor(resources, name) {
      const d = await this.doc.resource(resources, 'Font', name);
      if (!(d instanceof Dict)) return FALLBACK_FONT;
      if (this.fontCache.has(d)) return this.fontCache.get(d);
      let f;
      try { f = await buildFont(this.doc, d); } catch (e) { f = FALLBACK_FONT; }
      this.fontCache.set(d, f);
      return f;
    }

    show(gs, ts, pieces) {
      this.showOps++;
      const font = gs.font || FALLBACK_FONT;
      const base = [gs.fs * gs.th, 0, 0, gs.fs, 0, gs.ts];
      const trm0 = mul(base, mul(ts.tm, gs.ctm));
      // x/y are baseline coordinates, not page coordinates — see project().
      const p0 = project(trm0);
      /* WHERE THE LINE IS, as opposed to where the glyphs are. Text rise (Ts)
         is the sixth element of `base`, so a superscript's y is its line's y
         plus the rise, and every downstream decision — which row it belongs
         to, what order the rows come out in — then treats "21st" as two
         lines. `yb` is the same point with the rise taken back out, i.e. the
         baseline of the line the run is sitting on. assembleLines decides
         which of the two to believe; see the fold rule there.

         Computed only when Ts is non-zero, which on an ordinary page is never,
         so this costs one comparison per show operator in the common case. */
      let yb = p0.across;
      if (gs.ts) yb = project(mul([gs.fs * gs.th, 0, 0, gs.fs, 0, 0], mul(ts.tm, gs.ctm))).across;
      const size = Math.hypot(trm0[2], trm0[3]) || Math.abs(gs.fs) || 12;
      let text = '';
      let sawBytes = false;
      for (const pc of pieces) {
        if (pc.adj !== undefined) {
          const tx = (-pc.adj / 1000) * gs.fs * gs.th;
          ts.tm = mul([1, 0, 0, 1, tx, 0], ts.tm);
          if (pc.adj <= TJ_SPACE && text && !/\s$/.test(text)) text += ' ';
          continue;
        }
        const bytes = pc.bytes;
        if (bytes.length) sawBytes = true;
        const glyphs = fontDecode(font, bytes);
        let tx = 0;
        for (const g of glyphs) {
          if (g.str) { text += g.str; this.mapped++; } else { this.dropped++; }
          tx += (g.w / 1000 * gs.fs + gs.tc + (g.spaceByte ? gs.tw : 0)) * gs.th;
        }
        ts.tm = mul([1, 0, 0, 1, tx, 0], ts.tm);
      }
      if (!sawBytes) return;
      const trm1 = mul(base, mul(ts.tm, gs.ctm));
      /* One fragment per positioned run, and a dense A4 page of text has
         between a few hundred and a couple of thousand. MAX_ITEMS is a hundred
         times that: past it the page is not a page, it is 35 KB of PDF holding
         two million Tj operators, and assembleLines would then sort and copy
         the lot. The positions still advance above, so what is dropped is the
         text of a page that could never have been read out loud anyway. */
      if (text.length && this.items.length < MAX_ITEMS) {
        this.items.push({ x: p0.along, y: p0.across, yb, x2: project(trm1).along, size, text });
      }
    }

    async exec(data, resources, ctm, depth) {
      // Charged before the walk, never after: the first page is always read in
      // full (that is where the model text is), and it is the page after the
      // budget runs out that is refused. Form XObjects are charged the same
      // way, so a page that recurses into forms cannot walk past it either.
      if (this.contentLeft <= 0) { this.contentCapped = true; return; }
      this.contentLeft -= data.length;
      const lx = new Lexer(data, 0);
      let gs = { ctm: ctm.slice(), font: null, fs: 0, tc: 0, tw: 0, th: 1, tl: 0, ts: 0 };
      const stack = [];
      let qOverflow = 0;
      const tstate = { tm: null, tlm: null };
      let ops = [];
      let guard = 0;

      const nAt = (i) => { const v = ops[ops.length - i]; return typeof v === 'number' ? v : 0; };
      const nextLine = (tx, ty) => {
        if (!tstate.tlm) { tstate.tlm = IDENT.slice(); }
        tstate.tlm = mul([1, 0, 0, 1, tx, ty], tstate.tlm);
        tstate.tm = tstate.tlm.slice();
      };
      const ensureText = () => { if (!tstate.tm) { tstate.tlm = IDENT.slice(); tstate.tm = IDENT.slice(); } };

      for (;;) {
        if (++guard > 12000000) break;
        const t = lx.next();
        if (t === undefined) break;
        if (!(t instanceof Op)) {
          if (ops.length < 64) ops.push(t);
          continue;
        }
        const op = t.op;
        switch (op) {
          // Nesting deeper than 128 is not something a real producer emits, so
          // beyond that we stop saving and just count. Two reasons that beats
          // the old stack.shift(): shift() is a memmove of the whole stack on
          // every q past the cap, which a content stream of nothing but "q"
          // turns into a quadratic; and dropping the OLDEST state meant every
          // later Q restored the wrong one, where counting keeps the first 128
          // levels correctly paired.
          case 'q':
            if (stack.length < 128) stack.push(Object.assign({}, gs, { ctm: gs.ctm.slice() }));
            else qOverflow++;
            break;
          case 'Q':
            if (qOverflow > 0) qOverflow--;
            else { const s = stack.pop(); if (s) gs = s; }
            break;
          case 'cm':
            if (ops.length >= 6) {
              const m = [nAt(6), nAt(5), nAt(4), nAt(3), nAt(2), nAt(1)];
              gs.ctm = mul(m, gs.ctm);
            }
            break;
          case 'BT': tstate.tm = IDENT.slice(); tstate.tlm = IDENT.slice(); break;
          case 'ET': tstate.tm = null; tstate.tlm = null; break;
          case 'Tf': {
            const nm = ops[ops.length - 2];
            gs.fs = nAt(1);
            gs.font = (nm instanceof Name) ? await this.fontFor(resources, nm.name) : FALLBACK_FONT;
            break;
          }
          case 'Td': ensureText(); nextLine(nAt(2), nAt(1)); break;
          case 'TD': ensureText(); gs.tl = -nAt(1); nextLine(nAt(2), nAt(1)); break;
          case 'Tm':
            if (ops.length >= 6) {
              tstate.tlm = [nAt(6), nAt(5), nAt(4), nAt(3), nAt(2), nAt(1)];
              tstate.tm = tstate.tlm.slice();
            }
            break;
          case 'T*': ensureText(); nextLine(0, -gs.tl); break;
          case 'TL': gs.tl = nAt(1); break;
          case 'Tc': gs.tc = nAt(1); break;
          case 'Tw': gs.tw = nAt(1); break;
          case 'Tz': gs.th = (nAt(1) || 100) / 100; break;
          case 'Ts': gs.ts = nAt(1); break;
          case 'Tr': break;   // render mode: invisible text (mode 3) is kept on
                              // purpose — that is the OCR layer of a scanned PDF.
          case 'Tj': {
            const s = ops[ops.length - 1];
            if (s instanceof PStr) { ensureText(); this.show(gs, tstate, [{ bytes: s.bytes }]); }
            break;
          }
          case "'": {
            const s = ops[ops.length - 1];
            ensureText(); nextLine(0, -gs.tl);
            if (s instanceof PStr) this.show(gs, tstate, [{ bytes: s.bytes }]);
            break;
          }
          case '"': {
            const s = ops[ops.length - 1];
            gs.tw = nAt(3); gs.tc = nAt(2);
            ensureText(); nextLine(0, -gs.tl);
            if (s instanceof PStr) this.show(gs, tstate, [{ bytes: s.bytes }]);
            break;
          }
          case 'TJ': {
            const a = ops[ops.length - 1];
            if (Array.isArray(a)) {
              ensureText();
              const pieces = [];
              for (const el of a) {
                if (el instanceof PStr) pieces.push({ bytes: el.bytes });
                else if (typeof el === 'number') pieces.push({ adj: el });
              }
              if (pieces.length) this.show(gs, tstate, pieces);
            }
            break;
          }
          case 'Do': {
            const nm = ops[ops.length - 1];
            if (nm instanceof Name && depth < 8) {
              let xo = null;
              try { xo = await this.doc.resource(resources, 'XObject', nm.name); } catch (e) { xo = null; }
              if (xo instanceof PStream) {
                const sub = await this.doc.resolve(xo.dict.get('Subtype'));
                const sn = (sub instanceof Name) ? sub.name : '';
                if (sn === 'Form' && !this.formDepthGuard.has(xo)) {
                  this.formDepthGuard.add(xo);
                  try {
                    const mtx = await this.doc.resolve(xo.dict.get('Matrix'));
                    let ctm2 = gs.ctm;
                    if (Array.isArray(mtx) && mtx.length === 6) ctm2 = mul(mtx.map(v => (typeof v === 'number' ? v : 0)), gs.ctm);
                    const res2 = (await this.doc.resolve(xo.dict.get('Resources'))) || resources;
                    const bytes = await this.doc.getStreamData(xo);
                    await this.exec(bytes, res2, ctm2, depth + 1);
                  } catch (e) { /* skip a broken form */ }
                  this.formDepthGuard.delete(xo);
                } else if (sn === 'Image') this.images++;
              }
            }
            break;
          }
          case 'BI': {
            // Inline image. The binary payload sits between ID and EI and can
            // contain anything at all — including "(" and "Tj" — so it must be
            // skipped as bytes, never lexed. Walk the little dict token by token
            // rather than searching for "ID", so a value like /Indexed can't be
            // mistaken for the operator.
            let sawID = false;
            for (let k = 0; k < 64; k++) {
              const tk = lx.next();
              if (tk === undefined) break;
              if (tk instanceof Op && tk.op === 'ID') { sawID = true; break; }
            }
            let q = sawID ? lx.p + 1 : lx.p;   // exactly one whitespace after ID
            for (;;) {
              const e = indexOfStr(data, 'EI', q);
              if (e < 0) { q = data.length; break; }
              const before = data[e - 1], after = data[e + 2];
              if (WS[before] && (after === undefined || WS[after] || DELIM[after])) { q = e + 2; break; }
              q = e + 2;
            }
            lx.p = q;
            this.images++;
            break;
          }
          default: break;
        }
        ops = [];
      }
    }
  }

  /* --------------------------------------------------- items -> text lines */

  /* ------------------------------------------------- how far apart two lines are

     Everything in this section is answering one question: which of the
     vertical gaps on this page are the teacher's paragraph and stanza breaks,
     and which are just the leading of the type? Get it wrong one way and a
     poem arrives as one welded block; get it wrong the other and a blank line
     lands in the middle of a sentence.

     THE HISTORY MATTERS, because the two failures pull in opposite directions
     and each of the obvious answers fixes one by causing the other.

       • The MEDIAN of the drops is poisoned the moment blank lines make up
         half the gaps, which is not exotic — it is a title over couplets, i.e.
         an ordinary poem. "The Wind": drops [32, 16, 32, 16], median 24, and
         32 > 1.55 × 24 is false, so every stanza gap disappears.
       • The LOW QUARTILE was grafted in to fix that, and it does. But it is
         still an order statistic over a mixed population, so ANY block set
         tighter than the body drags it down: a 7pt worksheet header, a
         caption, a footnote. Measured on a real worksheet, drops
         [6.75, 7.5, 6.75, 21, 29.25, 30, 30, 15.75] give a pitch of 6.75 and a
         threshold of 10.46, so every single body gap cleared it and a blank
         line landed between every line of the model text AND inside every
         wrapped sentence.

     So neither order statistic can work: the drops are not one population,
     they are two or three blocks of type with a handful of real gaps mixed in,
     and the answer wanted is the leading of the BODY block. Two things
     together get there, and each one covers a case the other misses.

       1. CLUSTER the drops and take the leading there is most of, not the
          leading at some percentile. Clustering is what separates the 7pt
          header's 6.75 from the body's 30 instead of averaging across them.
          Among clusters, a smaller one is preferred when it EXPLAINS the
          bigger ones as whole multiples of itself — because that is exactly
          what a stanza gap is (16 and 32 = 2 × 16, the poem), and it is
          exactly what a different block's leading is not (6.75 and 30, which
          is 4.44 × 6.75 and therefore two unrelated blocks).

       2. Compare each gap against its NEIGHBOURS as well. A blank line is
          something you can see because the lines either side of it are
          closer; a page-wide statistic cannot see that, and this is what
          saves a page where the tight block is long enough to win the vote
          outright. The neighbour floor can only ever RAISE the threshold, so
          it can add no blank line of its own — it can only refuse one. */

  // Kept for the pages too small to have a modal leading at all: with three or
  // four rows there is no cluster to find, and this is the behaviour those
  // pages already had.
  function lowQuartile(a) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.floor(0.25 * (s.length - 1))];
  }

  /* Drops that are within a fifth of each other are the same leading: the same
     block of type measured twice, differing only by rounding and by whether a
     descender pushed a baseline. A cluster is named by its SMALLEST member,
     which is the leading itself rather than the leading plus an accident. */
  function clusterDrops(drops) {
    const s = drops.slice().sort((a, b) => a - b);
    const out = [];
    for (const d of s) {
      const last = out.length ? out[out.length - 1] : null;
      if (last && d <= last.v * 1.2 + 0.25) { last.n++; last.sum += d; }
      else out.push({ v: d, n: 1, sum: d });
    }
    return out;
  }

  /* Is every repeated leading on this page a PARAGRAPH GAP in type set at v?
     That is what makes v the pitch of the page: everything else measured on it
     is either the same leading again or a break in it.

     The band is 0.82 to 2.6 and it is measured, not reasoned:

       • BELOW v there is nothing to explain — a repeated leading tighter than
         the candidate is a different block of type, and the candidate is
         refused on the spot. 0.82 is rounding slack, not a real range.
       • A blank line is exactly 2 × the leading, which is what a poem's stanza
         gap is made of.
       • But a paragraph gap is very often NOT a whole multiple, and that is
         the case an integer test gets wrong. Word's "space after" adds 8 or
         10 points to the leading rather than a whole line: measured on real
         output, 14pt lines with a 25pt gap, i.e. 1.79. Requiring a round
         number threw that page's paragraph breaks away.
       • 3.2 is where it stops, set just above the largest gap that really is
         a gap. Measured: the biggest paragraph break in the corpus is 3.0 —
         two blank lines, which is what a WAGOLL puts between its instructions
         and its double-spaced model text — and the smallest ratio between a
         tight block's leading and the body sitting under it is 3.96, a 7pt
         worksheet header over that same model text. Past 3.2 it is two blocks
         of type, not one with a gap in it. The bias is deliberately to the low
         side: guessing high loses a paragraph break, guessing low puts a blank
         line inside a sentence.

     Clusters of one are not asked to fit. A single odd gap on a page is a
     heading or a figure or the top of the page, and the pitch does not have to
     account for it. */
  const GAP_MAX = 3.2;

  function explainsGaps(v, clusters) {
    if (!(v > 0)) return false;
    for (const c of clusters) {
      if (c.n < 2) continue;
      const k = c.v / v;
      if (k < 0.82 || k > GAP_MAX) return false;
    }
    return true;
  }

  function choosePitch(drops) {
    if (!drops.length) return 0;
    const cl = clusterDrops(drops);
    // The smallest repeated leading that accounts for every other repeated
    // leading. On the poem this is the couplet pitch and the stanza gaps are
    // its multiples; on a two-block page nothing qualifies and we fall through.
    for (const c of cl) if (c.n >= 2 && explainsGaps(c.v, cl)) return c.v;
    /* Otherwise the leading that governs most of the PAGE, measured as the
       total height the cluster accounts for and not as a count of gaps. The
       count is the wrong unit and it is wrong in the direction that hurts: ten
       lines of 7pt small print are ten votes and 61 points of paper, four
       lines of double-spaced body are three votes and 90 points, and it is the
       body the class is going to read. On a tie, the LOOSER leading, because
       guessing tight puts a blank line inside a sentence and guessing loose
       only loses a paragraph break — the mistake a teacher can live with. */
    let best = null;
    for (const c of cl) {
      if (c.n < 2) continue;
      if (!best || c.sum > best.sum || (c.sum === best.sum && c.v > best.v)) best = c;
    }
    if (best) return best.v;
    return lowQuartile(drops);   // no leading repeats: too few rows to cluster
  }

  /* How far off the baseline a run can be and still be part of its line, as a
     fraction of the size of the line it sits on. Word raises a superscript by
     33% of the body size, a browser by around 39%, and a sweep of real
     generator output tops out at 50%; a producer using Ts to put something on
     a line of its OWN moves it by a whole line, which is 115% and up. 60% is
     the empty space between the two, with the near edge of it measured rather
     than guessed. */
  const RISE_FOLD = 0.6;

  /* The same defect arrives in two shapes and needs both of these.

     Chrome's print-to-PDF — which is how a teacher turns a web page or a
     Google Doc into a model text — does NOT use Ts for a superscript. It ends
     the text object and starts a new one with a different Tm, so there is no
     rise to undo and nothing but the geometry says the fragment belongs to the
     line below it. Measured on a real Chrome file: body 14pt at one baseline,
     the "st" of "21st" 11.7pt at a baseline 5.4 points higher. Row grouping
     tolerates 0.35 of a line, so 5.4 loses by half a point and the class gets
     a line reading "st" above a line reading "On Monday 21 March".

     A fragment rejoins the line below (or above, for a subscript) when all
     four of these hold. Any one of them alone would be reckless; together they
     describe something that cannot be a line of its own:
       • its baseline is nearer than 60% of a line — closer than two lines of
         type can be set without the letters colliding;
       • it is set smaller than that line;
       • there is little enough of it to be a marker and not a sentence;
       • and that line has text BOTH SIDES of it horizontally, so a heading, a
         margin note and the next column are all excluded by construction. */
  const SUPER_GAP = 0.6;
  const SUPER_SIZE = 0.92;
  const SUPER_RUN = 8;

  function absorbRaisedRuns(rows) {
    if (rows.length < 2) return rows;
    // One pass for the row measurements, so the test below is O(1) per
    // fragment: a hostile page is two hundred thousand of them.
    const meta = rows.map(r => {
      let minX2 = Infinity, maxX = -Infinity, chars = 0;
      for (const it of r.items) {
        if (it.x2 < minX2) minX2 = it.x2;
        if (it.x > maxX) maxX = it.x;
        chars += it.text.length;
      }
      return { size: lineSizeOf(r), minX2, maxX, chars };
    });
    let moved = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.items.length || meta[i].chars > SUPER_RUN) continue;
      // The line it might belong to is one of its two neighbours, nearest first.
      const cand = [];
      if (i + 1 < rows.length) cand.push(i + 1);
      if (i > 0) cand.push(i - 1);
      if (cand.length === 2 && Math.abs(rows[cand[1]].y - r.y) < Math.abs(rows[cand[0]].y - r.y)) {
        cand.reverse();
      }
      for (const j of cand) {
        const b = rows[j], m = meta[j];
        if (!b.items.length) continue;
        const d = Math.abs(r.y - b.y);
        if (!(d > 0) || d >= SUPER_GAP * m.size) continue;
        const tol = 0.35 * m.size;
        const keep = [];
        for (const it of r.items) {
          if (it.size < SUPER_SIZE * m.size && m.minX2 <= it.x + tol && m.maxX >= it.x2 - tol) {
            b.items.push(it);
            if (it.x2 < m.minX2) m.minX2 = it.x2;
            if (it.x > m.maxX) m.maxX = it.x;
            m.chars += it.text.length;
            moved = true;
          } else keep.push(it);
        }
        r.items = keep;
        if (!keep.length) break;
      }
    }
    return moved ? rows.filter(r => r.items.length) : rows;
  }

  // The size of the type on a row: the size of the run with the most
  // characters in it, so a two-character superscript cannot outvote the line.
  function lineSizeOf(row) {
    let best = row.size, most = -1;
    for (const it of row.items) {
      if (it.text.length > most) { most = it.text.length; best = it.size; }
    }
    return best || row.size || 12;
  }

  /* One page's fragments become one page's ROWS: a row per line of type, in
     the order it sits on the paper, each carrying the text of the line and
     where on the page it was.

     This is deliberately separate from turning rows into lines of text. Two
     later passes — the running-header strip and the two-column check — are
     about WHERE things are on the page, and they have to run across all the
     pages at once, after every page has been laid out and before any of it
     becomes a string. Once a row is a string its position is gone. */
  function layoutRows(items) {
    if (!items.length) return [];
    /* Grouped on `yb`, the baseline of the line the run belongs to, NOT on the
       y its glyphs were drawn at — see Renderer.show(). A superscript is drawn
       above its line, and grouping on where it was drawn gives it a row of its
       own; because rows come out in descending y, that row is then emitted
       ABOVE the line it belongs to, and the hole it leaves behind is wide
       enough for the gap rule to insert a space. "On Monday 21st March"
       arrives as a line reading "st" followed by "On Monday 21 March", and
       "100°C" as a line reading "o" followed by "The water boiled at 100 C".
       Ordinal dates, degrees, m², footnote markers: all of them, every time. */
    const sorted = items.slice().sort((a, b) => (b.yb - a.yb) || (a.x - b.x));
    const grouped = [];
    let cur = null;
    for (const it of sorted) {
      const tol = Math.max(1, 0.35 * Math.max(cur ? cur.size : it.size, it.size));
      if (cur && Math.abs(it.yb - cur.y) <= tol) cur.items.push(it);
      else { cur = { y: it.yb, size: it.size, items: [it] }; grouped.push(cur); }
    }

    /* Folding by baseline is right for a superscript and wrong for a producer
       that uses Ts to position something that really IS on a line of its own —
       a fraction numerator, a stacked unit. Anything raised or lowered by half
       a line or more goes back to where it was drawn.

       The `y !== yb` gate is a gate and not a nicety. On a page with no Ts at
       all — which is nearly every page — it is false for every fragment and
       costs one comparison each; past it the work is per row and needs the row
       measured, and a hostile page is a single row of two hundred thousand
       fragments. */
    let rows = grouped;
    let anyRise = false;
    for (const it of items) { if (it.y !== it.yb) { anyRise = true; break; } }
    if (anyRise) {
      rows = [];
      for (const row of grouped) {
        const size = lineSizeOf(row);
        const kept = [], big = [];
        for (const it of row.items) {
          (Math.abs(it.y - it.yb) >= RISE_FOLD * size ? big : kept).push(it);
        }
        if (!big.length) { rows.push(row); continue; }
        if (kept.length) rows.push({ y: row.y, size: row.size, items: kept });
        big.sort((a, b) => (b.y - a.y) || (a.x - b.x));
        let c2 = null;
        for (const it of big) {
          const tol = Math.max(1, 0.35 * Math.max(c2 ? c2.size : it.size, it.size));
          if (c2 && Math.abs(it.y - c2.y) <= tol) c2.items.push(it);
          else { c2 = { y: it.y, size: it.size, items: [it] }; rows.push(c2); }
        }
      }
      rows.sort((a, b) => b.y - a.y);
    }

    rows = absorbRaisedRuns(rows);

    return rows.map(row => {
      const its = row.items.slice().sort((a, b) => a.x - b.x);
      let s = '';
      let prevEnd = null, prevX = null, prevText = null;
      let x1 = Infinity, x2 = -Infinity;
      for (const it of its) {
        // Some producers draw the same run twice to fake bold. Don't duplicate.
        if (prevText !== null && it.text === prevText && prevX !== null && Math.abs(it.x - prevX) < 0.15 * it.size) continue;
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > GAP_SPACE * it.size && s && !/\s$/.test(s) && !/^\s/.test(it.text)) s += ' ';
        }
        s += it.text;
        prevEnd = (prevEnd === null) ? it.x2 : Math.max(prevEnd, it.x2);
        prevX = it.x; prevText = it.text;
        if (it.x < x1) x1 = it.x;
        if (it.x2 > x2) x2 = it.x2;
      }
      // x1/x2 are where the line starts and ends across the page, which is
      // what the two-column check reads; y and size are what the header strip
      // and the blank-line rule read.
      return { y: row.y, size: lineSizeOf(row), x1, x2, text: s };
    });
  }

  /* Rows -> the lines of text a teacher sees, with the blank lines put back
     where the paper had empty space. Kept apart from layoutRows so that the
     page-furniture strip can take rows out FIRST: a running header is
     separated from the body by a gap far bigger than the leading, and
     removing the header without recomputing the gaps around it would leave
     the blank lines it used to sit in. */
  function linesFromRows(rows) {
    if (!rows.length) return [];
    const rendered = rows.map(r => r.text);

    // Vertical gaps larger than the typical line pitch become blank lines.
    // A word processor makes a stanza gap out of empty space, not out of a
    // line of spaces, so this geometry is the only thing that carries it.
    // gaps[i] is the drop from row i-1 to row i, or 0 where there is none.
    const gaps = new Array(rows.length).fill(0);
    const drops = [];
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i - 1].y - rows[i].y;
      if (d > 0.5) { gaps[i] = d; drops.push(d); }
    }
    const pitch = choosePitch(drops);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const d = gaps[i];
      if (d > 0 && pitch > 0) {
        /* The neighbour floor, for the block the page-wide pitch is not about.
           A WAGOLL is often single-spaced instructions wrapped round a
           double-spaced model text — double-spaced precisely so the class can
           write between the lines — and the page pitch is then the
           instructions' leading, so every line of the model text gets a blank
           line after it. What says otherwise is local: a blank line is visible
           BECAUSE the lines either side of it are closer together than it is,
           and inside the double-spaced block they are not.

           The MINIMUM of the two neighbours, so a stanza gap survives in a
           poem of couplets where one neighbour is itself a stanza gap and the
           other is the couplet pitch. The MAXIMUM against the page pitch, so
           this can only ever refuse a blank line and never invent one.

           BOTH neighbours must exist. At the top or the bottom of a page there
           is only one, and one is not evidence about a block: a running header
           over a title over the body gives two big gaps in a row, the first of
           them has nothing above it, and a one-sided floor throws away a real
           paragraph break every time. */
        const near = (gaps[i - 1] > 0 && gaps[i + 1] > 0) ? Math.min(gaps[i - 1], gaps[i + 1]) : 0;
        const local = Math.max(pitch, near);
        if (d > 1.55 * local) {
          const n = Math.min(2, Math.max(1, Math.round(d / local) - 1));
          for (let k = 0; k < n; k++) out.push('');
        }
      }
      out.push(rendered[i]);
    }
    return out;
  }

  function assembleLines(items) {
    return linesFromRows(layoutRows(items));
  }

  /* ============================================== page furniture

     A running header, a running footer and a page number are not part of the
     model text, and in a PDF they arrive as ordinary lines of type in the
     middle of it. Measured on three unrelated producers, all of them things a
     primary teacher actually uses:

       • macOS Print → Save as PDF, of a plain .txt: "longer.txt 2026-07-29
         11:26 1" at the top of every page — the file name, the date the
         teacher printed it and the page number;
       • a Google Doc or a web page printed from Chrome, and jsPDF, which put
         "Year 4 Literacy — Model Text Page 1" across the top;
       • Word with a centred page number and nothing else: a bare "1" at the
         foot of the page, which lands in the text with blank lines either
         side of it because the layout pass can see the empty space around it.

     A three-page WAGOLL therefore gets three lines of rubbish spread evenly
     through it, and the ones in the middle land wherever the page happened to
     break — halfway through a poem, halfway through a sentence. The teacher
     has to spot and delete each one in the minute before the lesson, and the
     one at line 84 is the one they miss.

     WHAT MAKES THIS SAFE. The temptation is to match "Page 3" and be done,
     and that is exactly how a poem loses a line. Every strip here needs TWO
     pieces of evidence that agree:

       • POSITION. The line must be at the very top or the very bottom of its
         page — inside the top or bottom eighth of the type on that page, AND
         within three lines of the edge. Measured against the page's own text
         extent rather than its MediaBox, because the renderer works in
         baseline coordinates: a rotated page, a scaled CTM and a /UserUnit all
         move the text without moving the MediaBox, and the text is what we can
         see. This alone strips nothing.
       • REPETITION, or SHAPE. Either the same line appears at the same height
         on at least half the pages and at least two of them — with digits
         normalised, so "Page 1" and "Page 2" are the same line and so are two
         different dates — or the line is nothing but a page marker ("7",
         "Page 7", "3 of 12", "- 4 -").
       • BEING SET APART FROM THE BODY, by space or by size. Either the gap
         between it and the next line inwards is more than 1.6 times the
         leading of the page, or it is set in type at most 0.85 of the size the
         body of that page is set in. A running header lives in a margin and is
         printed small; a line of the text is neither. Both halves are needed,
         and each is the only thing that works on some real file:
           – macOS Print → PDF sets its header in the SAME 9pt as the body
             (it is a monospaced listing) and separates it by two and a half
             leadings. Space catches it; size cannot.
           – Chrome's header is 8pt over a 14pt body, but it sits 18 points
             above a body leaded at 15.75 — barely more than one line. Size
             catches it; space cannot.
       • BEING THE ONLY ONE OF ITS KIND ON ITS PAGE. A running header appears
         once per page, at the top. A line of the document that happens to sit
         at the top of a page appears wherever the text put it.

     The last two were not in the first version of this and both were forced by
     a fixture, which is worth recording because each one on its own looks like
     over-engineering:

       • hardcorpus/big.pdf is 200 pages of four sentences repeated. Every page
         opens with the same line at the same height, so the repetition test
         and the position test both passed and 720 lines of the document were
         deleted. Detachment refuses it — the second line is one ordinary
         leading below the first — and so does the once-per-page test, because
         that sentence is forty lines further down the same page as well.
       • judge2/jspdf-header.pdf has its model text twice per page, so the last
         line before the page break repeated at the same height too and was
         taken for a footer. Same two tests, same refusal.

     So a repeated refrain in a poem is safe three times over: it is not at the
     edge of the page, it is not set apart from the lines around it, and it is
     on the page more than once. A refrain that IS the topmost line of half the
     pages, at the same height to within two points, standing clear of the body
     and appearing nowhere else on its page, is a running header.

     Single-page documents are the careful case, because with one page there is
     no repetition to find. They get the shape path only — a bare page number
     or a "Page N", at the edge, standing clear. */

  // Fraction of a page's text height that counts as "at the edge".
  const FURN_BAND = 0.125;
  // ...and how many lines in from the edge, so a dense page cannot have six.
  const FURN_ROWS = 3;
  // A repeated line has to be on this share of the pages, and never fewer
  // than two: one page is a coincidence, not a pattern.
  const FURN_SHARE = 0.5;
  // Two baselines this close are the same height on two different pages.
  const FURN_Y_TOL = 2;
  // How far from the body, in line pitches, a line has to sit before the space
  // around it counts as a margin...
  const FURN_DETACH = 1.6;
  // ...or how much smaller than the body it has to be set. 0.85 rather than
  // something nearer 1: the corpus's real headers come in at 0.57, 0.64 and
  // 0.75 of their body, and a line only a shade smaller than the text around
  // it is far more likely to be a caption than a header.
  const FURN_SMALL = 0.85;

  /* "Page 7", "p. 7", "3 of 12", "3/12" — a line that says in words that it is
     a page number. Anchored at both ends: a line with any other word in it is
     a line of the document. */
  const RE_PAGE_WORDS = /^[-–—([]?\s*(?:(?:pages?|pp?\.)\s*(\d{1,4})(?:\s*(?:of|\/)\s*\d{1,4})?|(\d{1,4})\s*(?:of|\/)\s*\d{1,4})\s*[-–—)\]]?$/i;
  /* A bare number, with or without the decoration a footer puts round it:
     "7", "- 7 -", "[7]". "1." does not match — that is a numbered list. */
  const RE_BARE_NUM = /^[-–—([]?\s*(\d{1,4})\s*[-–—)\]]?$/;

  /* Is this line nothing but a page marker?

     A bare number has to BE the number of the page it is on, and that
     condition is doing real work: a one-page poem whose title is "1914", set
     small at the top of the page with a gap under it, satisfies every other
     test here — position, size, detachment, shape — and losing the title of a
     poem to a page-number rule would be a bad trade for a widget whose whole
     job is putting poems on a board. A page number that disagrees with its own
     page is not evidence of anything.

     The worded form is held to the SAME test, and that was a correction: it
     used to be waved through on shape alone, on the reasoning that a line
     saying "page" in words needs no help. It does. A one-page KS2 worksheet
     whose title is "Page 3" — meaning page 3 of the class reader — is a
     perfectly ordinary thing for a teacher to open, and it was losing its
     title. A real footer agrees with the page it sits on; a title does not.
     A running number that starts somewhere other than 1 is still caught,
     because the repetition path runs before this and does not need the
     numbers to line up. */
  function isPageMark(text, pageNumber) {
    const s = text.trim();
    const w = RE_PAGE_WORDS.exec(s);
    if (w) return Number(w[1] || w[2]) === pageNumber;
    const m = RE_BARE_NUM.exec(s);
    return !!m && Number(m[1]) === pageNumber;
  }

  /* Two lines are "the same" running header when they differ only in their
     numbers: the page number in it, the date it was printed. */
  function furnitureKey(s) {
    return s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  }

  /* The pitch of one page's type, for the detachment test. Same choosePitch
     the layout uses, so "a gap bigger than the leading" means the same thing
     in both places. */
  function pagePitch(rows) {
    const drops = [];
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i - 1].y - rows[i].y;
      if (d > 0.5) drops.push(d);
    }
    return choosePitch(drops);
  }

  /* The size the BODY of a page is set in: the size most of its characters
     are, not the size of most of its lines. A page number is one line and two
     characters; a heading is one line and six words; forty lines of the text
     are thousands of characters. Rounded to the half point, because the same
     nominal size arrives as 11.999999 and 12.000001 from a scaled CTM.

     The first and last lines of the page are left out of the count, which is
     the whole reason this is not a one-liner. It looks circular — those are
     the lines we are about to judge — but it is the only way round a real
     measurement: Chrome's footer is the FULL FILE PATH of the page it printed,
     a hundred characters of 8pt against three lines of 14pt body, so counting
     it made 8pt "the body", and the 8pt header at the top of the same page
     then did not look small. Excluding one line at each end cannot lose a body
     that runs the height of the page, and it is exactly the furniture. */
  function bodySize(rows) {
    const a = rows.length >= 4 ? 1 : 0;
    const b = rows.length >= 4 ? rows.length - 1 : rows.length;
    const w = new Map();
    let best = 0, most = 0;
    for (let i = a; i < b; i++) {
      const n = rows[i].text.trim().length;
      if (!n) continue;
      const k = Math.round(rows[i].size * 2) / 2;
      const t = (w.get(k) || 0) + n;
      w.set(k, t);
      if (t > most) { most = t; best = k; }
    }
    return best;
  }

  /* pageRows: one array of rows per page, each already in descending y — top
     of the paper first. Removes the furniture in place and returns a
     description of what went, or null. */
  function stripFurniture(pageRows) {
    const withRows = pageRows.filter(r => r.length);
    if (!withRows.length) return null;

    /* Every line near the top or the bottom of its page that stands clear of
       the body and is the only one of its kind on that page. That is the whole
       population anything below is allowed to consider — see the header
       comment for what each of the three conditions is holding off. */
    const cand = [];
    for (let p = 0; p < pageRows.length; p++) {
      const rows = pageRows[p];
      if (!rows.length) continue;
      const top = rows[0].y, bot = rows[rows.length - 1].y;
      const h = top - bot;
      const edge = Math.min(FURN_ROWS, rows.length);
      const pitch = pagePitch(rows);
      const body = bodySize(rows);
      // One pass for the keys, kept, rather than normalising every line of the
      // document twice. On a 200-page prose PDF that is ten thousand regex
      // replacements saved, which is most of what this whole pass costs.
      const keys = new Array(rows.length);
      const seen = new Map();
      for (let i = 0; i < rows.length; i++) {
        const k = furnitureKey(rows[i].text);
        keys[i] = k;
        if (k) seen.set(k, (seen.get(k) || 0) + 1);
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const key = keys[i];
        if (!key) continue;
        if (seen.get(key) !== 1) continue;                 // it is on this page twice
        let band = '';
        // h <= 0 is a page with one line on it, which is at both edges at once.
        if (i < edge && (!(h > 0) || r.y >= top - FURN_BAND * h)) band = 'top';
        else if (i >= rows.length - edge && (!(h > 0) || r.y <= bot + FURN_BAND * h)) band = 'bottom';
        if (!band) continue;
        /* Set apart from the body by space or by size. The gap measured is the
           one on the BODY side — below a header, above a footer. A page with
           one line on it has no body to stand apart from, and is let through
           on position alone. */
        let small = false;
        if (rows.length > 1) {
          small = body > 0 && r.size <= FURN_SMALL * body;
          let clear = false;
          if (pitch > 0) {
            const other = band === 'top' ? i + 1 : i - 1;
            clear = !(other >= 0 && other < rows.length)
              || Math.abs(r.y - rows[other].y) > FURN_DETACH * pitch;
          }
          if (!small && !clear) continue;
        }
        cand.push({ row: r, page: p, band: band, index: i, rows: rows, key: key, small: small });
      }
    }
    if (!cand.length) return null;

    const doomed = new Set();
    const found = { top: '', bottom: '', mark: false };
    const note = (c) => {
      if (isPageMark(c.row.text, c.page + 1)) found.mark = true;
      else if (!found[c.band]) found[c.band] = c.row.text.trim();
    };

    // ---- the repetition path
    const groups = new Map();
    for (const c of cand) {
      const key = c.band + ' ' + c.key;
      const g = groups.get(key);
      if (g) g.push(c); else groups.set(key, [c]);
    }
    const need = Math.max(2, Math.ceil(FURN_SHARE * withRows.length));
    for (const list of groups.values()) {
      if (list.length < need) continue;
      /* Repeating in the same band on most pages is not, on its own, enough to
         delete a line — and this is the correction that matters most in a
         widget built for poetry. A ballad refrain that closes each page's last
         stanza repeats in the bottom band on every page, and a stanza gap
         detaches it, so it satisfied every test here and was being removed
         from the board with a note calling it a footer. Deleted words are
         silent and unrecoverable; a leaked header is visible and the teacher
         can take it out in a second. So the repetition path now wants one
         piece of corroborating evidence that the line is FURNITURE rather than
         verse: it says which page it is, or it carries a number that changes
         from page to page (so its normalised key is not its own text), or it
         is set smaller than the body. A refrain is body-sized, has no digits
         and is word-for-word identical on every page, so it fails all three.
         The cost is a repeated body-sized letterhead with no numbers in it,
         which now survives onto the board — visibly, which is the right way
         round to be wrong. */
      const furniture = list.some((c) => c.small
        || isPageMark(c.row.text, c.page + 1)
        || c.key !== c.row.text.replace(/\s+/g, ' ').trim());
      if (!furniture) continue;
      // Same height as well as same words. A line-by-line sweep rather than a
      // pairwise one, because a 200-page PDF can offer 600 candidates.
      list.sort((a, b) => a.row.y - b.row.y);
      let i = 0;
      while (i < list.length) {
        let j = i;
        while (j < list.length && list[j].row.y - list[i].row.y <= FURN_Y_TOL) j++;
        const seen = new Set();
        for (let k = i; k < j; k++) seen.add(list[k].page);
        if (seen.size >= need) {
          for (let k = i; k < j; k++) { doomed.add(list[k].row); note(list[k]); }
        }
        i = j;
      }
    }

    /* ---- the shape path, which is all a one-page document has to go on.
       Position and detachment have already been established — every candidate
       has both — so what this adds is that the line says nothing except which
       page it is. */
    for (const c of cand) {
      if (doomed.has(c.row)) continue;
      if (!isPageMark(c.row.text, c.page + 1)) continue;
      doomed.add(c.row);
      note(c);
    }
    if (!doomed.size) return null;

    /* Nothing is worth a strip that empties the document. A one-page PDF whose
       only line is "3" is a page number by every test above and is also the
       whole text, and reporting it as "no text in that PDF — it's a picture of
       the page" would be a lie built out of two correct decisions. */
    let left = 0;
    for (const rows of pageRows) for (const r of rows) if (!doomed.has(r) && r.text.trim()) left++;
    if (!left) return null;

    for (let p = 0; p < pageRows.length; p++) pageRows[p] = pageRows[p].filter(r => !doomed.has(r));
    return found;
  }

  /* What went, in a sentence, with the line quoted so the teacher can see it
     was theirs to lose. Long headers are cut: this is read in the seconds
     before a lesson. */
  function furnitureNote(found) {
    const quote = (s) => '“' + (s.length > 44 ? s.slice(0, 42).trim() + '…' : s) + '”';
    const bits = [];
    if (found.top) bits.push('the heading at the top of each page (' + quote(found.top) + ')');
    if (found.bottom) bits.push('the line at the foot of each page (' + quote(found.bottom) + ')');
    if (found.mark) bits.push('the page numbers');
    if (!bits.length) return '';
    const list = bits.length === 1 ? bits[0]
      : bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
    const s = list + (bits.length === 1 && !found.mark ? ' has' : ' have') + ' been left out.';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ============================================== two columns

     A two-column PDF is read left-to-right across the gutter, so the two
     columns interleave and the text comes out shuffled. There is a fix for
     that and we are deliberately not writing it: telling a gutter from the gap
     between two table cells cannot be done from the geometry, and a reordering
     pass that is wrong about a table turns a readable line into nonsense.

     What we can do is say so. The failure that has to go is the SILENT one —
     a staggered two-column page interleaves into text that reads perfectly
     fluently and is in the wrong order, with note='' underneath it saying the
     read went fine. A teacher who is told to check the order will check it in
     five seconds; a teacher who is told nothing puts it on the board.

     Detection runs on one page's FRAGMENTS, not on its assembled lines, and it
     has to. Where the two columns share baselines — which is what happens when
     both were set from the same top margin with the same leading — the two
     halves have already been welded into one line by the time there are lines
     to look at, and that line runs the full width of the paper. The gutter is
     only visible in the ink.

       • Fragments wider than 70% of the page are set aside first: a title or a
         strapline across the top of a two-column article crosses the gutter,
         and so does a running header. That is also what makes a page of
         monospaced output — where every line is one fragment padded with
         trailing spaces to the full measure — correctly boring.
       • Of what is left, find the widest run of x with no ink in it at all. It
         has to be interior, so the ragged right-hand edge of ordinary prose
         does not count; at least 6% of the width of the type; and centred
         somewhere in the middle 60% of the page.
       • Both sides then have to look like a column rather than like a gap in
         one: at least three separate baselines each, and each side's ink
         spanning at least half the height of the ink on the page. That last
         one is the "empty band spanning most of the page height" — the band is
         empty by construction, and this is what makes it TALL rather than a
         coincidence between two short blocks.

     The bar is deliberately low enough to catch judge2/raw-twocol-stagger.pdf,
     which is three lines a side: that file is the whole point, because it is
     the one that reads fluently and is wrong. A two-column table trips this
     too, and that is a decision rather than an oversight — the note asks the
     teacher to check the order, which costs them five seconds and is never bad
     advice about a table. */
  const COL_WIDE = 0.7;       // a fragment this wide spans the page: a title
  const COL_GUTTER = 0.06;    // the gutter, as a fraction of the ink's width
  const COL_MID = [0.2, 0.8]; // where the middle of the gutter has to fall
  const COL_LINES = 3;        // separate baselines per side
  const COL_SPAN = 0.5;       // and how much of the page's height each covers
  const COL_MEASURE = 0.1;    // and how much of its width each side is set to
  const COL_BINS = 200;
  // Enough distinct baselines to answer the question; a hostile page has two
  // hundred thousand fragments and there is nothing to learn from counting them.
  const COL_MAX_LINES = 64;

  function looksTwoColumn(items) {
    if (items.length < 2 * COL_LINES) return false;
    let left = Infinity, right = -Infinity, top = -Infinity, bot = Infinity;
    for (const it of items) {
      if (it.x < left) left = it.x;
      if (it.x2 > right) right = it.x2;
      if (it.y > top) top = it.y;
      if (it.y < bot) bot = it.y;
    }
    const w = right - left, h = top - bot;
    if (!(w > 0) || !(h > 0)) return false;

    /* A difference array rather than a fill, so one fragment costs two writes
       however wide it is. MAX_ITEMS is 200,000 and painting each one across up
       to 200 bins would be forty million writes on a page nobody can read. */
    const edges = new Int32Array(COL_BINS + 1);
    let n = 0;
    for (const it of items) {
      const iw = it.x2 - it.x;
      if (!(iw >= 0) || iw > COL_WIDE * w) continue;
      let a = Math.floor((it.x - left) / w * COL_BINS);
      let b = Math.ceil((it.x2 - left) / w * COL_BINS);
      if (a < 0) a = 0;
      if (b > COL_BINS) b = COL_BINS;
      if (b <= a) b = a + 1;
      if (a >= COL_BINS) continue;
      edges[a]++; edges[b]--;
      n++;
    }
    if (n < 2 * COL_LINES) return false;

    // The widest empty run with ink on BOTH sides of it.
    let depth = 0, runFrom = -1, bestA = -1, bestB = -1;
    for (let i = 0; i <= COL_BINS; i++) {
      if (i < COL_BINS) depth += edges[i];
      const empty = i < COL_BINS && depth === 0;
      if (empty) { if (runFrom < 0) runFrom = i; continue; }
      if (runFrom > 0 && i - runFrom > bestB - bestA) { bestA = runFrom; bestB = i; }
      runFrom = -1;
    }
    if (bestA < 0) return false;
    if (bestB - bestA < COL_GUTTER * COL_BINS) return false;
    const mid = (bestA + bestB) / 2 / COL_BINS;
    if (mid < COL_MID[0] || mid > COL_MID[1]) return false;

    const gutterA = left + bestA / COL_BINS * w;
    const gutterB = left + bestB / COL_BINS * w;
    const linesL = new Set(), linesR = new Set();
    let topL = -Infinity, botL = Infinity, topR = -Infinity, botR = Infinity;
    let wideL = 0, wideR = 0;
    for (const it of items) {
      const iw = it.x2 - it.x;
      if (!(iw >= 0) || iw > COL_WIDE * w) continue;
      if (it.x2 <= gutterA + 1e-6) {
        if (linesL.size < COL_MAX_LINES) linesL.add(Math.round(it.y));
        if (it.y > topL) topL = it.y;
        if (it.y < botL) botL = it.y;
        if (iw > wideL) wideL = iw;
      } else if (it.x >= gutterB - 1e-6) {
        if (linesR.size < COL_MAX_LINES) linesR.add(Math.round(it.y));
        if (it.y > topR) topR = it.y;
        if (it.y < botR) botR = it.y;
        if (iw > wideR) wideR = iw;
      }
    }
    if (linesL.size < COL_LINES || linesR.size < COL_LINES) return false;
    /* Both sides have to be a MEASURE OF TEXT, not a strip up the margin.
       Without this a contents page is two columns: chapter titles down the
       left, page numbers down the right, dot leaders between them wide enough
       to be set aside as spanning. Its right-hand "column" is six points of
       single digits — 1% of the width of the page — where the narrowest real
       column in the corpus is 16%. Reading a contents page across is also the
       RIGHT order, so warning about it would be wrong as well as noisy. */
    if (wideL < COL_MEASURE * w || wideR < COL_MEASURE * w) return false;
    return (topL - botL) >= COL_SPAN * h && (topR - botR) >= COL_SPAN * h;
  }

  /* ------------------------------------------------------------- top level */

  /* ------------------------------------------------- what a PDF glyph means

     unglyph() repairs the difference between "what was drawn on the page" and
     "what the teacher typed", and it is applied to PDF text ONLY. A .docx
     holds the characters the teacher chose: if one has an fi ligature or a
     zero-width space in it they put it there, and it is not ours to remove. A
     PDF holds glyph codes, and the ligature is the typesetter's decision, not
     the author's.

     LIGATURES. Word with Calibri — and every LaTeX document ever — draws "fi"
     as ONE glyph whose ToUnicode says U+FB01. Left alone, "difficult" arrives
     as "diﬁcult": near enough right to miss from the back of the room, and a
     non-word to any child who sounds it out. It is worse than cosmetic here,
     because this widget marks text up word by word — the highlighter, the
     word bank and the sentence builder all take the ligature as one letter, so
     the word never matches the one on the worksheet. There is no case where a
     class wants the single glyph, so the five Latin f-ligatures and the Dutch
     IJ digraph become their letters. FB03/FB04 expand to THREE letters, which
     is why this is a map and not a pair of character swaps.

     INVISIBLE CHARACTERS. A soft hyphen (U+00AD) and a zero-width space
     (U+200B) are typesetting hints meaning "you may break the word here".
     They show nothing on the board and they split the word for every
     tokeniser that meets them, so a child highlights "diffi" and "cult" as two
     words and the word bank gains an entry nobody typed. They come out.

     U+FFFD is different and must NOT be quietly removed. It means a glyph was
     drawn whose font would not say which character it is. The word is wrong on
     the board either way, and deleting the box turns a visible failure into an
     invisible one — "the cat sat" is the version the teacher does not notice,
     "the c□t sat" is the version they do. It stays, and pdfText counts them
     and says so in the note. */
  const LIGATURES = {
    'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
    // ſt and st. Not theoretical: macOS draws Baskerville and Hoefler Text
    // with them by default, so a teacher who exports a model text from Pages
    // gets "ﬆaff" for "staff" — and U+FB05's own decomposition is the long s,
    // which is a character no primary class can read either.
    'ﬅ': 'st', 'ﬆ': 'st',
    'Ĳ': 'IJ', 'ĳ': 'ij',
  };
  const RE_LIGATURE = /[ﬀ-ﬆĲĳ]/g;
  // Soft hyphen and zero-width space: a break hint, never a character.
  const RE_INVISIBLE = /[­​]/g;

  function unglyph(s) {
    return s.replace(RE_LIGATURE, (c) => LIGATURES[c]).replace(RE_INVISIBLE, '');
  }

  function tidyPdfLines(lines) {
    lines = lines.map(unglyph);
    const out = lines.map(l => l.replace(/[ \t ]+$/, ''));
    // Index scan, not shift() — see trimBlankEnds() for why.
    let a = 0;
    while (a < out.length && out[a] === '') a++;
    let b = out.length;
    while (b > a && out[b - 1] === '') b--;
    return out.slice(a, b);
  }

  function letterRatio(s) {
    let letters = 0, other = 0;
    if (s.length > 20000) s = s.slice(0, 20000);   // a sample is plenty
    for (const ch of s) {
      if (/\s/.test(ch)) continue;
      if (/[\p{L}\p{N}]/u.test(ch)) letters++; else other++;
    }
    const tot = letters + other;
    return tot ? letters / tot : 1;
  }

  /* A note is a sentence a teacher reads in the two seconds before a lesson,
     so it stops being one somewhere around the sixth page number. Past that
     the count is the useful part and the list is noise — a 200-page PDF of
     scans would otherwise put two hundred numbers on the screen. */
  function listPages(nums) {
    if (nums.length === 1) return 'Page ' + nums[0];
    if (nums.length === 2) return 'Pages ' + nums[0] + ' and ' + nums[1];
    if (nums.length > 6) return nums.length + ' pages (' + nums.slice(0, 5).join(', ') + ' and others)';
    return 'Pages ' + nums.slice(0, -1).join(', ') + ' and ' + nums[nums.length - 1];
  }

  async function pdfText(bytes, opts) {
    opts = opts || {};
    const buf = toU8(bytes);
    if (buf.length < 32) {
      throw pdfError('NOT_PDF', "That file is too small to be a PDF — there's nothing in it to read.");
    }
    const doc = new PDFDocument(buf, { inflate: opts.inflate || inflateStream });
    await doc.init();

    if ((doc.trailer && doc.trailer.get('Encrypt')) || doc.maybeEncrypted) {
      throw pdfError('ENCRYPTED',
        'That PDF is locked, so I can’t read the words out of it. Open it in a PDF reader, select the text and paste it in.');
    }

    const pages = await collectPages(doc);
    if (!pages.length) {
      throw pdfError('NO_PAGES', "I couldn’t find any pages in that PDF — the file may be damaged.");
    }

    const rend = new Renderer(doc);
    const pageRows = [];
    let twoColumn = false;
    const emptyPages = [];
    const brokenPages = [];
    // Nobody puts a 200-page PDF on the board on purpose, but somebody will
    // pick one by mistake, and rendering all of it would freeze the tab in
    // front of a class. Read the front of it and say so.
    const readTo = Math.min(pages.length, opts.maxPages > 0 ? opts.maxPages : 200);
    // How many we actually got through. The page cap is one reason to stop
    // early; running out of content budget is the other, and the teacher is
    // told the same thing either way because the action is the same.
    let pagesRead = 0;

    for (let i = 0; i < readTo; i++) {
      if (rend.contentCapped) break;
      pagesRead = i + 1;
      const pg = pages[i];
      rend.items = [];
      const before = rend.showOps;
      try {
        let contents = await doc.resolve(pg.dict.get('Contents'));
        const streams = [];
        if (contents instanceof PStream) streams.push(contents);
        else if (Array.isArray(contents)) {
          for (const c of contents) {
            const s = await doc.resolve(c);
            if (s instanceof PStream) streams.push(s);
          }
        }
        const parts = [];
        for (const s of streams) {
          try { parts.push(await doc.getStreamData(s)); } catch (e) { /* skip */ }
        }
        let data = null;
        if (parts.length === 1) data = parts[0];
        else if (parts.length) {
          /* One page's content, assembled. This needs a ceiling of its own,
             because /Contents is an ARRAY and nothing stops it naming the same
             stream five thousand times: the decode cache hands back the same
             200 KB buffer each time and it is the concatenation that does the
             multiplying — 223 KB of PDF became a 1.3 GB Uint8Array. Take as
             many parts as the document's remaining content budget will
             actually walk, and always at least the first one. */
          const room = Math.max(parts[0].length + 1, rend.contentLeft);
          let total = 0, take = 0;
          for (const p of parts) {
            if (take && total + p.length + 1 > room) break;
            total += p.length + 1; take++;
          }
          data = new Uint8Array(total);
          let o = 0;
          for (let k = 0; k < take; k++) { data.set(parts[k], o); o += parts[k].length; data[o++] = 10; }
        }
        const resources = pg.dict.has('Resources') ? pg.dict.get('Resources') : pg.inh.Resources;
        if (data && data.length) await rend.exec(data, resources, IDENT, 0);
      } catch (e) {
        brokenPages.push(i + 1);
      }
      // Asked while this page's fragments are still here: the check reads the
      // ink, and one page's ink is all that is kept at a time.
      if (!twoColumn) twoColumn = looksTwoColumn(rend.items);
      const rows = layoutRows(rend.items);
      // Judged BEFORE the furniture goes, so a page that held nothing but a
      // page number is not then reported as a page we could not read.
      if (!rows.some(r => r.text.trim() !== '') || rend.showOps === before) emptyPages.push(i + 1);
      pageRows.push(rows);
    }

    /* Running headers, footers and page numbers, across all the pages at once
       — the evidence is that they repeat, so no single page has it. */
    const stripped = stripFurniture(pageRows);

    const pageLines = pageRows.map(linesFromRows);

    // Pages are joined with a single newline, NOT a blank line. A page break in
    // a flowing document is a line break, not a paragraph break — and inserting
    // a blank line here would invent a stanza gap in the middle of a sentence
    // that happened to straddle two pages. Genuine gaps already arrive as blank
    // lines from the layout pass.
    let all = [];
    for (const pl of pageLines) all = all.concat(pl);

    const lines = tidyPdfLines(all);
    const text = lines.join('\n');

    const notes = [];
    if (!text.trim()) {
      // Two failures that look identical from outside and need opposite
      // advice, so they get separate codes: NO_TEXT is a photograph of a page
      // and the only way out is to type it; NO_UNICODE means the words ARE in
      // there but the fonts refuse to say which letters they are, and
      // selecting and copying in a PDF reader will very often work.
      if (rend.showOps === 0) {
        // Before blaming the scanner: a PDF ends with %%EOF, so a file that
        // has none and gave us nothing is a half-finished download or a
        // half-finished save, not a photograph. Telling that teacher to
        // "type it out" would send them off to retype a file that would
        // have worked perfectly if they fetched it again. Checked only on
        // this path, so a merely-damaged file that still gave us its words
        // is unaffected.
        if (lastIndexOfStr(buf, '%%EOF', buf.length - 1) < 0) {
          throw pdfError('TRUNCATED',
            'That PDF looks incomplete — it looks as though only part of it saved or downloaded. ' +
            'Try downloading it again, or open it and paste the text in.');
        }
        throw pdfError('NO_TEXT',
          'There’s no text in that PDF for me to read — it’s a picture of the page, not words. ' +
          'Open the PDF, select the text and paste it in, or type it out.');
      }
      throw pdfError('NO_UNICODE',
        'I found text in that PDF but couldn’t turn it into readable words. ' +
        'Open the PDF, select the text and paste it in instead.');
    }
    if (pagesRead < pages.length) {
      /* "more than", not the number, when the page walk stopped at its own
         ceiling: pages.length is then PAGE_CAP + 1 and says more about this
         module than about the teacher's file. Telling them a 12,000-page PDF
         is 4,001 pages long is a made-up fact, and the one thing a note must
         never be is wrong about something they can check. */
      notes.push('That PDF is ' + (pages.capped ? 'more than ' + PAGE_CAP : pages.length)
        + ' pages long, so only the first '
        + (pagesRead === 1 ? 'page has' : pagesRead + ' have') + ' been read.');
    }
    if (stripped) {
      const s = furnitureNote(stripped);
      if (s) notes.push(s);
    }
    if (twoColumn) {
      notes.push('That PDF looks as though it is set in two columns, so the lines may have come across '
        + 'in the wrong order — please read it through before you put it on the board.');
    }
    if (emptyPages.length && emptyPages.length < pagesRead) {
      notes.push(listPages(emptyPages) + ' had no text I could read — ' +
        (emptyPages.length === 1 ? 'it may be a picture.' : 'they may be pictures.'));
    }
    if (brokenPages.length) {
      notes.push(listPages(brokenPages) + ' couldn’t be read and ' + (brokenPages.length === 1 ? 'was' : 'were') + ' skipped.');
    }
    const total = rend.mapped + rend.dropped;
    if (total > 0 && rend.dropped / total > 0.02) {
      notes.push('Some characters couldn’t be read and have been left out — please check the text.');
    }
    /* U+FFFD is a glyph the font refused to identify — see unglyph() for why
       it is left in the text rather than deleted. It is left in SILENTLY at
       the moment it is produced, deep in the font decoder, and a replacement
       box on the board with note='' is the widget telling the teacher the read
       went perfectly. Count them here, where the finished text is, and say so.
       The count is deliberately not spelled out past a handful: "a few" is
       what a teacher needs in the two seconds before the lesson, and the exact
       number of boxes is something they can see for themselves. */
    let unreadable = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xfffd) unreadable++;
    if (unreadable) {
      notes.push((unreadable === 1 ? 'One character' : unreadable <= 12 ? 'A few characters' : unreadable + ' characters')
        + ' in that PDF couldn’t be read and ' + (unreadable === 1 ? 'shows' : 'show')
        + ' as an empty box — please check the text.');
    }
    if (text.length > 40 && letterRatio(text) < 0.55) {
      notes.push('The text may not have come out cleanly — please read it through before you use it.');
    }

    return { text, note: notes.join(' ') };
  }

  /* ============================================================ the front door

     Everything above is a reader. This is the bit the widget actually calls. */

  /* The accept string for a file input. The MIME types are there for the
     pickers that filter on type rather than extension (Android, some Linux
     desktops); the extensions are there because plenty of pickers do the
     opposite.

     .doc and .rtf are in here even though neither can be READ, and that is
     deliberate. read() has a written-out sentence for each of them — "open it
     in Word and choose Save As → .docx", "select all the text and paste it in"
     — and a teacher whose WAGOLL is a .doc is exactly the teacher who needs
     it. Left out of the accept string, the picker greys the file out and says
     nothing at all, so the advice could only ever fire if they happened to
     drag the file in instead. Greying out a file is not a message. */
  const EXT = '.txt,.md,.text,.markdown,.csv,.tsv,.docx,.xlsx,.pdf,.doc,.rtf,.xls,'
    + 'text/plain,text/markdown,text/csv,text/tab-separated-values,application/pdf,'
    + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,'
    + 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,'
    + 'application/msword,application/vnd.ms-excel,application/rtf,text/rtf';

  const RE_TEXT_EXT = /\.(txt|text|md|markdown|mdown|mkd|mkdn|csv|tsv)$/i;
  const RE_DOC_EXT = /\.(docx|xlsx|pdf)$/i;
  /* The two we take in order to turn away with advice — see EXT. handles()
     must agree with the accept string, or a picker offers the file and
     whatever wired this up then refuses it before read() gets the chance to
     say anything useful. */
  const RE_ADVICE_EXT = /\.(doc|rtf|xls)$/i;
  const MIMES = new Set([
    'text/plain', 'text/markdown', 'text/x-markdown', 'application/pdf',
    'text/csv', 'application/csv', 'text/tab-separated-values',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword', 'application/vnd.ms-excel', 'application/rtf', 'text/rtf',
  ]);

  /* True when read() has a reader for this. Extension and MIME are free to
     check; magic bytes are only checked when the caller already has them
     (a Uint8Array, an ArrayBuffer, or { name, bytes }), because reading a File
     to sniff it would make this async and every caller worse.

     read() sniffs properly, so a teacher who has renamed their WAGOLL to
     wagoll.txt still gets the .docx reader — this only decides whether we
     claim the file in the first place. */
  function handles(file) {
    if (!file) return false;
    const bytes = asU8(file) || asU8(file.bytes);
    if (bytes) {
      if (findsPdfHeader(bytes)) return true;
      if (startsWith(bytes, SIG_ZIP) || startsWith(bytes, SIG_ZIP_EMPTY)) return true;
      // {\rtf is unambiguous. The OLE signature deliberately is NOT checked
      // here: .xls and .ppt carry the same eight bytes, and claiming those
      // would answer a spreadsheet with advice about Word.
      if (startsWith(bytes, SIG_RTF)) return true;
    }
    const name = typeof file === 'string' ? file : String(file.name || '');
    if (RE_TEXT_EXT.test(name) || RE_DOC_EXT.test(name) || RE_ADVICE_EXT.test(name)) return true;
    const type = String(file.type || '').split(';')[0].trim().toLowerCase();
    return !!type && MIMES.has(type);
  }

  /* What the bytes say the file is, which beats what the name says it is.
     Returns one of: pdf, zip, ole, rtf, text. */
  function sniff(bytes) {
    if (findsPdfHeader(bytes)) return 'pdf';
    if (startsWith(bytes, SIG_ZIP) || startsWith(bytes, SIG_ZIP_EMPTY)) return 'zip';
    if (startsWith(bytes, SIG_OLE)) return 'ole';
    if (startsWith(bytes, SIG_RTF)) return 'rtf';
    return 'text';
  }

  async function bytesOf(file, maxBytes) {
    const direct = asU8(file) || asU8(file && file.bytes);
    if (direct) {
      if (direct.length > maxBytes) throw tooBig(maxBytes);
      return direct;
    }
    // File.size is there before we read anything, so an enormous file costs
    // nothing at all rather than a copy into memory first.
    if (typeof file.size === 'number' && file.size > maxBytes) throw tooBig(maxBytes);
    if (typeof file.arrayBuffer !== 'function') {
      throw new Error('I couldn’t open that file. Try choosing it again.');
    }
    const buf = await file.arrayBuffer();
    if (buf.byteLength > maxBytes) throw tooBig(maxBytes);
    return new Uint8Array(buf);
  }

  const tooBig = (maxBytes) => new Error(
    'That file is bigger than ' + (maxBytes >= 1024 * 1024
      ? Math.round(maxBytes / (1024 * 1024)) + ' MB'
      : Math.round(maxBytes / 1024) + ' KB')
    + ', which is too big to put on the board. Copy just the part you want and paste it in.');

  /* Cut at a line ending where there is one nearby, so the text stops at the
     end of a sentence rather than halfway through a word. */
  function clip(text, maxChars) {
    if (text.length <= maxChars) return text;
    const cut = text.lastIndexOf('\n', maxChars);
    return text.slice(0, cut > maxChars - 2000 ? cut : maxChars);
  }

  /* The one call the widget makes.

     file: a File (or a Blob, or raw bytes, or { name, bytes } — the last two
     are what the node harness uses).
     opts: { maxBytes, maxChars, maxPages } — all optional.

     Returns { text, kind, note }. `kind` is 'txt' | 'docx' | 'xlsx' | 'pdf'.
     An 'xlsx' comes back tab-separated, a row per line. `note` is
     a short teacher-facing sentence when something was dropped or nothing was
     found, and '' when the read was clean. Throws a plain Error whose message
     is a sentence a teacher can act on when the file genuinely cannot be read. */
  async function read(file, opts) {
    opts = opts || {};
    const maxBytes = opts.maxBytes > 0 ? opts.maxBytes : MAX_BYTES;
    const maxChars = opts.maxChars > 0 ? opts.maxChars : MAX_CHARS;
    const maxPages = opts.maxPages > 0 ? opts.maxPages : MAX_PAGES;

    if (!file) throw new Error('No file was chosen.');
    const name = typeof file === 'string' ? '' : String(file.name || '');
    const bytes = await bytesOf(file, maxBytes);
    if (!bytes.length) throw new Error('That file is empty — there’s nothing in it to put on the board.');

    let kind = 'txt';
    let text = '';
    const notes = [];

    switch (sniff(bytes)) {
      case 'pdf': {
        kind = 'pdf';
        const r = await pdfText(bytes, { inflate: inflateStream, maxPages });
        text = r.text;
        if (r.note) notes.push(r.note);
        break;
      }
      case 'zip': {
        const files = await openZip(bytes);
        // a spreadsheet is a readable file now, not a wrong turn, so it is
        // asked about before wrongZip gets to hand out advice about Word
        if (hasSheetPart(files)) {
          kind = 'xlsx';
          const r = xlsxText(files, { maxChars });
          text = r.text;
          if (r.note) notes.push(r.note);
          break;
        }
        kind = 'docx';
        if (!hasWordPart(files)) throw wrongZip(files);
        const r = docxText(files, { maxChars });
        text = r.text;
        if (r.note) notes.push(r.note);
        break;
      }
      case 'ole':
        // .xls and .doc share the OLE signature, so the name is all there is
        // to go on for saying which application to open it in
        if (/\.xls$/i.test(name)) {
          throw new Error('That’s the older .xls format. Open it in Excel and choose Save As → .xlsx or .csv, then try again.');
        }
        throw new Error('That’s the older .doc format. Open it in Word and choose Save As → .docx, then try again.');
      case 'rtf':
        throw new Error('That’s a Rich Text (.rtf) file. Open it, select all the text and paste it in, or save it as .docx first.');
      default: {
        const decoded = decodeText(bytes);
        // Named .docx or .pdf but not shaped like one: say which, because
        // "it didn't work" sends a teacher round in circles. A file that is
        // genuinely plain text under a .docx name is not an error at all —
        // it's exactly what the teacher wanted, so it falls through.
        if (looksBinary(decoded)) {
          if (RE_DOC_EXT.test(name)) {
            throw new Error('That file is named ' + name.slice(name.lastIndexOf('.')).toLowerCase()
              + ' but isn’t one inside. Open it in Word and save it again, or paste the text in.');
          }
          throw new Error('I couldn’t read that file. Word (.docx), PDF and plain text all work.');
        }
        kind = 'txt';
        text = tidyPlainText(decoded);
        break;
      }
    }

    if (!text.trim()) {
      if (kind === 'txt') throw new Error('That file has no text in it.');
      // docx and pdf report their own emptiness with more to go on than we
      // have here, and both leave a note rather than throwing.
      text = '';
    }

    if (text.length > maxChars) {
      text = clip(text, maxChars);
      notes.push('That’s a long document, so only the beginning has been brought in.');
    }

    return { text, kind, note: notes.join(' ') };
  }

  async function openZip(bytes) {
    const zip = window.SageZip;
    if (!zip || typeof zip.read !== 'function') {
      throw new Error('I couldn’t open that Word document — a part of the app didn’t load. Reload the page and try again.');
    }
    let files;
    try {
      /* The limits are OPTIONAL in zip.js and nothing else passes them — the
         word bank's zip.read(buffer) call is untouched and takes the same path
         it always has. They are here because a .docx is a deflate archive and
         deflate reaches 1032:1: 499 KB of .docx expands to 2.1 GB of
         document.xml, and because that lands in an ArrayBuffer rather than the
         JS heap, no --max-old-space-size and no try/catch saves the tab. It
         has to be refused while it is still arriving. */
      files = await zip.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        { maxEntryBytes: MAX_STREAM_BYTES, maxTotalBytes: MAX_TOTAL_BYTES });
    } catch (e) {
      if (e && e.code === 'ZIP_TOO_BIG') throw tooMuchInside('Word document');
      throw new Error('That Word document couldn’t be opened — it may be damaged. Open it in Word, save it again and try once more.');
    }
    if (!files || typeof files.has !== 'function' || !files.size) {
      throw new Error('That Word document couldn’t be opened — it may be damaged. Open it in Word, save it again and try once more.');
    }
    return files;
  }

  const hasWordPart = (files) => {
    for (const name of files.keys()) if (name.indexOf('word/') === 0) return true;
    return files.has('_rels/.rels') && files.has('[Content_Types].xml') && files.has('word/document.xml');
  };
  // a worksheet, not merely an xl/ folder: a .xlsx with charts and no sheet we
  // can read should still fall through to wrongZip's advice
  const hasSheetPart = (files) => {
    for (const name of files.keys()) {
      if (name.indexOf('xl/worksheets/') === 0 && /\.xml$/i.test(name)) return true;
    }
    return false;
  };

  /* A zip that isn't a Word document is usually a recognisable one, and naming
     it saves the teacher a guess.

     LibreOffice and Pages are both handled before the generic answer, and they
     have to be: "open it and choose the .docx inside" sends a teacher hunting
     through a file for something that is not in there, which is worse than no
     advice at all. Both are commoner in a primary school than the PowerPoint
     and spreadsheet cases already here — an .odt is what a school laptop
     running LibreOffice saves by default, and a .pages is what a teacher's own
     Mac saves by default. */
  function wrongZip(files) {
    let ppt = false, xl = false, pages = false;
    for (const name of files.keys()) {
      if (name.indexOf('ppt/') === 0) ppt = true;
      else if (name.indexOf('xl/') === 0) xl = true;
      // A .pages bundle is a folder of IWA archives; these two directories are
      // in every version of it, and no other zip we meet has them.
      else if (name.indexOf('Index/') === 0 || name.indexOf('Metadata/') === 0) pages = true;
    }
    if (ppt) return new Error('That’s a PowerPoint, not a Word document. Use Import PowerPoint for that, or paste the text in.');
    if (xl) return new Error('That’s a spreadsheet, not a Word document. Copy the cells you want and paste them in.');
    /* ODF stores its type as a plain-text 'mimetype' entry, first in the
       archive and never compressed, precisely so it can be identified without
       unpacking. Only the text one is named: a teacher with an .ods or an .odp
       is in the spreadsheet or presentation case, and falls through. */
    const mime = files.get('mimetype');
    if (mime && mime.length < 200) {
      let s = '';
      try { s = decodeBytes(mime).trim(); } catch (e) { s = ''; }
      if (s.indexOf('application/vnd.oasis.opendocument.text') === 0) {
        return new Error('That’s an OpenDocument (.odt) file, not a Word document. '
          + 'Open it, choose Save As → Word (.docx), then try again.');
      }
    }
    if (pages) {
      return new Error('That’s an Apple Pages document, not a Word document. '
        + 'Open it, choose File → Export To → Word, then try again.');
    }
    return new Error('That’s a zip folder, not a Word document. Open it and choose the .docx inside.');
  }

  window.SageDocText = {
    handles,
    read,
    EXT,
    // The pure inner readers, exported so the node harness can drive them
    // directly without a File: _docxText and _xlsxText take the Map that
    // SageZip.read returns, _pdfText takes the file's bytes and an { inflate }
    // hook.
    _docxText: docxText,
    _xlsxText: xlsxText,
    _pdfText: pdfText,
  };
})();
