import { NODE_TYPES, RELATIONSHIP_TYPES, ExtractionResultSchema, type ExtractionResult } from "@brain/shared";
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
              type: { type: "string", enum: [...NODE_TYPES] },
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
