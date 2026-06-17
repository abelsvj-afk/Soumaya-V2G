/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";

/**
 * Roaming visitors (#12). On a continuous randomized schedule, small craft drift
 * into the sandbox, head for a memory chosen by its vibe (warm memories draw a
 * luminous "traveler"; heavy/negative ones draw a darker "wanderer"), loiter a
 * while, then leave. All procedural (no glTF) — drop a .glb later to upgrade the
 * look. Self-animated from the Graph3D tick.
 */

interface Variant {
  name: string;
  hull: string;
  glow: string;
}
import { bodyColor } from "./theme.js";

const FRIENDLY: Variant = { name: "Luminous Traveler", hull: "#dfe9ff", glow: "#7af9ff" };
const NEUTRAL: Variant = { name: "Drifter", hull: "#cfd0e0", glow: "#b388ff" };
const OMINOUS: Variant = { name: "Void Wanderer", hull: "#3a2030", glow: "#ff5a6e" };

const vecOf = (n: any): THREE.Vector3 => new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);

function makeCraft(): {
  group: THREE.Group;
  setColor: (hull: string, glow: string) => void;
} {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: new THREE.Color("#7af9ff"),
    emissiveIntensity: 1.2,
    metalness: 0.8,
    roughness: 0.2,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 12), bodyMat);
  body.scale.set(1, 0.42, 1); // saucer
  group.add(body);

  const ringMat = new THREE.MeshBasicMaterial({
    color: "#aef",
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.35, 8, 28), ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  group.scale.setScalar(1.4);
  group.visible = false;
  return {
    group,
    setColor: (hull, glow) => {
      bodyMat.color.set(hull);
      bodyMat.emissive.set(glow);
      ringMat.color.set(glow);
    },
  };
}

interface Slot {
  craft: ReturnType<typeof makeCraft>;
  phase: "idle" | "arrive" | "loiter" | "leave";
  targetId: number | null;
  loiter: number;
  angle: number;
  exit: THREE.Vector3;
}

export interface VisitorSystem {
  group: THREE.Group;
  update: (dt: number, nodes: any[]) => void;
}

export function makeVisitors(maxConcurrent = 3): VisitorSystem {
  const group = new THREE.Group();
  const slots: Slot[] = [];
  for (let i = 0; i < maxConcurrent; i++) {
    const craft = makeCraft();
    group.add(craft.group);
    slots.push({ craft, phase: "idle", targetId: null, loiter: 0, angle: 0, exit: new THREE.Vector3() });
  }
  let spawnTimer = 8; // first visitor a few seconds in

  const spawn = (nodes: any[]) => {
    const slot = slots.find((s) => s.phase === "idle");
    if (!slot) return;
    const candidates = nodes.filter((n) => n.x != null);
    if (candidates.length === 0) return;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    
    // Color Sync: The visitor adopts the emotional color of the planet it is visiting.
    const nodeColor = bodyColor(target);
    const emo = target.emotionalWeight ?? 0;
    const variant = emo > 0.3 ? FRIENDLY : emo < -0.3 ? OMINOUS : NEUTRAL;
    
    // Blend the variant's hull with the node's color to show influence
    slot.craft.setColor(variant.hull, nodeColor);

    slot.targetId = target.id;
    slot.phase = "arrive";
    slot.loiter = 12 + Math.random() * 22;
    slot.angle = Math.random() * Math.PI * 2;
    // start far out in a random direction
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    slot.craft.group.position.copy(vecOf(target).addScaledVector(dir, 1600));
    slot.exit.copy(dir).multiplyScalar(2600);
    slot.craft.group.visible = true;
  };

  const update = (dt: number, nodes: any[]) => {
    try {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawn(nodes);
        spawnTimer = 25 + Math.random() * 45; // next visitor in 25–70s
      }
      for (const s of slots) {
        if (s.phase === "idle") continue;
        const g = s.craft.group;
        const target = s.targetId != null ? nodes.find((n) => n.id === s.targetId) : null;
        const tp = target && target.x != null ? vecOf(target) : null;

        if (s.phase === "leave" || !tp) {
          // Cruise outward, then despawn.
          const dir = s.exit.clone().sub(g.position);
          const d = dir.length();
          g.position.addScaledVector(dir.normalize(), Math.min(d, 120 * dt));
          g.lookAt(s.exit);
          if (d < 60 || g.position.length() > 2400) {
            s.phase = "idle";
            g.visible = false;
          }
          continue;
        }

        if (s.phase === "arrive") {
          const want = tp.clone().add(new THREE.Vector3(60, 30, 60));
          const dir = want.clone().sub(g.position);
          const d = dir.length();
          g.position.addScaledVector(dir.normalize(), Math.min(d, 140 * dt));
          g.lookAt(tp);
          if (d < 12) s.phase = "loiter";
        } else if (s.phase === "loiter") {
          s.loiter -= dt;
          s.angle += dt * 0.5;
          g.position.set(
            tp.x + Math.cos(s.angle) * 70,
            tp.y + Math.sin(s.angle * 0.6) * 24,
            tp.z + Math.sin(s.angle) * 70,
          );
          g.lookAt(tp);
          if (s.loiter <= 0) {
            s.phase = "leave";
            s.exit.copy(g.position).normalize().multiplyScalar(2600);
          }
        }
      }
    } catch {
      /* skip frame */
    }
  };

  return { group, update };
}
