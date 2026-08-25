import * as THREE from "three";
import type { Level } from "./graphicsConfig.js";

/**
 * Deep-space ambience — the "other makeup of space" beyond stars + planets: drifting
 * colourful NEBULA CLOUDS, a faint interstellar DUST haze, and a few distant GALAXIES.
 * 100% PROCEDURAL (zero external assets, so it's safe to ship in a paid product) and
 * deliberately CHEAP — sprites + ONE points cloud — so it runs on mid-range mobile, not
 * just the top graphics tier. (An asteroid belt lived here once; it read as ugly floating
 * blocks up close on phones, so it was removed — depth now comes from haze + galaxies.)
 *
 * Counts scale with the device `level`. Everything animates via `userData.update` (the
 * Graph3D tick traverses the scene and calls it). Built at a neutral base extent; Graph3D
 * scales the whole group outward as the galaxy grows so it always sits "far out".
 */

const BASE = 9000; // the group's base radius; Graph3D scales it with the galaxy

/** count per quality level */
const byLevel = <T>(level: Level, low: T, med: T, high: T): T =>
  level === "low" ? low : level === "medium" ? med : high;

// ---- Drifting nebula clouds (big, colourful, slowly translate + morph) ----
function nebulaTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const tints = ["#7a3cff", "#1f8fff", "#ff3c9d", "#22d3a0", "#b388ff", "#ff7a4d"];
  for (let i = 0; i < 22; i++) {
    const x = 128 + (Math.random() - 0.5) * 150;
    const y = 128 + (Math.random() - 0.5) * 150;
    const r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = new THREE.Color(tints[Math.floor(Math.random() * tints.length)]!);
    const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    g.addColorStop(0, `rgba(${rgb},0.22)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  // Circular vignette so it never reads as a square.
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.55, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function makeNebulaCloud(): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: nebulaTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.07 + Math.random() * 0.05, // subtle haze, not a garish blob
  });
  const s = new THREE.Sprite(mat);
  const size = 2200 + Math.random() * 3200;
  s.scale.set(size, size, 1);
  const p = new THREE.Vector3(
    (Math.random() - 0.5) * BASE * 1.6,
    (Math.random() - 0.5) * BASE,
    (Math.random() - 0.5) * BASE * 1.6,
  );
  s.position.copy(p);
  const drift = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.3, (Math.random() - 0.5)).multiplyScalar(0.6);
  s.userData.update = (now: number) => {
    mat.rotation += 0.00025; // slow morph
    // Gentle bob around the spawn point so clouds feel alive without wandering off.
    s.position.x = p.x + Math.sin(now * 0.03) * drift.x * 40;
    s.position.y = p.y + Math.sin(now * 0.021) * drift.y * 40;
    s.position.z = p.z + Math.cos(now * 0.026) * drift.z * 40;
  };
  return s;
}

// ---- Interstellar dust haze (one faint Points cloud filling the volume) ----
function makeDust(count: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tints = [new THREE.Color("#6a86c8"), new THREE.Color("#8a5cff"), new THREE.Color("#c77fae"), new THREE.Color("#5fb8d8")];
  for (let i = 0; i < count; i++) {
    // Fill a rough sphere shell (skip the very centre where the galaxy lives).
    const r = BASE * (0.35 + Math.random() * 0.65);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = tints[Math.floor(Math.random() * tints.length)]!;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({ size: 26, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  points.userData.update = () => { points.rotation.y += 0.00004; }; // barely-there drift
  return points;
}

// ---- Distant galaxy billboards (fuzzy spiral discs, very slow rotation) ----
function galaxyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const edge = ["#7ab8ff", "#b388ff", "#ffc4f0", "#7af9ff"][Math.floor(Math.random() * 4)]!;
  // A bright core + swept arms drawn as fading dots.
  const core = ctx.createRadialGradient(128, 128, 0, 128, 128, 40);
  core.addColorStop(0, "rgba(255,240,210,0.9)");
  core.addColorStop(1, "rgba(255,240,210,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, 256, 256);
  const ec = new THREE.Color(edge);
  const ergb = `${Math.round(ec.r * 255)},${Math.round(ec.g * 255)},${Math.round(ec.b * 255)}`;
  const arms = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < 900; i++) {
    const t = Math.pow(Math.random(), 0.6);
    const arm = Math.floor(Math.random() * arms);
    const theta = t * 6 + (arm / arms) * Math.PI * 2;
    const rr = t * 118;
    const x = 128 + Math.cos(theta) * rr + (Math.random() - 0.5) * (1 - t) * 30;
    const y = 128 + Math.sin(theta) * rr * 0.55 + (Math.random() - 0.5) * (1 - t) * 30;
    ctx.fillStyle = `rgba(${ergb},${0.5 * (1 - t)})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  return new THREE.CanvasTexture(c);
}

function makeDistantGalaxy(): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: galaxyTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
  const s = new THREE.Sprite(mat);
  const size = 1400 + Math.random() * 1800;
  s.scale.set(size, size, 1);
  s.position.set((Math.random() - 0.5) * BASE * 1.7, (Math.random() - 0.5) * BASE * 1.2, (Math.random() - 0.5) * BASE * 1.7);
  s.userData.update = () => { mat.rotation += 0.00012; };
  return s;
}

// Split in two (Performance Program Stage 3):
//  - makeDeepSpace() — just the dust. A `Points` cloud is cheap fill-rate (each point
//    covers a few pixels), so it stays live/animated like the starfield and spiral
//    galaxies (see makeGalaxies in starfield.ts) — none of THOSE were ever the overdraw
//    problem.
//  - makeBackdropBakeSources() — the nebula clouds + distant-galaxy GLOW SPRITES. These
//    are the actual cost: large (1400-5400 world-unit) additive, depthWrite:false quads
//    that the GPU must re-blend every frame with zero early-Z rejection. They're rendered
//    once into a cubemap by backdropBake.ts and never added to the live scene — see
//    Graph3D.tsx's deepspace defer() block.
export function makeDeepSpace(level: Level): THREE.Group {
  const group = new THREE.Group();
  const dust = byLevel(level, 350, 800, 1500);
  group.add(makeDust(dust));
  return group;
}

/**
 * The expensive additive sprite layers, built fresh for a one-time bake — NOT added to
 * the live scene graph. Caller (backdropBake.ts) disposes these once the bake completes.
 */
export function makeBackdropBakeSources(level: Level): THREE.Object3D[] {
  const clouds = byLevel(level, 3, 5, 8);
  const galaxies = byLevel(level, 2, 3, 5);
  const items: THREE.Object3D[] = [];
  for (let i = 0; i < clouds; i++) items.push(makeNebulaCloud());
  for (let i = 0; i < galaxies; i++) items.push(makeDistantGalaxy());
  return items;
}

/** The base radius the group is authored at (Graph3D scales relative to this). */
export const DEEP_SPACE_BASE = BASE;
