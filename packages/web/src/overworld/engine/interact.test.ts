import { describe, it, expect } from "vitest";
import { tileInFront } from "./interact.js";

describe("tileInFront", () => {
  it.each([
    ["up", { x: 5, y: 4 }],
    ["down", { x: 5, y: 6 }],
    ["left", { x: 4, y: 5 }],
    ["right", { x: 6, y: 5 }],
  ] as const)("resolves %s correctly", (facing, expected) => {
    expect(tileInFront({ x: 5, y: 5 }, facing)).toEqual(expected);
  });
});
