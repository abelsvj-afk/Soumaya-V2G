import { describe, it, expect } from "vitest";
import { idleFrameFor, PLAYER_STEP_MS, PLAYER_WALK_SHEET, walkAnimKey } from "./characterSprites.js";

describe("characterSprites (asset-completion-pass.md, task #124)", () => {
  it("idleFrameFor uses the MEASURED row order — down, up, left, right (task #127)", () => {
    // Task #124 shipped the RPG-Maker guess (down, left, right, up) and real on-device feedback
    // proved it wrong. The true order was established against the actual pixels: rows 2 and 3 are
    // a pixel-perfect horizontal mirror pair (so they are left/right), row 0 carries a full face
    // (21 skin pixels, symmetric = toward camera) and row 1 almost none (4 = back of the head).
    expect(idleFrameFor("down")).toBe(0);
    expect(idleFrameFor("up")).toBe(8);
    expect(idleFrameFor("left")).toBe(16);
    expect(idleFrameFor("right")).toBe(24);
  });

  it("task #127 — the walk cycle is paced to the real step duration, so the legs can't slide", () => {
    // One 8-frame cycle spans two real tiles (a foot plants once per tile). At the old hardcoded
    // 10fps a cycle took 800ms while a step takes 140ms, so a step advanced only ~1.4 frames.
    const cycleMs = (PLAYER_WALK_SHEET.columns / Math.round((PLAYER_WALK_SHEET.columns * 1000) / (2 * PLAYER_STEP_MS))) * 1000;
    expect(cycleMs).toBeGreaterThan(PLAYER_STEP_MS); // a cycle is longer than one step
    expect(cycleMs).toBeLessThan(PLAYER_STEP_MS * 3); // but not so long it never visibly advances
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
