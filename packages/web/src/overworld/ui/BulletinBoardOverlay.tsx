import { useState } from "react";
import type { GraphData, GraphNode } from "@brain/shared";
import { ackReminder, deleteNode, ingestText } from "../../api/client.js";
import { recordBuildingWork } from "../data/npcJobs.js";

export interface BulletinBoardOverlayProps {
  graph: GraphData;
  spaceId: string;
  onClose: () => void;
  refresh: () => Promise<unknown>;
}

/**
 * The Town Bulletin Board (Agenda tab equivalent). A "task" is just a GraphNode with
 * kind === "action" (client.ts's own convention — no dedicated endpoint); completing one
 * is deleteNode (matches ActionsPanel today: completion = deletion, server pays a fuel
 * reward for actions older than its own minimum-age guard). Reminders are any node with
 * remindAt set; acking clears it server-side via ackReminder. Posting or turning in a real
 * quest is this building's own real work event (npc-economy.md).
 */
export function BulletinBoardOverlay({ graph, spaceId, onClose, refresh }: BulletinBoardOverlayProps) {
  const [newQuest, setNewQuest] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);

  const quests = graph.nodes.filter((n) => n.kind === "action");
  const reminders = graph.nodes.filter((n) => n.kind !== "action" && n.remindAt);

  const turnIn = async (node: GraphNode) => {
    setBusyId(node.id);
    try {
      await deleteNode(node.id);
      recordBuildingWork(spaceId, "bulletinBoard");
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const ack = async (node: GraphNode) => {
    setBusyId(node.id);
    try {
      await ackReminder(node.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const postQuest = async () => {
    const text = newQuest.trim();
    if (!text) return;
    setPosting(true);
    try {
      await ingestText(text, { kind: "action" });
      recordBuildingWork(spaceId, "bulletinBoard");
      setNewQuest("");
      await refresh();
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Bulletin Board"
      style={{
        position: "absolute",
        inset: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: 16,
        fontFamily: "monospace",
        overflowY: "auto",
      }}
    >
      <h2 style={{ marginTop: 0 }}>📋 Bulletin Board</h2>

      <h3>Active quests</h3>
      {quests.length === 0 ? (
        <p>Nothing posted right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {quests.map((q) => (
            <li key={q.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
              <span style={{ flex: 1 }}>{q.label}</span>
              <button type="button" onClick={() => turnIn(q)} disabled={busyId === q.id}>
                {busyId === q.id ? "…" : "Turn in"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Reminders</h3>
      {reminders.length === 0 ? (
        <p>No reminders waiting.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {reminders.map((r) => (
            <li key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
              <span style={{ flex: 1 }}>{r.label}</span>
              <button type="button" onClick={() => ack(r)} disabled={busyId === r.id}>
                {busyId === r.id ? "…" : "Ack"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Post a new quest</h3>
      <textarea
        aria-label="New quest"
        value={newQuest}
        onChange={(e) => setNewQuest(e.target.value)}
        rows={2}
        style={{ width: "100%", maxWidth: 360 }}
      />
      <div>
        <button type="button" onClick={postQuest} disabled={!newQuest.trim() || posting}>
          {posting ? "Posting…" : "Post"}
        </button>
      </div>

      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
