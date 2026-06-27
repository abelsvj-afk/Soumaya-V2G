import {
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type RelationshipType,
  deriveMass,
  classify,
} from "@brain/shared";

/**
 * Themed "solar systems". Each cluster is a coherent region of a life — a heavy
 * hub thought with planets/moons that genuinely belong to it, and a relationship
 * that actually fits. This is what makes the demo read like a real second brain
 * instead of random thoughts wired together at random.
 *
 * The demo is intentionally a MATURE galaxy: a dozen dense themed systems, cross
 * links between related systems (so constellations form), and a faint outer field
 * of long-tail fragments — many of them gone cold — so the Obsidian-style macro
 * view (points of light on zoom-out) and the Aura beacons both have something to
 * show. None of this is persisted or weighted into a real brain.
 */
interface Theme {
  hub: { label: string; type: NodeType; emotion: number };
  members: { label: string; type: NodeType; emotion: number; rel: RelationshipType }[];
}

const THEMES: Theme[] = [
  {
    hub: { label: "Launching my coffee startup", type: "project", emotion: 0.55 },
    members: [
      { label: "Partner with local roasters", type: "project", emotion: 0.4, rel: "builds_on" },
      { label: "Subscription pricing model", type: "concept", emotion: 0.2, rel: "builds_on" },
      { label: "Budget runway is tight", type: "concept", emotion: -0.5, rel: "complicates" },
      { label: "Quitting the day job", type: "daily", emotion: 0.1, rel: "caused_by" },
      { label: "Brand name brainstorm", type: "daily", emotion: 0.5, rel: "relates_to" },
      { label: "First pop-up stall idea", type: "project", emotion: 0.45, rel: "builds_on" },
      { label: "Sourcing ethical beans", type: "concept", emotion: 0.3, rel: "relates_to" },
    ],
  },
  {
    hub: { label: "Family & the people I love", type: "person", emotion: 0.6 },
    members: [
      { label: "Mom's birthday in October", type: "person", emotion: 0.7, rel: "relates_to" },
      { label: "That hard talk with Dad", type: "person", emotion: -0.3, rel: "complicates" },
      { label: "Old friend I should call", type: "person", emotion: 0.3, rel: "relates_to" },
      { label: "Forgiving an old grudge", type: "person", emotion: 0.2, rel: "resolves" },
      { label: "Sunday dinners we used to have", type: "daily", emotion: 0.4, rel: "relates_to" },
    ],
  },
  {
    hub: { label: "What gives my life meaning", type: "concept", emotion: 0.4 },
    members: [
      { label: "Fear of running out of time", type: "daily", emotion: -0.7, rel: "complicates" },
      { label: "Faith and doubt", type: "concept", emotion: 0.0, rel: "relates_to" },
      { label: "A recurring dream of flying", type: "daily", emotion: 0.6, rel: "is_analogous_to" },
      { label: "Why I keep avoiding the gym", type: "daily", emotion: -0.4, rel: "contradicts" },
      { label: "The trip to Lisbon", type: "daily", emotion: 0.8, rel: "resolves" },
    ],
  },
  {
    hub: { label: "Becoming a writer", type: "concept", emotion: 0.5 },
    members: [
      { label: "The novel I keep restarting", type: "daily", emotion: -0.2, rel: "complicates" },
      { label: "Morning pages habit", type: "concept", emotion: 0.4, rel: "builds_on" },
      { label: "A short story about the sea", type: "daily", emotion: 0.6, rel: "builds_on" },
      { label: "Imposter syndrome", type: "person", emotion: -0.5, rel: "complicates" },
      { label: "Rejection from the magazine", type: "daily", emotion: -0.4, rel: "caused_by" },
      { label: "Finding my voice", type: "concept", emotion: 0.3, rel: "resolves" },
    ],
  },
  {
    hub: { label: "Health & my body", type: "concept", emotion: 0.1 },
    members: [
      { label: "Sleep has been terrible", type: "daily", emotion: -0.6, rel: "complicates" },
      { label: "Started running again", type: "daily", emotion: 0.5, rel: "resolves" },
      { label: "Cut back on sugar", type: "concept", emotion: 0.2, rel: "builds_on" },
      { label: "That scary doctor visit", type: "daily", emotion: -0.7, rel: "caused_by" },
      { label: "Meditation actually helps", type: "concept", emotion: 0.4, rel: "resolves" },
    ],
  },
  {
    hub: { label: "Money & security", type: "concept", emotion: -0.1 },
    members: [
      { label: "Emergency fund goal", type: "concept", emotion: 0.3, rel: "builds_on" },
      { label: "Credit card debt", type: "concept", emotion: -0.6, rel: "complicates" },
      { label: "Investing for the first time", type: "project", emotion: 0.2, rel: "builds_on" },
      { label: "The raise I never asked for", type: "person", emotion: -0.3, rel: "caused_by" },
    ],
  },
  {
    hub: { label: "Where home is", type: "concept", emotion: 0.3 },
    members: [
      { label: "Should I move cities?", type: "daily", emotion: 0.0, rel: "complicates" },
      { label: "The apartment with the light", type: "daily", emotion: 0.6, rel: "relates_to" },
      { label: "Missing my hometown", type: "person", emotion: 0.2, rel: "relates_to" },
      { label: "Building a reading nook", type: "daily", emotion: 0.5, rel: "builds_on" },
    ],
  },
  {
    hub: { label: "Learning to let go", type: "person", emotion: 0.2 },
    members: [
      { label: "The breakup, a year on", type: "person", emotion: -0.2, rel: "caused_by" },
      { label: "Therapy is working", type: "concept", emotion: 0.5, rel: "resolves" },
      { label: "Anger I still carry", type: "daily", emotion: -0.5, rel: "complicates" },
      { label: "Who I'm becoming", type: "concept", emotion: 0.6, rel: "resolves" },
    ],
  },
  {
    hub: { label: "Side project: a tiny game", type: "project", emotion: 0.55 },
    members: [
      { label: "Pixel art is hard", type: "daily", emotion: -0.2, rel: "complicates" },
      { label: "The mechanic clicked today", type: "daily", emotion: 0.7, rel: "resolves" },
      { label: "Scope creep again", type: "concept", emotion: -0.3, rel: "complicates" },
      { label: "Showing a friend the build", type: "person", emotion: 0.5, rel: "relates_to" },
    ],
  },
  {
    hub: { label: "The kind of person I want to be", type: "concept", emotion: 0.5 },
    members: [
      { label: "More patient with people", type: "person", emotion: 0.4, rel: "builds_on" },
      { label: "Less time on my phone", type: "daily", emotion: 0.1, rel: "builds_on" },
      { label: "Keeping promises to myself", type: "concept", emotion: 0.3, rel: "builds_on" },
      { label: "Generosity over fear", type: "concept", emotion: 0.6, rel: "is_analogous_to" },
    ],
  },
];

