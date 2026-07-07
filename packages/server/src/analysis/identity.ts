import { COGNITIVE_META } from "@brain/shared";
import type { AppContext } from "../context.js";
import { labelTokens, mentions } from "./cognitive.js";

/**
 * Identity core (Cognitive Layer Phase 5, docs/COGNITIVE_LAYER.md). An `identity`
 * is who you are — the heaviest cognitive body. Unlike a goal, it isn't something
 * you complete; it's something the evidence of your life either AFFIRMS or CONTESTS.
 *
 * So an identity brightens as memories express it and dims as memories contradict
 * it. Evidence is grounded in YOUR OWN WORDS: a memory that mentions the identity
 * plainly is affirming (a `supports` edge); one that mentions it with negation /
 * abandonment language ("I quit …", "no longer …", "I'm not …") is contesting (a
 * `contradicts` edge). Brightness (importance → mass → size) tracks the balance:
 * a strongly-affirmed identity blazes; a contested one visibly dims.
 *
 * Deterministic + offline; runs on ingest and each autonomy tick. Never destructive
 * (only edges + brightness change).
 */

const IDENTITY = COGNITIVE_META.identity;
/** Brightness floor (heavily contested) and ceiling (strongly affirmed). */
const DIM = 0.62;
const BRIGHT = 0.99;
/** Neutral confidence when there's no evidence yet. */
const NEUTRAL = 0.72;

/** Negation / abandonment markers that flip a mention into evidence AGAINST. */
const CONTRA_MARKERS = [
  "no longer", "not ", "never really", "used to", "gave up", "quit", "stopped",
  "isn't", "aren't", "wasn't", "don't", "doesn't", "didn't", "can't", "couldn't",
  "failed to", "struggle to", "struggling", "hardly", "barely", "lost my",
];

function hasNegation(text: string): boolean {
  const t = text.toLowerCase();
  return CONTRA_MARKERS.some((m) => t.includes(m));
}

export interface IdentityEvidence {
  for: { id: number; label: string }[];
  against: { id: number; label: string }[];
  confidence: number; // 0..1 (for / (for+against)), NEUTRAL when no evidence
}

/**
 * Re-evaluate one identity's evidence: classify every memory that mentions it as
 * affirming or contesting (writing the right `supports`/`contradicts` edge), then
 * set its brightness from the balance. Returns the evidence summary.
 */
export function evaluateIdentity(ctx: AppContext, spaceId: string, id: number, label: string): IdentityEvidence {
  const s = ctx.handle.sqlite;
  const tokens = labelTokens(label);
  if (tokens.length > 0) {
    const likeClause = tokens.map(() => `lower(content) LIKE ? OR lower(label) LIKE ?`).join(" OR ");
    const params: string[] = [];
    for (const t of tokens) params.push(`%${t}%`, `%${t}%`);
    const rows = s
      .prepare(
        `SELECT id, label, content FROM nodes
         WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory') AND (${likeClause})
         ORDER BY id DESC LIMIT 80`,
      )
      .all(spaceId, ...params) as { id: number; label: string; content: string }[];
    for (const r of rows) {
      const hay = `${r.label}\n${r.content}`;
      if (!tokens.some((t) => mentions(hay, t))) continue; // whole-word only
      const against = hasNegation(hay);
      const rel = against ? "contradicts" : "supports";
      const opp = against ? "supports" : "contradicts";
      // Ensure the correct edge exists and the opposite one doesn't.
      s.prepare(`DELETE FROM edges WHERE space_id = ? AND source = ? AND target = ? AND relationship = ?`).run(
        spaceId,
        r.id,
        id,
        opp,
      );
      const exists = s
        .prepare(`SELECT 1 FROM edges WHERE space_id = ? AND source = ? AND target = ? AND relationship = ?`)
        .get(spaceId, r.id, id, rel);
      if (!exists) {
        s.prepare(
          `INSERT INTO edges (space_id, source, target, relationship, weight) VALUES (?, ?, ?, ?, 0.7)`,
        ).run(spaceId, r.id, id, rel);
      }
    }
  }

  const grab = (rel: string) =>
    s
      .prepare(
        `SELECT n.id, n.label FROM edges e JOIN nodes n ON n.id = e.source
         WHERE e.space_id = ? AND e.target = ? AND e.relationship = ? AND n.deleted_at IS NULL`,
      )
      .all(spaceId, id, rel) as { id: number; label: string }[];
  const fer = grab("supports");
  const against = grab("contradicts");
  const total = fer.length + against.length;
  const confidence = total === 0 ? NEUTRAL : fer.length / total;

  const importance = DIM + confidence * (BRIGHT - DIM);
  s.prepare(`UPDATE nodes SET importance = ? WHERE id = ? AND space_id = ?`).run(importance, id, spaceId);

  return { for: fer, against, confidence };
}

/** Evidence for any cognitive anchor (identities get for/against; others = supporters). */
export function cognitiveEvidence(ctx: AppContext, spaceId: string, id: number): IdentityEvidence | null {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT label, kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(id, spaceId) as { label: string; kind: string | null } | undefined;
  if (!row || !(row.kind && row.kind in COGNITIVE_META)) return null;
  if (row.kind === "identity") return evaluateIdentity(ctx, spaceId, id, row.label);
  // Non-identity anchors: report supporters as "for" (no contesting concept).
  const fer = s
    .prepare(
      `SELECT n.id, n.label FROM edges e JOIN nodes n ON n.id = e.source
       WHERE e.space_id = ? AND e.target = ? AND e.relationship = 'supports' AND n.deleted_at IS NULL`,
    )
    .all(spaceId, id) as { id: number; label: string }[];
  return { for: fer, against: [], confidence: fer.length > 0 ? 1 : NEUTRAL };
}

/** Re-evaluate every identity in a space (free/offline). Runs on ingest + autonomy. */
export function stepIdentities(ctx: AppContext, spaceId: string): number {
  const identities = ctx.handle.sqlite
    .prepare(`SELECT id, label FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND kind = 'identity'`)
    .all(spaceId) as { id: number; label: string }[];
  for (const it of identities) evaluateIdentity(ctx, spaceId, it.id, it.label);
  return identities.length;
}
