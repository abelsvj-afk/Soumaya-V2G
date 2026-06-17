import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
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
}

const TABLES_WITH_SPACE = ["nodes", "edges", "insights", "agent_logs", "daily_logs"] as const;

function hash(passcode: string, salt: string): Buffer {
  return scryptSync(passcode, salt, 64);
}

const toPublic = (row: SpaceRow): SpacePublic => ({ id: row.id, name: row.name });

export class SpacesRepo {
  constructor(private readonly h: DbHandle) {}

  getById(id: string): SpacePublic | undefined {
    const row = this.h.db.select().from(spaces).where(eq(spaces.id, id)).get();
    return row ? toPublic(row) : undefined;
  }

  private getByName(name: string): SpaceRow | undefined {
    return this.h.db.select().from(spaces).where(eq(spaces.name, name)).get();
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
  authOrCreate(name: string, passcode: string): { space: SpacePublic; created: boolean } | null {
    const existing = this.getByName(name);
    if (existing) {
      const attempt = hash(passcode, existing.passcodeSalt);
      const stored = Buffer.from(existing.passcodeHash, "hex");
      if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) return null;
      return { space: toPublic(existing), created: false };
    }

    const isFirst = this.count() === 0;
    const id = randomBytes(16).toString("hex");
    const salt = randomBytes(16).toString("hex");
    const passcodeHash = hash(passcode, salt).toString("hex");
    const tx = this.h.sqlite.transaction(() => {
      this.h.db
        .insert(spaces)
        .values({ id, name, passcodeHash, passcodeSalt: salt })
        .run();
      if (isFirst) {
        for (const t of TABLES_WITH_SPACE) {
          this.h.sqlite
            .prepare(`UPDATE ${t} SET space_id = ? WHERE space_id = ?`)
            .run(id, DEFAULT_SPACE);
        }
      }
    });
    tx();
    return { space: { id, name }, created: true };
  }
}
