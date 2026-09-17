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
    // Task #128 — in a brand-new town NO building is neglected any more (neglect now measures
    // from the town's founding, not from the epoch), so every society NPC contributes, not just
    // the two stationed at the one building this test marks worked.
    const earningNpcIds = allSocietyNpcIds();
    expect(allSocietyNpcIds().filter((id) => npcProfile(id).placeId === placeId).length).toBe(2); // ATTENDANTS_PER_BUILDING
    const expectedCents = earningNpcIds.reduce((sum, id) => {
      const workingTicks = countWorkingTicks(id, fromTick, toTick);
      return sum + Math.floor(workingTicks / (HOUR_MS / SOCIETY_TICK_MS));
    }, 0);
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, laterMs);
    expect(treasuryBalanceCents(SPACE) - before).toBe(expectedCents);
  });

  it("task #128 — a BRAND NEW town earns real NPC income immediately, without visiting anything first", () => {
    // The inversion of what this file used to assert. Nothing is ever marked worked here: a fresh
    // town is simply not neglected yet, so its NPCs are taxed from the start. Previously this
    // credited exactly zero forever, which is why real players reported "money is not being made".
    collectPassiveNpcIncome(SPACE, 0); // baseline
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, SAFE_WORKING_WINDOW_MS);
    expect(treasuryBalanceCents(SPACE)).toBeGreaterThan(before);
  });

  it("credits nothing for an NPC whose own building has genuinely gone neglected", () => {
    // The real invariant the old test was reaching for, now expressed against real elapsed time:
    // let the town age far past the neglect threshold with nothing ever worked.
    collectPassiveNpcIncome(SPACE, 0); // baseline, and stamps the town's founding at 0
    const longAfter = 400 * 24 * HOUR_MS; // ~400 real days, well past COOLING_ENTROPY's reach
    collectPassiveNpcIncome(SPACE, longAfter); // advances stamps; everything is neglected by now
    const before = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, longAfter + 500 * HOUR_MS);
    expect(treasuryBalanceCents(SPACE)).toBe(before);
  });

  it("a neglected stretch is never banked for later — un-neglecting doesn't pay out the skipped time retroactively", () => {
    const npcId = allSocietyNpcIds()[0]!;
    const placeId = npcProfile(npcId).placeId;
    // Age the town well past the neglect threshold first (task #128 — a NEW town is no longer
    // neglected, so the skipped stretch this test is about has to be a genuinely aged one).
    const aged = 400 * 24 * HOUR_MS;
    collectPassiveNpcIncome(SPACE, 0); // stamps founding at 0
    collectPassiveNpcIncome(SPACE, aged); // everything neglected by now; stamps advance
    const balanceBeforeUnneglect = treasuryBalanceCents(SPACE);
    markWorked(SPACE, placeId, aged); // un-neglects that one building starting now
    collectPassiveNpcIncome(SPACE, aged + 1); // essentially zero new elapsed time since un-neglecting
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeUnneglect); // no retroactive payout
  });

  it("a worked building keeps earning while an untouched one stops — neglect still gates income", () => {
    // Task #128 rewrote this test's original premise (it used to compare 2 worked buildings vs 1,
    // which no longer differentiates now that a fresh town's buildings all earn). The real
    // invariant is the one that still matters: keeping a building worked beats letting it rot.
    const npcId = allSocietyNpcIds()[0]!;
    const placeId = npcProfile(npcId).placeId;
    const aged = 400 * 24 * HOUR_MS;

    // Space A: one building kept genuinely current right up to the measurement window.
    collectPassiveNpcIncome(SPACE, 0);
    markWorked(SPACE, placeId, aged);
    collectPassiveNpcIncome(SPACE, aged);
    const beforeA = treasuryBalanceCents(SPACE);
    collectPassiveNpcIncome(SPACE, aged + SAFE_WORKING_WINDOW_MS);
    const tendedTotal = treasuryBalanceCents(SPACE) - beforeA;

    // Space B: identical ageing, nothing ever worked.
    const rotted = "rotted-space";
    collectPassiveNpcIncome(rotted, 0);
    collectPassiveNpcIncome(rotted, aged);
    const beforeB = treasuryBalanceCents(rotted);
    collectPassiveNpcIncome(rotted, aged + SAFE_WORKING_WINDOW_MS);
    const rottedTotal = treasuryBalanceCents(rotted) - beforeB;

    expect(tendedTotal).toBeGreaterThan(rottedTotal);
    expect(rottedTotal).toBe(0);
  });
});
