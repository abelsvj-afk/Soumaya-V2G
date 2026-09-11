import type { NodeType } from "@brain/shared";
import type { PlaceId } from "./regionLayout.js";

/**
 * Real pixel-art tiles, replacing the flat-rectangle/emoji placeholder art. Sourced from
 * Kenney's "Tiny Town" and "Tiny Dungeon" packs (CC0/public domain — kenney.nl, mirrored at
 * github.com/shorepine/kenney; see packages/web/public/CREDITS.md) — never from the Pokémon
 * reference repos named in the brief, whose tile/sprite graphics are Nintendo's copyrighted
 * assets (architecture-only reference, not asset reuse). `tiles.png` is a hand-curated 5x5
 * atlas (25 frames, 16x16 source tiles) assembled from those packs — see
 * docs/overworld/roadmap.md's tileset entry for the exact source-tile index of every frame.
 */
export const TILE_ATLAS_KEY = "overworld-tiles";
export const TILE_ATLAS_URL = "/overworld/tiles.png";
/** Source tile resolution in the atlas — scaled up to TILE_SIZE (ExteriorScene.ts) at render time. */
export const ATLAS_TILE_PX = 16;

export const TileFrame = {
  grassA: 0,
  grassB: 1,
  grassFlowers: 2,
  path: 3,
  grassZone: 4,
  wallTan: 5,
  wallTanLeft: 6,
  doorTan: 7,
  wallTanRight: 8,
  wallBlue: 9,
  wallBlueLeft: 10,
  doorBlue: 11,
  wallBlueRight: 12,
  signpost: 13,
  player: 14,
  soumayaMarker: 15,
  creaturePerson: 16,
  creatureProject: 17,
  creatureDecision: 18,
  creatureCompany: 19,
  creatureMeeting: 20,
  creatureDaily: 21,
  creatureKnowledge: 22,
  creatureConcept: 23,
  creatureOther: 24,
  // One attendant NPC per door-building (Stage 2.8 — "NPCs autonomous per their job").
  attendantBank: 25,
  attendantLibrary: 26,
  attendantSanctuary: 27,
  attendantPostOffice: 28,
  attendantObservatory: 29,
  attendantGym: 30,
  attendantTownHall: 31,
  attendantHangar: 32,
  // A real roof line, not a flat wall repeated to the top of the footprint — Kenney's own
  // pre-made gable tiles (real user feedback: buildings shouldn't look hand-assembled).
  roofTan: 33,
  roofBlue: 34,
} as const;

/** One wall/door/roof "family" — a building's footprint always draws from a single family so
 *  its door and roof line up seamlessly with its own walls (ExteriorScene.ts's renderer). */
export interface WallFamily {
  wall: number;
  wallLeft: number;
  door: number;
  wallRight: number;
  roof: number;
}

const TAN_FAMILY: WallFamily = {
  wall: TileFrame.wallTan,
  wallLeft: TileFrame.wallTanLeft,
  door: TileFrame.doorTan,
  wallRight: TileFrame.wallTanRight,
  roof: TileFrame.roofTan,
};
const BLUE_FAMILY: WallFamily = {
  wall: TileFrame.wallBlue,
  wallLeft: TileFrame.wallBlueLeft,
  door: TileFrame.doorBlue,
  wallRight: TileFrame.wallBlueRight,
  roof: TileFrame.roofBlue,
};

/** Alternates building material so the 8 buildings aren't all identical — purely decorative,
 *  never the only cue for a building's identity (each also keeps its glyph + label overlay). */
export function wallFamilyForIndex(index: number): WallFamily {
  return index % 2 === 0 ? TAN_FAMILY : BLUE_FAMILY;
}

/**
 * Which tile a building footprint should draw at (x, y), given where its door actually is.
 * Door-facing buildings can have the door on either the footprint's top or bottom row
 * (north-row buildings face south/down, so their door is on the bottom row; south-row
 * buildings face north/up, so theirs is on the top row — regionLayout.ts's DOOR_PLACES) —
 * this must key off the door's real row, not always assume "bottom", or the row that
 * actually has no door gets treated as the door row (wrong wallLeft/wallRight tiles next to
 * a door that isn't there) while the real door row gets a plain wall instead of the tile
 * that's actually designed to sit next to the doorway. The other row is always the roofline.
 */
