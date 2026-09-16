import { describe, it, expect, beforeEach } from "vitest";
import { collectPassiveNpcIncome } from "./passiveNpcIncome.js";
import { allSocietyNpcIds, npcProfile } from "./npcDialogue.js";
import { markWorked } from "./buildingNeglect.js";
import { treasuryBalanceCents } from "./townLedger.js";
import { countWorkingTicks, SOCIETY_TICK_MS } from "./npcSchedule.js";

const SPACE = "test-space";
const HOUR_MS = 3_600_000;

beforeEach(() => localStorage.clear());

describe("passiveNpcIncome — population-driven passive income (simcity-realism-pass.md)", () => {
  it("credits nothing on the very first call for a fresh town — establishes a baseline, never a retroactive lump sum", () => {
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, 0);
    expect(treasuryBalanceCents(SPACE)).toBe(before);
  });

  // 100 real hours (~4.2 real days) — comfortably under the real ~9.45-day neglect threshold
  // (buildingNeglect.ts's own entropyFrom: COOLING_ENTROPY=0.45 * 21-day reach), so a single
  // markWorked at t=0 stays "not neglected" for this whole window. It DOES cross the module's
  // own real MAX_ACCRUAL_DAYS (3) cap, which every "exact amount" test below accounts for
  // directly rather than assuming an uncapped window.
  const SAFE_WORKING_WINDOW_MS = 100 * HOUR_MS;

  it("credits real cents for real elapsed time worked, once a baseline already exists", () => {
    const npcId = allSocietyNpcIds()[0]!;
    const placeId = npcProfile(npcId).placeId;
    markWorked(SPACE, placeId, 0); // not neglected for this whole test window
    collectPassiveNpcIncome(SPACE, 0); // baseline call — credits nothing
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, SAFE_WORKING_WINDOW_MS);
    expect(treasuryBalanceCents(SPACE)).toBeGreaterThan(before);
  });

  it("credits exactly the sum of every real NPC's own working-ticks-based cents at a shared building, matching countWorkingTicks directly", () => {
    // Neglect is a real per-BUILDING signal, not per-attendant (buildingNeglect.ts) — marking
    // one building worked un-neglects every real NPC stationed there (2, per
    // ATTENDANTS_PER_BUILDING), so the expected total sums both their own real contributions.
    const npcId = allSocietyNpcIds()[0]!;
    const placeId = npcProfile(npcId).placeId;
    markWorked(SPACE, placeId, 0);
    collectPassiveNpcIncome(SPACE, 0);
    const laterMs = SAFE_WORKING_WINDOW_MS;
    const sinceTick = Math.floor(0 / SOCIETY_TICK_MS);
    const toTick = Math.floor(laterMs / SOCIETY_TICK_MS);
    // The module's own real 3-day accrual cap (MAX_ACCRUAL_DAYS) — this window intentionally
    // exceeds it, so the expected math must account for the cap directly rather than assume an
    // uncapped range from `sinceTick`.
    const maxAccrualTicks = Math.floor((3 * 86_400_000) / SOCIETY_TICK_MS);
    const fromTick = Math.max(sinceTick, toTick - maxAccrualTicks);
    const sameBuildingNpcIds = allSocietyNpcIds().filter((id) => npcProfile(id).placeId === placeId);
    expect(sameBuildingNpcIds.length).toBe(2); // ATTENDANTS_PER_BUILDING — sanity-check the premise
    const expectedCents = sameBuildingNpcIds.reduce((sum, id) => {
      const workingTicks = countWorkingTicks(id, fromTick, toTick);
      return sum + Math.floor(workingTicks / (HOUR_MS / SOCIETY_TICK_MS));
    }, 0);
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, laterMs);
    expect(treasuryBalanceCents(SPACE) - before).toBe(expectedCents);
  });

  it("credits nothing for an NPC whose own building is currently neglected — never worked = maximally neglected", () => {
    // Deliberately never call markWorked for anyone — every society NPC's building starts
    // maximally neglected (buildingNeglect.ts's own established convention).
    collectPassiveNpcIncome(SPACE, 0); // baseline
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, 500 * HOUR_MS);
    expect(treasuryBalanceCents(SPACE)).toBe(before);
  });

  it("a neglected stretch is never banked for later — un-neglecting doesn't pay out the skipped time retroactively", () => {
    const npcId = allSocietyNpcIds()[0]!;
    const placeId = npcProfile(npcId).placeId;
    collectPassiveNpcIncome(SPACE, 0); // baseline, neglected (never worked)
    collectPassiveNpcIncome(SPACE, 500 * HOUR_MS); // still neglected — credits nothing, but the stamp still advances
    const balanceBeforeUnneglect = treasuryBalanceCents(SPACE);
    markWorked(SPACE, placeId, 500 * HOUR_MS); // un-neglects starting now
    collectPassiveNpcIncome(SPACE, 500 * HOUR_MS + 1); // essentially zero new elapsed time since un-neglecting
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeUnneglect); // no retroactive payout for the 500 skipped hours
  });

  it("stacks independently across multiple real buildings — more worked buildings credits more", () => {
    // ids[0..2] span 2 real buildings (2 attendants per building) — marking all 3 worked marks
    // 2 buildings not-neglected, crediting every real NPC stationed at either of them.
    const ids = allSocietyNpcIds().slice(0, 3);
    for (const id of ids) markWorked(SPACE, npcProfile(id).placeId, 0);
    collectPassiveNpcIncome(SPACE, 0);
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, SAFE_WORKING_WINDOW_MS);
    const total = treasuryBalanceCents(SPACE) - before;

    // Compare against marking only ids[0]'s own real building worked (1 building, its own 2
    // attendants) — the combined 2-building total must be strictly greater.
    const soloSpace = "solo-space";
    markWorked(soloSpace, npcProfile(ids[0]!).placeId, 0);
    collectPassiveNpcIncome(soloSpace, 0);
    const soloBefore = treasuryBalanceCents(soloSpace);
    collectPassiveNpcIncome(soloSpace, SAFE_WORKING_WINDOW_MS);
    const soloTotal = treasuryBalanceCents(soloSpace) - soloBefore;
    expect(total).toBeGreaterThan(soloTotal);
  });
});
