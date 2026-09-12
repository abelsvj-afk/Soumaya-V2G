import type { CSSProperties, ReactNode } from "react";

export interface OverlayShellProps {
  icon: string;
  title: string;
  /** Defaults to `title` — pass only when the accessible name needs to differ from the
   *  visible header text (none of today's overlays need this, but it's a real escape hatch). */
  ariaLabel?: string;
  onClose: () => void;
  /** Replaces the default "Leave" button — used by SoumayaChatOverlay, which has its own
   *  input row directly above the close action and no separate footer content otherwise. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The shared visual frame for every "you walked into a place" overlay (Bank, Library, Market,
 * Soumaya, ...). Real user feedback, comparing this build to the old galaxy's own panels:
 * every overlay used to be its own flat, single-color, full-bleed monospace div — functional,
 * but visibly plainer than what it replaced. One real themed panel (a centered card, a proper
 * header bar, a styled close action, actual depth) fixes every overlay's look at once instead
 * of redesigning each one independently. Deliberately still a system monospace font (no new
 * font dependency — CLAUDE.md's "don't add dependencies casually" — the win here is layout,
 * color, and depth, not typography sourcing).
 */
export function OverlayShell({ icon, title, ariaLabel, onClose, footer, children }: OverlayShellProps) {
  return (
    <div
      role="dialog"
      aria-label={ariaLabel ?? title}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        background: "rgba(6, 7, 16, 0.6)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          height: "100%",
          maxHeight: 560,
          display: "flex",
          flexDirection: "column",
          background: "#1b1d3a",
          border: "3px solid #4a4d7a",
          borderRadius: 10,
          boxShadow: "0 6px 0 rgba(0,0,0,0.35), 0 0 0 1px #0c0e1f inset",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "#2a2d5c",
            borderBottom: "3px solid #4a4d7a",
            flexShrink: 0,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
            {icon}
          </span>
          <h2 style={{ margin: 0, fontSize: 15, color: "#f4f1ff", fontFamily: "monospace", letterSpacing: 0.5 }}>
            {title}
          </h2>
        </div>
        <div
          style={{
            padding: 14,
            overflowY: "auto",
            color: "#e7e5ff",
            fontFamily: "monospace",
            fontSize: 13,
            flex: 1,
            minHeight: 0,
          }}
        >
          {children}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "2px solid #33356b", background: "#181a35", flexShrink: 0 }}>
          {footer ?? (
            <button type="button" onClick={onClose} style={leaveButtonStyle}>
              Leave
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const leaveButtonStyle: CSSProperties = {
  width: "100%",
  padding: "8px 0",
  background: "#3d4080",
  color: "#f4f1ff",
  border: "2px solid #5a5db0",
  borderRadius: 6,
  fontFamily: "monospace",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

/** A smaller in-body action button (Search, Buy, Turn in, ...) — same palette as
 *  `leaveButtonStyle` so every button in a shell reads as one consistent system, not a bare
 *  default `<button>` next to a styled one. `disabled` dims it without relying on color alone
 *  (the whole control's opacity drops, matching the app's own non-color-only convention). */
export function actionButtonStyle(disabled?: boolean): CSSProperties {
  return {
    padding: "6px 12px",
    background: "#3d4080",
    color: "#f4f1ff",
    border: "2px solid #5a5db0",
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

/** A text input/textarea styled to match the shell rather than the browser's bare default. */
export const fieldStyle: CSSProperties = {
  background: "#12142a",
  color: "#f4f1ff",
  border: "2px solid #3a3d70",
  borderRadius: 6,
  padding: "6px 8px",
  fontFamily: "monospace",
  fontSize: 13,
};
