import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import { ingest } from "../ingestion/pipeline.js";
import { findCandidates, runSynthesis } from "../synthesis/engine.js";
import { buildDailyDigest } from "../synthesis/dailyDigest.js";
import { findConstellations } from "../ml/cluster.js";
import { chat } from "../chat/graphrag.js";
import { EconomyRepo, FUEL_START, FUEL_JOB_COST } from "../economy.js";
import { GraphService } from "../graph/service.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { analyzeSentiment, moodFromTone, prosodyFor, toneFrom } from "@brain/shared";

let handle: DbHandle;
const embeddings = new HashEmbeddingProvider(EMBED_DIM);
const llm = new HeuristicProvider();

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => {
  handle.sqlite.close();
});

// Ingest without associative linking so pairs stay graph-distant for synthesis.
async function add(text: string) {
  return ingest(handle, { embeddings, llm, linkOptions: { threshold: 1.01, k: 0 } }, text);
}

describe("synthesis engine", () => {
  it("finds latent (semantically near, graph-distant) pairs and writes insights", async () => {
    await add("coffee subscription business with local roasters");
    await add("coffee subscription company with local roasters");
    await add("unrelated thoughts about lunar geology and rocks");

    const candidates = findCandidates(handle, {
      threshold: 0.6,
      k: 8,
      minHops: 3,
      maxCandidates: 12,
    });
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const insights = await runSynthesis(handle, llm, {
      threshold: 0.6,
      k: 8,
      minHops: 3,
      maxCandidates: 12,
    });
    expect(insights.length).toBeGreaterThanOrEqual(1);
    expect(insights[0]!.nodes.length).toBe(2);
    expect(insights[0]!.text.length).toBeGreaterThan(0);
  });

  it("does not duplicate insights for the same pair on a second run", async () => {
    await add("morning meditation routine and breathing");
    await add("daily breathing meditation in the morning");
    const opts = { threshold: 0.5, k: 8, minHops: 3, maxCandidates: 12 };
    const first = await runSynthesis(handle, llm, opts);
    const second = await runSynthesis(handle, llm, opts);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(second.length).toBe(0);
  });
});

describe("chat (GraphRAG)", () => {
  it("retrieves relevant memories and returns cited answer", async () => {
    await add("I want to start a coffee subscription business");
    await add("my budget for the coffee startup is tight");

    const res = await chat(handle, { embeddings, llm }, "coffee subscription budget");
    expect(res.contextIds.length).toBeGreaterThanOrEqual(1);
    expect(res.answer.length).toBeGreaterThan(0);
    // Heuristic cites the retrieved context nodes; all citations are valid ids.
    expect(res.citations.length).toBeGreaterThanOrEqual(1);
    expect(res.citations.every((c) => res.contextIds.includes(c.id))).toBe(true);
  });

  it("handles an empty brain gracefully", async () => {
    const res = await chat(handle, { embeddings, llm }, "anything?");
    expect(res.contextIds).toHaveLength(0);
    expect(res.citations).toHaveLength(0);
  });

  it("attaches an emotional tone to the answer", async () => {
    await add("a thought to anchor the chat");
    const res = await chat(handle, { embeddings, llm }, "what do I think?");
    expect(res.tone).toBeDefined();
    expect(res.tone!.valence).toBeGreaterThanOrEqual(-1);
    expect(res.tone!.valence).toBeLessThanOrEqual(1);
    expect(res.tone!.intensity).toBeGreaterThanOrEqual(0);
    expect(typeof res.tone!.mood).toBe("string");
  });
});

describe("daily digest (free, no LLM)", () => {
  it("summarizes memories logged today with a link + Soumaya's take", async () => {
    await add("Launching my coffee subscription startup");
    await add("Budget runway for the startup is tight and stressful");

    const d = buildDailyDigest(handle);
    expect(d.fresh.length).toBeGreaterThanOrEqual(2);
    expect(d.greeting.length).toBeGreaterThan(0);
    expect(d.closing.length).toBeGreaterThan(0);
    // Each entry carries a focusable node ref, a snippet, and an in-character take.
    for (const e of d.fresh) {
      expect(typeof e.node.id).toBe("number");
      expect(e.snippet.length).toBeGreaterThan(0);
      expect(e.take.length).toBeGreaterThan(0);
    }
  });

  it("is empty-but-valid for a fresh brain", () => {
    const d = buildDailyDigest(handle);
    expect(d.fresh).toHaveLength(0);
    expect(d.expiredActions).toHaveLength(0);
    expect(d.greeting.length).toBeGreaterThan(0);
  });
});

