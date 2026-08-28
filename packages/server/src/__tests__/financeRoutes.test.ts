import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildContext, type AppContext } from "../context.js";
import { createApp } from "../api/server.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { FinAccount, BudgetSummary, FinIncome, FinExpense, FinBillOccurrence } from "@brain/shared";

/** Stage 1a — the finance REST surface end-to-end (thin routes over the tested engine). */

let ctx: AppContext;
let server: Server;
let base: string;
let spaceId: string;

beforeAll(async () => {
  ctx = await buildContext({ dbPath: ":memory:", embeddings: new HashEmbeddingProvider(EMBED_DIM), llm: new HeuristicProvider() });
  const app = createApp(ctx);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = await fetch(`${base}/api/space/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gamerTag: "money", passcode: "secret123", name: "money" }),
  });
  spaceId = ((await auth.json()) as { id: string }).id;
});
afterAll(() => { server?.close(); ctx.handle.sqlite.close(); });

const H = () => ({ "Content-Type": "application/json", "x-space-id": spaceId });
const post = async (p: string, b: unknown) => {
  const res = await fetch(`${base}${p}`, { method: "POST", headers: H(), body: JSON.stringify(b) });
  return { status: res.status, body: await res.json() };
};
const put = async (p: string, b: unknown) => {
  const res = await fetch(`${base}${p}`, { method: "PUT", headers: H(), body: JSON.stringify(b) });
  return { status: res.status, body: await res.json() };
};
const get = async (p: string) => {
  const res = await fetch(`${base}${p}`, { headers: { "x-space-id": spaceId } });
  return { status: res.status, body: await res.json() };
};

describe("finance routes", () => {
  it("requires a space", async () => {
    const res = await fetch(`${base}/api/finance/summary`);
    expect(res.status).toBe(401);
  });

  it("400s on an invalid bill body with issue detail", async () => {
    const { status, body } = await post("/api/finance/bills", { name: "", amountCents: -5, frequency: "yearly", anchorDate: "nope" });
    expect(status).toBe(400);
    expect(Array.isArray((body as { issues: unknown[] }).issues)).toBe(true);
  });

  it("drives a full budget: balance + bill + income → safe to spend", async () => {
    const balanceRes = await put("/api/finance/account/balance", { cents: 114000 });
    expect((balanceRes.body as FinAccount).balanceCents).toBe(114000);

    // Anchor a few days out from the REAL "now" (not a hardcoded past date) so the bill always
    // materializes inside the summary's default horizon regardless of which day the suite runs —
    // a hardcoded "2026-01-20" drifted out of the horizon window as wall-clock time moved past it.
    const soon = (daysAhead: number) => new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
    for (const b of [
      { name: "Rent", amountCents: 60000, frequency: "monthly", anchorDate: soon(3) },
      { name: "Insurance", amountCents: 25000, frequency: "monthly", anchorDate: soon(5) },
    ]) {
      expect((await post("/api/finance/bills", b)).status).toBe(200);
    }

    const summary = await get("/api/finance/summary");
    const summaryBody = summary.body as { account: FinAccount; budget: BudgetSummary; upcoming: FinBillOccurrence[] };
    expect(summary.status).toBe(200);
    expect(summaryBody.account.balanceCents).toBe(114000);
    expect(typeof summaryBody.budget.safeToSpendCents).toBe("number");
    // Bills materialize into upcoming occurrences.
    expect(summaryBody.upcoming.length).toBeGreaterThan(0);

    // Manual income adjusts the balance going forward and reports a live budget.
    const inc = await post("/api/finance/income", { date: "2026-01-10", netCents: 5000, platform: "GoPuff" });
    expect(inc.status).toBe(200);
    expect((inc.body as { budget: BudgetSummary }).budget.balanceCents).toBe(119000);

    // Manual expense subtracts.
    const exp = await post("/api/finance/expense", { date: "2026-01-10", amountCents: 2000, category: "food" });
    expect((exp.body as { budget: BudgetSummary }).budget.balanceCents).toBe(117000);

    // A repeat income is flagged as a likely duplicate (but still recorded).
    const dup = await post("/api/finance/income", { date: "2026-01-10", netCents: 5000, platform: "GoPuff" });
    expect((dup.body as { duplicate: boolean }).duplicate).toBe(true);
  });
});

describe("GET /api/finance/afford", () => {
  // Its own space — order-independent from the accumulating "drives a full budget" state above.
  let space: string;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const auth = await fetch(`${base}/api/space/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerTag: "afford", passcode: "secret123", name: "afford" }),
    });
    space = ((await auth.json()) as { id: string }).id;
    const H2 = { "Content-Type": "application/json", "x-space-id": space };
    // Comfortably inside the 4-week trailing window regardless of when the suite runs.
    await fetch(`${base}/api/finance/income`, { method: "POST", headers: H2, body: JSON.stringify({ date: daysAgo(7), netCents: 20000 }) });
    await fetch(`${base}/api/finance/income`, { method: "POST", headers: H2, body: JSON.stringify({ date: daysAgo(14), netCents: 20000 }) });
  });

  const afford = async (qs: string) => {
    const res = await fetch(`${base}/api/finance/afford${qs}`, { headers: { "x-space-id": space } });
    return { status: res.status, body: await res.json() };
  };

  it("400s on a missing or non-positive targetCents", async () => {
    expect((await afford("")).status).toBe(400);
    expect((await afford("?targetCents=-5")).status).toBe(400);
  });

  it("computes a numeric surplus + weekly bill load for a real scenario", async () => {
    const r = await afford("?targetCents=30000");
    expect(r.status).toBe(200);
    const body = r.body as { weeks: number | null; surplusCents: number; weeklyBillLoadCents: number };
    expect(typeof body.surplusCents).toBe("number");
    expect(typeof body.weeklyBillLoadCents).toBe("number");
    expect(body.weeks === null || typeof body.weeks === "number").toBe(true);
  });

  it("returns weeks: null (never Infinity/NaN over the wire) when the pace can't get there", async () => {
    const auth = await fetch(`${base}/api/space/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerTag: "afford-broke", passcode: "secret123", name: "afford-broke" }),
    });
    const brokeSpace = ((await auth.json()) as { id: string }).id;
    const res = await fetch(`${base}/api/finance/afford?targetCents=10000`, { headers: { "x-space-id": brokeSpace } });
    const body = (await res.json()) as { weeks: number | null };
    expect(body.weeks).toBeNull();
  });

  it("a bigger extraPerWeekCents never makes the wait longer", async () => {
    const without = (await afford("?targetCents=1000000")).body as { weeks: number | null };
    const withExtra = (await afford("?targetCents=1000000&extraPerWeekCents=50000")).body as { weeks: number | null };
    if (without.weeks != null && withExtra.weeks != null) {
      expect(withExtra.weeks).toBeLessThanOrEqual(without.weeks);
    }
  });
});
