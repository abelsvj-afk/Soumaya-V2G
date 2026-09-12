/**
 * A real multi-business economy (docs/overworld/business.md, task #67) — mirrors housing.ts
 * (task #66) almost exactly: the same zoning-gated, player-built, treasury-priced pattern, now
 * for the OTHER zone type ("commercial") that also did nothing until this round. Since a tile
 * holds exactly one zone type at a time (zoning.ts's own rule), a business can never legally
 * overlap a home — the zoning gate alone prevents that, no cross-module check needed.
 */

import { isPlacementBlocked } from "../scenes/regionLayout.js";
import { spendFromTreasury, treasuryBalanceCents, creditHour } from "./townLedger.js";
import { markWorked, buildingNeglect } from "./buildingNeglect.js";
import { isTileOccupiedByPlacedItem } from "./townBuilder.js";
import { zoneTypeAt } from "./zoning.js";

export interface BusinessGood {
  id: string;
  name: string;
  icon: string;
  priceCents: number;
}

export interface BusinessType {
  id: string;
  name: string;
  icon: string;
  width: number;
  height: number;
  priceCents: number;
  goods: readonly BusinessGood[];
}

export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    id: "bakery",
    name: "Bakery",
    icon: "🥐",
    width: 2,
    height: 2,
    priceCents: 400,
    goods: [
      { id: "bakery_awning", name: "Striped Awning", icon: "🎪", priceCents: 90 },
      { id: "bakery_display", name: "Pastry Display Case", icon: "🍰", priceCents: 120 },
      { id: "bakery_sign", name: "Hand-Painted Sign", icon: "🖼️", priceCents: 70 },
    ],
  },
  {
    id: "tailor",
    name: "Tailor",
    icon: "🧵",
    width: 3,
    height: 2,
    priceCents: 600,
    goods: [
      { id: "tailor_mannequin", name: "Window Mannequin", icon: "🧍", priceCents: 100 },
      { id: "tailor_bolt", name: "Bolt of Fabric Display", icon: "🧶", priceCents: 80 },
      { id: "tailor_ribbon", name: "Ribbon Trim", icon: "🎀", priceCents: 60 },
    ],
  },
  {
    id: "bookshop",
    name: "Bookshop",
    icon: "📖",
    width: 3,
    height: 3,
    priceCents: 800,
    goods: [
      { id: "bookshop_shelf", name: "Reading Nook Shelf", icon: "📚", priceCents: 110 },
      { id: "bookshop_globe", name: "Antique Globe", icon: "🌍", priceCents: 130 },
      { id: "bookshop_lamp", name: "Reading Lamp", icon: "💡", priceCents: 75 },
    ],
  },
];

export function businessTypeById(typeId: string): BusinessType | undefined {
  return BUSINESS_TYPES.find((t) => t.id === typeId);
}

export interface PlacedBusiness {
  id: string;
  typeId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  door: { x: number; y: number };
}

function placedKey(spaceId: string): string {
  return `brain.business.placed.${spaceId}`;
}

function armedKey(spaceId: string): string {
  return `brain.business.armed.${spaceId}`;
}

