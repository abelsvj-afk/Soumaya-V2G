import type { GraphNode, CelestialClass } from "@brain/shared";
import { CELESTIAL_CLASSES, NODE_TYPE_LABEL } from "@brain/shared";
import { statsSpaceId } from "./achievements.js";
import { rarityFor } from "../overworld/adapter/rarity.js";

/**
 * The Codex — a living, gamified atlas of your town. Entries start LOCKED
 * (undiscovered), unlock as your town grows, then LEVEL UP the more you engage.
 * Everything is computed live from graph state (+ a couple of localStorage stats),
 * mirroring the achievements pattern — no server round-trip to render it.
 *
 * wave4-full-vision.md §A — reworded away from the deleted 3D galaxy's own vocabulary
 * (sectors/celestial bodies/fleet were all literal space metaphor). "Celestial Bodies"
 * now reuses the Overworld's own established Common→Legendary rarity naming
 * (overworld/adapter/rarity.ts) for consistency with what a player already sees on
 * creatures, rather than inventing a second, competing vocabulary.
 */

export type CodexCategory = "sectors" | "bodies" | "constellations" | "mind" | "fleet" | "phenomena" | "fieldnotes";

export const CODEX_CATEGORIES: { id: CodexCategory; title: string; icon: string; blurb: string }[] = [
  { id: "sectors", title: "Districts", icon: "🗺️", blurb: "The named districts of your town — one per kind of memory." },
  { id: "constellations", title: "Constellations", icon: "🕸️", blurb: "The Maps of Content you've charted from clusters of related memories." },
  { id: "mind", title: "The Mind Layer", icon: "🧠", blurb: "What's on your mind — the goals, skills, people and ideas that give your town direction." },
  { id: "bodies", title: "Creature Rarities", icon: "🐾", blurb: "The rarity classes a memory-creature can grow into, from Common to Legendary." },
  { id: "fleet", title: "Soumaya's Circle", icon: "🧭", blurb: "Soumaya and the helpers who tend your town." },
  { id: "phenomena", title: "Phenomena", icon: "✦", blurb: "Rare events and milestones discovered as your town comes alive." },
  { id: "fieldnotes", title: "Soumaya's Field Notes", icon: "✒️", blurb: "Discoveries Soumaya charted on her own, as your town revealed them." },
];

/** A server-charted discovery (Soumaya's field notes) → a discovered Codex entry. */
export interface AgentDiscovery { key: string; title: string; lore: string; icon: string; focusId: number | null; createdAt: string }
export function fieldNoteEntries(discoveries: AgentDiscovery[]): CodexEntry[] {
  return discoveries.map((d) => ({
    id: `fieldnote-${d.key}`,
    category: "fieldnotes" as const,
    icon: d.icon || "✒️",
    title: d.title,
    lockedHint: "",
    lore: d.lore,
    discovered: true,
    level: 1,
    maxLevel: 1,
    levelLabel: "Charted by Soumaya",
    focusId: d.focusId ?? undefined,
  }));
}

export interface CodexEntry {
  id: string;
  category: CodexCategory;
  icon: string;
  title: string;
  lockedHint: string;
  lore: string;
  discovered: boolean;
  /** 0 when locked; 1..maxLevel once discovered (deeper the more you engage). */
  level: number;
  maxLevel: number;
  levelLabel: string;
  progressToNext?: { cur: number; target: number };
  /** A memory id to fly to, when the entry maps to a specific body. */
  focusId?: number;
}

export interface CodexCtx {
  /** Real memories (no actions, no MOC hubs). */
  memories: GraphNode[];
  /** MOC hub nodes. */
  constellations: GraphNode[];
  /** Total edge count. */
  links: number;
}

const stat = (key: string): number => {
  try {
    return parseInt(localStorage.getItem(`stat.${key}.${statsSpaceId()}`) || "0", 10) || 0;
  } catch {
    return 0;
  }
};

const ageDays = (n: GraphNode): number => {
  const t = Date.parse(n.occurredAt ?? n.createdAt ?? "");
  return Number.isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86_400_000);
};

