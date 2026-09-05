import { describe, it, expect } from "vitest";
import { rationaleFor } from "../maintenance/jobRationale.js";

/** The pure job-rationale copy extracted from agent.ts (D4). */
describe("rationaleFor", () => {
  it("interpolates the memory labels into the objective per job type", () => {
    expect(rationaleFor("synthesis", "Alpha", "Beta").objective).toBe('Connect "Alpha" with "Beta"');
    expect(rationaleFor("research", "Alpha", "").objective).toBe('Deep-dive research on "Alpha"');
    expect(rationaleFor("merging", "Alpha", "Beta").objective).toContain('"Alpha"');
    expect(rationaleFor("daily_log", "", "").objective).toBe("Write today's Captain's Log");
  });

  it("always returns all three explainable fields, and falls back to patrol", () => {
    for (const t of ["synthesis", "research", "merging", "pruning", "harmonization", "sector_vibe", "calibration", "daily_log", "patrol"] as const) {
      const r = rationaleFor(t, "x", "y");
      expect(r.objective && r.why && r.benefit).toBeTruthy();
    }
    // An unknown type falls through to the patrol copy (never crashes).
    expect(rationaleFor("mystery" as never, "x", "y").objective).toContain("patrol");
  });

  it("Phase U bug fix: research's optional `detail` reaches `why`, matching the same factors text agent.ts already embeds in `description`", () => {
    const withoutDetail = rationaleFor("research", "Alpha", "");
    expect(withoutDetail.why).not.toContain("Prioritized for");

    const withDetail = rationaleFor("research", "Alpha", "", "emotional intensity, contradiction");
    expect(withDetail.why).toContain("Prioritized for emotional intensity, contradiction.");
    // The rest of the rationale is unaffected by the fix.
    expect(withDetail.objective).toBe(withoutDetail.objective);
    expect(withDetail.benefit).toBe(withoutDetail.benefit);
  });

  it("`detail` is a no-op for every other job type (research-only, per its own doc comment)", () => {
    for (const t of ["synthesis", "merging", "pruning", "harmonization", "sector_vibe", "calibration", "daily_log", "patrol"] as const) {
      expect(rationaleFor(t, "x", "y", "some factor")).toEqual(rationaleFor(t, "x", "y"));
    }
  });
});
