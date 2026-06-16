import {
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type RelationshipType,
  NODE_TYPES,
  RELATIONSHIP_TYPES,
  deriveMass,
  classify,
} from "@brain/shared";

const SAMPLE = [
  "Coffee subscription with local roasters",
  "Fear of running out of time",
  "Mom's birthday in October",
  "What gives my life meaning",
  "App idea: voice journaling",
  "The trip to Lisbon",
  "Why I keep avoiding the gym",
  "Saving for a house",
  "That conversation with Dad",
  "Learning three.js",
  "Faith and doubt",
  "Starting a podcast",
  "Old friend I should call",
  "Career vs. freedom",
  "A recurring dream about flying",
  "Budget for the startup",
];

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

/**
 * A synthetic "what it could look like" galaxy — generated client-side, never
 * persisted and never weighted into the real brain. Builds a few massive hubs
 * (stars) with planets and moons clustered + linked around them so you can preview
 * the full experience before you've added many memories.
 */
export function makeDemoGalaxy(count = 40): GraphData {
  const now = new Date().toISOString();
  const hubCount = 3;
  const raw = Array.from({ length: count }, (_, i) => {
    const isHub = i < hubCount;
    return {
      id: i + 1,
      type: pick(NODE_TYPES) as NodeType,
      label: `${pick(SAMPLE)}${i >= SAMPLE.length ? ` #${i}` : ""}`,
      importance: isHub ? 0.85 + Math.random() * 0.15 : Math.random() * 0.6,
      emotionalWeight: Math.random() * 2 - 1,
    };
  });
  const hubs = raw.slice(0, hubCount);

  // Clean hub-and-spoke: each body orbits exactly one sun (no random cross-links,
  // so it reads as clear solar systems instead of a web).
  const links: GraphEdge[] = [];
  const degree = new Map<number, number>();
  const bump = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1);
  let eid = 1;
  for (let i = hubCount; i < raw.length; i++) {
    const n = raw[i]!;
    const hub = hubs[i % hubCount]!;
    links.push({
      id: eid++,
      source: n.id,
      target: hub.id,
      relationship: pick(RELATIONSHIP_TYPES) as RelationshipType,
      weight: 0.4 + Math.random() * 0.5,
      createdAt: now,
    });
    bump(n.id);
    bump(hub.id);
  }

  const nodes: GraphNode[] = raw.map((n) => {
    const deg = degree.get(n.id) ?? 0;
    const mass = deriveMass({ importance: n.importance, degree: deg, emotionalWeight: n.emotionalWeight });
    return {
      ...n,
      content: `Demo memory — ${n.label}.`,
      degree: deg,
      mass,
      val: mass,
      celestial: classify(mass),
      createdAt: now,
    };
  });

  return { nodes, links };
}
