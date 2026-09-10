import type * as THREE from "three";

/**
 * Frame-timing instrument for the galaxy (Performance Program, Stage 0).
 *
 * WHY THIS EXISTS — and why it does NOT measure FPS:
 * Graph3D's tick has an FPS-cap gate that *skips* frames (`nowMs - lastFrameMs < 1000/cap`).
 * That makes achieved frame RATE a useless control signal: a flagship capped at 30 reports
 * "30fps" while sitting on ~80% unused headroom, and would look identical to a phone that
 * can barely reach 30. So we measure WORK, not rate.
 *
 * THE SUBTLETY THAT SHAPED THIS FILE: the underlying `3d-force-graph` library owns its OWN
 * independent `requestAnimationFrame` loop (`_animationCycle` → `renderer.render()`), which
 * runs at the display's native cadence REGARDLESS of our FPS cap — it is not the same loop
 * as Graph3D's own `tick()`. An earlier version of this file tried to pair "the most recent
 * tick() duration" with "whichever render() call fires next", using one shared mutable
 * variable — but since the two loops run at different, independent rates, that pairing is
 * arbitrary: most render() calls would see a stale or already-consumed tick duration,
 * corrupting the percentiles with numbers that don't correspond to real work. So instead we
 * track three genuinely independent series, each sampled at its own natural site:
 *
 *   tick    — cost of OUR per-frame scene mutation (labels, LOD, pulses…), sampled once per
 *             actual invocation of Graph3D's tick() — i.e. never on a capped/skipped frame.
 *   render  — cost of the draw-call submission itself, sampled on every real render() call.
 *   present — wall-clock gap between two real render() calls, i.e. the true presentation
 *             cadence, independent of our cap.
 *
 * `gapMs = present.p95 - render.p95` is the CPU-vs-GPU diagnostic: both numbers come from
 * the same sampling site (the render patch), so the pairing is honest. If draw submission
 * (render) is cheap but frames still arrive far apart (present), the GPU itself — fill rate,
 * shaders — is what's slow, not our JS.
 *
 * Hot-path cost is one or two `performance.now()` calls and a couple of array writes per
 * sample, with no allocation — so this can stay on permanently and feed the adaptive
 * controller later. Percentiles are computed only when someone asks (the HUD polls at 2Hz),
 * never per frame.
 */

/** ~4s of history at 60fps — long enough for a stable p95, short enough to react. */
const RING = 240;

function makeRing() {
  return { buf: new Float32Array(RING), idx: 0, filled: 0 };
}

const tickRing = makeRing();
const renderRing = makeRing();
const presentRing = makeRing();
/** Reused for percentile sorting so snapshot() allocates nothing per call. */
const scratch = new Float32Array(RING);

function push(ring: ReturnType<typeof makeRing>, v: number) {
  ring.buf[ring.idx] = v;
  ring.idx = (ring.idx + 1) % RING;
  if (ring.filled < RING) ring.filled++;
}

let tickStart = 0;
let lastPresent = 0;

/** Frames whose present gap exceeded 25ms (well under 40fps) — i.e. a visible hitch. */
let dropped = 0;
/** Total real render() calls since the last reset (denominator for `dropped`). */
let rendered = 0;

let renderer: THREE.WebGLRenderer | null = null;
/** Patch each renderer instance once. A WeakSet (not a boolean) so a remount with a fresh
 *  renderer is instrumented too, instead of silently going quiet. */
const patchedRenderers = new WeakSet<THREE.WebGLRenderer>();

/**
 * Galaxy object counts (Phase 1 measurement task, soumaya-galaxy-rendering-
 * architecture-audit.md). These distinguish "how much data was fetched" from
 * "how much is actually tracked/visible right now" — the exact distinction
 * needed to compare a large View against a cluster-isolated small View.
 *
 * Pull-based, not push-based: Graph3D registers a getter once at mount
 * (reading its own already-existing refs — dataRef, clusterRef,
 * visibleLabelIdsRef, starLightPoolRef, sceneryRef — nothing new is tracked
 * per-frame). The getter is only ever INVOKED from snapshot(), i.e. at
 * PerfHUD's existing 2Hz poll — never from either render loop, so this adds
 * zero per-frame cost. A cluster-filtered link count does one O(links) array
 * filter, but only when this is called, at most twice a second.
 */
