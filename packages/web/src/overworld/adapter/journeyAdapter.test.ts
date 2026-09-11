import { describe, it, expect } from "vitest";
import type { Journey } from "@brain/shared";
import { journeyToRegionTheme } from "./journeyAdapter.js";
import { UNCHARTED_ICON, UNCHARTED_PALETTE } from "../types.js";

function makeJourney(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 1,
    title: "Moving out",
    description: "",
    status: "active",
    progress: 0.2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("journeyToRegionTheme", () => {
  it("uses the Journey's own color/icon when set", () => {
    const theme = journeyToRegionTheme(makeJourney({ color: "#ff8800", icon: "🏠" }));
    expect(theme.paletteSeed).toBe("#ff8800");
    expect(theme.icon).toBe("🏠");
  });

  it("falls back to the neutral uncharted palette when unset — never an error", () => {
    const theme = journeyToRegionTheme(makeJourney({ color: undefined, icon: undefined }));
    expect(theme.paletteSeed).toBe(UNCHARTED_PALETTE);
    expect(theme.icon).toBe(UNCHARTED_ICON);
  });
});
