import type { ExtractionResult, NodeType } from "@brain/shared";
import type { ContextNode, LinkCandidate, LinkValidation, LlmProvider } from "./adapter.js";

/**
 * Heuristic gravitational mass without an LLM: weighty life/identity/emotional
 * vocabulary and longer, more deliberate entries score higher. 0..1. Exported so
 * it also powers "reset to auto" weighting offline (no API credit needed).
 */
export function heuristicImportance(text: string): number {
  const t = text.toLowerCase();
  const heavy =
    /(death|dying|\bdied\b|sick|illness|cancer|divorce|breakup|broke up|fired|laid off|lawsuit|debt|money|career|future|dream|goal|purpose|identity|meaning|fear|afraid|anxiety|anxious|depress|marriage|married|wedding|baby|child|kids|god|faith|forever|always|never|life|health)/g;
  const emphasis = /(important|serious|crucial|critical|urgent|matters|real)/g;
  const heavyHits = (t.match(heavy) ?? []).length;
  const emphasisHits = (t.match(emphasis) ?? []).length;
  const lengthBoost = Math.min(0.2, text.trim().length / 1000); // deliberation
  const score = 0.35 + heavyHits * 0.11 + emphasisHits * 0.08 + lengthBoost;
  return Math.max(0, Math.min(1, score));
}

/**
 * No-key fallback. Keeps the brain fully functional without an LLM:
 * - extract(): treats the whole input as a single node, guessing the type from
 *   keywords. (No LLM-typed edges; associative similarity linking still runs.)
 * - validateLink(): approves links purely on cosine similarity.
 */
export class HeuristicProvider implements LlmProvider {
  readonly available = false;
  readonly model = "heuristic";

  private guessType(text: string): NodeType {
    const t = text.toLowerCase();
    // Stem-based substring matching (no word boundaries) so "arguing",
    // "anxious", "venture" etc. are caught.
    if (/(business|startup|idea|product|market|revenue|customer|saas|launch|venture|profit)/.test(t))
      return "business_idea";
    if (
      /(sister|brother|mother|father|\bmom\b|\bdad\b|wife|husband|girlfriend|boyfriend|relationship|friend|family|partner|\blove\b|argu|feel|anxious|emotion|lonely|\bshe\b|\bhe\b|\bthey\b)/.test(
        t,
      )
    )
      return "relationship_reflection";
    return "random_thought";
  }

  private deriveLabel(text: string): string {
    const words = text.trim().split(/\s+/).slice(0, 6).join(" ");
    return words.length > 0 ? words : "Thought";
  }

  async extract(text: string, _context: ContextNode[]): Promise<ExtractionResult> {
    return {
      nodes: [
        {
          label: this.deriveLabel(text),
          type: this.guessType(text),
          content: text.trim(),
          importance: heuristicImportance(text),
        },
      ],
      edges: [],
    };
  }

  async validateLink(
    _source: LinkCandidate,
    _target: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation> {
    return { linked: true, relationship: "relates_to", weight: similarity };
  }

  async synthesize(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<{ text: string; score: number }> {
    return {
      text: `"${a.label}" and "${b.label}" seem related (${Math.round(
        similarity * 100,
      )}% similar) but aren't connected yet — worth a closer look.`,
      score: similarity,
    };
  }

  async answer(
    question: string,
    context: ContextNode[],
  ): Promise<{ answer: string; citations: number[] }> {
    if (context.length === 0) {
      return { answer: "I don't have any memories related to that yet.", citations: [] };
    }
    const top = context.slice(0, 5);
    const answer =
      `Related memories for "${question}":\n` +
      top.map((c) => `• ${c.label}: ${c.content}`).join("\n") +
      `\n\n(Offline mode — connect an OpenAI or Gemini key for synthesized answers.)`;
    return { answer, citations: top.map((c) => c.id) };
  }
}
