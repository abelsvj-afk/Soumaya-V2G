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
import { allResidentNpcIds } from "./residents.js";
import { refundToTreasury, spendFromTreasury, treasuryBalanceCents } from "./townLedger.js";
import { isTileOccupiedByPlacedItem } from "./townBuilder.js";
import { footprintOverlapsAny, placedBusinessFootprints } from "./placedStructures.js";
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
  /** ms epoch when this home was placed — drives `isUnderConstruction` (simcity-economy-
   *  construction.md, task #87). Read-time-computed, same wall-clock convention
   *  buildingNeglect.ts already uses, never a running timer. */
  builtAt: number;
}

/** Real, short construction period — long enough to register as "not instant" (the user's own
 *  "it must be built after being placed"), short enough not to be tedious in a low-stakes,
 *  single-player cosmetic game. */
export const CONSTRUCTION_MS = 90_000;

/** Pure function of the real placement timestamp vs. now — no running timer, computed fresh on
 *  every read (same pattern `buildingNeglect.ts`'s own functions already use). Generic over any
 *  placed structure with a real `builtAt` (business.ts's `PlacedBusiness` reuses this exact
 *  function rather than redefining it, so the two building categories can never drift). */
export function isUnderConstruction(placed: { builtAt: number }, nowMs: number = Date.now()): boolean {
  return nowMs - placed.builtAt < CONSTRUCTION_MS;
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

/** Cancels whatever home type is currently armed and refunds its real price back to the
 *  treasury (simcity-economy-construction.md addendum, 2026-09-15 audit fix) — arming spends
 *  immediately, so changing your mind, or re-arming to a different type, before ever placing it
 *  must give the money back rather than silently forfeit it. Distinct from `clearArmedHome`
 *  (used after a real placement, where the spend was intentional and no refund is due). Returns
 *  false, changing nothing, if nothing is armed. */
export function cancelArmedHome(spaceId: string): boolean {
  const typeId = armedHomeTypeId(spaceId);
  if (!typeId) return false;
  const type = homeTypeById(typeId);
  if (type) refundToTreasury(spaceId, type.priceCents);
  clearArmedHome(spaceId);
  return true;
}

/** Buys one catalog home type and arms it for placement — a second `armHomeType` call while
 *  one is already armed re-arms to the new type (never a queue, same one-selected-item
 *  convention as `townBuilder.ts`'s `armItem`), refunding whatever was armed before so that
 *  money is never silently lost. Returns false and changes nothing if the type is unknown or the
 *  treasury (after any refund) can't cover it. */
export function armHomeType(spaceId: string, typeId: string): boolean {
  const type = homeTypeById(typeId);
  if (!type) return false;
  if (armedHomeTypeId(spaceId) !== typeId) cancelArmedHome(spaceId);
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
 *  town-builder decor item, clear of every OTHER already-placed home, AND clear of every real
 *  placed business — 2026-09-15 audit fix: this cross-category check was the missing half of
 *  the zoning overlap exploit (zoning.ts's own tile-level fix closes re-zoning UNDER a built
 *  structure, but a footprint here could still, before that fix, span onto a tile zoned
 *  residential that already had a business under it from before re-zoning). Business's own
 *  `isFootprintFreeForBusiness` carries the mirror check against homes. */
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
  if (footprintOverlapsAny({ x0, y0, x1, y1 }, placedBusinessFootprints(spaceId))) return false;
  return true;
}

/** Task #129 (build-queue dispatch for any job, not just 1-tile orders) — places a SPECIFIC home
 *  type, never reading the currently-armed slot. A queued build order is completed later, by
 *  which time the player may have re-armed something else entirely (or nothing); a dispatched
 *  worker must still build exactly what was actually queued, the same reason
 *  `townBuilder.ts`'s `placeItemDirectly` exists alongside its own armed-state variant. The
 *  caller must have already confirmed `isFootprintFreeForHome`. Never spends the treasury itself
 *  — the real price was already paid at `armHomeType` time; a queued order's own captured
 *  `priceCents` is only ever refunded (cancel/stale-drop), never charged again. */
export function placeHomeDirectly(spaceId: string, typeId: string, x0: number, y0: number, nowMs: number = Date.now()): PlacedHome | null {
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
    builtAt: nowMs,
  };
  savePlacedHomes(spaceId, [...placedHomes(spaceId), placed]);
  return placed;
}

