import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinGoal } from "@brain/shared";

/**
 * Owns all SQL for `fin_goal`. A Goal's current amount is never a column on this table — it's
 * always SUM(fin_allocation.amount_cents), computed in finance/wealth.ts from
 * FinAllocationRepo — so the ledger can never drift from the number it backs.
 */
export class FinGoalRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinGoal {
    return {
      id: r.id, bucketId: r.bucket_id, name: r.name,
      targetCents: r.target_cents ?? null, targetDate: r.target_date ?? null,
      archived: r.archived === 1, createdAt: r.created_at,
      visionNodeId: r.vision_node_id ?? null,
    };
  }

  create(input: { bucketId: number; name: string; targetCents?: number | null; targetDate?: string | null; visionNodeId?: number | null }): FinGoal {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_goal (space_id, bucket_id, name, target_cents, target_date, vision_node_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(this.spaceId, input.bucketId, input.name, input.targetCents ?? null, input.targetDate ?? null, input.visionNodeId ?? null);
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): FinGoal | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_goal WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  /** All non-archived goals in a space, optionally narrowed to one bucket or one Vision. */
  list(opts: { includeArchived?: boolean; bucketId?: number; visionNodeId?: number } = {}): FinGoal[] {
    const clauses = ["space_id = ?"];
    const params: unknown[] = [this.spaceId];
    if (!opts.includeArchived) clauses.push("archived = 0");
    if (opts.bucketId != null) {
      clauses.push("bucket_id = ?");
      params.push(opts.bucketId);
    }
    if (opts.visionNodeId != null) {
      clauses.push("vision_node_id = ?");
      params.push(opts.visionNodeId);
    }
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_goal WHERE ${clauses.join(" AND ")} ORDER BY name`)
      .all(...params) as any[];
    return rows.map((r) => this.map(r));
  }

  /**
   * `visionNodeId` uses a three-way patch convention (undefined = leave as-is, null =
   * unlink, a number = link) since `undefined` and `null` are both meaningful here —
   * unlike `name`/`targetCents`/`targetDate`, which never need an explicit "clear" via
   * this same param shape today.
   */
  update(id: number, patch: { name?: string; targetCents?: number | null; targetDate?: string | null; visionNodeId?: number | null }): FinGoal | null {
    const cur = this.get(id);
    if (!cur) return null;
    const n = { ...cur, ...patch };
    this.handle.sqlite
      .prepare(`UPDATE fin_goal SET name = ?, target_cents = ?, target_date = ?, vision_node_id = ? WHERE id = ? AND space_id = ?`)
      .run(n.name, n.targetCents ?? null, n.targetDate ?? null, n.visionNodeId ?? null, id, this.spaceId);
    return this.get(id);
  }

  archive(id: number): boolean {
    return this.handle.sqlite.prepare(`UPDATE fin_goal SET archived = 1 WHERE id = ? AND space_id = ?`).run(id, this.spaceId).changes > 0;
  }
}