/** A tier from a count against ascending thresholds. Returns level (0 if below first). */
function tierOf(count: number, thresholds: number[]): { level: number; next?: number } {
  let level = 0;
  for (const t of thresholds) if (count >= t) level++;
  const next = thresholds[level];
  return { level, next };
}

// ---- Districts: a neighborhood per memory kind, matching the server-side lore cosmology ----
const SECTOR_DEFS: { type: string; name: string; lore: string }[] = [
  { type: "person", name: "The Kinship Quarter", lore: "Where the people of your life live — the ones you visit and who visit you. A warm, crowded quarter; every house here has a name you know." },
  { type: "company", name: "The Guild District", lore: "A row of workshops and offices — steady institutions your other memories pass through on their way somewhere else." },
  { type: "project", name: "The Workyard", lore: "A restless corner of town where efforts get built. Loud and busy while the work is live, quiet the moment it's set down." },
  { type: "decision", name: "Crossroads Square", lore: "Every fork you've stood at, frozen mid-choice. Two paths and the quiet ground between them — the town remembers the road not taken." },
  { type: "meeting", name: "The Meeting Hall", lore: "Where paths crossed for a moment in time. Brief, bright gatherings that leave a mark long after everyone's gone home." },
  { type: "daily", name: "Main Street", lore: "The steady flow of ordinary days — the small errands and passing moments that, in sheer number, hold the town together." },
  { type: "knowledge", name: "The Archive Hall", lore: "A quiet room of durable facts and learnings. Little excitement, great permanence — the foundation everything else is built on." },
  { type: "concept", name: "The Old Library", lore: "The far, quiet stacks — ideas and principles that shape everything nearer to the center of town." },
  { type: "other", name: "The Outskirts", lore: "The edge of the mapped town, where anything that fits no known district settles until it finds its place." },
];

function sectorEntries(ctx: CodexCtx): CodexEntry[] {
  return SECTOR_DEFS.map((d) => {
    const count = ctx.memories.filter((m) => m.type === d.type).length;
    const { level, next } = tierOf(count, [1, 5, 15, 40]);
    return {
      id: `sector-${d.type}`,
      category: "sectors" as const,
      icon: "🗺️",
      title: d.name,
      lockedHint: `A region for “${NODE_TYPE_LABEL[d.type as keyof typeof NODE_TYPE_LABEL] ?? d.type}” memories — log one to chart it.`,
      lore: d.lore,
      discovered: count >= 1,
      level: Math.max(0, level),
      maxLevel: 4,
      levelLabel: count >= 1 ? `Charted · ${count} ${count === 1 ? "body" : "bodies"}` : "Uncharted",
      progressToNext: next ? { cur: count, target: next } : undefined,
    };
  });
}

// ---- Creature rarities: one entry per class + the ultimate keepsake ----
const BODY_LORE: Record<CelestialClass, string> = {
  asteroid: "The smallest, most everyday creatures — new or fleeting thoughts, barely grown. Most memories start out here.",
  moon: "A thought with a little pull, drawn into the wake of something bigger than itself.",
  planet: "A settled, self-standing memory — sturdy, familiar, worth visiting again.",
  gas_giant: "A dense, emotionally-charged creature whose presence bends the ones nearby. The rare ones even carry rings.",
  giant: "A memory grown large through connection and significance — a landmark you navigate the town by.",
  star: "A memory that shines — highly important, highly connected. It lights up everything nearby.",
  supergiant: "The rarest, most cherished creature in your town. A defining memory whose presence shapes whole districts.",
};

