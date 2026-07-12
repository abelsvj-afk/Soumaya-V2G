import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildContext, type AppContext } from "../context.js";
import { createApp } from "../api/server.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";

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

/* eslint-disable @typescript-eslint/no-explicit-any */
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
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("drives a full budget: balance + bill + income → safe to spend", async () => {
    expect((await put("/api/finance/account/balance", { cents: 114000 })).body.balanceCents).toBe(114000);

    for (const b of [
      { name: "Rent", amountCents: 60000, frequency: "monthly", anchorDate: "2026-01-20" },
      { name: "Insurance", amountCents: 25000, frequency: "monthly", anchorDate: "2026-01-18" },
    ]) {
      expect((await post("/api/finance/bills", b)).status).toBe(200);
    }

    const summary = await get("/api/finance/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.account.balanceCents).toBe(114000);
    expect(typeof summary.body.budget.safeToSpendCents).toBe("number");
    // Bills materialize into upcoming occurrences.
    expect(summary.body.upcoming.length).toBeGreaterThan(0);

    // Manual income adjusts the balance going forward and reports a live budget.
    const inc = await post("/api/finance/income", { date: "2026-01-10", netCents: 5000, platform: "GoPuff" });
    expect(inc.status).toBe(200);
    expect(inc.body.budget.balanceCents).toBe(119000);

    // Manual expense subtracts.
    const exp = await post("/api/finance/expense", { date: "2026-01-10", amountCents: 2000, category: "food" });
    expect(exp.body.budget.balanceCents).toBe(117000);

    // A repeat income is flagged as a likely duplicate (but still recorded).
    const dup = await post("/api/finance/income", { date: "2026-01-10", netCents: 5000, platform: "GoPuff" });
    expect(dup.body.duplicate).toBe(true);
  });
});
