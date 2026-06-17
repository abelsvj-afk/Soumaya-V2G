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
    // In-character (Soumaya) even offline — never impersonate the user.
    const chitchat = /\b(how are you|how's it going|what'?s up|you doing|hi|hello|hey)\b/i.test(
      question,
    );
    if (context.length === 0) {
      const line = chitchat
        ? "Cruising the quiet outer reaches of your galaxy — calm out here, just starlight and a little drift. Ask me about a memory and I'll plot a course to it."
        : "I'm not picking up any memories on that heading yet. Log a few related thoughts and I'll chart the connections.";
      return { answer: line, citations: [] };
    }
    const top = context.slice(0, 5);
    const answer =
      `From up here I can see a cluster on that heading:\n` +
      top.map((c) => `• ${c.label}: ${c.content}`).join("\n") +
      `\n\n— I'd plot a course between them. (Connect an OpenAI or Gemini key and I can tell you the fuller story.)`;
    return { answer, citations: top.map((c) => c.id) };
  }

  async research(node: LinkCandidate): Promise<{ label: string; content: string }> {
    return {
      label: `Draft Research: ${node.label}`,
      content: `Preliminary observations on ${node.label}: ${node.content.slice(0, 100)}... (Research mode requires an active LLM key for full deep-dives.)`,
    };
  }

  async summarizeSector(nodes: LinkCandidate[]): Promise<string> {
    return `This sector contains ${nodes.length} closely related memories, humming with un-synthesized potential.`;
  }

  async generateDailyLog(newNodes: LinkCandidate[], actions: string[]): Promise<string> {
    return `Stardate: ${new Date().toLocaleDateString()}. Added ${newNodes.length} new memories and performed ${actions.length} maintenance actions.`;
  }
}
