import { useEffect, useState } from "react";
import { FLEET } from "../graph/fleet.js";
import type { FleetStatus } from "../graph/Graph3D.js";

/**
 * The Fleet roster: Soumaya and every agent that reports to her — ship, station,
 * Aura beacons, Scout, Defender — each with its role, a live status line, and its
 * lore. Rendered as a section of the Soumaya tab. Live status is polled from the
 * 3D scene while the section is open. (Visitor activity lives in Browse — each
 * memory row shows its 👽 visit count — so it isn't duplicated here.)
 */
export function FleetPanel({
  getStatus,
  onFocus: _onFocus,
  demo: _demo,
}: {
  getStatus: () => FleetStatus | undefined;
  onFocus: (id: number) => void;
  demo?: boolean;
}) {
  const [status, setStatus] = useState<FleetStatus>({});

  useEffect(() => {
    const tick = () => setStatus(getStatus() ?? {});
    tick();
    const iv = window.setInterval(tick, 1500);
    return () => window.clearInterval(iv);
  }, [getStatus]);

  return (
    <div className="dock-body">
      <p className="fleet-intro">Soumaya and the agents that report to her.</p>
      <ul className="fleet-list">
        {FLEET.map((u) => {
          const st = status[u.id];
          const active = st?.active ?? false;
          return (
            <li key={u.id} className="fleet-card">
              <div className="fleet-head">
                <span className="fleet-icon">{u.icon}</span>
                <span className="fleet-name">{u.name}</span>
                <span className={`fleet-dot ${active ? "on" : ""}`} title={active ? "active" : "idle"} />
              </div>
              <div className="fleet-role">{u.role}</div>
              <div className="fleet-status">{st?.detail ?? "—"}</div>
              <p className="fleet-lore">{u.lore}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
