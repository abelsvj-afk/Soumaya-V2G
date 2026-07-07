import { GoogleGenAI, Type } from "@google/genai";
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

const MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";

// Explicit, FLAT response schemas (deep schemas are fragile — see research).
const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          celestialTitle: { type: Type.STRING },
          type: { type: Type.STRING, enum: [...NODE_TYPES] },
          content: { type: Type.STRING },
          emotionalWeight: { type: Type.NUMBER },
          importance: { type: Type.NUMBER },
          color: { type: Type.STRING },
        },
        required: ["label", "type", "content"],
      },
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceLabel: { type: Type.STRING },
          targetLabel: { type: Type.STRING },
          relationship: { type: Type.STRING, enum: [...RELATIONSHIP_TYPES] },
        },
        required: ["sourceLabel", "targetLabel", "relationship"],
      },
    },
  },
  required: ["nodes", "edges"],
};

const linkSchema = {
  type: Type.OBJECT,
  properties: {
    linked: { type: Type.BOOLEAN },
    relationship: { type: Type.STRING, enum: [...RELATIONSHIP_TYPES] },
    weight: { type: Type.NUMBER },
  },
  required: ["linked"],
};

const synthesisSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    score: { type: Type.NUMBER },
  },
  required: ["text", "score"],
};

const contradictionSchema = {
  type: Type.OBJECT,
  properties: {
    conflict: { type: Type.BOOLEAN },
    text: { type: Type.STRING },
    score: { type: Type.NUMBER },
  },
  required: ["conflict", "text", "score"],
};

const answerSchema = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    citations: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    mood: {
      type: Type.STRING,
      enum: ["happy", "excited", "warm", "thoughtful", "concerned", "sad", "neutral"],
    },
    askBack: { type: Type.STRING },
  },
  required: ["answer", "citations", "mood"],
};

const researchSchema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    content: { type: Type.STRING },
    questions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["label", "content", "questions"],
};

const sectorSchema = {
  type: Type.OBJECT,
  properties: {
    vibe: { type: Type.STRING },
  },
  required: ["vibe"],
};

const logSchema = {
  type: Type.OBJECT,
  properties: {
    log: { type: Type.STRING },
  },
  required: ["log"],
};

const chronicleSchema = {
  type: Type.OBJECT,
  properties: {
    lore: { type: Type.STRING },
  },
  required: ["lore"],
};

const planSchema = {
  type: Type.OBJECT,
  properties: {
    index: { type: Type.INTEGER },
  },
  required: ["index"],
};

