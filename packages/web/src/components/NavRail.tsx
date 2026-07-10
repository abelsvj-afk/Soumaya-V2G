/**
 * The primary FAB navigation rail (top-right) — search, flashback, connections, legend,
 * Chronicle, recall, help, panels, recenter, zoom. Extracted from App.tsx (Post-MVP D4)
 * as a pure presentational component: it renders buttons and calls back, holding no
 * state. Behaviour + classNames are unchanged (the focus-cluster stays in App).
 */
export interface NavRailProps {
  onSearch: () => void;
  onFlashback: () => void;
  onConnections: () => void;
  candCount: number;
  onLegend: () => void;
  onTimeline: () => void;
  onReview: () => void;
  dueCount: number;
  onHelp: () => void;
  onDock: () => void;
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFocusMode: () => void;
  focusMode: boolean;
  onLenses: () => void;
}

const badge = (n: number) => (n > 0 ? <span className="fab-badge">{n > 99 ? "99+" : n}</span> : null);

export function NavRail(p: NavRailProps) {
  return (
    <>
      <button className="fab fab-search" onClick={p.onSearch} aria-label="Search">
        🔍
      </button>
      <button className="fab fab-flashback" onClick={p.onFlashback} aria-label="Flashback (Serendipity)" title="Surprise me with an old memory">
        ☄️
      </button>
      <button className="fab fab-connections" onClick={p.onConnections} aria-label="Suggested connections" title="Review connections + link memories yourself">
        🔗
        {badge(p.candCount)}
      </button>
      <button className="fab fab-legend" onClick={p.onLegend} aria-label="Legend / galaxy key" title="What the colours & bodies mean">
        🗺️
      </button>
      <button className="fab fab-timeline" onClick={p.onTimeline} aria-label="The Chronicle timeline" title="Your life as a flowing 3D timeline">
        🕰️
      </button>
      <button className="fab fab-review" onClick={p.onReview} aria-label="Recall session" title="Revisit memories that are gently fading (active recall)">
        🧠
        {badge(p.dueCount)}
      </button>
      <button className="fab fab-lenses" onClick={p.onLenses} aria-label="Smart Lenses" title="Saved views of your galaxy (self-updating)">
        ⧉
      </button>
      <button className="fab fab-help" onClick={p.onHelp} aria-label="Help / guide">
        ?
      </button>
      <button className="fab fab-dock" onClick={p.onDock} aria-label="Panels">
        ☰
      </button>
      <button className="fab fab-recenter" onClick={p.onRecenter} aria-label="Recenter galaxy" title="Recenter the galaxy">
        ⊙
      </button>
      {/* On-screen zoom (works when pinch/trackpad zoom fails). */}
      <button className="fab fab-zoom-in" onClick={p.onZoomIn} aria-label="Zoom in" title="Zoom in">
        ＋
      </button>
      <button className="fab fab-zoom-out" onClick={p.onZoomOut} aria-label="Zoom out" title="Zoom out">
        －
      </button>
      {/* Deep-space focus mode: a calm, distraction-free reading session. Stays fully
          lit in focus mode (via .fab-focus-toggle) so it's always the way back out. */}
      <button
        className={`fab fab-focus-toggle ${p.focusMode ? "on" : ""}`}
        onClick={p.onFocusMode}
        aria-label={p.focusMode ? "Exit focus mode" : "Deep-space focus mode"}
        aria-pressed={p.focusMode}
        title={p.focusMode ? "Exit focus mode" : "Focus mode — dim everything but your galaxy"}
      >
        {p.focusMode ? "🌐" : "🌌"}
      </button>
    </>
  );
}
