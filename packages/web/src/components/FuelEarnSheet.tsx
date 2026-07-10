import type { Fuel } from "@brain/shared";

/**
 * "Ways to earn Fuel" — a tappable cheat-sheet you reach from the fuel gauge or the
 * low-fuel banner. Every active row is a real button that takes you straight to the
 * thing that earns it, so Fuel never feels mysterious or out of reach. The numbers
 * mirror the server economy (economy.ts) — keep them in sync.
 */

export type EarnKind = "memory" | "mind" | "thought" | "action";

interface Row {
  kind?: EarnKind; // present = actionable button; absent = passive/info row
  icon: string;
  label: string;
  amount: string;
  hint: string;
}

const ROWS: Row[] = [
  { kind: "memory", icon: "＋", label: "Log a memory", amount: "+15", hint: "Your main income — dump a thought and she grows the galaxy." },
  { kind: "mind", icon: "🧠", label: "Add to your Mind", amount: "+6", hint: "A goal, person, skill, identity or idea — building your mind pays." },
  { kind: "action", icon: "✅", label: "Clear an action item", amount: "+3", hint: "Tick off a day-to-day to-do in the Agenda." },
  { kind: "thought", icon: "💭", label: "Capture a thought", amount: "+2", hint: "Drop a fleeting thought into the mind space." },
  { icon: "🔥", label: "Daily streak", amount: "+2", hint: "Automatic the first time you feed your brain each day." },
  { icon: "🔦", label: "Codex discoveries", amount: "+4", hint: "Soumaya finds lore as she explores — one-time per entry." },
  { icon: "🛰️", label: "Slow auto-refuel", amount: "+3.5/hr", hint: "The tank trickles back up on its own while you're away." },
];

interface Props {
  fuel: Fuel | null;
  onAction: (kind: EarnKind) => void;
  onClose: () => void;
}

export function FuelEarnSheet({ fuel, onAction, onClose }: Props) {
  const pct = fuel ? Math.round((fuel.fuel / fuel.capacity) * 100) : 0;
  return (
    <div className="fuel-ways-backdrop" onClick={onClose}>
      <div className="fuel-ways" onClick={(e) => e.stopPropagation()}>
        <button className="fw-x" onClick={onClose} aria-label="Close">×</button>
        <div className="fw-head">
          <span className="fw-glyph">⛽</span>
          <div>
            <div className="fw-title">Ways to earn Fuel</div>
            {fuel && (
              <div className="fw-now">
                {Math.round(fuel.fuel)}/{fuel.capacity} · {pct}% — Soumaya spends it on deep-dive research & sector charting.
              </div>
            )}
          </div>
        </div>
        <div className="fw-rows">
          {ROWS.map((row) => (
            <div key={row.label} className={`fw-row${row.kind ? " actionable" : " passive"}`}>
              <span className="fw-ic">{row.icon}</span>
              <div className="fw-text">
                <span className="fw-label">{row.label}</span>
                <span className="fw-hint">{row.hint}</span>
              </div>
              <span className="fw-amount">{row.amount}</span>
              {row.kind && (
                <button className="fw-go" onClick={() => onAction(row.kind!)}>Go</button>
              )}
            </div>
          ))}
        </div>
        <div className="fw-foot">Her core upkeep and the living galaxy never cost Fuel — only her ambitious extra work does.</div>
      </div>
    </div>
  );
}
