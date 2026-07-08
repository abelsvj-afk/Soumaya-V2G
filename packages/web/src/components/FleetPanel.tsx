import { useEffect, useState } from "react";
import { FLEET } from "../graph/fleet.js";
import type { FleetStatus } from "../graph/Graph3D.js";

/**
 * The Fleet roster: Soumaya and every agent that reports to her — ship, station,
 * Aura beacons, Scout, Defender. Each shows what it's doing RIGHT NOW in plain
 * language, a live activity pulse, and fly-to chips for the memories it's working —
 * so the fleet reads as a living crew, not a static list. Lore is tucked behind a
 * disclosure so the "what is this?" answer is one tap away without walls of text.
 */
export function FleetPanel({
  getStatus,
  onFocus,
  demo: _demo,
}: {
  getStatus: () => FleetStatus | undefined;
  onFocus: (id: number) => void;
  demo?: boolean;
}) {
  const [status, setStatus] = useState<FleetStatus>({});
  const [openLore, setOpenLore] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setStatus(getStatus() ?? {});
    tick();
    const iv = window.setInterval(tick, 1500);
    return () => window.clearInterval(iv);
  }, [getStatus]);

  const activeCount = FLEET.filter((u) => status[u.id]?.active).length;

  return (
    <div className="dock-body">
      <div className="fleet-summary">
        <span className="fleet-summary-dot" />
        {activeCount} of {FLEET.length} units active · she coordinates them for you
      </div>
      <ul className="fleet-list">
        {FLEET.map((u) => {
          const st = status[u.id];
          const active = st?.active ?? false;
          const dispatching = (st?.pending ?? 0) > 0;
          const targets = st?.targets ?? [];
          return (
            <li key={u.id} className={`fleet-card ${active ? "active" : ""}`}>
              <div className="fleet-head">
                <span className={`fleet-icon ${dispatching ? "dispatching" : active ? "pulse" : ""}`}>{u.icon}</span>
                <div className="fleet-headtext">
                  <span className="fleet-name">{u.name}</span>
                  <span className="fleet-role">{u.role}</span>
                </div>
                <span className={`fleet-dot ${dispatching ? "dispatch" : active ? "on" : ""}`} title={active ? "active" : "idle"} />
              </div>
              <div className={`fleet-status ${dispatching ? "dispatching" : ""}`}>
                {dispatching ? "🚀 " : active ? "" : "💤 "}
                {st?.detail ?? "Standing by"}
              </div>
              {targets.length > 0 && (
                <div className="fleet-targets">
                  {targets.slice(0, 4).map((t) => (
                    <button key={t.id} className="fleet-target-chip" onClick={() => onFocus(t.id)} title="Fly to it">
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="fleet-lore-toggle"
                onClick={() => setOpenLore(openLore === u.id ? null : u.id)}
              >
                {openLore === u.id ? "▾ What is this?" : "▸ What is this?"}
              </button>
              {openLore === u.id && <p className="fleet-lore">{u.lore}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