const distillSchema = {
  type: Type.OBJECT,
  properties: {
    summaries: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summaries"],
};

const consolidateSchema = {
  type: Type.OBJECT,
  properties: {
    belief: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
  },
  required: ["belief", "confidence"],
};

export class GeminiProvider implements LlmProvider {
  readonly available = true;
  readonly model = MODEL;
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly recordUsage?: (model: string, inputTokens: number, outputTokens: number) => void,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async json<T>(
    systemInstruction: string,
    prompt: string,
    schema: object,
    // Chat runs HOT so her phrasing varies turn to turn (low temp made every
    // reply the same shape). Structured jobs (extraction/linking) stay cold.
    temperature = 0.2,
  ): Promise<T> {
    const res = await this.ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature,
      },
    });
    // Feed the budget meter — without this the deployment's USD cap never trips.
    const meta = res.usageMetadata;
    if (meta) {
      this.recordUsage?.(MODEL, meta.promptTokenCount ?? 0, meta.candidatesTokenCount ?? 0);
    }
    const text = res.text ?? "";
    return JSON.parse(text) as T;
  }

  async extract(text: string, context: ContextNode[]): Promise<ExtractionResult> {
    const prompt = buildExtractionPrompt(text, context);
    // One retry on schema-validation failure before giving up.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.json<unknown>(EXTRACTION_SYSTEM, prompt, extractionSchema);
        return ExtractionResultSchema.parse(raw);
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
    throw new Error("unreachable");
  }

  async validateLink(
    source: LinkCandidate,
    target: LinkCandidate,
    similarity: number,
  ): Promise<LinkValidation> {
    const raw = await this.json<LinkValidation>(
      LINK_SYSTEM,
      buildLinkPrompt(source, target, similarity),
      linkSchema,
    );
    return {
      linked: Boolean(raw.linked),
      relationship: raw.relationship,
      weight: typeof raw.weight === "number" ? raw.weight : similarity,
    };
  }

  async synthesize(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<{ text: string; score: number }> {
    const raw = await this.json<{ text: string; score: number }>(
      SYNTHESIS_SYSTEM,
      buildSynthesisPrompt(a, b, similarity),
      synthesisSchema,
    );
    return {
      text: raw.text,
      score: typeof raw.score === "number" ? raw.score : similarity,
    };
  }

  async detectContradiction(
    a: LinkCandidate,
    b: LinkCandidate,
    similarity: number,
  ): Promise<ContradictionResult> {
    const raw = await this.json<ContradictionResult>(
      CONTRADICTION_SYSTEM,
      buildContradictionPrompt(a, b, similarity),
      contradictionSchema,
    );
    return {
      conflict: !!raw.conflict,
      text: raw.conflict ? String(raw.text ?? "") : "",
      score: raw.conflict ? (typeof raw.score === "number" ? raw.score : similarity) : 0,
    };
  }

  async answer(question: string, context: ContextNode[], opts?: AnswerOptions): Promise<AnswerResult> {
    const raw = await this.json<AnswerResult>(
      composeSystem(opts), // Layer 1 + About-Me + Layer 2 (custom instructions)
      buildAnswerPrompt(question, context, opts?.knowledge, opts?.history, opts?.justAsked),
      answerSchema,
      0.85, // conversational warmth + variety
    );
    return {
      answer: raw.answer ?? "",
      citations: Array.isArray(raw.citations) ? raw.citations : [],
      mood: typeof raw.mood === "string" ? raw.mood : undefined,
      askBack: typeof raw.askBack === "string" && raw.askBack.trim() ? raw.askBack.trim() : undefined,
    };
  }

  async research(
    node: LinkCandidate,
    userAnswers?: string,
  ): Promise<{ label: string; content: string; questions?: string[] }> {
    return await this.json<{ label: string; content: string; questions?: string[] }>(
      RESEARCH_SYSTEM,
      buildResearchPrompt(node, userAnswers),
      researchSchema,
    );
  }

  async summarizeSector(nodes: LinkCandidate[]): Promise<string> {
    const raw = await this.json<{ vibe: string }>(
      SECTOR_SYSTEM,
      buildSectorPrompt(nodes),
      sectorSchema,
    );
    return raw.vibe;
  }

  async generateDailyLog(newNodes: LinkCandidate[], actions: string[], persona?: string): Promise<string> {
    const raw = await this.json<{ log: string }>(
      persona ? `${LOG_SYSTEM}\n\nABOUT THE USER (be aware of who you serve, never become them):\n${persona}` : LOG_SYSTEM,
      buildLogPrompt(newNodes, actions),
      logSchema,
    );
    return raw.log;
  }

  async consolidate(nodes: LinkCandidate[]): Promise<{ belief: string; confidence: number }> {
    const raw = await this.json<{ belief: string; confidence: number }>(
      CONSOLIDATE_SYSTEM,
      buildConsolidatePrompt(nodes),
      consolidateSchema,
    );
    return {
      belief: String(raw.belief ?? "").trim(),
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    };
  }

  async chronicle(subject: string, context: string): Promise<string> {
    const raw = await this.json<{ lore: string }>(
      CHRONICLE_SYSTEM,
      buildChroniclePrompt(subject, context),
      chronicleSchema,
    );
    return raw.lore;
  }

  async planJob(summary: string, options: { type: string; objective: string }[]): Promise<number> {
    const raw = await this.json<{ index: number }>(
      PLAN_SYSTEM,
      buildPlanPrompt(summary, options),
      planSchema,
    );
    return raw.index;
  }

  async distill(transcript: string): Promise<string[]> {
    const raw = await this.json<{ summaries: string[] }>(
      DISTILL_SYSTEM,
      buildDistillPrompt(transcript),
      distillSchema,
    );
    return Array.isArray(raw.summaries) ? raw.summaries : [];
  }
}
