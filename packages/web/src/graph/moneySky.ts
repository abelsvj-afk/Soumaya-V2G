import * as THREE from "three";
import type { MoneyStar, MoneyStarState } from "@brain/shared";

/**
 * Money-sky (Stage 4A) — renders your bills as small STARS in their own compact "money
 * constellation" (a gentle ring, set apart from memory bodies). Meaning is carried by
 * colour + glow + a status glyph + motion, never colour alone:
 *  - overdue / approaching (urgent) → RED, PULSING (the user asked for a red urgency pulse)
 *  - cooling (can't cover it) → BLUE, dim + slow shiver (the user's blue)
 *  - calm → soft gold, gentle twinkle · paid → calm green, steady
 * Reduced-motion holds the pulse at a steady mid-state (colour + glyph still encode it).
 * Cheap: two sprites per bill. Positions/scale are handled by Graph3D like the other scenery.
 */

const RING_RADIUS = 1400; // authored radius; Graph3D scales the group with the galaxy

const COLOR: Record<MoneyStarState, string> = {
  calm: "#ffe9a8",
  approaching: "#ff6a4d", // urgent → red-orange
  cooling: "#4fa3ff", // the user's blue
  overdue: "#ff3b3b", // urgent → red
  paid: "#7af9c0",
  goal_filling: "#ffd166",
  goal_reached: "#fff3da",
};

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.userData.shared = true; // one instance reused by every star sprite — never dispose per-rebuild
  return t;
}
const STAR_TEX = starTexture();

function glyphTexture(glyph: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.fillText(glyph, 32, 34);
  return new THREE.CanvasTexture(c);
}

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; } catch { return false; }
};

/** Build the money-sky group from the server's MoneyStar[]. Each carries `userData.moneyId`. */
export function makeMoneySky(stars: MoneyStar[]): THREE.Group {
  const group = new THREE.Group();
  group.userData.isMoneySky = true;
  const calm = prefersReducedMotion();
  const n = Math.max(1, stars.length);

  stars.forEach((s, i) => {
    const color = new THREE.Color(COLOR[s.state]);
    const urgent = s.state === "overdue" || s.state === "approaching";
    const cool = s.state === "cooling";

    const mat = new THREE.SpriteMaterial({ map: STAR_TEX, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const star = new THREE.Sprite(mat);
    const size = 60 + (s.amountCents / 100) * 0.05; // bigger bills read a touch larger, kept small
    star.scale.set(size, size, 1);

    // Lay them in a gentle ring, lifted above the galaxy plane so they read as "your money sky".
    const a = (i / n) * Math.PI * 2;
    star.position.set(Math.cos(a) * RING_RADIUS, RING_RADIUS * 0.55 + Math.sin(a * 1.3) * 90, Math.sin(a) * RING_RADIUS);

    // Status glyph floating just above the star.
    const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(s.glyph, "#ffffff"), transparent: true, depthWrite: false }));
    glyph.scale.set(size * 0.6, size * 0.6, 1);
    glyph.position.set(star.position.x, star.position.y + size * 0.75, star.position.z);

    const phase = i * 1.7;
    star.userData.moneyId = s.id;
    star.userData.moneyKind = s.kind;
    star.userData.update = (t: number) => {
      let scale = size;
      let op = 0.9;
      if (calm) {
        op = urgent ? 1 : cool ? 0.55 : 0.8;
      } else if (urgent) {
        // The red urgency pulse — faster + stronger as intensity rises.
        const p = 0.5 + 0.5 * Math.sin(t * (2.2 + s.intensity * 2.4) + phase);
        scale = size * (1 + 0.28 * p);
        op = 0.7 + 0.3 * p;
      } else if (cool) {
        op = 0.45 + 0.1 * Math.sin(t * 0.6 + phase); // dim, slow shiver
      } else {
        op = 0.7 + 0.15 * Math.sin(t * 1.1 + phase); // gentle twinkle
      }
      star.scale.set(scale, scale, 1);
      mat.opacity = op;
      glyph.position.set(star.position.x, star.position.y + scale * 0.75, star.position.z);
    };

    group.add(star, glyph);
  });

  return group;
}

/** The base radius the group is authored at (Graph3D scales relative to this). */
export const MONEY_SKY_BASE = RING_RADIUS;
