/**
 * Automated, in-session Galaxy render-stall diagnostic (2026-09-10).
 *
 * Every earlier diagnostic in this investigation (the render-isolation sweep,
 * nodeBodyDiag.ts's finer sub-categories) drove its A/B comparison across separate
 * PAGE RELOADS — one condition per full page load. That reload boundary turned out to
 * be a real confound, not just noise: reloading re-frames the camera via
 * `frameGalaxy()`, restarts the JS engine's JIT warm-up state, and resets whatever
 * thermal-throttling state the device's GPU driver was in — all of which can shift
 * render time by a large factor completely independent of which render category was
 * actually disabled. The result was a set of non-monotonic readings (e.g. "rings off"
 * reading WORSE than baseline) that cannot be trusted as causal evidence.
 *
 * This module runs the SAME kind of category-isolation experiment, but entirely
 * WITHIN one page session, with no reload between conditions: the same camera
 * position, the same warmed-up JS engine, the same thermal state throughout. Each
 * condition is applied live via `Graph3D.tsx`'s `liveDiagOverrideRef`/
 * `liveNodeBodyOverrideRef` refs (see that file) and `composerBypassDiag.ts`'s
 * `setComposerBypassLive`, both of which are read/re-evaluated every frame already —
 * no new render loop, no scene rebuild, no camera move.
 *
 * Scope, stated plainly: only the categories PROVEN to be re-evaluated every frame
 * (and therefore safe to toggle live, mid-session, without a reload) are included —
 * the node-body sub-categories (core mesh / rings / glow-corona sprites / asteroid
 * belt / macro sphere) and the EffectComposer bypass. `links`/`aux`/the coarse
 * `bodies`/`glow` perfDiag.ts categories are enforced at one-time construction/mount
 * points in Graph3D.tsx (visibility set once when a node or scenery group is built,
 * or when the composer's pass list is assembled) and do NOT reliably re-apply from a
 * live ref flip alone — including them here without a much larger, riskier
 * refactor of those call sites would risk producing ANOTHER set of misleading
 * readings, which is exactly what this module exists to stop doing. Those coarser
 * categories already have real (if noisier) reload-based sweep data from earlier in
 * this investigation.
 */

export type AutoDiagConditionKey =
  | "baseline"
  | "composerBypass"
  | "nodeCoreMesh"
  | "nodeRings"
  | "nodeGlowSprites"
  | "nodeAsteroidBelt"
  | "nodeMacro";

export interface AutoDiagConditionDef {
  key: AutoDiagConditionKey;
  label: string;
}

/** The non-baseline conditions this harness can safely toggle live, in one session. */
export const AUTO_DIAG_CONDITIONS: readonly AutoDiagConditionDef[] = [
  { key: "composerBypass", label: "EffectComposer bypassed (direct renderer.render)" },
  { key: "nodeCoreMesh", label: "Node core mesh/material off" },
  { key: "nodeRings", label: "Node rings off" },
  { key: "nodeGlowSprites", label: "Node glow/corona sprites off" },
  { key: "nodeAsteroidBelt", label: "Asteroid belt off" },
  { key: "nodeMacro", label: "Macro-LOD sphere off" },
];

const BASELINE: AutoDiagConditionDef = { key: "baseline", label: "Baseline (everything on)" };

/** No asset loading to wait for (the scene is already fully loaded — this harness
 *  never reloads), just enough frames for the LOD hysteresis/visibility toggle to
 *  settle before measuring. */
export const AUTO_DIAG_WARMUP_MS = 800;
/** Generous — on a device this broken (render time up to ~2s/frame in the reported
 *  baseline), a short window would only capture 1-2 samples, too few for a stable
 *  median. */
export const AUTO_DIAG_MEASURE_MS = 4000;

/**
 * Build the run plan: baseline, then each non-baseline condition (in RANDOMIZED
 * order — reduces the odds that some slow monotonic drift across the whole run, e.g.
 * thermal throttling building up over time, gets mistaken for a specific condition's
 * effect) with a baseline repeat immediately after each one. Pure and injectable-RNG
 * for deterministic tests.
 */
