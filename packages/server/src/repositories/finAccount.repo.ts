import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinAccount } from "@brain/shared";

/**
 * Owns all SQL for `fin_account` — the single adjustable balance per space (Stage 1: one
 * currency, one account). Space-scoped like every repo. Money is INTEGER cents.
 */
export class FinAccountRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: {
    id: number; name: string; currency: string; balance_cents: number; buffer_cents: number; updated_at: string;
  }): FinAccount {
    return {
      id: r.id, name: r.name, currency: r.currency,
      balanceCents: r.balance_cents, bufferCents: r.buffer_cents, updatedAt: r.updated_at,
    };
  }

  /** The space's account, creating a zero-balance one on first access. */
  getOrCreate(): FinAccount {
    const existing = this.handle.sqlite
      .prepare(`SELECT id, name, currency, balance_cents, buffer_cents, updated_at FROM fin_account WHERE space_id = ? ORDER BY id LIMIT 1`)
      .get(this.spaceId) as any;
    if (existing) return this.map(existing);
    this.handle.sqlite.prepare(`INSERT INTO fin_account (space_id) VALUES (?)`).run(this.spaceId);
    return this.getOrCreate();
  }

  setBalance(cents: number): FinAccount {
    const acct = this.getOrCreate();
    this.handle.sqlite
      .prepare(`UPDATE fin_account SET balance_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`)
      .run(Math.round(cents), acct.id, this.spaceId);
    return this.getOrCreate();
  }

  setBuffer(cents: number): FinAccount {
    const acct = this.getOrCreate();
    this.handle.sqlite
      .prepare(`UPDATE fin_account SET buffer_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`)
      .run(Math.max(0, Math.round(cents)), acct.id, this.spaceId);
    return this.getOrCreate();
  }

  /** Adjust the balance by a delta (e.g. +income, −expense). Returns the new account. */
  adjustBalance(deltaCents: number): FinAccount {
    const acct = this.getOrCreate();
    return this.setBalance(acct.balanceCents + Math.round(deltaCents));
  }

  setMeta(patch: { name?: string; currency?: string }): FinAccount {
    const acct = this.getOrCreate();
    this.handle.sqlite
      .prepare(`UPDATE fin_account SET name = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND space_id = ?`)
      .run(patch.name ?? acct.name, patch.currency ?? acct.currency, acct.id, this.spaceId);
    return this.getOrCreate();
  }
}
