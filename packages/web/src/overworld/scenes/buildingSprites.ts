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
  // Town Economy round (npc-economy.md) — Market reuses the arched hall (a real marketplace
  // silhouette in the sourced pack); Park falls through to the COTTAGE default below, same as
  // every other unmapped place — no new art was invented for it.
  market: ARCHED_HALL,
  // Mayor's Hall (mayors-hall.md, task #63) — reuses the same civic-banner illustration Town
  // Hall/Gym already use; no new art was invented for it either. The building actually reads
  // as "the biggest" via its footprint (4x any other), not a distinct silhouette.
  mayorsHall: FLAG_TOWER,
};

export function buildingSpriteForPlace(id: PlaceId): BuildingSprite {
  return BUILDING_SPRITE_BY_PLACE[id] ?? COTTAGE;
}

/** Housing (docs/overworld/housing.md, task #66) — every player-built home reuses this same
 *  real house illustration regardless of type (cottage/duplex/house/apartment), scaled to its
 *  own footprint; the 4 types stay tellable apart by footprint size plus a type-glyph badge
 *  (ExteriorScene.ts), never by a distinct silhouette. No new art was sourced for this round
 *  (task #74 covers real asset sourcing). */
export function homeBuildingSprite(): BuildingSprite {
  return COTTAGE;
}

/** A real multi-business economy (docs/overworld/business.md, task #67) — every player-built
 *  business reuses the same "marketplace" illustration Market itself already uses (ARCHED_HALL),
 *  scaled to its own footprint; the 3 types stay tellable apart by footprint size plus a
 *  type-glyph badge (ExteriorScene.ts), same convention as `homeBuildingSprite`. No new art was
 *  sourced for this round (task #74 covers real asset sourcing). */
export function businessBuildingSprite(): BuildingSprite {
  return ARCHED_HALL;
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
