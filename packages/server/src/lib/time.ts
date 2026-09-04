/**
 * Canonical deterministic time helpers (docs/specs/temporal-contextual-reasoning.md).
 *
 * This repo's own audit found the exact same "naive SQLite timestamp vs. already-zoned ISO
 * string" tolerant-parse idiom (`str.includes("Z") ? str : str.replace(" ", "T") + "Z"`)
 * copy-pasted independently in 15+ server files (foresight.ts, review.ts, timeline.ts,
 * persona/behavior.ts, persona/derive.ts, lore/engine.ts, llm/prompts.ts, and most of
 * agent/tools/*.ts) with no shared utility — mirroring the web's own
 * `packages/web/src/utils/dueReminders.ts`, which was created for exactly this reason after
 * the same drift happened client-side. This file is the server-side equivalent: ONE canonical
 * parser for new code to use, so a temporal-reasoning layer spanning every domain in this app
 * doesn't add a 16th copy. It deliberately does NOT retroactively migrate the existing 15 call
 * sites — that's a larger, unrelated refactor out of scope for this feature.
 *
 * SQLite's own `CURRENT_TIMESTAMP` default renders as `"YYYY-MM-DD HH:MM:SS"` (space-separated,
 * UTC, no zone marker) for every `created_at`/`updated_at` column in this schema. App-written
 * business dates (`date`, `due_date`, `anchor_date`, `as_of`, `target_date`, `occurred_at`,
 * `remind_at`) are usually a bare `YYYY-MM-DD` or a full `Date.toISOString()` string. All three
 * shapes must parse to the same correct UTC instant.
 */

/** Parse any of this app's stored timestamp/date shapes to a UTC epoch ms. Returns `NaN` for
 *  empty/unparseable input — callers must check with `Number.isFinite` before using it, never
 *  silently coerce `NaN` into "now" or "epoch zero". */
export function parseTolerantMs(raw: string | null | undefined): number {
  if (!raw) return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const isZoned = trimmed.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(trimmed);
  const iso = isZoned ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

/** The plain `YYYY-MM-DD` UTC calendar date for a timestamp — for grouping/comparison against
 *  the app's bare-date business fields, never for display (no locale/timezone formatting). */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole UTC calendar days between two instants (positive when `laterMs` is after `earlierMs`).
 *  Truncates toward zero on a partial day — "2 days ago" means at least 48h have elapsed, not
 *  "sometime after midnight two calendar dates back". */
export function daysBetween(earlierMs: number, laterMs: number): number {
  return Math.floor((laterMs - earlierMs) / 86_400_000);
}

/** `daysBetween` from a stored date/timestamp string to `now` — the single most common shape
 *  every classifier in analysis/temporal.ts needs. Returns `null` (not `NaN`) when `raw` doesn't
 *  parse, so callers can treat "no date at all" as a distinct, explicit case rather than a
 *  silently-wrong number. */
export function daysSince(raw: string | null | undefined, nowMs: number): number | null {
  const ms = parseTolerantMs(raw);
  return Number.isFinite(ms) ? daysBetween(ms, nowMs) : null;
}

/** `daysBetween` from `now` to a future stored date/timestamp — negative when it's already
 *  past. Returns `null` when `raw` doesn't parse. */
export function daysUntil(raw: string | null | undefined, nowMs: number): number | null {
  const ms = parseTolerantMs(raw);
  return Number.isFinite(ms) ? daysBetween(nowMs, ms) : null;
}
