import type { PlaceId } from "./regionLayout.js";

/**
 * Real, complete pre-made building illustrations — not a modular wall/door/roof kit
 * assembled from small tiles. Sourced from the "Old stone buildings" pack (Battle for
 * Wesnoth's human-city set), CC0 / public domain, via the community CC0 aggregator
 * github.com/Tiddybub/2d-assets (originally from OpenGameArt.org) — see public/CREDITS.md.
 * Each is loaded as its own standalone texture (not part of tileAtlas.ts's uniform 16x16
 * grid) and scaled to fill a building's footprint — see ExteriorScene.ts's drawGround().
 */
export interface BuildingSprite {
  key: string;
  url: string;
}

const TOWER_ROUND: BuildingSprite = { key: "building-tower-round", url: "/overworld/buildings/human-city3.png" };
const ARCHED_HALL: BuildingSprite = { key: "building-arched-hall", url: "/overworld/buildings/human-city2.png" };
const COTTAGE: BuildingSprite = { key: "building-cottage", url: "/overworld/buildings/human-city.png" };
const FLAG_TOWER: BuildingSprite = { key: "building-flag-tower", url: "/overworld/buildings/human-city4.png" };
const LIGHTHOUSE: BuildingSprite = { key: "building-lighthouse", url: "/overworld/buildings/lighthouse.png" };

/** One of 5 distinct building illustrations per door-place — some intentionally reused
 *  (only 5 buildings exist in the sourced pack for 8 places), chosen for a loose thematic
 *  fit (a tower for the Observatory, a flagged hall for Town Hall, ...). Every building still
 *  keeps its own nameplate, attendant NPC, and glyph, so a shared silhouette is never the
 *  only way to tell two buildings apart. */
const BUILDING_SPRITE_BY_PLACE: Partial<Record<PlaceId, BuildingSprite>> = {
  bank: TOWER_ROUND,
  hangar: TOWER_ROUND,
  library: ARCHED_HALL,
  sanctuary: ARCHED_HALL,
  postOffice: COTTAGE,
  observatory: LIGHTHOUSE,
  gym: FLAG_TOWER,
  townHall: FLAG_TOWER,
};

export function buildingSpriteForPlace(id: PlaceId): BuildingSprite {
  return BUILDING_SPRITE_BY_PLACE[id] ?? COTTAGE;
}

/** Every distinct sprite that actually needs preloading (deduplicated by key) — always
 *  includes the fallback, so an unmapped future door-place still has something to load. */
export function allBuildingSprites(): BuildingSprite[] {
  const byKey = new Map<string, BuildingSprite>();
  for (const sprite of Object.values(BUILDING_SPRITE_BY_PLACE)) {
    if (sprite) byKey.set(sprite.key, sprite);
  }
  byKey.set(COTTAGE.key, COTTAGE);
  return [...byKey.values()];
}
