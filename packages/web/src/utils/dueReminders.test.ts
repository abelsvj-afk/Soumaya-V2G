import { describe, it, expect } from "vitest";
import { isReminderDue } from "./dueReminders.js";

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
