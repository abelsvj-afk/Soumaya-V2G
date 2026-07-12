import type { BillFrequency } from "@brain/shared";

/**
 * Recurring-bill date math — PURE (no DB, no LLM), so it's trivially unit-tested and
 * deterministic. Given a bill's schedule, it materializes the concrete due dates in a
 * window. Dates are ISO `YYYY-MM-DD` strings in UTC. See docs/financial-os/.
 */

const DAY_MS = 86_400_000;

/** Parse `YYYY-MM-DD` (or an ISO datetime) to a UTC Date at midnight. */
export function parseDay(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return d;
}

/** Format a Date as `YYYY-MM-DD` (UTC). */
export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  return toDay(new Date(parseDay(iso).getTime() + n * DAY_MS));
}

/** Add whole months, clamping the day to the target month's length (Jan 31 → Feb 28/29). */
function addMonths(iso: string, n: number): string {
  const d = parseDay(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toDay(target);
}

export interface BillSchedule {
  frequency: BillFrequency;
  anchorDate: string; // ISO date the schedule is anchored on
  everyDays?: number; // required for "custom"
}

/** Whole-days step for the linear frequencies (weekly/biweekly/custom). */
function stepDaysOf(schedule: BillSchedule): number {
  switch (schedule.frequency) {
    case "weekly": return 7;
    case "biweekly": return 14;
    case "custom": return Math.max(1, Math.floor(schedule.everyDays ?? 30));
    default: return 0; // monthly is handled separately
  }
}

/**
 * The k-th occurrence (k ≥ 0), always computed FROM THE ORIGINAL ANCHOR so monthly bills
 * never drift after a short-month clamp (Jan 31 → Feb 28 → *Mar 31*, not Mar 28).
 */
function nth(schedule: BillSchedule, k: number): string {
  const anchor = schedule.anchorDate.slice(0, 10);
  if (schedule.frequency === "monthly") return addMonths(anchor, k);
  return addDays(anchor, k * stepDaysOf(schedule));
}

const GUARD = 20_000; // hard bound so a pathological schedule can never loop forever

/**
 * All due dates for a bill within `[from, horizon]` (inclusive), in ascending order. Each
 * occurrence is the anchor + k periods (no drift). Bounded by `horizon`, always terminates.
 */
export function occurrenceDates(schedule: BillSchedule, from: string, horizon: string): string[] {
  const out: string[] = [];
  const fromD = parseDay(from).getTime();
  const horizonD = parseDay(horizon).getTime();
  if (horizonD < fromD) return out;

  // Cheap starting estimate for the linear frequencies so a long-past anchor isn't a long walk.
  let k = 0;
  const anchorD = parseDay(schedule.anchorDate).getTime();
  if (schedule.frequency !== "monthly" && anchorD < fromD) {
    const stepMs = stepDaysOf(schedule) * DAY_MS;
    k = Math.max(0, Math.floor((fromD - anchorD) / stepMs) - 1);
  }
  // Advance to the first occurrence on/after `from`.
  let guard = 0;
  while (parseDay(nth(schedule, k)).getTime() < fromD && guard++ < GUARD) k++;
  // Collect through the horizon.
  guard = 0;
  while (guard++ < GUARD) {
    const d = nth(schedule, k);
    if (parseDay(d).getTime() > horizonD) break;
    out.push(d);
    k++;
  }
  return out;
}

/** The single next due date on/after `from` (or null if the schedule is degenerate). */
export function nextDueOnOrAfter(schedule: BillSchedule, from: string): string | null {
  const fromD = parseDay(from).getTime();
  let k = 0;
  const anchorD = parseDay(schedule.anchorDate).getTime();
  if (schedule.frequency !== "monthly" && anchorD < fromD) {
    const stepMs = stepDaysOf(schedule) * DAY_MS;
    k = Math.max(0, Math.floor((fromD - anchorD) / stepMs) - 1);
  }
  let guard = 0;
  while (parseDay(nth(schedule, k)).getTime() < fromD && guard++ < GUARD) k++;
  return guard < GUARD ? nth(schedule, k) : null;
}
