import { and, asc, desc, eq } from "drizzle-orm";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE, instructionProfiles, type InstructionProfileRow } from "../db/schema.js";

export interface NewProfile {
  name: string;
  body: string;
  mode?: string; // 'always' | 'auto'
  priority?: number;
}

/**
 * Layer-2 custom instruction profiles (the roles Soumaya can adopt). Space-scoped.
 * Vector embeddings (for 'auto' intent routing) are managed by the route via
 * upsertProfileEmbedding — this repo owns only the relational rows.
 */
export class InstructionProfilesRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  list(): InstructionProfileRow[] {
    return this.h.db
      .select()
      .from(instructionProfiles)
      .where(eq(instructionProfiles.spaceId, this.spaceId))
      .orderBy(desc(instructionProfiles.priority), asc(instructionProfiles.id))
      .all();
  }

  /** Enabled profiles, highest priority first (what chat blends / routes over). */
  listActive(): InstructionProfileRow[] {
    return this.h.db
      .select()
      .from(instructionProfiles)
      .where(and(eq(instructionProfiles.spaceId, this.spaceId), eq(instructionProfiles.enabled, true)))
      .orderBy(desc(instructionProfiles.priority), asc(instructionProfiles.id))
      .all();
  }

  getById(id: number): InstructionProfileRow | undefined {
    return this.h.db
      .select()
      .from(instructionProfiles)
      .where(and(eq(instructionProfiles.id, id), eq(instructionProfiles.spaceId, this.spaceId)))
      .get();
  }

  create(input: NewProfile): InstructionProfileRow {
    return this.h.db
      .insert(instructionProfiles)
      .values({
        spaceId: this.spaceId,
        name: input.name,
        body: input.body,
        mode: input.mode ?? "always",
        priority: input.priority ?? 0,
      })
      .returning()
      .get();
  }

  update(
    id: number,
    patch: Partial<Pick<InstructionProfileRow, "name" | "body" | "enabled" | "mode" | "priority">>,
  ): InstructionProfileRow | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;
    return this.h.db
      .update(instructionProfiles)
      .set(patch)
      .where(and(eq(instructionProfiles.id, id), eq(instructionProfiles.spaceId, this.spaceId)))
      .returning()
      .get();
  }

  delete(id: number): boolean {
    const res = this.h.sqlite
      .prepare(`DELETE FROM instruction_profiles WHERE id = ? AND space_id = ?`)
      .run(id, this.spaceId);
    return res.changes > 0;
  }
}
