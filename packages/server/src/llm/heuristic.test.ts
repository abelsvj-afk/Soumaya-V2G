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
