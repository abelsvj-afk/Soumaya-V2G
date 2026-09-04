import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { ClarificationRecord, ClarificationStatus, ProvenanceRef } from "@brain/shared";

/**
 * Owns all SQL for `intelligence_clarifications` (docs/specs/maya-intelligence-architecture.md,
 * Part I2) — the clarification QUESTION lifecycle only. The confirmed knowledge itself, once a
 * clarification resolves, lives as a real `nodes` row (see `analysis/clarificationResolution.ts`)
 * — this repo never stores the confirmed fact's content beyond a short summary string for
 * display/matching.
 */
export class IntelligenceClarificationsRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): ClarificationRecord {
    let evidence: ProvenanceRef[] = [];
    try {
      const parsed = JSON.parse(r.evidence_json);
      if (Array.isArray(parsed)) evidence = parsed;
    } catch {
      /* ignore malformed JSON, treat as no evidence */
    }
    return {
      id: r.id,
      claimId: r.claim_id,
      domain: r.domain,
      question: r.question,
      evidence,
      status: r.status,
      answerText: r.answer_text ?? null,
      confirmedStatement: r.confirmed_statement ?? null,
      confirmedNodeId: r.confirmed_node_id ?? null,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at ?? null,
    };
  }

  create(input: { claimId: string; domain: string; question: string; evidence: ProvenanceRef[] }): ClarificationRecord {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO intelligence_clarifications (space_id, claim_id, domain, question, evidence_json) VALUES (?, ?, ?, ?, ?)`)
      .run(this.spaceId, input.claimId, input.domain, input.question, JSON.stringify(input.evidence));
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): ClarificationRecord | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM intelligence_clarifications WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  /** The single most recent pending clarification, if any — there is normally at most one
   *  "live" question at a time (the clarification gate's own cooldown already limits how often
   *  a new one is raised), but this always resolves the newest if several somehow exist. */
  mostRecentPending(): ClarificationRecord | null {
    const r = this.handle.sqlite
      .prepare(`SELECT * FROM intelligence_clarifications WHERE space_id = ? AND status = 'pending' ORDER BY created_at DESC, id DESC LIMIT 1`)
      .get(this.spaceId);
    return r ? this.map(r) : null;
  }

  /** Any clarification (pending or resolved) created within the lookback window — the basis
   *  for the "don't ask again too soon" cooldown, replacing the prior pass's agent_logs-only
   *  tracking now that a structured record exists. */
  createdSince(cutoffIso: string): boolean {
    const row = this.handle.sqlite
      .prepare(`SELECT 1 FROM intelligence_clarifications WHERE space_id = ? AND created_at >= ? LIMIT 1`)
      .get(this.spaceId, cutoffIso);
    return !!row;
  }

  resolve(id: number, patch: { status: ClarificationStatus; answerText?: string; confirmedStatement?: string; confirmedNodeId?: number }): ClarificationRecord | null {
    const cur = this.get(id);
    if (!cur) return null;
    this.handle.sqlite
      .prepare(
        `UPDATE intelligence_clarifications
         SET status = ?, answer_text = ?, confirmed_statement = ?, confirmed_node_id = ?, resolved_at = CURRENT_TIMESTAMP
         WHERE id = ? AND space_id = ?`,
      )
      .run(patch.status, patch.answerText ?? null, patch.confirmedStatement ?? null, patch.confirmedNodeId ?? null, id, this.spaceId);
    return this.get(id);
  }
}
