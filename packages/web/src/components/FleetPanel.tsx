import { useEffect, useState } from "react";
import { FLEET } from "../graph/fleet.js";
import { getVisitorActivity, type VisitedMemory } from "../api/client.js";
import type { FleetStatus } from "../graph/Graph3D.js";

/** "3d ago" etc. from a tolerant timestamp. */
function relative(raw?: string): string {
  if (!raw) return "";
  const t = Date.parse(raw.includes("Z") || raw.includes("+") ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const d = Math.round((Date.now() - t) / 8.64e7);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
}

/**
 * The Fleet roster: Soumaya and every agent that reports to her — ship, station,
 * Aura beacons, Scout, Defender — each with its role, a live status line, and its
 * lore. Plus visitor activity: which memories alien craft are drawn to. Live status
 * is polled from the 3D scene while the panel is open.
 */
export function FleetPanel({
  getStatus,
  onFocus,
  demo,
}: {
  getStatus: () => FleetStatus | undefined;
  onFocus: (id: number) => void;
  demo?: boolean;
}) {
  const [status, setStatus] = useState<FleetStatus>({});
  const [visited, setVisited] = useState<VisitedMemory[]>([]);

  useEffect(() => {
    const tick = () => setStatus(getStatus() ?? {});
    tick();
    const iv = window.setInterval(tick, 1500);
    return () => window.clearInterval(iv);
  }, [getStatus]);

  useEffect(() => {
    if (demo) return;
    const load = () => getVisitorActivity().then(setVisited);
    load();
    const iv = window.setInterval(load, 15000);
    return () => window.clearInterval(iv);
  }, [demo]);

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

      {!demo && (
        <>
          <h3 className="fleet-section-h">👽 Most visited memories</h3>
          {visited.length === 0 ? (
            <p className="empty small">No visitor activity yet — drifters wander in over time.</p>
          ) : (
            <ul className="agenda-list">
              {visited.map((v) => (
                <li key={v.nodeId}>
                  <button className="agenda-main" onClick={() => onFocus(v.nodeId)} title="Fly to it">
                    <span className="agenda-label">{v.label}</span>
                    <span className="agenda-due">
                      {v.visits}× · {v.visitorTypes.join(", ")} · {relative(v.lastAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
