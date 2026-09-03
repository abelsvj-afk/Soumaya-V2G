import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinAsset, FinAssetKind } from "@brain/shared";

/**
 * Owns all SQL for `fin_asset` (docs/specs/income-net-worth-trend.md) — a manually tracked
 * savings/investment/retirement account, purely for the Net Worth trend line. Never touches
 * fin_account (the spendable cash balance) or Wealth's Buckets/Goals. Archiving preserves
 * history: an archived asset's past snapshots still count toward historical Net Worth points
 * (see finAssetSnapshot.repo.ts's `latestAsOf`) — archiving only hides it from "add a new
 * snapshot" pickers going forward.
 */
export class FinAssetRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinAsset {
    return { id: r.id, kind: r.kind, label: r.label, archived: r.archived === 1, createdAt: r.created_at };
  }

  create(input: { kind: FinAssetKind; label: string }): FinAsset {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_asset (space_id, kind, label) VALUES (?, ?, ?)`)
      .run(this.spaceId, input.kind, input.label);
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): FinAsset | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_asset WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  /** All assets, including archived ones — needed by netWorthTrend.ts so an archived
   *  asset's history still counts toward past points. */
  listAll(): FinAsset[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_asset WHERE space_id = ? ORDER BY archived, label`)
      .all(this.spaceId) as any[];
    return rows.map((r) => this.map(r));
  }

  list(includeArchived = false): FinAsset[] {
    const rows = this.handle.sqlite
      .prepare(`SELECT * FROM fin_asset WHERE space_id = ? ${includeArchived ? "" : "AND archived = 0"} ORDER BY label`)
      .all(this.spaceId) as any[];
    return rows.map((r) => this.map(r));
  }

  update(id: number, patch: { label?: string; kind?: FinAssetKind }): FinAsset | null {
    const cur = this.get(id);
    if (!cur) return null;
    const n = { ...cur, ...patch };
    this.handle.sqlite.prepare(`UPDATE fin_asset SET label = ?, kind = ? WHERE id = ? AND space_id = ?`).run(n.label, n.kind, id, this.spaceId);
    return this.get(id);
  }

  archive(id: number): boolean {
    return this.handle.sqlite.prepare(`UPDATE fin_asset SET archived = 1 WHERE id = ? AND space_id = ?`).run(id, this.spaceId).changes > 0;
  }
}
