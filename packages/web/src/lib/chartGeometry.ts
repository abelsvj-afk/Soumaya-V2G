/**
 * Pure geometry for GrowthTrendChart.tsx (docs/specs/income-net-worth-trend.md) — no DOM, no
 * React, fully unit-testable (the "prove it by measurement" rule this codebase applies to
 * every LOD/layout function, e.g. orbits.ts). Kept in its own plain module, separate from the
 * component, so this math can be tested without pulling in JSX/React at all.
 */

export interface ChartPoint {
  x: string; // a short label (date or month) — not parsed, just displayed
  y: number;
  /** Per-point override for this segment's stroke style; falls back to the series default. */
  dashed?: boolean;
}
export interface ChartSeries {
  label: string;
  color: string;
  dashed?: boolean;
  points: ChartPoint[];
}

export interface ChartSegment {
  d: string;
  dashed: boolean;
  color: string;
}
export interface LatestDot {
  cx: number;
  cy: number;
  color: string;
}
export interface ChartGeometry {
  segments: ChartSegment[];
  latestDots: LatestDot[];
  xLabels: { x: number; text: string }[];
  width: number;
  height: number;
  pad: number;
}

/**
 * Points are spaced evenly by INDEX, not by parsed date math — correct here because every
 * caller feeds evenly-spaced monthly buckets, and it avoids date-parsing edge cases inside
 * the chart itself. Two series (or two segments of one series, e.g. net worth's "projected
 * cash" stretch) are distinguished by stroke style — solid vs. dashed — never colour alone.
 */
export function buildChartGeometry(series: ChartSeries[], width = 320, height = 120, pad = 10): ChartGeometry {
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const minY = Math.min(0, ...(allY.length ? allY : [0]));
  const maxY = Math.max(1, ...(allY.length ? allY : [1]));
  const span = maxY - minY || 1;
  const n = Math.max(1, ...series.map((s) => s.points.length));
  const xStep = n > 1 ? (width - pad * 2) / (n - 1) : 0;
  const xAt = (i: number) => pad + i * xStep;
  const yAt = (v: number) => height - pad - ((v - minY) / span) * (height - pad * 2);

  const segments: ChartSegment[] = [];
  const latestDots: LatestDot[] = [];

  for (const s of series) {
    let i = 0;
    // `carryCoord` duplicates the previous segment's LAST coordinate as this segment's
    // FIRST, so adjacent segments connect with no visual gap — without re-deriving this
    // segment's own dashed style from that shared boundary point (deriving style from a
    // point already consumed by the previous segment can never observe the point AFTER it,
    // which is what actually determines where the style changes — an earlier version of
    // this loop advanced `i` to the shared point instead of past it, so `dashedHere` kept
    // re-reading the same value forever: an infinite loop pushing an unbounded number of
    // segments, caught by a hung/OOM test run rather than a wrong-output one).
    let carryCoord: [number, number] | null = null;
    while (i < s.points.length) {
      const dashedHere = s.points[i]!.dashed ?? s.dashed ?? false;
      let j = i;
      while (j + 1 < s.points.length && (s.points[j + 1]!.dashed ?? s.dashed ?? false) === dashedHere) j++;
      const coords: Array<[number, number]> = carryCoord ? [carryCoord] : [];
      for (let k = i; k <= j; k++) coords.push([xAt(k), yAt(s.points[k]!.y)]);
      const d = coords.map(([x, y], k) => `${k === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
      segments.push({ d, dashed: dashedHere, color: s.color });
      if (j >= s.points.length - 1) break;
      carryCoord = [xAt(j), yAt(s.points[j]!.y)];
      i = j + 1; // strictly past this segment — guarantees termination
    }
    if (s.points.length > 0) {
      const last = s.points[s.points.length - 1]!;
      latestDots.push({ cx: xAt(s.points.length - 1), cy: yAt(last.y), color: s.color });
    }
  }

  const longest = series.reduce((a, s) => (s.points.length > a.length ? s.points : a), [] as ChartPoint[]);
  const xLabels =
    longest.length === 0
      ? []
      : longest.length === 1
        ? [{ x: xAt(0), text: longest[0]!.x }]
        : [{ x: xAt(0), text: longest[0]!.x }, { x: xAt(longest.length - 1), text: longest[longest.length - 1]!.x }];

  return { segments, latestDots, xLabels, width, height, pad };
}
