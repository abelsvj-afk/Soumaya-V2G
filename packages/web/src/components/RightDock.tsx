import { useEffect, useState } from "react";
import type { GraphData, GraphNode } from "@brain/shared";
import { NodeInspector } from "./NodeInspector.js";
import { NodeList } from "./NodeList.js";
import { ActionsPanel } from "./ActionsPanel.js";
import { SectorView } from "./SectorView.js";
import { DigestPanel } from "./DigestPanel.js";
import { SoumayaPanel } from "./SoumayaPanel.js";
import { FleetPanel } from "./FleetPanel.js";
import { AchievementsPanel } from "./AchievementsPanel.js";
import { HangarPanel } from "./HangarPanel.js";
import { InboxPanel } from "./InboxPanel.js";
import { LibraryPanel } from "./LibraryPanel.js";
import { CodexPanel } from "./CodexPanel.js";
import { MindPanel } from "./MindPanel.js";
import { FinancePanel } from "./FinancePanel.js";
import type { FleetStatus } from "../graph/Graph3D.js";
import type { Fuel, Streak } from "@brain/shared";

// The dock was 13 icon tabs — it overflowed off-screen on phones and several
// tabs were near-duplicates. Consolidated: Browse absorbs List/Library/Sectors
// (view modes), Progress absorbs Awards/Codex (chips), Fleet folds into the
// Soumaya tab as a section, and the Companion controls live inside the chat
// (💬 → 🎭) where they configure who you're talking to. 8 tabs fit a 360px
// dock without scrolling.
export type DockTab =
  | "details"
  | "list"
  | "mind"
  | "actions"
  | "insights"
  | "soumaya"
  | "inbox"
  | "awards"
  | "money"
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
  /** Live fleet status getter (from the 3D scene) for the Fleet section. */
  getFleetStatus?: () => FleetStatus | undefined;
  /** Floating ship-task label preference + setter (Soumaya tab toggle). */
  showShipTask?: boolean;
  setShowShipTask?: (v: boolean) => void;
  onRecall?: (ids: number[]) => void;
  shipViewMode?: "orbit" | "cockpit";
  setShipViewMode?: (v: "orbit" | "cockpit") => void;
  tasks?: any[];
  onReorderTasks?: (newOrder: any[]) => void;
  /** Live fuel + streak + brain id for the Progress tab. */
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
  { id: "list", label: "📚", name: "Browse" },
  { id: "mind", label: "🧠", name: "Mind" },
  { id: "actions", label: "✅", name: "Agenda" },
  { id: "insights", label: "✨", name: "Insights" },
  { id: "soumaya", label: "🛰️", name: "Soumaya" },
  { id: "inbox", label: "🔔", name: "Inbox" },
  { id: "awards", label: "🏆", name: "Progress" },
  { id: "money", label: "💵", name: "Money" },
  { id: "hangar", label: "🛠️", name: "Hangar" },
];

/** Browse = one place to read your memories, three lenses over the same data. */
type BrowseView = "all" | "folders" | "hubs";
/** Progress = one progression surface: the Codex (discoveries) + Awards (feats). */
type ProgressView = "codex" | "awards";

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
  const [browseView, setBrowseView] = useState<BrowseView>("all");
  const [progressView, setProgressView] = useState<ProgressView>("codex");
  const [fleetOpen, setFleetOpen] = useState(false);

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
        {tab === "list" && (
          <div className="subtab-wrap">
            <div className="subtabs" role="tablist" aria-label="Browse view">
              <button className={browseView === "all" ? "on" : ""} onClick={() => setBrowseView("all")}>
                📋 All
              </button>
              <button className={browseView === "folders" ? "on" : ""} onClick={() => setBrowseView("folders")}>
                📁 Folders
              </button>
              <button className={browseView === "hubs" ? "on" : ""} onClick={() => setBrowseView("hubs")}>
                🪐 Hubs
              </button>
            </div>
            {browseView === "all" && <NodeList nodes={graph.nodes} onFocus={onFocus} demo={demo} />}
            {browseView === "folders" && (
              <LibraryPanel graph={graph} onFocus={onFocus} spaceName={spaceName} />
            )}
            {browseView === "hubs" && (
              <SectorView graph={graph} onFocus={onFocus} onIsolate={(id) => onIsolate?.(id)} />
            )}
          </div>
        )}
        {tab === "mind" && <MindPanel onFocus={onFocus} demo={demo} onChanged={() => onChanged?.(-1)} />}
        {tab === "actions" && (
          <ActionsPanel nodes={graph.nodes} onFocus={onFocus} onChanged={onDeleted} readOnly={demo} />
        )}
        {tab === "insights" && <DigestPanel onFocus={onFocus} onPromoted={onPromoted} />}
        {tab === "soumaya" && (
          <div className="subtab-wrap">
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
            <details
              className="dock-section"
              open={fleetOpen}
              onToggle={(e) => setFleetOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>🚀 Fleet — her support craft</summary>
              {fleetOpen && (
                <FleetPanel getStatus={getFleetStatus ?? (() => undefined)} onFocus={onFocus} demo={demo} />
              )}
            </details>
          </div>
        )}
        {tab === "inbox" && <InboxPanel spaceId={spaceId ?? "default"} />}
        {tab === "money" && <FinancePanel demo={demo} />}
        {tab === "awards" && (
          <div className="subtab-wrap">
            <div className="subtabs" role="tablist" aria-label="Progress view">
              <button className={progressView === "codex" ? "on" : ""} onClick={() => setProgressView("codex")}>
                📖 Codex
              </button>
              <button className={progressView === "awards" ? "on" : ""} onClick={() => setProgressView("awards")}>
                🏆 Awards
              </button>
              <button className="subtab-link" onClick={() => setTab("hangar")} title="Spend your unlocks">
                🛠️ Hangar →
              </button>
            </div>
            {progressView === "codex" && (
              <CodexPanel graph={graph} onFocus={onFocus} spaceId={spaceId} demo={demo} onReward={() => onChanged?.(-1)} />
            )}
            {progressView === "awards" && (
              <AchievementsPanel graph={graph} fuel={fuel ?? null} streak={streak ?? null} spaceId={spaceId ?? ""} />
            )}
          </div>
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