describe("constellations (ML / k-means, no LLM)", () => {
  it("groups every embedded memory into a named constellation", async () => {
    const texts = [
      "Launching my coffee subscription startup",
      "Partnering with local coffee roasters",
      "Pricing the coffee subscription tiers",
      "My mother's birthday is in October",
      "A hard conversation with my father",
      "Calling an old friend I miss",
    ];
    for (const t of texts) await add(t);

    const cs = findConstellations(handle);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    // Every memory lands in exactly one constellation; names + cohesion are valid.
    const total = cs.reduce((n, c) => n + c.nodes.length, 0);
    expect(total).toBe(texts.length);
    for (const c of cs) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.cohesion).toBeGreaterThanOrEqual(0);
      expect(c.cohesion).toBeLessThanOrEqual(1);
    }
  });

  it("returns nothing for a brain too small to cluster", async () => {
    await add("only one thought");
    expect(findConstellations(handle)).toHaveLength(0);
  });
});

describe("celestial economy — fuel", () => {
  it("starts at the default and earns/spends, clamped and gated", () => {
    const econ = new EconomyRepo(handle, "spaceA");
    expect(econ.get()).toBe(FUEL_START);
    econ.add(10);
    expect(econ.get()).toBe(FUEL_START + 10);
    expect(econ.canRunJob()).toBe(true);
    expect(econ.spend(FUEL_JOB_COST)).toBe(true);
    expect(econ.get()).toBe(FUEL_START + 10 - FUEL_JOB_COST);
  });

  it("can't spend more than it has, and idles at zero", () => {
    const econ = new EconomyRepo(handle, "spaceB");
    expect(econ.spend(FUEL_START + 999)).toBe(false);
    expect(econ.get()).toBe(FUEL_START); // unchanged on a failed spend
  });

  it("keeps each brain's fuel separate", () => {
    const a = new EconomyRepo(handle, "spaceA");
    const b = new EconomyRepo(handle, "spaceB");
    a.add(20);
    expect(a.get()).toBe(FUEL_START + 20);
    expect(b.get()).toBe(FUEL_START); // untouched
  });
});

describe("vec re-embedding (research/merging growth)", () => {
  it("upsertEmbedding overwrites an existing node's vector without crashing", async () => {
    const { upsertEmbedding, getEmbedding } = await import("../db/vec.js");
    const v1 = new Float32Array(EMBED_DIM).fill(0.1);
    const v2 = new Float32Array(EMBED_DIM).fill(0.2);
    upsertEmbedding(handle.sqlite, 4242, v1);
    // Re-embedding the SAME id used to throw "UNIQUE constraint failed".
    expect(() => upsertEmbedding(handle.sqlite, 4242, v2)).not.toThrow();
    expect(getEmbedding(handle.sqlite, 4242)?.[0]).toBeCloseTo(0.2, 5);
  });
});

describe("celestial economy — entropy", () => {
  it("cools a neglected memory and resets to 0 when tended", async () => {
    const res = await ingest(
      handle,
      { embeddings, llm, linkOptions: { threshold: 1.01, k: 0 } },
      "an old reflection left untended",
    );
    const id = res.nodes[0]!.id;
    // Backdate the tend clock ~40 days to simulate long neglect.
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    handle.sqlite.prepare(`UPDATE nodes SET last_tended_at = ? WHERE id = ?`).run(old, id);

    const cold = new GraphService(handle).getNode(id);
    expect(cold?.entropy ?? 0).toBeGreaterThan(0.5);

    // Revisiting tends it -> entropy resets.
    new NodesRepo(handle).tend(id);
    const warm = new GraphService(handle).getNode(id);
    expect(warm?.entropy ?? 1).toBeLessThan(0.05);
  });
});

