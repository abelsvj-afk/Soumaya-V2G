import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildContext, type AppContext } from "../context.js";
import { createApp } from "../api/server.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";
import type { GraphData } from "@brain/shared";

let ctx: AppContext;
let server: Server;
let base: string;
let spaceId: string;

beforeAll(async () => {
  ctx = await buildContext({
    dbPath: ":memory:",
    embeddings: new HashEmbeddingProvider(EMBED_DIM),
    llm: new HeuristicProvider(),
  });
  const app = createApp(ctx);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Open a private brain; every data request carries its id.
  const auth = await fetch(`${base}/api/space/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gamerTag: "tester", passcode: "secret123", name: "tester" }),
  });
  spaceId = ((await auth.json()) as { id: string }).id;
});

afterAll(() => {
  server?.close();
  ctx.handle.sqlite.close();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-space-id": spaceId },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, { headers: { "x-space-id": spaceId } });
  return { status: res.status, body: await res.json() };
}

describe("REST API", () => {
  it("reports health with provider info", async () => {
    const { status, body } = await get("/api/health");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.embeddings.dim).toBe(EMBED_DIM);
    expect(body.llm.available).toBe(false); // heuristic fallback
  });

  it("rejects data requests without a valid space", async () => {
    const res = await fetch(`${base}/api/graph`);
    expect(res.status).toBe(401);
  });

  it("creates separate brains and keeps their data isolated", async () => {
    const other = await fetch(`${base}/api/space/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerTag: "relative", passcode: "different", name: "relative" }),
    });
    const otherId = ((await other.json()) as { id: string }).id;
    expect(otherId).not.toBe(spaceId);
    // The other brain starts empty even though `tester` has memories.
    const g = await fetch(`${base}/api/graph`, { headers: { "x-space-id": otherId } });
    const graph = (await g.json()) as GraphData;
    expect(graph.nodes).toHaveLength(0);
  });

  it("ingests thoughts and returns them as graph data", async () => {
    const a = await post("/api/ingest", {
      text: "I want to start a coffee subscription business with local roasters",
    });
    expect(a.status).toBe(200);
    expect(a.body.nodes.length).toBeGreaterThanOrEqual(1);

    await post("/api/ingest", {
      text: "I want to start a coffee subscription company with local roasters",
    });

    const graph = (await get("/api/graph")).body as GraphData;
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    // GraphData is directly react-force-graph-3d shaped.
    expect(graph.nodes[0]).toHaveProperty("id");
    expect(graph).toHaveProperty("links");
  });

  it("rejects empty ingest body", async () => {
    const { status } = await post("/api/ingest", { text: "" });
    expect(status).toBe(400);
  });

  it("distills a conversation into memory-worthy notes (heuristic offline)", async () => {
    const { status, body } = await post("/api/chat/distill", {
      messages: [
        { role: "you", text: "I decided to move the product launch to the third quarter for safety." },
        { role: "soumaya", text: "Noted — a careful call." },
        { role: "you", text: "ok?" },
      ],
    });
    expect(status).toBe(200);
    expect(Array.isArray(body.summaries)).toBe(true);
    // The substantive line is kept; the trivial "ok?" question is dropped.
    expect(body.summaries.some((s: string) => s.includes("third quarter"))).toBe(true);
    expect(body.summaries.some((s: string) => s.trim() === "ok?")).toBe(false);
  });

  it("updates the profile name freely and keeps the gamer tag unique", async () => {
    const patch = (id: string, body: unknown) =>
      fetch(`${base}/api/space/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-space-id": id },
        body: JSON.stringify(body),
      });
    // Name can be anything.
    const r1 = await patch(spaceId, { name: "Renamed Brain" });
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { name: string }).name).toBe("Renamed Brain");
    // A second brain, then try to steal its gamer tag → 409.
    const other = await fetch(`${base}/api/space/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerTag: "takenTag", passcode: "pw1234", name: "Other" }),
    });
    expect(((await other.json()) as { id: string }).id).toBeTruthy();
    const conflict = await patch(spaceId, { gamerTag: "takenTag" });
    expect(conflict.status).toBe(409);
    // A free tag works.
    const ok = await patch(spaceId, { gamerTag: "myFreshTag" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { gamerTag: string }).gamerTag).toBe("myFreshTag");
  });

  it("promotes a cluster into a constellation hub (MOC) with member links", async () => {
    const a = await post("/api/ingest", { text: "Notes on espresso extraction and grind size" });
    const b = await post("/api/ingest", { text: "Tasting log for a new single-origin roast" });
    const ids = [a.body.nodes[0].id as number, b.body.nodes[0].id as number];

    const { status, body } = await post("/api/constellations/promote", {
      name: "Coffee Craft",
      nodeIds: ids,
    });
    expect(status).toBe(200);
    expect(body.kind).toBe("moc");
    expect(body.type).toBe("moc");
    expect(body.label).toBe("Coffee Craft");
    expect(body.memberCount).toBe(2);
    expect(body.origin).toBe("agent"); // Soumaya authored the hub

    // The hub now exists in the graph and links to both members.
    const graph = (await get("/api/graph")).body as GraphData;
    const hub = graph.nodes.find((n) => n.label === "Coffee Craft");
    expect(hub?.kind).toBe("moc");
    const memberLinks = graph.links.filter(
      (l: any) => (typeof l.source === "object" ? l.source.id : l.source) === hub!.id,
    );
    expect(memberLinks.length).toBe(2);
  });

  it("rejects a constellation with fewer than two members", async () => {
    const a = await post("/api/ingest", { text: "a lone thought" });
    const { status } = await post("/api/constellations/promote", {
      name: "Too small",
      nodeIds: [a.body.nodes[0].id],
    });
    expect(status).toBe(400);
  });

  it("semantic search returns the relevant node with a similarity score", async () => {
    const { status, body } = await get(`/api/search?q=${encodeURIComponent("coffee subscription")}`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty("similarity");
    expect(body[0].content.toLowerCase()).toContain("coffee");
  });

  it("returns a node's neighborhood subgraph", async () => {
    const graph = (await get("/api/graph")).body as GraphData;
    const id = graph.nodes[0]!.id;
    const { status, body } = await get(`/api/nodes/${id}/neighbors?depth=2`);
    expect(status).toBe(200);
    expect(body.nodes.some((n: { id: number }) => n.id === id)).toBe(true);
  });

  it("404s for an unknown node", async () => {
    const { status } = await get("/api/nodes/999999");
    expect(status).toBe(404);
  });

  it("earns fuel on ingest and exposes it", async () => {
    const before = (await get("/api/maintenance/fuel")).body.fuel as number;
    const r = await post("/api/ingest", { text: "a brand new reflection worth keeping" });
    expect(r.body.fuelEarned).toBeGreaterThan(0);
    const after = (await get("/api/maintenance/fuel")).body.fuel as number;
    expect(after).toBeGreaterThan(before);
  });

  it("a tend call resets a memory's entropy clock", async () => {
    const graph = (await get("/api/graph")).body as GraphData;
    const id = graph.nodes[0]!.id;
    const { status, body } = await post(`/api/nodes/${id}/tend`, {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("only discretionary expansion jobs burn fuel; core duties are free", async () => {
    const a = (await post("/api/ingest", { text: "fuel split memory alpha" })).body.nodes[0].id;
    const b = (await post("/api/ingest", { text: "fuel split memory beta" })).body.nodes[0].id;
    // Paid jobs require Research Mode on (complete-job re-checks the maintenance gate).
    await post("/api/maintenance/settings", { key: "research_enabled", value: "true" });

    // A CORE job (synthesis) must not spend fuel.
    const f0 = (await get("/api/maintenance/fuel")).body.fuel as number;
    await post("/api/maintenance/complete-job", { type: "synthesis", targets: [a, b] });
    const f1 = (await get("/api/maintenance/fuel")).body.fuel as number;
    expect(f1).toBe(f0);

    // An EXPANSION job (research) spends one job's worth of fuel.
    const rr = await post("/api/maintenance/complete-job", { type: "research", targets: [a] });
    expect(rr.status).toBe(200);
    const f2 = (await get("/api/maintenance/fuel")).body.fuel as number;
    expect(f2).toBeLessThan(f1);
  });

  it("complete-job can't drain the budget with Research Mode off (paid jobs are no-ops)", async () => {
    const a = (await post("/api/ingest", { text: "gate guard alpha" })).body.nodes[0].id;
    await post("/api/ingest", { text: "gate guard beta" });
    // Force Research Mode OFF (a prior test may have enabled this global toggle).
    await post("/api/maintenance/settings", { key: "research_enabled", value: "false" });
    // A crafted research call must not spend fuel or mutate.
    const f0 = (await get("/api/maintenance/fuel")).body.fuel as number;
    const rr = await post("/api/maintenance/complete-job", { type: "research", targets: [a] });
    expect(rr.status).toBe(200);
    expect(rr.body.ok).toBe(false); // no-op
    const f1 = (await get("/api/maintenance/fuel")).body.fuel as number;
    expect(f1).toBe(f0);
    // And the global settings route rejects any key other than research_enabled.
    const bad = await post("/api/maintenance/settings", { key: "usage_budget_usd", value: "0" });
    expect(bad.status).toBe(400);
  });

  it("codex-claim awards fuel once per key (idempotent, can't be farmed)", async () => {
    const f0 = (await get("/api/maintenance/fuel")).body.fuel as number;
    const first = await post("/api/maintenance/codex-claim", { key: "sector-test" });
    expect(first.status).toBe(200);
    expect(first.body.awarded).toBe(true);
    const f1 = (await get("/api/maintenance/fuel")).body.fuel as number;
    expect(f1).toBeGreaterThan(f0);
    // Claiming the same entry again is a no-op — no double reward.
    const again = await post("/api/maintenance/codex-claim", { key: "sector-test" });
    expect(again.body.awarded).toBe(false);
    const f2 = (await get("/api/maintenance/fuel")).body.fuel as number;
    expect(f2).toBe(f1);
    // Missing key is rejected.
    const bad = await post("/api/maintenance/codex-claim", {});
    expect(bad.status).toBe(400);
  });
});
