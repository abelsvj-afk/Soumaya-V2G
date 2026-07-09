import { COGNITIVE_META, skillTier } from "@brain/shared";
import type { AppContext } from "../context.js";
import { ingest } from "../ingestion/pipeline.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { EdgesRepo } from "../repositories/edges.repo.js";
import { EconomyRepo, EARN_MEMORY, EARN_LINK } from "../economy.js";
import { StreakRepo, STREAK_DAY_BONUS } from "../streak.js";
import { knn, getEmbedding } from "../db/vec.js";
import { isRejected, recordRejection } from "./rejections.js";

/**
 * The proactive-intelligence layer. Beyond linking, Soumaya NOTICES structural
 * situations in your graph and raises a question about them — across every scope,
 * not just one. Three grounded heuristics (deterministic + offline, no halluc/LLM
 * needed to ask):
 *
 *  • BRIDGE  — a recent memory ties two DISTINCT anchors/hubs (people, goals,
 *              constellations) that weren't connected. → "What's the dynamic
 *              between <A> and <B>?" (generalises the "talking to two people" case).
 *  • ANCHOR  — a recent memory sits semantically ON an existing person/goal/identity
 *              WITHOUT naming it. → "This feels close to <anchor> — does it belong
 *              with it?" (the "girlfriend, but you didn't say her name" case).
 *  • THEME   — several recent memories cluster on a keyword with no hub naming it.
 *              → "You keep circling <theme> — is this becoming its own thing?"
 *
 * Answering IS logging: the reply is ingested (extraction, embedding, linking) and
 * tied to the memories she asked about, paying the normal earn path — so her
 * noticing literally makes the brain smarter. Deduped by signature so a dismissed
 * question never comes back, and capped so she's never spammy.
 */

/** Don't pile on: never hold more than this many open inquiries at once. */
const MAX_OPEN = 3;
/** Only reason about memories touched recently, so noticing tracks what you add. */
const RECENT_DAYS = 21;
/**
 * Semantic floor for the ANCHOR "this sits on that" heuristic. She only ASKS about
 * a genuinely strong overlap, not a vague resemblance. People + identities get an
 * even STRICTER bar — she'll surface "this really seems to be about <person>, even
 * though you didn't name them — connect?" only when it's obvious, never on a whim.
 * (She never auto-links people by vibe; she asks, and you confirm or reject.)
 */
const ANCHOR_SIM = 0.78;
const ANCHOR_SIM_STRICT = 0.85;
const STRICT_KINDS = new Set<string>(["person_entity", "identity"]);
/** Common words that never make a meaningful "theme". */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "from", "your", "you", "was", "are",
  "but", "not", "his", "her", "she", "him", "they", "them", "our", "out", "about", "just",
  "like", "when", "what", "who", "why", "how", "get", "got", "did", "does", "will", "would",
  "been", "being", "into", "over", "than", "then", "some", "more", "very", "can", "could",
  "day", "today", "time", "really", "feel", "felt", "went", "made", "make", "now",
]);

export interface Inquiry {
  id: number;
  question: string;
  kind: string;
  nodes: { id: number; label: string }[];
  createdAt: string;
}

function isCognitive(kind: string | null | undefined): boolean {
  return kind != null && kind in COGNITIVE_META;
}

/** Existing signatures (any status) so we never re-ask the same noticing. */
function knownSignatures(ctx: AppContext, spaceId: string): Set<string> {
  const rows = ctx.handle.sqlite
    .prepare(`SELECT signature FROM inquiries WHERE space_id = ?`)
    .all(spaceId) as { signature: string }[];
  return new Set(rows.map((r) => r.signature));
}

type Candidate = { question: string; kind: string; nodeIds: number[]; signature: string };

