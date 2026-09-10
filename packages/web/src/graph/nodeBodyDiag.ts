import * as THREE from "three";

/**
 * Node-body sub-isolation (forensic trace follow-up, 2026-09-10) — a SEPARATE,
 * additive diagnostic mechanism from perfDiag.ts's existing 5 categories
 * (links/bodies/labels/glow/aux), which stay completely untouched by this file.
 *
 * The render-isolation sweep already proved the render-time collapse (~116ms ->
 * ~9-11ms) is inside node-body rendering, but its "bodies" and "glow" categories are
 * each a bundle of several distinct object kinds (nodeObject.ts tags the core mesh,
 * a ring, a glow/corona sprite, and an asteroid-belt Points cloud all with the SAME
 * `isFidelity` flag, for the unrelated reason of driving the macro-LOD distance swap
 * — see nodeObject.ts's own comment on that loop). This file classifies node-body
 * children more finely WITHOUT adding any new tags to nodeObject.ts (so production
 * object construction is completely unchanged) — it reads geometry TYPE strings and
 * the tags that already exist for other reasons (isMacro, glowCacheKey, isFidelity,
 * Points-ness), the same "reuse what's already there" approach perfDiag.ts itself
 * uses.
 *
 * Also covers item G (environment-map-dependent materials): `scene.environment`
 * (Graph3D.tsx's `RoomEnvironment` PMREM) is applied automatically by three.js to
 * every `MeshStandardMaterial` in the scene UNLESS overridden — this includes the
 * moon/asteroid rock, macro-LOD sphere, and action-item core materials (all
 * `MeshStandardMaterial`), but NOT the star/planet bodies (raw `THREE.ShaderMaterial`,
 * which three.js never auto-applies `scene.environment` to). `envMap` here is a
 * scene-level toggle, not a per-child classification.
 */

export interface NodeBodyDiagConfig {
  enabled: boolean;
  /** The core body mesh itself (star/planet/moon/asteroid sphere or icosahedron,
   *  plus its material) — item A. */
  coreMesh: boolean;
  /** Gas-giant / action-item rings (`RingGeometry`) — item B. */
  rings: boolean;
  /** Glow + corona sprites — item C/D. In this codebase these are the SAME object
   *  (`makeGlow()` builds one sprite; the caller then tags it `userData.corona` for
   *  the pulsing animation) — there is no separate "corona layer" to isolate from
   *  the glow sprite it's drawn on. */
  glowSprites: boolean;
  /** The asteroid-belt `Points` cloud orbiting star-class bodies — the closest thing
   *  to item E ("fidelity/special geometry") this scene actually has; rings and the
   *  macro sphere are already their own distinct items above/below. */
  asteroidBelt: boolean;
  /** The macro-LOD low-poly sphere (already covered by perfDiag's "bodies" category
   *  too, but isolated on its own here to separate it from the full-detail mesh). */
  macro: boolean;
  /** `scene.environment` (item G) — see module doc. No effect on star/planet bodies. */
  envMap: boolean;
}

export const DEFAULT_NODE_BODY_DIAG: NodeBodyDiagConfig = {
  enabled: false,
  coreMesh: true,
  rings: true,
  glowSprites: true,
  asteroidBelt: true,
  macro: true,
  envMap: true,
};

/**
 * Classifies one child of a node's Object3D group for the finer node-body
 * sub-isolation. Mirrors perfDiag.ts's `shouldHideNodeChild` shape exactly (same
 * `cfg.enabled` short-circuit, same "called at construction + re-applied per frame
 * alongside the LOD swap" usage pattern) so it drops into Graph3D.tsx's existing
 * call sites with a simple OR, not a rewrite of the visibility logic.
 */
export function shouldHideNodeBodyChild(child: THREE.Object3D, cfg: NodeBodyDiagConfig): boolean {
  if (!cfg.enabled) return false;
  const ud = child.userData ?? {};
  if (ud.isMacro) return !cfg.macro;
  if (ud.glowCacheKey != null) return !cfg.glowSprites; // the glow sprite IS the corona layer — see module doc
  if (child.type === "Points" && ud.isFidelity) return !cfg.asteroidBelt;
  const geomType = (child as THREE.Mesh).geometry?.type;
  if (geomType === "RingGeometry") return !cfg.rings;
  if (ud.isFidelity && (child as THREE.Mesh).isMesh) return !cfg.coreMesh;
  return false;
}
