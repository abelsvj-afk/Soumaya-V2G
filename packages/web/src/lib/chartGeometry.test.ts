import { describe, it, expect } from "vitest";
import { buildChartGeometry, type ChartSeries } from "./chartGeometry.js";

/**
 * Pure geometry only — no DOM rendering, matching this codebase's "prove it by measurement"
 * approach for layout math (same discipline as orbits.ts's LOD gap-function tests).
 */
describe("buildChartGeometry", () => {
  it("spaces points evenly across the width by index", () => {
    const series: ChartSeries[] = [{ label: "Net", color: "#fff", points: [{ x: "Jan", y: 0 }, { x: "Feb", y: 10 }, { x: "Mar", y: 20 }] }];
    const geo = buildChartGeometry(series, 300, 120, 10);
    expect(geo.segments).toHaveLength(1);
    // One M + two L commands for 3 points.
    expect(geo.segments[0]!.d.match(/[ML]/g)).toHaveLength(3);
  });

  it("splits a series into separate segments where the dashed flag changes, overlapping at the boundary", () => {
    const series: ChartSeries[] = [{
      label: "Net worth",
      color: "#fff",
      points: [
        { x: "Jan", y: 100, dashed: true },
        { x: "Feb", y: 120, dashed: true },
        { x: "Mar", y: 150, dashed: false },
      ],
    }];
    const geo = buildChartGeometry(series, 300, 120, 10);
    expect(geo.segments).toHaveLength(2);
    expect(geo.segments[0]!.dashed).toBe(true);
    expect(geo.segments[1]!.dashed).toBe(false);
    // Segment 1 ends where segment 2 starts (overlap, no gap) — both commands reference
    // the same x for the Feb->Mar boundary point.
    const seg1Coords = geo.segments[0]!.d.match(/[\d.]+,[\d.]+/g)!;
    const seg2Coords = geo.segments[1]!.d.match(/[\d.]+,[\d.]+/g)!;
    expect(seg1Coords[seg1Coords.length - 1]).toBe(seg2Coords[0]);
  });

  it("places the latest-point dot at the final coordinate of each series", () => {
    const series: ChartSeries[] = [{ label: "Gross", color: "#0f0", points: [{ x: "Jan", y: 0 }, { x: "Feb", y: 100 }] }];
    const geo = buildChartGeometry(series, 200, 100, 10);
    expect(geo.latestDots).toHaveLength(1);
    // y=100 is the max → drawn near the top (small cy, close to `pad`).
    expect(geo.latestDots[0]!.cy).toBeCloseTo(10, 0);
  });

  it("never divides by zero when every value is identical (flat line)", () => {
    const series: ChartSeries[] = [{ label: "Flat", color: "#fff", points: [{ x: "A", y: 500 }, { x: "B", y: 500 }] }];
    const geo = buildChartGeometry(series, 200, 100, 10);
    expect(geo.segments[0]!.d).not.toMatch(/NaN/);
    expect(geo.latestDots[0]!.cy).not.toBeNaN();
  });

  it("handles an empty series without throwing", () => {
    const geo = buildChartGeometry([{ label: "Empty", color: "#fff", points: [] }], 200, 100, 10);
    expect(geo.segments).toHaveLength(0);
    expect(geo.latestDots).toHaveLength(0);
    expect(geo.xLabels).toHaveLength(0);
  });

  it("x labels show only the first and last point for a multi-point series", () => {
    const series: ChartSeries[] = [{ label: "S", color: "#fff", points: [{ x: "Jan", y: 1 }, { x: "Feb", y: 2 }, { x: "Mar", y: 3 }] }];
    const geo = buildChartGeometry(series, 200, 100, 10);
    expect(geo.xLabels.map((l) => l.text)).toEqual(["Jan", "Mar"]);
  });
});
