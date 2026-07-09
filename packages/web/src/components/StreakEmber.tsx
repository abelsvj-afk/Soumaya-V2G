/**
 * Streak ember — an always-visible stake on your daily streak. A calm flame when you've
 * already fed your brain today; a restless, warning pulse when the streak is alive but
 * you haven't logged anything yet TODAY (so keeping it going feels like it matters).
 * Lives on the left edge (outside the header the PWA hides) and never blocks a click.
 */
export function StreakEmber({ streak, atRisk }: { streak: number; atRisk: boolean }) {
  if (streak <= 0) return null;
  return (
    <div
      className={`streak-ember${atRisk ? " at-risk" : ""}`}
      role="status"
      title={
        atRisk
          ? `${streak}-day streak — log one memory today to keep it alive!`
          : `${streak}-day streak — safe for today. Come back tomorrow.`
      }
    >
      <span className="se-flame">🔥</span>
      <span className="se-count">{streak}</span>
      {atRisk && <span className="se-warn">at risk today</span>}
    </div>
  );
}