export function placedBusinesses(spaceId: string): PlacedBusiness[] {
  try {
    const raw = JSON.parse(localStorage.getItem(placedKey(spaceId)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function savePlacedBusinesses(spaceId: string, businesses: PlacedBusiness[]): void {
  try {
    localStorage.setItem(placedKey(spaceId), JSON.stringify(businesses));
  } catch {
    /* the treasury spend already happened — worst case this build isn't remembered */
  }
}

export function armedBusinessTypeId(spaceId: string): string | null {
  try {
    return localStorage.getItem(armedKey(spaceId));
  } catch {
    return null;
  }
}

export function clearArmedBusiness(spaceId: string): void {
  try {
    localStorage.removeItem(armedKey(spaceId));
  } catch {
    /* nothing to do — worst case the armed business lingers until overwritten */
  }
}

export function canAffordBusiness(spaceId: string, type: BusinessType): boolean {
  return type.priceCents <= treasuryBalanceCents(spaceId);
}

/** Buys one catalog business type and arms it for placement — a second call while one is
 *  already armed re-arms to the new type (never a queue, same convention as
 *  `housing.ts`'s `armHomeType`). Returns false and changes nothing if the type is unknown or
 *  the treasury can't cover it. */
export function armBusinessType(spaceId: string, typeId: string): boolean {
  const type = businessTypeById(typeId);
  if (!type) return false;
  if (!spendFromTreasury(spaceId, type.priceCents)) return false;
  try {
    localStorage.setItem(armedKey(spaceId), typeId);
  } catch {
    /* the treasury spend already happened — worst case the arm state isn't remembered */
  }
  return true;
}

function footprintOverlapsBusiness(x0: number, y0: number, x1: number, y1: number, business: PlacedBusiness): boolean {
  return x0 <= business.x1 && x1 >= business.x0 && y0 <= business.y1 && y1 >= business.y0;
}

/** Every tile of the footprint anchored with its top-left corner at (x0, y0) must be: zoned
 *  "commercial" (business.md decision #1 — the zoning gate, mirroring housing's own), clear of
 *  the town's real geometry, clear of any town-builder decor item, and clear of every other
 *  already-placed business. A home can never legally occupy a commercial-zoned tile (zoning.ts
 *  only ever tags a tile with ONE type at a time), so no separate home-overlap check is needed. */
export function isFootprintFreeForBusiness(spaceId: string, x0: number, y0: number, type: BusinessType): boolean {
  const x1 = x0 + type.width - 1;
  const y1 = y0 + type.height - 1;
  const others = placedBusinesses(spaceId);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (zoneTypeAt(spaceId, x, y) !== "commercial") return false;
      if (isPlacementBlocked(x, y)) return false;
      if (isTileOccupiedByPlacedItem(spaceId, x, y)) return false;
    }
  }
  if (others.some((business) => footprintOverlapsBusiness(x0, y0, x1, y1, business))) return false;
  return true;
}

/** Places the currently-armed business type with its footprint anchored at (x0, y0), then
 *  clears the armed state. The caller must have already confirmed `isFootprintFreeForBusiness`.
 *  Returns null and changes nothing if nothing is armed. */
export function placeArmedBusiness(spaceId: string, x0: number, y0: number): PlacedBusiness | null {
  const typeId = armedBusinessTypeId(spaceId);
  if (!typeId) return null;
  const type = businessTypeById(typeId);
  if (!type) return null;
  const x1 = x0 + type.width - 1;
  const y1 = y0 + type.height - 1;
  const placed: PlacedBusiness = {
    id: `${spaceId}-business-${Date.now()}-${x0}-${y0}`,
    typeId,
    x0,
    y0,
    x1,
    y1,
    door: { x: x0 + Math.floor(type.width / 2), y: y1 },
  };
  savePlacedBusinesses(spaceId, [...placedBusinesses(spaceId), placed]);
  clearArmedBusiness(spaceId);
  return placed;
}

export function businessById(spaceId: string, id: string): PlacedBusiness | null {
  return placedBusinesses(spaceId).find((b) => b.id === id) ?? null;
}

/** The placed business whose own door tile is exactly (x, y) — `ExteriorScene.ts`'s `afterStep`
 *  calls this alongside the static `doorPlaceAt` check (business.md decision #2: stepping onto
 *  a business's door tile enters it, same as a real door-building). */
export function businessDoorAt(spaceId: string, x: number, y: number): PlacedBusiness | null {
  return placedBusinesses(spaceId).find((b) => b.door.x === x && b.door.y === y) ?? null;
}

function ownedKey(spaceId: string, businessId: string): string {
  return `brain.business.owned.${spaceId}.${businessId}`;
}

/** Each placed business keeps its own owned-goods set — buying a good at one business never
 *  marks the "same kind of thing" owned at a different business of the same type. */
export function ownedGoodIds(spaceId: string, businessId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(ownedKey(spaceId, businessId)) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

export function canAffordGood(spaceId: string, good: BusinessGood): boolean {
  return good.priceCents <= treasuryBalanceCents(spaceId);
}

/** Spends real earned wages from the Town Treasury on one of this business's own goods, then
 *  credits that SAME business's own real hours and resets its own real neglect clock (business.md
 *  decision #1 — `creditHour`/`markWorked` are already string-keyed, so the business's own
 *  dynamic id works with zero changes to either). Returns false and changes nothing if the good
 *  is unknown, doesn't belong to this business's type, already owned here, or unaffordable. */
export function purchaseGoodFromBusiness(spaceId: string, businessId: string, goodId: string): boolean {
  const business = businessById(spaceId, businessId);
  if (!business) return false;
  const type = businessTypeById(business.typeId);
  const good = type?.goods.find((g) => g.id === goodId);
  if (!good) return false;
  const owned = ownedGoodIds(spaceId, businessId);
  if (owned.has(goodId)) return false;
  if (!spendFromTreasury(spaceId, good.priceCents)) return false;
  owned.add(goodId);
  try {
    localStorage.setItem(ownedKey(spaceId, businessId), JSON.stringify([...owned]));
  } catch {
    /* the treasury spend already happened — worst case this purchase isn't remembered */
  }
  creditHour(spaceId, businessId);
  markWorked(spaceId, businessId);
  return true;
}

/** This business's own real neglect, same math every other building uses — wraps
 *  `buildingNeglect.ts` with the business's own dynamic id as the key. */
export function businessNeglect(spaceId: string, business: PlacedBusiness): number {
  return buildingNeglect(spaceId, business.id);
}
