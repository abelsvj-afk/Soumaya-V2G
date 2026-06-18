import { type ExtractionResult, type NodeType, type RelationshipType, analyzeSentiment } from "@brain/shared";
import type { ContextNode, LinkCandidate, LinkValidation, LlmProvider } from "./adapter.js";

/** Common words that carry no topical signal, so we don't "link" on them. */
const STOPWORDS = new Set(
  "the a an and or but if then so of to in on at for with from by about as is are was were be been being i me my we our you your he she it they them this that these those have has had do does did will would can could should not no yes just like about into over under again more most some any all".split(
    " ",
  ),
);

/** Meaningful lowercased word stems (len>=4, non-stopword) for overlap checks. */
function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    out.add(raw.length > 6 ? raw.slice(0, 6) : raw); // crude stem so plurals/tenses match
  }
  return out;
}

/** Choose a relationship that fits the offline signal (default: relates_to). */
function pickRelationship(source: LinkCandidate, target: LinkCandidate): RelationshipType {
  const blob = `${source.label} ${source.content} ${target.label} ${target.content}`.toLowerCase();
  if (/\b(but|however|instead|versus|vs|contradic|conflict|opposite)\b/.test(blob)) return "contradicts";
  if (/\b(because|caused|due to|reason|led to|result)\b/.test(blob)) return "caused_by";
  if (/\b(like|similar|analog|reminds|same as)\b/.test(blob)) return "is_analogous_to";
  if (/\b(build|extend|continue|next step|expand|develop)\b/.test(blob)) return "builds_on";
  return "relates_to";
}

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
    // Offline emotion: derive a -1..1 charge from the wording so the galaxy still
    // colours by feeling, harmonization works, visitors pick a variant, and the
    // chat voice has a tone — all without a cloud key (reuses the shared filter).
    const { valence } = analyzeSentiment(text);
    return {
      nodes: [
        {
          label: this.deriveLabel(text),
          type: this.guessType(text),
          content: text.trim(),
          importance: heuristicImportance(text),
          emotionalWeight: Math.round(valence * 100) / 100,
        },
      ],
      edges: [],
    };
  }

  async validateLink(
    source: LinkCandidate,
    target: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation> {
    // Smarter offline linking: embeddings alone occasionally pull together
    // superficially-similar-but-unrelated thoughts. Without an LLM to reason
    // about it, we confirm with a cheap lexical signal — a very strong cosine
    // match links on its own, otherwise we require some shared meaningful
    // vocabulary. This cuts the "linked to things with no real relation" noise.
    const a = keywords(`${source.label} ${source.content}`);
    const b = keywords(`${target.label} ${target.content}`);
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    const overlap = shared / Math.max(1, Math.min(a.size, b.size)); // 0..1 Szymkiewicz–Simpson

    const strong = similarity >= 0.9; // semantics are unambiguous
    const confirmed = shared >= 1 && overlap >= 0.12; // topical common ground
    if (!strong && !confirmed) return { linked: false };

    // Blend cosine with lexical overlap so confidently-related pairs weigh more.
    const weight = Math.min(1, similarity * 0.7 + overlap * 0.3);
    const relationship = pickRelationship(source, target);
    return { linked: true, relationship, weight };
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
