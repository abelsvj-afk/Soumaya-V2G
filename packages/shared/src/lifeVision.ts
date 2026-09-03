/**
 * Life Vision (docs/specs/life-vision.md) — the one deterministic calculation this
 * feature needs: a Vision's financial requirement, derived from its linked Financial
 * Goals. Locked in C2.1 §2 to live here (not web-only, not a new server endpoint) so
 * a future Financial Health composition can import the exact same function against
 * repo-fetched fin_goal rows, with zero risk of the formula drifting between the two
 * call sites. Pure, no I/O — the caller supplies the goals array.
 */

export interface VisionRequirement {
  /** SUM(target_cents) over active, targeted linked goals. Never persisted. */
  totalCents: number;
  /** How many linked, active goals actually contributed to totalCents. */
  countedGoals: number;
  /** Active, linked goals with no set target (target_cents IS NULL) — excluded from
   *  totalCents but still real; surfaced separately so they're never silently dropped. */
  openEndedGoals: number;
  /** false when there is nothing linked at all — distinguishes "$0 needed" from
   *  "nothing linked yet," which must never read the same way in the UI. */
  hasLinkedGoals: boolean;
}

export function visionRequirementCents(
  goals: ReadonlyArray<{ archived: boolean; targetCents?: number | null }>,
): VisionRequirement {
  let totalCents = 0;
  let countedGoals = 0;
  let openEndedGoals = 0;
  for (const g of goals) {
    if (g.archived) continue;
    if (g.targetCents == null) {
      openEndedGoals++;
      continue;
    }
    totalCents += g.targetCents;
    countedGoals++;
  }
  return { totalCents, countedGoals, openEndedGoals, hasLinkedGoals: countedGoals + openEndedGoals > 0 };
}