/** Places the currently-armed home type with its footprint anchored at (x0, y0), then clears
 *  the armed state. The caller must have already confirmed `isFootprintFreeForHome`. Returns
 *  null and changes nothing if nothing is armed. Deliberately does not re-check
 *  treasury/afford — the spend already happened at `armHomeType` time. `nowMs` defaults to the
 *  real clock; callers only ever override it in tests. */
export function placeArmedHome(spaceId: string, x0: number, y0: number, nowMs: number = Date.now()): PlacedHome | null {
  const typeId = armedHomeTypeId(spaceId);
  if (!typeId) return null;
  const placed = placeHomeDirectly(spaceId, typeId, x0, y0, nowMs);
  if (placed) clearArmedHome(spaceId);
  return placed;
}

/** Demolishes a real placed home. Refunds the full real purchase price if it's still
 *  `isUnderConstruction` (functionally identical to canceling the arm before it was ever
 *  placed — nobody's lived there yet, nothing real has happened), or 50% once it's finished
 *  construction — a real cost to undo a serious mistake once it has real assigned residents,
 *  never fully free relocation (wave3-economy-depth.md decision #3). Returns false, changing
 *  nothing, if no such home exists. */
export function demolishHome(spaceId: string, id: string, nowMs: number = Date.now()): boolean {
  const homes = placedHomes(spaceId);
  const home = homes.find((h) => h.id === id);
  if (!home) return false;
  const type = homeTypeById(home.typeId);
  if (type) {
    const refundRate = isUnderConstruction(home, nowMs) ? 1 : 0.5;
    refundToTreasury(spaceId, Math.floor(type.priceCents * refundRate));
  }
  savePlacedHomes(
    spaceId,
    homes.filter((h) => h.id !== id),
  );
  return true;
}

export interface HomeResident {
  /** A real society NPC's id, or (population-growth.md, task #118) a real Resident's id — both
   *  are plain strings under `SocietyNpcId`'s own alias, so no type change was needed to grow
   *  the roster this represents. */
  npcId: SocietyNpcId;
  homeId: string;
}

/** Deterministic, capacity-packed, never random (housing.md decision #3): walks the town's real
 *  24 society NPCs, THEN (population-growth.md, task #118) its real Resident roster, in one
 *  stable combined order, filling each home — in the order it was actually built — to its own
 *  real capacity before moving to the next. Society NPCs first means a Resident only ever gets a
 *  real home once every society NPC already has one and real capacity remains — the entire
 *  "housing capacity exceeding current population" gate falls straight out of this walk order,
 *  read-time-computed on every call, never a timer. Recomputed from real state every call rather
 *  than stored, so a newly-built home is reflected immediately with nothing else to keep in
 *  sync. Skips a home still `isUnderConstruction` (simcity-economy-construction.md, task #87) —
 *  an NPC can't move into an unfinished house; `nowMs` defaults to the real clock, only ever
 *  overridden in tests. */
export function assignResidents(spaceId: string, nowMs: number = Date.now()): HomeResident[] {
  const npcIds = [...allSocietyNpcIds(), ...allResidentNpcIds()];
  const homes = placedHomes(spaceId);
  const assignments: HomeResident[] = [];
  let i = 0;
  for (const home of homes) {
    if (isUnderConstruction(home, nowMs)) continue;
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
 *  decision #5, matches MayorsHallOverlay's own "nothing here is a score" convention). `total`
 *  is the town's REAL total population (population-growth.md, task #118) — society NPCs plus
 *  the real Resident roster, the same combined list `assignResidents` itself walks. */
export function housingSummary(spaceId: string): HousingSummary {
  const npcIds = [...allSocietyNpcIds(), ...allResidentNpcIds()];
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
