import { LocalEmbeddingProvider } from "./local.js";

/**
 * Build-time warm-up: downloads the embedding model into EMBED_CACHE_DIR so it can
 * be baked into the Docker image and loaded offline at runtime.
 *
 * BEST-EFFORT by design. The CI/Depot/Fly build environment may have no outbound
 * access to HuggingFace (connection timeouts) — baking is an optimization, not a
 * requirement: at runtime the model is fetched on first use if missing, and if
 * that also fails the app degrades to the dependency-free hash embeddings
 * (see createEmbeddingProvider). So a failed bake must NOT fail the build. We
 * retry a few times for transient blips, then warn and exit 0.
 *
 * Set EMBED_WARM_STRICT=1 to restore fail-loud behavior (useful locally to confirm
 * the model really cached).
 */
const STRICT = process.env.EMBED_WARM_STRICT === "1";
const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastErr: unknown;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    const provider = new LocalEmbeddingProvider();
    const v = await provider.embed("warmup");
    console.log(
      `[warm] cached ${provider.model} (${v.length}d) -> ${process.env.EMBED_CACHE_DIR ?? "default cache"}`,
    );
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.warn(`[warm] attempt ${attempt}/${ATTEMPTS} failed: ${(err as Error).message}`);
    if (attempt < ATTEMPTS) await sleep(attempt * 3000); // 3s, then 6s backoff
  }
}

if (STRICT) {
  console.error("[warm] could not cache the embedding model (EMBED_WARM_STRICT=1).");
  throw lastErr;
}
console.warn(
  "[warm] model not baked (no build-time network to HuggingFace). The server will " +
    "fetch it on first use, or fall back to hash embeddings. Continuing so the build succeeds.",
);
process.exit(0);
