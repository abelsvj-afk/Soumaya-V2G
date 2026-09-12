/**
 * Housing (docs/overworld/housing.md, task #66) — real, player-built homes for the town's 20
 * society NPCs. Extends the two mechanisms already shipped: zoning (zoning.ts, task #75) gates
 * WHERE a home can go (only tiles zoned "residential"), and town-builder's arm-then-place
 * pattern (townBuilder.ts, task #65) is reused for HOW it goes there, generalized from a 1x1
 * item to a multi-tile footprint. NPC-to-home assignment is deterministic and capacity-packed —
 * never random, never an invented backstory (see housing.md decision #3).
 */

import { isPlacementBlocked } from "../scenes/regionLayout.js";
import { allSocietyNpcIds, type SocietyNpcId } from "./npcDialogue.js";
import { spendFromTreasury, treasuryBalanceCents } from "./townLedger.js";
import { isTileOccupiedByPlacedItem } from "./townBuilder.js";
import { zoneTypeAt } from "./zoning.js";

export interface HomeType {
  id: string;
  name: string;
  icon: string;
  width: number;
  height: number;
  capacity: number;
  priceCents: number;
}

export const HOME_TYPES: readonly HomeType[] = [
  { id: "cottage", name: "Cottage", icon: "🏠", width: 2, height: 2, capacity: 1, priceCents: 300 },
  { id: "duplex", name: "Duplex", icon: "🏡", width: 3, height: 2, capacity: 2, priceCents: 500 },
  { id: "house", name: "House", icon: "🏘️", width: 3, height: 3, capacity: 3, priceCents: 750 },
  { id: "apartment", name: "Apartment Block", icon: "🏢", width: 4, height: 3, capacity: 4, priceCents: 1000 },
];

export function homeTypeById(typeId: string): HomeType | undefined {
  return HOME_TYPES.find((t) => t.id === typeId);
}

export interface PlacedHome {
  id: string;
  typeId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  door: { x: number; y: number };
}

function placedKey(spaceId: string): string {
  return `brain.housing.placed.${spaceId}`;
}

function armedKey(spaceId: string): string {
  return `brain.housing.armed.${spaceId}`;
}

/** Build order matters (assignResidents packs homes in this order) — always returned in the
 *  order they were actually placed, never re-sorted. */
