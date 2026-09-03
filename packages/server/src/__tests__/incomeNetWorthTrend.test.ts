import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinAssetRepo } from "../repositories/finAsset.repo.js";
import { FinAssetSnapshotRepo } from "../repositories/finAssetSnapshot.repo.js";
import { incomeSeries } from "../finance/incomeTrend.js";
import { netWorthSeries } from "../finance/netWorthTrend.js";

/** docs/specs/income-net-worth-trend.md — the two chart-feeding series, pure SQL, no LLM. */

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => {
  handle.sqlite.close();
});

const NOW = new Date("2026-03-15T00:00:00Z");

describe("incomeSeries", () => {
  it("returns continuous months (not missing ones) for an empty range, all zero", () => {
    const series = incomeSeries(handle, "s1", 3, NOW);
    expect(series).toHaveLength(3);
    expect(series.map((p) => p.periodStart)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    for (const p of series) {
      expect(p.totalCents).toBe(0);
      expect(p.bySource).toEqual({ paycheck: 0, selfEmployed: 0 });
    }
  });

  it("buckets income by calendar month and splits paycheck vs self-employed by platform text", () => {
    const income = new FinIncomeRepo(handle, "s1");
    income.create({ date: "2026-01-10", netCents: 50_000, platform: "Acme Corp" });
    income.create({ date: "2026-01-20", netCents: 30_000, platform: "Self-employed: rideshare" });
    income.create({ date: "2026-02-05", netCents: 40_000, platform: "Acme Corp" });

    const series = incomeSeries(handle, "s1", 3, NOW);
    const jan = series.find((p) => p.periodStart === "2026-01-01")!;
    const feb = series.find((p) => p.periodStart === "2026-02-01")!;
    const mar = series.find((p) => p.periodStart === "2026-03-01")!;

    expect(jan.totalCents).toBe(80_000);
    expect(jan.bySource.paycheck).toBe(50_000);
    expect(jan.bySource.selfEmployed).toBe(30_000);
    expect(feb.totalCents).toBe(40_000);
    expect(mar.totalCents).toBe(0);
  });

  it("is space-scoped", () => {
    new FinIncomeRepo(handle, "s1").create({ date: "2026-03-01", netCents: 1000 });
    const series = incomeSeries(handle, "s2", 1, NOW);
    expect(series[0]!.totalCents).toBe(0);
  });
});

describe("netWorthSeries", () => {
  it("an asset with no snapshot yet contributes 0 to every month", () => {
    new FinAssetRepo(handle, "s1").create({ kind: "savings", label: "New account" });
    const series = netWorthSeries(handle, "s1", 3, NOW);
    for (const p of series) expect(p.totalCents).toBe(0); // no fin_account balance set either
  });

  it("an asset's snapshot contributes from its as_of month onward, 0 before", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const a = assets.create({ kind: "savings", label: "Savings" });
    snaps.create({ assetId: a.id, amountCents: 200_000, asOf: "2026-02-15" });

    const series = netWorthSeries(handle, "s1", 3, NOW);
    const jan = series.find((p) => p.asOf.startsWith("2026-01"))!;
    const feb = series.find((p) => p.asOf.startsWith("2026-02"))!;
    const mar = series.find((p) => p.asOf.startsWith("2026-03"))!;
    expect(jan.totalCents).toBe(0);
    expect(feb.totalCents).toBe(200_000);
    expect(mar.totalCents).toBe(200_000); // still the latest known balance
  });

  it("sums cash (fin_account) plus every asset's latest-as-of balance", () => {
    new FinAccountRepo(handle, "s1").setBalance(50_000);
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const a = assets.create({ kind: "savings", label: "A" });
    const b = assets.create({ kind: "investment", label: "B" });
    snaps.create({ assetId: a.id, amountCents: 100_000, asOf: "2026-01-01" });
    snaps.create({ assetId: b.id, amountCents: 300_000, asOf: "2026-01-01" });

    const series = netWorthSeries(handle, "s1", 1, NOW);
    expect(series[0]!.totalCents).toBe(50_000 + 100_000 + 300_000);
  });

  it("flags cashIsProjected true for past months, false for the current month", () => {
    const series = netWorthSeries(handle, "s1", 3, NOW);
    const jan = series.find((p) => p.asOf.startsWith("2026-01"))!;
    const mar = series.find((p) => p.asOf.startsWith("2026-03"))!;
    expect(jan.cashIsProjected).toBe(true);
    expect(mar.cashIsProjected).toBe(false);
  });

  it("an archived asset's history still counts toward past points", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const a = assets.create({ kind: "retirement", label: "Old 401k" });
    snaps.create({ assetId: a.id, amountCents: 900_000, asOf: "2026-01-01" });
    assets.archive(a.id);

    const series = netWorthSeries(handle, "s1", 1, NOW);
    expect(series[0]!.totalCents).toBe(900_000);
  });
});
