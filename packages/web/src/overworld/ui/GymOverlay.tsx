import { useEffect, useState } from "react";
import type { Fuel, GraphData, Streak } from "@brain/shared";
import { claimCodexReward, getCodexDiscoveries, type AgentDiscovery } from "../../api/client.js";
import { listAchievements } from "../data/achievements.js";
import { actionButtonStyle, OverlayShell } from "./OverlayShell.js";

export interface GymOverlayProps {
  graph: GraphData;
  fuel: Fuel | null;
  streak: Streak | null;
  onClose: () => void;
}

/**
 * The Gym / Trainer Card (Progress tab equivalent) — real streak/fuel from the server,
 * real achievement state from the SAME persisted set App.tsx's galaxy view uses
 * (data/achievements.ts ports its unlock-diff logic so switching UIs shares one earned
 * set). Locked achievements show their real progress, never just a lock icon alone.
 *
 * Codex (revived, docs/overworld/storytelling-revival.md, task #71) — Soumaya's own
 * autonomously-charted field notes (`getCodexDiscoveries`), joining its own real "Codex
 * completionist" meta-achievement above. Claiming has no pre-existing "already claimed" signal
 * to check against, so nothing is invented — `claimCodexReward` is already idempotent
 * server-side; the real result is shown and the button disables for the rest of this session.
 */
export function GymOverlay({ graph, fuel, streak, onClose }: GymOverlayProps) {
  const views = listAchievements(graph, fuel, streak);
  const unlockedCount = views.filter((v) => v.unlocked).length;
  const [discoveries, setDiscoveries] = useState<AgentDiscovery[] | null>(null);
  const [claimResults, setClaimResults] = useState<Record<string, string>>({});

  useEffect(() => {
    void getCodexDiscoveries().then(setDiscoveries);
  }, []);

  const claim = async (key: string) => {
    const result = await claimCodexReward(key);
    setClaimResults((prev) => ({
      ...prev,
      [key]: result.awarded ? `+${result.fuel ?? 0} fuel!` : "Already claimed",
    }));
  };

  return (
    <OverlayShell icon="🏆" title="Gym" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        🔥 Streak: <strong>{streak?.current ?? 0}</strong> days (best {streak?.best ?? 0})
        {streak?.today ? " — tended today" : ""}
      </p>
      <p>
        ⚡ Fuel: <strong>{fuel?.fuel ?? 0}</strong> / {fuel?.capacity ?? 0}
      </p>
      <p>
        🎖️ Badges: {unlockedCount} / {views.length}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {views.map(({ achievement, unlocked, progress }) => (
          <li
            key={achievement.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "8px 0",
              borderBottom: "1px solid #2a2c55",
              opacity: unlocked ? 1 : 0.6,
            }}
          >
            <span aria-hidden="true">{unlocked ? achievement.icon : "🔒"}</span>
            <span style={{ flex: 1 }}>
              <div>
                {achievement.name} {unlocked ? "— earned" : "— locked"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{achievement.desc}</div>
              {!unlocked && progress && (
                <div style={{ fontSize: 12 }}>
                  Progress: {progress.cur} / {progress.target}
                </div>
              )}
            </span>
          </li>
        ))}
      </ul>

      <h3>Codex</h3>
      {discoveries === null ? (
        <p>Loading Soumaya's field notes...</p>
      ) : discoveries.length === 0 ? (
        <p>No discoveries charted yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {discoveries.map((d) => (
            <li key={d.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{d.icon}</span>
              <span style={{ flex: 1 }}>
                <div>{d.title}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{d.lore}</div>
              </span>
              <button
                type="button"
                onClick={() => void claim(d.key)}
                disabled={claimResults[d.key] != null}
                style={actionButtonStyle(claimResults[d.key] != null)}
              >
                {claimResults[d.key] ?? "Claim"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