function bodyEntries(ctx: CodexCtx): CodexEntry[] {
  const has = (cls: CelestialClass) => ctx.memories.some((m) => m.celestial === cls);
  const countCls = (cls: CelestialClass) => ctx.memories.filter((m) => m.celestial === cls).length;
  const entries: CodexEntry[] = CELESTIAL_CLASSES.map((cls) => {
    const n = countCls(cls);
    const { level, next } = tierOf(n, [1, 5, 20]);
    const rarity = rarityFor(cls);
    return {
      id: `body-${cls}`,
      category: "bodies" as const,
      icon: rarity.badge,
      title: rarity.label,
      lockedHint: `Grow a memory to ${rarity.label} rarity to catalog it.`,
      lore: BODY_LORE[cls],
      discovered: has(cls),
      level: Math.max(0, level),
      maxLevel: 3,
      levelLabel: has(cls) ? `${n} in your town` : "Never seen",
      progressToNext: next ? { cur: n, target: next } : undefined,
    };
  });
  // The rarest keepsake — a full year of remembering.
  const singularity = ctx.memories.length;
  entries.push({
    id: "body-singularity",
    category: "bodies",
    icon: "💎",
    title: "The Keepsake",
    lockedHint: "Reach 365 memories — a full year of your mind — to earn it.",
    lore: "The town's most treasured keepsake: the mark of a full year of remembering, heavier than any single memory. Nothing in your collection outweighs it.",
    discovered: singularity >= 365,
    level: singularity >= 365 ? 1 : 0,
    maxLevel: 1,
    levelLabel: singularity >= 365 ? "Earned" : "Unearned",
    progressToNext: singularity >= 365 ? undefined : { cur: singularity, target: 365 },
  });
  return entries;
}

// ---- Constellations: dynamic, one per MOC hub ----
function constellationEntries(ctx: CodexCtx): CodexEntry[] {
  if (ctx.constellations.length === 0) {
    return [
      {
        id: "constellation-none",
        category: "constellations",
        icon: "🕸️",
        title: "Chart your first constellation",
        lockedHint: "In the Insights tab, group related memories with “✦ Save as constellation”.",
        lore: "A constellation is a named hub that summarizes a whole body of work — a front door to a region of your mind. You haven't charted one yet.",
        discovered: false,
        level: 0,
        maxLevel: 1,
        levelLabel: "Uncharted",
      },
    ];
  }
  return ctx.constellations.map((hub) => {
    const members = hub.degree ?? 0;
    const { level } = tierOf(members, [1, 5, 12, 25]);
    return {
      id: `constellation-${hub.id}`,
      category: "constellations" as const,
      icon: "🕸️",
      title: hub.label,
      lockedHint: "",
      lore: hub.content || "A charted constellation of related memories.",
      discovered: true,
      level: Math.max(1, level),
      maxLevel: 4,
      levelLabel: `${members} ${members === 1 ? "member" : "members"}`,
      focusId: hub.id,
    };
  });
}

// ---- The Mind Layer: discover each cognitive kind as it first appears ----
const MIND_DEFS: { kind: string; title: string; icon: string; lore: string; hint: string }[] = [
  { kind: "goal", title: "The Ambition", icon: "🎯", hint: "Set a goal in the Mind tab to chart it.", lore: "A goal is a fixed point set out ahead of you — something your memories build toward, giving the town a direction rather than just a shape." },
  { kind: "skill", title: "The Craft", icon: "🛠️", hint: "Add a skill in the Mind tab.", lore: "A skill brightens with every memory that proves practice — a badge you don't set by hand but earn, tier by tier, from what you actually do." },
  { kind: "person_entity", title: "The Kindred", icon: "👤", hint: "Add a person in the Mind tab.", lore: "A person is someone others in your life gather around. Every memory that mentions them draws them closer, and their warmth rises or cools with how you've been." },
  { kind: "identity", title: "The Self", icon: "🪞", hint: "Define an identity in the Mind tab.", lore: "An identity is held to the evidence of your life: memories that express who you are brighten it; ones that contradict it, in your own words, dim it." },
  { kind: "idea", title: "The Spark", icon: "💡", hint: "Capture an idea in the Mind tab.", lore: "An idea is alive — it brightens as memories come to support it, fades if you never return, and, once ripe, can be promoted into a goal your memories build toward." },
  { kind: "intention", title: "The Intention", icon: "🌱", hint: "Note something you mean to do soon.", lore: "A short-lived sprout: an intention either gets fulfilled — you act, and it settles into memory — or it expires, wilting unremembered." },
  { kind: "motivation", title: "The Driving Force", icon: "🧭", hint: "Name a motivation in the Mind tab.", lore: "A motivation is the deep current beneath your goals — a pull that grows stronger as more of your town aligns with it." },
];