describe("telegram bridge (chat + log, no network)", () => {
  const ctxOf = () => ({ handle, embeddings, llm }) as any;
  const collect = () => {
    const sent: string[] = [];
    return { sent, send: async (_chatId: number, text: string) => void sent.push(text) };
  };

  it("/log ingests a memory and confirms with fuel", async () => {
    const { handleTelegramUpdate } = await import("../telegram/bot.js");
    const { sent, send } = collect();
    await handleTelegramUpdate(
      ctxOf(),
      { message: { chat: { id: 1 }, text: "/log buy oat milk on the way home" } },
      send,
    );
    expect(sent[0]).toMatch(/Logged/i);
    expect(sent[0]).toMatch(/⛽/);
    expect(new NodesRepo(handle).count()).toBeGreaterThan(0);
  });

  it("a plain message is answered from the brain", async () => {
    await ingest(handle, { embeddings, llm }, "my dentist appointment is Tuesday", "legacy");
    const { handleTelegramUpdate } = await import("../telegram/bot.js");
    const { sent, send } = collect();
    await handleTelegramUpdate(ctxOf(), { message: { chat: { id: 1 }, text: "when is the dentist?" } }, send);
    expect(sent.length).toBe(1);
    expect(typeof sent[0]).toBe("string");
    expect(sent[0]!.length).toBeGreaterThan(0);
  });

  it("/help explains the commands", async () => {
    const { handleTelegramUpdate } = await import("../telegram/bot.js");
    const { sent, send } = collect();
    await handleTelegramUpdate(ctxOf(), { message: { chat: { id: 1 }, text: "/help" } }, send);
    expect(sent[0]).toMatch(/\/log/);
  });
});

describe("offline emotion (heuristic sets emotionalWeight)", () => {
  it("charges nodes positive/negative from wording with no LLM key", async () => {
    const warm = await add("a grateful, joyful, wonderful day with people I love");
    const cold = await add("a lonely day of grief, fear and pain");
    expect(warm.nodes[0]!.emotionalWeight ?? 0).toBeGreaterThan(0);
    expect(cold.nodes[0]!.emotionalWeight ?? 0).toBeLessThan(0);
  });
});

describe("dramatization filter (voice tone)", () => {
  it("reads positive vs negative wording", () => {
    expect(analyzeSentiment("I am so grateful and happy, this is wonderful").valence).toBeGreaterThan(0);
    expect(analyzeSentiment("I feel lost, grief and pain, so alone").valence).toBeLessThan(0);
  });

  it("maps tone to a mood and to sane prosody", () => {
    const bright = toneFrom("what a joyful, beautiful win!", 0.8);
    expect(bright.valence).toBeGreaterThan(0);
    expect(["joyful", "calm", "playful", "tender"]).toContain(bright.mood);

    const heavy = toneFrom("a somber loss, heavy grief", -0.8);
    expect(heavy.valence).toBeLessThan(0);

    // Heavier feelings should slow her delivery relative to brighter ones.
    expect(prosodyFor(heavy).rate).toBeLessThan(prosodyFor(bright).rate);
    // Prosody stays within speech-synthesis-safe ranges.
    for (const t of [bright, heavy]) {
      const p = prosodyFor(t);
      expect(p.rate).toBeGreaterThanOrEqual(0.7);
      expect(p.rate).toBeLessThanOrEqual(1.25);
      expect(p.pitch).toBeGreaterThanOrEqual(0.7);
      expect(p.pitch).toBeLessThanOrEqual(1.4);
    }
  });

  it("treats flat text as neutral", () => {
    expect(moodFromTone(0, 0.1)).toBe("neutral");
  });
});

describe("heuristic link validation (offline, no LLM)", () => {
  it("links thoughts that share real topical vocabulary", async () => {
    const r = await llm.validateLink(
      { label: "Coffee startup", content: "launching a coffee subscription company" },
      { label: "Coffee budget", content: "the coffee startup budget is tight" },
      0.7,
    );
    expect(r.linked).toBe(true);
    expect(r.weight ?? 0).toBeGreaterThan(0);
  });

  it("refuses to link unrelated thoughts at moderate similarity", async () => {
    const r = await llm.validateLink(
      { label: "Quantum lattice", content: "quantum chromodynamics gauge theory" },
      { label: "Apple pie", content: "grandmother's apple pie recipe" },
      0.7,
    );
    expect(r.linked).toBe(false);
  });

  it("still links on an unambiguous (very high) cosine match", async () => {
    const r = await llm.validateLink(
      { label: "Totally distinct A", content: "alpha bravo charlie" },
      { label: "Totally distinct B", content: "delta echo foxtrot" },
      0.95,
    );
    expect(r.linked).toBe(true);
  });
});
