import { describe, it, expect } from "vitest";
import { classifyDeadline, classifyFreshness, classifyEventDate, RECENT_WINDOW_DAYS } from "./temporal.js";

const NOW = Date.parse("2026-09-03T00:00:00Z"); // "assume today is September 3, 2026"
const DAY = 86_400_000;
const isoDaysFrom = (nowMs: number, deltaDays: number) => new Date(nowMs + deltaDays * DAY).toISOString().slice(0, 10);

describe("classifyDeadline", () => {
  it("classifies a past due date as overdue", () => {
    expect(classifyDeadline(isoDaysFrom(NOW, -5), NOW, 7)).toBe("overdue");
  });
  it("classifies today's due date as current", () => {
    expect(classifyDeadline(isoDaysFrom(NOW, 0), NOW, 7)).toBe("current");
  });
  it("classifies a near-future due date within the window as upcoming", () => {
    expect(classifyDeadline(isoDaysFrom(NOW, 2), NOW, 7)).toBe("upcoming");
  });
  it("returns null (not notable) for a due date further out than the window", () => {
    expect(classifyDeadline(isoDaysFrom(NOW, 30), NOW, 7)).toBeNull();
  });
  it("boundary: exactly at the window edge is still upcoming, one day past it is not", () => {
    expect(classifyDeadline(isoDaysFrom(NOW, 7), NOW, 7)).toBe("upcoming");
    expect(classifyDeadline(isoDaysFrom(NOW, 8), NOW, 7)).toBeNull();
  });
  it("returns null for an unparseable date", () => {
    expect(classifyDeadline("not-a-date", NOW, 7)).toBeNull();
  });
  it("controlled clock: the SAME due date classifies differently as 'now' moves", () => {
    const dueDate = "2026-09-10";
    expect(classifyDeadline(dueDate, Date.parse("2026-09-01T00:00:00Z"), 7)).toBeNull(); // 9 days out, outside a 7-day window
    expect(classifyDeadline(dueDate, Date.parse("2026-09-05T00:00:00Z"), 7)).toBe("upcoming"); // 5 days out
    expect(classifyDeadline(dueDate, Date.parse("2026-09-10T00:00:00Z"), 7)).toBe("current");
    expect(classifyDeadline(dueDate, Date.parse("2026-09-15T00:00:00Z"), 7)).toBe("overdue");
  });
});

describe("classifyFreshness", () => {
  it("a null/never-happened last date is always stale, regardless of thresholds", () => {
    expect(classifyFreshness(null, NOW, 90, 30)).toBe("stale");
    expect(classifyFreshness(undefined, NOW, 90, 30)).toBe("stale");
  });
  it("classifies within the recent window as recently_changed", () => {
    expect(classifyFreshness(isoDaysFrom(NOW, -2), NOW, 20, 7)).toBe("recently_changed");
  });
  it("classifies beyond staleAfterDays as stale", () => {
    expect(classifyFreshness(isoDaysFrom(NOW, -25), NOW, 20, 7)).toBe("stale");
  });
  it("classifies the middle ground (fresh but not brand-new) as current", () => {
    expect(classifyFreshness(isoDaysFrom(NOW, -10), NOW, 20, 7)).toBe("current");
  });
  it("boundary: exactly at staleAfterDays is NOT yet stale, one day beyond is", () => {
    expect(classifyFreshness(isoDaysFrom(NOW, -20), NOW, 20, 7)).toBe("current");
    expect(classifyFreshness(isoDaysFrom(NOW, -21), NOW, 20, 7)).toBe("stale");
  });
  it("boundary: exactly at recentWithinDays is still recently_changed", () => {
    expect(classifyFreshness(isoDaysFrom(NOW, -7), NOW, 20, 7)).toBe("recently_changed");
  });
  it("defaults recentWithinDays to RECENT_WINDOW_DAYS when omitted", () => {
    expect(classifyFreshness(isoDaysFrom(NOW, -(RECENT_WINDOW_DAYS - 1)), NOW, 90)).toBe("recently_changed");
  });
});

describe("classifyEventDate", () => {
  it("classifies past/current/upcoming for a plain event date", () => {
    expect(classifyEventDate(isoDaysFrom(NOW, -3), NOW)).toBe("past");
    expect(classifyEventDate(isoDaysFrom(NOW, 0), NOW)).toBe("current");
    expect(classifyEventDate(isoDaysFrom(NOW, 3), NOW)).toBe("upcoming");
  });
  it("returns null for missing/unparseable input", () => {
    expect(classifyEventDate(null, NOW)).toBeNull();
    expect(classifyEventDate("nonsense", NOW)).toBeNull();
  });
});
