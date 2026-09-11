/**
 * The Galaxy's actual GPU render-rate cap.
 *
 * Graph3D's own tick() already gates OUR per-frame scene mutation (labels, LOD,
 * pulses…) behind the configured fpsCap — but that only skips OUR work. The
 * underlying `3d-force-graph` library owns a separate, independent
 * `requestAnimationFrame` loop (`_animationCycle`, in 3d-force-graph.mjs) that calls
 * `renderObjs.tick()` every native frame regardless of anything Graph3D does — and
 * `renderObjs.tick()` unconditionally submits a real GPU draw
 * (`postProcessingComposer.render()`, confirmed always present — three-render-objects
 * creates one unconditionally at init whether or not bloom is ever enabled) every
 * single time it's called. So a "30fps" cap has never actually meant 30 real GPU
 * submissions per second — on a 60Hz display it was still drawing at 60Hz, and on a
 * 90/120Hz phone, still drawing at the full native rate. perfStats.ts's own header
 * comment documents this exact gap; this module closes it.
 *
 * The library exposes no render-rate-limiting API of its own — only a full
 * pauseAnimation()/resumeAnimation() (which also stops pointer-hover raycasting and
 * controls.update(), not just drawing — too broad a hammer). The only place we can
 * intercept JUST the GPU submission, without touching interaction responsiveness, is
 * the composer's own render() method — the single entry point renderObjs.tick() calls
 * into every native frame. Patching `renderer.render` instead (as perfStats.ts's
 * attachRenderer already does, for measurement) would NOT be enough: bloom's multiple
 * internal renderer.render() calls per composer pass would still all fire, and
 * skipping only one of them mid-sequence would corrupt the frame (a blur pass reading
 * a stale buffer). Skipping the whole composer.render() call atomically avoids that.
 *
 * Safe by construction: `EffectComposer.render(deltaTime)` (three.js) falls back to
 * its own internal `THREE.Clock.getDelta()` whenever no deltaTime is passed — the
 * exact case here — and that clock only advances when actually read, so skipping a
 * call costs nothing and the next real render reports correctly the FULL elapsed time
 * since the last one, not since the skipped frame. No manual delta accumulation needed.
 */

/** Matches Graph3D.tsx's own tick()-gate slack exactly (`nowMs - lastFrameMs <
 *  1000/cap - 1.5`) — same cap, same tolerance, so the JS-work throttle and the GPU
 *  submission throttle agree on what "on time" means. */
const CAP_SLACK_MS = 1.5;

/** Pure decision: should this frame's real GPU submission be skipped? `lastRenderMs`
 *  of `null` always renders (nothing to compare against yet — the very first frame, or
 *  a fresh composer) — `null`, not `0`, so a real render that happens to land at
 *  `performance.now() === 0` is never mistaken for "no previous render." A non-finite
 *  or non-positive `fpsCap` never skips — bogus config must never turn into "the
 *  galaxy stops rendering." */
export function shouldSkipRenderFrame(nowMs: number, lastRenderMs: number | null, fpsCap: number): boolean {
  if (lastRenderMs === null) return false;
  if (!Number.isFinite(fpsCap) || fpsCap <= 0) return false;
  return nowMs - lastRenderMs < 1000 / fpsCap - CAP_SLACK_MS;
}

interface ComposerLike {
  render(deltaTime?: number): void;
}

const patchedComposers = new WeakSet<ComposerLike>();

/**
 * Wrap this composer instance's render() so it actually stops submitting to the GPU
 * once `getFpsCap()`'s target rate is met — the real fix for the FPS cap described
 * above. Idempotent per instance (a remount hands a fresh composer, which gets its own
 * independent wrap — same WeakSet-per-instance precedent as renderStageTrace.ts's
 * installComposerTrace).
 */
export function applyRenderRateCap(composer: ComposerLike, getFpsCap: () => number): void {
  if (patchedComposers.has(composer)) return;
  patchedComposers.add(composer);
  const orig = composer.render.bind(composer);
  let lastRenderMs: number | null = null;
  composer.render = (deltaTime?: number) => {
    const now = performance.now();
    if (shouldSkipRenderFrame(now, lastRenderMs, getFpsCap())) return;
    lastRenderMs = now;
    orig(deltaTime);
  };
}
