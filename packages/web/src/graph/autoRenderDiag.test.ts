import { describe, it, expect, afterEach } from "vitest";
import {
  AUTO_DIAG_CONDITIONS,
  buildRunPlan,
  computeVerdict,
  formatReportText,
  registerAutoDiagRunner,
  runAutoDiag,
  isAutoDiagAvailable,
  type AutoDiagStepResult,
  type AutoDiagSample,
} from "./autoRenderDiag.js";

/**
 * Automated in-session Galaxy render-stall diagnostic (2026-09-10). The earlier
 * reload-based sweep produced non-monotonic (untrustworthy) results because each
 * condition reloaded the page — a fresh camera framing, JIT warm-up, and thermal
 * state every time. This harness instead runs every condition within ONE session,
 * interleaved with repeated baseline measurements, so drift across the whole run
 * (e.g. thermal throttling building up) gets controlled for per-condition rather than
 * assumed away. These tests cover the pure logic only — the actual stepping/timing
 * lives in Graph3D.tsx, which has no direct unit tests (an established pattern in
 * this file — see graph3dHelpers.ts's own header comment).
 */

function sample(renderP50: number): AutoDiagSample {
  return {
    renderP50,
    renderP95: renderP50 * 1.5,
    presentP50: renderP50 + 50,
    tickP50: 2.5,
    drawCalls: 900,
    triangles: 500_000,
    programs: 20,
    programsChurnCount: 0,
    transparentObjects: 1000,
    dpr: 1.5,
  };
}

describe("autoRenderDiag — buildRunPlan", () => {
  it("starts with baseline, then one (condition, baseline) pair per condition", () => {
    const plan = buildRunPlan(AUTO_DIAG_CONDITIONS, () => 0);
    expect(plan[0]!.key).toBe("baseline");
    expect(plan).toHaveLength(1 + AUTO_DIAG_CONDITIONS.length * 2);
    // [baseline, cond1, baseline, cond2, baseline, ...] — every EVEN index is baseline.
    for (let i = 0; i < plan.length; i += 2) {
      expect(plan[i]!.key).toBe("baseline");
    }
    for (let i = 1; i < plan.length; i += 2) {
      expect(plan[i]!.key).not.toBe("baseline");
    }
  });

  it("includes every condition exactly once", () => {
    const plan = buildRunPlan(AUTO_DIAG_CONDITIONS, () => 0.42);
    const nonBaselineKeys = plan.filter((c) => c.key !== "baseline").map((c) => c.key);
    const expectedKeys = AUTO_DIAG_CONDITIONS.map((c) => c.key);
    expect([...nonBaselineKeys].sort()).toEqual([...expectedKeys].sort());
  });

  it("is deterministic for a given RNG sequence (order can be reproduced for debugging)", () => {
    const seq = [0.9, 0.1, 0.5, 0.3, 0.7];
    const makeRng = () => {
      let i = 0;
      return () => seq[i++ % seq.length]!;
    };
    const planA = buildRunPlan(AUTO_DIAG_CONDITIONS, makeRng());
    const planB = buildRunPlan(AUTO_DIAG_CONDITIONS, makeRng());
    expect(planA.map((c) => c.key)).toEqual(planB.map((c) => c.key));
  });

  it("can actually reorder conditions (not always identity order)", () => {
    // A reversing-ish RNG sequence should NOT produce the same order as an
    // all-zero RNG (which leaves Fisher-Yates as identity).
    const identity = buildRunPlan(AUTO_DIAG_CONDITIONS, () => 0).map((c) => c.key);
    const shuffled = buildRunPlan(AUTO_DIAG_CONDITIONS, () => 0.99).map((c) => c.key);
    expect(shuffled).not.toEqual(identity);
  });
});

