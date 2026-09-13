import { useEffect, useState } from "react";
import type { GraphData, Journey, JourneyLinkSummary, TimelineChapter } from "@brain/shared";
import { createJourney, deleteJourney, getJourneys, journeyLinks, linkToJourney, patchJourney, unlinkFromJourney } from "../../api/journeys.js";
import { addTimelineChapter, deleteTimelineChapter, getTimeline } from "../../api/client.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, fieldStyle, OverlayShell } from "./OverlayShell.js";

const TREND_BADGE: Record<TimelineChapter["trend"], string> = {
  growth: "📈 growth",
  decline: "📉 decline",
  neutral: "➖ neutral",
  mixed: "🔀 mixed",
};

export interface TownHallOverlayProps {
  spaceId: string;
  graph: GraphData;
  onClose: () => void;
}

/**
 * Town Hall (Journeys tab equivalent) — the region/world-map screen. Real Journey CRUD via
 * api/journeys.ts; travel between regions (Stage 3, decisions.md D4) doesn't exist yet since
 * there's only one physical region so far, so this is a management view for now, same as
 * JourneysPanel's current actual scope (it doesn't do literal travel either). Starting a real
 * Journey, or advancing one's real progress, is Town Hall's own real work event
 * (npc-economy.md) — the same real Journey CRUD that's already Mira/Dez's civic theme.
 *
 * Timeline (revived, docs/overworld/storytelling-revival.md, task #71) — a life chapter is
 * the same concept Journeys already represent here; the real, already-working
 * `getTimeline`/`addTimelineChapter`/`deleteTimelineChapter` were simply never called from the
 * Overworld. Deleting is only ever offered for chapters YOU wrote (`origin === "user"`) —
 * Soumaya's own auto-generated ones are her real computed narrative, not a stray click's to erase.
 *
 * Overlay quality-parity audit (2026-09-13, task #79) — a real gap: an expanded Journey's
 * "linked items" list was read-only even though `linkToJourney`/`unlinkFromJourney` are fully
 * real, working server-backed actions with zero call sites anywhere. Direct match for the
 * user's own "missing places to put content in" complaint. Linking is scoped to memories
 * (`kind: "node"`) only — the other real link kinds (bills/goals/docs/chats) belong to their
 * own buildings (Bank, Hangar) and aren't invented here.
 */
