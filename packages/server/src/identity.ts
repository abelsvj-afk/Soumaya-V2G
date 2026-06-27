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
