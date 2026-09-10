import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * galaxySweep.ts drives its state machine through `sessionStorage`/`localStorage` and
 * `window.location.reload()`, matching the module's own doc comment: it reuses
 * perfDiag.ts's read-once-per-load config unchanged and cycles categories ACROSS
 * reloads rather than live within one page. Each test gets a fresh module instance
 * (its own module-level nothing here, but this matches the repo's established
 * convention for this style of test — see perfDiag.test.ts/renderModel.test.ts) and a
 * stubbed `location.reload` so a "reload" is observable without actually reloading
 * happy-dom.
 */

function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload },
    writable: true,
  });
  return reload;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("galaxySweep — isSweepActive / getSweepProgressLabel", () => {
  it("is inactive with nothing in sessionStorage", async () => {
    const { isSweepActive, getSweepProgressLabel } = await import("./galaxySweep.js");
    expect(isSweepActive()).toBe(false);
    expect(getSweepProgressLabel()).toBeNull();
  });

  it("is inactive once the step index reaches the end", async () => {
    const { isSweepActive, SWEEP_STEPS } = await import("./galaxySweep.js");
    sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: SWEEP_STEPS.length, results: [] }));
    expect(isSweepActive()).toBe(false);
  });

  it("ignores corrupt JSON rather than throwing", async () => {
    sessionStorage.setItem("galaxy.diagSweep", "{not json");
    const { isSweepActive } = await import("./galaxySweep.js");
    expect(isSweepActive()).toBe(false);
  });
});

describe("galaxySweep — startSweep", () => {
  it("resets progress to step 0 with no results, clears any prior report, and reloads", async () => {
    localStorage.setItem("galaxy.diagSweepReport", JSON.stringify([{ key: "baseline" }]));
    const { startSweep, isSweepActive, getSweepReport } = await import("./galaxySweep.js");
    const reload = stubReload();
    startSweep();
    expect(isSweepActive()).toBe(true);
    expect(getSweepReport()).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("galaxySweep — getSweepDiagConfig", () => {
  it("returns null when no sweep is running", async () => {
    const { getSweepDiagConfig } = await import("./galaxySweep.js");
    expect(getSweepDiagConfig()).toBeNull();
  });

  it("the baseline step is enabled:false with every category true — identical to no diag param at all", async () => {
    sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: 0, results: [] }));
    const { getSweepDiagConfig } = await import("./galaxySweep.js");
    expect(getSweepDiagConfig()).toEqual({ enabled: false, links: true, bodies: true, labels: true, glow: true, aux: true });
  });

  it("each of the original 5 category steps turns diagnostic mode on and hides exactly that one category", async () => {
    const { getSweepDiagConfig, SWEEP_STEPS } = await import("./galaxySweep.js");
    // Indices 1-5 are the original category steps (0 is baseline); indices 6+ are the
    // node-body sub-isolation steps appended later, covered by their own describe block.
    for (let i = 1; i <= 5; i++) {
      sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: i, results: [] }));
      const cfg = getSweepDiagConfig()!;
      const key = SWEEP_STEPS[i]!.key as "links" | "bodies" | "labels" | "glow" | "aux";
      expect(cfg.enabled).toBe(true);
      expect(cfg[key]).toBe(false);
      for (const other of ["links", "bodies", "labels", "glow", "aux"] as const) {
        if (other !== key) expect(cfg[other]).toBe(true);
      }
    }
  });

  it("a node-body sub-isolation step leaves the ordinary diag config at the baseline (all on, disabled)", async () => {
    const { getSweepDiagConfig, SWEEP_STEPS } = await import("./galaxySweep.js");
    for (let i = 6; i < SWEEP_STEPS.length; i++) {
      sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: i, results: [] }));
      expect(getSweepDiagConfig()).toEqual({ enabled: false, links: true, bodies: true, labels: true, glow: true, aux: true });
    }
  });
});