export function buildingTileFrame(
  family: WallFamily,
  tile: { x: number; y: number },
  door: { x: number; y: number },
  footprint: { x0: number; x1: number },
): number {
  if (tile.x === door.x && tile.y === door.y) return family.door;
  if (tile.y !== door.y) return family.roof;
  if (tile.x === footprint.x0) return family.wallLeft;
  if (tile.x === footprint.x1) return family.wallRight;
  return family.wall;
}

/** Standalone object tiles (Bulletin Board / Soumaya) each get a distinct sprite; any future
 *  object id not yet given art falls back to the generic signpost (tolerate-unsorted-gracefully). */
export function objectFrameForPlace(id: PlaceId): number {
  if (id === "soumaya") return TileFrame.soumayaMarker;
  return TileFrame.signpost;
}

/** One attendant NPC per door-building — purely decorative variety, not a role simulation;
 *  any future door-place without dedicated art falls back to the same sprite as the player
 *  (tolerate-unsorted-gracefully, same convention as every other fallback in this module). */
const ATTENDANT_FRAME_BY_PLACE: Partial<Record<PlaceId, number>> = {
  bank: TileFrame.attendantBank,
  library: TileFrame.attendantLibrary,
  sanctuary: TileFrame.attendantSanctuary,
  postOffice: TileFrame.attendantPostOffice,
  observatory: TileFrame.attendantObservatory,
  gym: TileFrame.attendantGym,
  townHall: TileFrame.attendantTownHall,
  hangar: TileFrame.attendantHangar,
};

export function attendantFrameForPlace(id: PlaceId): number {
  return ATTENDANT_FRAME_BY_PLACE[id] ?? TileFrame.player;
}

/** A brief "doing their job" icon each attendant flashes above themselves while pacing —
 *  real user feedback: NPCs should "do work... pertaining to their field", not just walk back
 *  and forth. Purely decorative flavor (no simulation), one per building's actual function.
 *  A future door-place with no mapped work falls back to a plain work tool, never nothing. */
const WORK_ICON_BY_PLACE: Partial<Record<PlaceId, string>> = {
  bank: "💰",
  library: "📖",
  sanctuary: "🧘",
  postOffice: "✉️",
  observatory: "🔭",
  gym: "🏋️",
  townHall: "📜",
  hangar: "🔧",
};

export function workIconForPlace(id: PlaceId): string {
  return WORK_ICON_BY_PLACE[id] ?? "🔧";
}

/** One creature sprite per NodeType, for visual variety — a memory's rarity is already read
 *  from its badge/dim state, not from which of these it draws, so this mapping is decorative
 *  flavor only. Falls back to the generic "other" creature for any unmapped/future type. */
const CREATURE_FRAME_BY_TYPE: Partial<Record<NodeType, number>> = {
  person: TileFrame.creaturePerson,
  project: TileFrame.creatureProject,
  decision: TileFrame.creatureDecision,
  company: TileFrame.creatureCompany,
  meeting: TileFrame.creatureMeeting,
  daily: TileFrame.creatureDaily,
  knowledge: TileFrame.creatureKnowledge,
  concept: TileFrame.creatureConcept,
  other: TileFrame.creatureOther,
};

export function creatureFrameForType(type: NodeType): number {
  return CREATURE_FRAME_BY_TYPE[type] ?? TileFrame.creatureOther;
}

/** Deterministic pure hash (no Math.random/Date) so ground texture variety never jitters
 *  between re-renders — same tile, same look every time (placement.ts's own convention). */
function hash32(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return h >>> 0;
}

/** Grass ground varies between two plain tiles, with an occasional flower tile for texture. */
export function grassFrameFor(x: number, y: number): number {
  const roll = hash32(x, y) % 10;
  if (roll === 0) return TileFrame.grassFlowers;
  return roll % 2 === 0 ? TileFrame.grassA : TileFrame.grassB;
}

/** Idle-bob "breathing" cycle length for every creature — one shared constant so
 *  `idleBobDelayMs` below has a real period to desync within (ExteriorScene.ts). */
export const IDLE_BOB_PERIOD_MS = 900;

/** Per-creature phase offset (deterministic, same node id -> same offset every render) so a
 *  town full of creatures doesn't bob in unison — a small "the world is alive" touch, not a
 *  gameplay signal, so it's fine that it's decorative-only and skipped under reduced motion. */
export function idleBobDelayMs(nodeId: number): number {
  return hash32(nodeId, 0) % IDLE_BOB_PERIOD_MS;
}
