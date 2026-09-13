import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildContext, type AppContext } from "../context.js";
import { createApp } from "../api/server.js";
import { HashEmbeddingProvider } from "../embeddings/hash.js";
import { HeuristicProvider } from "../llm/heuristic.js";
import { EMBED_DIM } from "../db/vec.js";

/** docs/overworld/npc-llm-dialogue.md, task #61 — real batched NPC flavor-line generation,
 *  offline-safe via the heuristic base (no API key configured in this test). */

let ctx: AppContext;
let server: Server;
let base: string;
let spaceId: string;

beforeAll(async () => {
  ctx = await buildContext({ dbPath: ":memory:", embeddings: new HashEmbeddingProvider(EMBED_DIM), llm: new HeuristicProvider() });
  const app = createApp(ctx);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = await fetch(`${base}/api/space/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gamerTag: "npcdialogue", passcode: "secret123", name: "npcdialogue" }),
  });
  spaceId = ((await auth.json()) as { id: string }).id;
});
afterAll(() => {
  server?.close();
  ctx.handle.sqlite.close();
});

const H = () => ({ "Content-Type": "application/json", "x-space-id": spaceId });
const post = async (p: string, b: unknown) => {
  const res = await fetch(`${base}${p}`, { method: "POST", headers: H(), body: JSON.stringify(b) });
  return { status: res.status, body: await res.json() };
};

const VALID_BODY = {
  npcs: [
    { npcId: "bank-0", name: "Priya", jobFlavor: "Counting the day's ledger." },
    { npcId: "bank-1", name: "Otis", jobFlavor: "Reconciling the books." },
  ],
  townState: { treasuryCents: 4200, neglectedBuildings: [], nodeCount: 5, npcCount: 20 },
};

describe("POST /api/npc-dialogue", () => {
  it("returns one line per NPC, in the same order, using the offline heuristic (no LLM key here)", async () => {
    const { status, body } = await post("/api/npc-dialogue", VALID_BODY);
    expect(status).toBe(200);
    const lines = (body as { lines: string[] }).lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Counting the day's ledger");
    expect(lines[1]).toContain("Reconciling the books");
  });

  it("400s a malformed body rather than crashing", async () => {
    const { status } = await post("/api/npc-dialogue", { npcs: "not an array" });
    expect(status).toBe(400);
  });

  it("400s an empty npcs array", async () => {
    const { status } = await post("/api/npc-dialogue", { ...VALID_BODY, npcs: [] });
    expect(status).toBe(400);
  });

  it("requires a real space header, same as every other guarded route", async () => {
    const res = await fetch(`${base}/api/npc-dialogue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });
});
