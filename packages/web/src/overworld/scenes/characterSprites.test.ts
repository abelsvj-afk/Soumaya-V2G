import { describe, it, expect } from "vitest";
import { idleFrameFor, PLAYER_WALK_SHEET, walkAnimKey } from "./characterSprites.js";

describe("characterSprites (asset-completion-pass.md, task #124)", () => {
  it("idleFrameFor returns the first frame of each direction's own row, in the measured 8-column grid", () => {
    expect(idleFrameFor("down")).toBe(0);
    expect(idleFrameFor("left")).toBe(8);
    expect(idleFrameFor("right")).toBe(16);
    expect(idleFrameFor("up")).toBe(24);
  });

  it("every idle frame index stays within the sheet's real total frame count", () => {
    const totalFrames = PLAYER_WALK_SHEET.columns * 4; // 4 measured rows
    for (const direction of ["down", "left", "right", "up"] as const) {
      expect(idleFrameFor(direction)).toBeGreaterThanOrEqual(0);
      expect(idleFrameFor(direction)).toBeLessThan(totalFrames);
    }
  });

  it("walkAnimKey is distinct per direction", () => {
    const keys = (["down", "left", "right", "up"] as const).map(walkAnimKey);
    expect(new Set(keys).size).toBe(4);
  });

  it("the measured frame grid matches the real sheet's own pixel dimensions", () => {
    // rpg_sprite_walk.png measured directly at 192x128px, 24x32 real frames (asset-completion-
    // pass.md's own verification) — this is the one place that real measurement is asserted in
    // code, so a future accidental edit to the constants can't silently drift from it.
    expect(PLAYER_WALK_SHEET.frameWidth * PLAYER_WALK_SHEET.columns).toBe(192);
    expect(PLAYER_WALK_SHEET.frameHeight * 4).toBe(128);
  });
});