export interface GalaxyCounts {
  /** Total nodes/links currently fetched (before any cluster-isolate filter). */
  trackedNodes: number;
  trackedLinks: number;
  /** After the current cluster-isolate filter, if any (matches nodeVisibility/
   *  linkVisibility's own semantics) — this is what actually reaches
   *  three-forcegraph's tracked object set in Graph3D.tsx today. */
  visibleNodes: number;
  visibleLinks: number;
  /** Bodies currently showing a label (already capped — MAX_VISIBLE_LABELS). */
  visibleLabels: number;
  /** Fixed-size star-light pool (Stage 4) — does not scale with node count. */
  lightPoolSize: number;
  /** Journey-hub / Money-sky sprite counts (2 objects each per Journey/bill). */
  journeyObjects: number;
  moneyObjects: number;
  /**
   * Phase 2.1 bounded Detailed-link selection (soumaya-galaxy-bounded-render-
   * architecture.md, soumaya-galaxy-large-small-workload-diff-audit.md). Optional so
   * existing GalaxyCounts producers/fixtures (e.g. tests) don't need updating just
   * because this phase added new fields — Graph3D's real provider always supplies them.
   */
  /** Whether `?boundedLinks=1` is currently active for this session. */
  boundedLinksEnabled?: boolean;
  /** The configured Detailed-link budget (see `getDetailedLinkBudget()` in
   *  renderModel.ts) — reported even when disabled, since it's just a number. */
  detailedLinkBudget?: number;
  /** Links currently allowed the expensive curved-tube Detailed representation. Equals
   *  `visibleLinks` whenever bounded selection is disabled (no restriction applied). */
  detailedLinks?: number;
}

let galaxyCountsProvider: (() => GalaxyCounts) | null = null;

/** Graph3D calls this once at mount (and with `null` on unmount). */
export function registerGalaxyCounts(fn: (() => GalaxyCounts) | null): void {
  galaxyCountsProvider = fn;
}

/** Camera-motion flag: idle frames are cheap and lie, so the controller must ignore them. */
let movedRecently = false;

