import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { UserPersonaRepo } from "../repositories/knowledge.repo.js";

/**
 * The "About Me" persona is NOT user-editable — Soumaya derives it herself from
 * everything she knows about you (your memories) and keeps it current as the brain
 * grows. This is a free, offline heuristic synthesis (no LLM/key needed): dominant
 * themes, emotional baseline, what you think about, and the span of your galaxy.
 */

interface Row {
  label: string;
  type: string;
  emotional_weight: number | null;
  importance: number | null;
  tags: string | null;
  created_at: string;
  degree: number;
}

const STALE_MS = 6 * 60 * 60 * 1000; // re-derive at most every ~6h

function topCounts(items: string[], n: number): string[] {
  const freq = new Map<string, number>();
  for (const it of items) freq.set(it, (freq.get(it) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function emotionalTone(avg: number): string {
  if (avg > 0.25) return "bright and hopeful — your reflections lean positive";
  if (avg < -0.25) return "weighty — you carry some heavy, serious thoughts";
  return "balanced — a mix of light and shadow";
}

/** Build the persona text from the brain's current state. Returns "" if too sparse. */
export function derivePersona(h: DbHandle, spaceId: string = DEFAULT_SPACE): string {
  const rows = h.sqlite
    .prepare(
      `SELECT n.label, n.type, n.emotional_weight, n.importance, n.tags, n.created_at,
        (SELECT COUNT(*) FROM edges e WHERE e.source = n.id OR e.target = n.id) AS degree
       FROM nodes n
       WHERE n.space_id = ? AND n.deleted_at IS NULL AND (n.kind IS NULL OR n.kind != 'action')`,
    )
    .all(spaceId) as Row[];
  if (rows.length < 3) return ""; // not enough yet to say anything meaningful

  const count = rows.length;
  // Time span.
  const dates = rows.map((r) => Date.parse(r.created_at.includes("Z") ? r.created_at : r.created_at.replace(" ", "T") + "Z")).filter((t) => !Number.isNaN(t));
  const spanDays = dates.length > 1 ? Math.round((Math.max(...dates) - Math.min(...dates)) / 8.64e7) : 0;
  const spanText =
    spanDays > 400 ? `over ${Math.round(spanDays / 365)} years` : spanDays > 45 ? `over ${Math.round(spanDays / 30)} months` : spanDays > 0 ? `over ${spanDays} days` : "recently";

  // Emotional baseline.
  const ews = rows.map((r) => r.emotional_weight).filter((x): x is number => typeof x === "number");
  const avgEw = ews.length ? ews.reduce((s, x) => s + x, 0) / ews.length : 0;

  // Themes: top tags, then top hubs (by degree), then dominant memory types.
  const allTags = rows.flatMap((r) => {
    if (!r.tags) return [];
    try {
      const arr = JSON.parse(r.tags);
      return Array.isArray(arr) ? (arr as string[]) : [];
    } catch {
      return [];
    }
  });
  const topTags = topCounts(allTags, 4);
  const topHubs = [...rows].sort((a, b) => b.degree - a.degree || (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 3).map((r) => r.label);
  const topTypes = topCounts(rows.map((r) => r.type.replace(/_/g, " ")), 3);

  // Behavioral signals (Wave 3 "knows me"): how they tend the brain, not just what.
  const avgDegree = rows.reduce((s, r) => s + r.degree, 0) / count;
  const perWeek = spanDays > 6 ? Math.max(1, Math.round(count / (spanDays / 7))) : count;
  const cadence =
    spanDays <= 6
      ? "They've just started — still finding their rhythm."
      : perWeek >= 15
        ? `They're a heavy daily user — roughly ${perWeek} memories a week.`
        : perWeek >= 4
          ? `They tend the brain steadily — about ${perWeek} memories a week.`
          : "They check in occasionally rather than daily.";
  const connectivity =
    avgDegree >= 3
      ? "Their thinking is densely interlinked — they connect ideas readily."
      : avgDegree >= 1
        ? "Their memories are moderately connected."
        : "Their memories are still mostly islands — connections are only beginning to form.";
  const recent = [...rows]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 8);
  const recentTags = topCounts(
    recent.flatMap((r) => {
      if (!r.tags) return [];
      try {
        const arr = JSON.parse(r.tags);
        return Array.isArray(arr) ? (arr as string[]) : [];
      } catch {
        return [];
      }
    }),
    3,
  );

  const parts: string[] = [];
  parts.push(`This person's galaxy holds ${count} memories, gathered ${spanText}.`);
  if (topTags.length) parts.push(`Recurring themes they tag: ${topTags.join(", ")}.`);
  if (topHubs.length) parts.push(`Their heaviest, most-connected memories center on: ${topHubs.join("; ")}.`);
  if (topTypes.length) parts.push(`They mostly capture ${topTypes.join(", ")}.`);
  if (recentTags.length) parts.push(`Lately they've been focused on: ${recentTags.join(", ")}.`);
  parts.push(cadence);
  parts.push(connectivity);
  parts.push(`Emotionally, the brain is ${emotionalTone(avgEw)}.`);
  parts.push("Use this to tailor how you speak to them — you are aware of who they are, but you are not them.");
  return parts.join(" ");
}

/**
 * Refresh the stored persona if it's missing or stale (or force). Free + offline.
 * Returns the current persona body. Called on read and from the autonomy loop.
 */
export function refreshPersona(h: DbHandle, spaceId: string = DEFAULT_SPACE, force = false): string {
  const row = h.sqlite
    .prepare(`SELECT body, updated_at FROM user_persona WHERE space_id = ?`)
    .get(spaceId) as { body: string; updated_at: string } | undefined;

  const stale =
    force ||
    !row ||
    Date.now() - Date.parse((row.updated_at || "").replace(" ", "T") + "Z") > STALE_MS;
  if (!stale) return row!.body;

  const derived = derivePersona(h, spaceId);
  if (derived) new UserPersonaRepo(h, spaceId).set(derived);
  return derived || row?.body || "";
}
