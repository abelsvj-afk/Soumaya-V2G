import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

/**
 * DIAGNOSTIC ONLY — render-path stage timing (2026-09-10, BAD-vs-GOOD forensic pass).
 *
 * `perfStats.ts` already times the innermost call in the chain
 * (`_animationCycle → composer.render() → RenderPass.render() → renderer.render()`):
 * it patches `renderer.render` directly. That leaves two open questions this module
 * answers, without touching or duplicating perfStats.ts's own instrumentation:
 *
 * 1. How much of one animation frame is spent INSIDE `composer.render()` as a whole
 *    (its own pass-iteration/render-target bookkeeping, not just the draw calls it
 *    issues)? If bloom is on, `composer.render()` invokes MULTIPLE `renderer.render()`
 *    calls per frame (the base scene pass, plus several blur/composite passes) — each
 *    already lands its own sample in perfStats's `render` series, but there was no
 *    single number for "the whole frame's composite cost." `installComposerTrace`
 *    supplies that.
 * 2. Specifically how long the BASE SCENE draw (`RenderPass.render()`, the first pass
 *    in the composer's chain, functionally a thin wrapper around exactly one
 *    `renderer.render(scene, camera)` call) takes, isolated from any later pass. If
 *    `RenderPass.render()`'s own time diverges meaningfully from the single
 *    `renderer.render()` call it wraps, the extra cost is in the render-target
 *    bind/copy Three.js does around that call, not the draw itself — a distinct,
 *    actionable signal `installRenderPassTrace` supplies.
 *
 * `composerMs - renderPassMs` (when both are available) is therefore "how much of one
 * frame was spent OUTSIDE the base scene draw" — i.e. bloom/other post-processing
 * overhead specifically, not scene complexity.
 *
 * Mechanism, matching the existing precedent in this file's sibling modules exactly
 * (`perfStats.ts`'s `attachRenderer`, `composerBypassDiag.ts`'s `setComposerBypassLive`):
 * monkey-patch the already-created instance's own method to time the ORIGINAL call,
 * never altering what it does or returns. Behavior is byte-for-byte identical either
 * way; only two `performance.now()` reads are added per call. `RenderPass.prototype`
 * is patched once, globally (like `attachRenderer`'s renderer patch, this is never
 * un-done — a permanent, negligible-cost diagnostic wrapper is the established pattern
 * here, not new for this module) since every composer's base pass is the same shared
 * class; `installComposerTrace` is per-composer-instance (a WeakSet, so a remount with
 * a fresh composer is captured independently, same reasoning as `patchedRenderers` in
 * perfStats.ts).
 */

/** ~2s of history at 60fps — plenty to report "the most recent frame" reliably even
 *  right after a scene-state change (a View toggle, a refresh). */
const RING = 120;

function makeRing() {
  return { buf: new Float32Array(RING), idx: 0, filled: 0 };
}
function push(ring: ReturnType<typeof makeRing>, v: number): void {
  ring.buf[ring.idx] = v;
  ring.idx = (ring.idx + 1) % RING;
  if (ring.filled < RING) ring.filled++;
}
function latest(ring: ReturnType<typeof makeRing>): number | null {
  if (ring.filled === 0) return null;
  return ring.buf[(ring.idx - 1 + RING) % RING]!;
}
/** Nearest-rank median — consistent with perfStats.ts's own percentile choice (not
 *  interpolating), so a single-frame spike isn't averaged away in the reported value. */
function median(ring: ReturnType<typeof makeRing>): number | null {
  const n = ring.filled;
  if (n === 0) return null;
  const view = Array.from(ring.buf.subarray(0, n)).sort((a, b) => a - b);
  return view[Math.floor((n - 1) / 2)]!;
}

const composerRing = makeRing();
const renderPassRing = makeRing();
/** How many `renderer.render()`-driving passes ran during the most recent
 *  `composer.render()` call — i.e. whether the composer is doing real multi-pass work
 *  (bloom) or just the single base `RenderPass`. Counted via `RenderPass`'s own patched
 *  `render()` firing during the composer call, not perfStats.ts's renderer-level
 *  counter (kept fully independent — this module never reads or mutates perfStats.ts's
 *  internals). */
let passesInLastComposerFrame = 0;
let passCounterActive = false;

interface ComposerLike {
  render(deltaTime?: number): void;
}

const patchedComposers = new WeakSet<ComposerLike>();
const originalComposerRenders = new WeakMap<ComposerLike, (deltaTime?: number) => void>();

/** Time this composer instance's `.render()` calls from now on. Idempotent per
 *  instance — calling it again on the same composer (e.g. a Settings toggle re-check)
 *  is a no-op. */
export function installComposerTrace(composer: ComposerLike): void {
  if (patchedComposers.has(composer)) return;
  patchedComposers.add(composer);
  const orig = composer.render.bind(composer);
  originalComposerRenders.set(composer, orig);
  composer.render = (deltaTime?: number) => {
    passCounterActive = true;
    passesInLastComposerFrame = 0;
    const t0 = performance.now();
    orig(deltaTime);
    push(composerRing, performance.now() - t0);
    passCounterActive = false;
  };
}

let renderPassPatched = false;
let originalRenderPassRender: ((...args: unknown[]) => unknown) | null = null;

/** Time every `RenderPass.render()` call globally, once. Safe to call repeatedly
 *  (guarded) — matches `attachRenderer`'s "patch once, keep forever" precedent. */
export function installRenderPassTrace(): void {
  if (renderPassPatched) return;
  renderPassPatched = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = RenderPass.prototype as any;
  const orig: (...args: unknown[]) => unknown = proto.render;
  originalRenderPassRender = orig;
  proto.render = function (this: unknown, ...args: unknown[]) {
    const t0 = performance.now();
    const result = orig.apply(this, args);
    push(renderPassRing, performance.now() - t0);
    if (passCounterActive) passesInLastComposerFrame++;
    return result;
  };
}

/** Most recent full `composer.render()` wall time, or `null` if no composer has been
 *  traced yet (composer bypassed, not yet mounted, or this build has no composer). */
export function getLatestComposerMs(): number | null {
  return latest(composerRing);
}
/** Most recent `RenderPass.render()` wall time — the base scene draw specifically. */
export function getLatestRenderPassMs(): number | null {
  return latest(renderPassRing);
}
export function getMedianComposerMs(): number | null {
  return median(composerRing);
}
export function getMedianRenderPassMs(): number | null {
  return median(renderPassRing);
}
/** How many `RenderPass.render()` calls fired inside the most recently COMPLETED
 *  `composer.render()` call. 1 means only the base scene pass ran (no active bloom
 *  work this frame, or bloom isn't the base RenderPass anyway — this counts base-pass
 *  invocations specifically, not every pass in the chain); >1 would mean the base pass
 *  itself somehow re-entered, which shouldn't happen — reported as-is either way, not
 *  interpreted here. */
export function getPassesInLastComposerFrame(): number {
  return passesInLastComposerFrame;
}

/** Test-only: drop all recorded samples and patch state, so each test starts clean. */
export function __resetForTests(): void {
  composerRing.idx = 0;
  composerRing.filled = 0;
  renderPassRing.idx = 0;
  renderPassRing.filled = 0;
  passesInLastComposerFrame = 0;
  passCounterActive = false;
  if (renderPassPatched && originalRenderPassRender) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (RenderPass.prototype as any).render = originalRenderPassRender;
  }
  renderPassPatched = false;
  originalRenderPassRender = null;
}
