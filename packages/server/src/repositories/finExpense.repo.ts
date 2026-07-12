import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinExpense, ExpenseDirection } from "@brain/shared";

/** Owns all SQL for `fin_expense`. Space-scoped; money in INTEGER cents. */
export class FinExpenseRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinExpense {
    return {
      id: r.id, sourceId: r.source_id ?? null, date: r.date, amountCents: r.amount_cents,
      merchant: r.merchant ?? null, category: r.category, direction: r.direction as ExpenseDirection,
      confidence: r.confidence ?? null, createdAt: r.created_at,
    };
  }

  create(input: {
    date: string; amountCents: number; category: string; direction?: ExpenseDirection;
    merchant?: string | null; sourceId?: number | null; confidence?: number | null;
  }): FinExpense {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_expense (space_id, source_id, date, amount_cents, merchant, category, direction, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        this.spaceId, input.sourceId ?? null, input.date.slice(0, 10), Math.round(input.amountCents),
        input.merchant ?? null, input.category, input.direction ?? "out", input.confidence ?? null,
      );
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): FinExpense | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_expense WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  list(limit = 200): FinExpense[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_expense WHERE space_id = ? ORDER BY date DESC, id DESC LIMIT ?`)
      .all(this.spaceId, limit) as any[];
    return rows.map((r) => this.map(r));
  }

  /** Sum of outflow amounts in [start, end] inclusive, in cents. */
  sumOutBetween(start: string, end: string): number {
    const r = this.handle.sqlite
      .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS s FROM fin_expense WHERE space_id = ? AND direction = 'out' AND date >= ? AND date <= ?`)
      .get(this.spaceId, start.slice(0, 10), end.slice(0, 10)) as { s: number };
    return r.s;
  }

  /** Likely-duplicate guard: same amount + date + merchant already present. */
  findDuplicate(date: string, amountCents: number, merchant?: string | null): FinExpense | null {
    const r = this.handle.sqlite
      .prepare(`SELECT * FROM fin_expense WHERE space_id = ? AND date = ? AND amount_cents = ? AND IFNULL(merchant,'') = ? LIMIT 1`)
      .get(this.spaceId, date.slice(0, 10), Math.round(amountCents), merchant ?? "");
    return r ? this.map(r) : null;
  }
}
