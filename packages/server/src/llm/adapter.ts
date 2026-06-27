import type { ExtractionResult, RelationshipType } from "@brain/shared";

/** A previously-stored node passed to the LLM as context for extraction. */
export interface ContextNode {
  id: number;
  label: string;
  type: string;
  content: string;
}

/** Two candidate endpoints for an associative link decision. */
export interface LinkCandidate {
  label: string;
  content: string;
}

export interface LinkValidation {
  linked: boolean;
  relationship?: RelationshipType;
  /** 0..1 confidence/strength for the edge. */
  weight?: number;
}

/**
 * Extra steering layered onto a chat answer (the AI Companion system). All
 * optional so the offline heuristic + existing 2-arg test fakes stay valid.
 */
export interface AnswerOptions {
  /** Soumaya's soul (soul.md body) — deeper character injected into the identity slot. */
  soul?: string;
  /** Blended, priority-ordered active custom instruction profiles (Layer 2). */
  systemExtra?: string;
  /** "About Me": who the user is. Soumaya is AWARE of this, never becomes them. */
  persona?: string;
  /** Retrieved knowledge-document chunks, pre-formatted with doc names. */
  knowledge?: string;
}

/**
 * LlmProvider is the structured-reasoning seam. Gemini is the default; OpenAI
 * is a drop-in alternate; the heuristic provider keeps everything working with
 * no API key. `available` is false for the heuristic fallback so callers can
 * surface "LLM typing inactive" state.
 */
export interface LlmProvider {
  readonly available: boolean;
  readonly model: string;
  /** True when a cloud provider has fallen back to offline heuristic (credit/quota). */
  readonly degraded?: boolean;
  /** Parse raw text into typed nodes + edges, grounded in existing context. */
  extract(text: string, context: ContextNode[]): Promise<ExtractionResult>;
  /** Decide whether a semantic neighbour should become a formal graph edge. */
  validateLink(
    source: LinkCandidate,
    target: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation>;
  /** Write a short insight about a latent (semantically near, graph-distant) pair. */
  synthesize(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<{ text: string; score: number }>;
  /** Answer a question grounded in a retrieved subgraph; cite node ids. */
  answer(
    question: string,
    context: ContextNode[],
    opts?: AnswerOptions,
  ): Promise<{ answer: string; citations: number[] }>;
  /** Perform autonomous research on a single node to expand the knowledge base. */
  research(node: LinkCandidate, userAnswers?: string): Promise<{ label: string; content: string; questions?: string[] }>;
  /** Generate a vibe description for a cluster of nodes. */
  summarizeSector(nodes: LinkCandidate[]): Promise<string>;
  /** Generate a daily log of the brain's evolution. `persona` = optional About-Me awareness. */
  generateDailyLog(newNodes: LinkCandidate[], actions: string[], persona?: string): Promise<string>;
}

export type LlmProviderKind = "gemini" | "openai" | "heuristic";

export interface LlmProviderOptions {
  kind?: LlmProviderKind;
  /** Called with token usage after each successful cloud call (for the budget meter). */
  recordUsage?: (model: string, inputTokens: number, outputTokens: number) => void;
  /** When it returns true, calls skip the cloud and use the heuristic (budget hit). */
  isOverBudget?: () => boolean;
}

/**
 * Construct the configured LLM provider, falling back to the heuristic provider
 * when the relevant API key is missing.
 */
export async function createLlmProvider(opts: LlmProviderOptions = {}): Promise<LlmProvider> {
  const kind = opts.kind;
  // Accept any reasonable env-var name for the key (OPENAI_API_KEY, OPENAI_API,
  // and any case variant a Fly secret might use, e.g. openai_api).
  const findKey = (re: RegExp): string | undefined => {
    for (const [k, v] of Object.entries(process.env)) {
      if (v && re.test(k)) return v;
    }
    return undefined;
  };
  const openaiKey =
    process.env.OPENAI_API_KEY ?? process.env.OPENAI_API ?? findKey(/openai.*(api|key)/i);
  const geminiKey = process.env.GEMINI_API_KEY ?? findKey(/gemini.*(api|key)/i);

  // If LLM_PROVIDER isn't set, auto-pick based on whichever key is present, so
  // adding just a key (via `fly secrets set`) is enough to go live.
  const resolved: LlmProviderKind =
    kind ??
    (process.env.LLM_PROVIDER as LlmProviderKind) ??
    (openaiKey ? "openai" : geminiKey ? "gemini" : "heuristic");

  // Cloud providers are wrapped so they degrade to the offline heuristic on
  // credit/quota/auth errors instead of taking the whole app down.
  if (resolved === "gemini" && geminiKey) {
    const { GeminiProvider } = await import("./gemini.js");
    const { ResilientLlmProvider } = await import("./resilient.js");
    return new ResilientLlmProvider(new GeminiProvider(geminiKey), undefined, undefined, opts.isOverBudget);
  }
  if (resolved === "openai" && openaiKey) {
    const { OpenAiProvider } = await import("./openai.js");
    const { ResilientLlmProvider } = await import("./resilient.js");
    return new ResilientLlmProvider(
      new OpenAiProvider(openaiKey, opts.recordUsage),
      undefined,
      undefined,
      opts.isOverBudget,
    );
  }
  const { HeuristicProvider } = await import("./heuristic.js");
  return new HeuristicProvider();
}
