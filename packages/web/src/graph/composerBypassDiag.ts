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
 * OFF by default — the normal composer path — matching the read-once, localStorage-
 * persisted toggle convention already used for `boundedLinks`/`galaxy.lite` (a device
 * that can't edit the address bar still needs a way to opt in). Enabling it requires a
 * reload, exactly like those toggles.
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
 * scene, and camera objects are reused verbatim).
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
  render: (deltaTime?: number) => void;
}
interface RendererLike {
  render: (scene: unknown, camera: unknown) => void;
}

/** Composer instances already patched — a WeakSet (not a boolean) so a remount with a
 *  fresh composer is still correctly patched, matching perfStats.ts's own
 *  `patchedRenderers` precedent for exactly this reason. */
const patchedComposers = new WeakSet<ComposerLike>();

/**
 * Replace `composer.render()` with a direct `renderer.render(scene, camera)` call.
 * Call once, after the composer exists, only when `isComposerBypassEnabled()` — the
 * caller owns that check, so this function itself stays a pure "do the patch" action,
 * trivially testable without touching localStorage. Idempotent per composer instance.
 */
export function applyComposerBypass(
  composer: ComposerLike,
  renderer: RendererLike,
  scene: unknown,
  camera: unknown,
): void {
  if (patchedComposers.has(composer)) return;
  patchedComposers.add(composer);
  composer.render = () => {
    renderer.render(scene, camera);
  };
}
