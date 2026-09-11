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
  /** `cameraPos` is optional and purely an LOD hint (see NEAR_DIST/FAR_DIST below) —
   *  omitting it (e.g. tests, or a caller with no camera) updates every node every
   *  frame exactly as before this existed. */
  update: (dt: number, nodes: any[], cameraPos?: { x: number; y: number; z: number }) => void;
  /** Node id + every body that (transitively) orbits it — its "system". */
  getDescendants: (id: number) => Set<number>;
  /** Current extent of the galaxy from the origin (camera far clip + overlay scenery scale). */
  getRadius: () => number;
  /** Current world position a node would occupy in its orbit (its "slot"). */
  slotOf: (id: number) => THREE.Vector3 | null;
  /** Temporarily stop the orbit system from controlling a node, so Soumaya can
   *  ferry it into place. `release` hands it back to normal orbiting. */
  hold: (id: number) => void;
  release: (id: number) => void;
}

// `?? 0.3` doesn't catch NaN (only null/undefined) — a NaN mass would silently propagate
// into every position/sort computation below and NaN out that node's whole orbit. Server-
// side `deriveMass` is now guaranteed never to return NaN, but this is the one place in the
// kinematic orbit system that consumes mass directly, so it's guarded independently too.
const massOf = (n: any): number => (Number.isFinite(n.mass) ? n.mass : 0.3);
/**
 * Spacing proxy for orbit layout (NOT the rendered size — that's set in
 * nodeObject). A generous floor keeps the galaxy spread out even when most
 * memories are small/young (the slow-growth model means low masses), so bodies
 * never collapse into one tight overlapping clump.
 */
const bodySize = (n: any): number => 34 + massOf(n) * 54;

const MARGIN = 32; // breathing room between any two bodies
const TOP_STEP = 360; // max radial spacing between top-level systems
const TOP_MIN_STEP = 260; // min spacing — keeps systems apart when the galaxy is busy
// Realistic gap between the Sun's surface and the innermost orbit — no body ever
// "kisses" the sun.
const SUN_GAP = 600;
// Target radius the top-level systems try to fit inside (beyond the Sun), so the
// galaxy stays a compact cluster and comet swings still fit the star field.
const TOP_TARGET = 3200;
// HARD floor: no body — top-level, child, grandchild, or comet-swung — may ever be
// closer than this to the Sun at the origin. Enforced every frame in `update` as a
// guaranteed safety net, because a child orbiting on the Sun-facing side of its parent
// can otherwise dip inside the star (measured: bodies reached ~389 < the 600 core).
const SUN_CLEAR = SUN_RADIUS_MAX + 320;
/** Push a position radially out to the Sun-clearance shell if it's dangerously close. */
const enforceSunClearance = (p: { x: number; y: number; z: number }): void => {
  const d = Math.hypot(p.x, p.y, p.z);
  if (d > 1e-3 && d < SUN_CLEAR) {
    const k = SUN_CLEAR / d;
    p.x *= k;
    p.y *= k;
    p.z *= k;
  }
};

