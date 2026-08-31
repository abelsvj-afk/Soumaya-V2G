import { describe, it, expect } from "vitest";
import { isReminderDue, parseTolerantMs } from "./dueReminders.js";

describe("parseTolerantMs", () => {
  it("reads a naive SQLite timestamp as UTC", () => {
    expect(parseTolerantMs("2026-08-29 12:00:00")).toBe(Date.parse("2026-08-29T12:00:00Z"));
  });

  it("passes a real ISO/zoned timestamp through unchanged", () => {
    expect(parseTolerantMs("2026-08-29T12:00:00Z")).toBe(Date.parse("2026-08-29T12:00:00Z"));
    expect(parseTolerantMs("2026-08-29T12:00:00+02:00")).toBe(Date.parse("2026-08-29T12:00:00+02:00"));
  });

  it("returns NaN for missing or unparsable input", () => {
    expect(Number.isNaN(parseTolerantMs(undefined))).toBe(true);
    expect(Number.isNaN(parseTolerantMs(""))).toBe(true);
    expect(Number.isNaN(parseTolerantMs("not a date"))).toBe(true);
  });
});

describe("isReminderDue", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");

  it("is due when remindAt is in the past", () => {
    expect(isReminderDue({ kind: "memory", remindAt: "2026-08-29 11:00:00" }, now)).toBe(true);
  });

  it("is not due when remindAt is in the future", () => {
    expect(isReminderDue({ kind: "memory", remindAt: "2026-08-29 13:00:00" }, now)).toBe(false);
  });

  it("is due exactly at the boundary (<=)", () => {
    expect(isReminderDue({ kind: "memory", remindAt: "2026-08-29 12:00:00" }, now)).toBe(true);
  });

  it("is never due for action-kind nodes, even with a past remindAt", () => {
    expect(isReminderDue({ kind: "action", remindAt: "2026-08-29 11:00:00" }, now)).toBe(false);
  });

  it("is not due with no remindAt at all", () => {
    expect(isReminderDue({ kind: "memory" }, now)).toBe(false);
  });

  it("handles an already-zoned ISO timestamp without double-converting", () => {
    expect(isReminderDue({ kind: "memory", remindAt: "2026-08-29T11:00:00Z" }, now)).toBe(true);
    expect(isReminderDue({ kind: "memory", remindAt: "2026-08-29T13:00:00Z" }, now)).toBe(false);
  });
});
