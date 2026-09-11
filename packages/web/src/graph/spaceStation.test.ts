import { describe, expect, it } from "vitest";
import { shouldHideStationModel, STATION_LOD_FAR, STATION_LOD_HYST } from "./spaceStation.js";

/**
 * Distance-gated fidelity for the station's heavy glTF (perf experiment targeting the
 * largest single decorative asset in the app). Only the pure hysteresis gate is tested
 * here — same approach sun.test.ts already uses for neutralizeSunMaterial — so this
 * covers the threshold/band arithmetic without touching GLTFLoader or the DOM.
 */
describe("shouldHideStationModel", () => {
  it("stays visible (not hidden) well inside the far distance", () => {
    expect(shouldHideStationModel(0, false)).toBe(false);
    expect(shouldHideStationModel(STATION_LOD_FAR - STATION_LOD_HYST - 1, false)).toBe(false);
  });

  it("hides well beyond the far distance", () => {
    expect(shouldHideStationModel(STATION_LOD_FAR + STATION_LOD_HYST + 1, false)).toBe(true);
  });

  it("does not flip-flop inside the hysteresis band once hidden", () => {
    // Just inside the "stay hidden" side of the band — was hidden, still within
    // STATION_LOD_FAR - STATION_LOD_HYST of the far edge, so it should remain hidden.
    const dist = STATION_LOD_FAR - STATION_LOD_HYST + 1;
    expect(shouldHideStationModel(dist, true)).toBe(true);
  });

  it("does not flip-flop inside the hysteresis band once visible", () => {
    // Just inside the "stay visible" side of the band — was visible, still within
    // STATION_LOD_FAR + STATION_LOD_HYST, so it should remain visible.
    const dist = STATION_LOD_FAR + STATION_LOD_HYST - 1;
    expect(shouldHideStationModel(dist, false)).toBe(false);
  });

  it("transitions from visible to hidden only once clearing the far+hyst edge", () => {
    expect(shouldHideStationModel(STATION_LOD_FAR + STATION_LOD_HYST - 1, false)).toBe(false);
    expect(shouldHideStationModel(STATION_LOD_FAR + STATION_LOD_HYST + 1, false)).toBe(true);
  });

  it("transitions from hidden to visible only once crossing back inside the far-hyst edge", () => {
    expect(shouldHideStationModel(STATION_LOD_FAR - STATION_LOD_HYST + 1, true)).toBe(true);
    expect(shouldHideStationModel(STATION_LOD_FAR - STATION_LOD_HYST - 1, true)).toBe(false);
  });
});
