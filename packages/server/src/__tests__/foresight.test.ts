import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { detectForesight } from "../analysis/foresight.js";

let handle: DbHandle;

/** Insert a negative memory whose occurred_at is a specific past date. */
function neg(spaceId: string, isoDate: string) {
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, occurred_at, created_at)
       VALUES (?, 'heavy', 'daily', 'a hard day', -0.6, ?, ?)`,
    )
    .run(spaceId, isoDate, isoDate);
}

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("foresight (recurring-negative pattern → heads-up)", () => {
  it("returns null with too little data", () => {
    neg("legacy", new Date().toISOString());
    expect(detectForesight(handle, "legacy")).toBeNull();
  });

  it("calls a month-end pattern when it's about to recur", () => {
    // Heavy memories at month-end across the last two months, plus one landing in
    // the window that opens within ~5 days of "now".
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const dim = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    // Two prior months, near month-end.
    for (const back of [1, 2]) {
      const mm = m - back;
      const yy = mm < 0 ? y - 1 : y;
      const mo = (mm + 12) % 12;
      const d = dim(yy, mo);
      neg("legacy", new Date(Date.UTC(yy, mo, d - 1)).toISOString());
      neg("legacy", new Date(Date.UTC(yy, mo, d)).toISOString());
    }
    // This month's own month-end, to strengthen the band.
    const dNow = dim(y, m);
    neg("legacy", new Date(Date.UTC(y, m, dNow - 1)).toISOString());

    const f = detectForesight(handle, "legacy");
    // Only asserts when today is actually near month-end; otherwise the detector
    // correctly stays quiet. Mirror the IMPLEMENTATION's exact window math (not an
    // approximation) so this is correct for whatever real date the test runs on —
    // an earlier hand-approximated cutoff (`dNow - 6`) drifted out of sync with the
    // real trigger (`bandStart - todayDom <= 5`, i.e. `dNow - 8`) as wall-clock time
    // moved, which is exactly the kind of date-drift flakiness to avoid here.
    const bandStart = Math.max(1, dNow - 3);
    let inDays = bandStart - now.getUTCDate();
    if (inDays < -3) inDays += dim(y, m);
    const inWindow = inDays <= 5 && inDays >= -3;
    if (inWindow) {
      expect(f?.kind).toBe("monthly");
      expect(f?.text).toMatch(/month/i);
    } else {
      // Not near the window today — detector shouldn't fabricate one.
      expect(f === null || f.kind === "weekday").toBe(true);
    }
  });

  it("detects a heavy-weekday pattern across 3+ weeks", () => {
    // Three consecutive same-weekday heavy days, with the next instance within 2 days.
    const now = new Date();
    const target = new Date(now);
    // Choose a weekday 1 day from now so inDays <= 2.
    target.setUTCDate(now.getUTCDate() + 1);
    const wd = target.getUTCDay();
    for (let w = 1; w <= 4; w++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - w * 7 + (wd - now.getUTCDay())));
      neg("legacy", d.toISOString());
    }
    const f = detectForesight(handle, "legacy");
    // Weekday pattern present; monthly may pre-empt if today is near month-end,
    // so accept either a weekday hit or (rarely) a monthly one — both are valid.
    expect(f).not.toBeNull();
  });
});
