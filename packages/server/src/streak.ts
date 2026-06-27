import type { Streak } from "@brain/shared";
import type { DbHandle } from "./db/client.js";
import { DEFAULT_SPACE } from "./db/schema.js";

/**
 * Daily-tending streak: how many consecutive days a brain has been fed a memory.
 * Stored in `space_meta` alongside fuel (one row per brain). Server-authoritative
 * so the count is consistent across devices. A small fuel bonus is awarded the
 * first time each day to reward showing up (the caller credits it via EconomyRepo).
 * Fully space-scoped; offline-safe (pure SQLite, no LLM).
 */

/** Flat fuel bonus the first time a brain is tended on a new day. */
export const STREAK_DAY_BONUS = 2;

/** UTC day string (YYYY-MM-DD), optionally offset by whole days. */
function dayStr(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

interface MetaRow {
  streak: number;
  streak_best: number;
  last_active_date: string | null;
}

export class StreakRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  /** Lazily create this brain's meta row (shares the fuel row's defaults). */
  private ensure(): void {
    this.h.sqlite
      .prepare(`INSERT OR IGNORE INTO space_meta (space_id) VALUES (?)`)
      .run(this.spaceId);
  }

  private row(): MetaRow {
    this.ensure();
    const r = this.h.sqlite
      .prepare(`SELECT streak, streak_best, last_active_date FROM space_meta WHERE space_id = ?`)
      .get(this.spaceId) as MetaRow | undefined;
    return r ?? { streak: 0, streak_best: 0, last_active_date: null };
  }

  /** Effective current streak: alive only if tended today or yesterday, else 0. */
  get(): Streak {
    const r = this.row();
    const today = dayStr();
    const alive = r.last_active_date === today || r.last_active_date === dayStr(-1);
    return {
      current: alive ? r.streak : 0,
      best: r.streak_best ?? 0,
      today: r.last_active_date === today,
    };
  }

  /**
   * Record a tending today. Advances the streak on a new day (continuing if the
   * last active day was yesterday, otherwise restarting at 1); same-day repeats
   * are a no-op. `advanced` is true only when a new day was counted, so the
   * caller awards the daily fuel bonus exactly once per day.
   */
  touch(): { streak: Streak; advanced: boolean } {
    const r = this.row();
    const today = dayStr();
    if (r.last_active_date === today) {
      return { streak: this.get(), advanced: false }; // already counted today
    }
    const current = r.last_active_date === dayStr(-1) ? r.streak + 1 : 1;
    const best = Math.max(r.streak_best ?? 0, current);
    this.h.sqlite
      .prepare(
        `UPDATE space_meta SET streak = ?, streak_best = ?, last_active_date = ? WHERE space_id = ?`,
      )
      .run(current, best, today, this.spaceId);
    return { streak: { current, best, today: true }, advanced: true };
  }
}
