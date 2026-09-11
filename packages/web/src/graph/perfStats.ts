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
/** Actual GPU execution time per render() call, in ms — see attachRenderer's GPU timer
 *  query section below. Stays empty (never sampled) on a device/browser without
 *  `EXT_disjoint_timer_query_webgl2`. */
const gpuRing = makeRing();
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
  /**
   * Render-stall forensic trace (2026-09-10) item 9 — how many currently-tracked
   * scene objects carry a `transparent: true` material. Transparent objects skip
   * early-Z rejection and force three.js's back-to-front sort, so this number
   * matters independently of draw-call count. Computed by a full `scene.traverse()`
   * only when `snapshot()` is polled (the existing 2Hz HUD cadence), reusing the
   * exact traversal pattern the hover-highlight effect already runs elsewhere in
   * Graph3D.tsx — not a new per-frame cost.
   */
  transparentObjects?: number;
  /**
   * Item 3/4 — the always-created `EffectComposer` (react-force-graph-3d creates one
   * unconditionally at init, whether or not `addBloom()` is ever called) allocates
   * TWO full-screen render targets at construction time. `null` until the composer
   * exists; otherwise the ACTUAL width/height/pixelRatio/color-type of those two
   * idle-when-bloom-is-off buffers on this exact device, read directly off
   * `renderTarget1` rather than assumed from source.
   */
  composerBuffers?: { width: number; height: number; pixelRatio: number; halfFloat: boolean } | null;
}

/**
 * Render-stall forensic trace (2026-09-10) item 8/10 — `renderer.info.programs.length`
 * (already reported every poll) only ever shows a SNAPSHOT at read time; it can't by
 * itself say whether shader recompilation is happening BETWEEN polls. This tracks how
 * many times the count differed between two consecutive `snapshot()` calls (the HUD's
 * existing 2Hz poll) since the last `reset()` — a non-zero, growing value means real
 * program churn is occurring, not just that some number of programs happen to exist
 * right now. Zero added per-frame cost: both reads happen only inside `snapshot()`.
 */
let lastProgramsCount: number | null = null;
let programsChurnCount = 0;

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
  /** present.p95 - render.p95. Large => GPU/fill-rate bound. Small => submission-bound.
   *  UNRELIABLE under GPU back-pressure — see `gpu` below for the direct measurement. */
  gapMs: number;
  /** Real GPU execution time per render() call, from `EXT_disjoint_timer_query_webgl2`
   *  (`null` if the device/browser doesn't support it, or no query has resolved yet).
   *  This is the direct answer to "is render() slow because of real GPU work, or
   *  because the CPU call itself is blocked on driver/queue back-pressure?" — a small
   *  `gpu` alongside a huge `render` means the stall is NOT actual fragment/vertex
   *  work, however counterintuitive that looks next to `gapMs`. */
  gpu: Stat3 | null;
  /** Whether GPU timer queries are supported on this device/browser at all — `false`
   *  means `gpu` will stay `null` forever, not just "no samples yet". */
  gpuTimingSupported: boolean;
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
  /** How many times `programs.length` differed between two consecutive `snapshot()`
   *  polls since the last `reset()` — see the module-level doc comment above. A
   *  stable program count (0 here) rules out ongoing shader recompilation as the
   *  cause of a slow `render()`; a rising count points straight at it. */
  programsChurnCount: number;
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

/**
 * GPU timer queries (`EXT_disjoint_timer_query_webgl2`) — the decisive answer to
 * whether `render`'s cost is CPU submission/driver stall or genuine GPU execution
 * time. `render` (above) only measures how long the synchronous `renderer.render()`
 * JS call takes; on some platforms (notably ANGLE's Vulkan backend, used by this
 * app's real Android test devices) that call can itself BLOCK on GPU back-pressure,
 * making a real GPU-bound frame look identical, from JS alone, to "the CPU is doing
 * a second of real work" — they are NOT distinguishable without asking the GPU
 * directly how long it actually spent executing the commands.
 *
 * A `TIME_ELAPSED_EXT` query brackets one `render()` call's GPU work; the result is
 * NOT available synchronously (the GPU is usually still several frames behind), so
 * queries are polled — never blocked on — at the start of each subsequent render()
 * call via `QUERY_RESULT_AVAILABLE` before ever touching `QUERY_RESULT` (reading the
 * latter before the former is true would force exactly the synchronous stall this
 * exists to avoid). A small bounded queue (not just the single most recent query)
 * tolerates the GPU running a few frames behind without ever unbounded-growing if a
 * query never resolves (a lost context, a browser without real support despite
 * advertising the extension).
 */
