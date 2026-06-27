import { useEffect, useState } from "react";
import type { GraphData, GraphNode } from "@brain/shared";
import { NodeInspector } from "./NodeInspector.js";
import { NodeList } from "./NodeList.js";
import { ActionsPanel } from "./ActionsPanel.js";
import { SectorView } from "./SectorView.js";
import { DigestPanel } from "./DigestPanel.js";
import { SoumayaPanel } from "./SoumayaPanel.js";
import { FleetPanel } from "./FleetPanel.js";
import { CompanionPanel } from "./CompanionPanel.js";
import { AchievementsPanel } from "./AchievementsPanel.js";
import { HangarPanel } from "./HangarPanel.js";
import { InboxPanel } from "./InboxPanel.js";
import type { FleetStatus } from "../graph/Graph3D.js";
import type { Fuel, Streak } from "@brain/shared";

export type DockTab =
  | "details"
  | "list"
  | "actions"
  | "sectors"
  | "insights"
  | "chat"
  | "soumaya"
  | "fleet"
  | "companion"
  | "inbox"
  | "awards"
  | "hangar";

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
  /** Floating ship-task label preference + setter (Soumaya tab toggle). */
  showShipTask?: boolean;
  setShowShipTask?: (v: boolean) => void;
  onRecall?: (ids: number[]) => void;
  shipViewMode?: "orbit" | "cockpit";
  setShipViewMode?: (v: "orbit" | "cockpit") => void;
  tasks?: any[];
  onReorderTasks?: (newOrder: any[]) => void;
  /** Live fuel + streak + brain id for the Awards (achievements) tab. */
  fuel?: Fuel | null;
  streak?: Streak | null;
  spaceId?: string;
  spaceName?: string;
  /** Refresh the galaxy after a constellation hub is created (Insights tab). */
  onPromoted?: () => void;
}

// Each tab carries a human `name` (tooltip + accessible label) so the icon row is
// debuggable and screen-reader friendly; `name` also maps 1:1 to the tab id/code.
// The tab name text is responsive (hidden on narrow screens, displayed side-by-side on wide screens).
const TABS: { id: DockTab; label: string; name: string }[] = [
  { id: "details", label: "ⓘ", name: "Details" },
  { id: "sectors", label: "🌌", name: "Sectors" },
  { id: "list", label: "📋", name: "List" },
  { id: "actions", label: "✅", name: "Agenda" },
  { id: "insights", label: "✨", name: "Insights" },
  { id: "soumaya", label: "🛰️", name: "Soumaya" },
  { id: "fleet", label: "🚀", name: "Fleet" },
  { id: "companion", label: "🧠", name: "Companion" },
  { id: "inbox", label: "🔔", name: "Inbox" },
  { id: "awards", label: "🏆", name: "Awards" },
  { id: "hangar", label: "🛠️", name: "Hangar" },
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
  showShipTask,
  setShowShipTask,
  onRecall,
  shipViewMode,
  setShipViewMode,
  tasks,
  onReorderTasks,
  fuel,
  streak,
  spaceId,
  spaceName = "Soumaya",
  onPromoted,
}: Props) {
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const key = `brain.notifications.${spaceId || "default"}`;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          const count = list.filter((n: any) => !n.seen).length;
          setUnseenCount(count);
        } else {
          setUnseenCount(0);
        }
      } catch {
        setUnseenCount(0);
      }
    };
    updateCount();
    window.addEventListener("brain-notifications-updated", updateCount);
    return () => window.removeEventListener("brain-notifications-updated", updateCount);
  }, [spaceId]);

  const dynamicTabs = TABS.map((t) => {
    if (t.id === "soumaya") return { ...t, name: spaceName, badge: 0 };
    if (t.id === "inbox") return { ...t, badge: unseenCount };
    return { ...t, badge: 0 };
  });

  return (
    <div className="panel dock">
      <div className="tabs">
        {canBack && onBack && (
          <button className="tab-back" onClick={onBack} aria-label="Back to previous memory">
            ←
          </button>
        )}
        {dynamicTabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "on" : ""}
            onClick={() => setTab(t.id)}
            title={t.name}
            aria-label={t.name}
            aria-current={tab === t.id ? "page" : undefined}
            style={{ position: "relative" }}
          >
            <span className="tab-ic" style={{ position: "relative" }}>
              {t.label}
              {t.badge > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-8px",
                    background: "#ef4444",
                    color: "white",
                    borderRadius: "50%",
                    fontSize: "8px",
                    padding: "1px 4px",
                    lineHeight: 1,
                    fontWeight: "bold",
                    pointerEvents: "none"
                  }}
                >
                  {t.badge}
                </span>
              )}
            </span>
            <span className="tab-name">{t.name}</span>
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
        {tab === "list" && <NodeList nodes={graph.nodes} onFocus={onFocus} demo={demo} />}
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
        {tab === "insights" && <DigestPanel onFocus={onFocus} onPromoted={onPromoted} />}
        {(tab === "soumaya" || tab === "chat") && (
          <SoumayaPanel
            spaceName={spaceName}
            onFocus={onFocus}
            onRecall={onRecall}
            showShipTask={showShipTask}
            setShowShipTask={setShowShipTask}
            shipViewMode={shipViewMode}
            setShipViewMode={setShipViewMode}
            tasks={tasks}
            onReorderTasks={onReorderTasks}
          />
        )}
        {tab === "fleet" && (
          <FleetPanel getStatus={getFleetStatus ?? (() => undefined)} onFocus={onFocus} demo={demo} />
        )}
        {tab === "companion" && <CompanionPanel demo={demo} />}
        {tab === "inbox" && <InboxPanel spaceId={spaceId ?? "default"} />}
        {tab === "awards" && (
          <AchievementsPanel graph={graph} fuel={fuel ?? null} streak={streak ?? null} spaceId={spaceId ?? ""} />
        )}
        {tab === "hangar" && (
          <HangarPanel
            spaceId={spaceId ?? ""}
            memoriesCount={graph.nodes.filter((n) => n.kind !== "action").length}
            onEquipChanged={() => onChanged?.(-1)}
            demo={demo}
          />
        )}
      </div>
    </div>
  );
}
