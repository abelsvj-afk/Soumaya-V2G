import type { AppContext } from "../context.js";
import type { TimelineChapter, ChapterTrend, ChapterThread } from "@brain/shared";
import { DEFAULT_SPACE } from "../db/schema.js";

/**
 * The Chronicle — chapters of your life on the 3D flowing-river timeline. Soumaya
 * writes a chapter when there's REAL change (a blended signal of momentum +
 * emotional-tone trend + new milestones), roughly 1–3× a month; you can add your
 * own anytime. Deterministic + fully offline (heuristic narrative, no API key).
 *
 * See docs/TIMELINE_DESIGN.md for the locked design.
 */

// --- Tunables (documented in the spec) ---
const MIN_MEMS = 4; // need at least this many NEW memories to have anything to say
const THRESHOLD = 0.25; // blended magnitude a chapter must clear (auto only)
const MIN_GAP_DAYS = 8; // min spacing between auto chapters → ~≤3-4/month
const MONTHLY_CAP = 3; // never more than this many auto chapters in a calendar month
const MOMENTUM_FULL = 20; // this many new memories → full momentum score
const MILESTONE_FULL = 5; // this many new milestones → full milestone score
const EMO_TREND = 0.12; // |emotion delta| beyond this reads as growth/decline

/** Milestone kinds — a new one of these signals your life structurally changed. */
const MILESTONE_KINDS = new Set(["goal", "person_entity", "skill", "identity", "idea"]);

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "have", "your", "you", "was", "were", "are",
  "but", "not", "all", "out", "about", "into", "just", "like", "some", "more", "than", "then",
  "them", "they", "what", "when", "from", "been", "over", "very", "got", "get", "day", "today",
  "really", "much", "well", "also", "still", "back", "went", "feel", "felt", "time", "one",
]);

/** SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (UTC, no Z). Parse to ms. */
function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const s = iso.includes("T") ? iso : iso.replace(" ", "T");
  const z = s.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z";
  const t = Date.parse(z);
  return Number.isNaN(t) ? 0 : t;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

interface MemRow {
  id: number;
  label: string;
  content: string;
  emotional_weight: number | null;
  importance: number | null;
  created_at: string;
}

function rowToChapter(r: Record<string, unknown>): TimelineChapter {
  const parse = <T>(raw: unknown, fallback: T): T => {
    try {
      return JSON.parse(String(raw ?? "")) as T;
    } catch {
      return fallback;
    }
  };
  return {
    id: r.id as number,
    title: (r.title as string) ?? "",
    summary: (r.summary as string) ?? "",
    theme: (r.theme as string) ?? "",
    trend: (r.trend as ChapterTrend) ?? "neutral",
    score: (r.score as number) ?? 0,
    periodStart: (r.period_start as string) ?? "",
    periodEnd: (r.period_end as string) ?? "",
    memoryIds: parse<number[]>(r.memory_ids, []),
    photoIds: parse<number[]>(r.photo_ids, []),
    threads: parse<ChapterThread[]>(r.threads, []),
    origin: ((r.origin as string) === "user" ? "user" : "auto"),
    createdAt: (r.created_at as string) ?? "",
  };
}

/** All chapters for a space, oldest → newest (timeline order). */
export function listChapters(ctx: AppContext, spaceId: string = DEFAULT_SPACE): TimelineChapter[] {
  const rows = ctx.handle.sqlite
    .prepare(`SELECT * FROM timeline_chapters WHERE space_id = ? ORDER BY period_end ASC, id ASC`)
    .all(spaceId) as Record<string, unknown>[];
  return rows.map(rowToChapter);
}

export function deleteChapter(ctx: AppContext, spaceId: string, id: number): boolean {
  const info = ctx.handle.sqlite
    .prepare(`DELETE FROM timeline_chapters WHERE space_id = ? AND id = ?`)
    .run(spaceId, id);
  return info.changes > 0;
}

interface Assessment {
  since: string; // ISO start of the window
  windowMems: MemRow[];
  magnitude: number;
  trend: ChapterTrend;
  theme: string;
  threads: ChapterThread[];
  emotionDelta: number;
  milestones: number;
  memoryIds: number[];
  photoIds: number[];
  photoCount: number;
}

/**
 * Measure how much your life changed since the last chapter (or the beginning).
 * Pure over the DB read — no side effects — so it's easy to test + reuse for the
 * manual-add path.
 */
