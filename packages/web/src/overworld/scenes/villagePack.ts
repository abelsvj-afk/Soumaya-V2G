/**
 * Kenney "RTS Pack: Medieval" (CC0, kenney.nl/assets/medieval-rts) — a real village/road/terrain
 * tile pack, same trusted aggregator and same author (Kenney) as every other tile/building
 * illustration already in this game. Loaded as standalone textures (like buildingSprites.ts),
 * not merged into tileAtlas.ts's own 16x16 grid (a different pixel size, 64x64).
 *
 * city-builder-depth.md §C — a business's own parking-lot/loading apron, painted just outside
 * its door. Only this one piece is wired into the game so far; the rest of the pack (road
 * curves, windmill, market stall, bench, well, trees, berries, crates) is staged for future
 * decor rounds — see public/CREDITS.md for the full inventory and why the road tiles specifically
 * are NOT used for the zoned "transit" road surface (a real geometry mismatch, documented there).
 */
export interface VillageSprite {
  key: string;
  url: string;
}

export const GRAVEL_APRON: VillageSprite = {
  key: "village-gravel-apron",
  url: "/overworld/village-pack/tile/medievalTile_15.png",
};

export function allVillageSprites(): readonly VillageSprite[] {
  return [GRAVEL_APRON];
}
