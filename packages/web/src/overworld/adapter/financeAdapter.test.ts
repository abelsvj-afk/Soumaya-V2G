import { describe, it, expect } from "vitest";
import type { MoneyStar, MoneyStarState } from "@brain/shared";
import { canAfford, detectBankWork, moneyStarToBankRow, moneyStarsToBankRows } from "./financeAdapter.js";

function makeStar(state: MoneyStarState, overrides: Partial<MoneyStar> = {}): MoneyStar {
  return {
    kind: "bill",
    id: 1,
    label: "Rent",
    amountCents: 120000,
    state,
    glyph: "x",
    intensity: 0.5,
    ...overrides,
  };
}

describe("moneyStarToBankRow", () => {
  it("gives every MoneyStarState a distinct, non-empty icon (never color-only)", () => {
    const states: MoneyStarState[] = [
      "calm",
      "approaching",
      "cooling",
      "overdue",
      "paid",
      "goal_filling",
      "goal_reached",
    ];
    const icons = states.map((s) => moneyStarToBankRow(makeStar(s)).icon);
    for (const icon of icons) expect(icon.length).toBeGreaterThan(0);
    expect(new Set(icons).size).toBe(states.length);
  });

  it("flags overdue and approaching as urgent; calm/paid are not", () => {
    expect(moneyStarToBankRow(makeStar("overdue")).isUrgent).toBe(true);
    expect(moneyStarToBankRow(makeStar("approaching")).isUrgent).toBe(true);
    expect(moneyStarToBankRow(makeStar("calm")).isUrgent).toBe(false);
    expect(moneyStarToBankRow(makeStar("paid")).isUrgent).toBe(false);
  });

  it("passes amountCents/dueInDays/fillPct through unchanged — no new finance math", () => {
    const star = makeStar("goal_filling", { amountCents: 50000, fillPct: 0.7, dueInDays: undefined });
    const row = moneyStarToBankRow(star);
    expect(row.amountCents).toBe(50000);
    expect(row.fillPct).toBe(0.7);
  });

  it("moneyStarsToBankRows maps a whole list in order", () => {
    const stars = [makeStar("calm", { id: 1 }), makeStar("overdue", { id: 2 })];
    const rows = moneyStarsToBankRows(stars);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("canAfford (FR6 — the shop-counter check)", () => {
  it("allows exactly at the safe-to-spend boundary", () => {
    expect(canAfford(1000, 1000)).toBe(true);
  });
  it("greys out anything above safe-to-spend", () => {
    expect(canAfford(1001, 1000)).toBe(false);
  });
});

describe("detectBankWork (Town Economy round — real Bank work, npc-economy.md)", () => {
  it("detects a bill transitioning into paid", () => {
    const old = moneyStarsToBankRows([makeStar("overdue", { id: 1 })]);
    const next = moneyStarsToBankRows([makeStar("paid", { id: 1 })]);
    expect(detectBankWork(old, next)).toBe(true);
  });

  it("detects a goal transitioning into reached", () => {
    const old = moneyStarsToBankRows([makeStar("goal_filling", { id: 1, kind: "goal" })]);
    const next = moneyStarsToBankRows([makeStar("goal_reached", { id: 1, kind: "goal" })]);
    expect(detectBankWork(old, next)).toBe(true);
  });

  it("never re-credits a row that was already paid/reached before", () => {
    const old = moneyStarsToBankRows([makeStar("paid", { id: 1 })]);
    const next = moneyStarsToBankRows([makeStar("paid", { id: 1 })]);
    expect(detectBankWork(old, next)).toBe(false);
  });

  it("is false when nothing actually changed state", () => {
    const old = moneyStarsToBankRows([makeStar("overdue", { id: 1 })]);
    const next = moneyStarsToBankRows([makeStar("overdue", { id: 1 })]);
    expect(detectBankWork(old, next)).toBe(false);
  });

  it("never confuses a bill and a goal that happen to share the same real id", () => {
    const old = moneyStarsToBankRows([makeStar("paid", { id: 1, kind: "bill" })]);
    const next = moneyStarsToBankRows([makeStar("goal_reached", { id: 1, kind: "goal" })]);
    expect(detectBankWork(old, next)).toBe(true);
  });

  it("is false for an empty diff (e.g. the very first load, with no prior state)", () => {
    expect(detectBankWork([], [])).toBe(false);
  });
});
