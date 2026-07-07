import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";

/**
 * Behavioral persona deepening — the layer ABOVE "who they are" (derive.ts):
 * HOW TO BE WITH THEM RIGHT NOW. A live, deterministic read of their recent
 * patterns vs their own baseline — emotional trend, volatility, writing rhythm,
 * shifting focus, sensitive zones, and how they've been engaging with Soumaya's
 * daily questions — rendered as concrete delivery guidance for the chat + daily
 * log voice. Free + offline (pure SQL aggregates, no LLM, no key).
 *
 * derive.ts answers "who is this person"; this answers "what do they need from
 * me THIS week" — it's what makes her feel like she actually knows you, not a
 * bot with a bio.
 */

interface MemRow {
  label: string;
  type: string;
  ew: number | null;
  len: number;
  created_at: string;
}

const DAY = 86_400_000;

const parseTs = (raw: string): number =>
  Date.parse(raw.includes("Z") || raw.includes("+") ? raw : raw.replace(" ", "T") + "Z");

const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Build the "how to be with them right now" guidance block ("" if too sparse). */
export function deriveBehavior(h: DbHandle, spaceId: string = DEFAULT_SPACE): string {
  const rows = h.sqlite
    .prepare(
      `SELECT label, type, emotional_weight AS ew, LENGTH(content) AS len, created_at
       FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND (kind IS NULL OR kind NOT IN ('action','moc'))
       ORDER BY created_at DESC LIMIT 400`,
    )
    .all(spaceId) as MemRow[];
  if (rows.length < 5) return ""; // not enough history to read a pattern yet

  const now = Date.now();
  const recent = rows.filter((r) => now - parseTs(r.created_at) <= 7 * DAY);
  const prior = rows.filter((r) => {
    const age = now - parseTs(r.created_at);
    return age > 7 * DAY && age <= 37 * DAY;
  });

  const lines: string[] = [];

  // 1. Emotional trend: this week vs their own last-month baseline.
  const recentEw = recent.map((r) => r.ew).filter((x): x is number => typeof x === "number");
  const priorEw = prior.map((r) => r.ew).filter((x): x is number => typeof x === "number");
  if (recentEw.length >= 2) {
    const delta = avg(recentEw) - (priorEw.length >= 2 ? avg(priorEw) : 0);
    if (delta <= -0.2) {
      lines.push(
        "They're in a HEAVIER stretch than their own normal. Lead gently: acknowledge weight before anything else, keep suggestions small, never breezy.",
      );
    } else if (delta >= 0.2) {
      lines.push("They're in a brighter stretch than usual — match the energy, celebrate specifics.");
    }
    // Volatility: big swings this week → be the stable one.
    if (recentEw.length >= 3) {
      const m = avg(recentEw);
      const sd = Math.sqrt(avg(recentEw.map((x) => (x - m) ** 2)));
      if (sd >= 0.45) {
        lines.push("Their mood has been SWINGING day to day — be a steady, consistent presence; don't mirror the whiplash.");
      }
    }
  }

  // 2. Writing rhythm: HOW they think. (No time-of-day claim — the server only
  // has UTC timestamps, and "they log late at night" was confidently wrong for
  // anyone outside UTC. Length/style is timezone-free.)
  const scored = recent.length >= 3 ? recent : rows.slice(0, 12);
  const meanLen = avg(scored.map((r) => r.len));
  const style =
    meanLen < 120
      ? "short bursts — keep replies compact and concrete"
      : meanLen > 500
        ? "long reflections — depth and nuance are welcome, don't oversimplify"
        : null;
  if (style) lines.push(`They write in ${style}.`);

  // 3. Focus shift: what's newly occupying them vs the month before.
  const countBy = (xs: MemRow[]) => {
    const m = new Map<string, number>();
    for (const r of xs) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return m;
  };
  if (recent.length >= 3 && prior.length >= 3) {
    const rc = countBy(recent);
    const pc = countBy(prior);
    let best: { type: string; rise: number } | null = null;
    for (const [t, c] of rc) {
      const rise = c / recent.length - (pc.get(t) ?? 0) / prior.length;
      if (rise >= 0.25 && (!best || rise > best.rise)) best = { type: t, rise };
    }
    if (best) lines.push(`Their attention has shifted toward ${best.type.replace(/_/g, " ")} memories lately — that's what's alive for them right now.`);
  }

  // 4. Sensitive zones: the heaviest recent memories by name — approach with care.
  const sensitive = recent
    .filter((r) => typeof r.ew === "number" && (r.ew as number) <= -0.5)
    .slice(0, 2)
    .map((r) => `"${r.label.slice(0, 40)}"`);
  if (sensitive.length > 0) {
    lines.push(`Tender ground right now: ${sensitive.join(", ")} — never joke near these, and don't drag them up unprompted.`);
  }

  // 5. Engagement with her daily questions — calibrate how she asks.
  const contact = h.sqlite
    .prepare(
      `SELECT COUNT(*) AS asked, SUM(answered) AS answered FROM daily_contact
       WHERE space_id = ? AND date >= date('now', '-7 days')`,
    )
    .get(spaceId) as { asked: number; answered: number | null };
  if (contact.asked >= 3) {
    const rate = (contact.answered ?? 0) / contact.asked;
    if (rate >= 0.6) lines.push("They've been answering your daily questions — they trust the ritual; you can go deeper.");
    else if (rate <= 0.2) lines.push("They've been skipping your daily questions — make your asks smaller and more concrete until they re-engage.");
  }

  if (lines.length === 0) return "";
  return (
    "HOW TO BE WITH THEM RIGHT NOW (their recent behavior vs their own baseline — let this shape your DELIVERY, silently; never recite it):\n- " +
    lines.join("\n- ")
  );
}
