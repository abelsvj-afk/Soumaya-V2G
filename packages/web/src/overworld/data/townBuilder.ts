/**
 * Town Builder (docs/overworld/town-builder.md, task #65) — the Hangar's real "select it, then
 * place it in the map" mechanism. Reuses the Town Treasury (townLedger.ts — never real
 * Fuel/finance) for price and `isPlacementBlocked` (regionLayout.ts) for "is this tile free",
 * same convention marketGoods.ts already established for a Hangar-triggered purchase.
 *
 * v1 scope: a small, fixed catalog of 1x1 decorative items only. Real housing/business types
 * with any mechanical meaning are separate, deferred work (tasks #66/#67) layered on top of this
 * placement mechanism, not attempted here.
 */

import { isPlacementBlocked } from "../scenes/regionLayout.js";
import { spendFromTreasury, treasuryBalanceCents } from "./townLedger.js";

export interface PlaceableItem {
  id: string;
  name: string;
  icon: string;
  priceCents: number;
}

export const PLACEABLE_ITEMS: readonly PlaceableItem[] = [
  { id: "garden_bed", name: "Garden Bed", icon: "🌷", priceCents: 80 },
  { id: "bench", name: "Bench", icon: "🪑", priceCents: 120 },
  { id: "lamp_post", name: "Lamp Post", icon: "🏮", priceCents: 150 },
  { id: "banner_post", name: "Banner Post", icon: "🚩", priceCents: 100 },
];

export interface PlacedItem {
  id: string;
  itemId: string;
  x: number;
  y: number;
}

function placedKey(spaceId: string): string {
  return `brain.townBuilder.placed.${spaceId}`;
}

function armedKey(spaceId: string): string {
  return `brain.townBuilder.armed.${spaceId}`;
}

export function placedItems(spaceId: string): PlacedItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(placedKey(spaceId)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function savePlacedItems(spaceId: string, items: PlacedItem[]): void {
  try {
    localStorage.setItem(placedKey(spaceId), JSON.stringify(items));
  } catch {
    /* the treasury spend / removal already happened — worst case this isn't remembered */
  }
}

export function isTileOccupiedByPlacedItem(spaceId: string, x: number, y: number): boolean {
  return placedItems(spaceId).some((p) => p.x === x && p.y === y);
}

/** Whether a tile is free for a NEW placement — the town's own real geometry (buildings,
 *  objects, attendant posts, the grass zone, the player spawn) plus anything already placed.
 *  Does NOT check for a creature currently standing there — a live snapshot concern the caller
 *  (ExteriorScene, which knows every creature's current tile) must check itself. */
export function isTileFreeForPlacement(spaceId: string, x: number, y: number): boolean {
  if (isPlacementBlocked(x, y)) return false;
  return !isTileOccupiedByPlacedItem(spaceId, x, y);
}

export function armedItemId(spaceId: string): string | null {
  try {
    return localStorage.getItem(armedKey(spaceId));
  } catch {
    return null;
  }
}

export function clearArmedItem(spaceId: string): void {
  try {
    localStorage.removeItem(armedKey(spaceId));
  } catch {
    /* nothing to do — worst case the armed item lingers until overwritten */
  }
}

/** Buys one catalog item from the real treasury and arms it for placement — a second `armItem`
 *  call while one is already armed re-arms to the new item (never a queue, matches a
 *  Pokémon-style "one selected item from the bag"). Returns false and changes nothing if the
 *  item is unknown or the treasury can't cover it. */
export function armItem(spaceId: string, itemId: string): boolean {
  const item = PLACEABLE_ITEMS.find((i) => i.id === itemId);
  if (!item) return false;
  if (!spendFromTreasury(spaceId, item.priceCents)) return false;
  try {
    localStorage.setItem(armedKey(spaceId), itemId);
  } catch {
    /* the treasury spend already happened — worst case the arm state isn't remembered */
  }
  return true;
}

export function canAffordItem(spaceId: string, item: PlaceableItem): boolean {
  return item.priceCents <= treasuryBalanceCents(spaceId);
}

/** Places the currently-armed item at a tile the caller has already confirmed is free (per
 *  `isTileFreeForPlacement` PLUS its own live creature check), then clears the armed state.
 *  Returns null and changes nothing if nothing is armed. Deliberately does not re-check
 *  treasury/afford — the spend already happened at `armItem` time. */
export function placeArmedItem(spaceId: string, x: number, y: number): PlacedItem | null {
  const itemId = armedItemId(spaceId);
  if (!itemId) return null;
  const placed: PlacedItem = { id: `${spaceId}-${Date.now()}-${Math.round(x)}-${Math.round(y)}`, itemId, x, y };
  savePlacedItems(spaceId, [...placedItems(spaceId), placed]);
  clearArmedItem(spaceId);
  return placed;
}
