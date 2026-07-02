import type { GraphData, GraphNode, Fuel, Streak } from "@brain/shared";
import {
  ACHIEVEMENTS,
  loadUnlocked,
  unlockedIds,
  type AchievementCtx,
} from "./achievements.js";
import { pilotRank } from "./rank.js";

/**
 * The Awards tab — a persistent trophy case. Toasts announce an unlock in the
 * moment; this is where you go to actually *see* what you've earned and what's
 * still locked (with a progress hint), plus your memory-count milestones. Live:
 * recomputes from the current galaxy + fuel each render, unioned with the
 * per-brain persisted set so an earned award never flickers back to locked.
 */
export function AchievementsPanel({
  graph,
  fuel,
  streak,
  spaceId,
}: {
  graph: GraphData;
  fuel: Fuel | null;
  streak: Streak | null;
  spaceId: string;
}) {
  const memories = (graph.nodes as GraphNode[]).filter((n) => n.kind !== "action");
  const ctx: AchievementCtx = { memories, links: graph.links.length, fuel, streak };
  // Earned = persisted (sticky) ∪ currently-satisfied, so the case matches the toasts.
  const earned = new Set<string>([...loadUnlocked(spaceId), ...unlockedIds(ctx)]);
  const count = earned.size;
  // Pilot rank — driven by real memories (excludes constellation hubs), matching
  // the same progression that speeds Soumaya up.
  const realCount = memories.filter((n) => n.kind !== "moc").length;
  const rank = pilotRank(realCount);

  return (
    <div className="dock-body awards">
      <div className="rank-banner">
        <span className="rank-badge">★ Lv {rank.level}</span>
        <span className="rank-body">
          <span className="rank-title">{rank.title}</span>
          <span className="rank-bar">
            <span style={{ width: `${rank.progress * 100}%` }} />
          </span>
          <span className="rank-sub">
            {rank.nextAt != null
              ? `${rank.cur}/${rank.nextAt} memories to next rank`
              : `${rank.cur} memories · top rank`}
          </span>
        </span>
      </div>
      {streak && (
        <div className={`streak-banner ${streak.current > 0 ? "on" : "cold"}`}>
          <span className="streak-flame">🔥</span>
          <span className="streak-text">
            {streak.current > 0 ? (
              <>
                <b>{streak.current}-day</b> tending streak
                {streak.best > streak.current ? ` · best ${streak.best}` : ""}
                {streak.today ? " · fed today ✓" : " · feed a memory today to keep it"}
              </>
            ) : (
              <>
                No active streak — log a memory to start one
                {streak.best > 0 ? ` (best ${streak.best})` : ""}
              </>
            )}
          </span>
        </div>
      )}
      <div className="awards-head">
        <h3 className="awards-title">🏆 Awards</h3>
        <span className="awards-tally">
          {count}/{ACHIEVEMENTS.length}
        </span>
      </div>
      <div className="awards-bar">
        <span style={{ width: `${(count / ACHIEVEMENTS.length) * 100}%` }} />
      </div>

      <ul className="awards-grid">
        {ACHIEVEMENTS.map((a) => {
          const got = earned.has(a.id);
          const p = !got && a.progress ? a.progress(ctx) : null;
          return (
            <li key={a.id} className={`award-card ${got ? "got" : "locked"}`}>
              <span className="award-ic">{got ? a.icon : "🔒"}</span>
              <span className="award-body">
                <span className="award-name">{a.name}</span>
                <span className="award-desc">{a.desc}</span>
                {p && (
                  <span className="award-prog">
                    <span className="award-prog-bar">
                      <span style={{ width: `${Math.min(100, (p.cur / p.target) * 100)}%` }} />
                    </span>
                    <span className="award-prog-num">
                      {p.cur}/{p.target}
                    </span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* (The milestone pip row is gone — the Pilot Rank banner above IS the
          memory-count ladder now; three parallel count trackers double-celebrated
          the same growth.) */}
    </div>
  );
}
