import { useEffect, useRef, useState } from "react";
import type { Fuel, Streak } from "@brain/shared";
import { treasuryBalanceCents, workedPlaceIds } from "../data/townLedger.js";
import { armedZoneMode, armedZoneType, disarmZoning } from "../data/zoning.js";
import { armedItemId, cancelArmedItem, PLACEABLE_ITEMS } from "../data/townBuilder.js";
import { armedHomeTypeId, cancelArmedHome, homeTypeById } from "../data/housing.js";
import { armedBusinessTypeId, businessTypeById, cancelArmedBusiness } from "../data/business.js";

export interface TownHudProps {
  spaceId: string;
  fuel: Fuel | null;
  streak: Streak | null;
  /** Called after the "Stop" button disarms zoning, so the world stops rendering the pending
   *  anchor marker too — TownHud itself only owns the Hangar's own persisted arm state, not the
   *  scene's transient anchor sprite (zoning-rework.md decision #3). */
  onZoningStopped?: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const chipStyle = {
  background: "#00000099",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 12,
  fontFamily: "monospace",
  whiteSpace: "nowrap" as const,
};

// Task #129 — renamed from "Transit stop" (read as a bus-stop landmark, not a road you build).
const ZONE_LABEL: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  sidewalk: "Sidewalk",
  transit: "Road",
};

function onboardingDismissedKey(spaceId: string): string {
  return `brain.townHud.onboardingDismissed.${spaceId}`;
}

/**
 * A persistent ambient town HUD (docs/overworld/town-hud.md, task #73) — a real gap the
 * 2026-09-11 parity audit flagged: Streak/Fuel only ever showed inside the Gym, Treasury only
 * ever inside Market/Hangar/Mayor's Hall. Three real numbers only (same icon convention
 * GymOverlay.tsx already established for the first two) — never a score, never an invented
 * "town health %". Purely presentational; never fetches or mutates anything itself.
 *
 * Zoning rework (docs/overworld/zoning-rework.md, task #77) — since arming a zone type no
 * longer auto-clears after one tile, a zoning session left armed needs to be visibly obvious
 * and stoppable from anywhere, not just re-discoverable back at the Hangar. Reads the real
 * armed state directly on every render (same convention as the Treasury number above) so it
 * reflects whatever was just armed in the Hangar without any extra event wiring.
 *
 * 2026-09-15 audit fix (gameplay-uiux-audit-2026-09-15.md, finding #4) — the SAME real gap
 * existed for the other 3 arm modes (town-builder item, home type, business type), and they're
 * checked FIRST in ExteriorScene.ts's interact-press priority chain, so a forgotten arm there
 * was the MOST likely to silently eat every press with zero indication why. Each gets the same
 * chip + Stop treatment as zoning; Stop now genuinely refunds (cancelArmedItem/Home/Business,
 * the same money-loss fix `armItem`/`armHomeType`/`armBusinessType` already got for re-arming),
 * since walking away from an armed purchase should never just forfeit it.
 *
 * Onboarding nudge (docs/overworld/wave3-economy-depth.md decision #4, task #106) — a single,
 * real, dismissible tip for a genuinely fresh town (`workedPlaceIds` empty — nothing has
 * happened here yet), not a tutorial system. Dismissing persists to localStorage so it never
 * shows again once dismissed OR once the town stops being fresh, whichever comes first.
 *
 * Real-feedback fix (2026-09-15) — direct response to "money needs to be earnable from the
 * start, I don't see a way to get money." The mechanism was already real and already reachable
 * with zero prerequisites (capturing a thought in the tall grass credits the Library the moment
 * a new player does the exact thing the onboarding tip already suggests — OverworldRoot.tsx's
 * `handleCaptureSubmit`), so this was never a broken mechanic, only an invisible one: nothing
 * ever told the player that a real interaction pays the Treasury, and nothing showed the payoff
 * happening. Two fixes, both purely presentational: the onboarding tip now says so in plain
 * words, and the 🏦 chip flashes the real amount just earned (compared against the last render's
 * own real balance, never a guess) for a couple of seconds after it goes up.
 */
