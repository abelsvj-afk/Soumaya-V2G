import { EXTRACTABLE_NODE_TYPES, RELATIONSHIP_TYPES, ExtractionResultSchema, type ExtractionResult, type FinExtractionResult } from "@brain/shared";
import type { AnswerOptions, AnswerResult, ContextNode, ContradictionResult, LinkCandidate, LinkValidation, LlmProvider } from "./adapter.js";
import {
  EXTRACTION_SYSTEM,
  LINK_SYSTEM,
  SYNTHESIS_SYSTEM,
  CONTRADICTION_SYSTEM,
  composeSystem,
  RESEARCH_SYSTEM,
  SECTOR_SYSTEM,
  LOG_SYSTEM,
  CHRONICLE_SYSTEM,
  PLAN_SYSTEM,
  DISTILL_SYSTEM,
  CONSOLIDATE_SYSTEM,
  buildExtractionPrompt,
  buildLinkPrompt,
  buildSynthesisPrompt,
  buildContradictionPrompt,
  buildAnswerPrompt,
  buildResearchPrompt,
  buildSectorPrompt,
  buildLogPrompt,
  buildChroniclePrompt,
  buildPlanPrompt,
  buildDistillPrompt,
  buildConsolidatePrompt,
} from "./prompts.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * OpenAI's strict structured output requires every property in `required` and
 * emits `null` for ones the model leaves blank. Our zod schema treats these as
 * optional (number | undefined), so drop the nulls before validating.
 */
export function normalizeExtraction(raw: unknown): unknown {
  if (raw && typeof raw === "object" && Array.isArray((raw as { nodes?: unknown[] }).nodes)) {
    for (const n of (raw as { nodes: Record<string, unknown>[] }).nodes) {
      if (n.emotionalWeight == null) delete n.emotionalWeight;
      if (n.importance == null) delete n.importance;
      if (n.celestialTitle == null) delete n.celestialTitle;
      if (n.color == null) delete n.color;
    }
  }
  return raw;
}

/**
 * Drop-in alternate provider using OpenAI's JSON-schema structured output.
 * Implemented via fetch to avoid an extra SDK dependency.
 */
export class OpenAiProvider implements LlmProvider {
  readonly available = true;
  readonly model = MODEL;
  constructor(
    private apiKey: string,
    private recordUsage?: (model: string, inputTokens: number, outputTokens: number) => void,
  ) {}