/** BRIDGE: a recent memory linking two distinct anchors/hubs that aren't connected. */
function bridgeCandidate(ctx: AppContext, spaceId: string, seen: Set<string>): Candidate | null {
  const s = ctx.handle.sqlite;
  // Recent memories that connect to 2+ "entities" (cognitive anchors or MOC hubs).
  const recent = s
    .prepare(
      `SELECT n.id FROM nodes n
       WHERE n.space_id = ? AND n.deleted_at IS NULL AND (n.kind IS NULL OR n.kind = 'memory')
         AND julianday('now') - julianday(COALESCE(n.last_tended_at, n.created_at)) <= ${RECENT_DAYS}
       ORDER BY n.id DESC LIMIT 40`,
    )
    .all(spaceId) as { id: number }[];
  for (const m of recent) {
    // Neighbours of this memory that are anchors or hubs.
    const neigh = s
      .prepare(
        `SELECT DISTINCT other.id AS id, other.label AS label, other.kind AS kind FROM edges e
         JOIN nodes other ON other.id = CASE WHEN e.source = ? THEN e.target ELSE e.source END
         WHERE e.space_id = ? AND (e.source = ? OR e.target = ?)
           AND other.deleted_at IS NULL`,
      )
      .all(m.id, spaceId, m.id, m.id) as { id: number; label: string; kind: string | null }[];
    const entities = neigh.filter((x) => isCognitive(x.kind) || x.kind === "moc");
    if (entities.length < 2) continue;
    // Take the two most distinctive; require they aren't already directly linked.
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]!;
        const b = entities[j]!;
        const linked = s
          .prepare(
            `SELECT 1 FROM edges WHERE space_id = ? AND ((source = ? AND target = ?) OR (source = ? AND target = ?))`,
          )
          .get(spaceId, a.id, b.id, b.id, a.id);
        if (linked) continue;
        if (isRejected(ctx, spaceId, a.id, b.id)) continue; // user said these don't relate
        const sig = `bridge:${[a.id, b.id].sort((x, y) => x - y).join("-")}`;
        if (seen.has(sig)) continue;
        return {
          question: `Something you logged connects "${a.label}" and "${b.label}", but I don't see how they relate yet. What's the link — or the dynamic — between them?`,
          kind: "bridge",
          nodeIds: [a.id, b.id, m.id],
          signature: sig,
        };
      }
    }
  }
  return null;
}

/** ANCHOR: a recent memory that sits semantically on an anchor it doesn't name. */
function anchorCandidate(ctx: AppContext, spaceId: string, seen: Set<string>): Candidate | null {
  const s = ctx.handle.sqlite;
  const kinds = Object.keys(COGNITIVE_META);
  const anchors = s
    .prepare(
      `SELECT id, label, kind FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind IN (${kinds.map(() => "?").join(",")})`,
    )
    .all(spaceId, ...kinds) as { id: number; label: string; kind: string }[];
  for (const a of anchors) {
    const emb = getEmbedding(s, a.id);
    if (!emb) continue;
    // People/identities need a much stronger overlap before she'll even ASK — so a
    // person is only surfaced when a memory is *obviously* about them, not by vibe.
    const floor = STRICT_KINDS.has(a.kind) ? ANCHOR_SIM_STRICT : ANCHOR_SIM;
    const hits = knn(s, emb, 8, spaceId).filter((h) => h.nodeId !== a.id && h.similarity >= floor);
    for (const h of hits) {
      const mem = s
        .prepare(
          `SELECT id, label, content FROM nodes
           WHERE id = ? AND space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')
             AND julianday('now') - julianday(COALESCE(last_tended_at, created_at)) <= ${RECENT_DAYS}`,
        )
        .get(h.nodeId, spaceId) as { id: number; label: string; content: string } | undefined;
      if (!mem) continue;
      // Skip if it already mentions the anchor by name (then it's not a hidden link).
      if (`${mem.label} ${mem.content}`.toLowerCase().includes(a.label.toLowerCase())) continue;
      // Skip if already linked to the anchor.
      const linked = s
        .prepare(
          `SELECT 1 FROM edges WHERE space_id = ? AND ((source = ? AND target = ?) OR (source = ? AND target = ?))`,
        )
        .get(spaceId, mem.id, a.id, a.id, mem.id);
      if (linked) continue;
      if (isRejected(ctx, spaceId, mem.id, a.id)) continue; // user said these don't relate
      const sig = `anchor:${a.id}-${mem.id}`;
      if (seen.has(sig)) continue;
      const meta = COGNITIVE_META[a.kind as keyof typeof COGNITIVE_META];
      return {
        question: `"${mem.label}" feels closely tied to your ${meta?.label.toLowerCase() ?? "note"} "${a.label}", even though you didn't say so. Is it about that — and how?`,
        kind: "anchor",
        nodeIds: [a.id, mem.id],
        signature: sig,
      };
    }
  }
  return null;
}