export function assessChange(
  ctx: AppContext,
  spaceId: string = DEFAULT_SPACE,
  nowISO: string = new Date().toISOString(),
): Assessment {
  const s = ctx.handle.sqlite;
  const nowMs = toMs(nowISO);

  const last = s
    .prepare(`SELECT period_end FROM timeline_chapters WHERE space_id = ? ORDER BY period_end DESC, id DESC LIMIT 1`)
    .get(spaceId) as { period_end: string } | undefined;
  const sinceMs = last ? toMs(last.period_end) : 0;
  const sinceISO = last?.period_end ?? new Date(0).toISOString();

  const allMems = s
    .prepare(
      `SELECT id, label, content, emotional_weight, importance, created_at
       FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind = 'memory')
       ORDER BY created_at ASC`,
    )
    .all(spaceId) as MemRow[];

  const windowMems = allMems.filter((m) => toMs(m.created_at) > sinceMs && toMs(m.created_at) <= nowMs);
  const priorMems = allMems.filter((m) => toMs(m.created_at) <= sinceMs);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const windowEmo = mean(windowMems.map((m) => m.emotional_weight ?? 0));
  const priorEmo = mean(priorMems.map((m) => m.emotional_weight ?? 0));
  const emotionDelta = windowEmo - priorEmo;

  // New milestones (cognitive nodes) created inside the window. Compare via toMs so
  // the space-separated DB timestamps and ISO chapter bounds never mismatch.
  const milestoneRows = s
    .prepare(
      `SELECT created_at FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind IN (${[...MILESTONE_KINDS].map(() => "?").join(",")})`,
    )
    .all(spaceId, ...MILESTONE_KINDS) as { created_at: string }[];
  const milestones = milestoneRows.filter((r) => toMs(r.created_at) > sinceMs && toMs(r.created_at) <= nowMs).length;

  const momentumN = clamp01(windowMems.length / MOMENTUM_FULL);
  const milestonesN = clamp01(milestones / MILESTONE_FULL);
  const magnitude = clamp01(0.4 * momentumN + 0.4 * Math.min(1, Math.abs(emotionDelta) / 0.6) + 0.2 * milestonesN);

  const posN = windowMems.filter((m) => (m.emotional_weight ?? 0) > 0.25).length;
  const negN = windowMems.filter((m) => (m.emotional_weight ?? 0) < -0.25).length;
  let trend: ChapterTrend = "neutral";
  if (posN > 0 && negN > 0 && Math.min(posN, negN) / Math.max(posN, negN) > 0.5) trend = "mixed";
  else if (emotionDelta > EMO_TREND) trend = "growth";
  else if (emotionDelta < -EMO_TREND) trend = "decline";

  // Theme + threads: which named anchors (people / goals / skills) recur in the window.
  const anchors = s
    .prepare(
      `SELECT label, kind FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind IN ('person_entity','goal','skill','identity')`,
    )
    .all(spaceId) as { label: string; kind: string }[];
  const windowText = windowMems.map((m) => `${m.label}. ${m.content}`.toLowerCase());
  const anchorHits = new Map<string, { count: number; emo: number; kind: string }>();
  for (const a of anchors) {
    const needle = a.label.trim().toLowerCase();
    if (needle.length < 3) continue;
    let count = 0;
    let emo = 0;
    windowMems.forEach((m, i) => {
      if (windowText[i]!.includes(needle)) {
        count++;
        emo += m.emotional_weight ?? 0;
      }
    });
    if (count > 0) anchorHits.set(a.label, { count, emo: emo / count, kind: a.kind });
  }
  const topAnchors = [...anchorHits.entries()].sort((x, y) => y[1].count - x[1].count);

  const threadTrend = (emo: number): ChapterTrend => (emo > EMO_TREND ? "growth" : emo < -EMO_TREND ? "decline" : "neutral");
  const threads: ChapterThread[] = topAnchors.slice(0, 3).map(([name, v]) => ({ name, trend: threadTrend(v.emo) }));

  // Theme: the strongest anchor, else the most frequent significant word.
  let theme = topAnchors[0]?.[0] ?? "";
  if (!theme) {
    const freq = new Map<string, number>();
    for (const t of windowText) {
      for (const w of t.match(/[a-z]{4,}/g) ?? []) {
        if (STOP.has(w)) continue;
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) theme = top[0];
  }

  // Driving memories: prefer photo-bearing, then most significant. Cap at 8.
  const idList = windowMems.map((m) => m.id);
  const photoIds = new Set<number>();
  if (idList.length) {
    const rows = s
      .prepare(
        `SELECT DISTINCT node_id FROM attachments
         WHERE space_id = ? AND mime LIKE 'image/%' AND node_id IN (${idList.map(() => "?").join(",")})`,
      )
      .all(spaceId, ...idList) as { node_id: number }[];
    for (const r of rows) photoIds.add(r.node_id);
  }
  const significance = (m: MemRow) => (m.importance ?? 0) + Math.abs(m.emotional_weight ?? 0);
  const memoryIds = windowMems
    .slice()
    .sort((a, b) => Number(photoIds.has(b.id)) - Number(photoIds.has(a.id)) || significance(b) - significance(a))
    .slice(0, 8)
    .map((m) => m.id);
  const photoIdsInList = memoryIds.filter((id) => photoIds.has(id));

  return {
    since: sinceISO,
    windowMems,
    magnitude,
    trend,
    theme,
    threads,
    emotionDelta,
    milestones,
    memoryIds,
    photoIds: photoIdsInList,
    photoCount: photoIds.size,
  };
}

function titleFor(trend: ChapterTrend, theme: string): string {
  const t = theme ? theme.charAt(0).toUpperCase() + theme.slice(1) : "";
  if (trend === "growth") return t ? `Rising through ${t}` : "A season of growth";
  if (trend === "decline") return t ? `Weathering ${t}` : "A harder season";
  if (trend === "mixed") return t ? `Turning point — ${t}` : "A turning point";
  return t ? `Holding steady in ${t}` : "Steady days";
}

/** Deterministic, offline narrative for a chapter (meaningful with no API key). */
function narrate(a: Assessment): string {
  const days = Math.max(1, Math.round((toMs(a.windowMems[a.windowMems.length - 1]?.created_at) - toMs(a.since)) / 86_400_000)) || 1;
  const m = a.windowMems.length;
  const parts: string[] = [];
  parts.push(`Across about ${days} day${days === 1 ? "" : "s"}, you added ${m} memor${m === 1 ? "y" : "ies"}.`);
  if (a.trend === "growth") parts.push("The mood of this stretch lifted — more brightened than dimmed.");
  else if (a.trend === "decline") parts.push("This was a heavier stretch; the weight of it shows in what you logged.");
  else if (a.trend === "mixed") parts.push("It pulled both ways — real highs threaded through real lows.");
  else parts.push("It held a steady register, neither soaring nor sinking.");
  if (a.theme) parts.push(`Much of it circled around ${a.theme}.`);
  const people = a.threads.filter((t) => t.name).map((t) => t.name);
  if (people.length) parts.push(`${people.slice(0, 3).join(", ")} kept showing up.`);
  if (a.milestones > 0) parts.push(`${a.milestones} new thing${a.milestones === 1 ? "" : "s"} took root in your mind.`);
  if (a.photoCount > 0) parts.push(`You captured ${a.photoCount} moment${a.photoCount === 1 ? "" : "s"} in pictures.`);
  return parts.join(" ");
}

function chaptersThisMonth(ctx: AppContext, spaceId: string, nowISO: string): number {
  const month = nowISO.slice(0, 7); // YYYY-MM
  return (
    ctx.handle.sqlite
      .prepare(`SELECT COUNT(*) AS c FROM timeline_chapters WHERE space_id = ? AND origin = 'auto' AND substr(period_end,1,7) = ?`)
      .get(spaceId, month) as { c: number }
  ).c;
}

function insertChapter(
  ctx: AppContext,
  spaceId: string,
  a: Assessment,
  origin: "auto" | "user",
  nowISO: string,
  titleOverride?: string,
): TimelineChapter {
  const title = titleOverride?.trim() || titleFor(a.trend, a.theme);
  const summary = narrate(a);
  const periodStart = a.since && toMs(a.since) > 0 ? a.since : a.windowMems[0]?.created_at ?? nowISO;
  const info = ctx.handle.sqlite
    .prepare(
      `INSERT INTO timeline_chapters (space_id, title, summary, theme, trend, score, period_start, period_end, memory_ids, photo_ids, threads, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      spaceId,
      title,
      summary,
      a.theme,
      a.trend,
      a.magnitude,
      periodStart,
      nowISO,
      JSON.stringify(a.memoryIds),
      JSON.stringify(a.photoIds),
      JSON.stringify(a.threads),
      origin,
    );
  const row = ctx.handle.sqlite.prepare(`SELECT * FROM timeline_chapters WHERE id = ?`).get(info.lastInsertRowid) as Record<string, unknown>;
  return rowToChapter(row);
}

/**
 * Auto path: write a chapter iff there's real change AND the cadence allows it
 * (min gap + monthly cap → ~1-3/month). Returns the new chapter or null. Called
 * from the per-space autonomy tick; free + offline + deterministic.
 */
export function maybeGenerateChapter(
  ctx: AppContext,
  spaceId: string = DEFAULT_SPACE,
  nowISO: string = new Date().toISOString(),
): TimelineChapter | null {
  const a = assessChange(ctx, spaceId, nowISO);
  if (a.windowMems.length < MIN_MEMS) return null;
  if (a.magnitude < THRESHOLD) return null;

  const last = ctx.handle.sqlite
    .prepare(`SELECT period_end FROM timeline_chapters WHERE space_id = ? ORDER BY period_end DESC, id DESC LIMIT 1`)
    .get(spaceId) as { period_end: string } | undefined;
  if (last) {
    const gapDays = (toMs(nowISO) - toMs(last.period_end)) / 86_400_000;
    if (gapDays < MIN_GAP_DAYS) return null;
    if (chaptersThisMonth(ctx, spaceId, nowISO) >= MONTHLY_CAP) return null;
  }
  return insertChapter(ctx, spaceId, a, "auto", nowISO);
}

/** Manual path: you mark a chapter now. Summarizes the current window regardless of
 *  threshold (you asked for it), with an optional custom title. */
export function createManualChapter(
  ctx: AppContext,
  spaceId: string = DEFAULT_SPACE,
  opts: { title?: string; nowISO?: string } = {},
): TimelineChapter {
  const nowISO = opts.nowISO ?? new Date().toISOString();
  const a = assessChange(ctx, spaceId, nowISO);
  return insertChapter(ctx, spaceId, a, "user", nowISO, opts.title);
}
