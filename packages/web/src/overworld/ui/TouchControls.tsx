import type { CSSProperties } from "react";
import type { Direction } from "../engine/movement.js";
import type { InputEvent } from "../engine/input.js";

export interface TouchControlsProps {
  onEvent: (event: InputEvent) => void;
  /** Fires on pointerdown (a direction) and on pointerup/leave/cancel (null) — lets the scene
   *  keep moving for as long as the button is held, the same way a keyboard key already does,
   *  instead of one step per tap (real user feedback: "you can't hold down the button to keep
   *  your character moving"). */
  onHoldChange: (direction: Direction | null) => void;
}

const DPAD: Array<{ direction: Direction; label: string; style: CSSProperties }> = [
  { direction: "up", label: "▲", style: { gridColumn: 2, gridRow: 1 } },
  { direction: "left", label: "◀", style: { gridColumn: 1, gridRow: 2 } },
  { direction: "right", label: "▶", style: { gridColumn: 3, gridRow: 2 } },
  { direction: "down", label: "▼", style: { gridColumn: 2, gridRow: 3 } },
];

/** Semi-transparent so an on-screen button never fully hides whatever's underneath it (real
 *  user feedback: "the buttons... shouldn't block things behind it") — still legible, just not
 *  an opaque tile sitting on top of the world. */
const buttonStyle: CSSProperties = {
  touchAction: "none",
  background: "#00000066",
  color: "#fff",
  border: "1px solid #ffffff55",
  borderRadius: 6,
};

/**
 * On-screen D-pad + A/B, dispatching the exact same InputEvent shape a keyboard handler
 * would — scenes never know which input source fired (architecture.md "Touch controls").
 * B has no action yet (no combat/menu-cancel exists in Stage 1); A is "interact" (greet /
 * open door / confirm capture).
 */
export function TouchControls({ onEvent, onHoldChange }: TouchControlsProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: 16,
        pointerEvents: "none",
        touchAction: "none",
      }}
    >
      <div
        role="group"
        aria-label="Move"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 40px)",
          gridTemplateRows: "repeat(3, 40px)",
          gap: 2,
          pointerEvents: "auto",
          touchAction: "none",
        }}
      >
        {DPAD.map((btn) => (
          <button
            key={btn.direction}
            type="button"
            aria-label={btn.direction}
            style={{ ...buttonStyle, ...btn.style, fontSize: 16 }}
            onPointerDown={() => {
              onEvent({ type: "move", direction: btn.direction });
              onHoldChange(btn.direction);
            }}
            onPointerUp={() => onHoldChange(null)}
            onPointerLeave={() => onHoldChange(null)}
            onPointerCancel={() => onHoldChange(null)}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, pointerEvents: "auto", touchAction: "none" }}>
        <button type="button" aria-label="B" disabled style={buttonStyle}>
          B
        </button>
        <button type="button" aria-label="A / Interact" style={buttonStyle} onPointerDown={() => onEvent({ type: "interact" })}>
          A
        </button>
      </div>
    </div>
  );
}