/** THEME: a keyword recurring across recent memories with no hub naming it. */
function themeCandidate(ctx: AppContext, spaceId: string, seen: Set<string>): Candidate | null {
  const s = ctx.handle.sqlite;
  const recent = s
    .prepare(
      `SELECT id, label, content FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')
         AND julianday('now') - julianday(COALESCE(last_tended_at, created_at)) <= ${RECENT_DAYS}
       ORDER BY id DESC LIMIT 60`,
    )
    .all(spaceId) as { id: number; label: string; content: string }[];
  if (recent.length < 3) return null;
  // Count distinctive words → which memories carry each.
  const carriers = new Map<string, Set<number>>();
  for (const m of recent) {
    const words = new Set(
      `${m.label} ${m.content}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    );
    for (const w of words) {
      if (!carriers.has(w)) carriers.set(w, new Set());
      carriers.get(w)!.add(m.id);
    }
  }
  // Best keyword: shared by the most recent memories (≥3), not already a hub label.
  let best: { word: string; ids: number[] } | null = null;
  for (const [word, ids] of carriers) {
    if (ids.size < 3) continue;
    if (!best || ids.size > best.ids.length) best = { word, ids: [...ids] };
  }
  if (!best) return null;
  // Skip if a hub/anchor already names this theme.
  const named = s
    .prepare(
      `SELECT 1 FROM nodes WHERE space_id = ? AND deleted_at IS NULL
         AND (kind = 'moc' OR kind IN (${Object.keys(COGNITIVE_META).map(() => "?").join(",")}))
         AND lower(label) LIKE ?`,
    )
    .get(spaceId, ...Object.keys(COGNITIVE_META), `%${best.word}%`);
  if (named) return null;
  const sig = `theme:${best.word}`;
  if (seen.has(sig)) return null;
  return {
    question: `You've logged a few things touching on "${best.word}" lately. Is this becoming its own thread — something worth naming as a goal, project, or person in your Mind?`,
    kind: "theme",
    nodeIds: best.ids.slice(0, 6),
    signature: sig,
  };
}

/**
 * SKILL CHECK-IN: instead of making you hand-crank a skill's level, Soumaya asks how
 * it's going every so often (a ~7-day bucket per skill via the signature, so it recurs
 * without nagging) and your honest answer nudges it. Real skills take a long time, so
 * the nudge is small — this is the deliberate, slow signal, not the auto pile-on.
 */
function skillCheckinCandidate(ctx: AppContext, spaceId: string, seen: Set<string>): Candidate | null {
  const s = ctx.handle.sqlite;
  const skills = s
    .prepare(
      `SELECT id, label, progress FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind = 'skill'
       ORDER BY last_tended_at ASC LIMIT 12`,
    )
    .all(spaceId) as { id: number; label: string; progress: number | null }[];
  const weekBucket = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  for (const sk of skills) {
    const sig = `skill:${sk.id}:${weekBucket}`;
    if (seen.has(sig)) continue;
    const tier = skillTier(sk.progress ?? 0);
    return {
      question: `How's "${sk.label}" going lately — have you been practicing it? Tell me honestly (even "not much") and I'll adjust where it sits. You're at ${tier} right now.`,
      kind: "skill_checkin",
      nodeIds: [sk.id],
      signature: sig,
    };
  }
  return null;
}

/** Heuristic: how much an honest check-in answer should move a skill (small; slow growth). */
function skillNudgeFromText(text: string): number {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(no|not really|haven'?t|hardly|barely|stopped|forgot|nothing|none|skipped)\b/.test(t)) return -0.02;
  if (/\b(a lot|every ?day|daily|constantly|nonstop|tons|obsessed|hours|mastered|leveled up|so much)\b/.test(t)) return 0.08;
  if (/\b(some|a bit|a little|sometimes|here and there|practic|working on|getting better|improv|learning|studied|trained|progress)\b/.test(t)) return 0.04;
  return 0.02; // any thoughtful reply is a little forward motion
}

/**
 * Generate at most ONE new grounded inquiry for a space (free, offline). Runs in
 * the autonomy loop and right after ingest, so noticings appear as you add
 * memories. Returns the new inquiry id, or null if nothing worth asking / at cap.
 */
export function generateInquiry(ctx: AppContext, spaceId: string): number | null {
  const s = ctx.handle.sqlite;
  const open = (s
    .prepare(`SELECT COUNT(*) AS c FROM inquiries WHERE space_id = ? AND status = 'open'`)
    .get(spaceId) as { c: number }).c;
  if (open >= MAX_OPEN) return null;

  const seen = knownSignatures(ctx, spaceId);
  const candidate =
    bridgeCandidate(ctx, spaceId, seen) ??
    anchorCandidate(ctx, spaceId, seen) ??
    themeCandidate(ctx, spaceId, seen) ??
    skillCheckinCandidate(ctx, spaceId, seen);
  if (!candidate) return null;

  const info = s
    .prepare(
      `INSERT OR IGNORE INTO inquiries (space_id, question, kind, node_ids, signature) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(spaceId, candidate.question, candidate.kind, JSON.stringify(candidate.nodeIds), candidate.signature);
  return info.changes > 0 ? Number(info.lastInsertRowid) : null;
}

/** Open inquiries for a space (newest first), with the involved node labels. */
export function listInquiries(ctx: AppContext, spaceId: string): Inquiry[] {
  const s = ctx.handle.sqlite;
  const rows = s
    .prepare(
      `SELECT id, question, kind, node_ids AS nodeIds, created_at AS createdAt
       FROM inquiries WHERE space_id = ? AND status = 'open' ORDER BY id DESC LIMIT 10`,
    )
    .all(spaceId) as { id: number; question: string; kind: string; nodeIds: string; createdAt: string }[];
  return rows.map((r) => {
    let ids: number[] = [];
    try {
      ids = JSON.parse(r.nodeIds);
    } catch {
      /* ignore */
    }
    const nodes =
      ids.length > 0
        ? (s
            .prepare(
              `SELECT id, label FROM nodes WHERE space_id = ? AND id IN (${ids.map(() => "?").join(",")}) AND deleted_at IS NULL`,
            )
            .all(spaceId, ...ids) as { id: number; label: string }[])
        : [];
    return { id: r.id, question: r.question, kind: r.kind, nodes, createdAt: r.createdAt };
  });
}

/** Dismiss an inquiry (don't ask again — the signature stays known). */
export function dismissInquiry(ctx: AppContext, spaceId: string, id: number): boolean {
  return (
    ctx.handle.sqlite
      .prepare(`UPDATE inquiries SET status = 'dismissed' WHERE id = ? AND space_id = ? AND status = 'open'`)
      .run(id, spaceId).changes > 0
  );
}

/**
 * "These don't relate" — the user tells Soumaya a proposed connection is wrong. We
 * SEVER any edges she drew between the bodies, RECORD each pair as rejected (so she
 * never re-links or re-asks about them), and close the inquiry. This is how her
 * intelligence learns from a correction instead of stubbornly repeating it.
 */
export function rejectInquiry(ctx: AppContext, spaceId: string, id: number): boolean {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT node_ids AS nodeIds FROM inquiries WHERE id = ? AND space_id = ? AND status = 'open'`)
    .get(id, spaceId) as { nodeIds: string } | undefined;
  if (!row) return false;
  let ids: number[] = [];
  try {
    ids = JSON.parse(row.nodeIds);
  } catch {
    /* ignore */
  }
  // Reject + unlink every pair among the bodies she connected.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      recordRejection(ctx, spaceId, ids[i]!, ids[j]!);
      s.prepare(
        `DELETE FROM edges WHERE space_id = ? AND ((source = ? AND target = ?) OR (source = ? AND target = ?))`,
      ).run(spaceId, ids[i], ids[j], ids[j], ids[i]);
    }
  }
  s.prepare(`UPDATE inquiries SET status = 'dismissed' WHERE id = ? AND space_id = ?`).run(id, spaceId);
  return true;
}

