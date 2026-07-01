import type { LoreEntry, LoreSubjectType } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * The lore engine: each object accrues an append-only, versioned story. v1 is the
 * genesis (never rewritten); each later chapter EXTENDS it, aware of the object's
 * current state and its neighbors, so the lore visibly mutates as the galaxy grows
 * (memories added/linked/merged, bodies cooling and warming).
 *
 * v1 generation is a self-contained, offline heuristic chronicler (free, no API
 * key, never breaks the offline path). An LLM-authored layer can slot in later
 * behind the same `evolveLore` seam.
 */

interface LoreRow {
  id: number;
  subject_type: string;
  subject_id: string;
  version: number;
  text: string;
  trigger: string;
  created_at: string;
}

const toEntry = (r: LoreRow): LoreEntry => ({
  id: r.id,
  subjectType: r.subject_type as LoreSubjectType,
  subjectId: r.subject_id,
  version: r.version,
  text: r.text,
  trigger: r.trigger,
  createdAt: r.created_at,
});

export class LoreRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  /** All chapters for a subject, oldest → newest. */
  history(subjectType: LoreSubjectType, subjectId: string): LoreEntry[] {
    const rows = this.h.sqlite
      .prepare(
        `SELECT * FROM lore WHERE space_id = ? AND subject_type = ? AND subject_id = ? ORDER BY version ASC`,
      )
      .all(this.spaceId, subjectType, subjectId) as LoreRow[];
    return rows.map(toEntry);
  }

  current(subjectType: LoreSubjectType, subjectId: string): LoreEntry | null {
    const row = this.h.sqlite
      .prepare(
        `SELECT * FROM lore WHERE space_id = ? AND subject_type = ? AND subject_id = ? ORDER BY version DESC LIMIT 1`,
      )
      .get(this.spaceId, subjectType, subjectId) as LoreRow | undefined;
    return row ? toEntry(row) : null;
  }

  /** Overwrite a chapter's text in place (e.g. upgrade the heuristic prose with LLM lore). */
  updateText(id: number, text: string): void {
    this.h.sqlite.prepare(`UPDATE lore SET text = ? WHERE id = ? AND space_id = ?`).run(text, id, this.spaceId);
  }

  append(subjectType: LoreSubjectType, subjectId: string, text: string, trigger: string): LoreEntry {
    const prev = this.current(subjectType, subjectId);
    const version = (prev?.version ?? 0) + 1;
    const row = this.h.sqlite
      .prepare(
        `INSERT INTO lore (space_id, subject_type, subject_id, version, text, trigger)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(this.spaceId, subjectType, subjectId, version, text, trigger) as LoreRow;
    return toEntry(row);
  }
}

// --- deterministic variety: same subject+version always reads the same way ---
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length]!;

const emotionWord = (ew: number): string =>
  ew > 0.5 ? "radiant" : ew > 0.15 ? "warm-lit" : ew < -0.5 ? "storm-dark" : ew < -0.15 ? "shadowed" : "quiet";

const stateWord = (entropy: number): string =>
  entropy < 0.2 ? "burning bright" : entropy < 0.45 ? "its light dimming" : "gone cold";

// The galaxy has a consistent geography: each KIND of memory lives in a named region.
// This turns the lore into a coherent atlas of your inner cosmos rather than generic
// "a star was born" prose.
const SECTOR: Record<string, string> = {
  person: "the Kinship Reaches",
  company: "the Guild Expanse",
  project: "the Forge Fields",
  decision: "the Crossroad Nebula",
  meeting: "the Confluence",
  daily: "the Drift",
  knowledge: "the Archive Belt",
  concept: "the Deep Field",
  moc: "a charted constellation",
  other: "the Uncharted Verge",
};

/** Pull the essence of a memory — its first clause/sentence — so the lore is actually
 *  ABOUT the thought, not just its title. Cleaned + trimmed to a phrase. */
function essenceOf(content: string, label: string): string {
  const raw = (content || "").replace(/\s+/g, " ").trim();
  if (!raw || raw.toLowerCase() === label.toLowerCase()) return "";
  const clause = raw.split(/[.!?;\n]/)[0]!.trim();
  const phrase = clause.length > 90 ? clause.slice(0, 88).replace(/\s\S*$/, "") + "…" : clause;
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

/** Build a genesis or evolved chapter for a MEMORY from its live state + neighbors. */
function composeMemoryChapter(input: {
  label: string;
  type: string;
  content: string;
  emotionalWeight: number;
  entropy: number;
  degree: number;
  neighbors: string[];
  version: number;
  prior: string | null;
  trigger: string;
  seedId: number;
}): string {
  const { label, content, emotionalWeight, entropy, degree, neighbors, version, trigger, seedId } = input;
  const rng = seeded(seedId * 101 + version * 7919);
  const emo = emotionWord(emotionalWeight);
  const state = stateWord(entropy);
  const sector = SECTOR[input.type] ?? SECTOR.other!;
  const essence = essenceOf(content, label);
  const about = essence ? ` — the record of ${essence}` : "";
  const n1 = neighbors[0];
  const n2 = neighbors[1];

  const bond =
    degree === 0
      ? "No filaments reach it yet; it drifts a lone beacon, waiting to be joined."
      : n1 && n2
        ? `Its light is braided with ${n1} and ${n2}` + (degree > 2 ? `, and ${degree - 2} other bodies.` : ".")
        : n1
          ? `A single filament tethers it to ${n1}.`
          : `${degree} quiet filament${degree === 1 ? "" : "s"} anchor it to the field.`;

  if (version === 1) {
    const opening = pick(rng, [
      `Charted in ${sector}, "${label}"${about} ignited where a ${emo} current pooled and would not disperse.`,
      `The atlas marks "${label}" in ${sector}${about}: a ${emo} body, ${state}, that gathered its own mass from attention alone.`,
      `Deep in ${sector}, "${label}" first kindled${about} — a ${emo} light given weight by the fact that you remembered it.`,
    ]);
    return `${opening} ${bond}`;
  }

  const change: Record<string, string[]> = {
    linked: [`New filaments arced across ${sector} to reach it; the constellation around "${label}" drew tighter.`, `Fresh bonds crystallized — "${label}" is woven deeper into the field than it was.`],
    merged: [`It drew a kindred body into itself and grew heavier with the union; two tellings are one light now.`, `A neighbouring memory fell into its gravity, and "${label}" now carries both stories at once.`],
    cooled: [`Attention ebbed from ${sector}, and "${label}" drifted toward the cold, its glow banking ${state}.`, `Unvisited, its fire dimmed; "${label}" holds its orbit and waits, ${state}, for your return.`],
    warmed: [`You crossed back into ${sector}, and "${label}" flared ${emo} and bright again.`, `Tended once more, the body steadied and its light held.`],
    evolved: [`Time and gravity reworked it; in ${sector}, "${label}" reads ${emo} now, and ${state}.`, `The atlas turned a page on "${label}" — its meaning has settled into something ${emo}.`],
    manual: [`You lingered over "${label}", and its entry in the atlas deepened by a line.`, `Studied closely, "${label}" surrendered a little more of what it holds.`],
  };
  const line = pick(rng, change[trigger] ?? change.evolved!);
  const continuity = pick(rng, [
    `Beneath this, the first light of its genesis still burns.`,
    `Chapter ${version} in the chronicle of a single remembered thing.`,
    `What it was is still legible under what it has become.`,
  ]);
  return `${line} ${bond} ${continuity}`;
}

/** Simple evolving chapter for the agents (ship/station/beacon), aware of the brain. */
function composeAgentChapter(subjectType: LoreSubjectType, stats: { count: number; cold: number }, version: number, seedId: number): string {
  const rng = seeded(seedId + version * 13);
  const who =
    subjectType === "ship"
      ? "Soumaya"
      : subjectType === "station"
        ? "Waystation Soumaya-Prime"
        : "the Aura relays";
  if (version === 1) {
    return pick(rng, [
      `${who} keeps watch over a galaxy of ${stats.count} memories.`,
      `${who} took station here when the sky held ${stats.count} lights.`,
    ]);
  }
  return stats.cold > 0
    ? `${who} tends on — ${stats.cold} memor${stats.cold === 1 ? "y is" : "ies are"} going cold among ${stats.count}.`
    : `${who} reports a warm, well-kept sky of ${stats.count} memories. Nothing fades unseen.`;
}

/** Neighbor labels for a memory (for world-aware lore). */
function neighborLabels(h: DbHandle, spaceId: string, nodeId: number, limit = 4): string[] {
  const rows = h.sqlite
    .prepare(
      `SELECT n.label FROM nodes n
       JOIN edges e ON (e.source = n.id OR e.target = n.id)
       WHERE n.space_id = ? AND (e.source = ? OR e.target = ?) AND n.id != ? AND n.deleted_at IS NULL
       LIMIT ?`,
    )
    .all(spaceId, nodeId, nodeId, nodeId, limit) as { label: string }[];
  return rows.map((r) => r.label);
}

/**
 * Generate + persist the next lore chapter for a subject. Genesis if none exists,
 * otherwise an evolution. World-aware for memories (uses neighbors + live state).
 * Returns the new chapter, or null if the subject can't be found.
 */
export function evolveLore(
  h: DbHandle,
  spaceId: string,
  subjectType: LoreSubjectType,
  subjectId: string,
  trigger = "evolved",
): LoreEntry | null {
  const repo = new LoreRepo(h, spaceId);
  const prior = repo.current(subjectType, subjectId);
  const version = (prior?.version ?? 0) + 1;
  const finalTrigger = version === 1 ? "genesis" : trigger;

  if (subjectType === "memory") {
    const id = Number(subjectId);
    if (!Number.isFinite(id)) return null;
    const node = new NodesRepo(h, spaceId).getById(id);
    if (!node) return null;
    const degree = (h.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = ? AND (source = ? OR target = ?)`)
      .get(spaceId, id, id) as { c: number }).c;
    const text = composeMemoryChapter({
      label: node.label,
      type: node.type,
      content: node.content ?? "",
      emotionalWeight: node.emotionalWeight ?? 0,
      entropy: node.entropy ?? 0,
      degree,
      neighbors: neighborLabels(h, spaceId, id),
      version,
      prior: prior?.text ?? null,
      trigger: finalTrigger,
      seedId: id,
    });
    return repo.append(subjectType, subjectId, text, finalTrigger);
  }

  // Agent lore (ship/station/beacon).
  const count = (h.sqlite
    .prepare(`SELECT COUNT(*) AS c FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind != 'action')`)
    .get(spaceId) as { c: number }).c;
  const cold = (h.sqlite
    .prepare(`SELECT COUNT(*) AS c FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND last_tended_at IS NOT NULL AND julianday('now') - julianday(last_tended_at) > 21`)
    .get(spaceId) as { c: number }).c;
  const seed = subjectType.length * 31 + subjectId.length;
  const text = composeAgentChapter(subjectType, { count, cold }, version, seed);
  return repo.append(subjectType, subjectId, text, finalTrigger);
}

/**
 * Read a subject's lore, creating its genesis chapter on first view so every
 * object always has a story. Returns the full history (oldest → newest).
 */
export function getOrCreateLore(
  h: DbHandle,
  spaceId: string,
  subjectType: LoreSubjectType,
  subjectId: string,
): LoreEntry[] {
  const repo = new LoreRepo(h, spaceId);
  if (!repo.current(subjectType, subjectId)) {
    evolveLore(h, spaceId, subjectType, subjectId, "genesis");
  }
  return repo.history(subjectType, subjectId);
}
