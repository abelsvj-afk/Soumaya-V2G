import { useState } from "react";
import type { NodeRef } from "@brain/shared";
import { askChat } from "../../api/client.js";
import type { CreatureEntity } from "../types.js";
import { actionButtonStyle, fieldStyle, leaveButtonStyle, OverlayShell } from "./OverlayShell.js";

export interface SoumayaChatOverlayProps {
  onClose: () => void;
  /** So a citation that's actually standing in this region can offer "Go there". */
  creatures: CreatureEntity[];
  /** Pans the exterior scene's camera to a creature's tile — the 2D equivalent of the
   *  galaxy's existing chat-citation "fly to" feature. */
  onFlyToNode: (nodeId: number) => void;
}

interface Turn {
  role: "you" | "soumaya";
  text: string;
  citations?: NodeRef[];
}

/**
 * Soumaya, the partner NPC — talk to her to open this dialogue chat (chat-with-your-brain,
 * GraphRAG with cited answers). A citation that matches a creature actually placed in this
 * region gets a "📍 Go there" button that pans the camera, mirroring the galaxy's existing
 * fly-to-citation behavior (CLAUDE.md).
 */
export function SoumayaChatOverlay({ onClose, creatures, onFlyToNode }: SoumayaChatOverlayProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const creatureByNodeId = new Map(creatures.map((c) => [c.nodeId, c]));

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
      title="Soumaya"
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
      {turns.length === 0 && <p style={{ marginTop: 0 }}>Hey — what's on your mind?</p>}
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
