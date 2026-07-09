import type { AppContext } from "../context.js";
import { NodesRepo } from "../repositories/nodes.repo.js";
import { labelTokens } from "./cognitive.js";

/**
 * People as entities (Cognitive Layer Phase 6, docs/COGNITIVE_LAYER.md). A
 * `person_entity` is a person themselves — a star your interactions orbit. This
 * gives each one a lightweight CRM: their interactions (the memories that mention
 * them, already linked via `supports`), how long since you last engaged, and the
 * emotional tone of the relationship. It also keeps the roster clean by merging
 * duplicate person nodes, and surfaces people you mention a lot but haven't added.
 *
 * All deterministic + offline.
 */

/** Capitalised words that are NOT names (so suggestions stay signal, not noise). */
const NAME_STOP = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "today", "tomorrow", "yesterday",
  "the", "this", "that", "there", "then", "when", "went", "made", "just", "really",
  "morning", "night", "week", "weekend", "google", "internet", "http", "https",
  // Common capitalised NOUNS/verbs that show up in notes & titles but are NOT people —
  // this is what suggested "Sector/Vibe/Research/Deep/Dive/Background" as names.
  "sector", "vibe", "vibes", "research", "deep", "dive", "background", "coding", "code",
  "project", "projects", "work", "working", "home", "career", "nurse", "analysis",
  "analytical", "expansion", "exploration", "registered", "typescript", "javascript",
  "python", "react", "app", "brain", "memory", "memories", "goal", "goals", "idea",
  "ideas", "skill", "skills", "note", "notes", "task", "tasks", "plan", "plans",
  "focus", "energy", "life", "time", "people", "person", "thing", "things", "stuff",
  "money", "health", "food", "school", "job", "team", "meeting", "call", "email",
  "phone", "computer", "system", "data", "test", "tests", "feature", "features",
  "update", "fix", "bug", "issue", "review", "design", "build", "start", "started",
]);
/** A word this frequent across recent memories is a common term, not a person's name. */
const MAX_SUGGEST_FREQ = 12;
/** Words that, when they PRECEDE a capitalised word, mark it as a person (met Sara, my Sara). */
const PERSON_PRE = new Set([
  "met", "meet", "meeting", "with", "saw", "see", "seeing", "told", "tell", "telling", "asked", "ask",
  "called", "calling", "texted", "text", "texting", "my", "our", "your", "his", "her", "their", "from",
  "thank", "thanks", "dear", "love", "loved", "miss", "missed", "hugged", "kissed", "married", "marry",
  "dating", "dated", "visited", "visit", "invited", "invite", "gave", "helped",
  "friend", "girlfriend", "boyfriend", "wife", "husband", "mom", "dad", "mother", "father", "sister",
  "brother", "cousin", "boss", "coworker", "partner", "buddy", "aunt", "uncle", "grandma", "grandpa",
]);
/** Words that, when they FOLLOW a capitalised word, mark it as a person (Sara said/called/texted). */
const PERSON_POST = new Set([
  "said", "says", "told", "called", "texted", "asked", "replied", "wants", "loves", "hates", "likes",
  "gave", "sent", "smiled", "laughed", "hugged", "kissed", "helped", "agreed",
]);

export type Tone = "warm" | "heavy" | "mixed" | "neutral";

export interface PersonProfile {
  count: number;
  lastAt: string | null;
  tone: Tone;
  interactions: { id: number; label: string; createdAt: string; emotionalWeight: number | null }[];
}

/** The CRM profile for one person: their interactions, recency, and tone. */
export function personProfile(ctx: AppContext, spaceId: string, id: number): PersonProfile | null {
  const s = ctx.handle.sqlite;
  const person = s
    .prepare(`SELECT kind FROM nodes WHERE id = ? AND space_id = ? AND deleted_at IS NULL`)
    .get(id, spaceId) as { kind: string | null } | undefined;
  if (!person || person.kind !== "person_entity") return null;

  const interactions = s
    .prepare(
      `SELECT n.id, n.label, n.created_at AS createdAt, n.emotional_weight AS emotionalWeight
       FROM edges e JOIN nodes n ON n.id = e.source
       WHERE e.space_id = ? AND e.target = ? AND e.relationship = 'supports' AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC LIMIT 100`,
    )
    .all(spaceId, id) as PersonProfile["interactions"];

  let pos = 0;
  let neg = 0;
  for (const it of interactions) {
    const w = it.emotionalWeight ?? 0;
    if (w > 0.2) pos++;
    else if (w < -0.2) neg++;
  }
  let tone: Tone = "neutral";
  if (pos > 0 && neg > 0) tone = "mixed";
  else if (pos > neg) tone = "warm";
  else if (neg > pos) tone = "heavy";

  return {
    count: interactions.length,
    lastAt: interactions[0]?.createdAt ?? null,
    tone,
    interactions,
  };
}

/**
 * Merge duplicate person entities (same primary name) into one, folding their
 * interactions onto the survivor (the one with more interactions). Free/offline.
 * Returns how many duplicates were merged away.
 */
