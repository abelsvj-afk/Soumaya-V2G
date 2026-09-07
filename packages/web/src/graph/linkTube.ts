import * as THREE from "three";

/**
 * Curved-link tube geometry, reused frame-to-frame instead of rebuilt.
 *
 * three-forcegraph's own per-frame link-position sync (three-forcegraph.mjs's
 * `layoutTick`) constructs a brand-new `THREE.TubeGeometry` -- with a brand-new
 * `QuadraticBezierCurve3` and several fresh `Vector3`s -- for every curved link,
 * on EVERY rendered frame, then disposes the previous geometry (see
 * docs/specs/soumaya-galaxy-*-audit.md, Round 4). This app's `linkWidth`/
 * `linkCurvature` accessors (Graph3D.tsx) are always nonzero, so every visible
 * link takes this path: an O(visible links) per-frame allocation + GPU-reupload
 * cost with zero caching, confirmed by direct source reads (both this repo and
 * the installed `three-forcegraph` package) as the dominant cause of the
 * catastrophic FPS collapse on a large/full Galaxy View.
 *
 * This module intercepts exactly that path via three-forcegraph's own
 * `linkPositionUpdate` extension point -- a documented, application-layer hook
 * (three-forcegraph.mjs's `layoutTick`: returning `true` from this callback
 * skips the library's own `calcLinkCurve()` + geometry-rebuild for that link
 * entirely). Each link's tube geometry -- matching THREE.TubeGeometry's exact
 * vertex/normal/uv/index layout, for zero visual difference -- is built ONCE
 * and cached (keyed by the link object itself, via a WeakMap so entries are
 * naturally collected once a link leaves `data.links`). Every subsequent
 * frame, only the position/normal attribute arrays are recomputed IN PLACE
 * (via the curve's own public `computeFrenetFrames()`/`getPointAt()` APIs) --
 * no new geometry, no `.dispose()`, no GPU buffer reallocation, just
 * `attribute.needsUpdate = true` (a partial upload onto the existing GPU
 * resource).
 *
 * Ownership/disposal: the geometry lives at `mesh.geometry`, the exact field
 * three-forcegraph itself reads/disposes when a link's Object3D is actually
 * removed (its own `_deallocate`/removal path disposes whatever is currently
 * assigned there) -- so no separate disposal path or cache-eviction logic is
 * needed here; three-forcegraph's existing disposal already covers it.
 *
 * Known, deliberately-accepted residual costs (not eliminated by this module,
 * and not new -- both already present in the current, unmodified per-frame
 * TubeGeometry construction this replaces):
 *  - `curve.computeFrenetFrames()` allocates ~3*(TUBULAR_SEGMENTS+1) fresh
 *    `Vector3`s internally every call (three.js's own implementation has no
 *    scratch-buffer parameter) -- unavoidable without hand-reimplementing
 *    Frenet-frame math, which risks subtly wrong tube twist/orientation.
 *  - `curve.getPointAt()`/`getTangentAt()` rely on an arc-length cache
 *    (`Curve.getLengths()`, default 200 divisions) that must be invalidated
 *    every frame the curve's control points change (`curve.needsUpdate =
 *    true`) -- each invalidation re-samples 200 points. THREE.TubeGeometry's
 *    own construction pays this exact same cost every time it's built, so
 *    this is not a regression, just an unremoved pre-existing cost.
 * Both are flagged in the implementation report rather than hidden.
 *
 * Deliberately NOT intercepted (falls back to three-forcegraph's own,
 * already-correct handling): zero width (a link `shouldRenderLink` has culled
 * -- rare, LOD-gated), zero curvature (never happens in this app today, but
 * safe to leave alone), and coincident endpoints (a self-loop link -- an edge
 * case this app's associative/journey/cognitive linking never produces).
 * Keeping the intercepted surface to exactly "curved, nonzero-width, distinct
 * endpoints" is what makes this a small, reviewable change instead of a
 * broader rewrite of link rendering.
 */

// Matches three-forcegraph.mjs's hardcoded `curveResolution` (tubular segments
// along the curve) -- not exposed as a prop, so this must track that constant.
const TUBULAR_SEGMENTS = 30;
// Matches three-forcegraph's `linkResolution` prop DEFAULT (radial segments
// around the tube's cross-section). This app never sets `linkResolution` on
// <ForceGraph3D>, so the library default applies -- if that ever changes,
// this constant must change with it for visual parity.
const RADIAL_SEGMENTS = 6;
const VERTS_PER_RING = RADIAL_SEGMENTS + 1;
const VERTEX_COUNT = (TUBULAR_SEGMENTS + 1) * VERTS_PER_RING;