export interface Stat3 {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface PerfSnapshot {
  /** Cost of our own per-frame scene mutation (only sampled on frames that actually ran). */
  tick: Stat3;
  /** Cost of draw-call submission, sampled on every real render(). */
  render: Stat3;
  /** Wall-clock gap between real render() calls — the true presentation cadence. */
  present: Stat3;
  /** present.p95 - render.p95. Large => GPU/fill-rate bound. Small => submission-bound. */
  gapMs: number;
  /** Frames per second actually presented (from the median present gap). */
  fps: number;
  droppedPct: number;
  tickSamples: number;
  presentSamples: number;
  movedRecently: boolean;
  /** three.js counters — null until a renderer is attached. */
  drawInfo: { calls: number; triangles: number; lines: number; points: number } | null;
  memory: { geometries: number; textures: number } | null;
  programs: number | null;
  /** null until Graph3D has registered a provider (see registerGalaxyCounts). */
  galaxyCounts: GalaxyCounts | null;
}

/** Bracket the start of our per-frame scene work. Safe to call unconditionally. */
export function beginTick(): void {
  tickStart = performance.now();
}

/**
 * Bracket the end of our per-frame scene work and commit the sample immediately — this
 * does NOT wait for a render() call, because tick() and render() are independent loops
 * (see file header). Only called on frames that actually did work (the FPS-cap gate
 * returns before beginTick() runs on a skipped frame), so skipped frames never appear here.
 */
export function endTick(): void {
  push(tickRing, performance.now() - tickStart);
}

/**
 * Patch `renderer.render` so we can time the draw submission and the true present
 * cadence. react-force-graph drives its own render loop, so this is the only place we
 * can observe when a frame is genuinely produced.
 */
/**
 * The single most important unanswered question after three verified, tested render-path
 * fixes (Sun transmission, node early-Z, link-tube geometry churn) produced no perceptible
 * real-device improvement: is this device even running hardware-accelerated WebGL at all?
 * A software rasterizer (SwiftShader / ANGLE software / llvmpipe) pays a roughly per-draw-
 * call-and-per-pixel fixed cost that scene-content optimizations barely touch — which would
 * explain exactly this pattern (real fixes, zero measured effect). `WEBGL_debug_renderer_info`
 * is the standard (if occasionally masked-by-Chrome-fingerprinting-protection) way to ask.
 * Computed once and cached — this never changes for a given renderer instance.
 */
let cachedGpuInfo: string | null | undefined; // undefined = not yet computed, null = unavailable

export function getGpuInfo(): string | null {
  if (cachedGpuInfo !== undefined) return cachedGpuInfo;
  cachedGpuInfo = null;
  try {
    const gl = renderer?.getContext();
    if (!gl) return cachedGpuInfo;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return cachedGpuInfo; // Chrome sometimes masks this for fingerprinting reasons
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
    const rend = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    cachedGpuInfo = `${vendor} / ${rend}`;
  } catch {
    /* leave as null */
  }
  return cachedGpuInfo;
}

/**
 * The renderer's ACTUAL pixel ratio — as opposed to `window.devicePixelRatio`, which is
 * what the HUD's "dpr" field has always reported (a real, still-open discrepancy: see
 * docs/specs/soumaya-galaxy-large-render-forensic-audit.md §18 and the Rendering Contract).
 * `renderer.getPixelRatio()` reflects whatever `setPixelRatio()` was last actually called
 * with (clamped by graphicsConfig.ts's tier/rung/Battery-Saver logic) — the true multiplier
 * on every pixel of fragment work, independent of what the raw display reports.
 */
export function getRendererPixelRatio(): number | null {
  return renderer?.getPixelRatio() ?? null;
}

export function attachRenderer(r: THREE.WebGLRenderer): void {
  renderer = r; // newest renderer owns the `info` counters we report
  if (patchedRenderers.has(r)) return;
  patchedRenderers.add(r);

  const orig = r.render.bind(r);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (r as any).render = (scene: THREE.Scene, camera: THREE.Camera) => {
    const t0 = performance.now();
    orig(scene, camera);
    const t1 = performance.now();

    push(renderRing, t1 - t0);
    if (lastPresent !== 0) {
      const presentMs = t0 - lastPresent;
      push(presentRing, presentMs);
      if (presentMs > 25) dropped++;
    }
    lastPresent = t0;
    rendered++;
  };
}

/** Note that the camera moved this window — ascending quality on idle frames is a lie. */
export function markMoved(): void {
  movedRecently = true;
}

/** Nearest-rank percentile: `ceil(p/100 * n) - 1`. See stats() for why not interpolating. */
function pct(sorted: Float32Array, n: number, p: number): number {
  if (n === 0) return 0;
  const i = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[i]!;
}

/**
 * Deliberately NOT an interpolating percentile (`round(p/100 * (n-1))`) — with, say, 99
 * cheap samples and a single 100ms stall, that interpolating form would return the cheap
 * median for p99 and hide the stall completely. The entire point of this instrument is to
 * catch tail-latency spikes (GC pauses, shader recompiles), so the percentile has to be
 * the kind that actually surfaces them.
 */
function stats(ring: ReturnType<typeof makeRing>): Stat3 {
  const n = ring.filled;
  scratch.set(ring.buf.subarray(0, n));
  const view = scratch.subarray(0, n);
  view.sort();
  return {
    p50: pct(view, n, 50),
    p95: pct(view, n, 95),
    p99: pct(view, n, 99),
    max: n > 0 ? view[n - 1]! : 0,
  };
}

/**
 * Compute the current window's statistics. Called by the HUD at 2Hz (and later by the
 * adaptive controller) — never from either render loop.
 */
export function snapshot(): PerfSnapshot {
  const tick = stats(tickRing);
  // stats() reuses `scratch`, so each ring must be fully read out before the next call.
  const render = stats(renderRing);
  const present = stats(presentRing);
  const fps = present.p50 > 0 ? 1000 / present.p50 : 0;

  const info = renderer?.info ?? null;
  const moved = movedRecently;
  movedRecently = false; // consume: each caller sees motion since the last read

  return {
    tick,
    render,
    present,
    gapMs: Math.max(0, present.p95 - render.p95),
    fps,
    droppedPct: rendered > 0 ? (dropped / rendered) * 100 : 0,
    tickSamples: tickRing.filled,
    presentSamples: presentRing.filled,
    movedRecently: moved,
    drawInfo: info
      ? {
          calls: info.render.calls,
          triangles: info.render.triangles,
          lines: info.render.lines,
          points: info.render.points,
        }
      : null,
    memory: info ? { geometries: info.memory.geometries, textures: info.memory.textures } : null,
    programs: info?.programs?.length ?? null,
    galaxyCounts: galaxyCountsProvider ? galaxyCountsProvider() : null,
  };
}

/** Reset the rolling windows (e.g. after a quality change, so the old regime isn't averaged in). */
export function reset(): void {
  for (const ring of [tickRing, renderRing, presentRing]) {
    ring.idx = 0;
    ring.filled = 0;
  }
  dropped = 0;
  rendered = 0;
  lastPresent = 0;
}
