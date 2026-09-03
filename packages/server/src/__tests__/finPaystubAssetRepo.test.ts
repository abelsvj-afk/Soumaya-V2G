import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinPaystubRepo } from "../repositories/finPaystub.repo.js";
import { FinAssetRepo } from "../repositories/finAsset.repo.js";
import { FinAssetSnapshotRepo } from "../repositories/finAssetSnapshot.repo.js";

/**
 * Pay stubs (docs/specs/paystub-ingestion.md) and Income & Net Worth assets
 * (docs/specs/income-net-worth-trend.md) — repos against a real (in-memory) DB.
 */

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => {
  handle.sqlite.close();
});

describe("FinPaystubRepo", () => {
  it("creates a pay stub with earnings/deductions arrays and reads them back parsed", () => {
    const repo = new FinPaystubRepo(handle, "s1");
    const stub = repo.create({
      employer: "Acme Trucking",
      netCents: 120_000,
      grossCents: 150_000,
      earnings: [{ label: "Line-haul miles", amountCents: 130_000, quantity: 2450, rateCents: 52 }],
      deductions: [{ label: "Federal tax", amountCents: 20_000 }, { label: "401k", amountCents: 10_000 }],
    });
    expect(stub.earnings).toHaveLength(1);
    expect(stub.earnings[0]!.quantity).toBe(2450);
    expect(stub.deductions).toHaveLength(2);
    expect(stub.hasSource).toBe(false);

    const fetched = repo.get(stub.id);
    expect(fetched?.earnings).toEqual(stub.earnings);
    expect(fetched?.deductions).toEqual(stub.deductions);
  });

  it("list() and get() never expose the raw source blob, only hasSource", () => {
    const repo = new FinPaystubRepo(handle, "s1");
    const stub = repo.create({
      netCents: 1000, earnings: [], deductions: [],
      sourceFilename: "stub.pdf", sourceMime: "application/pdf", sourceData: Buffer.from("hello").toString("base64"),
    });
    expect(stub.hasSource).toBe(true);
    expect((stub as any).sourceData).toBeUndefined();
    const listed = repo.list();
    expect(listed).toHaveLength(1);
    expect((listed[0] as any).sourceData).toBeUndefined();
    expect(listed[0]!.hasSource).toBe(true);
  });

  it("getSourceBlob returns the original bytes for the download route, null when none saved", () => {
    const repo = new FinPaystubRepo(handle, "s1");
    const withSource = repo.create({ netCents: 1000, earnings: [], deductions: [], sourceMime: "application/pdf", sourceData: Buffer.from("hello").toString("base64") });
    const withoutSource = repo.create({ netCents: 1000, earnings: [], deductions: [] });

    const blob = repo.getSourceBlob(withSource.id);
    expect(blob?.data && Buffer.from(blob.data, "base64").toString()).toBe("hello");
    expect(repo.getSourceBlob(withoutSource.id)).toBeNull();
  });

  it("is space-scoped — another space's pay stubs never leak in", () => {
    const s1 = new FinPaystubRepo(handle, "s1");
    const s2 = new FinPaystubRepo(handle, "s2");
    s1.create({ netCents: 1000, earnings: [], deductions: [] });
    expect(s2.list()).toHaveLength(0);
  });

  it("remove() deletes a pay stub", () => {
    const repo = new FinPaystubRepo(handle, "s1");
    const stub = repo.create({ netCents: 1000, earnings: [], deductions: [] });
    expect(repo.remove(stub.id)).toBe(true);
    expect(repo.get(stub.id)).toBeNull();
  });
});

describe("FinAssetRepo + FinAssetSnapshotRepo", () => {
  it("creates an asset, logs snapshots, and lists them newest-first", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const savings = assets.create({ kind: "savings", label: "Emergency fund" });

    snaps.create({ assetId: savings.id, amountCents: 100_000, asOf: "2026-01-01" });
    snaps.create({ assetId: savings.id, amountCents: 150_000, asOf: "2026-02-01" });

    const list = snaps.listByAsset(savings.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.asOf).toBe("2026-02-01"); // newest first
  });

  it("latestAsOf finds the most recent snapshot at or before a date, null before any exists", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const inv = assets.create({ kind: "investment", label: "Brokerage" });
    snaps.create({ assetId: inv.id, amountCents: 500_00, asOf: "2026-03-15" });

    expect(snaps.latestAsOf(inv.id, "2026-02-28")).toBeNull(); // before the asset had any snapshot
    expect(snaps.latestAsOf(inv.id, "2026-03-15")?.amountCents).toBe(500_00);
    expect(snaps.latestAsOf(inv.id, "2026-12-31")?.amountCents).toBe(500_00); // still the latest known
  });

  it("archive() hides an asset from the default list but keeps it (and its history) in listAll()", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const old401k = assets.create({ kind: "retirement", label: "Old employer 401k" });
    snaps.create({ assetId: old401k.id, amountCents: 800_00, asOf: "2026-01-01" });

    expect(assets.archive(old401k.id)).toBe(true);
    expect(assets.list()).toHaveLength(0); // archived — hidden from "add a new snapshot" pickers
    expect(assets.list(true)).toHaveLength(1);
    expect(assets.listAll()).toHaveLength(1); // netWorthTrend.ts still sees it

    // Its history is untouched — archiving never deletes snapshots (user decision: "archive
    // should keep the history").
    expect(snaps.latestAsOf(old401k.id, "2026-01-01")?.amountCents).toBe(800_00);
  });

  it("mostRecentAny finds the newest snapshot across every asset in the space", () => {
    const assets = new FinAssetRepo(handle, "s1");
    const snaps = new FinAssetSnapshotRepo(handle, "s1");
    const a = assets.create({ kind: "savings", label: "A" });
    const b = assets.create({ kind: "savings", label: "B" });
    snaps.create({ assetId: a.id, amountCents: 100, asOf: "2026-01-01" });
    snaps.create({ assetId: b.id, amountCents: 200, asOf: "2026-06-01" });
    expect(snaps.mostRecentAny()?.asOf).toBe("2026-06-01");
  });

  it("is space-scoped", () => {
    const s1 = new FinAssetRepo(handle, "s1");
    const s2 = new FinAssetRepo(handle, "s2");
    s1.create({ kind: "other", label: "Mystery fund" });
    expect(s2.list()).toHaveLength(0);
  });
});
