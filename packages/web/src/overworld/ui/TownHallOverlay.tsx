import { useEffect, useState } from "react";
import type { Journey, JourneyLinkSummary } from "@brain/shared";
import { createJourney, deleteJourney, getJourneys, journeyLinks, patchJourney } from "../../api/journeys.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, fieldStyle, OverlayShell } from "./OverlayShell.js";

export interface TownHallOverlayProps {
  spaceId: string;
  onClose: () => void;
}

/**
 * Town Hall (Journeys tab equivalent) — the region/world-map screen. Real Journey CRUD via
 * api/journeys.ts; travel between regions (Stage 3, decisions.md D4) doesn't exist yet since
 * there's only one physical region so far, so this is a management view for now, same as
 * JourneysPanel's current actual scope (it doesn't do literal travel either). Starting a real
 * Journey, or advancing one's real progress, is Town Hall's own real work event
 * (npc-economy.md) — the same real Journey CRUD that's already Mira/Dez's civic theme.
 */
export function TownHallOverlay({ spaceId, onClose }: TownHallOverlayProps) {
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [links, setLinks] = useState<JourneyLinkSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("🧭");
  const [creating, setCreating] = useState(false);

  const load = async () => setJourneys(await getJourneys());

  useEffect(() => {
    void load();
  }, []);

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
    setLinks(await journeyLinks(j.id));
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
                        <li key={`${l.kind}-${l.refId}`}>
                          {l.kind}: {l.label}
                        </li>
                      ))}
                    </ul>
                  )}
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
    </OverlayShell>
  );
}
