import type { CSSProperties } from "react";
import type { Direction } from "../engine/movement.js";
import type { InputEvent } from "../engine/input.js";

export interface TouchControlsProps {
  onEvent: (event: InputEvent) => void;
}

const DPAD: Array<{ direction: Direction; label: string; style: CSSProperties }> = [
  { direction: "up", label: "▲", style: { gridColumn: 2, gridRow: 1 } },
  { direction: "left", label: "◀", style: { gridColumn: 1, gridRow: 2 } },
  { direction: "right", label: "▶", style: { gridColumn: 3, gridRow: 2 } },
  { direction: "down", label: "▼", style: { gridColumn: 2, gridRow: 3 } },
];

/**
 * On-screen D-pad + A/B, dispatching the exact same InputEvent shape a keyboard handler
 * would — scenes never know which input source fired (architecture.md "Touch controls").
 * B has no action yet (no combat/menu-cancel exists in Stage 1); A is "interact" (greet /
 * open door / confirm capture).
 */
export function TouchControls({ onEvent }: TouchControlsProps) {
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
            style={{ ...btn.style, fontSize: 16, touchAction: "none" }}
            onPointerDown={() => onEvent({ type: "move", direction: btn.direction })}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, pointerEvents: "auto", touchAction: "none" }}>
        <button type="button" aria-label="B" disabled>
          B
        </button>
        <button
          type="button"
          aria-label="A / Interact"
          style={{ touchAction: "none" }}
          onPointerDown={() => onEvent({ type: "interact" })}
        >
          A
        </button>
      </div>
    </div>
  );
}
