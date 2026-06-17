import type { GraphNode } from "@brain/shared";

const BODY: Record<string, string> = {
  supergiant: "a blazing supergiant",
  star: "a steady star",
  giant: "a banded gas giant",
  planet: "a living world",
  moon: "a quiet moon",
  asteroid: "a lone wandering shard",
};
const OPENERS = ["In this sector,", "The star-charts mark this as", "Voyagers know it as", "The log records"];

/**
 * Procedural "cosmos lore" for a memory — no tokens, deterministic from the body,
 * but it evolves as the memory grows (class, connections, emotion all shift it).
 */
export function loreFor(n: GraphNode): string {
  const cls = n.celestial ?? "moon";
  const deg = n.degree ?? 0;
  const emo = n.emotionalWeight ?? 0;
  const body = BODY[cls] ?? "a quiet moon";
  const mood =
    emo > 0.3 ? "warm, hopeful light" : emo < -0.3 ? "a cold, restless glow" : "a calm, even shimmer";
  const ties =
    deg === 0
      ? "drifting uncharted, not yet linked to anything"
      : deg < 3
        ? `bound to ${deg} nearby memor${deg === 1 ? "y" : "ies"}`
        : `a hub anchoring ${deg} orbits`;
  const opener = OPENERS[Math.abs(n.id) % OPENERS.length];
  return `${opener} ${body} of ${mood} — ${ties}.`;
}
