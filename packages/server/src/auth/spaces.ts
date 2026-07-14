import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE, spaces, type SpaceRow } from "../db/schema.js";

/**
 * Lightweight per-brain auth: a space is opened by name + passcode and works
 * across devices (no email/accounts). Passcodes are salted + scrypt-hashed; the
 * space id itself is an unguessable 128-bit token the client stores as its key.
 */

export interface SpacePublic {
  id: string;
  name: string;
  gamerTag: string;
}

// Every table carrying a space_id — the first account to register claims all
// pre-multi-tenancy rows still sitting under 'legacy'. Keep in sync when adding
// a space-scoped table, or the owner's data in it stays orphaned after claim.
const TABLES_WITH_SPACE = [
  "nodes",
  "edges",
  "insights",
  "agent_logs",
  "daily_logs",
  "lore",
  "attachments",
  "instruction_profiles",
  "knowledge_docs",
  "knowledge_chunks",
  "user_persona",
  "visitor_stats",
  "codex_claims",
  "space_meta",
  "lenses",
  "codex_discoveries",
  "fin_account",
  "fin_source",
  "fin_income",
  "fin_expense",
  "fin_bill",
  "fin_bill_occurrence",
  "fin_category_override",
  "fin_goal_link",
  "journeys",
  "journey_link",
] as const;

function hash(passcode: string, salt: string): Buffer {
  return scryptSync(passcode, salt, 64);
}

const toPublic = (row: SpaceRow): SpacePublic => ({ id: row.id, name: row.name, gamerTag: row.gamerTag });

export class SpacesRepo {
  constructor(private readonly h: DbHandle) {}

  getById(id: string): SpacePublic | undefined {
    const row = this.h.db.select().from(spaces).where(eq(spaces.id, id)).get();
    return row ? toPublic(row) : undefined;
  }

  getByGamerTag(gamerTag: string): SpaceRow | undefined {
    // Case-insensitive: "Alice" and "alice" are the same brain, so a different-case
    // login can't silently create a duplicate account (mobile autocapitalize, etc.).
    return this.h.db
      .select()
      .from(spaces)
      .where(sql`lower(${spaces.gamerTag}) = lower(${gamerTag})`)
      .get();
  }

  count(): number {
    const r = this.h.sqlite.prepare(`SELECT COUNT(*) AS c FROM spaces`).get() as { c: number };
    return r.c;
  }

  /**
   * Log in to an existing brain or create a new one. Returns the space (with its
   * secret id) on success, or null when the name exists but the passcode is wrong.
   *
   * The FIRST brain ever created on this deployment claims all pre-existing
   * ("legacy") data — that's how the owner keeps the memories that were already
   * in the database before multi-tenancy.
   */
  authOrCreate(gamerTag: string, passcode: string, name?: string): { space: SpacePublic; created: boolean } | null {
    const trimmedGamerTag = gamerTag.trim();
    const trimmedName = (name ?? gamerTag).trim();

    const existing = this.getByGamerTag(trimmedGamerTag);
    if (existing) {
      const attempt = hash(passcode, existing.passcodeSalt);
      const stored = Buffer.from(existing.passcodeHash, "hex");
      if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) return null;
      return { space: toPublic(existing), created: false };
    }

    const isFirst = this.count() === 0;

    // New registration validations:
    // Reject if gamerTag is case-insensitively "soumaya" (unless it is the first brain)
    if (!isFirst) {
      if (trimmedGamerTag.toLowerCase() === "soumaya") {
        throw new Error("The name/gamer tag 'Soumaya' is reserved.");
      }
      // Reject if name is case-insensitively "soumaya" (unless it is the first brain)
      if (trimmedName.toLowerCase() === "soumaya") {
        throw new Error("The name/gamer tag 'Soumaya' is reserved.");
      }
    }
    const id = randomBytes(16).toString("hex");
    const salt = randomBytes(16).toString("hex");
    const passcodeHash = hash(passcode, salt).toString("hex");
    const tx = this.h.sqlite.transaction(() => {
      this.h.db
        .insert(spaces)
        .values({ id, name: trimmedName, gamerTag: trimmedGamerTag, passcodeHash, passcodeSalt: salt })
        .run();
      if (isFirst) {
        for (const t of TABLES_WITH_SPACE) {
          // OR IGNORE: space_meta/user_persona/codex_claims key on space_id, so a
          // conflicting new-space row (shouldn't exist at creation, but cheap to
          // guard) must not abort the whole claim transaction.
          this.h.sqlite
            .prepare(`UPDATE OR IGNORE ${t} SET space_id = ? WHERE space_id = ?`)
            .run(id, DEFAULT_SPACE);
        }
      } else {
        // New tenants start with Research Mode explicitly OFF. The NULL→global
        // fallback exists for pre-migration brains; without this row, a fresh
        // space would inherit whatever the legacy owner set (fail-open to paid
        // autonomous work if that was "true").
        this.h.sqlite
          .prepare(`INSERT OR IGNORE INTO space_meta (space_id, research_enabled) VALUES (?, 'false')`)
          .run(id);
      }
    });
    tx();
    return { space: { id, name: trimmedName, gamerTag: trimmedGamerTag }, created: true };
  }

  /**
   * Update a brain's display name and/or gamer tag. Gamer tag must stay UNIQUE
   * (case-insensitive) and isn't the reserved "Soumaya"; name can be anything.
   * Throws a user-facing message on conflict/validation.
   */
  updateProfile(id: string, opts: { gamerTag?: string; name?: string }): SpacePublic {
    const cur = this.h.db.select().from(spaces).where(eq(spaces.id, id)).get();
    if (!cur) throw new Error("No such brain.");
    const next: { gamerTag?: string; name?: string } = {};

    if (opts.gamerTag !== undefined) {
      const tag = opts.gamerTag.trim();
      if (tag.length < 2 || tag.length > 40) throw new Error("Gamer tag must be 2–40 characters.");
      if (tag.toLowerCase() === "soumaya") throw new Error("The gamer tag 'Soumaya' is reserved.");
      const taken = this.getByGamerTag(tag);
      if (taken && taken.id !== id) throw new Error("That gamer tag is already taken — pick another.");
      next.gamerTag = tag;
    }
    if (opts.name !== undefined) {
      const nm = opts.name.trim();
      if (nm.length < 1 || nm.length > 40) throw new Error("Name must be 1–40 characters.");
      next.name = nm;
    }
    if (Object.keys(next).length === 0) return toPublic(cur);

    this.h.db.update(spaces).set(next).where(eq(spaces.id, id)).run();
    return toPublic({ ...cur, ...next });
  }
}