function mindEntries(ctx: CodexCtx): CodexEntry[] {
  return MIND_DEFS.map((d) => {
    const count = ctx.memories.filter((m) => m.kind === d.kind).length;
    const { level, next } = tierOf(count, [1, 3, 8]);
    return {
      id: `mind-${d.kind}`,
      category: "mind" as const,
      icon: d.icon,
      title: d.title,
      lockedHint: d.hint,
      lore: d.lore,
      discovered: count >= 1,
      level: Math.max(0, level),
      maxLevel: 3,
      levelLabel: count >= 1 ? `${count} in your mind` : "Unformed",
      progressToNext: next ? { cur: count, target: next } : undefined,
    };
  });
}

// ---- Fleet ----
function fleetEntries(ctx: CodexCtx): CodexEntry[] {
  const hasMem = ctx.memories.length >= 1;
  const beacons = stat("beacons_deployed");
  const hops = stat("travel_hops");
  return [
    {
      id: "fleet-soumaya",
      category: "fleet",
      icon: "🧭",
      title: "Soumaya, on Her Rounds",
      lockedHint: "Log your first memory to summon her.",
      lore: "Your autonomous caretaker. She walks the town tending memories, forging connections, and keeping the cold at bay — a companion, not a tool.",
      discovered: hasMem,
      level: hops >= 15 ? 3 : hops >= 1 ? 2 : hasMem ? 1 : 0,
      maxLevel: 3,
      levelLabel: hasMem ? `${hops} rounds logged` : "Dormant",
      progressToNext: hops >= 15 ? undefined : { cur: hops, target: hops >= 1 ? 15 : 1 },
    },
    {
      id: "fleet-station",
      category: "fleet",
      icon: "🏡",
      title: "Soumaya's Cottage",
      lockedHint: "Log your first memory.",
      lore: "The small house where Soumaya returns between rounds. The fixed point your town turns around, second only to Town Hall.",
      discovered: hasMem,
      level: hasMem ? 1 : 0,
      maxLevel: 1,
      levelLabel: hasMem ? "Open" : "—",
    },
    {
      id: "fleet-beacon",
      category: "fleet",
      icon: "🕯️",
      title: "Tending Rounds",
      lockedHint: "Paid over memories going cold — keep tending as your town grows.",
      lore: "Warm visits paid to memories going cold, a little care left behind each time, tinted by each memory's own mood.",
      discovered: beacons >= 1,
      level: beacons >= 5 ? 2 : beacons >= 1 ? 1 : 0,
      maxLevel: 2,
      levelLabel: beacons >= 1 ? `${beacons} paid` : "Not yet paid",
      progressToNext: beacons >= 5 ? undefined : { cur: beacons, target: beacons >= 1 ? 5 : 1 },
    },
  ];
}

