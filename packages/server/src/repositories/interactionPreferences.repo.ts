import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";

/**
 * Maya Longitudinal Intelligence, Phase H (docs/specs/maya-longitudinal-intelligence.md,
 * Section 14) — learned (observed) interaction preferences. One row per (space, signal); all
 * accumulation/decay logic lives in `analysis/interactionPreferences.ts`, this repo owns only
 * the SQL. Deliberately as small as `instructionProfiles.repo.ts` — no history table, no
 * per-observation log, matching the brief's own "do not implement a complicated preference
 * hierarchy unless demonstrated necessary."
 */
export interface InteractionPreferenceRow {
  id: number;
  signal: string;
  value: string;
  confidence: number;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: any): InteractionPreferenceRow {
  return {
    id: r.id,
    signal: r.signal,
    value: r.value,
    confidence: r.confidence,
    evidenceCount: r.evidence_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class InteractionPreferencesRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  list(): InteractionPreferenceRow[] {
    return (
      this.h.sqlite
        .prepare(`SELECT * FROM interaction_preferences WHERE space_id = ? ORDER BY signal ASC`)
        .all(this.spaceId) as any[]
    ).map(toRow);
  }

  get(signal: string): InteractionPreferenceRow | undefined {
    const row = this.h.sqlite
      .prepare(`SELECT * FROM interaction_preferences WHERE space_id = ? AND signal = ?`)
      .get(this.spaceId, signal) as any;
    return row ? toRow(row) : undefined;
  }

  /** Replace (or create) the row for this signal outright — the caller (analysis layer) has
   *  already computed the new value/confidence/evidenceCount; this is a pure write. */
  upsert(signal: string, value: string, confidence: number, evidenceCount: number, now: string): InteractionPreferenceRow {
    this.h.sqlite
      .prepare(
        `INSERT INTO interaction_preferences (space_id, signal, value, confidence, evidence_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(space_id, signal) DO UPDATE SET
           value = excluded.value, confidence = excluded.confidence,
           evidence_count = excluded.evidence_count, updated_at = excluded.updated_at`,
      )
      .run(this.spaceId, signal, value, confidence, evidenceCount, now);
    return this.get(signal)!;
  }
}
