import type { Direction } from "../engine/movement.js";

/**
 * Asset completion pass (docs/overworld/asset-completion-pass.md, task #124) — a real, CC0
 * top-down walk-cycle spritesheet for the player (OpenGameArt "2D RPG character walk
 * spritesheet" — see public/CREDITS.md). Loaded as its own standalone texture, same convention
 * as buildingSprites.ts/villagePack.ts (outside tileAtlas.ts's uniform 16x16 grid).
 *
 * The 192x128px sheet's real frame grid was MEASURED directly (a Python/PIL pixel-content-
 * boundary scan across columns/rows, not guessed): 8 columns x 4 rows of 24x32px frames — one
 * row per facing direction.
 *
 * Task #127 — WHICH row is which direction is now MEASURED too, not assumed. Task #124 shipped
 * the common RPG-Maker order (down, left, right, up) as an explicitly documented guess; real
 * on-device feedback ("my npc doesnt face the correct direction when walking") proved it wrong,
 * and three of the four directions were. The real order was established two independent ways
 * against the actual pixels: (a) rows 2 and 3 are a PIXEL-PERFECT horizontal mirror pair (diff
 * of exactly 0 across all 8 columns), which is only true of the left/right pair, so rows 0 and 1
 * must be the vertical pair; (b) per-row skin-tone pixel centroids — row 0 is symmetric with 21
 * skin pixels (a full face, so toward the camera = down), row 1 is symmetric with only 4 (the
 * back of the head = up), row 2's face sits 0.45px LEFT of its body centre and row 3's 0.45px
 * RIGHT. Confirmed by eye on an upscaled render: row 2's single visible eye is on the left, row
 * 3's on the right.
 */
export const PLAYER_WALK_SHEET = {
  key: "player-walk",
  url: "/overworld/characters/player-walk.png",
  frameWidth: 24,
  frameHeight: 32,
  columns: 8,
} as const;

const ROW_FOR_DIRECTION: Record<Direction, number> = { down: 0, up: 1, left: 2, right: 3 };

/** The real per-tile step duration `ExteriorScene` tweens the player over. It lives here beside
 *  the sheet metadata because the walk cycle's frame rate is derived from it — the two have to
 *  agree or the legs visibly slide (task #127). */
export const PLAYER_STEP_MS = 140;

/** One full 8-frame cycle spans two real tiles, so a foot plants once per tile instead of the
 *  legs drifting out of sync with the movement. Derived, never a hand-tuned magic number: at the
 *  shipped 10fps a cycle took 800ms while a step takes 140ms, so a step advanced ~1.4 frames —
 *  the walk never read as walking even before the stop-every-frame bug below was found. */
const WALK_FRAME_RATE = Math.round((PLAYER_WALK_SHEET.columns * 1000) / (2 * PLAYER_STEP_MS));

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
      frameRate: WALK_FRAME_RATE,
      repeat: -1,
    });
  }
}
