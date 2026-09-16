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
import { refundToTreasury, spendFromTreasury, treasuryBalanceCents } from "./townLedger.js";

export interface PlaceableItem {
  id: string;
  name: string;
  icon: string;
  /** Asset completion pass (docs/overworld/asset-completion-pass.md, task #124) — a real image
   *  to render instead of the emoji `icon` above, additive-only (every pre-existing item leaves
   *  this unset and renders exactly as before, both in the Hangar catalog and in-world). */
  iconUrl?: string;
  priceCents: number;
}

export const PLACEABLE_ITEMS: readonly PlaceableItem[] = [
  { id: "garden_bed", name: "Garden Bed", icon: "🌷", priceCents: 80 },
  { id: "bench", name: "Bench", icon: "🪑", priceCents: 120 },
  { id: "lamp_post", name: "Lamp Post", icon: "🏮", priceCents: 150 },
  { id: "banner_post", name: "Banner Post", icon: "🚩", priceCents: 100 },
  // Asset completion pass (task #124) — real, previously-sourced-but-unused CC0 pieces, curated
  // (every one visually reviewed before being named — see CREDITS.md) rather than exposing all
  // 102 raw village-pack files as individual catalog buttons.
  { id: "village_well", name: "Village Well", icon: "🪣", iconUrl: "/overworld/village-pack/structure/medievalStructure_06.png", priceCents: 140 },
  { id: "market_stall", name: "Market Stall", icon: "🏕️", iconUrl: "/overworld/village-pack/structure/medievalStructure_09.png", priceCents: 200 },
  { id: "storage_crates", name: "Storage Crates", icon: "📦", iconUrl: "/overworld/village-pack/structure/medievalStructure_11.png", priceCents: 90 },
  { id: "stone_gatehouse", name: "Stone Gatehouse", icon: "🏰", iconUrl: "/overworld/village-pack/structure/medievalStructure_02.png", priceCents: 260 },
  { id: "fence_gate", name: "Fence Gate", icon: "🚪", iconUrl: "/overworld/village-pack/structure/medievalStructure_07.png", priceCents: 70 },
  { id: "canvas_tent", name: "Canvas Tent", icon: "⛺", iconUrl: "/overworld/village-pack/structure/medievalStructure_10.png", priceCents: 110 },
  { id: "pine_tree", name: "Pine Tree", icon: "🌲", iconUrl: "/overworld/village-pack/environment/medievalEnvironment_02.png", priceCents: 60 },
  { id: "round_hedge", name: "Round Hedge", icon: "🌳", iconUrl: "/overworld/village-pack/environment/medievalEnvironment_01.png", priceCents: 50 },
  { id: "boulder", name: "Boulder", icon: "🪨", iconUrl: "/overworld/village-pack/environment/medievalEnvironment_09.png", priceCents: 40 },
  { id: "rock_cluster", name: "Rock Cluster", icon: "🪨", iconUrl: "/overworld/village-pack/environment/medievalEnvironment_17.png", priceCents: 45 },
  { id: "traveler_wagon", name: "Traveler's Wagon", icon: "🛒", iconUrl: "/overworld/vehicles/wagon.png", priceCents: 320 },
  { id: "ruined_caravan", name: "Ruined Caravan", icon: "🪦", iconUrl: "/overworld/decor/caravan-wreck.png", priceCents: 150 },
  { id: "road_sign", name: "Road Sign", icon: "🪧", iconUrl: "/overworld/decor/road-sign.png", priceCents: 55 },
  { id: "crossroads_sign", name: "Crossroads Sign", icon: "🪧", iconUrl: "/overworld/decor/crossroads-sign.png", priceCents: 55 },
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

/** Cancels whatever item is currently armed and refunds its real price back to the treasury
 *  (simcity-economy-construction.md addendum, 2026-09-15 audit fix) — the same money-loss fix as
 *  `housing.ts`'s `cancelArmedHome`, mirrored for the decor catalog. Distinct from
 *  `clearArmedItem` (used after a real placement, where no refund is due). Returns false,
 *  changing nothing, if nothing is armed. */
export function cancelArmedItem(spaceId: string): boolean {
  const itemId = armedItemId(spaceId);
  if (!itemId) return false;
  const item = PLACEABLE_ITEMS.find((i) => i.id === itemId);
  if (item) refundToTreasury(spaceId, item.priceCents);
  clearArmedItem(spaceId);
  return true;
}

/** Buys one catalog item from the real treasury and arms it for placement — a second `armItem`
 *  call while one is already armed re-arms to the new item (never a queue, matches a
 *  Pokémon-style "one selected item from the bag"), refunding whatever was armed before so
 *  money is never silently lost. Returns false and changes nothing if the item is unknown or the
 *  treasury (after any refund) can't cover it. */
export function armItem(spaceId: string, itemId: string): boolean {
  const item = PLACEABLE_ITEMS.find((i) => i.id === itemId);
  if (!item) return false;
  if (armedItemId(spaceId) !== itemId) cancelArmedItem(spaceId);
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

/** The Phaser texture key a catalog item's real `iconUrl` (if any) gets loaded under — one place
 *  both `ExteriorScene.ts`'s preload and its in-world paint call derive the same key from,
 *  rather than each inventing its own (asset completion pass, task #124). */
export function itemIconKey(itemId: string): string {
  return `item-icon-${itemId}`;
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

/** Places an item at a tile the caller has already confirmed is free, WITHOUT touching the
 *  armed state or the treasury (build-queue-dispatch.md, task #123) — used to complete a queued
 *  work order, which already validated the target and spent the treasury once, at enqueue time.
 *  Distinct from `placeArmedItem` (the manual "arm then place yourself" path), which both
 *  arms+spends at a different time and clears an armed state a queued order never set. Also
 *  re-validates `isTileFreeForPlacement` itself (unlike `placeArmedItem`, which trusts an
 *  already-checked caller) since a queued order's target may have gone stale by the time a
 *  worker actually arrives. Returns null, changing nothing, if the itemId is unknown or the
 *  tile isn't free. */
export function placeItemDirectly(spaceId: string, itemId: string, x: number, y: number): PlacedItem | null {
  const item = PLACEABLE_ITEMS.find((i) => i.id === itemId);
  if (!item) return null;
  if (!isTileFreeForPlacement(spaceId, x, y)) return null;
  const placed: PlacedItem = { id: `${spaceId}-${Date.now()}-${Math.round(x)}-${Math.round(y)}`, itemId, x, y };
  savePlacedItems(spaceId, [...placedItems(spaceId), placed]);
  return placed;
}

/** Demolishes a real placed decor item, refunding its full real price — a pure decorative item
 *  with no dependent state (unlike a home/business), so there's no reason to charge for changing
 *  your mind (wave3-economy-depth.md decision #3). Returns false, changing nothing, if no such
 *  item exists. */
export function removePlacedItem(spaceId: string, id: string): boolean {
  const items = placedItems(spaceId);
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  const type = PLACEABLE_ITEMS.find((t) => t.id === item.itemId);
  if (type) refundToTreasury(spaceId, type.priceCents);
  savePlacedItems(spaceId, items.filter((i) => i.id !== id));
  return true;
}