export function TownHud({ spaceId, fuel, streak, onZoningStopped }: TownHudProps) {
  const [, bump] = useState(0);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(onboardingDismissedKey(spaceId)) === "1");
  const showOnboarding = !dismissed && workedPlaceIds(spaceId).length === 0;
  const balanceCents = treasuryBalanceCents(spaceId);
  const [earnedFlashCents, setEarnedFlashCents] = useState<number | null>(null);
  const prevBalanceRef = useRef<{ spaceId: string; cents: number } | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevBalanceRef.current;
    if (prev && prev.spaceId === spaceId && balanceCents > prev.cents) {
      setEarnedFlashCents(balanceCents - prev.cents);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setEarnedFlashCents(null), 2200);
    }
    prevBalanceRef.current = { spaceId, cents: balanceCents };
  }, [spaceId, balanceCents]);
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);
  const armedZone = armedZoneType(spaceId);
  const armedMode = armedZoneType(spaceId) ? armedZoneMode(spaceId) : null;
  const armedItem = armedItemId(spaceId);
  const armedItemName = armedItem ? (PLACEABLE_ITEMS.find((i) => i.id === armedItem)?.name ?? armedItem) : null;
  const armedHome = armedHomeTypeId(spaceId);
  const armedHomeName = armedHome ? (homeTypeById(armedHome)?.name ?? armedHome) : null;
  const armedBusiness = armedBusinessTypeId(spaceId);
  const armedBusinessName = armedBusiness ? (businessTypeById(armedBusiness)?.name ?? armedBusiness) : null;
  return (
    <>
      {showOnboarding && (
        <div
          style={{ position: "absolute", top: 40, left: 8, zIndex: 1, ...chipStyle, display: "flex", alignItems: "center", gap: 8, maxWidth: "70vw" }}
          aria-label="Onboarding tip"
        >
          <span>
            👋 New here? Walk into any building to explore, or step into the tall grass to capture a thought — real
            actions like that earn your Town Treasury (🏦 above) real money to spend at the Market and beyond.
          </span>
          <button
            type="button"
            aria-label="Dismiss onboarding tip"
            onClick={() => {
              try {
                localStorage.setItem(onboardingDismissedKey(spaceId), "1");
              } catch {
                /* best-effort — worst case the tip reappears next load */
              }
              setDismissed(true);
            }}
            style={{ ...chipStyle, padding: "2px 6px", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      )}
      <div
        style={{ position: "absolute", top: 8, left: 8, zIndex: 1, display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "70vw" }}
        aria-label="Town status"
      >
      <span style={chipStyle}>🔥 {streak?.current ?? 0}</span>
      <span style={chipStyle}>
        ⚡ {fuel?.fuel ?? 0}/{fuel?.capacity ?? 0}
      </span>
      <span style={chipStyle}>
        🏦 {formatCents(balanceCents)}
        {earnedFlashCents != null && (
          <span style={{ marginLeft: 4, color: "#8f8" }} aria-label={`earned ${formatCents(earnedFlashCents)}`}>
            +{formatCents(earnedFlashCents)}
          </span>
        )}
      </span>
      {armedZone && (
        <span style={{ ...chipStyle, display: "flex", alignItems: "center", gap: 6 }}>
          🧭 Zoning: {ZONE_LABEL[armedZone] ?? armedZone} ({armedMode === "area" ? "Area" : "Tile"})
          <button
            type="button"
            onClick={() => {
              disarmZoning(spaceId);
              bump((n) => n + 1);
              onZoningStopped?.();
            }}
            style={{ ...chipStyle, padding: "2px 6px", cursor: "pointer" }}
          >
            Stop
          </button>
        </span>
      )}
      {armedItemName && (
        <span style={{ ...chipStyle, display: "flex", alignItems: "center", gap: 6 }}>
          🛠️ Placing: {armedItemName}
          <button
            type="button"
            onClick={() => {
              cancelArmedItem(spaceId);
              bump((n) => n + 1);
            }}
            style={{ ...chipStyle, padding: "2px 6px", cursor: "pointer" }}
          >
            Stop
          </button>
        </span>
      )}
      {armedHomeName && (
        <span style={{ ...chipStyle, display: "flex", alignItems: "center", gap: 6 }}>
          🏠 Building: {armedHomeName}
          <button
            type="button"
            onClick={() => {
              cancelArmedHome(spaceId);
              bump((n) => n + 1);
            }}
            style={{ ...chipStyle, padding: "2px 6px", cursor: "pointer" }}
          >
            Stop
          </button>
        </span>
      )}
      {armedBusinessName && (
        <span style={{ ...chipStyle, display: "flex", alignItems: "center", gap: 6 }}>
          🏪 Building: {armedBusinessName}
          <button
            type="button"
            onClick={() => {
              cancelArmedBusiness(spaceId);
              bump((n) => n + 1);
            }}
            style={{ ...chipStyle, padding: "2px 6px", cursor: "pointer" }}
          >
            Stop
          </button>
        </span>
      )}
      </div>
    </>
  );
}
