import { createDb, type DbHandle } from "./db/client.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddings/adapter.js";
import { createLlmProvider, type LlmProvider } from "./llm/adapter.js";
import { GraphService } from "./graph/service.js";
import { UsageTracker } from "./usage.js";

/** Shared application singletons, injected into the API routes. */
export interface AppContext {
  handle: DbHandle;
  embeddings: EmbeddingProvider;
  llm: LlmProvider;
  graph: GraphService;
  usage: UsageTracker;
}

export interface BuildContextOptions {
  dbPath?: string;
  /** Override providers (used by tests to stay offline/key-free). */
  embeddings?: EmbeddingProvider;
  llm?: LlmProvider;
}

export async function buildContext(opts: BuildContextOptions = {}): Promise<AppContext> {
  const handle = createDb(opts.dbPath);
  const usage = new UsageTracker(handle);
  const embeddings = opts.embeddings ?? (await createEmbeddingProvider());
  const llm =
    opts.llm ??
    (await createLlmProvider({
      recordUsage: (model, inTok, outTok) => usage.record(model, inTok, outTok),
      isOverBudget: () => usage.overBudget(),
    }));
  return { handle, embeddings, llm, graph: new GraphService(handle), usage };
}
