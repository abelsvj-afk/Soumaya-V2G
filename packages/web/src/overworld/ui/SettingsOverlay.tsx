import { musicEnabled, nextTrack, setMusicEnabled } from "../../lib/music.js";
import { actionButtonStyle, OverlayShell } from "./OverlayShell.js";
import { useState } from "react";

export interface SettingsOverlayProps {
  onClose: () => void;
}

/**
 * Settings/Help (docs/overworld/town-hud.md, task #73) — a real gap the 2026-09-11 parity audit
 * flagged: no Settings/Help entry point anywhere. Sound controls are the SAME real
 * `musicEnabled`/`setMusicEnabled`/`nextTrack` the two floating top-right buttons already use —
 * exposed here a second, more discoverable way, not a second music system. "How to Play" lists
 * only the real, already-true controls (`ExteriorScene.ts`'s own real key bindings) — nothing
 * invented.
 */
export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const [musicOn, setMusicOn] = useState(musicEnabled());

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicEnabled(next);
    setMusicOn(next);
  };

  return (
    <OverlayShell icon="⚙️" title="Settings & Help" onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Sound</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={toggleMusic} style={actionButtonStyle(false)}>
          {musicOn ? "🔊 Music on" : "🔇 Music off"}
        </button>
        <button type="button" onClick={() => void nextTrack()} style={actionButtonStyle(false)}>
          ⏭️ Next track
        </button>
      </div>

      <h3>How to Play</h3>
      <ul style={{ paddingLeft: 20, marginTop: 0 }}>
        <li>Move with WASD or the arrow keys (or the on-screen D-pad on touch devices).</li>
        <li>Press Space or Enter to interact (or the on-screen A button on touch devices).</li>
        <li>Walk onto a building's door to step inside it.</li>
        <li>Walk into the tall grass to capture a new memory.</li>
        <li>Face a creature or Soumaya and interact to greet them.</li>
      </ul>
    </OverlayShell>
  );
}
