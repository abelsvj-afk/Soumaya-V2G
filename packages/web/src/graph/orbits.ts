/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { SUN_RADIUS_MAX } from "./sun.js";

/**
 * Kinematic orbit system — the galaxy's motion model.
 *
 * Heliocentric: a gigantic Sun sits fixed at the origin. Each cluster keeps its
 * own internal nested orbits (moons orbit planets orbit their hub) AND spins on
 * its axis, while the cluster AS A WHOLE revolves slowly around the Sun. A seeded
 * minority of clusters drift wide like comets (a near-escape) then are pulled back
 * — bounded, so nothing ever leaves the view.
 *
 * Positions are written to node.fx/fy/fz each frame so the force engine leaves
 * them alone — we are fully in control, so orbits never decay.
 */

interface OrbitParams {
  parent: any | null; // null only for the (virtual) sun-orbiting top level
  radius: number; // deeper bodies: constant orbit radius around their parent
  speed: number; // rad/sec (sign = direction)
  angle: number;
  u: THREE.Vector3; // orbit-plane basis
  v: THREE.Vector3;
  childMax: number; // how far this body's own children may orbit
  // Top-level (cluster roots orbiting the Sun) only:
  top?: boolean;
  baseRadius?: number; // shell distance from the Sun
  radialAmp?: number; // breathe amplitude (fraction of baseRadius)
  radialSpeed?: number; // breathe angular speed
  radialPhase?: number;
}

export interface OrbitSystem {
  rebuild: (nodes: any[], links: any[]) => void;
  update: (dt: number, nodes: any[]) => void;
  /** Node id + every body that (transitively) orbits it — its "system". */
  getDescendants: (id: number) => Set<number>;
  /** Current extent of the galaxy from the origin (camera + starfield enclosure). */
  getRadius: () => number;
}

const massOf = (n: any): number => n.mass ?? 0.3;
/** Approximate visual radius of a body (matches the render sizing by mass). */
const bodySize = (n: any): number => 24 + massOf(n) * 60;

const MARGIN = 26; // breathing room between any two bodies
const TOP_STEP = 360; // max radial spacing between top-level systems
const TOP_MIN_STEP = 260; // min spacing — keeps systems apart when the galaxy is busy
// Realistic gap between the Sun's surface and the innermost orbit — no body ever
// "kisses" the sun.
const SUN_GAP = 450;
// Target radius the top-level systems try to fit inside (beyond the Sun), so the
// galaxy stays a compact cluster and comet swings still fit the star field.
const TOP_TARGET = 2800;

