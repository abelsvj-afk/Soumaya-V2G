import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { InvestigationReport, InvestigationEvidence, ResearchType } from "@brain/shared";
import { detectResearchType } from "./researchType.js";

/**
 * Investigator (docs/INVESTIGATOR_RESEARCH.md) — the internal, CITED deep-dive that runs BEFORE
 * outward research. Deterministic + offline: it reaches into the user's own world (graph
 * neighbours + shared-tag memories) to surface where a subject connects, produces a grounded,
 * falsifiable report + a research TYPE, and NOTICES patterns — it never diagnoses. The LLM can
 * later enrich the phrasing (llm.investigate?), but this heuristic path always works.
 */

interface SubjectRow {
  id: number; label: string; type: string | null; content: string | null;
  tags: string | null; kind: string | null; emotional_weight: number | null;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const OPEN_QUESTIONS: Record<ResearchType, string[]> = {
  emotional: ["When do you first remember feeling this?", "What tends to bring it on?", "Who was around when it started?"],
  relationship: ["What outcome do you actually want here?", "What's the story from their side?"],
  financial: ["What would 'handled' look like this month?", "Which of these is the real priority?"],
  health: ["What's one small change you could keep this week?", "What's gotten in the way before?"],
  learning: ["What's the next concrete step?", "How will you know it's sticking?"],
  business: ["Who is this actually for?", "What's the smallest way to test it this week?"],
  decision: ["What would make each option the right one?", "What are you most afraid of getting wrong?"],
  general: ["What made this worth capturing?", "What does it connect to?"],
};

function summarize(subject: SubjectRow, type: ResearchType, evidence: InvestigationEvidence[]): string {
  const n = evidence.length;
  const thread = evidence[0];
  const threadBit = thread ? ` The strongest thread I see is "${thread.label}" (${thread.why}).` : "";
  const grounded = n > 0
    ? `I looked through your own memories around "${subject.label}" and found ${n} that connect.${threadBit}`
    : `I looked, but "${subject.label}" is fairly isolated right now — nothing else of yours links to it yet.`;
  if (type === "emotional") {
    return `${grounded} This feels like something to sit with gently, not analyze coldly — I'm noticing a pattern, not labeling it. Does that feel true, or am I off?`;
  }
  return `${grounded} This reads like a ${type} matter, so I'd research it that way. Does that land, or should I look somewhere else?`;
}

/** Run the internal investigation for a memory. Returns null if the node isn't in this space. */
export function runInvestigation(handle: DbHandle, spaceId: string = DEFAULT_SPACE, nodeId: number): InvestigationReport | null {
  const subject = handle.sqlite
    .prepare(`SELECT id, label, type, content, tags, kind, emotional_weight FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(nodeId, spaceId) as SubjectRow | undefined;
  if (!subject) return null;

  const evidence: InvestigationEvidence[] = [];
  const seen = new Set<number>([subject.id]);

  // 1) Graph neighbours — the explicit associative links, strongest first.
  const neighbours = handle.sqlite
    .prepare(`SELECT n.id AS id, n.label AS label, e.relationship AS rel
              FROM edges e
              JOIN nodes n ON n.id = (CASE WHEN e.source = ? THEN e.target ELSE e.source END) AND n.space_id = e.space_id
              WHERE e.space_id = ? AND (e.source = ? OR e.target = ?) AND n.deleted_at IS NULL
              ORDER BY e.weight DESC LIMIT 12`)
    .all(subject.id, spaceId, subject.id, subject.id) as { id: number; label: string; rel: string }[];
  for (const r of neighbours) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    evidence.push({ nodeId: r.id, label: r.label, why: `linked via ${r.rel}` });
  }

  // 2) Shared-tag memories — the softer thematic connections.
  const tags = parseTags(subject.tags);
  for (const t of tags.slice(0, 4)) {
    if (evidence.length >= 10) break;
    const rows = handle.sqlite
      .prepare(`SELECT id, label FROM nodes WHERE space_id = ? AND id != ? AND deleted_at IS NULL AND tags LIKE ? LIMIT 6`)
      .all(spaceId, subject.id, `%"${t}"%`) as { id: number; label: string }[];
    for (const r of rows) {
      if (seen.has(r.id) || evidence.length >= 10) continue;
      seen.add(r.id);
      evidence.push({ nodeId: r.id, label: r.label, why: `shares tag ${t}` });
    }
  }

  const researchType = detectResearchType({
    type: subject.type, kind: subject.kind, tags, emotionalWeight: subject.emotional_weight,
    content: subject.content, label: subject.label,
  });

  return {
    subjectId: subject.id,
    subjectLabel: subject.label,
    researchType,
    summary: summarize(subject, researchType, evidence),
    evidence,
    openQuestions: OPEN_QUESTIONS[researchType],
  };
}
