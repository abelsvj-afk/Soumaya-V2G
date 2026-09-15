import { describe, it, expect, beforeEach } from "vitest";
import { bumpStat, statsSpaceId, ACHIEVEMENTS } from "./achievements.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

describe("bumpStat (2026-09-15 audit fix — the write half of the achievements' own stat reads)", () => {
  it("starts a real counter at 1 on the first bump", () => {
    bumpStat(SPACE, "beacons_deployed");
    expect(localStorage.getItem(`stat.beacons_deployed.${SPACE}`)).toBe("1");
  });

  it("accumulates across real, separate bumps", () => {
    bumpStat(SPACE, "travel_hops");
    bumpStat(SPACE, "travel_hops");
    bumpStat(SPACE, "travel_hops");
    expect(localStorage.getItem(`stat.travel_hops.${SPACE}`)).toBe("3");
  });

  it("supports bumping by more than 1", () => {
    bumpStat(SPACE, "commissions", 5);
    expect(localStorage.getItem(`stat.commissions.${SPACE}`)).toBe("5");
  });

  it("keeps different stat names and different spaces fully isolated", () => {
    bumpStat(SPACE, "memories_tended");
    expect(localStorage.getItem(`stat.beacons_deployed.${SPACE}`)).toBeNull();
    expect(localStorage.getItem(`stat.memories_tended.other-space`)).toBeNull();
  });

  it("writes to the exact bucket the matching achievement's own test reads from", () => {
    for (let i = 0; i < 5; i++) bumpStat(SPACE, "beacons_deployed");
    const sentinelCommand = ACHIEVEMENTS.find((a) => a.id === "sentinel_command")!;
    localStorage.setItem("brain.spaceId", SPACE);
    expect(statsSpaceId()).toBe(SPACE);
    expect(sentinelCommand.test({ memories: [], links: 0, fuel: null })).toBe(true);
  });
});

describe("galaxy_reader (2026-09-15 audit fix — computed directly from the real graph, no separate stat)", () => {
  it("unlocks once memories span 6+ distinct real types, same pattern sector_pioneer uses", () => {
    const galaxyReader = ACHIEVEMENTS.find((a) => a.id === "galaxy_reader")!;
    const memories = ["a", "b", "c", "d", "e", "f"].map((type, id) => ({
      id,
      label: `n${id}`,
      type,
      content: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    })) as never[];
    expect(galaxyReader.test({ memories, links: 0, fuel: null })).toBe(true);
    expect(galaxyReader.test({ memories: memories.slice(0, 5), links: 0, fuel: null })).toBe(false);
  });
});
