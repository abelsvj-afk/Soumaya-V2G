// One-off, dependency-free icon generator for the PWA (built-in zlib only).
// Renders a deep-space scene with a glowing ringed "memory" planet, supersampled
// for smooth edges, and writes PNGs into packages/web/public/. Re-run with:
//   node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const ACCENT = [122, 249, 255]; // var(--accent) teal
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// --- minimal PNG (RGBA, 8-bit) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- scene, rendered at supersampled resolution then box-downsampled ---
function renderScene(S) {
  const buf = Buffer.alloc(S * S * 4);
  const cx = S * 0.5;
  const cy = S * 0.54;
  const R = S * 0.28; // planet radius
  // deterministic star field
  let seed = 1337;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const stars = Array.from({ length: Math.round(S * 0.06) }, () => ({
    x: rnd() * S,
    y: rnd() * S,
    r: rnd() * S * 0.004 + S * 0.0015,
    b: 0.5 + rnd() * 0.5,
  }));

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // background vertical gradient
      const t = y / S;
      let r = lerp(10, 20, t),
        g = lerp(6, 10, t),
        b = lerp(24, 46, t);
      // soft central nebula glow
      const dC = Math.hypot(x - cx, y - cy) / S;
      const glow = clamp01(1 - dC / 0.6) ** 2 * 0.5;
      r += ACCENT[0] * glow * 0.25;
      g += ACCENT[1] * glow * 0.25;
      b += ACCENT[2] * glow * 0.25;
      // stars
      for (const s of stars) {
        const d = Math.hypot(x - s.x, y - s.y);
        if (d < s.r * 2) {
          const a = clamp01(1 - d / (s.r * 2)) * s.b;
          r = lerp(r, 235, a);
          g = lerp(g, 245, a);
          b = lerp(b, 255, a);
        }
      }
      // ring (tilted ellipse) behind+front of planet
      const rx = (x - cx) / (R * 1.7);
      const ry = (y - cy) / (R * 0.55);
      const ringD = Math.abs(Math.hypot(rx, ry) - 1);
      if (ringD < 0.06) {
        const a = clamp01(1 - ringD / 0.06) * 0.85;
        r = lerp(r, ACCENT[0], a * 0.8);
        g = lerp(g, ACCENT[1], a * 0.8);
        b = lerp(b, ACCENT[2], a * 0.8);
      }
      // planet (drawn over the back half of the ring)
      const dp = Math.hypot(x - cx, y - cy);
      if (dp < R + 1.5) {
        const edge = clamp01(R - dp + 1.0);
        // shading: lit from upper-left
        const nx = (x - cx) / R,
          ny = (y - cy) / R;
        const light = clamp01(0.35 + 0.65 * (-nx * 0.5 - ny * 0.6 + 0.4));
        const pr = lerp(18, ACCENT[0], 0.15) * light + 30 * light;
        const pg = lerp(30, ACCENT[1], 0.5) * light;
        const pb = lerp(60, ACCENT[2], 0.7) * light;
        r = lerp(r, pr, edge);
        g = lerp(g, pg, edge);
        b = lerp(b, pb, edge);
        // rim light
        const rim = clamp01(1 - Math.abs(dp - R) / (R * 0.06)) * 0.6 * edge;
        r = lerp(r, 220, rim);
        g = lerp(g, 250, rim);
        b = lerp(b, 255, rim);
      }
      const i = (y * S + x) * 4;
      buf[i] = clamp01(r / 255) * 255;
      buf[i + 1] = clamp01(g / 255) * 255;
      buf[i + 2] = clamp01(b / 255) * 255;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

function makeIcon(size, ss = 2) {
  const S = size * ss;
  const hi = renderScene(S);
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const i = ((y * ss + dy) * S + (x * ss + dx)) * 4;
          r += hi[i]; g += hi[i + 1]; b += hi[i + 2]; a += hi[i + 3];
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return encodePng(size, size, out);
}

const dir = new URL("../packages/web/public/", import.meta.url);
for (const size of [192, 512, 180]) {
  const png = makeIcon(size);
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(new URL(name, dir), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