export function makeOrbitSystem(): OrbitSystem {
  const params = new Map<number, OrbitParams>();
  let order: any[] = []; // parents before children (top-level first)
  const childIds = new Map<number, number[]>(); // parent id -> child ids (for systems)
  let galaxyRadius = 0;

  // The Sun: a fixed anchor at the origin that every top-level cluster orbits.
  const SUN = { x: 0, y: 0, z: 0 };

  const rebuild = (nodes: any[], links: any[]) => {
    params.clear();
    order = [];
    childIds.clear();
    if (nodes.length === 0) return;

    const byId = new Map<number, any>(nodes.map((n) => [n.id, n]));
    const adj = new Map<number, Set<number>>();
    for (const l of links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }

    // Parent = heaviest neighbor strictly heavier than me (ties -> lower id wins),
    // else the SUN (a top-level cluster root). Acyclic by construction.
    const heavier = (a: any, b: any): boolean =>
      massOf(a) > massOf(b) || (massOf(a) === massOf(b) && a.id < b.id);
    const parentOf = new Map<number, any | null>();
    for (const n of nodes) {
      let p: any = null;
      for (const nid of adj.get(n.id) ?? []) {
        const m = byId.get(nid);
        if (m && heavier(m, n) && (!p || massOf(m) > massOf(p))) p = m;
      }
      parentOf.set(n.id, p); // null => top-level (orbits the Sun)
    }

    const childrenOf = new Map<number, any[]>(); // parent id -> children
    const topLevel: any[] = [];
    for (const n of nodes) {
      const p = parentOf.get(n.id);
      if (!p) {
        topLevel.push(n);
        continue;
      }
      if (!childrenOf.has(p.id)) childrenOf.set(p.id, []);
      childrenOf.get(p.id)!.push(n);
      if (!childIds.has(p.id)) childIds.set(p.id, []);
      childIds.get(p.id)!.push(n.id);
    }
    // Heaviest cluster sits innermost (deterministic order).
    topLevel.sort((a, b) => massOf(b) - massOf(a) || a.id - b.id);

    const assignTop = (n: any, i: number, k: number) => {
      const nSize = bodySize(n);
      const minR = SUN_RADIUS_MAX + SUN_GAP + nSize + MARGIN; // clear the sun by a real gap
      const fit = k > 1 ? (TOP_TARGET - minR) / (k - 1) : TOP_STEP;
      const step = Math.min(TOP_STEP, Math.max(TOP_MIN_STEP, fit));
      const baseRadius = minR + i * step;
      const dir = n.id % 2 === 0 ? 1 : -1;
      // Whole clusters revolve slowly around the Sun (outer ones slower).
      const speed = (dir * 9) / (baseRadius + 200);
      // Comet drift: a seeded ~15% swing wide then return; the rest gently breathe.
      const comet = (n.id * 7) % 100 < 15;
      const radialAmp = comet ? 0.4 : 0.05;
      const radialSpeed = comet ? 0.02 + ((n.id % 5) * 0.004) : 0.06 + ((n.id % 7) * 0.006);
      const radialPhase = ((n.id % 100) / 100) * Math.PI * 2;
      const tilt = (((n.id * 37) % 100) / 100) * 0.7 - 0.35;
      const yaw = (((n.id * 53) % 628) / 100) || 0.1;
      const normal = new THREE.Vector3(
        Math.sin(tilt) * Math.cos(yaw),
        Math.cos(tilt),
        Math.sin(tilt) * Math.sin(yaw),
      ).normalize();
      const ref = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(normal, ref).normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      const angle = (i / Math.max(1, k)) * Math.PI * 2 + ((n.id * 13) % 100) / 100;
      params.set(n.id, {
        parent: SUN,
        radius: baseRadius,
        speed,
        angle,
        u,
        v,
        childMax: step / 2 - MARGIN,
        top: true,
        baseRadius,
        radialAmp,
        radialSpeed,
        radialPhase,
      });
    };

    const assignChild = (n: any, p: any) => {
      const sibs = childrenOf.get(p.id) ?? [n];
      const k = sibs.length;
      const i = Math.max(0, sibs.indexOf(n));
      const pp = params.get(p.id); // parent already assigned (BFS order)
      const pSize = bodySize(p);
      const nSize = bodySize(n);
      const minR = pSize + nSize + MARGIN;
      const band = Math.max(nSize + 12, (pp?.childMax ?? minR + 120) - minR);
      const step = k > 1 ? Math.max(nSize + 12, band / (k - 1)) : band;
      const radius = minR + i * step;
      const childMax = Math.max(8, step / 2 - nSize - MARGIN);
      const dir = n.id % 2 === 0 ? 1 : -1;
      const speed = (dir * 0.5) / Math.sqrt(radius + 14); // slow + Kepler-ish
      const tilt = (((n.id * 37) % 100) / 100) * 0.7 - 0.35;
      const yaw = (((n.id * 53) % 628) / 100) || 0.1;
      const normal = new THREE.Vector3(
        Math.sin(tilt) * Math.cos(yaw),
        Math.cos(tilt),
        Math.sin(tilt) * Math.sin(yaw),
      ).normalize();
      const ref = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(normal, ref).normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      const angle = (i / sibs.length) * Math.PI * 2 + ((n.id * 13) % 100) / 100;
      params.set(n.id, { parent: p, radius, speed, angle, u, v, childMax });
    };

    // Assign all top-level clusters, then BFS their descendants (parents first).
    const visited = new Set<number>();
    const queue: any[] = [];
    topLevel.forEach((n, i) => {
      assignTop(n, i, topLevel.length);
      order.push(n);
      visited.add(n.id);
      queue.push(n);
    });
    while (queue.length) {
      const node = queue.shift();
      for (const c of childrenOf.get(node.id) ?? []) {
        if (!visited.has(c.id)) {
          visited.add(c.id);
          assignChild(c, node);
          order.push(c);
          queue.push(c);
        }
      }
    }
    // Safety net for any unreached node (cycles): make it a top-level cluster.
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        assignTop(n, topLevel.length, topLevel.length + 1);
        order.push(n);
        visited.add(n.id);
      }
    }

    // Measure the galaxy extent (using the max comet-swing radius) so the camera +
    // star field always enclose it.
    const extent = new Map<number, number>();
    galaxyRadius = 0;
    for (const n of order) {
      const p = params.get(n.id)!;
      const own = p.top ? (p.baseRadius ?? 0) * (1 + (p.radialAmp ?? 0)) : p.radius;
      const parentExtent = p.top || !p.parent ? 0 : (extent.get(p.parent.id) ?? 0);
      const dist = parentExtent + own;
      extent.set(n.id, dist);
      galaxyRadius = Math.max(galaxyRadius, dist + bodySize(n));
    }
  };

  const update = (dt: number, _nodes: any[]) => {
    if (params.size === 0) return;
    for (const n of order) {
      const p = params.get(n.id);
      if (!p) continue;
      if (p.top) {
        // The whole cluster revolves around the Sun (origin), gently breathing in
        // and out (comets swing wide, then return — all bounded).
        p.angle += p.speed * dt;
        p.radialPhase = (p.radialPhase ?? 0) + (p.radialSpeed ?? 0) * dt;
        const r = (p.baseRadius ?? p.radius) * (1 + (p.radialAmp ?? 0) * Math.sin(p.radialPhase));
        const c = Math.cos(p.angle);
        const s = Math.sin(p.angle);
        n.x = SUN.x + (p.u.x * c + p.v.x * s) * r;
        n.y = SUN.y + (p.u.y * c + p.v.y * s) * r;
        n.z = SUN.z + (p.u.z * c + p.v.z * s) * r;
      } else {
        // Deeper body: orbit its (now-moving) parent, so the cluster sweeps along.
        p.angle += p.speed * dt;
        const c = Math.cos(p.angle);
        const s = Math.sin(p.angle);
        n.x = (p.parent.x ?? 0) + (p.u.x * c + p.v.x * s) * p.radius;
        n.y = (p.parent.y ?? 0) + (p.u.y * c + p.v.y * s) * p.radius;
        n.z = (p.parent.z ?? 0) + (p.u.z * c + p.v.z * s) * p.radius;
      }
      // Pin so the force engine can't move (or collapse) them.
      n.fx = n.x;
      n.fy = n.y;
      n.fz = n.z;
    }
  };

  const getDescendants = (id: number): Set<number> => {
    const set = new Set<number>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const c of childIds.get(cur) ?? []) {
        if (!set.has(c)) {
          set.add(c);
          queue.push(c);
        }
      }
    }
    return set;
  };

  const getRadius = (): number => galaxyRadius;

  return { rebuild, update, getDescendants, getRadius };
}
