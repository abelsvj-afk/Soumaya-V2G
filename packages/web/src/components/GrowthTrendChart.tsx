import { useEffect, useId, useRef, useState } from "react";
import { buildChartGeometry, type ChartSeries } from "../lib/chartGeometry.js";
export type { ChartSeries, ChartPoint } from "../lib/chartGeometry.js";

/**
 * A generic, animated line chart (docs/specs/income-net-worth-trend.md) — used for the
 * Income/Net Worth Growth chart AND (per docs/specs/paystub-ingestion.md §6) the pay stub
 * gross/net trend, so there is only one charting implementation in the app, not two. Plain
 * SVG, no charting library, matching this codebase's existing "hand-rolled" convention
 * (WealthPanel's progress bars are also plain divs with a computed width). The pure geometry
 * math lives in lib/chartGeometry.ts, separate from this component.
 */
export function GrowthTrendChart({ series, height = 120 }: { series: ChartSeries[]; height?: number }) {
  const width = 320;
  const geo = buildChartGeometry(series, width, height);
  const clipId = useId();
  const [revealed, setRevealed] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRevealed(true);
      return;
    }
    setRevealed(false);
    // Two rAFs: the first commits the pre-reveal (width:0) state to the DOM, the second
    // flips it — a CSS transition needs those on separate frames to actually animate.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setRevealed(true));
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [series]);

  const hasData = series.some((s) => s.points.some((p) => p.y !== 0));

  return (
    <div className="gtc">
      <svg viewBox={`0 0 ${geo.width} ${geo.height}`} className="gtc-svg" role="img" aria-label={series.map((s) => s.label).join(" vs. ")}>
        <clipPath id={`gtc-clip-${clipId}`}>
          <rect x={0} y={0} width={revealed ? geo.width : 0} height={geo.height} className="gtc-reveal" />
        </clipPath>
        <line x1={geo.pad} y1={geo.height - geo.pad} x2={geo.width - geo.pad} y2={geo.height - geo.pad} className="gtc-baseline" />
        <g clipPath={`url(#gtc-clip-${clipId})`}>
          {geo.segments.map((seg, i) => (
            <path key={i} d={seg.d} stroke={seg.color} className={seg.dashed ? "gtc-line gtc-line-dashed" : "gtc-line"} fill="none" />
          ))}
        </g>
        {geo.latestDots.map((dot, i) => (
          <circle key={i} cx={dot.cx} cy={dot.cy} r={3.5} fill={dot.color} className="gtc-dot" />
        ))}
      </svg>
      <div className="gtc-legend">
        {series.map((s) => (
          <span key={s.label} className={`gtc-legend-item ${s.dashed ? "dashed" : ""}`}>
            <span className="gtc-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      {geo.xLabels.length > 0 && (
        <div className="gtc-xlabels">
          {geo.xLabels.map((l, i) => (
            <span key={i}>{l.text}</span>
          ))}
        </div>
      )}
      {!hasData && <p className="fin-muted gtc-empty">Not enough data yet — add a pay stub or a balance to start the line.</p>}
    </div>
  );
}
