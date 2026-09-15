import { useState } from "react";
import type { NodeRef } from "@brain/shared";
import { askChat } from "../../api/client.js";
import type { DueReview } from "../../api/features.js";
import type { CreatureEntity } from "../types.js";
import { bumpStat, statsSpaceId } from "../../components/achievements.js";
import { actionButtonStyle, fieldStyle, leaveButtonStyle, OverlayShell } from "./OverlayShell.js";

export interface SoumayaChatOverlayProps {
  onClose: () => void;
  /** So a citation that's actually standing in this region can offer "Go there". */
  creatures: CreatureEntity[];
  /** Pans the exterior scene's camera to a creature's tile — the 2D equivalent of the
   *  galaxy's existing chat-citation "fly to" feature. */
  onFlyToNode: (nodeId: number) => void;
  /** spaced-repetition.md — the server's current SM-2 due list, so Soumaya can nudge by name
   *  in her own voice instead of a separate review-deck screen. */
  dueReviews?: DueReview[];
}

interface Turn {
  role: "you" | "soumaya";
  text: string;
  citations?: NodeRef[];
}

/**
 * Soumaya, the partner NPC and the town's real Mayor (soumaya-governance.md decision #1 — she
 * holds the top civic role, Mira administers Town Hall day-to-day in her stead) — talk to her
 * to open this dialogue chat (chat-with-your-brain, GraphRAG with cited answers). A citation
 * that matches a creature actually placed in this region gets a "📍 Go there" button that pans
 * the camera, mirroring the galaxy's existing fly-to-citation behavior (CLAUDE.md).
 */
export function SoumayaChatOverlay({ onClose, creatures, onFlyToNode, dueReviews = [] }: SoumayaChatOverlayProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const creatureByNodeId = new Map(creatures.map((c) => [c.nodeId, c]));
  const strongestDue = dueReviews.length > 0 ? dueReviews[0] : null;
  const strongestDueCreature = strongestDue ? creatureByNodeId.get(strongestDue.id) : undefined;

  const ask = async () => {
    const text = question.trim();
    if (!text) return;
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((cur) => [...cur, { role: "you", text }]);
    setQuestion("");
    setAsking(true);
    try {
      const response = await askChat(text, history);
      setTurns((cur) => [...cur, { role: "soumaya", text: response.answer, citations: response.citations }]);
      // 2026-09-15 audit fix — full_tank's own "commission Soumaya on demand" stat had zero
      // writers post-galaxy-deletion; asking her a real question IS the real on-demand commission.
      bumpStat(statsSpaceId(), "commissions");
    } catch (err) {
      setTurns((cur) => [
        ...cur,
        { role: "soumaya", text: err instanceof Error ? err.message : "I couldn't reach my thoughts just now." },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const goTo = (nodeId: number) => {
    onFlyToNode(nodeId);
    onClose();
  };

  return (
    <OverlayShell
      icon="🛰️"
      title="Mayor Soumaya"
      ariaLabel="Chat with Soumaya"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              aria-label="Ask Soumaya"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button type="button" onClick={ask} disabled={!question.trim() || asking} style={actionButtonStyle(!question.trim() || asking)}>
              Ask
            </button>
          </div>
          <button type="button" onClick={onClose} style={leaveButtonStyle}>
            Leave
          </button>
        </div>
      }
    >
      {turns.length === 0 && dueReviews.length === 0 && <p style={{ marginTop: 0 }}>Hey — what's on your mind?</p>}
      {turns.length === 0 && strongestDue && (
        <div style={{ marginTop: 0, marginBottom: 8 }}>
          <p style={{ margin: 0 }}>
            Hey — {dueReviews.length === 1 ? "one memory's" : `${dueReviews.length} memories are`} ready for a recall
            check whenever you want. "{strongestDue.label}" is the one that could use it most.
          </p>
          {strongestDueCreature && (
            <button
              type="button"
              onClick={() => goTo(strongestDueCreature.nodeId)}
              style={{ ...actionButtonStyle(), marginTop: 6, padding: "2px 6px", fontSize: 11 }}
            >
              📍 Go there
            </button>
          )}
        </div>
      )}
      {turns.map((t, i) => (
        <div key={i} style={{ marginBottom: 8, textAlign: t.role === "you" ? "right" : "left" }}>
          <div>{t.text}</div>
          {t.citations && t.citations.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, justifyContent: t.role === "you" ? "flex-end" : "flex-start" }}>
              {t.citations.map((c) => (
                <span key={c.id} style={{ fontSize: 12, border: "1px solid #4a4d7a", borderRadius: 4, padding: "2px 6px" }}>
                  {c.label}
                  {creatureByNodeId.has(c.id) && (
                    <button type="button" onClick={() => goTo(c.id)} style={{ ...actionButtonStyle(), marginLeft: 4, padding: "2px 6px", fontSize: 11 }}>
                      📍 Go there
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {asking && <p>...</p>}
    </OverlayShell>
  );
}
