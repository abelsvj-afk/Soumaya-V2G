import type { ExtractionResult } from "@brain/shared";
import type { ContextNode, LinkCandidate, LinkValidation, LlmProvider } from "./adapter.js";
import { HeuristicProvider } from "./heuristic.js";

/** Out-of-credit / quota / auth / hang errors — retrying just wastes time. */
function isFatalKeyError(err: unknown): boolean {
  const s = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /(quota|insufficient|exceeded|billing|payment|credit|unauthor|invalid api key|401|403|429|timed out)/.test(
    s,
  );
}

/** Reject if a promise doesn't settle in time — stops a hung API call from freezing ingest. */
function withTimeout<T>(p: Promise<T>, ms: number, op: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${op} timed out`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Wraps a cloud LLM so the brain never goes down when the API does. On any error
 * it transparently falls back to the offline heuristic for that call. On a
 * credit/quota/auth error it trips a cooldown and stops calling the cloud
 * entirely for a while — so a $5 key that runs dry degrades gracefully instead of
 * erroring on every ingest (and stops burning failed requests).
 */
export class ResilientLlmProvider implements LlmProvider {
  readonly model: string;
  private readonly fallback = new HeuristicProvider();
  private disabledUntil = 0;

  constructor(
    private readonly primary: LlmProvider,
    private readonly cooldownMs = Number(process.env.LLM_COOLDOWN_MS ?? 10 * 60_000),
    private readonly timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 20_000),
  ) {
    this.model = primary.model;
  }

  private get tripped(): boolean {
    return Date.now() < this.disabledUntil;
  }

  /** True while we're in cloud mode; false once tripped (so callers/health can show it). */
  get available(): boolean {
    return this.primary.available && !this.tripped;
  }

  /** Surfaced in /api/health so the UI can say "offline mode (saving credit)". */
  get degraded(): boolean {
    return this.primary.available && this.tripped;
  }

  private note(err: unknown, op: string): void {
    if (isFatalKeyError(err)) {
      this.disabledUntil = Date.now() + this.cooldownMs;
      console.warn(
        `[llm] ${op}: credit/quota/auth error — using offline heuristic for ${Math.round(
          this.cooldownMs / 60000,
        )}m`,
      );
    } else {
      console.warn(`[llm] ${op}: ${err instanceof Error ? err.message : err} — heuristic this call`);
    }
  }

  async extract(text: string, context: ContextNode[]): Promise<ExtractionResult> {
    if (this.tripped) return this.fallback.extract(text, context);
    try {
      return await withTimeout(this.primary.extract(text, context), this.timeoutMs, "extract");
    } catch (err) {
      this.note(err, "extract");
      return this.fallback.extract(text, context);
    }
  }

  async validateLink(
    source: LinkCandidate,
    target: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation> {
    if (this.tripped) return this.fallback.validateLink(source, target, similarity);
    try {
      return await withTimeout(
        this.primary.validateLink(source, target, similarity),
        this.timeoutMs,
        "validateLink",
      );
    } catch (err) {
      this.note(err, "validateLink");
      return this.fallback.validateLink(source, target, similarity);
    }
  }

  async synthesize(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<{ text: string; score: number }> {
    if (this.tripped) return this.fallback.synthesize(a, b, similarity);
    try {
      return await withTimeout(
        this.primary.synthesize(a, b, similarity),
        this.timeoutMs,
        "synthesize",
      );
    } catch (err) {
      this.note(err, "synthesize");
      return this.fallback.synthesize(a, b, similarity);
    }
  }

  async answer(
    question: string,
    context: ContextNode[],
  ): Promise<{ answer: string; citations: number[] }> {
    if (this.tripped) return this.fallback.answer(question, context);
    try {
      return await withTimeout(this.primary.answer(question, context), this.timeoutMs, "answer");
    } catch (err) {
      this.note(err, "answer");
      return this.fallback.answer(question, context);
    }
  }

  async research(node: LinkCandidate): Promise<{ label: string; content: string }> {
    if (this.tripped) return this.fallback.research(node);
    try {
      return await withTimeout(this.primary.research(node), this.timeoutMs, "research");
    } catch (err) {
      this.note(err, "research");
      return this.fallback.research(node);
    }
  }
}