describe("galaxySweep — getSweepNodeBodyConfig", () => {
  it("returns null when no sweep is running", async () => {
    const { getSweepNodeBodyConfig } = await import("./galaxySweep.js");
    expect(getSweepNodeBodyConfig()).toBeNull();
  });

  it("returns null during every original-6 step (baseline + the 5 categories)", async () => {
    const { getSweepNodeBodyConfig } = await import("./galaxySweep.js");
    for (let i = 0; i <= 5; i++) {
      sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: i, results: [] }));
      expect(getSweepNodeBodyConfig()).toBeNull();
    }
  });

  it("each node-body step turns it on and hides exactly its own field", async () => {
    const { getSweepNodeBodyConfig, SWEEP_STEPS } = await import("./galaxySweep.js");
    const fields = ["coreMesh", "rings", "glowSprites", "asteroidBelt", "macro", "envMap"] as const;
    for (let i = 6; i < SWEEP_STEPS.length; i++) {
      sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: i, results: [] }));
      const cfg = getSweepNodeBodyConfig()!;
      expect(cfg.enabled).toBe(true);
      const offFields = fields.filter((f) => !cfg[f]);
      expect(offFields).toHaveLength(1); // exactly one field is off per step
      for (const f of fields) {
        if (!offFields.includes(f)) expect(cfg[f]).toBe(true);
      }
    }
  });
});

describe("galaxySweep — recordSweepMeasurement", () => {
  const sample = {
    presentP50: 10,
    presentP95: 20,
    renderP50: 5,
    tickP50: 2,
    drawCalls: 500,
    programs: 12,
    programsChurnCount: 0,
    transparentObjects: 30,
  };

  it("does nothing when no sweep is running", async () => {
    const { recordSweepMeasurement, getSweepReport } = await import("./galaxySweep.js");
    const reload = stubReload();
    recordSweepMeasurement(sample);
    expect(reload).not.toHaveBeenCalled();
    expect(getSweepReport()).toBeNull();
  });

  it("advances to the next step and reloads, keeping the accumulated result", async () => {
    sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: 0, results: [] }));
    const { recordSweepMeasurement, getSweepProgressLabel } = await import("./galaxySweep.js");
    const reload = stubReload();
    recordSweepMeasurement(sample);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(getSweepProgressLabel()).toContain("Step 2");
    const raw = JSON.parse(sessionStorage.getItem("galaxy.diagSweep")!);
    expect(raw.step).toBe(1);
    expect(raw.results).toHaveLength(1);
    expect(raw.results[0]).toMatchObject({ key: "baseline", ...sample });
  });

  it("on the LAST step, finalizes the report to localStorage instead of reloading, and clears in-progress state", async () => {
    const { SWEEP_STEPS, recordSweepMeasurement, isSweepActive, getSweepReport } = await import("./galaxySweep.js");
    const lastStep = SWEEP_STEPS.length - 1;
    sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: lastStep, results: [{ key: "baseline", label: "x", ...sample }] }));
    const reload = stubReload();
    recordSweepMeasurement(sample);
    expect(reload).not.toHaveBeenCalled();
    expect(isSweepActive()).toBe(false);
    const report = getSweepReport();
    expect(report).toHaveLength(2);
    expect(report![1]).toMatchObject({ key: SWEEP_STEPS[lastStep]!.key, ...sample });
  });
});

describe("galaxySweep — cancelSweep / clearSweepReport", () => {
  it("cancelSweep clears in-progress state without touching a finalized report", async () => {
    sessionStorage.setItem("galaxy.diagSweep", JSON.stringify({ step: 1, results: [] }));
    localStorage.setItem("galaxy.diagSweepReport", JSON.stringify([{ key: "baseline" }]));
    const { cancelSweep, isSweepActive, getSweepReport } = await import("./galaxySweep.js");
    cancelSweep();
    expect(isSweepActive()).toBe(false);
    expect(getSweepReport()).not.toBeNull();
  });

  it("clearSweepReport removes a finalized report", async () => {
    localStorage.setItem("galaxy.diagSweepReport", JSON.stringify([{ key: "baseline" }]));
    const { clearSweepReport, getSweepReport } = await import("./galaxySweep.js");
    clearSweepReport();
    expect(getSweepReport()).toBeNull();
  });
});
