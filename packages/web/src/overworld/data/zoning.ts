/**
 * Zoning (docs/overworld/zoning.md, task #75) — the real SimCity foundation under housing (#66)
 * and business types (#67): a per-tile designation of what's ALLOWED to go where, reusing the
 * exact arm-then-place interaction town-builder (townBuilder.ts) already built. Zoning itself is
 * free (no treasury spend) — only actually building a home/business on a zoned tile will cost
 * anything, once #66/#67 exist. Pure, localStorage-backed, same convention as townBuilder.ts.
 */

import { isPlacementBlocked } from "../scenes/regionLayout.js";

export type ZoneType = "residential" | "commercial" | "sidewalk" | "transit";

export const ZONE_TYPES: readonly ZoneType[] = ["residential", "commercial", "sidewalk", "transit"];

export interface ZonedTile {
  x: number;
  y: number;
  type: ZoneType;
}

function zonesKey(spaceId: string): string {
  return `brain.zoning.tiles.${spaceId}`;
}

function armedKey(spaceId: string): string {
  return `brain.zoning.armed.${spaceId}`;
}

export function zonedTiles(spaceId: string): ZonedTile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(zonesKey(spaceId)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveZonedTiles(spaceId: string, tiles: ZonedTile[]): void {
  try {
    localStorage.setItem(zonesKey(spaceId), JSON.stringify(tiles));
  } catch {
    /* the zoning decision still happened in memory this session — worst case not remembered */
  }
}

export function zoneTypeAt(spaceId: string, x: number, y: number): ZoneType | null {
  return zonedTiles(spaceId).find((t) => t.x === x && t.y === y)?.type ?? null;
}

/** Whether a tile can be zoned at all — the same real town geometry check town-builder's own
 *  placements use. A tile already zoned as something else is still zonable (re-zoning
 *  overwrites); it's real town/object/attendant geometry that's off-limits, not a prior tag. */
export function isTileZonable(spaceId: string, x: number, y: number): boolean {
  return !isPlacementBlocked(x, y);
}

export function armedZoneType(spaceId: string): ZoneType | null {
  try {
    const raw = localStorage.getItem(armedKey(spaceId));
    return raw && (ZONE_TYPES as readonly string[]).includes(raw) ? (raw as ZoneType) : null;
  } catch {
    return null;
  }
}

/** Arms a zone type for painting — free, unlike town-builder's armItem, since zoning is a
 *  planning decision, not a purchase (docs/overworld/zoning.md decision #3). Arming a second
 *  type re-arms rather than queuing, same convention as town-builder. */
export function armZoneType(spaceId: string, type: ZoneType): void {
  try {
    localStorage.setItem(armedKey(spaceId), type);
  } catch {
    /* nothing to do — worst case the arm state isn't remembered */
  }
}

export function clearArmedZone(spaceId: string): void {
  try {
    localStorage.removeItem(armedKey(spaceId));
  } catch {
    /* nothing to do */
  }
}

/** Paints the currently-armed zone type onto a tile the caller has already confirmed is zonable,
 *  overwriting any existing tag there, then clears the armed state (matches town-builder's
 *  one-arm-one-action shape). Returns null and changes nothing if nothing is armed. */
export function zoneTileAt(spaceId: string, x: number, y: number): ZonedTile | null {
  const type = armedZoneType(spaceId);
  if (!type) return null;
  const others = zonedTiles(spaceId).filter((t) => !(t.x === x && t.y === y));
  const tile: ZonedTile = { x, y, type };
  saveZonedTiles(spaceId, [...others, tile]);
  clearArmedZone(spaceId);
  return tile;
}

/** An honest per-type count of the player's own zoning plan — never a score, just what's real. */
export function zoneCounts(spaceId: string): Record<ZoneType, number> {
  const counts: Record<ZoneType, number> = { residential: 0, commercial: 0, sidewalk: 0, transit: 0 };
  for (const tile of zonedTiles(spaceId)) counts[tile.type]++;
  return counts;
}
