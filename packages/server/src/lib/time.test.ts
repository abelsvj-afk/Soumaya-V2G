import { describe, it, expect } from "vitest";
import { parseTolerantMs, toIsoDate, daysBetween, daysSince, daysUntil } from "./time.js";

describe("parseTolerantMs", () => {
  it("parses a naive SQLite CURRENT_TIMESTAMP shape as UTC", () => {
    expect(parseTolerantMs("2026-09-03 12:00:00")).toBe(Date.parse("2026-09-03T12:00:00Z"));
  });
  it("parses a full ISO string with Z unchanged", () => {
    expect(parseTolerantMs("2026-09-03T12:00:00.000Z")).toBe(Date.parse("2026-09-03T12:00:00.000Z"));
  });
  it("parses an already-zoned ISO string with a +/-offset unchanged", () => {
    expect(parseTolerantMs("2026-09-03T12:00:00+02:00")).toBe(Date.parse("2026-09-03T12:00:00+02:00"));
    expect(parseTolerantMs("2026-09-03T07:00:00-05:00")).toBe(Date.parse("2026-09-03T07:00:00-05:00"));
  });
  it("parses a bare YYYY-MM-DD business date as UTC midnight", () => {
    expect(parseTolerantMs("2026-09-03")).toBe(Date.parse("2026-09-03T00:00:00Z"));
  });
  it("returns NaN for null, undefined, empty, or whitespace-only input", () => {
    expect(Number.isNaN(parseTolerantMs(null))).toBe(true);
    expect(Number.isNaN(parseTolerantMs(undefined))).toBe(true);
    expect(Number.isNaN(parseTolerantMs(""))).toBe(true);
    expect(Number.isNaN(parseTolerantMs("   "))).toBe(true);
  });
  it("returns NaN for genuinely unparseable text rather than coercing to a fake date", () => {
    expect(Number.isNaN(parseTolerantMs("not a date"))).toBe(true);
  });
});

describe("toIsoDate", () => {
  it("renders the UTC calendar date", () => {
    expect(toIsoDate(new Date("2026-09-03T23:59:59Z"))).toBe("2026-09-03");
  });
});

describe("daysBetween / daysSince / daysUntil", () => {
  const DAY = 86_400_000;
  it("daysBetween is positive when later is after earlier, negative the other way", () => {
    const a = Date.parse("2026-09-01T00:00:00Z");
    const b = Date.parse("2026-09-04T00:00:00Z");
    expect(daysBetween(a, b)).toBe(3);
    expect(daysBetween(b, a)).toBe(-3);
  });
  it("daysBetween truncates a partial day toward zero", () => {
    const a = Date.parse("2026-09-01T00:00:00Z");
    const b = a + 2.9 * DAY;
    expect(daysBetween(a, b)).toBe(2);
  });
  it("daysSince computes days from a stored date to now, null when unparseable", () => {
    const now = Date.parse("2026-09-10T00:00:00Z");
    expect(daysSince("2026-09-01", now)).toBe(9);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("garbage", now)).toBeNull();
  });
  it("daysUntil is negative for a past date, positive for a future one, null when unparseable", () => {
    const now = Date.parse("2026-09-10T00:00:00Z");
    expect(daysUntil("2026-09-01", now)).toBe(-9);
    expect(daysUntil("2026-09-20", now)).toBe(10);
    expect(daysUntil(undefined, now)).toBeNull();
  });
});