  private async json<T>(system: string, user: string, schema: object, name: string, temperature = 0.2): Promise<T> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        // Chat runs HOT for varied, human phrasing; structured jobs stay cold.
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name, strict: true, schema },
        },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    if (this.recordUsage && body.usage) {
      this.recordUsage(MODEL, body.usage.prompt_tokens ?? 0, body.usage.completion_tokens ?? 0);
    }
    // A refusal or truncated response can yield null/empty content; surface a clear
    // error so ResilientLlmProvider degrades to the heuristic instead of JSON.parse(undefined).
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content (refusal or empty response).");
    return JSON.parse(content) as T;
  }

  /**
   * Financial OS (Stage 1c): read a screenshot/PDF of income or expenses and return DRAFT
   * candidates. Best-effort + fully guarded — ANY failure returns null so the ingest route
   * degrades to manual entry (no feature hard-depends on a vision key). Amounts requested in
   * integer cents. gpt-4o-mini is vision-capable.
   */
  async extractFinancialImage(image: { dataUrl: string; mime: string }): Promise<FinExtractionResult | null> {
    try {
      const system =
        "You read a screenshot of financial transactions (pay stub, gig earnings like GoPuff/DoorDash/Uber/Spark, or bank/Cash App/Venmo activity). " +
        "Return ONLY JSON: {\"incomes\":[{\"date\":\"YYYY-MM-DD or null\",\"netCents\":int,\"platform\":str or null,\"confidence\":0..1}]," +
        "\"expenses\":[{\"date\":\"YYYY-MM-DD or null\",\"amountCents\":int,\"merchant\":str or null,\"direction\":\"out\",\"confidence\":0..1}]}. " +
        "Money in INTEGER CENTS (e.g. $44.30 -> 4430). Income = money received; expense = money spent. Omit totals/balances. If unsure, use lower confidence.";
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: [
              { type: "text", text: "Extract the income and expense line items from this image." },
              { type: "image_url", image_url: { url: image.dataUrl } },
            ] },
          ],
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      if (this.recordUsage && body.usage) this.recordUsage(MODEL, body.usage.prompt_tokens ?? 0, body.usage.completion_tokens ?? 0);
      const content = body.choices?.[0]?.message?.content;
      if (!content) return null;
      const raw = JSON.parse(content) as { incomes?: unknown[]; expenses?: unknown[] };
      const cents = (v: unknown): number => Math.abs(Math.round(Number(v) || 0));
      const conf = (v: unknown): number => Math.max(0, Math.min(1, Number(v) || 0.5));
      const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
      const date = (v: unknown): string | undefined => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
      const incomes = (Array.isArray(raw.incomes) ? raw.incomes : [])
        .map((i: any) => ({ date: date(i?.date), netCents: cents(i?.netCents), platform: str(i?.platform), confidence: conf(i?.confidence) }))
        .filter((i) => i.netCents > 0);
      const expenses = (Array.isArray(raw.expenses) ? raw.expenses : [])
        .map((e: any) => ({ date: date(e?.date), amountCents: cents(e?.amountCents), merchant: str(e?.merchant), direction: "out" as const, confidence: conf(e?.confidence) }))
        .filter((e) => e.amountCents > 0);
      return { incomes, expenses, provider: "vision" };
    } catch {
      return null; // any failure → caller falls back to manual entry
    }
  }

  async extract(text: string, context: ContextNode[]): Promise<ExtractionResult> {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              celestialTitle: { type: ["string", "null"] },
              // EXTRACTABLE_NODE_TYPES (excludes "moc") — see gemini.ts for why the full
              // NODE_TYPES enum here would let the model pick a type the response validator
              // (NodeTypeSchema) rejects, silently downgrading the ingest to the heuristic path.
              type: { type: "string", enum: [...EXTRACTABLE_NODE_TYPES] },
              content: { type: "string" },
              emotionalWeight: { type: ["number", "null"] },
              importance: { type: ["number", "null"] },
              color: { type: ["string", "null"] },
            },
            required: ["label", "celestialTitle", "type", "content", "emotionalWeight", "importance", "color"],
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              sourceLabel: { type: "string" },
              targetLabel: { type: "string" },
              relationship: { type: "string", enum: [...RELATIONSHIP_TYPES] },
            },
            required: ["sourceLabel", "targetLabel", "relationship"],
          },
        },
      },
      required: ["nodes", "edges"],
    };
    const raw = await this.json<unknown>(
      EXTRACTION_SYSTEM,
      buildExtractionPrompt(text, context),
      schema,
      "extraction",
    );
    return ExtractionResultSchema.parse(normalizeExtraction(raw));
  }

  async validateLink(
    source: LinkCandidate,
    target: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation> {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        linked: { type: "boolean" },
        relationship: { type: ["string", "null"], enum: [...RELATIONSHIP_TYPES, null] },
        weight: { type: ["number", "null"] },
      },
      required: ["linked", "relationship", "weight"],
    };
    const raw = await this.json<LinkValidation>(
      LINK_SYSTEM,
      buildLinkPrompt(source, target, similarity),
      schema,
      "link",
    );
    return {
      linked: Boolean(raw.linked),
      relationship: raw.relationship ?? undefined,
      weight: typeof raw.weight === "number" ? raw.weight : similarity,
    };
  }

  async synthesize(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<{ text: string; score: number }> {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" }, score: { type: "number" } },
      required: ["text", "score"],
    };
    const raw = await this.json<{ text: string; score: number }>(
      SYNTHESIS_SYSTEM,
      buildSynthesisPrompt(a, b, similarity),
      schema,
      "synthesis",
    );
    return { text: raw.text, score: typeof raw.score === "number" ? raw.score : similarity };
  }

  async detectContradiction(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<ContradictionResult> {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        conflict: { type: "boolean" },
        text: { type: "string" },
        score: { type: "number" },
      },
      required: ["conflict", "text", "score"],
    };
    const raw = await this.json<ContradictionResult>(
      CONTRADICTION_SYSTEM,
      buildContradictionPrompt(a, b, similarity),
      schema,
      "contradiction",
    );
    return {
      conflict: !!raw.conflict,
      text: raw.conflict ? String(raw.text ?? "") : "",
      score: raw.conflict ? (typeof raw.score === "number" ? raw.score : similarity) : 0,
    };
  }

  async answer(question: string, context: ContextNode[], opts?: AnswerOptions): Promise<AnswerResult> {
    // Strict structured outputs require every property listed in `required`, so the
    // optional askBack is modeled as "empty string = none".
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        citations: { type: "array", items: { type: "integer" } },
        mood: {
          type: "string",
          enum: ["happy", "excited", "warm", "thoughtful", "concerned", "sad", "neutral"],
        },
        askBack: { type: "string" },
        usedRoles: { type: "array", items: { type: "string" } },
      },
      required: ["answer", "citations", "mood", "askBack", "usedRoles"],
    };
    const raw = await this.json<AnswerResult>(
      composeSystem(opts), // Layer 1 + About-Me + Layer 2 (custom instructions)
      buildAnswerPrompt(question, context, opts?.knowledge, opts?.history, opts?.justAsked),
      schema,
      "answer",
      0.85, // conversational warmth + variety
    );
    return {
      answer: raw.answer ?? "",
      citations: Array.isArray(raw.citations) ? raw.citations : [],
      mood: typeof raw.mood === "string" ? raw.mood : undefined,
      askBack: typeof raw.askBack === "string" && raw.askBack.trim() ? raw.askBack.trim() : undefined,
      usedRoles: Array.isArray(raw.usedRoles) ? raw.usedRoles.filter((x) => typeof x === "string") : undefined,
    };
  }

  async research(
    node: LinkCandidate,
    userAnswers?: string,
  ): Promise<{ label: string; content: string; questions?: string[] }> {
    return await this.json<{ label: string; content: string; questions?: string[] }>(
      RESEARCH_SYSTEM,
      buildResearchPrompt(node, userAnswers),
      {
        type: "object",
        properties: {
          label: { type: "string" },
          content: { type: "string" },
          questions: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["label", "content", "questions"],
        additionalProperties: false,
      },
      "research",
    );
  }

  async summarizeSector(nodes: LinkCandidate[]): Promise<string> {
    const raw = await this.json<{ vibe: string }>(
      SECTOR_SYSTEM,
      buildSectorPrompt(nodes),
      {
        type: "object",
        properties: { vibe: { type: "string" } },
        required: ["vibe"],
        additionalProperties: false,
      },
      "sector",
    );
    return raw.vibe;
  }

  async generateDailyLog(newNodes: LinkCandidate[], actions: string[], persona?: string): Promise<string> {
    const raw = await this.json<{ log: string }>(
      persona ? `${LOG_SYSTEM}\n\nABOUT THE USER (be aware of who you serve, never become them):\n${persona}` : LOG_SYSTEM,
      buildLogPrompt(newNodes, actions),
      {
        type: "object",
        properties: { log: { type: "string" } },
        required: ["log"],
        additionalProperties: false,
      },
      "log",
    );
    return raw.log;
  }

  async chronicle(subject: string, context: string): Promise<string> {
    const raw = await this.json<{ lore: string }>(
      CHRONICLE_SYSTEM,
      buildChroniclePrompt(subject, context),
      {
        type: "object",
        properties: { lore: { type: "string" } },
        required: ["lore"],
        additionalProperties: false,
      },
      "chronicle",
    );
    return raw.lore;
  }

  async consolidate(nodes: LinkCandidate[]): Promise<{ belief: string; confidence: number }> {
    const raw = await this.json<{ belief: string; confidence: number }>(
      CONSOLIDATE_SYSTEM,
      buildConsolidatePrompt(nodes),
      {
        type: "object",
        properties: { belief: { type: "string" }, confidence: { type: "number" } },
        required: ["belief", "confidence"],
        additionalProperties: false,
      },
      "consolidate",
    );
    return {
      belief: String(raw.belief ?? "").trim(),
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    };
  }

  async planJob(summary: string, options: { type: string; objective: string }[]): Promise<number> {
    const raw = await this.json<{ index: number }>(
      PLAN_SYSTEM,
      buildPlanPrompt(summary, options),
      {
        type: "object",
        properties: { index: { type: "integer" } },
        required: ["index"],
        additionalProperties: false,
      },
      "plan",
    );
    return raw.index;
  }

  async distill(transcript: string): Promise<string[]> {
    const raw = await this.json<{ summaries: string[] }>(
      DISTILL_SYSTEM,
      buildDistillPrompt(transcript),
      {
        type: "object",
        properties: { summaries: { type: "array", items: { type: "string" } } },
        required: ["summaries"],
        additionalProperties: false,
      },
      "distill",
    );
    return Array.isArray(raw.summaries) ? raw.summaries : [];
  }
}
