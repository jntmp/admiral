import {
  CanvasTexture,
  NearestFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { COURT } from './config.js';

export const PALETTE = {
  wood: '#dca064',
  woodLight: '#e9b77c',
  woodDark: '#c48850',
  teal: '#1f6670',
  tealDark: '#184f58',
  line: '#f4ecd6',
  ball: '#ee7a2c',
  seam: '#2b1408',
  rim: '#ff4d2e',
  amber: '#ffc23d',
  navy: '#121833',
};

// 3x5 bitmap font, one string per row. Enough glyphs for the scoreboard and
// banners, drawn pixel by pixel so it stays crisp on nearest-filtered textures.
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'], ' ': ['...', '...', '...', '...', '...'],
};

export function textWidth(text, scale = 1) {
  return text.length ? (text.length * 4 - 1) * scale : 0;
}

export function drawText(ctx, text, x, y, scale, color) {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] === '#') ctx.fillRect(cx + gx * scale, Math.round(y) + gy * scale, scale, scale);
      }
    });
    cx += 4 * scale;
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function pixelTexture(c, { repeat = false, mipmaps = true } = {}) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = NearestFilter;
  t.minFilter = mipmaps ? NearestMipmapNearestFilter : NearestFilter;
  t.generateMipmaps = mipmaps;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

// Deterministic noise so the art doesn't change between loads.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function ballTexture() {
  const [c, ctx] = canvas(64, 32);
  const rand = rng(7);
  ctx.fillStyle = PALETTE.ball;
  ctx.fillRect(0, 0, 64, 32);
  // Pebbled leather.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rand() < 0.5 ? '#d9661f' : '#f7934a';
    ctx.fillRect((rand() * 64) | 0, (rand() * 32) | 0, 1, 1);
  }
  ctx.fillStyle = PALETTE.seam;
  ctx.fillRect(0, 15, 64, 2); // equator
  ctx.fillRect(0, 0, 1, 32); // one full meridian…
  ctx.fillRect(32, 0, 1, 32); // …and its other half
  for (let y = 0; y < 32; y++) {
    const bow = Math.round(Math.sin((Math.PI * y) / 31) * 9);
    ctx.fillRect(16 - bow, y, 1, 1);
    ctx.fillRect(48 + bow, y, 1, 1);
  }
  return pixelTexture(c, { mipmaps: false });
}

// The whole floor as one texture. World x runs -10..10 and z runs -3.5..14.
export const FLOOR = { minX: -10, maxX: 10, minZ: -3.5, maxZ: 14, ppm: 32 };

export function floorTexture() {
  const w = (FLOOR.maxX - FLOOR.minX) * FLOOR.ppm;
  const h = (FLOOR.maxZ - FLOOR.minZ) * FLOOR.ppm;
  const [c, ctx] = canvas(w, h);
  const rand = rng(42);
  const px = (x) => Math.round((x - FLOOR.minX) * FLOOR.ppm);
  const pz = (z) => Math.round((z - FLOOR.minZ) * FLOOR.ppm);

  // Maple planks run the length of the court, butt joints staggered.
  const plank = 8;
  const woods = [PALETTE.wood, PALETTE.woodLight, PALETTE.woodDark, '#d49758', '#e2aa6c'];
  for (let x = 0; x < w; x += plank) {
    let y = -Math.floor(rand() * 80);
    while (y < h) {
      const len = 48 + Math.floor(rand() * 64);
      ctx.fillStyle = woods[Math.floor(rand() * woods.length)];
      ctx.fillRect(x, y, plank, len);
      ctx.fillStyle = 'rgba(90,50,20,0.35)';
      ctx.fillRect(x, y, plank, 1);
      y += len;
    }
    ctx.fillStyle = 'rgba(90,50,20,0.25)';
    ctx.fillRect(x, 0, 1, h);
  }
  // Grain flecks.
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120,70,30,0.22)' : 'rgba(255,230,190,0.18)';
    ctx.fillRect((rand() * w) | 0, (rand() * h) | 0, 1, 2 + ((rand() * 3) | 0));
  }

  const { baseline, halfWidth, threeRadius, threeCornerX, keyHalfWidth, freeThrow } = COURT;
  const halfCourt = baseline + 14;

  // Painted apron outside the lines.
  ctx.fillStyle = PALETTE.teal;
  ctx.fillRect(0, 0, w, pz(baseline));
  ctx.fillRect(0, 0, px(-halfWidth), h);
  ctx.fillRect(px(halfWidth), 0, w - px(halfWidth), h);
  // The key.
  ctx.fillRect(px(-keyHalfWidth), pz(baseline), px(keyHalfWidth) - px(-keyHalfWidth), pz(freeThrow) - pz(baseline));

  const dot = (x, z, size = 2) => ctx.fillRect(px(x) - (size >> 1), pz(z) - (size >> 1), size, size);
  const line = (x0, z0, x1, z1) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * FLOOR.ppm);
    for (let i = 0; i <= steps; i++) dot(x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * i) / steps);
  };
  const arc = (cx, cz, r, a0, a1, dash = false) => {
    const steps = Math.ceil(Math.abs(a1 - a0) * r * FLOOR.ppm);
    for (let i = 0; i <= steps; i++) {
      if (dash && Math.floor(i / 10) % 2) continue;
      const a = a0 + ((a1 - a0) * i) / steps;
      dot(cx + Math.sin(a) * r, cz + Math.cos(a) * r);
    }
  };

  ctx.fillStyle = PALETTE.line;
  line(-halfWidth, baseline, halfWidth, baseline);
  line(-halfWidth, baseline, -halfWidth, halfCourt);
  line(halfWidth, baseline, halfWidth, halfCourt);
  line(-halfWidth, halfCourt, halfWidth, halfCourt);
  // Three-point line: corner straights into the arc.
  const cornerZ = Math.sqrt(threeRadius ** 2 - threeCornerX ** 2);
  line(-threeCornerX, baseline, -threeCornerX, cornerZ);
  line(threeCornerX, baseline, threeCornerX, cornerZ);
  const edge = Math.asin(threeCornerX / threeRadius);
  arc(0, 0, threeRadius, -edge, edge);
  // Key outline, free-throw circle, restricted area.
  line(-keyHalfWidth, baseline, -keyHalfWidth, freeThrow);
  line(keyHalfWidth, baseline, keyHalfWidth, freeThrow);
  line(-keyHalfWidth, freeThrow, keyHalfWidth, freeThrow);
  arc(0, freeThrow, 1.8, -Math.PI / 2, Math.PI / 2);
  arc(0, freeThrow, 1.8, Math.PI / 2, Math.PI * 1.5, true);
  arc(0, 0, 1.25, -Math.PI / 2, Math.PI / 2);
  // Centre circle, cut off by the edge of the texture.
  ctx.fillStyle = PALETTE.teal;
  ctx.beginPath();
  ctx.arc(px(0), pz(halfCourt), 1.8 * FLOOR.ppm, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.line;
  arc(0, halfCourt, 1.8, 0, Math.PI * 2);

  return pixelTexture(c);
}

