/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Aura-class Beacons — Soumaya's deployed relay satellites.
 *
 * PURPOSE (tied to the Celestial Economy's entropy): a small fleet of probes that
 * autonomously seek out memories going COLD from neglect (high `entropy`) and take
 * up orbit around them, pulsing a warm beacon. They make the abstract cooling
 * signal physical — a satellite circling a memory is Soumaya saying "this one is
 * fading, come back to it." Tend the memory (focus it → entropy resets) and the
 * beacon's work is done; it drifts off to the next-coldest star.
 *
 * LORE: the Aura beacons are older than the ship — salvaged warmth-relays Soumaya
 * keeps in the dark between the memories. They cannot rekindle a memory themselves;
 * only you can. So they do the one thing they can: they refuse to let a cooling
 * thought go dark unseen, and hold a light over it until you return.
 *
 * Procedural fallback first; the real glTF swaps in when it loads. Self-animated
 * from the Graph3D tick via update(dt, nodes).
 */

export const SATELLITE_NAME = "Aura-class Beacon";
export const SATELLITE_LORE =
  "Soumaya's salvaged warmth-relays. They drift to memories going cold and hold a " +
  "beacon over them — they can't rekindle a fading thought, only you can, so they " +
  "make sure none cools unseen. Visit a beaconed memory to warm it; the beacon moves on.";

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

function makeBeaconSprite(): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,210,130,0.95)");
  g.addColorStop(0.4, "rgba(255,170,80,0.35)");
  g.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  s.scale.set(34, 34, 1);
  return s;
}

/** A single procedural satellite (central bus + solar panels + dish) + beacon. */
function makeProbe(): { group: THREE.Group; beacon: THREE.Sprite; fallback: THREE.Group } {
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

  const beacon = makeBeaconSprite();
  group.add(beacon);

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

  return { group, beacon, fallback };
}

interface Slot {
  probe: ReturnType<typeof makeProbe>;
  targetId: number | null;
  angle: number;
  spin: number;
  fade: number; // 0..1 visibility ease
}

export interface SatelliteSystem {
  group: THREE.Group;
  update: (dt: number, nodes: any[]) => void;
}

export function makeSatellites(maxCount = 3): SatelliteSystem {
  const group = new THREE.Group();
  const slots: Slot[] = [];
  for (let i = 0; i < maxCount; i++) {
    const probe = makeProbe();
    group.add(probe.group);
    slots.push({ probe, targetId: null, angle: Math.random() * Math.PI * 2, spin: 0, fade: 0 });
  }

  let retarget = 0;

  const reassign = (nodes: any[]) => {
    // Coldest memories first (only those actually going cold + placed in space).
    const cold = nodes
      .filter((n) => (n.entropy ?? 0) >= COLD_THRESHOLD && n.x != null)
      .sort((a, b) => (b.entropy ?? 0) - (a.entropy ?? 0));
    const taken = new Set<number>();
    // Keep a slot on its target if it's still cold; otherwise it's free.
    for (const s of slots) {
      if (s.targetId != null && cold.some((n) => n.id === s.targetId)) taken.add(s.targetId);
      else s.targetId = null;
    }
    // Fill free slots with the coldest unbeaconed memories.
    let ci = 0;
    for (const s of slots) {
      if (s.targetId != null) continue;
      while (ci < cold.length && taken.has(cold[ci]!.id)) ci++;
      if (ci < cold.length) {
        s.targetId = cold[ci]!.id;
        taken.add(cold[ci]!.id);
        ci++;
      }
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

        // Visibility eases in when beaconing, out when idle.
        const wantVisible = tp != null;
        s.fade = THREE.MathUtils.clamp(s.fade + (wantVisible ? dt : -dt) * 1.5, 0, 1);
        g.visible = s.fade > 0.02;
        if (!g.visible) continue;

        if (tp) {
          const standoff = bodyRadius(target) + 18;
          s.angle += dt * 0.6;
          const want = new THREE.Vector3(
            tp.x + Math.cos(s.angle) * standoff,
            tp.y + Math.sin(s.angle * 0.7) * standoff * 0.4,
            tp.z + Math.sin(s.angle) * standoff,
          );
          // Ease toward the orbit point (so a fresh assignment glides in).
          const dir = want.clone().sub(g.position);
          const d = dir.length();
          g.position.addScaledVector(dir.normalize(), Math.min(d, 220 * dt));
          g.lookAt(tp);

          // Beacon pulses brighter the colder the memory is.
          const entropy = target.entropy ?? 0.5;
          s.spin += dt;
          const pulse = 0.7 + 0.3 * Math.sin(s.spin * 3);
          const scale = (26 + entropy * 26) * pulse * s.fade;
          s.probe.beacon.scale.set(scale, scale, 1);
          (s.probe.beacon.material as THREE.SpriteMaterial).opacity = (0.35 + entropy * 0.5) * s.fade;
        }
        g.scale.setScalar(1.5 * (0.4 + 0.6 * s.fade));
      }
    } catch {
      /* skip frame */
    }
  };

  return { group, update };
}
