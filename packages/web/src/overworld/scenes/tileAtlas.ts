import type { NodeType } from "@brain/shared";
import type { PlaceId } from "./regionLayout.js";

/**
 * Real pixel-art tiles, replacing the flat-rectangle/emoji placeholder art. Sourced from
 * Kenney's "Tiny Town" and "Tiny Dungeon" packs (CC0/public domain — kenney.nl, mirrored at
 * github.com/shorepine/kenney; see packages/web/public/CREDITS.md) — never from the Pokémon
 * reference repos named in the brief, whose tile/sprite graphics are Nintendo's copyrighted
 * assets (architecture-only reference, not asset reuse). `tiles.png` is a hand-curated 6x6
 * atlas (36 frames, 16x16 source tiles) assembled from those packs — see
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
  // Real park decor (task #74) — 5 of the retired modular wall/door/roof kit's now-unused
  // slots (see the comment below) were repainted with real Tiny Town CC0 source tiles (indices
  // 4/5/81/45/29 in the source pack, github.com/shorepine/kenney — see CREDITS.md) instead of
  // staying blank. The single most-repeated real complaint this session ("I have no clue where
  // the hell the park is... a bunch of dirt patches... not a park") had no tree/bench art to
  // fix it with until now.
  treeA: 5,
  treeB: 6,
  bench: 7,
  fence: 8,
  mushroom: 9,
  // 10-12 and 33-34 (the remaining unused modular wall/door/roof tile kit slots) were retired
  // in favor of complete pre-made building illustrations — see buildingSprites.ts. Frame
  // indices below are unaffected (still the same numbers Phaser's spritesheet slicer assigns);
  // the retired frames simply sit unused in tiles.png rather than being renumbered.
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
} as const;

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
  // Town Economy round (npc-economy.md) — Market/Park's attendants reuse tileAtlas's own
  // player-sprite fallback (ATTENDANT_FRAME_BY_PLACE below has no dedicated art for either yet,
  // same tolerate-gracefully convention as every other unmapped place); their work icons are
  // still their own, since those cost no new art.
  market: "🛒",
  park: "🌿",
  // Mayor's Hall (mayors-hall.md, task #63) — "her security" flashes a shield, same
  // no-dedicated-attendant-sprite tolerate-gracefully convention as Market/Park's own.
  mayorsHall: "🛡️",
  // Theater (backlog #81) — an usher/programmer duo, same tolerate-gracefully convention as
  // Market/Park/Mayor's Hall's own no-dedicated-attendant-sprite fallback.
  theater: "🎭",
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
