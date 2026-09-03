import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinAssetSnapshot } from "@brain/shared";

/** Owns all SQL for `fin_asset_snapshot` — a point-in-time balance for one `fin_asset`. */
export class FinAssetSnapshotRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinAssetSnapshot {
    return { id: r.id, assetId: r.asset_id, amountCents: r.amount_cents, asOf: r.as_of, createdAt: r.created_at };
  }

  create(input: { assetId: number; amountCents: number; asOf: string }): FinAssetSnapshot {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_asset_snapshot (space_id, asset_id, amount_cents, as_of) VALUES (?, ?, ?, ?)`)
      .run(this.spaceId, input.assetId, Math.round(input.amountCents), input.asOf.slice(0, 10));
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): FinAssetSnapshot | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_asset_snapshot WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  /** All snapshots for one asset, newest first. */
  listByAsset(assetId: number, limit = 500): FinAssetSnapshot[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_asset_snapshot WHERE space_id = ? AND asset_id = ? ORDER BY as_of DESC, id DESC LIMIT ?`)
      .all(this.spaceId, assetId, limit) as any[];
    return rows.map((r) => this.map(r));
  }

  /** The most recent snapshot for an asset with `as_of <= atDate` (inclusive), or null if
   *  the asset had no snapshot yet at that point in time. The building block for a
   *  month-by-month Net Worth series (netWorthTrend.ts). */
  latestAsOf(assetId: number, atDate: string): FinAssetSnapshot | null {
    const r = this.handle.sqlite
      .prepare(`SELECT * FROM fin_asset_snapshot WHERE space_id = ? AND asset_id = ? AND as_of <= ? ORDER BY as_of DESC, id DESC LIMIT 1`)
      .get(this.spaceId, assetId, atDate.slice(0, 10));
    return r ? this.map(r) : null;
  }

  /** The single most recent snapshot across every asset in this space, or null if none has
   *  ever been logged — the freshness nudge's "have you updated anything lately" check. */
  mostRecentAny(): FinAssetSnapshot | null {
    const r = this.handle.sqlite
      .prepare(`SELECT * FROM fin_asset_snapshot WHERE space_id = ? ORDER BY as_of DESC, id DESC LIMIT 1`)
      .get(this.spaceId);
    return r ? this.map(r) : null;
  }

  remove(id: number): boolean {
    return this.handle.sqlite.prepare(`DELETE FROM fin_asset_snapshot WHERE id = ? AND space_id = ?`).run(id, this.spaceId).changes > 0;
  }
}
