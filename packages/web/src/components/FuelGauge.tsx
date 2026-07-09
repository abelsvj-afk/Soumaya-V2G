import { useEffect, useRef, useState } from "react";
import type { Fuel } from "@brain/shared";

/**
 * Always-on-screen fuel gauge — a futuristic "engine core" tube on the left edge that
 * you never have to open a menu to read. It fills to the current level, pulses when
 * Soumaya is burning fuel on a job, FLASHES green as it rises / amber-red as it drops,
 * floats the ±delta, and glows red when low. Pure SVG/CSS, no assets. Lives outside the
 * top header so the notch/status bar of an installed PWA can't hide it.
 */
export function FuelGauge({
  fuel,
  pops,
  busy,
}: {
  fuel: Fuel | null;
  pops: { id: number; text: string; spend?: boolean }[];
  /** Soumaya is actively working (spending) — drives the live "engine burn" pulse. */
  busy?: boolean;
}) {
  const [flash, setFlash] = useState<null | "up" | "down">(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!fuel) return;
    if (prev.current !== null && Math.abs(fuel.fuel - prev.current) > 0.05) {
      setFlash(fuel.fuel > prev.current ? "up" : "down");
      const t = window.setTimeout(() => setFlash(null), 900);
      prev.current = fuel.fuel;
      return () => window.clearTimeout(t);
    }
    prev.current = fuel.fuel;
  }, [fuel?.fuel]);

  if (!fuel) return null;
  const pct = Math.max(0, Math.min(1, fuel.fuel / fuel.capacity));
  const low = pct < 0.2;

  return (
    <div
      className={`fuel-gauge${flash ? ` flash-${flash}` : ""}${low ? " low" : ""}${busy ? " burning" : ""}`}
      role="meter"
      aria-label={`Fuel ${Math.round(fuel.fuel)} of ${fuel.capacity}`}
      aria-valuenow={Math.round(fuel.fuel)}
      aria-valuemax={fuel.capacity}
      title={`⛽ Fuel ${Math.round(fuel.fuel)}/${fuel.capacity} — Soumaya spends it on deep-dive research & sector charting (${fuel.jobCost}/job). Earn it by logging memories, forging links & clearing action items; it also slowly refills. Her core upkeep + the living galaxy never need fuel.`}
    >
      <span className="fg-ic">⛽</span>
      <div className="fg-tube">
        <div className="fg-fill" style={{ height: `${pct * 100}%` }}>
          <span className="fg-flow" />
        </div>
      </div>
      <span className="fg-val">{Math.round(fuel.fuel)}</span>
      <div className="fg-pops">
        {pops.map((p) => (
          <span key={p.id} className={`fg-pop ${p.spend ? "spend" : "gain"}`}>
            {p.text}
          </span>
        ))}
      </div>
    </div>
  );
}
