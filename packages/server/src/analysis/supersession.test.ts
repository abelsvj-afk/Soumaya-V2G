import { describe, it, expect } from "vitest";
import type { GraphNode } from "@brain/shared";
import { resolveSupersession } from "./supersession.js";

/**
 * Maya Longitudinal Intelligence, Phase A (docs/specs/maya-longitudinal-intelligence.md) —
 * `resolveSupersession` is the smallest deterministic mechanism producing the `"outdated"`/
 * `"contradicted"` `EpistemicStatus` values, which had zero producers before this pass. Pure
 * arithmetic over already-stored timestamps — no LLM, no persistence, never rewrites a memory.
 */

let nextId = 1;
function node(overrides: Partial<GraphNode> & { label: string }): GraphNode {
  return {
    id: nextId++,
    type: "memory" as GraphNode["type"],
    content: overrides.label,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveSupersession — direction of currency", () => {
  it("a legitimate state change (continuity) becomes 'outdated', never 'contradicted'", () => {
    const ford = node({ label: "I drive a Ford", occurredAt: "2026-01-01T00:00:00.000Z" });
    const chevy = node({ label: "I drive a Chevy", occurredAt: "2026-03-01T00:00:00.000Z" });

    const result = resolveSupersession(ford, chevy, "continuity");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("outdated");
    expect(result!.status).not.toBe("contradicted");
  });

  it("a genuine, already-LLM-verified conflict becomes 'contradicted'", () => {
    const oneCar = node({ label: "I only have one car", occurredAt: "2026-01-01T00:00:00.000Z" });
    const twoCars = node({ label: "I now have two cars", occurredAt: "2026-02-01T00:00:00.000Z" });

    const result = resolveSupersession(oneCar, twoCars, "contradiction");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("contradicted");
  });

  it("insufficient evidence (unparseable dates) never promotes a status — returns null, not a guess", () => {
    const a = node({ label: "A", occurredAt: "not-a-date" });
    const b = node({ label: "B", occurredAt: "2026-02-01T00:00:00.000Z" });
    expect(resolveSupersession(a, b, "continuity")).toBeNull();
  });

  it("insufficient evidence (dates too close to trust direction) never promotes a status", () => {
    const a = node({ label: "A", occurredAt: "2026-02-01T00:00:00.000Z" });
    const b = node({ label: "B", occurredAt: "2026-02-01T00:00:10.000Z" }); // 10s apart
    expect(resolveSupersession(a, b, "continuity")).toBeNull();
  });

  it("never promotes to 'confirmed' — the two possible outputs are only 'outdated'/'contradicted'", () => {
    const a = node({ label: "A", occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = node({ label: "B", occurredAt: "2026-03-01T00:00:00.000Z" });
    const result = resolveSupersession(a, b, "continuity");
    expect(["outdated", "contradicted"]).toContain(result!.status);
  });

  it("event time (occurredAt) takes precedence over creation time (createdAt)", () => {
    // b was TYPED first (earlier createdAt) but describes an event that happened LATER
    // (a backdated occurredAt is impossible here, so instead: b's occurredAt is later than
    // a's despite a later record having an earlier createdAt) — occurredAt must win.
    const a = node({ label: "A", createdAt: "2026-05-01T00:00:00.000Z", occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = node({ label: "B", createdAt: "2026-01-15T00:00:00.000Z", occurredAt: "2026-03-01T00:00:00.000Z" });

    const result = resolveSupersession(a, b, "continuity");
    expect(result).not.toBeNull();
    // a's EVENT (Jan) precedes b's EVENT (Mar), so a is superseded despite being created later.
    expect(result!.superseded.id).toBe(a.id);
    expect(result!.current.id).toBe(b.id);
  });

  it("falls back to createdAt when occurredAt is absent", () => {
    const a = node({ label: "A", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = node({ label: "B", createdAt: "2026-03-01T00:00:00.000Z" });
    const result = resolveSupersession(a, b, "continuity");
    expect(result!.superseded.id).toBe(a.id);
    expect(result!.current.id).toBe(b.id);
  });

  it("provenance is preserved — evidence refs point back to the real memory domain/id/label, never a copy", () => {
    const a = node({ label: "Older memory", occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = node({ label: "Newer memory", occurredAt: "2026-03-01T00:00:00.000Z" });
    const result = resolveSupersession(a, b, "continuity")!;

    expect(result.current).toEqual({ domain: "memory", kind: "node", id: b.id, label: b.label });
    expect(result.superseded).toEqual({ domain: "memory", kind: "node", id: a.id, label: a.label });
  });

  it("never mutates either input node — the historical record is untouched", () => {
    const a = node({ label: "Older memory", occurredAt: "2026-01-01T00:00:00.000Z" });
    const b = node({ label: "Newer memory", occurredAt: "2026-03-01T00:00:00.000Z" });
    const beforeA = { ...a };
    const beforeB = { ...b };
    resolveSupersession(a, b, "continuity");
    expect(a).toEqual(beforeA);
    expect(b).toEqual(beforeB);
  });

  it("works regardless of argument order — direction is derived from timestamps, not call order", () => {
    const older = node({ label: "Older", occurredAt: "2026-01-01T00:00:00.000Z" });
    const newer = node({ label: "Newer", occurredAt: "2026-03-01T00:00:00.000Z" });

    const forward = resolveSupersession(older, newer, "continuity")!;
    const reversed = resolveSupersession(newer, older, "continuity")!;
    expect(forward.superseded.id).toBe(older.id);
    expect(reversed.superseded.id).toBe(older.id);
    expect(forward.current.id).toBe(newer.id);
    expect(reversed.current.id).toBe(newer.id);
  });
});
