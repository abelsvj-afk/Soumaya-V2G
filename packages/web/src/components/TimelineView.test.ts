import { describe, it, expect } from "vitest";
import { normalizeDate } from "./TimelineView.js";

/** Regression test for the same class of bug already fixed for remindAt/expiresAt
 *  elsewhere in the app: a naive SQLite timestamp ("YYYY-MM-DD HH:MM:SS", no zone)
 *  must be read as UTC, not the viewer's local timezone, or a chapter's displayed
 *  date can land a day off from what the server (analysis/timeline.ts) computed. */
describe("TimelineView.normalizeDate", () => {
  it("treats a naive space-separated timestamp as UTC", () => {
    const d = normalizeDate("2026-01-15 23:30:00");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(23);
  });

  it("leaves an already-zoned ISO string untouched", () => {
    const d = normalizeDate("2026-01-15T23:30:00Z");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCDate()).toBe(15);
  });

  it("leaves an explicit-offset timestamp untouched", () => {
    const d = normalizeDate("2026-01-15T23:30:00+05:00");
    expect(d.getUTCHours()).toBe(18);
  });
});
