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
  onClick,
}: {
  fuel: Fuel | null;
  pops: { id: number; text: string; spend?: boolean }[];
  /** Soumaya is actively working (spending) — drives the live "engine burn" pulse. */
  busy?: boolean;
  /** Tap the gauge to open the "Ways to earn Fuel" cheat-sheet. */
  onClick?: () => void;
}) {
  const [flash, setFlash] = useState<null | "up" | "down">(null);
  const prev = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!fuel) return;
    const p = prev.current;
    prev.current = fuel.fuel;
    if (p !== null && Math.abs(fuel.fuel - p) > 0.05) {
      setFlash(fuel.fuel > p ? "up" : "down");
      // Timer lives in a ref (not the effect cleanup) so a later small-change render
      // can't cancel it and leave the flash class stuck on.
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 900);
    }
  }, [fuel?.fuel]);
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  if (!fuel) return null;
  const pct = Math.max(0, Math.min(1, fuel.fuel / fuel.capacity));
  const low = pct < 0.2;

  return (
    <div
      className={`fuel-gauge${flash ? ` flash-${flash}` : ""}${low ? " low" : ""}${busy ? " burning" : ""}${onClick ? " tappable" : ""}`}
      role={onClick ? "button" : "meter"}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      aria-label={`Fuel ${Math.round(fuel.fuel)} of ${fuel.capacity}${onClick ? " — tap for ways to earn Fuel" : ""}`}
      aria-valuenow={Math.round(fuel.fuel)}
      aria-valuemax={fuel.capacity}
      title={`⛽ Fuel ${Math.round(fuel.fuel)}/${fuel.capacity} — tap for ways to earn it. Soumaya spends it on deep-dive research & sector charting (${fuel.jobCost}/job). Earn it by logging memories, building your Mind & clearing action items; it also slowly refills. Her core upkeep + the living galaxy never need fuel.`}
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
