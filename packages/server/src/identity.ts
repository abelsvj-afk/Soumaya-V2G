import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Soumaya's identity layer (Stage 4). Loads the repo-root `soul.md` once and
 * injects it into her chat system prompt as deeper character. Offline-safe and
 * non-breaking: if the file isn't found, this returns "" and she falls back to
 * the hardcoded ANSWER_SYSTEM voice. Per the briefing, this is CONTEXT not a
 * security boundary — real limits stay in the harness (fuel/Research-Mode gating,
 * space scoping); never put secrets in these files.
 */

/** Drop a leading `--- ... ---` YAML frontmatter block, returning the body. */
function stripFrontmatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?/);
  return (m ? md.slice(m[0].length) : md).trim();
}

/** Read a repo-root markdown doc, tolerant of where the process was launched. */
function loadRootDoc(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/server/src
  const candidates = [
    join(process.cwd(), name), // production WORKDIR /app + dev (cwd = repo root)
    join(here, "..", "..", "..", name), // repo root relative to this module
    join(here, "..", "..", "..", "..", name),
  ];
  for (const p of candidates) {
    try {
      const body = stripFrontmatter(readFileSync(p, "utf8"));
      if (body) return body;
    } catch {
      /* try the next candidate */
    }
  }
  return "";
}

let cachedSoul: string | null = null;

/** Soumaya's soul (voice/values/boundaries) — cached; "" if the file is absent. */
export function soulText(): string {
  if (cachedSoul === null) cachedSoul = loadRootDoc("soul.md");
  return cachedSoul;
}

/** A minimal sqlite handle — just the prepare/get/run we need (avoids a hard dep). */
interface SoulDb {
  prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): unknown };
}

/**
 * This brain's soul (feature #5b): a per-space override in `space_meta.soul` when set,
 * otherwise the shared `soul.md`. So each brain can tune Soumaya's deeper character.
 */
export function soulTextFor(sqlite: SoulDb, spaceId: string): string {
  try {
    const row = sqlite.prepare(`SELECT soul FROM space_meta WHERE space_id = ?`).get(spaceId) as { soul: string | null } | undefined;
    if (row?.soul && row.soul.trim()) return row.soul;
  } catch {
    /* old volume before the migration ran → fall back to the global soul */
  }
  return soulText();
}

/** Read the per-space soul override ("" if none). */
export function getSpaceSoul(sqlite: SoulDb, spaceId: string): string {
  try {
    const row = sqlite.prepare(`SELECT soul FROM space_meta WHERE space_id = ?`).get(spaceId) as { soul: string | null } | undefined;
    return row?.soul ?? "";
  } catch {
    return "";
  }
}

/** Set (or clear, with "") this brain's soul override. */
export function setSpaceSoul(sqlite: SoulDb, spaceId: string, body: string): void {
  const trimmed = body.trim();
  sqlite.prepare(`INSERT OR IGNORE INTO space_meta (space_id) VALUES (?)`).run(spaceId);
  sqlite.prepare(`UPDATE space_meta SET soul = ? WHERE space_id = ?`).run(trimmed || null, spaceId);
}
