import { deflateSync } from 'node:zlib';

/* a minimal PNG writer: 8-bit RGBA, no filtering, for images built pixel by pixel in Node */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]);
}
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const header = (width, height) => { const head = Buffer.alloc(13); head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head.set([8, 6, 0, 0, 0], 8); return chunk('IHDR', head); };
const pixels = (width, height, rgba) => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1); }
  return deflateSync(raw, { level: 9 });
};
function encodePNG(width, height, rgba) {
  return Buffer.concat([SIGNATURE, header(width, height), chunk('IDAT', pixels(width, height, rgba)), chunk('IEND', Buffer.alloc(0))]);
}
/* an animated PNG (APNG): full frames of one size, each shown for delay ms, looping forever. Viewers without
   APNG support show the first frame. */
function encodeAPNG(width, height, frames, delay) {
  let seq = 0;
  const out = [SIGNATURE, header(width, height)], u32 = (b, v, at) => b.writeUInt32BE(v, at);
  const actl = Buffer.alloc(8); u32(actl, frames.length, 0); u32(actl, 0, 4); out.push(chunk('acTL', actl));
  frames.forEach((rgba, n) => {
    const fctl = Buffer.alloc(26); u32(fctl, seq++, 0); u32(fctl, width, 4); u32(fctl, height, 8); u32(fctl, 0, 12); u32(fctl, 0, 16);
    fctl.writeUInt16BE(delay, 20); fctl.writeUInt16BE(1000, 22); fctl.set([0, 0], 24); out.push(chunk('fcTL', fctl));
    const data = pixels(width, height, rgba);
    if (n === 0) out.push(chunk('IDAT', data));
    else { const s = Buffer.alloc(4); u32(s, seq++, 0); out.push(chunk('fdAT', Buffer.concat([s, data]))); }
  });
  out.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}

export { encodeAPNG, encodePNG };
