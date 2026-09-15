/**
 * Zoning (docs/overworld/zoning.md, task #75) — the real SimCity foundation under housing (#66)
 * and business types (#67): a per-tile designation of what's ALLOWED to go where, reusing the
 * exact arm-then-place interaction town-builder (townBuilder.ts) already built. Zoning itself is
 * free (no treasury spend) — only actually building a home/business on a zoned tile will cost
 * anything, once #66/#67 exist. Pure, localStorage-backed, same convention as townBuilder.ts.
 *
 * Zoning rework (docs/overworld/zoning-rework.md, task #77) — real, repeated feedback that
 * one-tile-at-a-time zoning requiring a fresh Hangar trip per tile is "too slow and doesn't make
 * sense" for a SimCity-scale game. Two fixes here: arming now PERSISTS across paints (no more
 * auto-clear per tile), and a new "area" mode lets two interact presses (anchor, then commit)
 * zone a whole rectangle in one action instead of one tile at a time.
 */

import { isPlacementBlocked } from "../scenes/regionLayout.js";
import { isInsideAnyFootprint, placedBusinessFootprints, placedHomeFootprints } from "./placedStructures.js";

export type ZoneType = "residential" | "commercial" | "sidewalk" | "transit";
export type ZoneMode = "tile" | "area";

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

function armedModeKey(spaceId: string): string {
  return `brain.zoning.armedMode.${spaceId}`;
}

function anchorKey(spaceId: string): string {
  return `brain.zoning.anchor.${spaceId}`;
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
 *  overwrites); it's real town/object/attendant geometry that's off-limits, not a prior tag.
 *  2026-09-15 audit fix: a tile a real home or business already occupies is off-limits too —
 *  re-zoning UNDER an already-built structure was the exact hole the cross-type overlap exploit
 *  used (zone residential, build a home, re-zone commercial, build a business on the same
 *  tile). */
export function isTileZonable(spaceId: string, x: number, y: number): boolean {
  if (isPlacementBlocked(x, y)) return false;
  if (isInsideAnyFootprint(placedHomeFootprints(spaceId), x, y)) return false;
  if (isInsideAnyFootprint(placedBusinessFootprints(spaceId), x, y)) return false;
  return true;
}

export function armedZoneType(spaceId: string): ZoneType | null {
  try {
    const raw = localStorage.getItem(armedKey(spaceId));
    return raw && (ZONE_TYPES as readonly string[]).includes(raw) ? (raw as ZoneType) : null;
  } catch {
    return null;
  }
}

/** The armed mode paired with the armed type above — "tile" (one press, one tile) or "area" (an
 *  anchor press, then a commit press zones a whole rectangle). Defaults to "tile" if unset, so
 *  any pre-existing armed state from before this mode existed still behaves exactly as before. */
export function armedZoneMode(spaceId: string): ZoneMode {
  try {
    const raw = localStorage.getItem(armedModeKey(spaceId));
    return raw === "area" ? "area" : "tile";
  } catch {
    return "tile";
  }
}

/** Arms a zone type for painting — free, unlike town-builder's armItem, since zoning is a
 *  planning decision, not a purchase (docs/overworld/zoning.md decision #3). Arming a second
 *  type (or re-arming the same one in a different mode) re-arms rather than queuing, same
 *  convention as town-builder, and always discards any pending area anchor from a prior arm
 *  (zoning-rework.md) since a stale anchor from a different type/mode would be confusing. */
export function armZoneType(spaceId: string, type: ZoneType, mode: ZoneMode = "tile"): void {
  try {
    localStorage.setItem(armedKey(spaceId), type);
    localStorage.setItem(armedModeKey(spaceId), mode);
    localStorage.removeItem(anchorKey(spaceId));
  } catch {
    /* nothing to do — worst case the arm state isn't remembered */
  }
}

export function clearArmedZone(spaceId: string): void {
  try {
    localStorage.removeItem(armedKey(spaceId));
    localStorage.removeItem(armedModeKey(spaceId));
  } catch {
    /* nothing to do */
  }
}

/** Real disarm entry point for the TownHud's "Stop" button (zoning-rework.md decision #3) — the
 *  player can stop a zoning session from anywhere in the world, not just the Hangar. Clears the
 *  arm and any pending anchor together, since a lone leftover anchor with nothing armed is
 *  meaningless. */
export function disarmZoning(spaceId: string): void {
  clearArmedZone(spaceId);
  clearZoneAnchor(spaceId);
}

/** The pending first corner of an in-progress area-mode rectangle, or null if none is set. */
export function zoneAnchor(spaceId: string): { x: number; y: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(anchorKey(spaceId)) || "null");
    return raw && typeof raw.x === "number" && typeof raw.y === "number" ? raw : null;
  } catch {
    return null;
  }
}

export function setZoneAnchor(spaceId: string, x: number, y: number): void {
  try {
    localStorage.setItem(anchorKey(spaceId), JSON.stringify({ x, y }));
  } catch {
    /* nothing to do */
  }
}

export function clearZoneAnchor(spaceId: string): void {
  try {
    localStorage.removeItem(anchorKey(spaceId));
  } catch {
    /* nothing to do */
  }
}

/** Paints the currently-armed zone type onto a tile the caller has already confirmed is zonable,
 *  overwriting any existing tag there. Unlike town-builder's one-arm-one-action shape, the armed
 *  state is deliberately left in place afterward (zoning-rework.md decision #1) — a real,
 *  repeated complaint that every tile forced a fresh Hangar trip to re-arm. Returns null and
 *  changes nothing if nothing is armed. */
export function zoneTileAt(spaceId: string, x: number, y: number): ZonedTile | null {
  const type = armedZoneType(spaceId);
  if (!type) return null;
  const others = zonedTiles(spaceId).filter((t) => !(t.x === x && t.y === y));
  const tile: ZonedTile = { x, y, type };
  saveZonedTiles(spaceId, [...others, tile]);
  return tile;
}

/** Zones every zonable tile in the rectangle spanning two corners (inclusive), in one action —
 *  the real "a lot of space at one time" fix (zoning-rework.md decision #2). Corners are
 *  normalized so either can be passed in either order. Blocked tiles are silently skipped, same
 *  convention `isTileZonable` already uses for a single tile. Does not clear the armed
 *  type/mode — only the caller's own anchor, once committed, since a player should be able to
 *  start a new rectangle immediately without returning to the Hangar. Returns an empty array
 *  (not null) when nothing is armed or the rectangle contains no zonable tile. */
export function zoneRectangle(spaceId: string, x0: number, y0: number, x1: number, y1: number): ZonedTile[] {
  const type = armedZoneType(spaceId);
  if (!type) return [];
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const zoned: ZonedTile[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (isTileZonable(spaceId, x, y)) zoned.push({ x, y, type });
    }
  }
  if (zoned.length === 0) return [];
  const untouched = zonedTiles(spaceId).filter((t) => !zoned.some((z) => z.x === t.x && z.y === t.y));
  saveZonedTiles(spaceId, [...untouched, ...zoned]);
  return zoned;
}

/** An honest per-type count of the player's own zoning plan — never a score, just what's real. */
export function zoneCounts(spaceId: string): Record<ZoneType, number> {
  const counts: Record<ZoneType, number> = { residential: 0, commercial: 0, sidewalk: 0, transit: 0 };
  for (const tile of zonedTiles(spaceId)) counts[tile.type]++;
  return counts;
}
