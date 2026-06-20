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

/** Build a genesis or evolved chapter for a MEMORY from its live state + neighbors. */
function composeMemoryChapter(input: {
  label: string;
  type: string;
  emotionalWeight: number;
  entropy: number;
  degree: number;
  neighbors: string[];
  version: number;
  prior: string | null;
  trigger: string;
  seedId: number;
}): string {
  const { label, emotionalWeight, entropy, degree, neighbors, version, trigger, seedId } = input;
  const rng = seeded(seedId * 101 + version * 7919);
  const emo = emotionWord(emotionalWeight);
  const state = stateWord(entropy);
  const kind = input.type.replace(/_/g, " ");
  const n1 = neighbors[0];
  const n2 = neighbors[1];

  const bond =
    degree === 0
      ? "It drifts alone in the dark, unbound."
      : n1 && n2
        ? `It holds ${n1} and ${n2} in its orbit` + (degree > 2 ? `, and ${degree - 2} more.` : ".")
        : n1
          ? `It is tethered to ${n1}.`
          : `It carries ${degree} quiet connection${degree === 1 ? "" : "s"}.`;

  if (version === 1) {
    const opening = pick(rng, [
      `Born from a ${kind}, "${label}" took its place in the sky as a ${emo} body.`,
      `When "${label}" first kindled, it was a ${emo} ${kind}, ${state}.`,
      `"${label}" arrived as a ${emo} point of light — a ${kind} given mass.`,
    ]);
    return `${opening} ${bond}`;
  }

  // Later chapters reference change + continuity.
  const change: Record<string, string[]> = {
    linked: [`New filaments reached it; the constellation around "${label}" tightened.`, `Fresh bonds formed — "${label}" is less alone than it was.`],
    merged: [`It drank in a kindred memory and grew heavier with the union.`, `Two stories became one here; "${label}" carries both now.`],
    cooled: [`Neglect crept in — "${label}" has drifted toward the cold.`, `Its fire banked low; "${label}" waits, ${state}, for your return.`],
    warmed: [`You returned, and "${label}" flared warm again.`, `Tended once more, its light steadied.`],
    evolved: [`Time worked on it; "${label}" is ${state} now, and ${emo}.`, `The story turned a page — "${label}" reads ${emo} these days.`],
    manual: [`You paused on "${label}", and its tale deepened.`, `Looked at closely, "${label}" gave up a little more of its story.`],
  };
  const line = pick(rng, change[trigger] ?? change.evolved!);
  const continuity = pick(rng, [
    `Once it was simpler.`,
    `Where it began still glows beneath this.`,
    `Chapter ${version} of a longer telling.`,
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
