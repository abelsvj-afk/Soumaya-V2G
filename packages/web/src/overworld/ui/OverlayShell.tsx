import { useState, type CSSProperties, type ReactNode } from "react";
import { color, panelShadow, radius, spacing } from "./theme.js";

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
 *
 * Pro-design pass (wave4-full-vision.md §B/#111) — every color here now comes from `theme.ts`,
 * the code side of the Figma design system (https://www.figma.com/design/Max8E6fAzoFZhV0sWCISMg)
 * built from this exact palette. Three real, visible upgrades ported from that Figma component,
 * not a re-skin: (1) the icon sits in a bordered badge instead of floating bare next to the
 * title, (2) a real accent line under the header, (3) a genuine two-layer depth shadow
 * (`panelShadow`) instead of one flat hard offset.
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
        background: color.scrim,
        // 2026-09-15 audit fix — TownHud/the Settings-track-mute button row both sit at
        // zIndex:1 (OverworldRoot.tsx, TownHud.tsx) and default z-index:auto (this overlay's
        // old value) always paints BELOW an explicit positive z-index regardless of DOM order,
        // so those persistent buttons rendered on top of, and stayed clickable through, every
        // overlay's own scrim — including this component's own Settings instance. Any overlay
        // is a modal; nothing persistent should ever out-rank it.
        zIndex: 10,
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
          background: color.panelBg,
          border: `3px solid ${color.panelBorder}`,
          borderRadius: radius.md,
          boxShadow: panelShadow,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm + 2,
            padding: `${spacing.md - 2}px ${spacing.lg - 2}px`,
            background: color.headerBg,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: 16,
              lineHeight: 1,
              width: 30,
              height: 30,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: color.panelBg,
              border: `2px solid ${color.panelBorder}`,
              borderRadius: radius.sm,
            }}
          >
            {icon}
          </span>
          <h2 style={{ margin: 0, fontSize: 15, color: color.textTitle, fontFamily: "monospace", letterSpacing: 0.5 }}>
            {title}
          </h2>
        </div>
        <div aria-hidden="true" style={{ height: 3, flexShrink: 0, background: color.buttonBorder }} />
        <div
          style={{
            padding: spacing.md + 2,
            overflowY: "auto",
            color: color.textBody,
            fontFamily: "monospace",
            fontSize: 13,
            flex: 1,
            minHeight: 0,
          }}
        >
          {children}
        </div>
        <div
          style={{
            padding: `${spacing.md - 2}px ${spacing.lg - 2}px`,
            borderTop: `2px solid ${color.footerBorder}`,
            background: color.footerBg,
            flexShrink: 0,
          }}
        >
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
  background: color.buttonBg,
  color: color.buttonText,
  border: `2px solid ${color.buttonBorder}`,
  borderRadius: radius.sm,
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
    background: color.buttonBg,
    color: color.buttonText,
    border: `2px solid ${color.buttonBorder}`,
    borderRadius: radius.sm,
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

/** A two-tap confirm button for a destructive, irreversible action (delete a Journey, delete a
 *  Timeline chapter, delete a Lens, turn in a quest) — 2026-09-15 audit fix (finding #5): every
 *  one of these fired immediately on a single tap, with no confirm and no undo anywhere in the
 *  app. The first tap arms it (swaps to a distinctly red-toned confirm + a Cancel button, never
 *  color-only — the LABEL itself changes too); the second tap on the SAME button actually does
 *  it. No auto-revert timer (this codebase's own standing no-polling-timer convention) — Cancel
 *  is the explicit way back, always right next to it. */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm?",
  ariaLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel?: string;
  ariaLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          aria-label={ariaLabel ? `Confirm: ${ariaLabel}` : undefined}
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          style={{ ...actionButtonStyle(false), background: color.dangerBg, borderColor: color.dangerBorder }}
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={() => setArmed(false)} style={actionButtonStyle(false)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button type="button" aria-label={ariaLabel} onClick={() => setArmed(true)} disabled={disabled} style={actionButtonStyle(disabled)}>
      {label}
    </button>
  );
}

/** A text input/textarea styled to match the shell rather than the browser's bare default. */
export const fieldStyle: CSSProperties = {
  background: color.fieldBg,
  color: color.textTitle,
  border: `2px solid ${color.fieldBorder}`,
  borderRadius: radius.sm,
  padding: "6px 8px",
  fontFamily: "monospace",
  fontSize: 13,
};
