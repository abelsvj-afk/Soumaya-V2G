import { useState } from "react";
import { loadUnlocked } from "../../components/achievements.js";
import { figurineOptions, hangarKeys, shipOptions, trailOptions, type HangarOption } from "../data/hangarOptions.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { fieldStyle, OverlayShell } from "./OverlayShell.js";

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
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, display: "block", width: "100%" }}>
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
 * earned cosmetics carry over between the galaxy and the Overworld. The chosen Cosmic Trail
 * now actually renders — ExteriorScene.ts reads it (readTrailColor/refreshTrailColor) and
 * colors the fading trail the player leaves while walking. Ship hull + figurine choices still
 * have no 2D equivalent to apply to (no per-hull sprite art exists) — this building keeps
 * their *selection state* correct, which is what matters for parity, until/unless a later
 * pass gives them a real in-world effect.
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
    // A cosmetic actually changed is the Hangar's own real work event (npc-economy.md).
    recordBuildingWork(spaceId, "hangar");
  };

  return (
    <OverlayShell icon="🛠️" title="Hangar" onClose={onClose}>
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
    </OverlayShell>
  );
}
