import { useRef, useState } from "react";
import type { CreatureEntity } from "../types.js";

export interface CaptureMenuProps {
  onSubmit: (text: string) => Promise<CreatureEntity | null>;
  onClose: () => void;
}

type Phase =
  | { kind: "entry" }
  | { kind: "submitting" }
  | { kind: "reveal"; creature: CreatureEntity | null }
  | { kind: "error"; message: string };

/**
 * FR8/FR9 — walking into tall grass opens this. Submitting shows the "identifying
 * species..." beat, then reveals the real extraction result (or degrades to a plain
 * confirmation if the heuristic offline path didn't return the new node in time — never a
 * dead end, per idea.md's offline-first non-negotiable).
 */
export function CaptureMenu({ onSubmit, onClose }: CaptureMenuProps) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "entry" });
  // 2026-09-15 audit fix — a stalled `onSubmit` was a genuine dead end: "submitting" had no
  // Cancel and there's no Escape handling anywhere in the Overworld, so reloading the page was
  // the only way out. A ref (not state) survives the phase change Cancel makes, so the late
  // network response is silently dropped instead of resurrecting a screen the player already left.
  const cancelledRef = useRef(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    cancelledRef.current = false;
    setPhase({ kind: "submitting" });
    try {
      const creature = await onSubmit(trimmed);
      if (cancelledRef.current) return;
      setPhase({ kind: "reveal", creature });
    } catch (err) {
      if (cancelledRef.current) return;
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  const cancelSubmit = () => {
    cancelledRef.current = true;
    setPhase({ kind: "entry" }); // back to entry, not closed — the typed thought is kept
  };

  return (
    <div
      role="dialog"
      aria-label="Capture a thought"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10,10,20,0.9)",
        color: "#f4f1ff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        padding: 16,
        fontFamily: "monospace",
        // 2026-09-15 audit fix — same z-index-layering bug as OverlayShell.tsx: this modal must
        // out-rank the persistent TownHud/button-row (zIndex:1) rather than sit behind them.
        zIndex: 10,
      }}
    >
      {phase.kind === "entry" && (
        <>
          <p>What's on your mind?</p>
          <textarea
            aria-label="Thought"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            style={{ width: "100%", maxWidth: 360 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={submit} disabled={!text.trim()}>
              Capture
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
      {phase.kind === "submitting" && (
        <>
          <p>🔍 identifying species...</p>
          <button type="button" onClick={cancelSubmit}>
            Cancel
          </button>
        </>
      )}
      {phase.kind === "reveal" && (
        <>
          {phase.creature ? (
            <p>
              {phase.creature.rarity.badge} {phase.creature.name} — {phase.creature.rarity.label}
            </p>
          ) : (
            <p>Captured — it'll show up in the world shortly.</p>
          )}
          <button type="button" onClick={onClose}>
            Nice.
          </button>
        </>
      )}
      {phase.kind === "error" && (
        <>
          <p>{phase.message}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setPhase({ kind: "entry" })}>
              Try again
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
