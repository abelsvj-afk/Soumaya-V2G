import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinSourceKind } from "@brain/shared";

/**
 * Owns all SQL for `fin_source` — the retained raw input + provenance for every ingested row,
 * so a committed number is always traceable back to its screenshot/paste. Space-scoped. Raw
 * blobs live out-of-row (blob_ref) per decision D1; paste text + provider output live in
 * extraction_json.
 */
export interface FinSourceRow {
  id: number;
  kind: FinSourceKind;
  blobRef: string | null;
  mime: string | null;
  extractionJson: string | null;
  status: "pending" | "confirmed" | "discarded";
  createdAt: string;
}

export class FinSourceRepo {
  constructor(private handle: DbHandle, private spaceId: string = DEFAULT_SPACE) {}

  private map(r: any): FinSourceRow {
    return { id: r.id, kind: r.kind, blobRef: r.blob_ref ?? null, mime: r.mime ?? null, extractionJson: r.extraction_json ?? null, status: r.status, createdAt: r.created_at };
  }

  create(input: { kind: FinSourceKind; blobRef?: string | null; mime?: string | null; extractionJson?: string | null }): FinSourceRow {
    const info = this.handle.sqlite
      .prepare(`INSERT INTO fin_source (space_id, kind, blob_ref, mime, extraction_json, status) VALUES (?, ?, ?, ?, ?, 'pending')`)
      .run(this.spaceId, input.kind, input.blobRef ?? null, input.mime ?? null, input.extractionJson ?? null);
    return this.get(Number(info.lastInsertRowid))!;
  }

  get(id: number): FinSourceRow | null {
    const r = this.handle.sqlite.prepare(`SELECT * FROM fin_source WHERE id = ? AND space_id = ?`).get(id, this.spaceId);
    return r ? this.map(r) : null;
  }

  setStatus(id: number, status: "pending" | "confirmed" | "discarded"): boolean {
    return this.handle.sqlite.prepare(`UPDATE fin_source SET status = ? WHERE id = ? AND space_id = ?`).run(status, id, this.spaceId).changes > 0;
  }
}