export function boardTexture() {
  const [c, ctx] = canvas(64, 38);
  ctx.fillStyle = '#e9f1f4';
  ctx.fillRect(0, 0, 64, 38);
  ctx.fillStyle = '#d6e3ea';
  for (let i = 0; i < 6; i++) ctx.fillRect(6 + i * 9, 3, 2, 32);
  ctx.fillStyle = PALETTE.rim;
  ctx.fillRect(0, 0, 64, 2);
  ctx.fillRect(0, 36, 64, 2);
  ctx.fillRect(0, 0, 2, 38);
  ctx.fillRect(62, 0, 2, 38);
  // Shooter's square, 59cm x 45cm, sitting on the rim.
  const x0 = 21;
  const y0 = 17;
  ctx.fillRect(x0, y0, 22, 2);
  ctx.fillRect(x0, y0, 2, 16);
  ctx.fillRect(x0 + 20, y0, 2, 16);
  return pixelTexture(c, { mipmaps: false });
}

export function wallTexture() {
  const [c, ctx] = canvas(32, 32);
  ctx.fillStyle = '#1c2447';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#212a52';
  ctx.fillRect(0, 0, 15, 32);
  ctx.fillStyle = '#161c3a';
  ctx.fillRect(15, 0, 1, 32);
  ctx.fillRect(31, 0, 1, 32);
  return pixelTexture(c, { repeat: true });
}

export function bannerTexture(top, bottom, color) {
  const [c, ctx] = canvas(24, 40);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 24, 34);
  // Swallowtail.
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(0, 34 + i, 12 - i * 2, 1);
    ctx.fillRect(12 + i * 2, 34 + i, 12 - i * 2, 1);
  }
  ctx.fillStyle = PALETTE.line;
  ctx.fillRect(2, 2, 20, 1);
  ctx.fillRect(2, 31, 20, 1);
  drawText(ctx, top, 12 - textWidth(top) / 2, 8, 1, PALETTE.line);
  drawText(ctx, bottom, 12 - textWidth(bottom, 2) / 2, 17, 2, PALETTE.amber);
  return pixelTexture(c, { mipmaps: false });
}

// Live scoreboard; call update() whenever the numbers change.
export function scoreboardTexture() {
  const [c, ctx] = canvas(96, 44);
  const texture = pixelTexture(c, { mipmaps: false });
  let last = '';
  texture.update = (score, time, best) => {
    const key = `${score}|${time}|${best}`;
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, 96, 44);
    // Unlit LED grid.
    ctx.fillStyle = '#141626';
    for (let y = 1; y < 44; y += 2) for (let x = 1; x < 96; x += 2) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = PALETTE.rim;
    ctx.fillRect(0, 0, 96, 1);
    ctx.fillRect(0, 43, 96, 1);
    drawText(ctx, 'HOME', 6, 4, 1, PALETTE.line);
    drawText(ctx, 'TIME', 96 - 6 - textWidth('TIME'), 4, 1, PALETTE.line);
    const s = String(score).padStart(2, '0');
    drawText(ctx, s, 6, 12, 4, PALETTE.amber);
    const t = String(Math.max(0, Math.ceil(time))).padStart(2, '0');
    drawText(ctx, t, 90 - textWidth(t, 4), 12, 4, time <= 10 ? PALETTE.rim : PALETTE.amber);
    const b = `BEST ${best}`;
    drawText(ctx, b, 48 - textWidth(b) / 2, 36, 1, '#8a93b8');
    texture.needsUpdate = true;
  };
  return texture;
}
