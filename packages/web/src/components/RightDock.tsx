import type { GraphData, GraphNode } from "@brain/shared";
import { NodeInspector } from "./NodeInspector.js";
import { NodeList } from "./NodeList.js";
import { ActionsPanel } from "./ActionsPanel.js";
import { SectorView } from "./SectorView.js";
import { DigestPanel } from "./DigestPanel.js";
import { ChatPanel } from "./ChatPanel.js";
import { SoumayaPanel } from "./SoumayaPanel.js";
import { FleetPanel } from "./FleetPanel.js";
import { CompanionPanel } from "./CompanionPanel.js";
import type { FleetStatus } from "../graph/Graph3D.js";

export type DockTab = "details" | "list" | "actions" | "sectors" | "insights" | "chat" | "soumaya" | "fleet" | "companion";

interface Props {
  tab: DockTab;
  setTab: (t: DockTab) => void;
  selected: GraphNode | null;
  graph: GraphData;
  onFocus: (id: number) => void;
  onChanged?: (id: number) => void;
  onDeleted?: () => void;
  onIsolate?: (id: number) => void;
  onClose?: () => void;
  onBack?: () => void;
  canBack?: boolean;
  /** Demo galaxy is read-only (no backend) — disables destructive actions. */
  demo?: boolean;
  /** Live fleet status getter (from the 3D scene) for the Fleet tab. */
  getFleetStatus?: () => FleetStatus | undefined;
}

// Each tab carries a human `name` (tooltip + accessible label) so the icon row is
// debuggable and screen-reader friendly; `name` also maps 1:1 to the tab id/code.
const TABS: { id: DockTab; label: string; name: string }[] = [
  { id: "details", label: "Details", name: "Details" },
  { id: "sectors", label: "🌌", name: "Sectors" },
  { id: "list", label: "📋", name: "List" },
  { id: "actions", label: "✅", name: "Agenda" },
  { id: "insights", label: "✨", name: "Insights" },
  { id: "chat", label: "💬", name: "Chat" },
  { id: "soumaya", label: "🛰️", name: "Soumaya" },
  { id: "fleet", label: "🚀", name: "Fleet" },
  { id: "companion", label: "🧠", name: "Companion" },
];

export function RightDock({
  tab,
  setTab,
  selected,
  graph,
  onFocus,
  onChanged,
  onDeleted,
  onIsolate,
  onClose,
  onBack,
  canBack,
  demo,
  getFleetStatus,
}: Props) {
  return (
    <div className="panel dock">
      <div className="tabs">
        {canBack && onBack && (
          <button className="tab-back" onClick={onBack} aria-label="Back to previous memory">
            ←
          </button>
        )}
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => setTab(t.id)}
            title={t.name}
            aria-label={t.name}
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
        {onClose && (
          <button className="panel-close tab-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      <div className="dock-content">
        {tab === "details" && (
          <NodeInspector
            node={selected}
            graph={graph}
            onFocus={onFocus}
            onChanged={onChanged}
            onDeleted={onDeleted}
            onIsolate={onIsolate}
            demo={demo}
          />
        )}
        {tab === "list" && <NodeList nodes={graph.nodes} onFocus={onFocus} />}
        {tab === "actions" && (
          <ActionsPanel nodes={graph.nodes} onFocus={onFocus} onChanged={onDeleted} readOnly={demo} />
        )}
        {tab === "sectors" && (
          <SectorView
            graph={graph}
            onFocus={onFocus}
            onIsolate={(id) => onIsolate?.(id)}
          />
        )}
        {tab === "insights" && <DigestPanel onFocus={onFocus} />}
        {tab === "chat" && <ChatPanel onFocus={onFocus} />}
        {tab === "soumaya" && <SoumayaPanel onFocus={onFocus} />}
        {tab === "fleet" && <FleetPanel getStatus={getFleetStatus ?? (() => undefined)} />}
        {tab === "companion" && <CompanionPanel demo={demo} />}
      </div>
    </div>
  );
}
