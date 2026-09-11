export interface DialogueBoxProps {
  title?: string;
  text: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  onDismiss: () => void;
  dismissLabel?: string;
  busy?: boolean;
}

/**
 * The reusable bottom-of-screen dialogue box (architecture.md/ux-design.md). Used for the
 * greet prompt (FR12 — a light, no-pressure invitation, never a quiz, no penalty for
 * dismissing) and reused wherever an NPC/creature interaction needs the same pattern.
 */
export function DialogueBox({ title, text, confirmLabel, onConfirm, onDismiss, dismissLabel, busy }: DialogueBoxProps) {
  return (
    <div
      role="dialog"
      aria-label={title ?? "Dialogue"}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: "12px 16px",
        fontFamily: "monospace",
        borderTop: "2px solid #4b4b8f",
      }}
    >
      {title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>}
      <p style={{ margin: "0 0 8px" }}>{text}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {onConfirm && (
          <button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "…" : (confirmLabel ?? "OK")}
          </button>
        )}
        <button type="button" onClick={onDismiss}>
          {dismissLabel ?? (onConfirm ? "Not now" : "Close")}
        </button>
      </div>
    </div>
  );
}
