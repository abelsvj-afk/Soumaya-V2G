import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getCachedNpcLine, pickDialogueOutcome, refreshNpcLinesIfStale, NPC_LLM_COOLDOWN_MS } from "./npcLlmDialogue.js";
import { allSocietyNpcIds } from "./npcDialogue.js";

const SPACE = "test-space";
const NPC_COUNT = allSocietyNpcIds().length;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("pickDialogueOutcome (npc-llm-dialogue.md decision #4)", () => {
  it("is deterministic — same npcId + seed always picks the same outcome", () => {
    expect(pickDialogueOutcome("bank-0", 42)).toBe(pickDialogueOutcome("bank-0", 42));
  });

  it("varies as the seed advances (repeated interactions aren't stuck on one outcome)", () => {
    const outcomes = new Set(Array.from({ length: 12 }, (_, i) => pickDialogueOutcome("bank-0", i)));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("only ever returns one of the three real outcomes", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(["llm", "pool", "gesture"]).toContain(pickDialogueOutcome("townHall-1", seed));
    }
  });
});

describe("getCachedNpcLine", () => {
  it("returns null when nothing has ever been cached", () => {
    expect(getCachedNpcLine(SPACE, "bank-0")).toBeNull();
  });

  it("returns null for an npc id not present in a real cache", () => {
    localStorage.setItem(`brain.npcLlm.cache.${SPACE}`, JSON.stringify({ lines: { "bank-0": "hi" }, fetchedAt: Date.now() }));
    expect(getCachedNpcLine(SPACE, "bank-1")).toBeNull();
    expect(getCachedNpcLine(SPACE, "bank-0")).toBe("hi");
  });
});

describe("refreshNpcLinesIfStale", () => {
  it("skips the network call entirely when the cache is still fresh", async () => {
    localStorage.setItem(`brain.npcLlm.cache.${SPACE}`, JSON.stringify({ lines: {}, fetchedAt: Date.now() }));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await refreshNpcLinesIfStale(SPACE, 10);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls the route and writes the cache when nothing is cached yet", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ lines: Array(NPC_COUNT).fill("a real flavored line") }), { status: 200 }),
    );
    await refreshNpcLinesIfStale(SPACE, 10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getCachedNpcLine(SPACE, "bank-0")).toBe("a real flavored line");
  });

  it("calls again once the cooldown has genuinely elapsed", async () => {
    localStorage.setItem(`brain.npcLlm.cache.${SPACE}`, JSON.stringify({ lines: {}, fetchedAt: Date.now() - NPC_LLM_COOLDOWN_MS - 1 }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ lines: Array(NPC_COUNT).fill("fresh line") }), { status: 200 }),
    );
    await refreshNpcLinesIfStale(SPACE, 10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves the existing cache in place on a network failure — never throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    localStorage.setItem(`brain.npcLlm.cache.${SPACE}`, JSON.stringify({ lines: { "bank-0": "old line" }, fetchedAt: 0 }));
    await expect(refreshNpcLinesIfStale(SPACE, 10)).resolves.toBeUndefined();
    expect(getCachedNpcLine(SPACE, "bank-0")).toBe("old line");
  });

  it("leaves the cache untouched on a non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await refreshNpcLinesIfStale(SPACE, 10);
    expect(getCachedNpcLine(SPACE, "bank-0")).toBeNull();
  });
});
