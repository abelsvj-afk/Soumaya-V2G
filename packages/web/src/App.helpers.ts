import type { CSSProperties } from "react";
import type { GraphData, GraphNode } from "@brain/shared";

/**
 * Pure presentational helpers extracted from the large App.tsx (Post-MVP D4 refactor):
 * focus-cluster + song-dot inline styles and figurine icon/label lookups. No state.
 */

/**
 * Merge freshly-fetched node data into the graph state BY ID, preserving each existing
 * node's OBJECT REFERENCE for any id that still exists (Galaxy render-stall root-cause
 * fix, 2026-09-10 — see docs/specs/soumaya-galaxy-graphdata-refresh-audit.md and
 * docs/specs/soumaya-galaxy-cache-disposal-audit.md for the full confirmed mechanism).
 *
 * **Confirmed mechanism**: `three-forcegraph`'s own node object cache (`ThreeDigest`,
 * built on `data-bind-mapper`'s `DataBindMapper`) keys nodes by RAW OBJECT IDENTITY, not
 * `.id` — verified directly against the installed package: `new ThreeDigest(threeObj, {
 * objBindAttr: '__threeObj' })` is constructed with no `.id(fn)` override anywhere in the
 * bundle, so it falls back to `DataBindMapper`'s default identity function (`d => d`).
 * `getGraph()` (`api/client.ts`) is a plain `fetch().json()` with no identity-preserving
 * cache of its own, so every `refresh()` produced a BRAND-NEW node object for every node,
 * every time — meaning `digest()` never found an existing entry by reference, disposed
 * the PREVIOUS Object3D for literally every node (walking into shared, reference-counted
 * `geometryCache`/`labelTexCache`/`glowTexCache`/`cachedMoonTexture` entries in
 * `nodeObject.ts`, none of which the library's disposal path has any concept of being
 * shared), and rebuilt from scratch — a real, synchronous GPU-buffer-and-texture
 * re-upload burst for the entire currently-tracked galaxy, paid for inside the very next
 * `renderer.render()` call. This is a routine, everyday trigger (any ingest/task/chat
 * action that calls `refresh()`), not an edge case — and it fully explains why the
 * render-time cost tracked the size of the currently-tracked galaxy (not just what was
 * visible) and why isolating to a small View/Lens made the SAME galaxy instantly fast
 * again (far fewer nodes need reconstructing on the next refresh).
 *
 * **The fix**: reuse the SAME node object for an id that already exists — merging the
 * freshly-fetched SERVER fields onto it in place — so the digest recognizes it as
 * unchanged by reference and never disposes/rebuilds its Object3D at all. Only a
 * genuinely new id gets a fresh object (correctly triggering a real, one-time build).
 *
 * Deliberately NODES ONLY — links are NOT merged this way. `GraphEdge.source`/`target`
 * are typed as raw numeric ids server-side, but d3-force's link force resolves them into
 * direct NODE OBJECT REFERENCES in place once processed (the exact mechanism `4d10f8c`
 * depends on) — merging fresh link data over an already-resolved link object risks
 * clobbering that resolution back to a raw id, which this fix must never do. Node objects
 * carry no equivalent risk: the client-only position/velocity fields
 * (`x`/`y`/`z`/`fx`/`fy`/`fz`/`vx`/`vy`/`vz`) `orbits.ts` maintains are never present on a
 * freshly-fetched `GraphNode` (confirmed: not part of the shared `GraphNode` type), so
 * merging server fields onto an existing node object can never clobber them.
 */
export function mergeGraphNodes(prevNodes: GraphNode[], freshNodes: GraphNode[]): GraphNode[] {
  const prevById = new Map(prevNodes.map((n) => [n.id, n]));
  return freshNodes.map((fresh) => {
    const existing = prevById.get(fresh.id);
    if (!existing) return fresh; // genuinely new node — a fresh object is correct
    Object.assign(existing, fresh);
    return existing;
  });
}

/** Applies {@link mergeGraphNodes} to a full refresh payload — `links` pass through
 *  unchanged (see that function's doc comment for why links are deliberately excluded). */
export function mergeGraphData(prev: GraphData, fresh: GraphData): GraphData {
  return { nodes: mergeGraphNodes(prev.nodes, fresh.nodes), links: fresh.links };
}

/** Pop-up offset for an item in the focus cluster (stacks upward when open). */
export function focusItemStyle(index: number, open: boolean): CSSProperties {
  return open
    ? { transform: `translateY(${-(index + 1) * 54}px)`, opacity: 1, pointerEvents: "auto" }
    : { transform: "translateY(0) scale(0.4)", opacity: 0, pointerEvents: "none" };
}

/** Position a song dot on an arc fanning up-and-right from the music FAB (bottom-left). */
export function songDotStyle(i: number, total: number): CSSProperties {
  const start = 16, end = 100; // degrees
  const t = total <= 1 ? 0.5 : i / (total - 1);
  const rad = ((start + (end - start) * t) * Math.PI) / 180;
  const R = 78;
  return {
    position: "fixed",
    left: `${36 + Math.cos(rad) * R}px`,
    bottom: `${152 + Math.sin(rad) * R}px`,
    transform: "translate(-50%, 50%)",
  };
}

export function getFigurineIcon(type: string): string {
  switch (type) {
    case "station": return "🌐";
    case "satellite": return "🛰️";
    case "star_center": return "🌟";
    case "dyson_sphere": return "🪐";
    case "quantum_core": return "🌌";
    case "hyper_array": return "📡";
    case "shield_spire": return "🛡️";
    case "blackhole": return "🕳️";
    default: return "🗿";
  }
}

export function getFigurineLabel(type: string): string {
  switch (type) {
    case "station": return "Waystation Figurine";
    case "satellite": return "Aura Beacon Figurine";
    case "star_center": return "Solar Monument";
    case "dyson_sphere": return "Dyson Megastructure";
    case "quantum_core": return "Quantum Singularity Core";
    case "hyper_array": return "Synapse Hyper-Array";
    case "shield_spire": return "Aegis Shield Spire";
    case "blackhole": return "The Singularity";
    default: return type;
  }
}
