import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  noteRefreshInvoked,
  getRefreshCallsInWindow,
  __resetRefreshTrackingForTests,
  registerSnapshotCapture,
  captureGalaxySnapshot,
  isSnapshotCaptureAvailable,
  diffSnapshots,
  formatComparisonText,
  type GalaxyDiagSnapshot,
} from "./galaxyStateSnapshot.js";

function makeSnapshot(overrides: Partial<GalaxyDiagSnapshot> = {}): GalaxyDiagSnapshot {
  return {
    capturedAt: Date.now(),
    label: "test",
    tickP50: 3,
    renderP50: 12,
    renderP95: 18,
    presentP50: 16,
    gpuP50: null,
    gpuTimingSupported: false,
    composerMs: 14,
    renderPassMs: 12,
    passesInLastComposerFrame: 1,
    drawCalls: 200,
    triangles: 100000,
    lines: 50,
    points: 3,
    geometries: 40,
    textures: 30,
    programs: 12,
    programsChurnCount: 0,
    canvasWidth: 1080,
    canvasHeight: 2000,
    pixelRatio: 1.5,
    cameraX: 100,
    cameraY: 50,
    cameraZ: 900,
    totalObject3Ds: 800,
    visibleObject3Ds: 500,
    transparentObjects: 300,
    trackedNodes: 240,
    visibleNodes: 240,
    trackedLinks: 941,
    visibleLinks: 941,
    visibleLabels: 16,
    lightPoolSize: 4,
    composerBypassed: false,
    bloomPassCount: 1,
    refreshCallsLast3s: 0,
    ...overrides,
  };
}

describe("noteRefreshInvoked / getRefreshCallsInWindow", () => {
  beforeEach(() => __resetRefreshTrackingForTests());

  it("counts calls within the trailing 3s window and drops older ones", () => {
    noteRefreshInvoked(1000);
    noteRefreshInvoked(1500);
    noteRefreshInvoked(2000);
    expect(getRefreshCallsInWindow(2000)).toBe(3); // all within [-1000, 2000]
    expect(getRefreshCallsInWindow(4001)).toBe(2); // 1500 and 2000 fall within [1001, 4001]; 1000 doesn't
    expect(getRefreshCallsInWindow(5001)).toBe(0); // all now older than the window
  });

  it("starts at zero with nothing recorded", () => {
    expect(getRefreshCallsInWindow(0)).toBe(0);
  });
});

describe("registerSnapshotCapture / captureGalaxySnapshot", () => {
  beforeEach(() => registerSnapshotCapture(null)); // no leakage between tests in this file
  afterEach(() => registerSnapshotCapture(null));

  it("returns null when nothing is registered (Graph3D not mounted)", () => {
    expect(isSnapshotCaptureAvailable()).toBe(false);
    expect(captureGalaxySnapshot("x")).toBeNull();
  });

  it("delegates to the registered capture function with the given label", () => {
    registerSnapshotCapture((label) => makeSnapshot({ label }));
    expect(isSnapshotCaptureAvailable()).toBe(true);
    const snap = captureGalaxySnapshot("BAD");
    expect(snap?.label).toBe("BAD");
  });
});

describe("diffSnapshots", () => {
  it("flags fields that differ and formats numbers/booleans/null consistently", () => {
    const bad = makeSnapshot({ renderP50: 2800, drawCalls: 1066, composerBypassed: false });
    const good = makeSnapshot({ renderP50: 12, drawCalls: 220, composerBypassed: false, gpuP50: null });
    const rows = diffSnapshots(bad, good);
    const renderRow = rows.find((r) => r.field === "render p50 (ms)")!;
    expect(renderRow.notable).toBe(true);
    expect(renderRow.bad).toBe("2800"); // whole-number ms formats without a decimal
    expect(renderRow.good).toBe("12");

    const drawRow = rows.find((r) => r.field === "draw calls")!;
    expect(drawRow.notable).toBe(true);
    expect(drawRow.bad).toBe("1066");
    expect(drawRow.good).toBe("220");

    const bypassRow = rows.find((r) => r.field === "composer bypassed")!;
    expect(bypassRow.notable).toBe(false);
    expect(bypassRow.bad).toBe("no");

    const gpuRow = rows.find((r) => r.field === "GPU p50 (ms)")!;
    expect(gpuRow.bad).toBe("n/a");
    expect(gpuRow.good).toBe("n/a");
    expect(gpuRow.notable).toBe(false); // both null — not a real difference
  });

  it("treats identical snapshots as having zero notable differences", () => {
    const snap = makeSnapshot();
    const rows = diffSnapshots(snap, { ...snap });
    expect(rows.every((r) => !r.notable)).toBe(true);
  });
});

describe("formatComparisonText", () => {
  it("includes both labels, a marker for notable rows, and a summary count", () => {
    const bad = makeSnapshot({ label: "BAD", renderP50: 2800 });
    const good = makeSnapshot({ label: "GOOD", renderP50: 12 });
    const text = formatComparisonText(bad, good);
    expect(text).toContain("BAD");
    expect(text).toContain("GOOD");
    expect(text).toContain("≠");
    expect(text).toMatch(/\d+ field\(s\) differ/);
  });

  it("reports no differences when the two snapshots are identical", () => {
    const snap = makeSnapshot();
    const text = formatComparisonText(snap, { ...snap });
    expect(text).toContain("No fields differed");
  });
});
