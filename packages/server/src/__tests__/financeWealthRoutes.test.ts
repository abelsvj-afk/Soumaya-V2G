import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildContext, type AppContext } from "../context.js";
import { createApp } from "../api/server.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { FinBucket, FinGoal, WealthSummary } from "@brain/shared";

/** Wealth (docs/specs/wealth-goals-allocation.md) — the REST surface end-to-end. */

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
    body: JSON.stringify({ gamerTag: "wealth", passcode: "secret123", name: "wealth" }),
  });
  spaceId = ((await auth.json()) as { id: string }).id;
});
afterAll(() => { server?.close(); ctx.handle.sqlite.close(); });

const H = () => ({ "Content-Type": "application/json", "x-space-id": spaceId });
const req = async (method: string, p: string, b?: unknown) => {
  const res = await fetch(`${base}${p}`, { method, headers: H(), ...(b !== undefined ? { body: JSON.stringify(b) } : {}) });
  return { status: res.status, body: await res.json() };
};
const get = (p: string) => req("GET", p);
const post = (p: string, b: unknown) => req("POST", p, b);
const patch = (p: string, b: unknown) => req("PATCH", p, b);
const del = (p: string) => req("DELETE", p);

describe("wealth routes", () => {
  it("requires a space", async () => {
    const res = await fetch(`${base}/api/finance/wealth/summary`);
    expect(res.status).toBe(401);
  });

  it("400s on an invalid bucket body", async () => {
    const { status } = await post("/api/finance/wealth/buckets", { name: "" });
    expect(status).toBe(400);
  });

  it("creates a bucket, then a goal inside it, and lists both", async () => {
    const bucketRes = await post("/api/finance/wealth/buckets", { name: "Trucking", category: "business" });
    expect(bucketRes.status).toBe(200);
    const bucket = bucketRes.body as FinBucket;

    const goalRes = await post("/api/finance/wealth/goals", { bucketId: bucket.id, name: "First Truck", targetCents: 1_500_000 });
    expect(goalRes.status).toBe(200);
    const goal = goalRes.body as FinGoal;
    expect(goal.bucketId).toBe(bucket.id);

    expect((await get("/api/finance/wealth/buckets")).body).toHaveLength(1);
    expect((await get(`/api/finance/wealth/goals?bucketId=${bucket.id}`)).body).toHaveLength(1);
  });

  it("404s creating a goal in a bucket that doesn't exist (or belongs to another space)", async () => {
    const { status, body } = await post("/api/finance/wealth/goals", { bucketId: 999999, name: "Nope" });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/Bucket not found/);
  });

  it("allocates, rejects an over-withdrawal, then allows the exact remaining withdrawal", async () => {
    const bucket = (await post("/api/finance/wealth/buckets", { name: "Emergency" })).body as FinBucket;
    const goal = (await post("/api/finance/wealth/goals", { bucketId: bucket.id, name: "Emergency Fund", targetCents: 1_000_000 })).body as FinGoal;

    const alloc = await post(`/api/finance/wealth/goals/${goal.id}/allocations`, { amountCents: 20000 });
    expect(alloc.status).toBe(200);
    expect((alloc.body as { wealth: WealthSummary }).wealth.allocatedCents).toBeGreaterThanOrEqual(20000);

    const overWithdraw = await post(`/api/finance/wealth/goals/${goal.id}/allocations`, { amountCents: -20001 });
    expect(overWithdraw.status).toBe(400);

    const exactWithdraw = await post(`/api/finance/wealth/goals/${goal.id}/allocations`, { amountCents: -20000 });
    expect(exactWithdraw.status).toBe(200);

    const history = await get(`/api/finance/wealth/goals/${goal.id}/allocations`);
    expect(history.body).toHaveLength(2); // both the allocate and the withdrawal, never erased
  });

  it("rejects a zero-amount allocation", async () => {
    const bucket = (await post("/api/finance/wealth/buckets", { name: "Zero test" })).body as FinBucket;
    const goal = (await post("/api/finance/wealth/goals", { bucketId: bucket.id, name: "Zero goal" })).body as FinGoal;
    const { status } = await post(`/api/finance/wealth/goals/${goal.id}/allocations`, { amountCents: 0 });
    expect(status).toBe(400);
  });

  it("404s allocating to a goal that doesn't exist", async () => {
    const { status } = await post(`/api/finance/wealth/goals/999999/allocations`, { amountCents: 100 });
    expect(status).toBe(404);
  });

  it("archives a bucket and a goal so they drop out of the default list", async () => {
    const bucket = (await post("/api/finance/wealth/buckets", { name: "To archive" })).body as FinBucket;
    const goal = (await post("/api/finance/wealth/goals", { bucketId: bucket.id, name: "Also to archive" })).body as FinGoal;

    expect((await del(`/api/finance/wealth/goals/${goal.id}`)).status).toBe(200);
    expect((await del(`/api/finance/wealth/buckets/${bucket.id}`)).status).toBe(200);
    expect((await get(`/api/finance/wealth/goals?bucketId=${bucket.id}`)).body).toHaveLength(0);
  });

  it("archiving a bucket cascades to its still-active goals — no orphaned allocation left counting toward Deployable (defect #1 regression)", async () => {
    const bucket = (await post("/api/finance/wealth/buckets", { name: "Trucking" })).body as FinBucket;
    const goal = (await post("/api/finance/wealth/goals", { bucketId: bucket.id, name: "First Truck", targetCents: 100000 })).body as FinGoal;
    await post(`/api/finance/wealth/goals/${goal.id}/allocations`, { amountCents: 20000 });

    const before = (await get("/api/finance/wealth/summary")).body as WealthSummary;
    expect(before.allocatedCents).toBeGreaterThanOrEqual(20000);

    // Archive the BUCKET only — the goal itself was never individually archived.
    expect((await del(`/api/finance/wealth/buckets/${bucket.id}`)).status).toBe(200);

    // The goal must no longer be reachable via its (now-archived) bucket...
    expect((await get(`/api/finance/wealth/goals?bucketId=${bucket.id}`)).body).toHaveLength(0);
    // ...and its allocation must no longer count toward the space-wide totals — otherwise
    // it would silently keep dragging Deployable down with no way left to reach or fix it.
    const after = (await get("/api/finance/wealth/summary")).body as WealthSummary;
    expect(after.allocatedCents).toBe(before.allocatedCents - 20000);
    expect(after.goals.some((g) => g.id === goal.id)).toBe(false);
  });

  it("patches a bucket's name", async () => {
    const bucket = (await post("/api/finance/wealth/buckets", { name: "Original" })).body as FinBucket;
    const patched = await patch(`/api/finance/wealth/buckets/${bucket.id}`, { name: "Renamed" });
    expect(patched.status).toBe(200);
    expect((patched.body as FinBucket).name).toBe("Renamed");
  });

  it("GET /wealth/summary reflects reconciliation going over_committed", async () => {
    // A fresh space with zero balance — any positive allocation exceeds its (zero) safe-to-spend.
    const auth = await fetch(`${base}/api/space/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerTag: "wealth2", passcode: "secret123", name: "wealth2" }),
    });
    const otherSpace = ((await auth.json()) as { id: string }).id;
    const H2 = { "Content-Type": "application/json", "x-space-id": otherSpace };
    const bRes = await fetch(`${base}/api/finance/wealth/buckets`, { method: "POST", headers: H2, body: JSON.stringify({ name: "Trucking" }) });
    const bucket = (await bRes.json()) as FinBucket;
    const gRes = await fetch(`${base}/api/finance/wealth/goals`, { method: "POST", headers: H2, body: JSON.stringify({ bucketId: bucket.id, name: "First Truck" }) });
    const goal = (await gRes.json()) as FinGoal;
    await fetch(`${base}/api/finance/wealth/goals/${goal.id}/allocations`, { method: "POST", headers: H2, body: JSON.stringify({ amountCents: 500 }) });

    const summaryRes = await fetch(`${base}/api/finance/wealth/summary`, { headers: { "x-space-id": otherSpace } });
    const summary = (await summaryRes.json()) as WealthSummary;
    expect(summary.reconciliation).toBe("over_committed");
    expect(summary.deployableCents).toBeLessThan(0);
  });
});
