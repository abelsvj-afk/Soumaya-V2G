import { useState } from "react";
import { loadUnlocked } from "../../components/achievements.js";
import { figurineOptions, hangarKeys, shipOptions, trailOptions, type HangarOption } from "../data/hangarOptions.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { treasuryBalanceCents } from "../data/townLedger.js";
import { armedItemId, armItem, canAffordItem, PLACEABLE_ITEMS } from "../data/townBuilder.js";
import { armedZoneType, armZoneType, zoneCounts, ZONE_TYPES, type ZoneType } from "../data/zoning.js";
import { armedHomeTypeId, armHomeType, canAffordHome, HOME_TYPES } from "../data/housing.js";
import { armBusinessType, armedBusinessTypeId, BUSINESS_TYPES, canAffordBusiness } from "../data/business.js";
import { actionButtonStyle, fieldStyle, OverlayShell } from "./OverlayShell.js";

const ZONE_META: Record<ZoneType, { label: string; icon: string }> = {
  residential: { label: "Residential", icon: "🏠" },
  commercial: { label: "Commercial", icon: "🏪" },
  sidewalk: { label: "Sidewalk", icon: "➰" },
  transit: { label: "Transit stop", icon: "🚏" },
};

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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
 *
 * Town Builder (docs/overworld/town-builder.md, task #65) — the Hangar is also where a real
 * placeable item is bought, per the request's own "go to the hangar, and that's where you can
 * select items to be placed in the map." Buying spends the real Town Treasury and "arms" the
 * item; closing this overlay and pressing interact facing an open tile in the world places it
 * (ExteriorScene.ts). Only ever one item armed at a time — buying a second re-arms rather than
 * queuing, and the real work credit for a placement happens at that moment, not here at purchase.
 *
 * Zoning (docs/overworld/zoning.md, task #75) — the real SimCity foundation under housing/
 * business: arming a zone type is FREE (a planning decision, never a purchase), then the same
 * walk-up-and-press-A action tags a tile instead of placing an item. Its own real, honest
 * "positive/negative effect" is the plain per-type count below — never an invented score.
 *
 * Housing (docs/overworld/housing.md, task #66) — a home can only be BUILT on ground already
 * zoned residential above; buying one spends the real Town Treasury and arms it the same way a
 * decor item does, then a multi-tile footprint gets placed at the walked-up-to tile. NPCs are
 * assigned to built homes automatically (housing.md decision #3) — the honest "who lives where"
 * summary lives in Mayor's Hall, not repeated here.
 *
 * Business (docs/overworld/business.md, task #67) — the same real pattern as Housing, mirrored
 * onto the OTHER zone type: a business can only be built on ground already zoned commercial.
 * Unlike a home, walking INTO a placed business (stepping on its own door tile) opens a real
 * shop overlay with its own real goods, spending the same Town Treasury.
 */
export function HangarOverlay({ spaceId, memoriesCount, onClose }: HangarOverlayProps) {
  const keys = hangarKeys(spaceId);
  const unlocked = loadUnlocked(spaceId);
  const [ship, setShip] = useState(() => localStorage.getItem(keys.ship) || "default");
  const [trail, setTrail] = useState(() => localStorage.getItem(keys.trail) || "blue");
  const [fig1, setFig1] = useState(() => localStorage.getItem(keys.fig1) || "none");
  const [fig2, setFig2] = useState(() => localStorage.getItem(keys.fig2) || "none");
  const [armed, setArmed] = useState(() => armedItemId(spaceId));
  const [balance, setBalance] = useState(() => treasuryBalanceCents(spaceId));
  const [armedZone, setArmedZone] = useState(() => armedZoneType(spaceId));
  const [armedHome, setArmedHome] = useState(() => armedHomeTypeId(spaceId));
  const [armedBusiness, setArmedBusiness] = useState(() => armedBusinessTypeId(spaceId));
  const counts = zoneCounts(spaceId);

  const persist = (key: string, value: string, setter: (v: string) => void) => {
    localStorage.setItem(key, value);
    setter(value);
    // A cosmetic actually changed is the Hangar's own real work event (npc-economy.md).
    recordBuildingWork(spaceId, "hangar");
  };

  const buyAndArm = (itemId: string) => {
    if (armItem(spaceId, itemId)) {
      setArmed(itemId);
      setBalance(treasuryBalanceCents(spaceId));
    }
  };

  const armZone = (type: ZoneType) => {
    armZoneType(spaceId, type);
    setArmedZone(type);
  };

  const buyAndArmHome = (typeId: string) => {
    if (armHomeType(spaceId, typeId)) {
      setArmedHome(typeId);
      setBalance(treasuryBalanceCents(spaceId));
    }
  };

  const buyAndArmBusiness = (typeId: string) => {
    if (armBusinessType(spaceId, typeId)) {
      setArmedBusiness(typeId);
      setBalance(treasuryBalanceCents(spaceId));
    }
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

      <h3>Town Building</h3>
      <p style={{ marginTop: 0 }}>
        Town Treasury: <strong>{formatCents(balance)}</strong>
        {armed && (
          <>
            {" "}
            — <strong>{PLACEABLE_ITEMS.find((i) => i.id === armed)?.name ?? armed}</strong> is ready to place: leave here, walk up
            to an open spot, and press A.
          </>
        )}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {PLACEABLE_ITEMS.map((item) => {
          const affordable = canAffordItem(spaceId, item);
          const isArmed = armed === item.id;
          return (
            <li key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{item.icon}</span>
              <span style={{ flex: 1 }}>
                {item.name} — {formatCents(item.priceCents)}
              </span>
              <button
                type="button"
                onClick={() => buyAndArm(item.id)}
                disabled={isArmed || !affordable}
                style={actionButtonStyle(isArmed || !affordable)}
              >
                {isArmed ? "Armed" : affordable ? "Buy" : "Can't afford"}
              </button>
            </li>
          );
        })}
      </ul>

      <h3>Zoning</h3>
      <p style={{ marginTop: 0 }}>
        Free to plan — only building on a zoned tile later costs anything.
        {armedZone && (
          <>
            {" "}
            — <strong>{ZONE_META[armedZone].label}</strong> is ready to paint: leave here, walk up to an open tile, and press A.
          </>
        )}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ZONE_TYPES.map((type) => {
          const isArmed = armedZone === type;
          return (
            <li key={type} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{ZONE_META[type].icon}</span>
              <span style={{ flex: 1 }}>
                {ZONE_META[type].label} — {counts[type]} zoned
              </span>
              <button type="button" onClick={() => armZone(type)} disabled={isArmed} style={actionButtonStyle(isArmed)}>
                {isArmed ? "Armed" : "Zone"}
              </button>
            </li>
          );
        })}
      </ul>

      <h3>Housing</h3>
      <p style={{ marginTop: 0 }}>
        Only buildable on ground already zoned Residential above.
        {armedHome && (
          <>
            {" "}
            — <strong>{HOME_TYPES.find((t) => t.id === armedHome)?.name ?? armedHome}</strong> is ready to place: leave here,
            walk up to a zoned spot, and press A.
          </>
        )}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {HOME_TYPES.map((type) => {
          const affordable = canAffordHome(spaceId, type);
          const isArmed = armedHome === type.id;
          return (
            <li key={type.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{type.icon}</span>
              <span style={{ flex: 1 }}>
                {type.name} — {type.capacity} resident{type.capacity === 1 ? "" : "s"} — {formatCents(type.priceCents)}
              </span>
              <button
                type="button"
                onClick={() => buyAndArmHome(type.id)}
                disabled={isArmed || !affordable}
                style={actionButtonStyle(isArmed || !affordable)}
              >
                {isArmed ? "Armed" : affordable ? "Buy" : "Can't afford"}
              </button>
            </li>
          );
        })}
      </ul>

      <h3>Business</h3>
      <p style={{ marginTop: 0 }}>
        Only buildable on ground already zoned Commercial above. Walk into a built one to shop.
        {armedBusiness && (
          <>
            {" "}
            — <strong>{BUSINESS_TYPES.find((t) => t.id === armedBusiness)?.name ?? armedBusiness}</strong> is ready to place:
            leave here, walk up to a zoned spot, and press A.
          </>
        )}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {BUSINESS_TYPES.map((type) => {
          const affordable = canAffordBusiness(spaceId, type);
          const isArmed = armedBusiness === type.id;
          return (
            <li key={type.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{type.icon}</span>
              <span style={{ flex: 1 }}>
                {type.name} — {formatCents(type.priceCents)}
              </span>
              <button
                type="button"
                onClick={() => buyAndArmBusiness(type.id)}
                disabled={isArmed || !affordable}
                style={actionButtonStyle(isArmed || !affordable)}
              >
                {isArmed ? "Armed" : affordable ? "Buy" : "Can't afford"}
              </button>
            </li>
          );
        })}
      </ul>
    </OverlayShell>
  );
}
