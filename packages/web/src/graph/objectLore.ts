import type { GraphData } from "@brain/shared";

/** Lore-bearing non-memory objects in the galaxy. */
export type LoreObjectKind = "station" | "ship";

interface BrainSignals {
  count: number; // memories
  links: number;
  tone: number; // avg emotional weight, -1..1
  ageDays: number; // since the oldest memory (the galaxy's age)
  hub?: string; // biggest hub's label
}

/** Parse sqlite ("YYYY-MM-DD HH:MM:SS", UTC) or ISO timestamps safely. */
function parseTs(ts?: string): number | null {
  if (!ts) return null;
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
  const withZ = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const ms = Date.parse(withZ);
  return Number.isNaN(ms) ? null : ms;
}

/** Distil the brain into a few signals the lore can grow from. */
function readSignals(graph: GraphData): BrainSignals {
  const nodes = graph.nodes.filter((n) => n.kind !== "action");
  const count = nodes.length;
  const links = graph.links.length;
  let toneSum = 0;
  let toneN = 0;
  let oldest = Infinity;
  let hub = nodes[0];
  for (const n of nodes) {
    if (typeof n.emotionalWeight === "number") {
      toneSum += n.emotionalWeight;
      toneN += 1;
    }
    const ms = parseTs(n.createdAt);
    if (ms !== null && ms < oldest) oldest = ms;
    if ((n.degree ?? 0) > (hub?.degree ?? -1) || (hub == null)) hub = n;
  }
  const ageDays = oldest === Infinity ? 0 : Math.max(0, (Date.now() - oldest) / 86_400_000);
  return {
    count,
    links,
    tone: toneN > 0 ? toneSum / toneN : 0,
    ageDays,
    hub: hub?.label,
  };
}

const toneWord = (t: number): string =>
  t > 0.3 ? "warm, hopeful currents" : t < -0.3 ? "cold, restless undertows" : "calm, even tides";

/** A human "age" phrase from days (the object is as old as the galaxy it tends). */
function agePhrase(days: number): string {
  if (days < 1) return "commissioned only hours ago";
  if (days < 2) return "a day into its watch";
  if (days < 14) return `${Math.round(days)} days into its watch`;
  if (days < 60) return `${Math.round(days / 7)} weeks on station`;
  if (days < 730) return `${Math.round(days / 30)} months on station`;
  return `${(days / 365).toFixed(1)} years on station`;
}

/** Scale band so the story visibly changes as the brain grows. */
function band(count: number): "nascent" | "growing" | "rich" | "vast" {
  if (count <= 3) return "nascent";
  if (count <= 12) return "growing";
  if (count <= 40) return "rich";
  return "vast";
}

/**
 * Procedural, evolving lore for a galaxy object — no tokens, free + offline. The
 * text is shaped by WHAT the object is (a station vs. a ship), by the current
 * state of the brain (size, emotional tone, the hub it watches over), and by its
 * TIME in service (age). Add memories and the log mutates and grows.
 */
export function objectLoreFor(
  kind: LoreObjectKind,
  graph: GraphData,
): { title: string; log: string } {
  const s = readSignals(graph);
  const b = band(s.count);
  const age = agePhrase(s.ageDays);
  const tone = toneWord(s.tone);
  const hub = s.hub ? `“${s.hub}”` : "an unnamed first light";

  if (kind === "ship") {
    const title = "Soumaya · Voyager-class scout";
    const intro = `I'm Soumaya — a lone scout threading your memory galaxy, ${age}.`;
    const state =
      b === "nascent"
        ? `Only ${s.count || "a"} ${s.count === 1 ? "world has" : "worlds have"} lit so far; I fly mostly dark sky, charting first.`
        : b === "growing"
          ? `I've logged ${s.count} worlds along ${s.links} routes — the sky is filling in around ${hub}.`
          : b === "rich"
            ? `${s.count} worlds, ${s.links} routes: a real constellation now, and I keep returning to ${hub}.`
            : `${s.count} worlds and ${s.links} routes — a vast, humming galaxy. I rarely sleep; there's always a new orbit to plot.`;
    const mood = `The currents out here run ${tone}.`;
    return { title, log: `${intro} ${state} ${mood}` };
  }

  // station
  const title = "Waystation Soumaya-Prime";
  const intro = `This is the waystation that anchors your galaxy — ${age}.`;
  const purpose =
    b === "nascent"
      ? `Its docking rings stand near-empty, waiting; only ${s.count || "a"} ${s.count === 1 ? "world drifts" : "worlds drift"} within range.`
      : b === "growing"
        ? `It now oversees ${s.count} worlds bound by ${s.links} lanes, with traffic thickening around ${hub}.`
        : b === "rich"
          ? `A busy port: ${s.count} worlds, ${s.links} lanes, and a steady tide of craft cycling past ${hub}.`
          : `A vast hub — ${s.count} worlds, ${s.links} lanes — its bays never quiet, ${hub} the brightest beacon on its boards.`;
  const mood = `Its sensors read ${tone} across the sector.`;
  return { title, log: `${intro} ${purpose} ${mood}` };
}
