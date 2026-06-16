import { describe, it, expect } from "vitest";
import { ExtractionResultSchema } from "@brain/shared";
import { normalizeExtraction } from "../llm/openai.js";

describe("extraction schema", () => {
  it("normalizes OpenAI-style null optionals so parsing yields undefined", () => {
    const raw = {
      nodes: [
        { label: "A", type: "concept", content: "x", emotionalWeight: null, importance: null },
      ],
      edges: [],
    };
    const parsed = ExtractionResultSchema.parse(normalizeExtraction(raw));
    expect(parsed.nodes[0]!.emotionalWeight).toBeUndefined();
    expect(parsed.nodes[0]!.importance).toBeUndefined();
  });

  it("keeps provided numeric weights", () => {
    const parsed = ExtractionResultSchema.parse(
      normalizeExtraction({
        nodes: [{ label: "A", type: "concept", content: "x", importance: 0.8 }],
        edges: [],
      }),
    );
    expect(parsed.nodes[0]!.importance).toBeCloseTo(0.8);
  });
});
