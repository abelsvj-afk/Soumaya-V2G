import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinAllocation } from "@brain/shared";

/**
 * Owns all SQL for `fin_allocation` — the signed ledger that IS the entire allocate/de-allocate
 * model (docs/specs/wealth-goals-allocation.md §8). Positive amount = allocate, negative =
 * withdraw; there is no separate "reversal" record type. A goal's current total is always
 * SUM(amount_cents) over its rows here, computed on read — never stored elsewhere.
 */
export class FinAllocationRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinAllocation {
    return { id: r.id, goalId: r.goal_id, amountCents: r.amount_cents, note: r.note ?? null, createdAt: r.created_at };
  }

  totalForGoal(goalId: number): number {
    const row = this.handle.sqlite
      .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM fin_allocation WHERE goal_id = ? AND space_id = ?`)
      .get(goalId, this.spaceId) as { total: number };
    return row.total;
  }

  /** Totals for several goals in one query, to avoid an N+1 when listing a whole Wealth summary. */
  totalsByGoal(goalIds: number[]): Map<number, number> {
    const totals = new Map<number, number>();
    if (goalIds.length === 0) return totals;
    const placeholders = goalIds.map(() => "?").join(",");
    const rows = this.handle.sqlite
      .prepare(`SELECT goal_id, COALESCE(SUM(amount_cents), 0) AS total FROM fin_allocation WHERE space_id = ? AND goal_id IN (${placeholders}) GROUP BY goal_id`)
      .all(this.spaceId, ...goalIds) as Array<{ goal_id: number; total: number }>;
    for (const r of rows) totals.set(r.goal_id, r.total);
    return totals;
  }

  /**
   * Allocate (positive amountCents) or withdraw (negative). A withdrawal that would take the
   * goal's running total below zero is rejected (returns null) — the one guard on this table,
   * matching how every other Financial-OS write validates before committing.
   */
  create(input: { goalId: number; amountCents: number; note?: string | null }): FinAllocation | null {
    const current = this.totalForGoal(input.goalId);
    if (current + input.amountCents < 0) return null;
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_allocation (space_id, goal_id, amount_cents, note) VALUES (?, ?, ?, ?)`)
      .run(this.spaceId, input.goalId, Math.round(input.amountCents), input.note ?? null);
    return this.get(Number(info.lastInsertRowid));
  }

  get(id: number): FinAllocation | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_allocation WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  /** Full, dated history for one goal — allocations and withdrawals together, newest first. */
  list(goalId: number, limit = 200): FinAllocation[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_allocation WHERE goal_id = ? AND space_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(goalId, this.spaceId, limit) as any[];
    return rows.map((r) => this.map(r));
  }
}