export function TownHallOverlay({ spaceId, graph, onClose }: TownHallOverlayProps) {
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [links, setLinks] = useState<JourneyLinkSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("🧭");
  const [creating, setCreating] = useState(false);
  const [chapters, setChapters] = useState<TimelineChapter[] | null>(null);
  const [markingChapter, setMarkingChapter] = useState(false);
  const [linkNodeId, setLinkNodeId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  const load = async () => setJourneys(await getJourneys());
  const loadTimeline = async () => setChapters(await getTimeline());

  useEffect(() => {
    void load();
    void loadTimeline();
  }, []);

  const markChapter = async () => {
    setMarkingChapter(true);
    try {
      const created = await addTimelineChapter();
      if (created) {
        recordBuildingWork(spaceId, "townHall");
        await loadTimeline();
      }
    } finally {
      setMarkingChapter(false);
    }
  };

  const removeChapter = async (chapter: TimelineChapter) => {
    if (await deleteTimelineChapter(chapter.id)) await loadTimeline();
  };

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createJourney({ title: trimmed, icon });
      recordBuildingWork(spaceId, "townHall");
      setTitle("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const bumpProgress = async (j: Journey, delta: number) => {
    const next = Math.max(0, Math.min(1, j.progress + delta));
    await patchJourney(j.id, { progress: next });
    recordBuildingWork(spaceId, "townHall");
    await load();
  };

  const remove = async (j: Journey) => {
    await deleteJourney(j.id);
    if (expandedId === j.id) setExpandedId(null);
    await load();
  };

  const toggleExpand = async (j: Journey) => {
    if (expandedId === j.id) {
      setExpandedId(null);
      setLinks(null);
      return;
    }
    setExpandedId(j.id);
    setLinkNodeId("");
    setLinks(await journeyLinks(j.id));
  };

  const addLink = async (journeyId: number) => {
    const nodeId = Number(linkNodeId);
    if (!Number.isFinite(nodeId)) return;
    setLinkBusy(true);
    try {
      await linkToJourney(journeyId, "node", nodeId);
      recordBuildingWork(spaceId, "townHall");
      setLinkNodeId("");
      setLinks(await journeyLinks(journeyId));
    } finally {
      setLinkBusy(false);
    }
  };

  const removeLink = async (journeyId: number, link: JourneyLinkSummary) => {
    await unlinkFromJourney(journeyId, link.kind, link.refId);
    recordBuildingWork(spaceId, "townHall");
    setLinks(await journeyLinks(journeyId));
  };

  return (
    <OverlayShell icon="🗺️" title="Town Hall" onClose={onClose}>
      {journeys === null ? (
        <p style={{ marginTop: 0 }}>Loading your Journeys...</p>
      ) : journeys.length === 0 ? (
        <p style={{ marginTop: 0 }}>No Journeys yet — this life chapter is unstarted.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {journeys.map((j) => (
            <li key={j.id} style={{ padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span aria-hidden="true">{j.icon ?? "🧭"}</span>
                <button
                  type="button"
                  onClick={() => toggleExpand(j)}
                  style={{ ...actionButtonStyle(), flex: 1, textAlign: "left", background: "transparent", border: "none" }}
                >
                  {j.title} — {Math.round(j.progress * 100)}% ({j.status})
                </button>
                <button type="button" onClick={() => bumpProgress(j, 0.1)} aria-label={`Advance ${j.title}`} style={actionButtonStyle()}>
                  +10%
                </button>
                <button type="button" onClick={() => remove(j)} aria-label={`Delete ${j.title}`} style={actionButtonStyle()}>
                  Delete
                </button>
              </div>
              {expandedId === j.id && (
                <div style={{ paddingLeft: 24, fontSize: 12 }}>
                  {links === null ? (
                    <p>Loading linked items...</p>
                  ) : links.length === 0 ? (
                    <p>Nothing linked to this Journey yet.</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0 }}>
                      {links.map((l) => (
                        <li key={`${l.kind}-${l.refId}`} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0" }}>
                          <span style={{ flex: 1 }}>
                            {l.kind}: {l.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeLink(j.id, l)}
                            aria-label={`Unlink ${l.label}`}
                            style={actionButtonStyle()}
                          >
                            Unlink
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <select
                      aria-label="Memory to link"
                      value={linkNodeId}
                      onChange={(e) => setLinkNodeId(e.target.value)}
                      style={{ ...fieldStyle, flex: 1 }}
                    >
                      <option value="">Link a memory...</option>
                      {graph.nodes
                        .filter((n) => n.kind !== "action" && !links?.some((l) => l.kind === "node" && l.refId === n.id))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => void addLink(j.id)} disabled={!linkNodeId || linkBusy} style={actionButtonStyle(!linkNodeId || linkBusy)}>
                      {linkBusy ? "…" : "Link"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Start a new Journey</h3>
      <div style={{ display: "flex", gap: 8 }}>
        <input aria-label="Journey icon" value={icon} onChange={(e) => setIcon(e.target.value)} style={{ ...fieldStyle, width: 48 }} />
        <input aria-label="Journey title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
        <button type="button" onClick={create} disabled={!title.trim() || creating} style={actionButtonStyle(!title.trim() || creating)}>
          {creating ? "…" : "Begin"}
        </button>
      </div>

      <h3>Timeline</h3>
      {chapters === null ? (
        <p>Loading your Timeline...</p>
      ) : chapters.length === 0 ? (
        <p>No chapters chronicled yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {chapters.map((c) => (
            <li key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span style={{ flex: 1 }}>
                <div>
                  {c.title} — {TREND_BADGE[c.trend]}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{c.summary}</div>
              </span>
              {c.origin === "user" && (
                <button type="button" onClick={() => void removeChapter(c)} aria-label={`Delete ${c.title}`} style={actionButtonStyle()}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={markChapter} disabled={markingChapter} style={actionButtonStyle(markingChapter)}>
        {markingChapter ? "…" : "+ Mark this chapter now"}
      </button>
    </OverlayShell>
  );
}
