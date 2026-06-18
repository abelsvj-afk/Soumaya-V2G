import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE, type KnowledgeDocRow } from "../db/schema.js";
import type { EmbeddingProvider } from "../embeddings/adapter.js";
import { KnowledgeRepo } from "../repositories/knowledge.repo.js";

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

/**
 * Split a document into overlapping chunks for retrieval. Dependency-free: a
 * sliding window that snaps to the nearest whitespace within a small look-back so
 * chunks don't split mid-word. CRLF normalized; runs of blank lines collapsed.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = opts.size ?? 1000;
  const overlap = opts.overlap ?? 150;
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length === 0) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    // Snap to a nearby whitespace boundary (look back up to ~80 chars).
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      if (lastBreak > size - 80) end = i + lastBreak + 1;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks;
}

/**
 * Ingest a reference document: chunk → embed (same provider as everything else,
 * so hash-fallback works offline and dims always match EMBED_DIM) → store rows +
 * vectors. Returns the created doc row.
 */
export async function ingestDocument(
  h: DbHandle,
  deps: { embeddings: EmbeddingProvider },
  input: { name: string; mime?: string; text: string },
  spaceId: string = DEFAULT_SPACE,
): Promise<KnowledgeDocRow & { chunks: number }> {
  const repo = new KnowledgeRepo(h, spaceId);
  const chunks = chunkText(input.text);
  const doc = repo.createDoc({
    name: input.name,
    mime: input.mime ?? "text/plain",
    charCount: input.text.length,
  });
  if (chunks.length > 0) {
    const embeddings = await deps.embeddings.embedBatch(chunks);
    repo.insertChunks(doc.id, chunks, embeddings);
  }
  return { ...doc, chunks: chunks.length };
}
