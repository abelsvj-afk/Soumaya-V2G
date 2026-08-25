import * as THREE from "three";
import type { Journey } from "@brain/shared";

/**
 * Living Galaxy — Journey hubs (Vision 2.0). Each active Journey renders as a bright HUB STAR
 * that grows brighter as its progress rises and DIMS when it's cold (paused). They sit in their
 * own high ring above the galaxy — the highest-level "chapters of your life" watching over the
 * memories below. Cheap: a star sprite + a label per journey. Reduced-motion holds a steady glow.
 * See docs/VISION_2_JOURNEYS.md ("Living Galaxy").
 */

const RING_RADIUS = 1000; // authored radius; Graph3D scales the group with the galaxy

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; } catch { return false; }
};

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.userData.shared = true; // one instance reused by every hub sprite — never dispose per-rebuild
  return t;
}
const HALO = haloTexture();

function labelTexture(icon: string, title: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = "600 46px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  const text = `${icon} ${title}`.slice(0, 40);
  ctx.fillText(text, 256, 70);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Build the Journey-hub group from active journeys (each carries userData.journeyId). */
export function makeJourneyHubs(journeys: Journey[]): THREE.Group {
  const group = new THREE.Group();
  group.userData.isJourneyHubs = true;
  const calm = prefersReducedMotion();
  const active = journeys.filter((j) => j.status !== "done");
  const n = Math.max(1, active.length);

  active.forEach((j, i) => {
    const progress = Math.max(0, Math.min(1, j.progress ?? 0));
    const cold = j.status === "paused";
    // Colour: the journey's accent (or a warm gold), cooled toward slate when paused.
    const base = new THREE.Color(j.color || "#ffe9a8");
    if (cold) base.lerp(new THREE.Color("#5a6b8c"), 0.65);

    const mat = new THREE.SpriteMaterial({ map: HALO, color: base, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const hub = new THREE.Sprite(mat);
    // Size + brightness rise with progress; a stalled/cold journey is small + dim.
    const size = 120 + progress * 160;
    hub.scale.set(size, size, 1);

    const a = (i / n) * Math.PI * 2;
    hub.position.set(Math.cos(a) * RING_RADIUS, RING_RADIUS * 0.7 + Math.sin(a * 1.2) * 80, Math.sin(a) * RING_RADIUS);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(j.icon ?? "🧭", j.title), transparent: true, depthWrite: false }));
    label.scale.set(size * 2.2, size * 0.55, 1);
    label.position.set(hub.position.x, hub.position.y + size * 0.7, hub.position.z);

    const baseOp = cold ? 0.28 : 0.45 + progress * 0.5; // brighter with progress; dim when cold
    const phase = i * 1.3;
    hub.userData.journeyId = j.id;
    hub.userData.update = (t: number) => {
      if (calm) { mat.opacity = baseOp; return; }
      // Gentle "alive" breathing, stronger for more-progressed journeys; barely-there when cold.
      const amp = cold ? 0.04 : 0.08 + progress * 0.12;
      mat.opacity = baseOp + amp * (0.5 + 0.5 * Math.sin(t * (0.5 + progress) + phase));
    };

    group.add(hub, label);
  });

  return group;
}

/** The base radius the group is authored at (Graph3D scales relative to this). */
export const JOURNEY_HUBS_BASE = RING_RADIUS;
