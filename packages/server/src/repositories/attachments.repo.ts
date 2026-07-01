import { and, desc, eq } from "drizzle-orm";
import type { Attachment } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { attachments, nodes, DEFAULT_SPACE, type AttachmentRow } from "../db/schema.js";

/** Files attached to memory notes. Space-scoped; every read/write checks `space_id`
 *  so one brain can never reach another's attachments. */
export class AttachmentsRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  /** True if the node exists in this space (guards attach-to-someone-else's-node). */
  ownsNode(nodeId: number): boolean {
    const row = this.h.db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.id, nodeId), eq(nodes.spaceId, this.spaceId)))
      .get();
    return row !== undefined;
  }

  create(nodeId: number, filename: string, mime: string, size: number, data: string): Attachment {
    const row = this.h.db
      .insert(attachments)
      .values({ spaceId: this.spaceId, nodeId, filename, mime, size, data })
      .returning()
      .get();
    return toMeta(row);
  }

  /** Attachment metadata for a node (no bytes). */
  listByNode(nodeId: number): Attachment[] {
    return this.h.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.spaceId, this.spaceId), eq(attachments.nodeId, nodeId)))
      .orderBy(desc(attachments.id))
      .all()
      .map(toMeta);
  }

  /** Full row (incl. base64 data) for download, space-checked. */
  get(id: number): AttachmentRow | undefined {
    return this.h.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.spaceId, this.spaceId)))
      .get();
  }

  delete(id: number): boolean {
    const res = this.h.db
      .delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.spaceId, this.spaceId)))
      .run();
    return res.changes > 0;
  }
}

const toMeta = (r: AttachmentRow): Attachment => ({
  id: r.id,
  nodeId: r.nodeId,
  filename: r.filename,
  mime: r.mime,
  size: r.size,
  createdAt: r.createdAt,
});
