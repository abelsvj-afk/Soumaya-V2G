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
 * instead of random thoughts wired together at random (the old demo linked
 * unrelated things, which made no sense in the galaxy).
 */
interface Theme {
  hub: { label: string; type: NodeType; emotion: number };
  members: { label: string; type: NodeType; emotion: number; rel: RelationshipType }[];
}

const THEMES: Theme[] = [
  {
    hub: { label: "Launching my coffee startup", type: "business_idea", emotion: 0.55 },
    members: [
      { label: "Partner with local roasters", type: "business_idea", emotion: 0.4, rel: "builds_on" },
      { label: "Subscription pricing model", type: "concept", emotion: 0.2, rel: "builds_on" },
      { label: "Budget runway is tight", type: "concept", emotion: -0.5, rel: "complicates" },
      { label: "Quitting the day job", type: "random_thought", emotion: 0.1, rel: "caused_by" },
      { label: "Brand name brainstorm", type: "random_thought", emotion: 0.5, rel: "relates_to" },
    ],
  },
  {
    hub: { label: "Family & the people I love", type: "relationship_reflection", emotion: 0.6 },
    members: [
      { label: "Mom's birthday in October", type: "person", emotion: 0.7, rel: "relates_to" },
      { label: "That hard talk with Dad", type: "relationship_reflection", emotion: -0.3, rel: "complicates" },
      { label: "Old friend I should call", type: "person", emotion: 0.3, rel: "relates_to" },
      { label: "Forgiving an old grudge", type: "relationship_reflection", emotion: 0.2, rel: "resolves" },
    ],
  },
  {
    hub: { label: "What gives my life meaning", type: "concept", emotion: 0.4 },
    members: [
      { label: "Fear of running out of time", type: "random_thought", emotion: -0.7, rel: "complicates" },
      { label: "Faith and doubt", type: "concept", emotion: 0.0, rel: "relates_to" },
      { label: "A recurring dream of flying", type: "random_thought", emotion: 0.6, rel: "is_analogous_to" },
      { label: "Why I keep avoiding the gym", type: "random_thought", emotion: -0.4, rel: "contradicts" },
      { label: "The trip to Lisbon", type: "random_thought", emotion: 0.8, rel: "resolves" },
    ],
  },
];

/**
 * A synthetic "what it could look like" galaxy — generated client-side, never
 * persisted and never weighted into the real brain. Builds a few themed solar
 * systems (a massive star hub with thematically-related planets/moons orbiting
 * it) so you can preview the full experience before adding many memories.
 *
 * `count` is accepted for API compatibility but the demo is now fixed-content so
 * every cluster stays coherent.
 */
export function makeDemoGalaxy(_count = 40): GraphData {
  const now = new Date().toISOString();
  const nodesRaw: { id: number; label: string; type: NodeType; importance: number; emotionalWeight: number }[] = [];
  const links: GraphEdge[] = [];
  const degree = new Map<number, number>();
  const bump = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1);
  let id = 1;
  let eid = 1;

  for (const theme of THEMES) {
    const hubId = id++;
    nodesRaw.push({
      id: hubId,
      label: theme.hub.label,
      type: theme.hub.type,
      importance: 0.86 + Math.random() * 0.12,
      emotionalWeight: theme.hub.emotion,
    });
    for (const m of theme.members) {
      const memId = id++;
      nodesRaw.push({
        id: memId,
        label: m.label,
        type: m.type,
        importance: 0.25 + Math.random() * 0.45,
        emotionalWeight: m.emotion,
      });
      // Each member orbits its own hub with a relationship that fits the theme.
      links.push({
        id: eid++,
        source: memId,
        target: hubId,
        relationship: m.rel,
        weight: 0.5 + Math.random() * 0.4,
        createdAt: now,
      });
      bump(memId);
      bump(hubId);
    }
  }

  const nodes: GraphNode[] = nodesRaw.map((n) => {
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
