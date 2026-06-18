/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Aura-class Beacons — Soumaya's deployed relay satellites.
 *
 * PURPOSE (tied to the Celestial Economy's entropy): a small fleet of probes that
 * autonomously seek out memories going COLD from neglect (high `entropy`) and take
 * up orbit around them, firing a warm tractor BEAM down onto the memory. They make
 * the abstract cooling signal physical — a satellite beaming a memory is Soumaya
 * saying "this one is fading, come back to it." Tend the memory (focus it →
 * entropy resets) and the beam cuts out; the beacon drifts to the next-coldest.
 *
 * LORE: the Aura beacons are older than the ship — salvaged warmth-relays Soumaya
 * keeps in the dark between the memories. They cannot rekindle a memory themselves;
 * only you can. So they do the one thing they can: pin a warm beam to a cooling
 * thought and hold it there until you return. (Drifters give them a wide berth —
 * the relays' beam scrambles a wanderer's bearings, so the aliens fear them.)
 *
 * Procedural fallback first; the real glTF swaps in when it loads. Self-animated
 * from the Graph3D tick via update(dt, nodes).
 */

export const SATELLITE_NAME = "Aura-class Beacon";
export const SATELLITE_LORE =
  "Soumaya's salvaged warmth-relays. They drift to memories going cold and pin a " +
  "warm beam onto them — they can't rekindle a fading thought, only you can, so they " +
  "make sure none cools unseen. Visit a beamed memory to warm it; the beacon moves on. " +
  "Drifters fear them: the beam scrambles a wanderer's bearings, so the aliens keep clear.";

/** A memory is "going cold" (worth a beacon) at/above this entropy. */
const COLD_THRESHOLD = 0.45;

const vecOf = (n: any): THREE.Vector3 => new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);

/** Approximate a body's visual radius (mirrors nodeObject sizing) for standoff. */
const bodyRadius = (n: any): number => {
  const m = n.mass ?? 0.3;
  switch (n.celestial) {
    case "supergiant": return 9 + m * 7;
    case "star": return 6 + m * 6;
    case "giant": return 6.5 + m * 5;
    case "planet": return 4 + m * 4;
    case "moon": return 3 + m * 2.5;
    default: return 2.2 + m * 2;
  }
};

function makeGlowSprite(inner: string, mid: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/** A single procedural satellite (central bus + solar panels + dish) + running light. */
function makeProbe(): { group: THREE.Group; light: THREE.Sprite; fallback: THREE.Group } {
  const group = new THREE.Group();

  const fallback = new THREE.Group();
  const busMat = new THREE.MeshStandardMaterial({
    color: "#cfd6e8",
    emissive: new THREE.Color("#ffae50"),
    emissiveIntensity: 0.5,
    metalness: 0.85,
    roughness: 0.25,
  });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 2.6), busMat);
  fallback.add(bus);

  const panelMat = new THREE.MeshStandardMaterial({
    color: "#21407a",
    emissive: new THREE.Color("#2a5cff"),
    emissiveIntensity: 0.35,
    metalness: 0.6,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 2.4), panelMat);
    panel.position.set(sx * 4.2, 0, 0);
    fallback.add(panel);
  }
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 0.2, 0.5, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color: "#eef2ff",
      emissive: new THREE.Color("#ffd28a"),
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.3,
      side: THREE.DoubleSide,
    }),
  );
  dish.rotation.x = Math.PI / 2;
  dish.position.set(0, 1.4, 0);
  fallback.add(dish);
  group.add(fallback);

  // Small running light on the probe itself (the beam below does the heavy lifting).
  const light = makeGlowSprite("rgba(255,210,130,0.95)", "rgba(255,170,80,0.3)");
  light.scale.set(10, 10, 1);
  group.add(light);

  group.scale.setScalar(1.5);
  group.visible = false;

  // Swap in the real glTF satellite once it loads (keep its own materials).
  new GLTFLoader().load(
    "/aura-satellite.glb",
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      const k = 12 / maxDim;
      model.scale.setScalar(k);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-k));
      fallback.visible = false;
      group.add(model);
    },
    undefined,
    (err) => console.warn("[satellites] model failed to load; using procedural probe", err),
  );

  return { group, light, fallback };
}

/** A warm tractor beam (a tapered cylinder) that connects the probe to its memory. */
function makeBeam(): THREE.Mesh {
  // Unit cylinder along +Y; we orient + scale it between the two points each frame.
  const geom = new THREE.CylinderGeometry(0.18, 1.1, 1, 10, 1, true);
  geom.translate(0, 0.5, 0); // base at y=0, tip at y=1 so we can anchor at the probe
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#ffb24d"),
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(geom, mat);
  beam.visible = false;
  return beam;
}

const UP = new THREE.Vector3(0, 1, 0);

interface Slot {
  probe: ReturnType<typeof makeProbe>;
  beam: THREE.Mesh;
  impact: THREE.Sprite;
  targetId: number | null;
  angle: number;
  spin: number;
  fade: number; // 0..1 visibility ease
}

export interface SatelliteSystem {
  group: THREE.Group;
  update: (dt: number, nodes: any[]) => void;
  /** Active beacons (currently beaming a memory) — for the focus button. */
  getActive: () => { object: THREE.Object3D; targetId: number }[];
  /** Ids of memories currently under a beam (drifters avoid these). */
  getBeaconedIds: () => Set<number>;
  /** World positions of active beacons (drifters flee these). */
  getPositions: () => THREE.Vector3[];
}