export function mergeDuplicatePeople(ctx: AppContext, spaceId: string): number {
  const s = ctx.handle.sqlite;
  const repo = new NodesRepo(ctx.handle, spaceId);
  const people = s
    .prepare(`SELECT id, label, origin FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND kind = 'person_entity' ORDER BY id ASC`)
    .all(spaceId) as { id: number; label: string; origin: string | null }[];

  // Group ONLY exact-name duplicates (normalised: lowercased, trimmed, collapsed spaces).
  // We deliberately do NOT merge "Danny" with "Danny K" or two different Dannys — a
  // person's name is sacred and must never silently change; a false merge renames someone.
  const keyOf = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, " ");
  const byId = new Map(people.map((p) => [p.id, p]));
  const groups = new Map<string, number[]>();
  for (const p of people) {
    const k = keyOf(p.label);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p.id);
  }

  const interactionCount = (id: number) =>
    (s.prepare(`SELECT COUNT(*) AS c FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`).get(spaceId, id) as { c: number }).c;

  let merged = 0;
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    // Survivor keeps YOUR name: prefer the one you created (origin='user'), then the most
    // interactions, then the oldest. Since every duplicate shares the exact same label,
    // the visible name never changes regardless of which row survives.
    const keep = ids
      .slice()
      .sort(
        (a, b) =>
          Number(byId.get(b)?.origin === "user") - Number(byId.get(a)?.origin === "user") ||
          interactionCount(b) - interactionCount(a) ||
          a - b,
      )[0]!;
    for (const dropId of ids) {
      if (dropId === keep) continue;
      const backers = s
        .prepare(`SELECT source FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`)
        .all(spaceId, dropId) as { source: number }[];
      for (const b of backers) {
        const dup = s
          .prepare(`SELECT 1 FROM edges WHERE space_id = ? AND source = ? AND target = ? AND relationship = 'supports'`)
          .get(spaceId, b.source, keep);
        if (!dup) {
          s.prepare(`INSERT INTO edges (space_id, source, target, relationship, weight) VALUES (?, ?, ?, 'supports', 0.7)`).run(
            spaceId,
            b.source,
            keep,
          );
        }
      }
      repo.delete(dropId);
      merged++;
      try {
        s.prepare(`INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'people_merged', ?, ?)`).run(
          spaceId,
          "Merged duplicate people into one.",
          JSON.stringify([keep, dropId]),
        );
      } catch {
        /* best-effort */
      }
    }
  }
  return merged;
}

export interface PersonSuggestion {
  name: string;
  count: number;
}

/**
 * People you MENTION a lot but haven't added as an entity yet — capitalised names
 * recurring across memories. One-tap "add" then makes them a first-class person
 * their interactions orbit. Grounded (≥2 distinct memories); noise filtered.
 */
export function suggestPeople(ctx: AppContext, spaceId: string): PersonSuggestion[] {
  const s = ctx.handle.sqlite;
  const rows = s
    .prepare(
      `SELECT id, label, content FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')
       ORDER BY id DESC LIMIT 200`,
    )
    .all(spaceId) as { id: number; label: string; content: string }[];

  // Names already tracked as people — never suggest those.
  const existing = new Set(
    (s.prepare(`SELECT label FROM nodes WHERE space_id = ? AND deleted_at IS NULL AND kind = 'person_entity'`).all(spaceId) as { label: string }[])
      .flatMap((r) => labelTokens(r.label)),
  );

  const memoriesWith = new Map<string, Set<number>>(); // lowercased name → memory ids
  const display = new Map<string, string>(); // lowercased → canonical display
  const midSentence = new Set<string>(); // saw the name NOT at a sentence start at least once
  const personCtx = new Set<string>(); // saw it in a clearly PERSON-like context at least once
  // Scan with position so we can tell a real proper noun from a word that's only
  // capitalised because it starts a sentence ("Today…", "Went…").
  const wordRe = /\b[A-Z][a-z]{2,}\b/g;
  for (const m of rows) {
    const text = `${m.label}. ${m.content}`;
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = wordRe.exec(text)) !== null) {
      const raw = match[0];
      const key = raw.toLowerCase();
      if (NAME_STOP.has(key) || existing.has(key)) continue;
      // Is this occurrence mid-sentence? (not preceded by start / . ! ? / newline)
      const prev = text.slice(0, match.index).replace(/\s+$/, "");
      const sentenceStart = prev === "" || /[.!?]$/.test(prev);
      if (!sentenceStart) midSentence.add(key);
      // PERSON CONTEXT: only a word used like a person counts — preceded by a relational
      // / interaction word ("met/with/my/told Sara") or followed by a person action
      // ("Sara said/called"). This filters places ("of Jacksonville") and titles
      // ("Divine Odyssey") that are proper nouns but NOT people.
      const preWord = (prev.match(/([A-Za-z']+)$/)?.[1] ?? "").toLowerCase();
      const nextWord = (text.slice(match.index + raw.length).match(/^\s+([A-Za-z']+)/)?.[1] ?? "").toLowerCase();
      if (PERSON_PRE.has(preWord) || PERSON_POST.has(nextWord)) personCtx.add(key);
      if (!seen.has(key)) {
        seen.add(key);
        if (!memoriesWith.has(key)) memoriesWith.set(key, new Set());
        memoriesWith.get(key)!.add(m.id);
        if (!display.has(key)) display.set(key, raw);
      }
    }
  }

  return [...memoriesWith.entries()]
    // A real name: used in a person context at least once, seen mid-sentence (a proper
    // noun, not a sentence-start word), in a FEW memories (≥2) but not so many it's a
    // common term (≤12).
    .filter(([key, ids]) => ids.size >= 2 && ids.size <= MAX_SUGGEST_FREQ && midSentence.has(key) && personCtx.has(key))
    .map(([key, ids]) => ({ name: display.get(key)!, count: ids.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}
