import type { EmotionalTrajectory, EmotionalPattern, EmotionalPoint, GraphNode } from "@brain/shared";
import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import { NodesRepo } from "../repositories/nodes.repo.js";

/**
 * Emotional trajectory analysis (research-agent add-on #5). Turns the per-memory
 * signed `emotionalWeight` (valence −1..1) + timestamps into a mood-over-time view:
 * a day-bucketed series plus detected patterns (stress cycles, up/downswings,
 * burnout risk, volatility) with a trigger and a gentle intervention. Fully
 * heuristic + offline — no LLM, no token cost, always available.
 */

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const dayOf = (iso: string) => iso.slice(0, 10);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Least-squares slope of values against their index (per-step change). */
function slopeOf(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (xs[i]! - ym);
    den += (i - xm) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** The tag (or, failing tags, the type) most common among the given memories. */
function dominantTrigger(nodes: GraphNode[]): string {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const keys = n.tags && n.tags.length ? n.tags : [n.type];
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = "";
  let bestN = 1; // require at least 2 to count as a pattern trigger
  for (const [k, c] of counts) if (c > bestN) ((best = k), (bestN = c));
  return best;
}

const EMPTY: EmotionalTrajectory = {
  points: [],
  trend: "steady",
  average: 0,
  volatility: 0,
  patterns: [],
  sampleSize: 0,
};

export function buildEmotionalTrajectory(
  h: DbHandle,
  spaceId: string = DEFAULT_SPACE,
): EmotionalTrajectory {
  const dated = new NodesRepo(h, spaceId)
    .all()
    .filter((n) => n.kind !== "action" && typeof n.emotionalWeight === "number")
    .map((n) => ({ t: n.occurredAt ?? n.createdAt, v: clamp(n.emotionalWeight!, -1, 1), node: n }))
    .filter((x): x is { t: string; v: number; node: GraphNode } => !!x.t)
    .sort((a, b) => (a.t < b.t ? -1 : 1));

  if (dated.length === 0) return EMPTY;

  // Day buckets → averaged series.
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const d of dated) {
    const day = dayOf(d.t);
    const b = buckets.get(day) ?? { sum: 0, count: 0 };
    b.sum += d.v;
    b.count++;
    buckets.set(day, b);
  }
  const allPoints: EmotionalPoint[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, b]) => ({ date, valence: round(b.sum / b.count), count: b.count }));
  // Keep the most recent 40 buckets for the sparkline.
  const points = allPoints.slice(-40);
  const vals = points.map((p) => p.valence);

  const average = round(mean(dated.map((d) => d.v)));
  const volatility = round(clamp(stddev(vals), 0, 1));
  const slope = slopeOf(vals);
  const trend: EmotionalTrajectory["trend"] = slope > 0.02 ? "rising" : slope < -0.02 ? "falling" : "steady";

  const negativeNodes = dated.filter((d) => d.v < -0.2).map((d) => d.node);
  const trigger = dominantTrigger(negativeNodes);
  const patterns: EmotionalPattern[] = [];

  const dipDays = points.filter((p) => p.valence < -0.3);
  if (dipDays.length >= 2) {
    patterns.push({
      type: "Stress cycle",
      trigger,
      repeats: dipDays.length,
      intervention:
        "These heavy dips keep recurring — note what tends to precede them and plan a small recovery ritual around that trigger.",
    });
  }
  // Burnout shape: a bright early stretch that cools into a heavy recent one.
  if (points.length >= 6) {
    const third = Math.max(1, Math.floor(points.length / 3));
    const early = mean(vals.slice(0, third));
    const late = mean(vals.slice(-third));
    if (early > 0.15 && late < -0.15) {
      patterns.push({
        type: "Burnout risk",
        trigger,
        repeats: 1,
        intervention:
          "A bright early stretch has cooled into a heavy one — a classic burnout shape. Protect rest and lighten the load where you can.",
      });
    }
  }
  if (trend === "rising") {
    patterns.push({
      type: "Upswing",
      trigger: "",
      repeats: 1,
      intervention: "You're on an upswing — worth noting what's working so you can repeat it.",
    });
  } else if (trend === "falling" && average < 0) {
    patterns.push({
      type: "Downswing",
      trigger,
      repeats: 1,
      intervention: "Mood has been trending down. Revisit a memory that lifted you, or capture one good thing today.",
    });
  }
  if (volatility >= 0.5) {
    patterns.push({
      type: "Volatile stretch",
      trigger: "",
      repeats: 1,
      intervention: "Big emotional swings lately — anchoring routines (sleep, movement) can smooth the ride.",
    });
  }

  return { points, trend, average, volatility, patterns, sampleSize: dated.length };
}