export function placedHomes(spaceId: string): PlacedHome[] {
  try {
    const raw = JSON.parse(localStorage.getItem(placedKey(spaceId)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function savePlacedHomes(spaceId: string, homes: PlacedHome[]): void {
  try {
    localStorage.setItem(placedKey(spaceId), JSON.stringify(homes));
  } catch {
    /* the treasury spend already happened — worst case this build isn't remembered */
  }
}

export function armedHomeTypeId(spaceId: string): string | null {
  try {
    return localStorage.getItem(armedKey(spaceId));
  } catch {
    return null;
  }
}

export function clearArmedHome(spaceId: string): void {
  try {
    localStorage.removeItem(armedKey(spaceId));
  } catch {
    /* nothing to do — worst case the armed home lingers until overwritten */
  }
}

export function canAffordHome(spaceId: string, type: HomeType): boolean {
  return type.priceCents <= treasuryBalanceCents(spaceId);
}

/** Buys one catalog home type and arms it for placement — a second `armHomeType` call while
 *  one is already armed re-arms to the new type (never a queue, same one-selected-item
 *  convention as `townBuilder.ts`'s `armItem`). Returns false and changes nothing if the type is
 *  unknown or the treasury can't cover it. */
export function armHomeType(spaceId: string, typeId: string): boolean {
  const type = homeTypeById(typeId);
  if (!type) return false;
  if (!spendFromTreasury(spaceId, type.priceCents)) return false;
  try {
    localStorage.setItem(armedKey(spaceId), typeId);
  } catch {
    /* the treasury spend already happened — worst case the arm state isn't remembered */
  }
  return true;
}

function footprintOverlapsHome(x0: number, y0: number, x1: number, y1: number, home: PlacedHome): boolean {
  return x0 <= home.x1 && x1 >= home.x0 && y0 <= home.y1 && y1 >= home.y0;
}

/** Every tile of the footprint anchored with its top-left corner at (x0, y0) must be: zoned
 *  "residential" (housing.md decision #2 — zoning gates where a home can go), clear of the
 *  town's own real geometry (buildings/objects/attendants/grass/spawn), clear of any
 *  town-builder decor item, and clear of every OTHER already-placed home. */
export function isFootprintFreeForHome(spaceId: string, x0: number, y0: number, type: HomeType): boolean {
  const x1 = x0 + type.width - 1;
  const y1 = y0 + type.height - 1;
  const others = placedHomes(spaceId);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (zoneTypeAt(spaceId, x, y) !== "residential") return false;
      if (isPlacementBlocked(x, y)) return false;
      if (isTileOccupiedByPlacedItem(spaceId, x, y)) return false;
    }
  }
  if (others.some((home) => footprintOverlapsHome(x0, y0, x1, y1, home))) return false;
  return true;
}

/** Places the currently-armed home type with its footprint anchored at (x0, y0), then clears
 *  the armed state. The caller must have already confirmed `isFootprintFreeForHome`. Returns
 *  null and changes nothing if nothing is armed. Deliberately does not re-check
 *  treasury/afford — the spend already happened at `armHomeType` time. */
export function placeArmedHome(spaceId: string, x0: number, y0: number): PlacedHome | null {
  const typeId = armedHomeTypeId(spaceId);
  if (!typeId) return null;
  const type = homeTypeById(typeId);
  if (!type) return null;
  const x1 = x0 + type.width - 1;
  const y1 = y0 + type.height - 1;
  const placed: PlacedHome = {
    id: `${spaceId}-home-${Date.now()}-${x0}-${y0}`,
    typeId,
    x0,
    y0,
    x1,
    y1,
    door: { x: x0 + Math.floor(type.width / 2), y: y1 },
  };
  savePlacedHomes(spaceId, [...placedHomes(spaceId), placed]);
  clearArmedHome(spaceId);
  return placed;
}

export interface HomeResident {
  npcId: SocietyNpcId;
  homeId: string;
}

/** Deterministic, capacity-packed, never random (housing.md decision #3): walks the town's real
 *  20 NPCs in their one stable declaration order, filling each home — in the order it was
 *  actually built — to its own real capacity before moving to the next. Recomputed from real
 *  state every call rather than stored, so a newly-built home is reflected immediately with
 *  nothing else to keep in sync. */
export function assignResidents(spaceId: string): HomeResident[] {
  const npcIds = allSocietyNpcIds();
  const homes = placedHomes(spaceId);
  const assignments: HomeResident[] = [];
  let i = 0;
  for (const home of homes) {
    const type = homeTypeById(home.typeId);
    const capacity = type?.capacity ?? 0;
    for (let slot = 0; slot < capacity && i < npcIds.length; slot++, i++) {
      assignments.push({ npcId: npcIds[i]!, homeId: home.id });
    }
  }
  return assignments;
}

export function homeForNpc(spaceId: string, npcId: SocietyNpcId): string | null {
  return assignResidents(spaceId).find((a) => a.npcId === npcId)?.homeId ?? null;
}

export function residentsOfHome(spaceId: string, homeId: string): SocietyNpcId[] {
  return assignResidents(spaceId)
    .filter((a) => a.homeId === homeId)
    .map((a) => a.npcId);
}

export interface HousingSummary {
  housed: number;
  total: number;
  livingAlone: number;
  sharing: number;
}

/** An honest count only — never an invented story about who's related to whom (housing.md
 *  decision #5, matches MayorsHallOverlay's own "nothing here is a score" convention). */
export function housingSummary(spaceId: string): HousingSummary {
  const npcIds = allSocietyNpcIds();
  const assignments = assignResidents(spaceId);
  const byHome = new Map<string, number>();
  for (const a of assignments) byHome.set(a.homeId, (byHome.get(a.homeId) ?? 0) + 1);
  let livingAlone = 0;
  let sharing = 0;
  for (const count of byHome.values()) {
    if (count === 1) livingAlone++;
    else if (count > 1) sharing++;
  }
  return { housed: assignments.length, total: npcIds.length, livingAlone, sharing };
}
