// Генерирует PNG-иконки без внешних зависимостей: тёмный фон, розовый круг, белый «play».
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const bg = [15, 15, 20];
const accent = [230, 76, 153];
const white = [255, 255, 255];

function icon(u, v) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const r = Math.hypot(dx, dy);
  if (r > 0.38) return bg;
  // Треугольник «play», слегка смещён вправо для оптического центра.
  const px = (u - 0.5) + 0.03;
  const py = v - 0.5;
  const inTriangle = px >= -0.14 && px <= 0.16 && Math.abs(py) <= (0.16 - px) * 0.62;
  if (inTriangle) return white;
  // Лёгкий градиент на круге.
  const t = (dy + 0.38) / 0.76;
  return accent.map((c, i) => Math.round(c * (1 - t * 0.25) + bg[i] * t * 0.25));
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, icon));
writeFileSync('public/icon-512.png', png(512, icon));
writeFileSync('public/apple-touch-icon.png', png(180, icon));
console.log('icons written to public/');
