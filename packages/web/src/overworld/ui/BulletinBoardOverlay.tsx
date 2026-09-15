import { useState } from "react";
import type { GraphData, GraphNode } from "@brain/shared";
import { ackReminder, deleteNode, ingestText } from "../../api/client.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, ConfirmButton, fieldStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

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
    <OverlayShell icon="📋" title="Bulletin Board" onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Active quests</h3>
      {quests.length === 0 ? (
        <p>Nothing posted right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {quests.map((q) => (
            <li
              key={q.id}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}
            >
              <span style={{ flex: 1 }}>{q.label}</span>
              {busyId === q.id ? (
                <button type="button" disabled style={actionButtonStyle(true)}>
                  …
                </button>
              ) : (
                <ConfirmButton label="Turn in" confirmLabel="Really turn in?" ariaLabel={`Turn in ${q.label}`} onConfirm={() => turnIn(q)} />
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Reminders</h3>
      {reminders.length === 0 ? (
        <p>No reminders waiting.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {reminders.map((r) => (
            <li
              key={r.id}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}
            >
              <span style={{ flex: 1 }}>{r.label}</span>
              <button type="button" onClick={() => ack(r)} disabled={busyId === r.id} style={actionButtonStyle(busyId === r.id)}>
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
        style={{ ...fieldStyle, width: "100%", maxWidth: 360, resize: "vertical" }}
      />
      <div style={{ marginTop: 6 }}>
        <button type="button" onClick={postQuest} disabled={!newQuest.trim() || posting} style={actionButtonStyle(!newQuest.trim() || posting)}>
          {posting ? "Posting…" : "Post"}
        </button>
      </div>
    </OverlayShell>
  );
}
