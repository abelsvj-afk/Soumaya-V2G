import { describe, it, expect, beforeEach } from "vitest";
import { checkCivicConcern, concernAnnouncementText, markConcernAnnounced } from "./civicConcern.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

describe("civicConcern — the D3-compliant townwide reframe of crime/policing (civic-concern.md)", () => {
  it("never fires when neglect is a minority — one bad building is never townwide", () => {
    const check = checkCivicConcern(SPACE, 3, 10, ["Bank", "Library", "Gym"]);
    expect(check.shouldMeet).toBe(false);
  });

  it("fires exactly at a real majority, naming the real neglected buildings", () => {
    const check = checkCivicConcern(SPACE, 6, 10, ["Bank", "Library", "Gym", "Market", "Park", "Hangar"]);
    expect(check.shouldMeet).toBe(true);
    expect(check.neglectedLabels).toEqual(["Bank", "Library", "Gym", "Market", "Park", "Hangar"]);
  });

  it("never re-announces while it stays widespread — edge-triggered, not level-triggered", () => {
    checkCivicConcern(SPACE, 6, 10, ["Bank"]);
    markConcernAnnounced(SPACE);
    const second = checkCivicConcern(SPACE, 7, 10, ["Bank", "Library"]);
    expect(second.shouldMeet).toBe(false);
  });

  it("re-arms once neglect genuinely drops back below the threshold", () => {
    checkCivicConcern(SPACE, 6, 10, ["Bank"]);
    markConcernAnnounced(SPACE);
    checkCivicConcern(SPACE, 3, 10, ["Bank"]); // drops below majority — clears the active flag
    const third = checkCivicConcern(SPACE, 6, 10, ["Bank", "Library"]);
    expect(third.shouldMeet).toBe(true);
  });

  it("exactly half is never widespread — a real majority requires more than half", () => {
    const check = checkCivicConcern(SPACE, 5, 10, []);
    expect(check.shouldMeet).toBe(false);
  });

  it("never fires with zero real buildings — no division-by-zero nonsense", () => {
    const check = checkCivicConcern(SPACE, 0, 0, []);
    expect(check.shouldMeet).toBe(false);
  });

  it("the announcement text names real buildings, never an invented crime narrative", () => {
    const text = concernAnnouncementText(["Bank", "Library", "Gym", "Market"], 10);
    expect(text).toBe("Town meeting: 4 of 10 buildings haven't had real work in a while — Bank, Library, Gym, and others.");
  });

  it("the announcement text lists all names when there are 3 or fewer, no 'and others'", () => {
    const text = concernAnnouncementText(["Bank", "Library"], 10);
    expect(text).toBe("Town meeting: 2 of 10 buildings haven't had real work in a while — Bank, Library.");
  });
});
