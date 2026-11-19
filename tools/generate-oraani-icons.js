const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC_DIR = path.resolve(__dirname, '../client/public');
const SRC_512 = path.join(PUBLIC_DIR, 'oraani-icon-512.png');

function readPng(file) {
  const buf = fs.readFileSync(file);
  let offset = 8, w = 0, h = 0, idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(offset + 8);
      h = buf.readUInt32BE(offset + 12);
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = 1 + w * bpp;
  const uncompressed = Buffer.alloc(w * h * bpp);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  for (let y = 0; y < h; y++) {
    const filter = raw[y * stride];
    const rowStart = y * stride + 1;
    const outStart = y * w * bpp;
    const prevOutStart = (y - 1) * w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const val = raw[rowStart + x];
      const left = x >= bpp ? uncompressed[outStart + x - bpp] : 0;
      const up = y > 0 ? uncompressed[prevOutStart + x] : 0;
      const upLeft = (y > 0 && x >= bpp) ? uncompressed[prevOutStart + x - bpp] : 0;
      let res = 0;
      if (filter === 0) res = val;
      else if (filter === 1) res = (val + left) & 0xff;
      else if (filter === 2) res = (val + up) & 0xff;
      else if (filter === 3) res = (val + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) res = (val + paeth(left, up, upLeft)) & 0xff;
      uncompressed[outStart + x] = res;
    }
  }
  return { w, h, data: uncompressed };
}

function resizeRgba(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(srcH - 1, Math.floor(y * yRatio));
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(x * xRatio));
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return dst;
}

function makePng(w, h, rgba) {
  const scanlines = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    scanlines[y * (1 + w * 4)] = 0;
    rgba.copy(scanlines, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idatData = zlib.deflateSync(scanlines, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeInt32BE(crc);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1));
  }
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const src = readPng(SRC_512);
console.log(`Loaded Oraani icon: ${src.w}x${src.h}`);

// 1. Generate 192x192 icon
const icon192 = resizeRgba(src.data, src.w, src.h, 192, 192);
const png192 = makePng(192, 192, icon192);
fs.writeFileSync(path.join(PUBLIC_DIR, 'oraani-icon-192.png'), png192);
console.log('Generated oraani-icon-192.png');

// 2. Generate 180x180 apple-touch-icon
const icon180 = resizeRgba(src.data, src.w, src.h, 180, 180);
const png180 = makePng(180, 180, icon180);
fs.writeFileSync(path.join(PUBLIC_DIR, 'oraani-apple-touch-icon.png'), png180);
console.log('Generated oraani-apple-touch-icon.png');
