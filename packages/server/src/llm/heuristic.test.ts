import { describe, it, expect } from "vitest";
import { HeuristicProvider } from "./heuristic.js";

const llm = new HeuristicProvider();

describe("HeuristicProvider.interpretClarificationAnswer (I2)", () => {
  it("recognizes an explicit affirmative reply as answering the question", async () => {
    const r = await llm.interpretClarificationAnswer(
      "Is this the same 2016 vehicle you mentioned before?",
      "Yes. It was totaled in an accident.",
    );
    expect(r.answers).toBe(true);
    expect(r.confirmedStatement).toBe("It was totaled in an accident.");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("recognizes an explicit negative reply as answering the question", async () => {
    const r = await llm.interpretClarificationAnswer(
      "Is this the same 2016 vehicle you mentioned before?",
      "No, this is a different car entirely.",
    );
    expect(r.answers).toBe(true);
    expect(r.confirmedStatement.length).toBeGreaterThan(0);
  });

  it("recognizes a substantive reply with topical overlap even without yes/no", async () => {
    const r = await llm.interpretClarificationAnswer(
      "Is this the same 2016 vehicle you mentioned before?",
      "That vehicle was actually totaled last month.",
    );
    expect(r.answers).toBe(true);
    expect(r.confirmedStatement).toContain("totaled");
  });

  it("does NOT treat an unrelated new topic as an answer", async () => {
    const r = await llm.interpretClarificationAnswer(
      "Is this the same 2016 vehicle you mentioned before?",
      "I had pizza for lunch today.",
    );
    expect(r.answers).toBe(false);
    expect(r.confirmedStatement).toBe("");
    expect(r.confidence).toBe(0);
  });

  it("does NOT treat empty/whitespace-only input as an answer", async () => {
    const r = await llm.interpretClarificationAnswer("Is this the same vehicle?", "   ");
    expect(r.answers).toBe(false);
  });

  it("strips a leading yes/no acknowledgement so the stored fact reads as a statement", async () => {
    const r = await llm.interpretClarificationAnswer(
      "Did you change jobs recently?",
      "Yes, I started a new job last week.",
    );
    expect(r.confirmedStatement).toBe("I started a new job last week.");
  });
});

/** The Overworld is a town, not a spaceship in a galaxy (soumaya-governance.md) — Soumaya's own
 *  offline/no-key voice must never fall back into the deleted 3D galaxy's space-cosmology
 *  language. A real regression test, not just a one-off prose edit. */
describe("HeuristicProvider.answer — voice matches the Overworld, not the deleted galaxy", () => {
  const SPACE_WORDS = /galaxy|starlight|stardate|plot a course|nebula|celestial|cosmic|spaceship|starpilot/i;

  it("never uses space-cosmology language for chitchat with no memories", async () => {
    const r = await llm.answer("how's it going", []);
    expect(r.answer).not.toMatch(SPACE_WORDS);
  });

  it("never uses space-cosmology language for a heavy topic with no memories", async () => {
    const r = await llm.answer("I've been really anxious about this", []);
    expect(r.answer).not.toMatch(SPACE_WORDS);
  });

  it("never uses space-cosmology language for a plain topic with no memories", async () => {
    const r = await llm.answer("what do you know about my car", []);
    expect(r.answer).not.toMatch(SPACE_WORDS);
  });

  it("never uses space-cosmology language when memories ARE found", async () => {
    const r = await llm.answer("tell me about work", [
      { id: 1, label: "New job", content: "Started a new job", type: "daily", occurredAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(r.answer).not.toMatch(SPACE_WORDS);
  });

  it("generateDailyLog never uses a spacefaring 'Stardate' framing", async () => {
    const log = await llm.generateDailyLog([{ label: "n", content: "c" }], []);
    expect(log).not.toMatch(SPACE_WORDS);
  });
});
