import { useState } from "react";

/**
 * Tools menu — a single 🧰 button that opens a compact grid of the SECONDARY tools
 * (search, lenses, connections, recall, chronicle, legend, flashback, focus mode, help).
 *
 * Why it exists: the app had grown ~8 always-visible buttons stacked down the top-right
 * edge, which overflowed off small (mobile-first!) screens — the Smart Lens button was
 * literally unreachable on a phone. Collapsing them into one menu guarantees every tool is
 * reachable in one tap on any screen, and declutters the galaxy. The FEW frequent controls
 * (add, panels, recenter, zoom, chat) stay as their own buttons.
 */
export interface ToolsMenuProps {
  onSearch: () => void;
  onLenses: () => void;
  onConnections: () => void;
  candCount: number;
  onReview: () => void;
  dueCount: number;
  onTimeline: () => void;
  onLegend: () => void;
  onFlashback: () => void;
  onFocusMode: () => void;
  focusMode: boolean;
  onHelp: () => void;
}

export function ToolsMenu(p: ToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const items: { icon: string; label: string; on: () => void; badge?: number }[] = [
    { icon: "🔍", label: "Search", on: p.onSearch },
    { icon: "⧉", label: "Lenses", on: p.onLenses },
    { icon: "🔗", label: "Connections", on: p.onConnections, badge: p.candCount },
    { icon: "🧠", label: "Recall", on: p.onReview, badge: p.dueCount },
    { icon: "🕰️", label: "Chronicle", on: p.onTimeline },
    { icon: "🗺️", label: "Legend", on: p.onLegend },
    { icon: "☄️", label: "Flashback", on: p.onFlashback },
    { icon: p.focusMode ? "🌐" : "🌌", label: p.focusMode ? "Exit focus" : "Focus mode", on: p.onFocusMode },
    { icon: "❓", label: "Help", on: p.onHelp },
  ];
  const alerts = (p.candCount || 0) + (p.dueCount || 0);
  const tap = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <>
      <button
        className={`fab fab-tools ${open ? "on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Tools"
        aria-expanded={open}
        title="Tools — search, lenses, recall, legend & more"
      >
        🧰
        {alerts > 0 && !open && <span className="fab-badge">{alerts > 9 ? "9+" : alerts}</span>}
      </button>
      {open && (
        <>
          <div className="tools-scrim" onClick={() => setOpen(false)} aria-hidden />
          <div className="tools-menu" role="menu" aria-label="Tools">
            {items.map((it) => (
              <button key={it.label} className="tools-item" role="menuitem" onClick={() => tap(it.on)}>
                <span className="tools-ic">{it.icon}</span>
                <span className="tools-lbl">{it.label}</span>
                {it.badge != null && it.badge > 0 && <span className="tools-badge">{it.badge > 99 ? "99+" : it.badge}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