export function makeSatellites(maxCount = 3): SatelliteSystem {
  const group = new THREE.Group();
  const slots: Slot[] = [];
  for (let i = 0; i < maxCount; i++) {
    const probe = makeProbe();
    const beam = makeBeam();
    const impact = makeGlowSprite("rgba(255,235,190,0.95)", "rgba(255,180,90,0.45)");
    impact.visible = false;
    group.add(probe.group, beam, impact);
    slots.push({ probe, beam, impact, targetId: null, angle: Math.random() * Math.PI * 2, spin: 0, fade: 0 });
  }

  let retarget = 0;

  const reassign = (nodes: any[]) => {
    // Rank memories by neglect (coldest first). We always keep at least one beacon
    // on patrol over the most-neglected memory so the fleet is visibly present even
    // in a young, warm galaxy; the fleet GROWS as more memories actually go cold.
    const ranked = nodes
      .filter((n) => n.kind !== "action" && n.x != null)
      .sort((a, b) => (b.entropy ?? 0) - (a.entropy ?? 0));
    if (ranked.length === 0) {
      for (const s of slots) s.targetId = null;
      return;
    }
    const coldCount = ranked.filter((n) => (n.entropy ?? 0) >= COLD_THRESHOLD).length;
    const desired = Math.min(slots.length, ranked.length, Math.max(1, coldCount));
    const wanted = new Set(ranked.slice(0, desired).map((n) => n.id));

    // Drop slots whose target is no longer wanted; keep the ones still in the set.
    const taken = new Set<number>();
    for (const s of slots) {
      if (s.targetId != null && wanted.has(s.targetId)) taken.add(s.targetId);
      else s.targetId = null;
    }
    // Fill free slots with the wanted memories not already covered.
    const fill = ranked.slice(0, desired).filter((n) => !taken.has(n.id));
    let fi = 0;
    for (const s of slots) {
      if (s.targetId != null) continue;
      if (fi < fill.length) s.targetId = fill[fi++]!.id;
    }
  };

  const update = (dt: number, nodes: any[]) => {
    try {
      retarget -= dt;
      if (retarget <= 0) {
        reassign(nodes);
        retarget = 2.5; // re-evaluate the cold list a few times a minute
      }
      for (const s of slots) {
        const g = s.probe.group;
        const target = s.targetId != null ? nodes.find((n) => n.id === s.targetId) : null;
        const tp = target && target.x != null ? vecOf(target) : null;

        const wantVisible = tp != null;
        s.fade = THREE.MathUtils.clamp(s.fade + (wantVisible ? dt : -dt) * 1.5, 0, 1);
        g.visible = s.fade > 0.02;

        if (!g.visible || !tp || !target) {
          s.beam.visible = false;
          s.impact.visible = false;
          continue;
        }

        const radius = bodyRadius(target);
        const standoff = radius + 18;
        s.angle += dt * 0.6;
        const want = new THREE.Vector3(
          tp.x + Math.cos(s.angle) * standoff,
          tp.y + Math.sin(s.angle * 0.7) * standoff * 0.4,
          tp.z + Math.sin(s.angle) * standoff,
        );
        const dir = want.clone().sub(g.position);
        const d = dir.length();
        g.position.addScaledVector(dir.normalize(), Math.min(d, 220 * dt));
        g.lookAt(tp);
        g.scale.setScalar(1.5 * (0.4 + 0.6 * s.fade));

        const entropy = target.entropy ?? 0.5;
        s.spin += dt;
        const pulse = 0.7 + 0.3 * Math.sin(s.spin * 3);

        // Running light on the probe.
        const ls = 9 * pulse * s.fade;
        s.probe.light.scale.set(ls, ls, 1);
        (s.probe.light.material as THREE.SpriteMaterial).opacity = 0.6 * s.fade;

        // --- The real beam: from the probe down to the memory's surface. ---
        const from = g.position.clone();
        const beamDir = tp.clone().sub(from);
        const len = Math.max(0.001, beamDir.length() - radius); // stop at the surface
        beamDir.normalize();
        s.beam.visible = true;
        s.beam.position.copy(from);
        s.beam.quaternion.setFromUnitVectors(UP, beamDir);
        // Width pulses + grows with how cold the memory is; length spans the gap.
        const width = (0.5 + entropy * 0.9) * (0.85 + 0.15 * Math.sin(s.spin * 5));
        s.beam.scale.set(width, len, width);
        (s.beam.material as THREE.MeshBasicMaterial).opacity = (0.22 + entropy * 0.4) * pulse * s.fade;

        // Impact glow where the beam strikes the surface.
        const hit = from.clone().addScaledVector(beamDir, len);
        s.impact.visible = true;
        s.impact.position.copy(hit);
        const isz = (radius * 1.4 + 6) * (0.85 + 0.15 * Math.sin(s.spin * 6));
        s.impact.scale.set(isz, isz, 1);
        (s.impact.material as THREE.SpriteMaterial).opacity = (0.4 + entropy * 0.5) * s.fade;
      }
    } catch {
      /* skip frame */
    }
  };

  const getActive = () =>
    slots
      .filter((s) => s.targetId != null && s.fade > 0.5)
      .map((s) => ({ object: s.probe.group as THREE.Object3D, targetId: s.targetId as number }));

  const getBeaconedIds = () =>
    new Set(slots.filter((s) => s.targetId != null && s.fade > 0.3).map((s) => s.targetId as number));

  const getPositions = () =>
    slots.filter((s) => s.fade > 0.3).map((s) => s.probe.group.position.clone());

  return { group, update, getActive, getBeaconedIds, getPositions };
}
