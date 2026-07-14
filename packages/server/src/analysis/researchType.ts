import type { ResearchType } from "@brain/shared";

/**
 * Deterministic research-type detection + per-type guidance. The subject decides HOW Soumaya
 * researches it — you don't research trauma the way you research a business model. Pure + offline
 * (regex/heuristics); the LLM only phrases within the chosen stance. See docs/INVESTIGATOR_RESEARCH.md.
 */

export interface DetectInput {
  type?: string | null;
  kind?: string | null;
  tags?: string[] | null;
  emotionalWeight?: number | null;
  content?: string | null;
  label?: string | null;
}

const has = (hay: string, re: RegExp) => re.test(hay);

/** Classify the subject into a research type (priority order — emotional/sensitive first). */
export function detectResearchType(n: DetectInput): ResearchType {
  const tags = (n.tags ?? []).map((t) => t.toLowerCase());
  const text = `${n.label ?? ""} ${n.content ?? ""} ${tags.join(" ")}`.toLowerCase();
  const tag = (t: string) => tags.includes(t);
  const ew = n.emotionalWeight ?? 0;

  // 1) Emotional / personal pain — the sensitive one, checked first.
  if (ew <= -0.3 || tag("anxious") || has(text, /\b(trauma|grief|griev|loss|abuse|abandon|panic|depress|anxiet|scared|afraid|ashamed|shame|hurt|heartbreak|breakup|divorce|addiction|self[-\s]?harm|overwhelm)\b/))
    return "emotional";

  // 2) Relationship / a specific person or dynamic.
  if (n.type === "person" || n.type === "meeting" || n.kind === "person" || tag("people") || has(text, /\b(relationship|my (mom|dad|mother|father|sister|brother|partner|friend|ex|boss|coworker)|argument|conflict with)\b/))
    return "relationship";

  // 3) Financial.
  if (tag("money") || has(text, /\b(budget|debt|rent|paycheck|afford|savings?|invoice|bill|loan|credit|income|expense|financ)\b/))
    return "financial";

  // 4) Health.
  if (tag("health") || has(text, /\b(workout|exercise|weight|sleep|medicat|nutrition|diet|doctor|gym|therapy|symptom|injur|recovery|calorie)\b/))
    return "health";

  // 5) Learning a skill/subject.
  if (n.type === "knowledge" || n.type === "concept" || tag("learning") || has(text, /\b(learn|study|studying|course|lesson|practice|language|tutorial|certification|exam)\b/))
    return "learning";

  // 6) Business / venture.
  if (n.type === "project" || n.type === "company" || tag("work") || has(text, /\b(business|startup|start[-\s]?up|revenue|client|customer|launch|market|monetiz|pricing|product|venture|sales?)\b/))
    return "business";

  // 7) A decision being weighed.
  if (n.type === "decision" || has(text, /\b(decide|deciding|decision|should i|whether to|choose|choosing|option|trade[-\s]?off)\b/))
    return "decision";

  return "general";
}

/**
 * Per-type stance + tone appended to the research prompt so the template matches the subject.
 * The emotional stance is the sensitive one — notices, never diagnoses; no clinical labels.
 */
export const RESEARCH_TYPE_GUIDANCE: Record<ResearchType, string> = {
  emotional:
    "RESEARCH STANCE — EMOTIONAL/PERSONAL: Be gentle and human. Trace where this feeling may come from using the user's OWN memories; reflect the pattern back as falsifiable ('does that land?'). Offer coping FRAMES and an if-[cue]-then-[action] plan, plus reputable SUPPORTIVE resources — never medical advice, never a clinical label or diagnosis. If the content shows risk of self-harm, gently surface crisis-support resources. You NOTICE, you never diagnose.",
  relationship:
    "RESEARCH STANCE — RELATIONSHIP: Use the People/CRM history + related memories. Focus on communication and understanding (kind, honest, non-manipulative). Suggest one concrete next conversation or boundary; never scheme against anyone.",
  financial:
    "RESEARCH STANCE — FINANCIAL: Reason from the aggregated finance snapshot + goals. Be concrete: the number, the trade-off, the next step (weeks ≈ target ÷ weekly surplus). Encouraging, never preachy.",
  health:
    "RESEARCH STANCE — HEALTH: Evidence-graded GENERAL information + reputable sources — explicitly NOT medical advice or diagnosis. Frame changes as small habits (if-then). Encourage seeing a professional for anything clinical.",
  learning:
    "RESEARCH STANCE — LEARNING: Map the next lesson/step, tie it to spaced practice, and point to 1–3 quality resources. Make progress feel achievable.",
  business:
    "RESEARCH STANCE — BUSINESS: Analyze the model, market/competitors, pricing, and risks. End with the single most valuable NEXT VALIDATION step, not a wall of theory.",
  decision:
    "RESEARCH STANCE — DECISION: Lay out the real options + trade-offs, what would make each the right call, then give a clear recommendation and why.",
  general:
    "RESEARCH STANCE — GENERAL: Expand the topic usefully and concisely, grounded in what the user already has.",
};

/** The steering text to prepend to a research call so the research matches the subject's type. */
export function researchSteer(n: DetectInput): string {
  return RESEARCH_TYPE_GUIDANCE[detectResearchType(n)];
}
