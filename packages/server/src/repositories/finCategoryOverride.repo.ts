import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";

/**
 * Owns `fin_category_override` — the learned payee→category memory. When the user corrects a
 * category on a draft, we remember it so the same payee auto-categorizes next time. Space-scoped.
 */
export class FinCategoryOverrideRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private key(payee: string): string {
    return payee.trim().toLowerCase();
  }

  get(payee: string): string | null {
    if (!payee?.trim()) return null;
    const r = this.handle.sqlite
      .prepare(`SELECT category FROM fin_category_override WHERE space_id = ? AND payee = ?`)
      .get(this.spaceId, this.key(payee)) as { category: string } | undefined;
    return r?.category ?? null;
  }

  set(payee: string, category: string): void {
    if (!payee?.trim() || !category?.trim()) return;
    this.handle.sqlite
      .prepare(`INSERT INTO fin_category_override (space_id, payee, category) VALUES (?, ?, ?)
                ON CONFLICT(space_id, payee) DO UPDATE SET category = excluded.category`)
      .run(this.spaceId, this.key(payee), category.trim());
  }

  all(): Map<string, string> {
    const rows = this.handle.sqlite
      .prepare(`SELECT payee, category FROM fin_category_override WHERE space_id = ?`)
      .all(this.spaceId) as { payee: string; category: string }[];
    return new Map(rows.map((r) => [r.payee, r.category]));
  }
}
