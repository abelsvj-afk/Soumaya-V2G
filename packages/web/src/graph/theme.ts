import type { CelestialClass, GraphNode, NodeType } from "@brain/shared";

/** Per-type hue — used for chips, dots and as the tint seed for bodies. */
export const TYPE_COLORS: Record<NodeType, string> = {
  business_idea: "#ffd166",
  relationship_reflection: "#ff6b9d",
  random_thought: "#7af9ff",
  person: "#b388ff",
  concept: "#9dff8a",
  other: "#c7c7e0",
};

/**
 * Body palettes by celestial class. Stars burn warm/bright, planets span vivid
 * hues, moons are pale and cold. A node's hue is picked deterministically from
 * its id so the galaxy is varied but stable across renders.
 */
export const CELESTIAL_COLORS: Record<CelestialClass, string[]> = {
  asteroid: ["#8a8170", "#9a8d78", "#7d7466", "#a39a86"],
  moon: ["#cfd6e6", "#aab2cc", "#dfe6f5", "#9fb0c8"],
  planet: ["#6fb7ff", "#b388ff", "#5fe0b0", "#ffd166", "#ff9ec7", "#7af9ff"],
  giant: ["#e8a766", "#d98c5f", "#e3c08a", "#c98f5a", "#dcae72"],
  star: ["#fff4d6", "#ffe08a", "#ffd0a0", "#cfe3ff", "#ffc4f0"],
  supergiant: ["#cfe3ff", "#9fc4ff", "#ffd9c0", "#ff9e8a", "#e6ecff"],
};

/** Pick a stable body color for a node from its class palette, preferring the LLM's color if present. */
export function bodyColor(node: GraphNode): string {
  if (node.color) return node.color;
  const cls = node.celestial ?? "moon";
  const palette = CELESTIAL_COLORS[cls];
  return palette[Math.abs(node.id) % palette.length]!;
}

/** Deep-space background. */
export const BG = "#05010d";
