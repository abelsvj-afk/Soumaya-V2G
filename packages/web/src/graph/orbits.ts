/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";

/**
 * Kinematic orbit system — the galaxy's motion model.
 *
 * Instead of an unstable physics tug-of-war (which collapses bodies into the
 * center or makes them pulse in/out), every memory is placed on a real, stable
 * orbit around its heaviest connected neighbor:
 *  - the single heaviest body is the still center,
 *  - lighter bodies orbit their heaviest neighbor (or the center if none),
 *  - moons orbit planets orbit stars (nested), each on a slow fixed path,
 *  - a body only "changes hands" when the graph changes (re-link / re-weight).
 *
 * Positions are written to node.fx/fy/fz each frame so the force engine leaves
 * them alone — we are fully in control, so orbits never decay.
 */

interface OrbitParams {
  parent: any | null;
  radius: number;
  speed: number; // rad/sec (sign = direction)
  angle: number;
  u: THREE.Vector3; // orbit-plane basis
  v: THREE.Vector3;
}

export interface OrbitSystem {
  rebuild: (nodes: any[], links: any[]) => void;
  update: (dt: number, nodes: any[]) => void;
  /** Node id + every body that (transitively) orbits it — its "system". */
  getDescendants: (id: number) => Set<number>;
}

const massOf = (n: any): number => n.mass ?? 0.3;

export function makeOrbitSystem(): OrbitSystem {
  const params = new Map<number, OrbitParams>();
  let order: any[] = []; // parents before children
  const childIds = new Map<number, number[]>(); // parent id -> child ids (for systems)

  const rebuild = (nodes: any[], links: any[]) => {
    params.clear();
    order = [];
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

    // Heaviest body is the system center.
    let center = nodes[0];
    for (const n of nodes) if (massOf(n) > massOf(center)) center = n;

    // Parent = heaviest neighbor strictly heavier than me (ties -> lower id wins),
    // else the central star. This is acyclic by construction.
    const heavier = (a: any, b: any): boolean =>
      massOf(a) > massOf(b) || (massOf(a) === massOf(b) && a.id < b.id);
    const parentOf = new Map<number, any | null>();
    for (const n of nodes) {
      if (n === center) {
        parentOf.set(n.id, null);
        continue;
      }
      let p: any = null;
      for (const nid of adj.get(n.id) ?? []) {
        const m = byId.get(nid);
        if (m && heavier(m, n) && (!p || massOf(m) > massOf(p))) p = m;
      }
      parentOf.set(n.id, p ?? center);
    }

    const childrenOf = new Map<number, any[]>();
    childIds.clear();
    for (const n of nodes) {
      const p = parentOf.get(n.id);
      const key = p ? p.id : -1;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(n);
      if (p) {
        if (!childIds.has(p.id)) childIds.set(p.id, []);
        childIds.get(p.id)!.push(n.id);
      }
    }

    const assign = (n: any) => {
      const p = parentOf.get(n.id) ?? null;
      if (!p) {
        params.set(n.id, {
          parent: null,
          radius: 0,
          speed: 0,
          angle: 0,
          u: new THREE.Vector3(),
          v: new THREE.Vector3(),
        });
        return;
      }
      const sibs = childrenOf.get(p.id) ?? [n];
      const i = Math.max(0, sibs.indexOf(n));
      const radius = 70 + massOf(p) * 120 + i * 38;
      const dir = n.id % 2 === 0 ? 1 : -1;
      const speed = (dir * 0.5) / Math.sqrt(radius + 14); // slow + Kepler-ish (outer slower)
      // Tilted orbit plane, deterministic from id for stable variety.
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
      params.set(n.id, { parent: p, radius, speed, angle, u, v });
    };

    // BFS from the center so parents are ordered before children.
    const visited = new Set<number>([center.id]);
    const queue: any[] = [center];
    while (queue.length) {
      const node = queue.shift();
      assign(node);
      order.push(node);
      for (const k of childrenOf.get(node.id) ?? []) {
        if (!visited.has(k.id)) {
          visited.add(k.id);
          queue.push(k);
        }
      }
    }
    // Safety net for any unreached node (cycles/disconnected): orbit the center.
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        parentOf.set(n.id, center);
        if (!childrenOf.has(center.id)) childrenOf.set(center.id, []);
        childrenOf.get(center.id)!.push(n);
        assign(n);
        order.push(n);
        visited.add(n.id);
      }
    }
  };

  const update = (dt: number, _nodes: any[]) => {
    if (params.size === 0) return;
    for (const n of order) {
      const p = params.get(n.id);
      if (!p) continue;
      if (!p.parent) {
        // Center: ease toward origin and stay put.
        n.x = (n.x ?? 0) * 0.85;
        n.y = (n.y ?? 0) * 0.85;
        n.z = (n.z ?? 0) * 0.85;
      } else {
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

  return { rebuild, update, getDescendants };
}
