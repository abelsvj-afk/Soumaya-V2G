import { describe, it, expect } from "vitest";
import { heuristicExtractPaystub } from "./paystubHeuristic.js";

/**
 * The ALWAYS-AVAILABLE, no-key fallback for pay-stub text extraction
 * (docs/specs/paystub-ingestion.md §4). Deterministic regex only.
 */
describe("heuristicExtractPaystub", () => {
  it("extracts net pay, gross pay, and deduction lines from a simple hourly stub", () => {
    const text = [
      "Acme Corp",
      "Pay Date: 2026-03-01",
      "Regular Pay 1,200.00",
      "Federal Tax 150.00",
      "Social Security 74.40",
      "Medicare 17.40",
      "Gross Pay 1,200.00",
      "Net Pay 958.20",
    ].join("\n");
    const r = heuristicExtractPaystub(text);
    expect(r.netCents).toBe(95_820);
    expect(r.grossCents).toBe(120_000);
    expect(r.payDate).toBe("2026-03-01");
    expect(r.deductions.some((d) => /federal/i.test(d.label) && d.amountCents === 15_000)).toBe(true);
    expect(r.deductions.some((d) => /medicare/i.test(d.label))).toBe(true);
    expect(r.earnings.some((e) => /regular/i.test(e.label) && e.amountCents === 120_000)).toBe(true);
  });

  it("captures a non-hourly earnings line (e.g. per-mile pay) as a generic earnings row", () => {
    const text = ["Line-haul miles 1,274.00", "Net Pay 1,000.00"].join("\n");
    const r = heuristicExtractPaystub(text);
    expect(r.earnings.some((e) => /line-haul/i.test(e.label) && e.amountCents === 127_400)).toBe(true);
    expect(r.netCents).toBe(100_000);
  });

  it("falls back to the largest earnings line when no net pay is detectable, with low confidence", () => {
    const text = ["Some Line 500.00", "Another Line 750.00"].join("\n");
    const r = heuristicExtractPaystub(text);
    expect(r.netCents).toBe(75_000);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("separates year-to-date figures from the current-period ones", () => {
    const text = ["Net Pay 900.00", "Net Pay YTD 10,800.00"].join("\n");
    const r = heuristicExtractPaystub(text);
    expect(r.netCents).toBe(90_000);
    expect(r.ytdNetCents).toBe(1_080_000);
  });

  it("returns empty arrays, not a throw, for unparseable text", () => {
    const r = heuristicExtractPaystub("nothing useful here");
    expect(r.earnings).toEqual([]);
    expect(r.deductions).toEqual([]);
    expect(r.netCents).toBe(0);
  });
});