export function buildRunPlan(
  conditions: readonly AutoDiagConditionDef[] = AUTO_DIAG_CONDITIONS,
  rng: () => number = Math.random,
): AutoDiagConditionDef[] {
  const shuffled = [...conditions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const plan: AutoDiagConditionDef[] = [BASELINE];
  for (const c of shuffled) {
    plan.push(c, BASELINE);
  }
  return plan;
}

export interface AutoDiagSample {
  renderP50: number;
  renderP95: number;
  presentP50: number;
  tickP50: number;
  drawCalls: number | null;
  triangles: number | null;
  programs: number | null;
  programsChurnCount: number | null;
  transparentObjects: number | null;
  dpr: number | null;
}

export interface AutoDiagStepResult {
  key: AutoDiagConditionKey;
  label: string;
  isBaseline: boolean;
  /** Position of this step within the run plan — needed to find the two baseline
   *  readings immediately surrounding a non-baseline step for `computeVerdict`. */
  index: number;
  sample: AutoDiagSample;
}

export interface AutoDiagVerdictEntry {
  key: AutoDiagConditionKey;
  label: string;
  /** Median of the baseline reading immediately before and after this condition in
   *  the run plan — controls for drift across the session, per-condition. */
  localBaselineRenderP50: number;
  conditionRenderP50: number;
  /** conditionRenderP50 / localBaselineRenderP50 — well below 1 means this condition
   *  collapsed render time relative to its own local baseline. */
  ratio: number;
}

export interface AutoDiagVerdict {
  /** Every non-baseline condition, sorted by ratio ascending (biggest collapse first). */
  ranked: AutoDiagVerdictEntry[];
  /** The strongest candidate, or null if nothing cleared the significance bar. */
  primaryCause: AutoDiagVerdictEntry | null;
}

/** A condition must render at under this fraction of its own local baseline to be
 *  treated as a real, not incidental, cause — chosen well below "half the time" so a
 *  merely-contributing factor doesn't get mistaken for THE cause. */
const SIGNIFICANCE_RATIO = 0.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Pure verdict computation from a completed run's steps — no timers, no DOM, directly
 * unit-testable. For each non-baseline step, finds the baseline step immediately
 * before and after it (by `index`) and computes that pair's median as the "local
 * baseline" for this specific condition, rather than one global baseline for the
 * whole run — this is what actually controls for session-wide drift (e.g. thermal
 * throttling building up over the ~30-40s a full run takes).
 */
export function computeVerdict(steps: AutoDiagStepResult[]): AutoDiagVerdict {
  const byIndex = [...steps].sort((a, b) => a.index - b.index);
  const ranked: AutoDiagVerdictEntry[] = [];

  for (let i = 0; i < byIndex.length; i++) {
    const step = byIndex[i]!;
    if (step.isBaseline) continue;
    const before = byIndex[i - 1];
    const after = byIndex[i + 1];
    const baselineReadings = [before, after].filter((s): s is AutoDiagStepResult => !!s?.isBaseline).map((s) => s.sample.renderP50);
    if (baselineReadings.length === 0) continue; // shouldn't happen given buildRunPlan's shape, but stay defensive
    const localBaselineRenderP50 = median(baselineReadings);
    const conditionRenderP50 = step.sample.renderP50;
    const ratio = localBaselineRenderP50 > 0 ? conditionRenderP50 / localBaselineRenderP50 : 1;
    ranked.push({ key: step.key, label: step.label, localBaselineRenderP50, conditionRenderP50, ratio });
  }

  ranked.sort((a, b) => a.ratio - b.ratio);
  const top = ranked[0] ?? null;
  const primaryCause = top && top.ratio < SIGNIFICANCE_RATIO ? top : null;
  return { ranked, primaryCause };
}

/** Human-readable report, for the Settings display and copy-to-clipboard. */
export function formatReportText(steps: AutoDiagStepResult[], verdict: AutoDiagVerdict): string {
  const lines: string[] = [];
  lines.push("Automated Galaxy render-stall diagnostic (in-session, no reload)");
  lines.push("");
  lines.push("Raw steps, in run order:");
  for (const s of [...steps].sort((a, b) => a.index - b.index)) {
    lines.push(
      `  [${s.index}] ${s.label}: render p50 ${s.sample.renderP50.toFixed(1)}ms  p95 ${s.sample.renderP95.toFixed(1)}ms  ` +
        `present p50 ${s.sample.presentP50.toFixed(1)}ms  tick p50 ${s.sample.tickP50.toFixed(1)}ms  ` +
        `draws ${s.sample.drawCalls ?? "?"}  tris ${s.sample.triangles ?? "?"}  programs ${s.sample.programs ?? "?"}  ` +
        `churn ${s.sample.programsChurnCount ?? "?"}  transparent ${s.sample.transparentObjects ?? "?"}  dpr ${s.sample.dpr ?? "?"}`,
    );
  }
  lines.push("");
  lines.push("Verdict (ratio = condition render p50 / its own local baseline render p50):");
  if (verdict.ranked.length === 0) {
    lines.push("  No non-baseline conditions were recorded.");
  } else {
    for (const r of verdict.ranked) {
      lines.push(`  ${r.label}: ${r.conditionRenderP50.toFixed(1)}ms / ${r.localBaselineRenderP50.toFixed(1)}ms  (ratio ${r.ratio.toFixed(2)})`);
    }
  }
  lines.push("");
  lines.push(
    verdict.primaryCause
      ? `ROOT CAUSE CANDIDATE: ${verdict.primaryCause.label} (ratio ${verdict.primaryCause.ratio.toFixed(2)}, well under the ${SIGNIFICANCE_RATIO} significance bar)`
      : `INCONCLUSIVE: no single condition collapsed render time below ${SIGNIFICANCE_RATIO}x its own local baseline.`,
  );
  return lines.join("\n");
}

export interface AutoDiagReport {
  steps: AutoDiagStepResult[];
  verdict: AutoDiagVerdict;
  startedAt: number;
  finishedAt: number;
}

export type AutoDiagRunner = () => Promise<AutoDiagReport>;
export type AutoDiagProgressListener = (label: string, stepIndex: number, totalSteps: number) => void;

let runner: AutoDiagRunner | null = null;
let progressListener: AutoDiagProgressListener | null = null;

/** Graph3D calls this once at mount (and with `null` on unmount) — same
 *  register/consume pattern as perfStats.ts's `registerGalaxyCounts`. */
export function registerAutoDiagRunner(fn: AutoDiagRunner | null): void {
  runner = fn;
}

/** Optional: subscribe to step-by-step progress while a run is in flight (for a
 *  Settings "step 3/7…" label). Only one listener at a time — a diagnostic UI concern,
 *  not a pub/sub system. */
export function setAutoDiagProgressListener(fn: AutoDiagProgressListener | null): void {
  progressListener = fn;
}

/** Called by Graph3D's runner implementation as it advances — never by external code. */
export function reportAutoDiagProgress(label: string, stepIndex: number, totalSteps: number): void {
  progressListener?.(label, stepIndex, totalSteps);
}

/** Returns null if Graph3D isn't mounted (nothing registered). */
export function runAutoDiag(): Promise<AutoDiagReport | null> {
  if (!runner) return Promise.resolve(null);
  return runner();
}

export function isAutoDiagAvailable(): boolean {
  return runner !== null;
}
