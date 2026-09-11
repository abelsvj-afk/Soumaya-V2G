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
} as const;

/** One wall/door "family" — a building's footprint always draws from a single family so its
 *  door tile lines up seamlessly with its own walls (see ExteriorScene.ts's building renderer). */
export interface WallFamily {
  wall: number;
  wallLeft: number;
  door: number;
  wallRight: number;
}

const TAN_FAMILY: WallFamily = {
  wall: TileFrame.wallTan,
  wallLeft: TileFrame.wallTanLeft,
  door: TileFrame.doorTan,
  wallRight: TileFrame.wallTanRight,
};
const BLUE_FAMILY: WallFamily = {
  wall: TileFrame.wallBlue,
  wallLeft: TileFrame.wallBlueLeft,
  door: TileFrame.doorBlue,
  wallRight: TileFrame.wallBlueRight,
};

/** Alternates building material so the 8 buildings aren't all identical — purely decorative,
 *  never the only cue for a building's identity (each also keeps its glyph + label overlay). */
export function wallFamilyForIndex(index: number): WallFamily {
  return index % 2 === 0 ? TAN_FAMILY : BLUE_FAMILY;
}

/** Standalone object tiles (Bulletin Board / Soumaya) each get a distinct sprite; any future
 *  object id not yet given art falls back to the generic signpost (tolerate-unsorted-gracefully). */
export function objectFrameForPlace(id: PlaceId): number {
  if (id === "soumaya") return TileFrame.soumayaMarker;
  return TileFrame.signpost;
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