const MAX_PENDING_GPU_QUERIES = 8;
let gpuExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
let gpuGl: WebGL2RenderingContext | null = null;
let gpuUnsupported = false;
const pendingGpuQueries: WebGLQuery[] = [];

function pollGpuQueries(): void {
  if (!gpuGl || !gpuExt) return;
  // A disjoint event (e.g. a display mode change mid-frame) means the GPU clock may
  // have been reset — every currently-pending result is now meaningless, per spec.
  if (gpuGl.getParameter(gpuExt.GPU_DISJOINT_EXT)) {
    for (const q of pendingGpuQueries) gpuGl.deleteQuery(q);
    pendingGpuQueries.length = 0;
    return;
  }
  while (pendingGpuQueries.length > 0) {
    const q = pendingGpuQueries[0]!;
    if (!gpuGl.getQueryParameter(q, gpuGl.QUERY_RESULT_AVAILABLE)) break; // still in flight
    const nanos = gpuGl.getQueryParameter(q, gpuGl.QUERY_RESULT) as number;
    push(gpuRing, nanos / 1e6);
    gpuGl.deleteQuery(q);
    pendingGpuQueries.shift();
  }
}

export function attachRenderer(r: THREE.WebGLRenderer): void {
  renderer = r; // newest renderer owns the `info` counters we report
  if (patchedRenderers.has(r)) return;
  patchedRenderers.add(r);

  if (!gpuUnsupported && !gpuExt) {
    try {
      const gl = r.getContext();
      // Only WebGL2 contexts expose the `_webgl2` variant of this extension; the
      // WebGL1 `EXT_disjoint_timer_query` has a different (harder to use safely,
      // callback-shaped) API and isn't worth supporting for a diagnostic-only tool.
      if ("createQuery" in gl) {
        const ext = (gl as WebGL2RenderingContext).getExtension("EXT_disjoint_timer_query_webgl2");
        if (ext) {
          gpuGl = gl as WebGL2RenderingContext;
          gpuExt = { TIME_ELAPSED_EXT: ext.TIME_ELAPSED_EXT, GPU_DISJOINT_EXT: ext.GPU_DISJOINT_EXT };
        } else {
          gpuUnsupported = true;
        }
      } else {
        gpuUnsupported = true;
      }
    } catch {
      gpuUnsupported = true;
    }
  }

  const orig = r.render.bind(r);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (r as any).render = (scene: THREE.Scene, camera: THREE.Camera) => {
    pollGpuQueries();

    let query: WebGLQuery | null = null;
    if (gpuGl && gpuExt && pendingGpuQueries.length < MAX_PENDING_GPU_QUERIES) {
      query = gpuGl.createQuery();
      gpuGl.beginQuery(gpuExt.TIME_ELAPSED_EXT, query);
    }

    const t0 = performance.now();
    orig(scene, camera);
    const t1 = performance.now();

    if (query) {
      gpuGl!.endQuery(gpuExt!.TIME_ELAPSED_EXT);
      pendingGpuQueries.push(query);
    }

    const durationMs = t1 - t0;
    push(renderRing, durationMs);
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
  const gpu = gpuRing.filled > 0 ? stats(gpuRing) : null;
  const fps = present.p50 > 0 ? 1000 / present.p50 : 0;

  const info = renderer?.info ?? null;
  const moved = movedRecently;
  movedRecently = false; // consume: each caller sees motion since the last read

  const programsNow = info?.programs?.length ?? null;
  if (programsNow != null) {
    if (lastProgramsCount != null && programsNow !== lastProgramsCount) programsChurnCount++;
    lastProgramsCount = programsNow;
  }

  return {
    tick,
    render,
    present,
    gapMs: Math.max(0, present.p95 - render.p95),
    gpu,
    gpuTimingSupported: gpuExt !== null,
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
    programs: programsNow,
    programsChurnCount,
    galaxyCounts: galaxyCountsProvider ? galaxyCountsProvider() : null,
  };
}

/** Reset the rolling windows (e.g. after a quality change, so the old regime isn't averaged in). */
export function reset(): void {
  for (const ring of [tickRing, renderRing, presentRing, gpuRing]) {
    ring.idx = 0;
    ring.filled = 0;
  }
  dropped = 0;
  rendered = 0;
  lastPresent = 0;
  lastProgramsCount = null;
  programsChurnCount = 0;
  // Pending GPU queries belong to frames rendered under the OLD regime — let them
  // resolve and get discarded naturally by the next pollGpuQueries() call rather than
  // deleting them here mid-flight (deleting a query before its result is read is
  // harmless per spec, but there's no benefit to doing it eagerly here either).
}
