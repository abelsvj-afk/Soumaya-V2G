import type { DbHandle } from "../db/client.js";

/**
 * Telegram ⇄ brain bindings. This deployment hosts many private brains, so a chat
 * is useless until it's linked to a space (via /link name passcode). The mapping
 * also tells the proactive scheduler where to push each brain's daily digest.
 * One chat maps to exactly one brain; re-linking overwrites the previous binding.
 */
export interface TelegramLink {
  chatId: number;
  spaceId: string;
  spaceName: string;
  lastDigestDate: string | null;
}

interface LinkRow {
  chat_id: number;
  space_id: string;
  space_name: string;
  last_digest_date: string | null;
}

const toLink = (r: LinkRow): TelegramLink => ({
  chatId: r.chat_id,
  spaceId: r.space_id,
  spaceName: r.space_name,
  lastDigestDate: r.last_digest_date,
});

export class TelegramLinksRepo {
  constructor(private readonly h: DbHandle) {}

  /** The brain this chat is bound to, or undefined if it hasn't linked yet. */
  get(chatId: number): TelegramLink | undefined {
    const row = this.h.sqlite
      .prepare(`SELECT * FROM telegram_links WHERE chat_id = ?`)
      .get(chatId) as LinkRow | undefined;
    return row ? toLink(row) : undefined;
  }

  /** Bind (or re-bind) a chat to a brain. Resets the digest clock for the new brain. */
  link(chatId: number, spaceId: string, spaceName: string): void {
    this.h.sqlite
      .prepare(
        `INSERT INTO telegram_links (chat_id, space_id, space_name, last_digest_date)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(chat_id) DO UPDATE SET
           space_id = excluded.space_id,
           space_name = excluded.space_name,
           last_digest_date = NULL`,
      )
      .run(chatId, spaceId, spaceName);
  }

  /** Remove a chat's binding. Returns true if a link existed. */
  unlink(chatId: number): boolean {
    const res = this.h.sqlite.prepare(`DELETE FROM telegram_links WHERE chat_id = ?`).run(chatId);
    return res.changes > 0;
  }

  /** Every linked chat (for the proactive digest sweep). */
  all(): TelegramLink[] {
    const rows = this.h.sqlite
      .prepare(`SELECT * FROM telegram_links ORDER BY chat_id`)
      .all() as LinkRow[];
    return rows.map(toLink);
  }

  /** Record that we pushed today's digest to this chat (idempotency for the sweep). */
  markDigestSent(chatId: number, date: string): void {
    this.h.sqlite
      .prepare(`UPDATE telegram_links SET last_digest_date = ? WHERE chat_id = ?`)
      .run(date, chatId);
  }
}
