/* Sage Stage — a small ZIP reader and writer.

   Why this exists: a word bank set travels as one file, and a teacher who
   opens that file should see something they understand — a short readable
   set.json and a folder of real pictures they can double-click. JSON alone
   cannot do that: it holds text only, so an image inside one has to be
   encoded as a wall of base64, which is exactly what looked wrong.

   No libraries, no build step. Writing is store-only (method 0) — the
   pictures in a set are already-compressed JPEG or PNG, so deflating them
   would buy nothing, and store keeps the writer simple and synchronous. The
   reader handles both store and deflate, because a teacher who unpacks a set,
   changes a picture and re-zips it with Finder or Explorer will hand us a
   deflated archive; the browser's own DecompressionStream does that work.

   Layout written: local file header + data per entry, then a central
   directory, then the end-of-central-directory record. */
(function () {
  'use strict';

  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_EOCD = 0x06054b50;

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const asBytes = (v) => (typeof v === 'string' ? enc.encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v));

  // MS-DOS packed date and time: the format is from 1980 and so is its epoch
  function dosStamp(d) {
    const year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  /* files: [{ name, data }] where data is a string or Uint8Array.
     Returns a Blob. Names use forward slashes; "images/shark.jpg" makes a
     folder when the teacher unpacks it. */
  function write(files, when) {
    const stamp = dosStamp(when instanceof Date ? when : new Date());
    const entries = [];
    let offset = 0;
    const chunks = [];

    for (const f of files) {
      const nameBytes = enc.encode(String(f.name));
      const data = asBytes(f.data);
      const crc = crc32(data);
      const head = new Uint8Array(30 + nameBytes.length);
      const v = new DataView(head.buffer);
      v.setUint32(0, SIG_LOCAL, true);
      v.setUint16(4, 20, true);          // version needed
      v.setUint16(6, 0, true);           // flags
      v.setUint16(8, 0, true);           // method 0 = stored
      v.setUint16(10, stamp.time, true);
      v.setUint16(12, stamp.date, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true); // compressed size
      v.setUint32(22, data.length, true); // uncompressed size
      v.setUint16(26, nameBytes.length, true);
      v.setUint16(28, 0, true);          // extra length
      head.set(nameBytes, 30);
      chunks.push(head, data);
      entries.push({ nameBytes, crc, size: data.length, offset });
      offset += head.length + data.length;
    }

    const cdStart = offset;
    for (const e of entries) {
      const rec = new Uint8Array(46 + e.nameBytes.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, SIG_CENTRAL, true);
      v.setUint16(4, 20, true);          // version made by
      v.setUint16(6, 20, true);          // version needed
      v.setUint16(8, 0, true);
      v.setUint16(10, 0, true);          // stored
      v.setUint16(12, stamp.time, true);
      v.setUint16(14, stamp.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.nameBytes.length, true);
      v.setUint16(30, 0, true);          // extra
      v.setUint16(32, 0, true);          // comment
      v.setUint16(34, 0, true);          // disk
      v.setUint16(36, 0, true);          // internal attrs
      v.setUint32(38, 0, true);          // external attrs
      v.setUint32(42, e.offset, true);
      rec.set(e.nameBytes, 46);
      chunks.push(rec);
      offset += rec.length;
    }

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, SIG_EOCD, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, offset - cdStart, true);
    ev.setUint32(16, cdStart, true);
    ev.setUint16(20, 0, true);
    chunks.push(eocd);

    return new Blob(chunks, { type: 'application/zip' });
  }

  const looksZip = (buf) => {
    const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  };

  /* `limit` is OPTIONAL and defaults to no limit, which is the path this
     function has always taken, byte for byte. Deflate reaches 1032:1, so half
     a megabyte of archive can be half a gigabyte of entry; a caller that is
     about to put the contents on a screen can say how much it is willing to
     take, and then the stream is drained a chunk at a time and abandoned the
     moment it goes over rather than after the allocation has already happened.
     Callers that pass nothing — the word bank — get exactly what they did
     before, including the one-shot Response.arrayBuffer(). */
  async function inflateRaw(bytes, limit) {
    if (typeof DecompressionStream !== 'function') throw new Error('deflate not supported here');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    if (!(limit > 0)) return new Uint8Array(await new Response(stream).arrayBuffer());
    const reader = stream.getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
      n += r.value.length;
      if (n > limit) {
        try { await reader.cancel(); } catch (e) { /* already finished */ }
        throw tooBig();
      }
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  function tooBig() {
    const e = new Error('zip contents exceed the limit the caller gave');
    e.code = 'ZIP_TOO_BIG';   // so a caller can tell "too big" from "damaged"
    return e;
  }

  /* Reads an archive into a Map of name -> Uint8Array. Entries are found
     through the central directory rather than by scanning for headers, which
     is what makes a stray "PK" inside a JPEG harmless.

     opts is OPTIONAL and defaults to today's behaviour in every respect:
       { maxEntryBytes } — refuse a single entry that decompresses past this;
       { maxTotalBytes } — refuse once the entries add up past this.
     Either one, when tripped, throws an Error with code 'ZIP_TOO_BIG'. */
  async function read(buffer, opts) {
    const maxEntry = (opts && opts.maxEntryBytes > 0) ? opts.maxEntryBytes : 0;
    const maxTotal = (opts && opts.maxTotalBytes > 0) ? opts.maxTotalBytes : 0;
    let total = 0;
    const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
    const view = new DataView(buf);
    const len = buf.byteLength;
    if (len < 22) throw new Error('not an archive');

    // the EOCD sits at the end, after a comment of up to 64k
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
      if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not an archive');

    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const out = new Map();
    for (let i = 0; i < count; i++) {
      if (p + 46 > len || view.getUint32(p, true) !== SIG_CENTRAL) break;
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localAt = view.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      p += 46 + nameLen + extraLen + commentLen;

      if (localAt + 30 > len || view.getUint32(localAt, true) !== SIG_LOCAL) continue;
      const lNameLen = view.getUint16(localAt + 26, true);
      const lExtraLen = view.getUint16(localAt + 28, true);
      const start = localAt + 30 + lNameLen + lExtraLen;
      if (start + compSize > len) continue;
      const raw = new Uint8Array(buf, start, compSize);
      if (name.endsWith('/')) continue; // a folder entry carries no data
      let data = null;
      if (method === 0) data = raw;
      else if (method === 8) data = await inflateRaw(raw, maxEntry);
      // any other method (bzip2, lzma…) is left out rather than guessed at
      if (!data) continue;
      if (maxEntry && data.length > maxEntry) throw tooBig();
      total += data.length;
      if (maxTotal && total > maxTotal) throw tooBig();
      out.set(name, data);
    }
    return out;
  }

  window.SageZip = { write, read, looksZip, crc32, decodeText: (bytes) => dec.decode(bytes) };
})();
