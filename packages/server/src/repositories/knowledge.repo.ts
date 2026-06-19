import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbHandle } from "../db/client.js";
import {
  DEFAULT_SPACE,
  knowledgeChunks,
  knowledgeDocs,
  type KnowledgeChunkRow,
  type KnowledgeDocRow,
} from "../db/schema.js";
import { upsertDocEmbedding, deleteDocEmbeddings } from "../db/vec.js";

export interface ChunkHit {
  id: number;
  docId: number;
  ordinal: number;
  content: string;
  docName: string;
}

/**
 * Knowledge documents + their retrievable chunks (AI Companion RAG). Space-scoped.
 * Chunk rows + their vectors are written together (atomic), mirroring NodesRepo.
 */
export class KnowledgeRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  listDocs(): (KnowledgeDocRow & { chunks: number })[] {
    const docs = this.h.db
      .select()
      .from(knowledgeDocs)
      .where(eq(knowledgeDocs.spaceId, this.spaceId))
      .orderBy(desc(knowledgeDocs.id))
      .all();
    return docs.map((d) => {
      const c = this.h.sqlite
        .prepare(`SELECT COUNT(*) AS c FROM knowledge_chunks WHERE doc_id = ?`)
        .get(d.id) as { c: number };
      return { ...d, chunks: c.c };
    });
  }

  createDoc(input: { name: string; mime: string; charCount: number }): KnowledgeDocRow {
    return this.h.db
      .insert(knowledgeDocs)
      .values({ spaceId: this.spaceId, name: input.name, mime: input.mime, charCount: input.charCount })
      .returning()
      .get();
  }

  /** Insert all chunks of a doc + their embeddings in one transaction. */
  insertChunks(docId: number, chunks: string[], embeddings: Float32Array[]): void {
    const insert = this.h.db.insert(knowledgeChunks);
    this.h.sqlite.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const row = insert
          .values({ spaceId: this.spaceId, docId, ordinal: i, content: chunks[i]! })
          .returning()
          .get();
        upsertDocEmbedding(this.h.sqlite, row.id, embeddings[i]!);
      }
    })();
  }

  /** Resolve chunk ids back to content + their document name (for the chat prompt). */
  chunksByIds(ids: number[]): ChunkHit[] {
    if (ids.length === 0) return [];
    const rows = this.h.db
      .select()
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.spaceId, this.spaceId), inArray(knowledgeChunks.id, ids)))
      .all();
    const docNames = new Map<number, string>();
    for (const r of rows) {
      if (!docNames.has(r.docId)) {
        const d = this.h.db
          .select({ name: knowledgeDocs.name })
          .from(knowledgeDocs)
          .where(eq(knowledgeDocs.id, r.docId))
          .get();
        docNames.set(r.docId, d?.name ?? "document");
      }
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows
      .map((r) => ({
        id: r.id,
        docId: r.docId,
        ordinal: r.ordinal,
        content: r.content,
        docName: docNames.get(r.docId) ?? "document",
      }))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  /** Rename a doc (scoped). Returns true if it existed. */
  renameDoc(id: number, name: string): boolean {
    const res = this.h.sqlite
      .prepare(`UPDATE knowledge_docs SET name = ? WHERE id = ? AND space_id = ?`)
      .run(name, id, this.spaceId);
    return res.changes > 0;
  }

  /** Hard-delete a doc: drop its chunk vectors, chunk rows, then the doc — scoped. */
  deleteDoc(id: number): boolean {
    const doc = this.h.db
      .select()
      .from(knowledgeDocs)
      .where(and(eq(knowledgeDocs.id, id), eq(knowledgeDocs.spaceId, this.spaceId)))
      .get();
    if (!doc) return false;
    const chunkIds = (
      this.h.sqlite.prepare(`SELECT id FROM knowledge_chunks WHERE doc_id = ?`).all(id) as { id: number }[]
    ).map((r) => r.id);
    this.h.sqlite.transaction(() => {
      deleteDocEmbeddings(this.h.sqlite, chunkIds);
      this.h.sqlite.prepare(`DELETE FROM knowledge_chunks WHERE doc_id = ?`).run(id);
      this.h.sqlite.prepare(`DELETE FROM knowledge_docs WHERE id = ? AND space_id = ?`).run(id, this.spaceId);
    })();
    return true;
  }
}

/** "About Me" — the user persona singleton per brain. */
export class UserPersonaRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  get(): string | null {
    const row = this.h.sqlite
      .prepare(`SELECT body FROM user_persona WHERE space_id = ?`)
      .get(this.spaceId) as { body: string } | undefined;
    return row?.body ?? null;
  }

  set(body: string): void {
    this.h.sqlite
      .prepare(
        `INSERT INTO user_persona (space_id, body, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(space_id) DO UPDATE SET body = excluded.body, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(this.spaceId, body);
  }
}