// This app never sets `linkCurveRotation`, so it's always three-forcegraph's
// default (0). A rotation of exactly 0 is the identity transform (cos 0 = 1,
// sin 0 = 0 exactly, in floating point too), so the control-point math below
// safely omits the (otherwise required) `applyAxisAngle` step three-forcegraph
// itself does -- not a visual approximation, an exact simplification for the
// fixed rotation value this app actually uses.
const UNIT_Z = new THREE.Vector3(0, 0, 1);
const UNIT_Y = new THREE.Vector3(0, 1, 0);

// Index and UV buffers depend only on (TUBULAR_SEGMENTS, RADIAL_SEGMENTS),
// which never vary in this app -- built once and shared (read-only) by every
// link's geometry, the same sharing precedent three-forcegraph's own
// `cylinderGeometries` cache already uses for straight-link geometries.
let sharedIndex: THREE.BufferAttribute | null = null;
let sharedUv: THREE.BufferAttribute | null = null;

function getSharedIndexAndUv(): { index: THREE.BufferAttribute; uv: THREE.BufferAttribute } {
  if (!sharedIndex || !sharedUv) {
    const indices: number[] = [];
    for (let j = 1; j <= TUBULAR_SEGMENTS; j++) {
      for (let i = 1; i <= RADIAL_SEGMENTS; i++) {
        const a = VERTS_PER_RING * (j - 1) + (i - 1);
        const b = VERTS_PER_RING * j + (i - 1);
        const c = VERTS_PER_RING * j + i;
        const d = VERTS_PER_RING * (j - 1) + i;
        indices.push(a, b, d, b, c, d);
      }
    }
    sharedIndex = new THREE.BufferAttribute(new Uint16Array(indices), 1);

    const uvs: number[] = [];
    for (let i = 0; i <= TUBULAR_SEGMENTS; i++) {
      for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
        uvs.push(i / TUBULAR_SEGMENTS, j / RADIAL_SEGMENTS);
      }
    }
    sharedUv = new THREE.BufferAttribute(new Float32Array(uvs), 2);
  }
  return { index: sharedIndex, uv: sharedUv };
}

interface LinkTubeEntry {
  geometry: THREE.BufferGeometry;
  positionAttr: THREE.BufferAttribute;
  normalAttr: THREE.BufferAttribute;
  curve: THREE.QuadraticBezierCurve3;
  vStart: THREE.Vector3;
  vEnd: THREE.Vector3;
  vLine: THREE.Vector3;
  mid: THREE.Vector3;
  cp: THREE.Vector3;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface LinkPositions {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
}

/**
 * Per-Graph3D-instance cache. Construct one via `new CurvedLinkGeometryCache()`
 * (held in a `useRef`, matching this file's sibling caches' lifetime
 * convention) and pass `.update` as the `linkPositionUpdate` prop.
 */
export class CurvedLinkGeometryCache {
  private readonly cache = new WeakMap<object, LinkTubeEntry>();

  private create(): LinkTubeEntry {
    const { index, uv } = getSharedIndexAndUv();
    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(new Float32Array(VERTEX_COUNT * 3), 3);
    const normalAttr = new THREE.BufferAttribute(new Float32Array(VERTEX_COUNT * 3), 3);
    geometry.setIndex(index);
    geometry.setAttribute("position", positionAttr);
    geometry.setAttribute("normal", normalAttr);
    geometry.setAttribute("uv", uv);
    return {
      geometry,
      positionAttr,
      normalAttr,
      curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
      vStart: new THREE.Vector3(),
      vEnd: new THREE.Vector3(),
      vLine: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      cp: new THREE.Vector3(),
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
    };
  }

