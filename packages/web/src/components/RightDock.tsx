import type { GraphData, GraphNode } from "@brain/shared";
import { NodeInspector } from "./NodeInspector.js";
import { NodeList } from "./NodeList.js";
import { ActionsPanel } from "./ActionsPanel.js";
import { SectorView } from "./SectorView.js";
import { DigestPanel } from "./DigestPanel.js";
import { ChatPanel } from "./ChatPanel.js";
import { SoumayaPanel } from "./SoumayaPanel.js";

export type DockTab = "details" | "list" | "actions" | "sectors" | "insights" | "chat" | "soumaya";

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
}

const TABS: { id: DockTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "sectors", label: "🌌" },
  { id: "list", label: "📋" },
  { id: "actions", label: "✅" },
  { id: "insights", label: "✨" },
  { id: "chat", label: "💬" },
  { id: "soumaya", label: "🛰️" },
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
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
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
      </div>
    </div>
  );
}
