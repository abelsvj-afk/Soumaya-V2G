import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "@brain/shared";
import { getMoneySky } from "../api/finance.js";
import { getJourneys } from "../api/journeys.js";

/**
 * Galaxy Views (mobile performance pivot) — view ONE category of the galaxy at a time instead
 * of rendering every body at once. Reuses the Smart-Lens isolate machinery (isolateSet), which
 * stops rendering the other bodies — the single biggest win on a cheap phone (you feel it when a
 * lens/isolate is active). Collapsible so it adds no chrome until you want it.
 */

interface ViewDef { key: string; label: string; icon: string; pred: (n: GraphNode) => boolean }

const VIEWS: ViewDef[] = [
  { key: "people", label: "People", icon: "👤", pred: (n) => n.type === "person" },
  { key: "projects", label: "Projects", icon: "🚀", pred: (n) => n.type === "project" || n.type === "company" },
  { key: "goals", label: "Goals", icon: "🎯", pred: (n) => n.kind === "goal" },
  { key: "ideas", label: "Ideas", icon: "💡", pred: (n) => n.kind === "idea" },
  { key: "beliefs", label: "Beliefs", icon: "🌟", pred: (n) => n.kind === "belief" },
  { key: "knowledge", label: "Knowledge", icon: "📚", pred: (n) => n.type === "knowledge" || n.type === "concept" },
  { key: "meetings", label: "Meetings", icon: "🗓️", pred: (n) => n.type === "meeting" },
  { key: "notes", label: "Notes", icon: "📝", pred: (n) => n.type === "daily" },
];

export function GalaxyViews({
  nodes,
  activeView,
  onOpen,
  onLayer,
  onExit,
  hidden,
}: {
  nodes: GraphNode[];
  /** The label of the active view/lens (so we can highlight + toggle). */
  activeView: string | null;
  onOpen: (ids: number[], name: string) => void;
  /** View only an overlay layer that physically populates the galaxy (money-sky / journeys). */
  onLayer?: (layer: "money" | "journeys", name: string) => void;
  onExit: () => void;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [moneyCount, setMoneyCount] = useState(0);
  const [journeyCount, setJourneyCount] = useState(0);

  // These are separate render layers (not graph nodes), so we count them directly.
  useEffect(() => {
    if (!open) return;
    getMoneySky().then((s) => setMoneyCount(s?.length ?? 0)).catch(() => {});
    getJourneys().then((j) => setJourneyCount((j ?? []).filter((x) => x.status !== "done").length)).catch(() => {});
  }, [open]);

  // Which categories actually have bodies, with their ids (computed from the loaded graph).
  const cats = useMemo(() => {
    return VIEWS.map((v) => ({ ...v, ids: nodes.filter((n) => n.kind !== "action" && v.pred(n)).map((n) => n.id) }))
      .filter((v) => v.ids.length > 0);
  }, [nodes]);

  if (hidden || (cats.length === 0 && nodes.length === 0)) return null;

  const tap = (v: (typeof cats)[number]) => {
    const name = `${v.icon} ${v.label}`;
    if (activeView === name) { onExit(); return; }
    if (v.ids.length > 0) onOpen(v.ids, name);
  };

  return (
    <div className="gv-wrap">
      <button className={`gv-toggle ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        title="View one category at a time (lighter on your phone)">
        🌌 Views {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="gv-chips" role="toolbar" aria-label="Galaxy category views">
          {cats.map((v) => {
            const name = `${v.icon} ${v.label}`;
            const on = activeView === name;
            return (
              <button key={v.key} className={`gv-chip ${on ? "on" : ""}`} onClick={() => tap(v)} aria-pressed={on}
                title={on ? `Show everything again` : `View only ${v.label} (renders fewer bodies)`}>
                <span>{v.icon} {v.label}</span>
                <span className="gv-count">{on ? "✕" : v.ids.length}</span>
              </button>
            );
          })}
          {/* Overlay layers that physically populate the galaxy get their own view too. */}
          {onLayer && moneyCount > 0 && (() => {
            const name = "💵 Money sky"; const on = activeView === name;
            return <button className={`gv-chip ${on ? "on" : ""}`} onClick={() => (on ? onExit() : onLayer("money", name))} aria-pressed={on} title="View only your money stars">
              <span>💵 Money</span><span className="gv-count">{on ? "✕" : moneyCount}</span></button>;
          })()}
          {onLayer && journeyCount > 0 && (() => {
            const name = "🧭 Journeys"; const on = activeView === name;
            return <button className={`gv-chip ${on ? "on" : ""}`} onClick={() => (on ? onExit() : onLayer("journeys", name))} aria-pressed={on} title="View only your journey hubs">
              <span>🧭 Journeys</span><span className="gv-count">{on ? "✕" : journeyCount}</span></button>;
          })()}
          {activeView && <button className="gv-chip gv-all" onClick={onExit}>★ Show all</button>}
        </div>
      )}
    </div>
  );
}
