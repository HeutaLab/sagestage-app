/* Minimal QR code generator (byte mode, ECC level L, versions 1-6).
   Written from the QR specification - no external dependencies. */
(function () {
  'use strict';

  // ---- GF(256) arithmetic for Reed-Solomon ----
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], GF_EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    // built lowest-degree-first; rsEncode expects highest-degree-first
    return poly.reverse();
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const res = new Array(ecLen).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      if (factor !== 0) {
        for (let j = 0; j < gen.length - 1; j++) {
          res[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return res;
  }

  // ---- Version table (ECC level L) ----
  // blocks: [count, totalCodewordsPerBlock, dataCodewordsPerBlock]
  const VERSIONS = [
    null,
    { size: 21, align: [], blocks: [1, 26, 19] },
    { size: 25, align: [6, 18], blocks: [1, 44, 34] },
    { size: 29, align: [6, 22], blocks: [1, 70, 55] },
    { size: 33, align: [6, 26], blocks: [1, 100, 80] },
    { size: 37, align: [6, 30], blocks: [1, 134, 108] },
    { size: 41, align: [6, 34], blocks: [2, 86, 68] },
  ];

  function pickVersion(byteLen) {
    for (let v = 1; v < VERSIONS.length; v++) {
      const info = VERSIONS[v];
      const dataCW = info.blocks[0] * info.blocks[2];
      if (byteLen <= dataCW - 2) return v;
    }
    return -1;
  }

  // ---- Bit buffer ----
  function BitBuffer() {
    this.bytes = [];
    this.length = 0;
  }
  BitBuffer.prototype.put = function (value, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      const byteIdx = this.length >> 3;
      if (this.bytes.length <= byteIdx) this.bytes.push(0);
      if ((value >>> i) & 1) this.bytes[byteIdx] |= 0x80 >>> (this.length & 7);
      this.length++;
    }
  };

  // ---- Build final codeword sequence ----
  function buildCodewords(text) {
    const enc = new TextEncoder().encode(text);
    const version = pickVersion(enc.length);
    if (version < 0) return null;
    const info = VERSIONS[version];
    const [blockCount, totalPerBlock, dataPerBlock] = info.blocks;
    const dataCW = blockCount * dataPerBlock;

    const bb = new BitBuffer();
    bb.put(4, 4); // byte mode
    bb.put(enc.length, 8); // length (8 bits for versions 1-9)
    for (const b of enc) bb.put(b, 8);
    // terminator
    const remaining = dataCW * 8 - bb.length;
    bb.put(0, Math.min(4, remaining));
    if (bb.length & 7) bb.put(0, 8 - (bb.length & 7));
    // pad bytes
    const pads = [0xec, 0x11];
    let p = 0;
    while (bb.bytes.length < dataCW) bb.put(pads[p++ & 1], 8);

    // split into blocks, compute EC, interleave
    const ecLen = totalPerBlock - dataPerBlock;
    const dataBlocks = [];
    const ecBlocks = [];
    for (let b = 0; b < blockCount; b++) {
      const chunk = bb.bytes.slice(b * dataPerBlock, (b + 1) * dataPerBlock);
      dataBlocks.push(chunk);
      ecBlocks.push(rsEncode(chunk, ecLen));
    }
    const out = [];
    for (let i = 0; i < dataPerBlock; i++)
      for (let b = 0; b < blockCount; b++) out.push(dataBlocks[b][i]);
    for (let i = 0; i < ecLen; i++)
      for (let b = 0; b < blockCount; b++) out.push(ecBlocks[b][i]);
    return { version, codewords: out };
  }

  // ---- Matrix construction ----
  function newMatrix(size) {
    const m = new Array(size);
    for (let i = 0; i < size; i++) m[i] = new Array(size).fill(null);
    return m;
  }

  function setFinder(m, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= m.length || cc < 0 || cc >= m.length) continue;
        const dark = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        m[rr][cc] = dark;
      }
    }
  }

  function setAlignment(m, row, col) {
    for (let r = -2; r <= 2; r++)
      for (let c = -2; c <= 2; c++)
        m[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
  }

  function placeFunctionModules(m, version) {
    const size = m.length;
    setFinder(m, 0, 0);
    setFinder(m, 0, size - 7);
    setFinder(m, size - 7, 0);
    // timing
    for (let i = 8; i < size - 8; i++) {
      if (m[6][i] === null) m[6][i] = i % 2 === 0;
      if (m[i][6] === null) m[i][6] = i % 2 === 0;
    }
    // alignment
    const align = VERSIONS[version].align;
    for (const r of align) {
      for (const c of align) {
        if (m[r][c] !== null) continue; // overlaps a finder
        setAlignment(m, r, c);
      }
    }
    // dark module
    m[size - 8][8] = true;
    // reserve format areas (placeholder false, overwritten later)
    for (let i = 0; i < 9; i++) {
      if (m[8][i] === null) m[8][i] = false;
      if (m[i][8] === null) m[i][8] = false;
    }
    for (let i = size - 8; i < size; i++) {
      m[8][i] = m[8][i] === null ? false : m[8][i];
      m[i][8] = m[i][8] === null ? false : m[i][8];
    }
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => ((r >> 1) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function placeData(m, funcMask, codewords, mask) {
    const size = m.length;
    let byteIndex = 0, bitIndex = 7;
    let row = size - 1, inc = -1;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let d = 0; d < 2; d++) {
          const c = col - d;
          if (funcMask[row][c]) continue;
          let dark = false;
          if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
          if (MASKS[mask](row, c)) dark = !dark;
          m[row][c] = dark;
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
        row += inc;
        if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
      }
    }
  }

  function formatBits(mask) {
    const ECC_L = 1;
    const fmt = (ECC_L << 3) | mask;
    let d = fmt << 10;
    for (let i = 14; i >= 10; i--) {
      if ((d >>> i) & 1) d ^= 0x537 << (i - 10);
    }
    return ((fmt << 10) | d) ^ 0x5412;
  }

  function placeFormat(m, mask) {
    const size = m.length;
    const bits = formatBits(mask);
    for (let i = 0; i < 15; i++) {
      const mod = ((bits >> i) & 1) === 1;
      // vertical run: down column 8 (skipping the timing row), then bottom-left strip
      if (i < 6) m[i][8] = mod;
      else if (i < 8) m[i + 1][8] = mod;
      else m[size - 15 + i][8] = mod;
      // horizontal run: right end of row 8, then left of row 8 (skipping the timing column)
      if (i < 8) m[8][size - i - 1] = mod;
      else if (i < 9) m[8][7] = mod;
      else m[8][15 - i - 1] = mod;
    }
  }

  function penalty(m) {
    const size = m.length;
    let score = 0;
    // rule 1: runs of same color
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < size; i++) {
        let run = 1;
        let prev = pass ? m[0][i] : m[i][0];
        for (let j = 1; j < size; j++) {
          const cur = pass ? m[j][i] : m[i][j];
          if (cur === prev) {
            run++;
          } else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1;
            prev = cur;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
    }
    // rule 2: 2x2 blocks
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++)
        if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
    // rule 3: finder-like patterns
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = pat1.slice().reverse();
    const matches = (get, i) => {
      let a = true, b = true;
      for (let k = 0; k < 11; k++) {
        const v = get(i + k);
        if (v !== pat1[k]) a = false;
        if (v !== pat2[k]) b = false;
      }
      return a || b;
    };
    for (let r = 0; r < size; r++)
      for (let c = 0; c <= size - 11; c++) {
        if (matches((i) => m[r][i], c)) score += 40;
        if (matches((i) => m[i][r], c)) score += 40;
      }
    // rule 4: dark ratio
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function makeQR(text) {
    const built = buildCodewords(text);
    if (!built) return null;
    const size = VERSIONS[built.version].size;

    const funcM = newMatrix(size);
    placeFunctionModules(funcM, built.version);
    const funcMask = funcM.map((row) => row.map((v) => v !== null));

    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = funcM.map((row) => row.slice());
      placeData(m, funcMask, built.codewords, mask);
      placeFormat(m, mask);
      const s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  function drawQR(canvas, text, sizePx, fg, bg) {
    const matrix = makeQR(text);
    const ctx = canvas.getContext('2d');
    if (!matrix) {
      canvas.width = canvas.height = sizePx;
      ctx.fillStyle = bg || '#fff';
      ctx.fillRect(0, 0, sizePx, sizePx);
      ctx.fillStyle = '#c00';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Text too long (max ~134 chars)', sizePx / 2, sizePx / 2);
      return false;
    }
    const n = matrix.length;
    const quiet = 4;
    const scale = Math.max(1, Math.floor(sizePx / (n + quiet * 2)));
    const total = scale * (n + quiet * 2);
    canvas.width = canvas.height = total;
    ctx.fillStyle = bg || '#ffffff';
    ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = fg || '#1a1a2e';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (matrix[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    return true;
  }

  window.SageQR = { makeQR, drawQR };
})();
