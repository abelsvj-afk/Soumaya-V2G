import { createDb, type DbHandle } from "./db/client.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddings/adapter.js";
import { createLlmProvider, type LlmProvider } from "./llm/adapter.js";
import { GraphService } from "./graph/service.js";
import { MaintenanceService } from "./maintenance/service.js";

/** Shared application singletons, injected into the API routes. */
export interface AppContext {
  handle: DbHandle;
  embeddings: EmbeddingProvider;
  llm: LlmProvider;
  graph: GraphService;
  maintenance: MaintenanceService;
}

export interface BuildContextOptions {
  dbPath?: string;
  /** Override providers (used by tests to stay offline/key-free). */
  embeddings?: EmbeddingProvider;
  llm?: LlmProvider;
}

export async function buildContext(opts: BuildContextOptions = {}): Promise<AppContext> {
  const handle = createDb(opts.dbPath);
  const embeddings = opts.embeddings ?? (await createEmbeddingProvider());
  const llm = opts.llm ?? (await createLlmProvider());
  const ctx: any = { handle, embeddings, llm, graph: new GraphService(handle) };
  ctx.maintenance = new MaintenanceService(ctx as AppContext);
  return ctx as AppContext;
}
