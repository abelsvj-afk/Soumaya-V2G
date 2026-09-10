/**
 * DIAGNOSTIC ONLY — composer bypass (render-stall investigation, 2026-09-10).
 *
 * react-force-graph-3d always routes every frame through an `EffectComposer`, even
 * with no passes beyond the initial `RenderPass` (see
 * docs/specs/soumaya-galaxy-render-stall-forensic-trace.md §B.3-4): its own internal
 * tick() (three-render-objects.mjs) does
 *
 *   state.postProcessingComposer.render()   // NOT renderer.render(scene, camera) directly
 *
 * every frame. This module lets that be bypassed — routing straight to
 * `renderer.render(scene, camera)` instead — to isolate whether the composer's own
 * per-frame pass-iteration/render-target bookkeeping (not the actual scene draw) is
 * contributing to the multi-second render stall measured on Samsung Xclipse 530 /
 * ANGLE-Vulkan devices.
 *
 * Two ways to use it:
 *  1. A persistent, localStorage-backed toggle (Settings, reload-based) for a manual
 *     one-off A/B test — the original design.
 *  2. `setComposerBypassLive`, which can be flipped on/off repeatedly within a single
 *     page session with no reload — this is what the automated in-session diagnostic
 *     harness (autoRenderDiag.ts) uses, since reload-based A/B testing re-frames the
 *     camera and restarts JIT/thermal state between every condition, which is exactly
 *     what made the earlier reload-based sweep's results non-monotonic and untrustworthy.
 *
 * Mechanism: monkey-patches the ALREADY-CREATED `EffectComposer` instance's own
 * `.render()` method — the exact function the library's tick() calls every frame — to
 * call `renderer.render(scene, camera)` directly instead of iterating its pass chain.
 * This is the same "patch the library's own per-frame call site" technique
 * perfStats.ts already uses (it patches `renderer.render` itself, one level BELOW the
 * composer, for timing) — so the existing forensic instrumentation keeps measuring the
 * real draw call correctly regardless of which path is active: exactly one
 * `renderer.render(scene, camera)` call per frame, either way. No new render loop, no
 * scene/visibility/DPR/pointer changes, no second resize system (the same renderer,
 * scene, and camera objects are reused verbatim). The ORIGINAL render function is
 * preserved (a WeakMap, not a boolean) so the bypass can be un-done exactly.
 */

const STORAGE_KEY = "galaxy.diag.composerBypass";

export function isComposerBypassEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setComposerBypassEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort — a private-browsing quota error just means the toggle can't persist */
  }
}

interface ComposerLike {
  // Method shorthand (not a `render: (...) => void` property) so a real `EffectComposer`
  // (whose `render` takes a concrete `deltaTime?: number`) is structurally assignable
  // here under `strictFunctionTypes` — property-style function types are checked
  // contravariantly even in strict mode, but method shorthand stays bivariant.
  render(deltaTime?: number): void;
}
interface RendererLike {
  render(scene: unknown, camera: unknown): void;
}

/** Each composer instance's ORIGINAL (pre-bypass) render function — captured once, the
 *  first time this composer is ever touched by this module, so `enabled: false` always
 *  restores the real pass-iteration logic exactly, no matter how many times bypass is
 *  toggled on/off in one session. A WeakMap (not a boolean flag) so a remount with a
 *  fresh composer instance is captured independently, matching perfStats.ts's own
 *  `patchedRenderers` WeakSet precedent for the same reason. */
const originalRenders = new WeakMap<ComposerLike, (deltaTime?: number) => void>();

/**
 * Turn the bypass on or off for this composer, any number of times, in either
 * direction — the primitive both the persistent Settings toggle and the automated
 * in-session diagnostic harness build on.
 */
export function setComposerBypassLive(
  composer: ComposerLike,
  renderer: RendererLike,
  scene: unknown,
  camera: unknown,
  enabled: boolean,
): void {
  if (!originalRenders.has(composer)) {
    // Store the RAW function reference, not a `.bind()`'d copy — a plain method-style
    // call (`composer.render()`, exactly how the library's own tick() invokes it)
    // already gives it the correct `this`, so restoring the exact same reference later
    // is both simpler and behaviorally identical to the pre-bypass state, not just
    // "close enough."
    originalRenders.set(composer, composer.render);
  }
  if (enabled) {
    composer.render = () => {
      renderer.render(scene, camera);
    };
  } else {
    composer.render = originalRenders.get(composer)!;
  }
}

/**
 * One-shot apply for the persistent Settings toggle's mount-time path (equivalent to
 * `setComposerBypassLive(..., true)`, kept as a named entry point since "apply the
 * bypass this session" reads more clearly than "set it live to true" at that call site).
 */
export function applyComposerBypass(
  composer: ComposerLike,
  renderer: RendererLike,
  scene: unknown,
  camera: unknown,
): void {
  setComposerBypassLive(composer, renderer, scene, camera, true);
}