// ---- Phenomena: rare events + milestones ----
function phenomenaEntries(ctx: CodexCtx): CodexEntry[] {
  const firstLink = ctx.links >= 1;
  const star = ctx.memories.some((m) => m.celestial === "star" || m.celestial === "supergiant");
  const deep = ctx.memories.some((m) => (m.degree ?? 0) >= 6);
  const ancient = ctx.memories.some((m) => ageDays(m) >= 90);
  const cooling = ctx.memories.some((m) => (m.entropy ?? 0) >= 0.55);
  const tended = stat("memories_tended");
  const def = (
    id: string,
    icon: string,
    title: string,
    hint: string,
    lore: string,
    discovered: boolean,
  ): CodexEntry => ({
    id: `phenom-${id}`,
    category: "phenomena",
    icon,
    title,
    lockedHint: hint,
    lore,
    discovered,
    level: discovered ? 1 : 0,
    maxLevel: 1,
    levelLabel: discovered ? "Observed" : "Unobserved",
  });
  const joyful = ctx.memories.some((m) => (m.emotionalWeight ?? 0) >= 0.5);
  const heavy = ctx.memories.some((m) => (m.emotionalWeight ?? 0) <= -0.5);
  const bands = new Set(
    ctx.memories
      .filter((m) => typeof m.emotionalWeight === "number")
      .map((m) => ((m.emotionalWeight ?? 0) > 0.12 ? "+" : (m.emotionalWeight ?? 0) < -0.12 ? "-" : "0")),
  );
  const supergiant = ctx.memories.some((m) => m.celestial === "supergiant");
  const bigHub = ctx.constellations.some((h) => (h.degree ?? 0) >= 12);
  return [
    def("firstlink", "🔌", "First Thread", "Log two related memories.", "The first thread between two memories — the moment a pile of notes became a mind.", firstLink),
    def("star", "★", "Breakthrough", "Grow a memory to Epic rarity.", "The first memory to really catch on: important, connected, hard to miss.", star),
    def("supernova", "💥", "Legendary Moment", "Grow a memory to Legendary — the rarest, most cherished.", "The biggest event your town has held: a memory so significant it reshapes whole districts around it. Few towns ever see one.", supergiant),
    def("deep", "🧲", "Deep Cluster", "Grow a memory to 6+ connections.", "A real pull: one memory so connected that others gather around it.", deep),
    def("crown", "👑", "Crown Jewel", "Grow a constellation to 12+ members.", "A constellation dense enough to be a landmark of its own — a hub you can navigate a whole district by.", bigHub),
    def("goldenhour", "🌅", "Golden Hour", "Log a deeply joyful memory.", "A memory glowing warm at the top of your emotional range — the one you return to on the hard days.", joyful),
    def("theweight", "🪨", "The Weight", "Log a deeply heavy memory.", "A heavy memory pressing hard on everything around it. Naming it is how you keep it from dragging the rest of the town down with it.", heavy),
    def("aurora", "🌈", "Full Spectrum", "Hold joyful, neutral AND heavy memories at once.", "The full emotional range held in your town at once — proof it holds the whole of a life, not just its highlights.", bands.size >= 3),
    def("ancient", "🕰️", "Old Growth", "Keep a memory alive for 90+ days.", "A memory that has stood through a full season — the oldest, steadiest presence in your town.", ancient),
    def("cooling", "❄️", "The Cold", "Let a memory drift untended for a while.", "You've witnessed entropy: a memory cooling in neglect, its color fading toward blue. The cold your town is always fighting.", cooling),
    def("tender", "🌿", "The Gardener", "Warm 10+ cooling memories back to life.", "Proof that nothing here truly fades while you return — brought back by hand, over and over.", tended >= 10),
  ];
}

export function buildCodex(ctx: CodexCtx): CodexEntry[] {
  return [
    ...sectorEntries(ctx),
    ...constellationEntries(ctx),
    ...mindEntries(ctx),
    ...bodyEntries(ctx),
    ...fleetEntries(ctx),
    ...phenomenaEntries(ctx),
  ];
}

export interface CodexProgress {
  discovered: number;
  total: number;
  pct: number;
  byCategory: Record<CodexCategory, { discovered: number; total: number }>;
}

export function codexProgress(entries: CodexEntry[]): CodexProgress {
  const byCategory = {} as Record<CodexCategory, { discovered: number; total: number }>;
  for (const c of CODEX_CATEGORIES) byCategory[c.id] = { discovered: 0, total: 0 };
  let discovered = 0;
  for (const e of entries) {
    byCategory[e.category].total++;
    if (e.discovered) {
      byCategory[e.category].discovered++;
      discovered++;
    }
  }
  const total = entries.length;
  return { discovered, total, pct: total ? Math.round((discovered / total) * 100) : 0, byCategory };
}