  /**
   * Mirrors three-forcegraph's `linkPositionUpdate(obj, {start,end}, link)` signature.
   * Returns `true` when it fully handled this link's position + geometry (three-
   * forcegraph then skips its own `calcLinkCurve()` + geometry-rebuild for it
   * entirely); returns `false` to fall back to the library's own handling for the
   * cases this cache deliberately doesn't specialize (see module doc).
   */
  update(obj: THREE.Object3D, pos: LinkPositions, link: object, width: number, curvature: number): boolean {
    if (!width || !curvature) return false; // let three-forcegraph handle these itself
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return false; // not tube-rendered (e.g. a thin Line for a culled/zero-width link)

    let entry = this.cache.get(link);
    if (!entry) {
      entry = this.create();
      this.cache.set(link, entry);
    }
    // Idempotent, cheap reference reassignment: self-heals if three-forcegraph's
    // own separate object digest (onUpdateObj, keyed off linkColor/linkWidth prop
    // IDENTITY changing -- not this per-frame position loop) reassigned
    // mesh.geometry to a cached straight CylinderGeometry between frames (see
    // module doc). That digest and this loop always run in the same order within
    // one 3d-force-graph animation-cycle call (object digest during the React
    // commit that precedes the frame; this loop, then the actual render, inside
    // the next requestAnimationFrame) -- so a stray reassignment is corrected
    // here before anything is actually drawn, never visible on screen.
    mesh.geometry = entry.geometry;

    const { vStart, vEnd, vLine, mid, cp, curve, point, normal, positionAttr, normalAttr } = entry;
    vStart.set(pos.start.x, pos.start.y || 0, pos.start.z || 0);
    vEnd.set(pos.end.x, pos.end.y || 0, pos.end.z || 0);
    if (vStart.distanceTo(vEnd) === 0) return false; // coincident endpoints (self-loop) -- defer to the library

    // Exactly mirrors three-forcegraph's calcLinkCurve() control-point math
    // (linkCurveRotation is always 0 here -- see the UNIT_Z/UNIT_Y comment above
    // for why the rotation step is safely omitted).
    vLine.subVectors(vEnd, vStart);
    const dx = pos.end.x - pos.start.x;
    const dy = (pos.end.y || 0) - (pos.start.y || 0);
    mid.copy(vStart).add(vEnd).multiplyScalar(0.5);
    cp.copy(vLine)
      .multiplyScalar(curvature)
      .cross(dx !== 0 || dy !== 0 ? UNIT_Z : UNIT_Y)
      .add(mid);

    curve.v0.copy(vStart);
    curve.v1.copy(cp);
    curve.v2.copy(vEnd);
    // Required: the curve's arc-length cache (used by getPointAt/getTangentAt,
    // hence by computeFrenetFrames) is keyed only on division count, not on the
    // control points -- reusing the same curve object across frames means a
    // stale cache from the PREVIOUS frame's (different) curve shape would
    // silently persist without this, sampling the wrong distances along the
    // new curve. THREE.Curve's own docs require calling this after any control-
    // point change.
    curve.updateArcLengths();

    const radius = width / 2;
    // Same call three-forcegraph's own TubeGeometry constructor makes (see
    // module doc for its unavoidable internal allocation cost).
    const frames = curve.computeFrenetFrames(TUBULAR_SEGMENTS, false);

    const posArr = positionAttr.array as Float32Array;
    const normArr = normalAttr.array as Float32Array;
    let vi = 0;
    for (let i = 0; i <= TUBULAR_SEGMENTS; i++) {
      curve.getPointAt(i / TUBULAR_SEGMENTS, point); // writes into `point`, no allocation
      const N = frames.normals[i]!;
      const B = frames.binormals[i]!;
      for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
        const v = (j / RADIAL_SEGMENTS) * Math.PI * 2;
        const sin = Math.sin(v);
        const cos = -Math.cos(v);
        normal.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize();
        normArr[vi] = normal.x;
        normArr[vi + 1] = normal.y;
        normArr[vi + 2] = normal.z;
        posArr[vi] = point.x + radius * normal.x;
        posArr[vi + 1] = point.y + radius * normal.y;
        posArr[vi + 2] = point.z + radius * normal.z;
        vi += 3;
      }
    }
    positionAttr.needsUpdate = true;
    normalAttr.needsUpdate = true;
    // Required because this geometry is now REUSED (not replaced) across frames:
    // a cached boundingSphere computed once would go stale as vertices move,
    // risking incorrect frustum culling (a link silently vanishing). The
    // original per-frame-rebuild code never needed this -- a brand new geometry
    // starts with no cached sphere, so the renderer always computed it fresh.
    entry.geometry.computeBoundingSphere();

    return true;
  }
}
