import { useState } from "react";
import { loadUnlocked } from "../../components/achievements.js";
import { figurineOptions, hangarKeys, shipOptions, trailOptions, type HangarOption } from "../data/hangarOptions.js";

export interface HangarOverlayProps {
  spaceId: string;
  memoriesCount: number;
  onClose: () => void;
}

function OptionSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: HangarOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", marginBottom: 4 }}>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ display: "block", width: "100%" }}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={!o.unlocked}>
              {o.unlocked ? o.label : `🔒 ${o.label} — ${o.lockedHint ?? "locked"}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * The Hangar — kept ~1:1 with the existing HangarPanel.tsx (per the build brief), reusing
 * the exact same localStorage keys and unlock gates (data/hangarOptions.ts) so a pilot's
 * earned cosmetics carry over between the galaxy and the Overworld. The Overworld's player
 * sprite is still placeholder art (roadmap.md's known Stage-1/2 simplification) so a chosen
 * skin isn't visually applied here yet — this building preserves the *selection state*
 * correctly, which is what matters for parity; visual application follows once real sprites
 * exist.
 */
export function HangarOverlay({ spaceId, memoriesCount, onClose }: HangarOverlayProps) {
  const keys = hangarKeys(spaceId);
  const unlocked = loadUnlocked(spaceId);
  const [ship, setShip] = useState(() => localStorage.getItem(keys.ship) || "default");
  const [trail, setTrail] = useState(() => localStorage.getItem(keys.trail) || "blue");
  const [fig1, setFig1] = useState(() => localStorage.getItem(keys.fig1) || "none");
  const [fig2, setFig2] = useState(() => localStorage.getItem(keys.fig2) || "none");

  const persist = (key: string, value: string, setter: (v: string) => void) => {
    localStorage.setItem(key, value);
    setter(value);
  };

  return (
    <div
      role="dialog"
      aria-label="Hangar"
      style={{
        position: "absolute",
        inset: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: 16,
        fontFamily: "monospace",
        overflowY: "auto",
      }}
    >
      <h2 style={{ marginTop: 0 }}>🛠️ Hangar</h2>
      <OptionSelect label="Spaceship Hull" options={shipOptions(unlocked, memoriesCount)} value={ship} onChange={(v) => persist(keys.ship, v, setShip)} />
      <OptionSelect label="Cosmic Trail" options={trailOptions(unlocked)} value={trail} onChange={(v) => persist(keys.trail, v, setTrail)} />
      <OptionSelect
        label="Deep Space Figurine — Slot 1"
        options={figurineOptions(unlocked, memoriesCount)}
        value={fig1}
        onChange={(v) => persist(keys.fig1, v, setFig1)}
      />
      <OptionSelect
        label="Deep Space Figurine — Slot 2"
        options={figurineOptions(unlocked, memoriesCount)}
        value={fig2}
        onChange={(v) => persist(keys.fig2, v, setFig2)}
      />
      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
