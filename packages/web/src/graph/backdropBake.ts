import * as THREE from "three";

/**
 * Performance Program Stage 3 — render the expensive additive backdrop sprites (nebula
 * clouds, distant-galaxy glow) into a cubemap ONCE, instead of paying their fill-rate cost
 * every frame forever. See docs plan for the full reasoning; summary:
 *
 * ~10 large (1400-5400 world-unit) sprites, all `transparent + AdditiveBlending +
 * depthWrite:false`, get re-blended by the GPU on every single frame even though nothing
 * about them needs recomputing that often — this is the single biggest fill-rate cost in
 * the scene. A `CubeCamera` photographs them once from the world origin into 6 faces of a
 * `WebGLCubeRenderTarget`; the result becomes `scene.background`, which the renderer then
 * draws as a single flat pass behind everything, with no blending and no overdraw.
 *
 * This intentionally does NOT touch the starfield, spiral galaxies, milky way,
 * constellations, or dust — those are all cheap `Points`-based effects (small per-point
 * footprint, not big blended quads) and were never the actual cost; they stay fully live,
 * including the spiral galaxies' own slow spin. Only the sprite layers passed in here are
 * baked.
 */

export interface BakedBackdrop {
  /** Assigned to `scene.background`. Kept so it can be disposed on teardown. */
  target: THREE.WebGLCubeRenderTarget;
}

/**
 * Render `sources` into a cubemap and install it as `scene.background`. `sources` are
 * rendered in an isolated throwaway scene (never the real one) so nothing else — the
 * memory galaxy, Soumaya, UI — leaks into the baked photograph, then disposed: once baked,
 * their geometry/materials/textures are no longer needed live.
 *
 * Call from an idle-deferred callback, well after first paint — this is a real (if brief)
 * synchronous render-target pass (6 draws), not something to run on the critical path.
 */
export function bakeBackdrop(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  sources: THREE.Object3D[],
  faceSize: number,
): BakedBackdrop {
  const bakeScene = new THREE.Scene();
  for (const o of sources) bakeScene.add(o);

  const target = new THREE.WebGLCubeRenderTarget(faceSize, { generateMipmaps: false });
  // A render target's texture defaults to `NoColorSpace` (correct when it feeds further
  // linear-space processing) — but THIS one is assigned directly to `scene.background` for
  // direct display, exactly like the CanvasTextures in skybox.ts/nodeObject.ts, which both
  // explicitly set `colorSpace = SRGBColorSpace` for that reason. Missing it here means the
  // additively-blended, overlapping sprites baked into this texture get displayed with the
  // WRONG color-space interpretation — most visible exactly where several sprites summed
  // into a bright patch, producing a harsh, wrongly-toned region with a hard edge against
  // the correctly-near-black surrounding sky (a real, on-device-screenshotted "cut out"
  // color patch). This was a real oversight, not a stylistic choice: every other
  // direct-display texture in this file's sibling modules already sets this.
  target.texture.colorSpace = THREE.SRGBColorSpace;
  // CubeCamera doesn't need to be added to any scene — with no parent it updates its own
  // matrixWorld from its local transform directly (see three.js CubeCamera.update()).
  const cubeCamera = new THREE.CubeCamera(1, 20000, target);
  cubeCamera.position.set(0, 0, 0); // sources are authored relative to the world origin
  cubeCamera.update(renderer, bakeScene);

  scene.background = target.texture;

  // The sources are baked into the texture now — free their GPU resources. The render
  // target's OWN texture (just installed as scene.background) is untouched here.
  for (const o of sources) {
    o.traverse((c: any) => {
      c.geometry?.dispose?.();
      const mats = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
      for (const m of mats) {
        m.map?.dispose?.();
        m.dispose?.();
      }
    });
  }

  return { target };
}

/** Dispose the render target (and its texture) installed by bakeBackdrop(). */
export function disposeBakedBackdrop(baked: BakedBackdrop): void {
  baked.target.dispose();
}