// The faint long tail of a real brain: fleeting thoughts, half-formed, mostly old
// and gone cold. They give the macro/Obsidian view its field of distant lights.
const FRAGMENTS = [
  "a song stuck in my head", "the smell of rain", "an idea at 3am", "someone's face on the train",
  "a word I love", "that quote about rivers", "a color I keep seeing", "an old photograph",
  "the dream I forgot", "a kindness from a stranger", "a road not taken", "the sound of the sea",
  "a recipe to try", "an apology I owe", "the book on my nightstand", "a place I've never been",
  "a joke my grandfather told", "the weight of a Sunday", "a half-written letter", "the last warm day",
  "a question with no answer", "the shape of an old fear", "a melody I hummed", "what the light did",
];

const FRAG_TYPES: NodeType[] = ["daily", "concept", "person"];

/**
 * A synthetic "what it could look like" galaxy — generated client-side, never
 * persisted and never weighted into the real brain. `count` is accepted for API
 * compatibility but ignored (the demo is a fixed, mature composition).
 */
export function makeDemoGalaxy(_count = 40): GraphData {
  const nowMs = Date.now();
  const day = 86_400_000;
  // Spread creation dates over ~8 months so star-age tints vary.
  const ageIso = (daysAgo: number) => new Date(nowMs - daysAgo * day).toISOString();

  const nodesRaw: {
    id: number;
    label: string;
    type: NodeType;
    importance: number;
    emotionalWeight: number;
    entropy: number;
    createdAt: string;
  }[] = [];
  const links: GraphEdge[] = [];
  const degree = new Map<number, number>();
  const bump = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1);
  let id = 1;
  let eid = 1;
  const rnd = () => Math.random();
  const link = (source: number, target: number, relationship: RelationshipType, weight: number) => {
    links.push({ id: eid++, source, target, relationship, weight, createdAt: ageIso(rnd() * 60) });
    bump(source);
    bump(target);
  };

  const hubIds: number[] = [];
  const memberIds: number[] = [];

  for (const theme of THEMES) {
    const hubId = id++;
    hubIds.push(hubId);
    nodesRaw.push({
      id: hubId,
      label: theme.hub.label,
      type: theme.hub.type,
      importance: 0.84 + rnd() * 0.14,
      emotionalWeight: theme.hub.emotion,
      entropy: rnd() * 0.15, // hubs stay warm — they're tended often
      createdAt: ageIso(120 + rnd() * 120),
    });
    const thisMembers: number[] = [];
    for (const m of theme.members) {
      const memId = id++;
      thisMembers.push(memId);
      memberIds.push(memId);
      nodesRaw.push({
        id: memId,
        label: m.label,
        type: m.type,
        importance: 0.28 + rnd() * 0.42,
        emotionalWeight: m.emotion,
        entropy: rnd() * 0.6, // some members have started to cool
        createdAt: ageIso(20 + rnd() * 150),
      });
      link(memId, hubId, m.rel, 0.5 + rnd() * 0.4);
    }
    // Intra-theme density: a few members relate to a sibling (local web, not a star).
    for (let i = 0; i < thisMembers.length; i++) {
      if (rnd() < 0.4) {
        const j = (i + 1 + Math.floor(rnd() * (thisMembers.length - 1))) % thisMembers.length;
        if (j !== i) link(thisMembers[i]!, thisMembers[j]!, "relates_to", 0.25 + rnd() * 0.3);
      }
    }
  }

  // Cross-system constellations: link a handful of related hubs/members across
  // themes so the galaxy reads as one connected mind, not isolated islands.
  for (let i = 0; i < hubIds.length; i++) {
    if (rnd() < 0.6) {
      const a = hubIds[i]!;
      const b = hubIds[(i + 1 + Math.floor(rnd() * (hubIds.length - 2))) % hubIds.length]!;
      if (a !== b) link(a, b, "is_analogous_to", 0.2 + rnd() * 0.25);
    }
  }
  for (let k = 0; k < 14; k++) {
    const a = memberIds[Math.floor(rnd() * memberIds.length)]!;
    const b = memberIds[Math.floor(rnd() * memberIds.length)]!;
    if (a !== b) link(a, b, "relates_to", 0.15 + rnd() * 0.2);
  }

  // Faint outer field — long-tail fragments, mostly cold, lightly tethered.
  for (let f = 0; f < 64; f++) {
    const fid = id++;
    nodesRaw.push({
      id: fid,
      label: FRAGMENTS[f % FRAGMENTS.length]!,
      type: FRAG_TYPES[f % FRAG_TYPES.length]!,
      importance: 0.04 + rnd() * 0.16,
      emotionalWeight: rnd() * 2 - 1,
      entropy: 0.5 + rnd() * 0.45, // the periphery has gone cold (beacons appear)
      createdAt: ageIso(60 + rnd() * 180),
    });
    // Tether most fragments weakly to some existing body; a few drift unconnected.
    if (rnd() < 0.8) {
      const anchor = (rnd() < 0.5 ? memberIds : hubIds)[
        Math.floor(rnd() * (rnd() < 0.5 ? memberIds.length : hubIds.length))
      ]!;
      link(fid, anchor, "relates_to", 0.08 + rnd() * 0.18);
    }
  }

  const nodes: GraphNode[] = nodesRaw.map((n) => {
    const deg = degree.get(n.id) ?? 0;
    const mass = deriveMass({ importance: n.importance, degree: deg, emotionalWeight: n.emotionalWeight });
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      content: `Demo memory — ${n.label}.`,
      importance: n.importance,
      emotionalWeight: n.emotionalWeight,
      entropy: n.entropy,
      degree: deg,
      mass,
      val: mass,
      celestial: classify(mass),
      createdAt: n.createdAt,
    };
  });

  return { nodes, links };
}