/**
 * "Yes, connect them" — confirm a connection she surfaced WITHOUT typing an answer.
 * For an ANCHOR noticing ("this is about <person/goal>") it draws the supports edge
 * memory→anchor; for a BRIDGE it links the two entities; a THEME just closes. This
 * is the one-tap path for "she brought two obviously-related things to my attention."
 */
export function confirmInquiry(ctx: AppContext, spaceId: string, id: number): boolean {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT kind, node_ids AS nodeIds FROM inquiries WHERE id = ? AND space_id = ? AND status = 'open'`)
    .get(id, spaceId) as { kind: string; nodeIds: string } | undefined;
  if (!row) return false;
  let ids: number[] = [];
  try {
    ids = JSON.parse(row.nodeIds);
  } catch {
    /* ignore */
  }
  const edges = new EdgesRepo(ctx.handle, spaceId);
  const repo = new NodesRepo(ctx.handle, spaceId);
  const linkOnce = (src: number, tgt: number, rel: "supports" | "relates_to") => {
    if (!edges.exists(src, tgt) && !edges.exists(tgt, src)) edges.create({ source: src, target: tgt, relationship: rel, weight: 0.7 });
    repo.tend(tgt);
  };
  if (row.kind === "anchor" && ids[0] != null && ids[1] != null) {
    linkOnce(ids[1], ids[0], "supports"); // memory → anchor
  } else if (row.kind === "bridge" && ids[0] != null && ids[1] != null) {
    linkOnce(ids[0], ids[1], "relates_to"); // the two entities relate after all
  }
  s.prepare(`UPDATE inquiries SET status = 'answered' WHERE id = ? AND space_id = ?`).run(id, spaceId);
  return true;
}

/**
 * Answer an inquiry: the reply becomes a real memory (normal ingest), linked to the
 * bodies she asked about, paying the standard earn path. Returns what was created.
 */
export async function answerInquiry(
  ctx: AppContext,
  spaceId: string,
  id: number,
  text: string,
): Promise<{ nodeIds: number[]; fuelEarned: number } | null> {
  const s = ctx.handle.sqlite;
  const row = s
    .prepare(`SELECT node_ids AS nodeIds, kind FROM inquiries WHERE id = ? AND space_id = ? AND status = 'open'`)
    .get(id, spaceId) as { nodeIds: string; kind: string } | undefined;
  if (!row) return null;

  const result = await ingest(ctx.handle, { embeddings: ctx.embeddings, llm: ctx.llm }, text, spaceId);
  const nodeIds = result.nodes.map((n) => n.id);

  // Tie the answer to every body the question was about — that's the point.
  let involved: number[] = [];
  try {
    involved = JSON.parse(row.nodeIds);
  } catch {
    /* ignore */
  }
  if (nodeIds[0] != null) {
    const edges = new EdgesRepo(ctx.handle, spaceId);
    const repo = new NodesRepo(ctx.handle, spaceId);
    for (const target of involved) {
      if (!edges.exists(nodeIds[0], target) && !edges.exists(target, nodeIds[0])) {
        edges.create({ source: nodeIds[0], target, relationship: "relates_to", weight: 0.6 });
      }
      repo.tend(target);
    }
  }

  // Skill check-in: nudge the skill's level from the honest answer (small — mastery is slow).
  if (row.kind === "skill_checkin" && involved[0] != null) {
    const nudge = skillNudgeFromText(text);
    if (nudge !== 0) {
      const cur =
        (s.prepare(`SELECT progress FROM nodes WHERE id = ? AND space_id = ? AND kind = 'skill'`).get(involved[0], spaceId) as
          | { progress: number | null }
          | undefined)?.progress;
      if (cur != null) {
        const next = Math.max(0, Math.min(1, cur + nudge));
        s.prepare(`UPDATE nodes SET progress = ?, last_tended_at = datetime('now') WHERE id = ? AND space_id = ?`).run(next, involved[0], spaceId);
      }
    }
  }

  const { advanced } = new StreakRepo(ctx.handle, spaceId).touch();
  const fuelEarned =
    EARN_MEMORY + EARN_LINK * result.associativeEdges.length + (advanced ? STREAK_DAY_BONUS : 0);
  new EconomyRepo(ctx.handle, spaceId).add(fuelEarned);

  s.prepare(`UPDATE inquiries SET status = 'answered' WHERE id = ? AND space_id = ?`).run(id, spaceId);
  return { nodeIds, fuelEarned };
}
