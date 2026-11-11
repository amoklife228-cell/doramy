// Генерирует PNG-иконки без внешних зависимостей: красный градиент, белое сердце с «play» внутри.
// Фон на весь квадрат: скругление углов iOS и Android накладывают сами.
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

/* ---------- Рисунок: красный градиент, белое сердце, внутри вырезан «play» ---------- */

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const smooth = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Знаковое расстояние до сердца (остриё в начале координат, ось Y вверх, высота около 1.1). */
function sdHeart(x, y) {
  x = Math.abs(x);
  if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const a = x * x + (y - 1) * (y - 1);
  const m = 0.5 * Math.max(x + y, 0);
  const b = (x - m) * (x - m) + (y - m) * (y - m);
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y);
}

/** Знаковое расстояние до треугольника с вершинами a, b, c. */
function sdTriangle(px, py, a, b, c) {
  const pts = [a, b, c];
  let best = Infinity;
  let side = Infinity;
  const s = Math.sign((b[0] - a[0]) * (a[1] - c[1]) - (b[1] - a[1]) * (a[0] - c[0]));
  for (let i = 0; i < 3; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 3];
    const ex = p1[0] - p0[0];
    const ey = p1[1] - p0[1];
    const vx = px - p0[0];
    const vy = py - p0[1];
    const t = clamp01((vx * ex + vy * ey) / (ex * ex + ey * ey));
    const qx = vx - ex * t;
    const qy = vy - ey * t;
    best = Math.min(best, qx * qx + qy * qy);
    side = Math.min(side, s * (vx * ey - vy * ex));
  }
  return -Math.sqrt(best) * Math.sign(side);
}

// Геометрия в долях стороны иконки.
const HEART_SCALE = 0.44;
const HEART_ROUND = 0.036;
const HEART_TIP_V = 0.762;
const heartDist = (u, v) =>
  sdHeart((u - 0.5) / HEART_SCALE, (HEART_TIP_V - v) / HEART_SCALE) * HEART_SCALE - HEART_ROUND;

const PLAY_CX = 0.512;
const PLAY_CY = 0.452;
const PLAY_R = 0.098;
const PLAY_ROUND = 0.024;
const PLAY = [
  [PLAY_CX + PLAY_R, PLAY_CY],
  [PLAY_CX - PLAY_R / 2, PLAY_CY - PLAY_R * 0.866],
  [PLAY_CX - PLAY_R / 2, PLAY_CY + PLAY_R * 0.866],
];
const playDist = (u, v) => sdTriangle(u, v, PLAY[0], PLAY[1], PLAY[2]) - PLAY_ROUND;

const BG_TOP = [255, 62, 66];
const BG_BOTTOM = [150, 0, 22];
const SHADOW = [92, 0, 16];
const HEART_TOP = [255, 255, 255];
const HEART_BOTTOM = [255, 228, 226];
const PLAY_TOP = [242, 40, 48];
const PLAY_BOTTOM = [188, 8, 28];

function makeIcon(size) {
  const px = 1 / size; // ширина сглаживания: один пиксель
  const cover = (d) => clamp01(0.5 - d / px);
  return (u0, v0) => {
    // Центр пикселя, а не его левый верхний угол.
    const u = u0 + px / 2;
    const v = v0 + px / 2;

    // Фон: диагональный градиент, мягкий блик сверху слева, лёгкое затемнение к низу.
    let c = mix(BG_TOP, BG_BOTTOM, smooth((u * 0.35 + v * 0.9) / 1.25));
    const glow = Math.max(0, 1 - Math.hypot(u - 0.24, v - 0.14) / 0.75);
    c = mix(c, [255, 120, 96], glow * glow * 0.3);
    const vignette = smooth((Math.hypot(u - 0.5, v - 0.5) - 0.45) / 0.35);
    c = mix(c, [110, 0, 18], vignette * 0.35);

    // Тень под сердцем.
    const shadow = 1 - smooth((heartDist(u, v - 0.03) + 0.012) / 0.07);
    c = mix(c, SHADOW, shadow * 0.42);

    // Сердце.
    const heart = cover(heartDist(u, v));
    c = mix(c, mix(HEART_TOP, HEART_BOTTOM, smooth((v - 0.3) / 0.45)), heart);

    // «Play» внутри сердца.
    const play = cover(playDist(u, v)) * heart;
    c = mix(c, mix(PLAY_TOP, PLAY_BOTTOM, smooth((v - 0.36) / 0.2)), play);

    return c.map((x) => Math.round(clamp01(x / 255) * 255));
  };
}

const outDir = process.argv[2] ?? 'public';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/icon-192.png`, png(192, makeIcon(192)));
writeFileSync(`${outDir}/icon-512.png`, png(512, makeIcon(512)));
writeFileSync(`${outDir}/apple-touch-icon.png`, png(180, makeIcon(180)));
console.log(`icons written to ${outDir}/`);
