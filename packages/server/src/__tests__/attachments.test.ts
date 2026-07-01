import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { AttachmentsRepo } from "../repositories/attachments.repo.js";

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
  handle.sqlite.prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES ('legacy','Note','other','body')`).run();
  handle.sqlite.prepare(`INSERT INTO nodes (space_id, label, type, content) VALUES ('other-space','Theirs','other','x')`).run();
});
afterEach(() => handle.sqlite.close());

describe("attachments (docs inside a memory)", () => {
  it("creates, lists (without bytes), fetches full row, and deletes", () => {
    const repo = new AttachmentsRepo(handle, "legacy");
    const meta = repo.create(1, "spec.md", "text/markdown", 5, Buffer.from("hello").toString("base64"));
    expect(meta.filename).toBe("spec.md");
    expect((meta as any).data).toBeUndefined(); // metadata never carries bytes

    const list = repo.listByNode(1);
    expect(list.length).toBe(1);
    expect((list[0] as any).data).toBeUndefined();

    const full = repo.get(meta.id);
    expect(full).toBeTruthy();
    expect(Buffer.from(full!.data, "base64").toString()).toBe("hello");

    expect(repo.delete(meta.id)).toBe(true);
    expect(repo.listByNode(1)).toEqual([]);
  });

  it("scopes ownership + reads by space (no cross-brain access)", () => {
    const mine = new AttachmentsRepo(handle, "legacy");
    const theirs = new AttachmentsRepo(handle, "other-space");
    expect(mine.ownsNode(1)).toBe(true);
    expect(mine.ownsNode(2)).toBe(false); // node 2 belongs to other-space

    const meta = mine.create(1, "f.txt", "text/plain", 3, Buffer.from("abc").toString("base64"));
    // The other brain can't read or delete my attachment.
    expect(theirs.get(meta.id)).toBeUndefined();
    expect(theirs.delete(meta.id)).toBe(false);
    expect(mine.get(meta.id)).toBeTruthy();
  });
});
