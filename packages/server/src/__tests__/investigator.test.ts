import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { detectResearchType, researchSteer, RESEARCH_TYPE_GUIDANCE } from "../analysis/researchType.js";
import { runInvestigation } from "../analysis/investigator.js";

/** Investigator + typed research: type detection + the internal cited deep-dive. */

describe("detectResearchType", () => {
  it("routes trauma/grief to the gentle emotional type (not generic)", () => {
    expect(detectResearchType({ content: "the grief from losing my dad still hits me", emotionalWeight: -0.6 })).toBe("emotional");
    expect(detectResearchType({ tags: ["Anxious"], content: "panic before work" })).toBe("emotional");
  });
  it("routes a business idea to business", () => {
    expect(detectResearchType({ type: "project", content: "pricing model for StudioSVJ launch, revenue" })).toBe("business");
  });
  it("routes people/money/health/learning/decision distinctly", () => {
    expect(detectResearchType({ type: "person", content: "my sister" })).toBe("relationship");
    expect(detectResearchType({ content: "rent and debt and my paycheck" })).toBe("financial");
    expect(detectResearchType({ content: "workout and sleep and nutrition plan" })).toBe("health");
    expect(detectResearchType({ type: "knowledge", content: "learning Japanese, next lesson" })).toBe("learning");
    expect(detectResearchType({ type: "decision", content: "should I move or stay" })).toBe("decision");
  });
  it("falls back to general", () => {
    expect(detectResearchType({ content: "a neutral note about the weather" })).toBe("general");
  });
  it("emotional guidance is non-clinical (notices, never diagnoses)", () => {
    expect(RESEARCH_TYPE_GUIDANCE.emotional).toMatch(/never.*diagnos|NOTICE/i);
    expect(researchSteer({ content: "trauma", emotionalWeight: -0.7 })).toBe(RESEARCH_TYPE_GUIDANCE.emotional);
  });
});

describe("runInvestigation (internal cited deep-dive)", () => {
  let handle: DbHandle;
  beforeEach(() => { handle = createDb(":memory:"); });
  afterEach(() => { handle.sqlite.close(); });

  const addNode = (label: string, opts: { content?: string; tags?: string[]; ew?: number; type?: string } = {}): number => {
    const info = handle.sqlite
      .prepare(`INSERT INTO nodes (space_id, label, type, content, tags, emotional_weight) VALUES ('s1', ?, ?, ?, ?, ?)`)
      .run(label, opts.type ?? "daily", opts.content ?? "", opts.tags ? JSON.stringify(opts.tags) : null, opts.ew ?? null);
    return Number(info.lastInsertRowid);
  };
  const link = (a: number, b: number, rel: string) =>
    handle.sqlite.prepare(`INSERT INTO edges (space_id, source, target, relationship, weight) VALUES ('s1', ?, ?, ?, 1)`).run(a, b, rel);

  it("gathers graph neighbours + shared-tag memories, cited, and assigns a type", () => {
    const subj = addNode("Dad's passing", { content: "the grief still hits me", ew: -0.7, tags: ["Grief"] });
    const linked = addNode("The funeral", { content: "hard day" });
    link(subj, linked, "caused_by");
    const tagged = addNode("Missing him at holidays", { tags: ["Grief"] });

    const report = runInvestigation(handle, "s1", subj)!;
    expect(report.researchType).toBe("emotional");
    const ids = report.evidence.map((e) => e.nodeId);
    expect(ids).toContain(linked);
    expect(ids).toContain(tagged);
    expect(report.evidence.find((e) => e.nodeId === linked)!.why).toMatch(/linked via caused_by/);
    expect(report.summary).toMatch(/does that feel true|noticing a pattern/i); // gentle, non-diagnosing
    expect(report.openQuestions.length).toBeGreaterThan(0);
  });

  it("returns null for a missing / cross-space node", () => {
    const id = addNode("mine");
    expect(runInvestigation(handle, "other", id)).toBeNull();
    expect(runInvestigation(handle, "s1", 99999)).toBeNull();
  });

  it("handles an isolated node gracefully", () => {
    const id = addNode("lonely thought", { content: "a business idea about revenue", type: "project" });
    const report = runInvestigation(handle, "s1", id)!;
    expect(report.researchType).toBe("business");
    expect(report.evidence).toHaveLength(0);
    expect(report.summary).toMatch(/isolated/i);
  });
});
