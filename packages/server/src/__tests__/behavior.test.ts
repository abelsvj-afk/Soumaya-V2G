import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { deriveBehavior } from "../persona/behavior.js";

let handle: DbHandle;

const insert = (label: string, ew: number, daysAgo: number, content = "short note") => {
  handle.sqlite
    .prepare(
      `INSERT INTO nodes (space_id, label, type, content, emotional_weight, created_at, last_tended_at)
       VALUES ('legacy', ?, 'daily', ?, ?, datetime('now', ?), datetime('now', ?))`,
    )
    .run(label, content, ew, `-${daysAgo} days`, `-${daysAgo} days`);
};

beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("behavioral persona deepening (how to be with them right now)", () => {
  it("returns nothing for a near-empty brain (no pattern to read)", () => {
    insert("one", 0, 1);
    expect(deriveBehavior(handle)).toBe("");
  });

  it("detects a heavier-than-baseline stretch and tender ground", () => {
    // Baseline month: neutral-to-positive.
    for (let i = 0; i < 6; i++) insert(`baseline ${i}`, 0.3, 12 + i);
    // This week: heavy.
    insert("fear of losing the car", -0.8, 1);
    insert("couldn't sleep again", -0.6, 2);
    insert("money stress compounding", -0.7, 3);
    const b = deriveBehavior(handle);
    expect(b).toContain("HEAVIER stretch");
    expect(b).toContain("Tender ground");
    expect(b).toContain("fear of losing the car");
    // Guidance frame is present and marked as silent delivery shaping.
    expect(b).toContain("never recite it");
  });

  it("detects a brighter-than-baseline stretch", () => {
    for (let i = 0; i < 6; i++) insert(`baseline ${i}`, -0.2, 12 + i);
    insert("got the promotion!", 0.8, 1);
    insert("amazing weekend with family", 0.7, 2);
    insert("proud of the studio launch", 0.9, 3);
    const b = deriveBehavior(handle);
    expect(b).toContain("brighter stretch");
  });

  it("calibrates her asks when daily questions go unanswered", () => {
    for (let i = 0; i < 8; i++) insert(`note ${i}`, 0, i + 1);
    for (let d = 0; d < 5; d++) {
      handle.sqlite
        .prepare(
          `INSERT INTO daily_contact (space_id, date, payload, answered)
           VALUES ('legacy', date('now', ?), '{}', 0)`,
        )
        .run(`-${d} days`);
    }
    const b = deriveBehavior(handle);
    expect(b).toContain("skipping your daily questions");
  });
});