export function makeOrbitSystem(): OrbitSystem {
  const params = new Map<number, OrbitParams>();
  let order: any[] = []; // parents before children (top-level first)
  const childIds = new Map<number, number[]>(); // parent id -> child ids (for systems)
  let galaxyRadius = 0;

  // The Sun: a fixed anchor at the origin that every top-level cluster orbits.
  const SUN = { x: 0, y: 0, z: 0 };
  // Nodes Soumaya is currently ferrying into place — the orbit system leaves these
  // alone (she sets their position) until she drops them and calls `release`.
  const held = new Set<number>();
  // Per-frame lookup map, rebuilt only when the caller's nodes array changes
  // identity (see the note in update()).
  const currentById = new Map<number, any>();
  let mapSourceRef: any[] | null = null;

  // Orbit LOD (Performance Program Stage 5): every node's angle/position used to be
  // recomputed every single frame regardless of how far it sits from the camera — real
  // cost (a handful of transcendentals per node) that a body sitting off in the distance,
  // moving a fraction of a screen pixel per frame, doesn't need. Bodies far from the
  // camera get updated less often; SKIPPED frames leave the position exactly where it
  // was (held, not recomputed) rather than approximated, and the elapsed time is banked
  // in `pendingDt` so the next update advances the angle by the FULL real elapsed time —
  // "stepped but phase-continuous": a body catches up to exactly where continuous
  // simulation would have put it, it just does so in less-frequent, larger jumps. This is
  // NOT the same as freezing (which would permanently lag the phase) or naive fixed-step
  // interpolation (which would need to guess intermediate positions).
  // These thresholds are NOT arbitrary — they're picked from a direct measurement
  // (scratch/orbit-lod-measure.ts: run every-frame vs. LOD-throttled side by side over
  // 600 frames of a representative galaxy, take the max positional divergence, convert
  // to screen pixels via the standard perspective projection at that exact distance) so
  // the promise "sub-pixel error" is verified, not assumed. An earlier attempt reused
  // Graph3D's existing MACRO_DIST (2600) / spatial-grid cutoff (4000) — those distances
  // are meaningful for THEIR purposes (fidelity swap, visibility) but measured out to
  // 1.3-4px of real screen error here, well past sub-pixel. Measured instead: rate 2's
  // max world error is ~1.7 units (bounded by up to 1 frame's worth of linear motion
  // banked as pendingDt), which only reads as sub-pixel from ~4000+ units out — so
  // NEAR_DIST is set past that with margin. Rate 4's max world error is ~5.1 units
  // (up to 3 frames banked), sub-pixel only from ~12000+ units out — FAR_DIST is set
  // past that with margin. Bonus: because the galaxy's own radius is in the same
  // ballpark, a camera framing the WHOLE galaxy (by far the most bodies on screen at
  // once) puts most bodies past FAR_DIST already — the biggest CPU win lands exactly
  // where the most nodes need updating.
  const NEAR_DIST = 5000;
  const FAR_DIST = 14000;
  let localFrame = 0;
  const pendingDt = new Map<number, number>();
  const lodRate = new Map<number, number>();
  // A node's very FIRST update after appearing (a fresh rebuild, or a brand-new node)
  // must never be deferred by its stagger slot — before that first update its x/y/z are
  // whatever placeholder the caller/force-sim gave it, not a real orbit position, so
  // "holding" that placeholder for up to `rate-1` frames would show it in the wrong
  // place, not just a stale-but-valid one. Measured via `orbit-lod-measure.ts`: this was
  // a real, if narrow, gap — a fresh galaxy's throttled bodies sat at their pre-orbit
  // placeholder for a frame or more while every-frame bodies had already moved.
  const everUpdated = new Set<number>();
  let lastLodRefreshFrame = -999;
  const lastLodCameraPos = new THREE.Vector3(Infinity, Infinity, Infinity);

  const rebuild = (nodes: any[], links: any[]) => {
    params.clear();
    order = [];
    childIds.clear();
    held.clear(); // never carry a stale hold across a data reload
    // A rebuild recomputes EVERY node's orbit params from scratch (sibling counts/
    // indices can shift even for untouched nodes) — clearing these means every node
    // gets one guaranteed immediate, accurate position on the next update() rather than
    // some sitting on a stale LOD rate/pending-time from before the structure changed.
    pendingDt.clear();
    lodRate.clear();
    everUpdated.clear();
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

  const update = (dt: number, nodes: any[], cameraPos?: { x: number; y: number; z: number }) => {
    if (params.size === 0) return;
    // Identity-cached id→node map: Graph3D passes the SAME array every frame
    // until the data actually changes, so rebuilding this map 60×/s was pure
    // allocation churn (O(n) Map sets per frame → GC hitches on mobile).
    if (nodes !== mapSourceRef || currentById.size !== nodes.length) {
      mapSourceRef = nodes;
      currentById.clear();
      for (const n of nodes) currentById.set(n.id, n);
    }
    localFrame++;

    // Refresh LOD bands on a throttle, not every frame — a full distance-to-camera pass
    // over every node every frame would eat into the very budget this exists to save.
    // Uses each node's LAST computed position (one frame stale at most going into this),
    // which is harmless: staleness in the BAND assignment just means a body takes up to
    // one extra refresh cycle to notice the camera got close — staleness in the position
    // itself (the thing being throttled below) is the only thing that must stay bounded.
    if (
      cameraPos &&
      (localFrame - lastLodRefreshFrame >= 30 ||
        lastLodCameraPos.distanceToSquared(cameraPos as THREE.Vector3) > 500 * 500)
    ) {
      lastLodRefreshFrame = localFrame;
      lastLodCameraPos.set(cameraPos.x, cameraPos.y, cameraPos.z);
      for (const n of order) {
        const cur = currentById.get(n.id);
        const dx = (cur?.x ?? 0) - cameraPos.x;
        const dy = (cur?.y ?? 0) - cameraPos.y;
        const dz = (cur?.z ?? 0) - cameraPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        lodRate.set(n.id, d2 < NEAR_DIST * NEAR_DIST ? 1 : d2 < FAR_DIST * FAR_DIST ? 2 : 4);
      }
    }

    for (let idx = 0; idx < order.length; idx++) {
      const orderNode = order[idx];
      const n = currentById.get(orderNode.id);
      if (!n) continue;
      const p = params.get(n.id);
      if (!p) continue;
      if (held.has(n.id)) continue; // being ferried by Soumaya — she controls it

      // Without a camera hint every node is rate 1 (this stage's default-off path) —
      // identical behavior to before this stage existed. Stagger which nodes are
      // eligible on a rate>1 frame by (index + frame), so the skipped/caught-up work
      // spreads evenly across frames instead of every throttled node landing on the
      // same frame (a flat cost instead of a periodic spike). A node's first-ever
      // update is ALWAYS eligible regardless of stagger (see `everUpdated`) — before
      // that it's sitting at a placeholder position, not a stale-but-valid one.
      const rate = cameraPos ? (lodRate.get(n.id) ?? 1) : 1;
      let stepDt = dt;
      if (rate > 1 && everUpdated.has(n.id)) {
        const pending = (pendingDt.get(n.id) ?? 0) + dt;
        if ((idx + localFrame) % rate !== 0) {
          pendingDt.set(n.id, pending); // bank the elapsed time; position holds as-is
          continue;
        }
        pendingDt.set(n.id, 0);
        stepDt = pending; // catch up by the FULL banked time, not just this frame's dt
      }
      everUpdated.add(n.id);

      if (p.top) {
        // The whole cluster revolves around the Sun (origin), breathing OUTWARD only
        // (comets swing wide, then return to baseRadius — never inward toward the Sun,
        // so a cluster can't pull itself into the star).
        p.angle += p.speed * stepDt;
        p.radialPhase = (p.radialPhase ?? 0) + (p.radialSpeed ?? 0) * stepDt;
        const r = (p.baseRadius ?? p.radius) * (1 + (p.radialAmp ?? 0) * Math.max(0, Math.sin(p.radialPhase)));
        const c = Math.cos(p.angle);
        const s = Math.sin(p.angle);
        n.x = SUN.x + (p.u.x * c + p.v.x * s) * r;
        n.y = SUN.y + (p.u.y * c + p.v.y * s) * r;
        n.z = SUN.z + (p.u.z * c + p.v.z * s) * r;
      } else {
        // Deeper body: orbit its (now-moving) parent, so the cluster sweeps along.
        p.angle += p.speed * stepDt;
        const c = Math.cos(p.angle);
        const s = Math.sin(p.angle);
        const currParent = p.parent ? currentById.get(p.parent.id) : null;
        const parentX = currParent ? (currParent.x ?? 0) : 0;
        const parentY = currParent ? (currParent.y ?? 0) : 0;
        const parentZ = currParent ? (currParent.z ?? 0) : 0;
        n.x = parentX + (p.u.x * c + p.v.x * s) * p.radius;
        n.y = parentY + (p.u.y * c + p.v.y * s) * p.radius;
        n.z = parentZ + (p.u.z * c + p.v.z * s) * p.radius;
      }
      // Guaranteed safety net: no body may ever be inside the Sun-clearance shell,
      // whatever the orbit math produced (child on the Sun-facing side, etc.).
      enforceSunClearance(n);
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

  // Read-only: where a node sits in its orbit right now (no angle advance), so the
  // ferry has a live destination that tracks the moving parent cluster.
  const slotOf = (id: number): THREE.Vector3 | null => {
    const p = params.get(id);
    if (!p) return null;
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    let out: THREE.Vector3;
    if (p.top) {
      const r = (p.baseRadius ?? p.radius) * (1 + (p.radialAmp ?? 0) * Math.max(0, Math.sin(p.radialPhase ?? 0)));
      out = new THREE.Vector3(
        SUN.x + (p.u.x * c + p.v.x * s) * r,
        SUN.y + (p.u.y * c + p.v.y * s) * r,
        SUN.z + (p.u.z * c + p.v.z * s) * r,
      );
    } else {
      out = new THREE.Vector3(
        (p.parent.x ?? 0) + (p.u.x * c + p.v.x * s) * p.radius,
        (p.parent.y ?? 0) + (p.u.y * c + p.v.y * s) * p.radius,
        (p.parent.z ?? 0) + (p.u.z * c + p.v.z * s) * p.radius,
      );
    }
    enforceSunClearance(out);
    return out;
  };
  const hold = (id: number): void => {
    held.add(id);
  };
  const release = (id: number): void => {
    held.delete(id);
  };

  return { rebuild, update, getDescendants, getRadius, slotOf, hold, release };
}