describe("autoRenderDiag — computeVerdict", () => {
  it("identifies a condition that collapses render time relative to its own local baseline", () => {
    const steps: AutoDiagStepResult[] = [
      { key: "baseline", label: "Baseline", isBaseline: true, index: 0, sample: sample(100) },
      { key: "nodeGlowSprites", label: "Glow off", isBaseline: false, index: 1, sample: sample(10) },
      { key: "baseline", label: "Baseline", isBaseline: true, index: 2, sample: sample(100) },
      { key: "nodeRings", label: "Rings off", isBaseline: false, index: 3, sample: sample(95) },
      { key: "baseline", label: "Baseline", isBaseline: true, index: 4, sample: sample(105) },
    ];
    const verdict = computeVerdict(steps);
    expect(verdict.ranked).toHaveLength(2);
    expect(verdict.ranked[0]!.key).toBe("nodeGlowSprites"); // biggest collapse ranks first
    expect(verdict.primaryCause?.key).toBe("nodeGlowSprites");
    expect(verdict.primaryCause!.ratio).toBeCloseTo(0.1, 5);
  });

  it("returns inconclusive (no primaryCause) when nothing clears the significance bar", () => {
    const steps: AutoDiagStepResult[] = [
      { key: "baseline", label: "Baseline", isBaseline: true, index: 0, sample: sample(100) },
      { key: "nodeRings", label: "Rings off", isBaseline: false, index: 1, sample: sample(95) },
      { key: "baseline", label: "Baseline", isBaseline: true, index: 2, sample: sample(100) },
    ];
    const verdict = computeVerdict(steps);
    expect(verdict.primaryCause).toBeNull();
    expect(verdict.ranked).toHaveLength(1);
  });

  it("handles a run with only baseline steps (nothing to rank)", () => {
    const steps: AutoDiagStepResult[] = [
      { key: "baseline", label: "Baseline", isBaseline: true, index: 0, sample: sample(100) },
    ];
    const verdict = computeVerdict(steps);
    expect(verdict.ranked).toEqual([]);
    expect(verdict.primaryCause).toBeNull();
  });

  it("uses the median of surrounding baselines, not just one side, as the local baseline", () => {
    const steps: AutoDiagStepResult[] = [
      { key: "baseline", label: "Baseline", isBaseline: true, index: 0, sample: sample(80) },
      { key: "nodeMacro", label: "Macro off", isBaseline: false, index: 1, sample: sample(40) },
      { key: "baseline", label: "Baseline", isBaseline: true, index: 2, sample: sample(120) },
    ];
    const verdict = computeVerdict(steps);
    // median(80, 120) = 100 -> ratio 40/100 = 0.4
    expect(verdict.ranked[0]!.localBaselineRenderP50).toBe(100);
    expect(verdict.ranked[0]!.ratio).toBeCloseTo(0.4, 5);
  });

  it("still computes a local baseline from whichever single neighbor exists at the run's edges", () => {
    // A condition with only ONE adjacent baseline (e.g. steps passed out of full
    // run-plan order, or a run that was cut short) shouldn't crash or silently drop.
    const steps: AutoDiagStepResult[] = [
      { key: "nodeCoreMesh", label: "Core mesh off", isBaseline: false, index: 0, sample: sample(20) },
      { key: "baseline", label: "Baseline", isBaseline: true, index: 1, sample: sample(100) },
    ];
    const verdict = computeVerdict(steps);
    expect(verdict.ranked).toHaveLength(1);
    expect(verdict.ranked[0]!.localBaselineRenderP50).toBe(100);
  });
});

describe("autoRenderDiag — formatReportText", () => {
  it("produces readable, non-throwing output including every step and the verdict", () => {
    const steps: AutoDiagStepResult[] = [
      { key: "baseline", label: "Baseline", isBaseline: true, index: 0, sample: sample(100) },
      { key: "nodeGlowSprites", label: "Glow off", isBaseline: false, index: 1, sample: sample(10) },
      { key: "baseline", label: "Baseline", isBaseline: true, index: 2, sample: sample(100) },
    ];
    const verdict = computeVerdict(steps);
    const text = formatReportText(steps, verdict);
    expect(text).toContain("Baseline");
    expect(text).toContain("Glow off");
    expect(text).toContain("ROOT CAUSE CANDIDATE");
  });

  it("reports INCONCLUSIVE when the verdict has no primary cause", () => {
    const steps: AutoDiagStepResult[] = [
      { key: "baseline", label: "Baseline", isBaseline: true, index: 0, sample: sample(100) },
    ];
    const text = formatReportText(steps, computeVerdict(steps));
    expect(text).toContain("INCONCLUSIVE");
  });
});

describe("autoRenderDiag — register/run plumbing", () => {
  afterEach(() => registerAutoDiagRunner(null));

  it("runAutoDiag resolves null when no runner is registered (Graph3D not mounted)", async () => {
    expect(isAutoDiagAvailable()).toBe(false);
    await expect(runAutoDiag()).resolves.toBeNull();
  });

  it("runAutoDiag delegates to the registered runner and returns its result", async () => {
    const fakeReport = { steps: [], verdict: { ranked: [], primaryCause: null }, startedAt: 1, finishedAt: 2 };
    registerAutoDiagRunner(async () => fakeReport);
    expect(isAutoDiagAvailable()).toBe(true);
    await expect(runAutoDiag()).resolves.toBe(fakeReport);
  });
});
