import { useState } from "react";
import { loadUnlocked } from "../../components/achievements.js";
import { figurineOptions, hangarKeys, shipOptions, trailOptions, type HangarOption } from "../data/hangarOptions.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { treasuryBalanceCents } from "../data/townLedger.js";
import { armedItemId, armItem, canAffordItem, PLACEABLE_ITEMS, placedItems, removePlacedItem } from "../data/townBuilder.js";
import { armedZoneMode, armedZoneType, armZoneType, zoneCounts, ZONE_TYPES, type ZoneMode, type ZoneType } from "../data/zoning.js";
import {
  armedHomeTypeId,
  armHomeType,
  canAffordHome,
  CONSTRUCTION_MS,
  demolishHome,
  homeTypeById,
  HOME_TYPES,
  placedHomes,
} from "../data/housing.js";
import {
  armBusinessType,
  armedBusinessTypeId,
  businessTypeById,
  BUSINESS_TYPES,
  canAffordBusiness,
  demolishBusiness,
  placedBusinesses,
} from "../data/business.js";
import { homeBuildingSprite, businessBuildingSprite } from "../scenes/buildingSprites.js";
import { actionButtonStyle, ConfirmButton, fieldStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

const HOME_SPRITE_URL = homeBuildingSprite().url;
const BUSINESS_SPRITE_URL = businessBuildingSprite().url;

/** A real preview of what gets placed in the world — the exact same illustration
 *  ExteriorScene.ts actually renders for a built home/business (buildingSprites.ts), scaled by
 *  each type's own real footprint so a bigger building visibly previews bigger
 *  (simcity-economy-construction.md decision #4). Every type in a category shares one
 *  illustration honestly (that's what really renders in-world); the type-glyph badge already
 *  distinguishes them, both here and in the world. */
function BuildingPreview({ url, width, height }: { url: string; width: number; height: number }) {
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      style={{
        width: width * 14,
        height: height * 14,
        objectFit: "cover",
        borderRadius: 4,
        flexShrink: 0,
        border: `1px solid ${color.divider}`,
      }}
    />
  );
}

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
 * the exact same localStorage keys and unlock gates (data/hangarOptions.ts) so a traveler's
 * earned cosmetics carry over between the galaxy and the Overworld. The chosen Footprint Trail
 * now actually renders — ExteriorScene.ts reads it (readTrailColor/refreshTrailColor) and
 * colors the fading trail the player leaves while walking. Outfit + charm choices still
 * have no 2D equivalent to apply to (no per-outfit sprite art exists) — this building keeps
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
 * Zoning rework (docs/overworld/zoning-rework.md, task #77) — real feedback that one-tile zoning
 * requiring a fresh Hangar trip per tile was "too slow." Arming now persists across paints (no
 * more auto-clear), and a Tile/Area mode toggle lets the player choose whole-rectangle painting
 * (two presses: an anchor, then a commit) instead of one tile at a time.
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
  const [zoneMode, setZoneMode] = useState<ZoneMode>(() => armedZoneMode(spaceId));
  const [armedHome, setArmedHome] = useState(() => armedHomeTypeId(spaceId));
  const [armedBusiness, setArmedBusiness] = useState(() => armedBusinessTypeId(spaceId));
  // Bumped on every demolish — placedItems/placedHomes/placedBusinesses read straight from
  // localStorage rather than being mirrored into state, so this forces those lists to re-derive
  // (wave3-economy-depth.md decision #3).
  const [placedVersion, setPlacedVersion] = useState(0);
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
    armZoneType(spaceId, type, zoneMode);
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

  const demolishItem = (id: string) => {
    if (removePlacedItem(spaceId, id)) {
      setBalance(treasuryBalanceCents(spaceId));
      setPlacedVersion((v) => v + 1);
    }
  };

  const demolishHomeRow = (id: string) => {
    if (demolishHome(spaceId, id)) {
      setBalance(treasuryBalanceCents(spaceId));
      setPlacedVersion((v) => v + 1);
    }
  };

  const demolishBusinessRow = (id: string) => {
    if (demolishBusiness(spaceId, id)) {
      setBalance(treasuryBalanceCents(spaceId));
      setPlacedVersion((v) => v + 1);
    }
  };

  // Recomputed whenever placedVersion bumps (or on first render) — intentionally not memoized,
  // these are small per-space lists read straight from localStorage.
  void placedVersion;
  const myItems = placedItems(spaceId);
  const myHomes = placedHomes(spaceId);
  const myBusinesses = placedBusinesses(spaceId);

  return (
    <OverlayShell icon="🛠️" title="Hangar" onClose={onClose}>
      <OptionSelect label="Traveler's Outfit" options={shipOptions(unlocked, memoriesCount)} value={ship} onChange={(v) => persist(keys.ship, v, setShip)} />
      <OptionSelect label="Footprint Trail" options={trailOptions(unlocked)} value={trail} onChange={(v) => persist(keys.trail, v, setTrail)} />
      <OptionSelect
        label="Keepsake Charm — Slot 1"
        options={figurineOptions(unlocked, memoriesCount)}
        value={fig1}
        onChange={(v) => persist(keys.fig1, v, setFig1)}
      />
      <OptionSelect
        label="Keepsake Charm — Slot 2"
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
            <li key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
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
      {myItems.length > 0 && (
        <>
          <h4>Your placed items</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {myItems.map((placed) => {
              const item = PLACEABLE_ITEMS.find((i) => i.id === placed.itemId);
              return (
                <li key={placed.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
                  <span aria-hidden="true">{item?.icon ?? "❓"}</span>
                  <span style={{ flex: 1 }}>{item?.name ?? placed.itemId}</span>
                  <ConfirmButton
                    label="Demolish"
                    confirmLabel="Really demolish? Refunds full price."
                    ariaLabel={`Demolish ${item?.name ?? placed.itemId}`}
                    onConfirm={() => demolishItem(placed.id)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3>Zoning</h3>
      <p style={{ marginTop: 0 }}>
        Free to plan — only building on a zoned tile later costs anything.
        {armedZone && armedZoneMode(spaceId) === "tile" && (
          <>
            {" "}
            — <strong>{ZONE_META[armedZone].label}</strong> (Tile) is ready to paint: leave here, walk up to an open tile, and
            press A. Stays armed — press A again on the next tile without coming back here; the Town HUD's "Stop" button ends
            the session.
          </>
        )}
        {armedZone && armedZoneMode(spaceId) === "area" && (
          <>
            {" "}
            — <strong>{ZONE_META[armedZone].label}</strong> (Area) is ready: press A on a corner tile to anchor it, then walk to
            the opposite corner and press A again to zone the whole rectangle. Stays armed for the next rectangle; the Town
            HUD's "Stop" button ends the session.
          </>
        )}
      </p>
      <div role="radiogroup" aria-label="Zoning brush size for the next arm" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {(["tile", "area"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={zoneMode === mode}
            disabled={zoneMode === mode}
            onClick={() => setZoneMode(mode)}
            style={actionButtonStyle(zoneMode === mode)}
          >
            {mode === "tile" ? "Tile — one at a time" : "Area — a whole rectangle"}
          </button>
        ))}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ZONE_TYPES.map((type) => {
          const isArmed = armedZone === type;
          return (
            <li key={type} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
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
        Only buildable on ground already zoned Residential above. Takes a real {Math.round(CONSTRUCTION_MS / 1000)} seconds to
        finish building before anyone can move in.
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
            <li key={type.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
              <BuildingPreview url={HOME_SPRITE_URL} width={type.width} height={type.height} />
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
      {myHomes.length > 0 && (
        <>
          <h4>Your placed homes</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {myHomes.map((home) => {
              const type = homeTypeById(home.typeId);
              const underConstruction = Date.now() - home.builtAt < CONSTRUCTION_MS;
              return (
                <li key={home.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
                  <span aria-hidden="true">{type?.icon ?? "❓"}</span>
                  <span style={{ flex: 1 }}>{type?.name ?? home.typeId}</span>
                  <ConfirmButton
                    label="Demolish"
                    confirmLabel={underConstruction ? "Really demolish? Refunds full price." : "Really demolish? Refunds half price."}
                    ariaLabel={`Demolish ${type?.name ?? home.typeId}`}
                    onConfirm={() => demolishHomeRow(home.id)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3>Business</h3>
      <p style={{ marginTop: 0 }}>
        Only buildable on ground already zoned Commercial above. Takes a real {Math.round(CONSTRUCTION_MS / 1000)} seconds to
        finish building before it's open — walk into a built one to shop.
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
            <li key={type.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
              <BuildingPreview url={BUSINESS_SPRITE_URL} width={type.width} height={type.height} />
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
      {myBusinesses.length > 0 && (
        <>
          <h4>Your placed businesses</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {myBusinesses.map((business) => {
              const type = businessTypeById(business.typeId);
              const underConstruction = Date.now() - business.builtAt < CONSTRUCTION_MS;
              return (
                <li key={business.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
                  <span aria-hidden="true">{type?.icon ?? "❓"}</span>
                  <span style={{ flex: 1 }}>{type?.name ?? business.typeId}</span>
                  <ConfirmButton
                    label="Demolish"
                    confirmLabel={underConstruction ? "Really demolish? Refunds full price." : "Really demolish? Refunds half price."}
                    ariaLabel={`Demolish ${type?.name ?? business.typeId}`}
                    onConfirm={() => demolishBusinessRow(business.id)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </OverlayShell>
  );
}
