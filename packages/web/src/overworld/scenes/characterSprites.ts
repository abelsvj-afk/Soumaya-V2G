import type { Direction } from "../engine/movement.js";

/**
 * Asset completion pass (docs/overworld/asset-completion-pass.md, task #124) — a real, CC0
 * top-down walk-cycle spritesheet for the player (OpenGameArt "2D RPG character walk
 * spritesheet" — see public/CREDITS.md). Loaded as its own standalone texture, same convention
 * as buildingSprites.ts/villagePack.ts (outside tileAtlas.ts's uniform 16x16 grid).
 *
 * The 192x128px sheet's real frame grid was MEASURED directly (a Python/PIL pixel-content-
 * boundary scan across columns/rows, not guessed): 8 columns x 4 rows of 24x32px frames — one
 * row per facing direction. WHICH row is which direction follows the common RPG-Maker-style
 * convention (down, left, right, up), since no authoritative frame-order metadata ships with the
 * file — this is a documented assumption, not a confirmed fact (this sandbox has no browser to
 * visually confirm it in). Trivially correctable (a row-index swap) if wrong on next on-device
 * look.
 */
export const PLAYER_WALK_SHEET = {
  key: "player-walk",
  url: "/overworld/characters/player-walk.png",
  frameWidth: 24,
  frameHeight: 32,
  columns: 8,
} as const;

const ROW_FOR_DIRECTION: Record<Direction, number> = { down: 0, left: 1, right: 2, up: 3 };

export function walkAnimKey(direction: Direction): string {
  return `player-walk-${direction}`;
}

/** The first frame of a direction's own row — used as the real standing pose (both on arrival
 *  after a step, and immediately on a blocked bump, so the player visibly turns to face a wall
 *  the same way every GBA-era Pokémon-style game does — a real gap that never existed before
 *  this pass, since the previous single-frame sprite never varied by facing at all). */
export function idleFrameFor(direction: Direction): number {
  return ROW_FOR_DIRECTION[direction] * PLAYER_WALK_SHEET.columns;
}

/** Registers one looping walk animation per direction — call once from `create()`, after the
 *  spritesheet has loaded. Idempotent: Phaser's own `AnimationManager.create` is a no-op if a
 *  key already exists, so a second scene `create()` (e.g. after a hot resize) never throws. */
export function createPlayerWalkAnimations(anims: Phaser.Animations.AnimationManager): void {
  for (const direction of Object.keys(ROW_FOR_DIRECTION) as Direction[]) {
    const key = walkAnimKey(direction);
    if (anims.exists(key)) continue;
    const start = ROW_FOR_DIRECTION[direction] * PLAYER_WALK_SHEET.columns;
    anims.create({
      key,
      frames: anims.generateFrameNumbers(PLAYER_WALK_SHEET.key, { start, end: start + PLAYER_WALK_SHEET.columns - 1 }),
      frameRate: 10,
      repeat: -1,
    });
  }
}
