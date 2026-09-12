import type { Fuel, GraphData, Streak } from "@brain/shared";
import { listAchievements } from "../data/achievements.js";
import { OverlayShell } from "./OverlayShell.js";

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
 */
export function GymOverlay({ graph, fuel, streak, onClose }: GymOverlayProps) {
  const views = listAchievements(graph, fuel, streak);
  const unlockedCount = views.filter((v) => v.unlocked).length;

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
    </OverlayShell>
  );
}
