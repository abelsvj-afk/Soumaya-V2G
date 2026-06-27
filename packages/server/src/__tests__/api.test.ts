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
});
