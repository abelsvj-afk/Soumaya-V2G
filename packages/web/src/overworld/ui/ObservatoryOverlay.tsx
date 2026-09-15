import { useEffect, useState } from "react";
import type { GraphData, Insight, Journey } from "@brain/shared";
import { answerDailyContact, getDailyContact, getDigest, resolveInsight, type DailyContact } from "../../api/client.js";
import { getJourneys } from "../../api/journeys.js";
import type { DueReview } from "../../api/features.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, fieldStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

export interface ObservatoryOverlayProps {
  spaceId: string;
  graph: GraphData;
  safeToSpendCents: number;
  dueReviews: DueReview[];
  onClose: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The Observatory (Insights tab equivalent) — climb the tower to see newly-surfaced
 * connections. Real synthesis digest via getDigest(); resolving one calls resolveInsight()
 * and removes it from the star chart, matching DigestPanel's own dismiss behavior. Resolving
 * a real insight is the Observatory's own real work event (npc-economy.md).
 *
 * Mission Control (docs/overworld/mission-control.md, task #60) — this is also where "the
 * daily loop lands" per VISION_2_JOURNEYS.md, reusing the pre-Overworld mission-control.md
 * spec's own resolved decision to evolve the Observatory in place rather than build a new
 * screen. Cards run agenda → safe-to-spend → Daily Contact → worth a moment → Journey
 * progress → AI observations (already here) → recent activity, matching the vision doc's own
 * priority order. `graph`/`safeToSpendCents`/`dueReviews` are the same already-fetched
 * WorldSnapshot fields other overlays (GymOverlay) already receive as props — only Daily
 * Contact and Journeys are genuinely new fetches here, since nothing else in the Overworld
 * surfaces either today.
 */
export function ObservatoryOverlay({ spaceId, graph, safeToSpendCents, dueReviews, onClose }: ObservatoryOverlayProps) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [contact, setContact] = useState<DailyContact | null>(null);
  const [contactAnswer, setContactAnswer] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [journeys, setJourneys] = useState<Journey[] | null>(null);

  useEffect(() => {
    void getDigest().then(setInsights);
    void getDailyContact().then(setContact);
    void getJourneys().then(setJourneys);
  }, []);

  const resolve = async (insight: Insight) => {
    setBusyId(insight.id);
    try {
      await resolveInsight(insight.id);
      recordBuildingWork(spaceId, "observatory");
      setInsights((cur) => (cur ? cur.filter((i) => i.id !== insight.id) : cur));
    } finally {
      setBusyId(null);
    }
  };

  const submitContactAnswer = async () => {
    const text = contactAnswer.trim();
    if (!text) return;
    setContactBusy(true);
    try {
      const result = await answerDailyContact(text);
      if (result) {
        recordBuildingWork(spaceId, "observatory");
        setContact((cur) => (cur ? { ...cur, answered: true } : cur));
        setContactAnswer("");
      }
    } finally {
      setContactBusy(false);
    }
  };

  const now = Date.now();
  const openQuests = graph.nodes.filter((n) => n.kind === "action").length;
  const dueReminders = graph.nodes.filter((n) => n.kind !== "action" && n.remindAt && new Date(n.remindAt).getTime() <= now).length;
  const worthAMoment = dueReviews[0];
  const activeJourneys = (journeys ?? []).filter((j) => j.status === "active").slice(0, 3);
  const recentActivity = [...graph.nodes].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 5);

  return (
    <OverlayShell icon="🔭" title="Observatory" onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Today's agenda</h3>
      <p>
        {openQuests} open quest{openQuests === 1 ? "" : "s"} · {dueReminders} reminder{dueReminders === 1 ? "" : "s"} due — see
        the Bulletin Board.
      </p>

      <h3>Safe to spend</h3>
      <p>
        <strong>{formatCents(safeToSpendCents)}</strong> — see the Bank for the full ledger.
      </p>

      <h3>Daily Contact</h3>
      {contact === null ? (
        <p>No question from her today yet.</p>
      ) : contact.answered ? (
        <p>
          Answered for today.
          {contact.discovery && <> Discovery: {contact.discovery.text}</>}
          {contact.foresight && <> ({contact.foresight.text})</>}
        </p>
      ) : contact.question ? (
        <div style={{ marginBottom: 8 }}>
          <p style={{ marginBottom: 4 }}>{contact.question.text}</p>
          <input
            type="text"
            value={contactAnswer}
            onChange={(e) => setContactAnswer(e.target.value)}
            placeholder="Your answer..."
            style={{ ...fieldStyle, display: "block", width: "100%", marginBottom: 4 }}
          />
          <button type="button" onClick={() => void submitContactAnswer()} disabled={contactBusy || !contactAnswer.trim()} style={actionButtonStyle(contactBusy || !contactAnswer.trim())}>
            {contactBusy ? "…" : "Answer"}
          </button>
        </div>
      ) : (
        <p>Nothing to ask today.</p>
      )}

      <h3>Worth a moment</h3>
      {worthAMoment ? <p>💭 {worthAMoment.label} — visit it to try a recall check.</p> : <p>Nothing due for recall right now.</p>}

      <h3>Journeys in progress</h3>
      {activeJourneys.length === 0 ? (
        <p>No active Journeys yet — start one at Town Hall.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {activeJourneys.map((j) => (
            <li key={j.id} style={{ padding: "4px 0" }}>
              {Math.round(j.progress * 100)}% — {j.title}
            </li>
          ))}
        </ul>
      )}

      <h3>AI observations</h3>
      {insights === null ? (
        <p>Charting the sky...</p>
      ) : insights.length === 0 ? (
        <p>No new connections surfaced yet — check back after capturing more thoughts.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {insights.map((insight) => (
            <li key={insight.id} style={{ padding: "8px 0", borderBottom: `1px solid ${color.divider}` }}>
              <div>
                {insight.kind === "contradiction" ? "⚡" : "✨"} {insight.text}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{insight.nodes.map((n) => n.label).join(" · ")}</div>
              <button
                type="button"
                onClick={() => resolve(insight)}
                disabled={busyId === insight.id}
                style={{ ...actionButtonStyle(busyId === insight.id), marginTop: 4 }}
              >
                {busyId === insight.id ? "…" : "Mark seen"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Recent activity</h3>
      {recentActivity.length === 0 ? (
        <p>Nothing captured yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {recentActivity.map((n) => (
            <li key={n.id} style={{ padding: "2px 0" }}>
              {n.label}
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
