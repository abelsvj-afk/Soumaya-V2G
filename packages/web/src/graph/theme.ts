import {
  type CelestialClass,
  type GraphNode,
  type NodeType,
  normalizeNodeType,
  EMOTION_COLORS,
  EMOTION_COLORS_CB,
} from "@brain/shared";

/** Per-kind hue — used for chips, dots and as the tint seed for bodies. */
export const TYPE_COLORS: Record<NodeType, string> = {
  person: "#b388ff", // violet
  project: "#ffd166", // gold
  decision: "#ff7b54", // coral
  company: "#4fa3ff", // blue
  meeting: "#5fe0b0", // mint
  daily: "#7af9ff", // cyan
  knowledge: "#9dff8a", // lime
  concept: "#f4a6ff", // magenta
  other: "#c7c7e0", // grey
  moc: "#ffe9a8", // constellation hub — bright starlight gold
};

/** Color for any stored/raw type string, tolerant of legacy values. */
export function colorForType(raw: string | null | undefined): string {
  return TYPE_COLORS[normalizeNodeType(raw)];
}

/**
 * Body palettes by celestial class. Stars burn warm/bright, planets span vivid
 * hues, moons are pale and cold. A node's hue is picked deterministically from
 * its id so the galaxy is varied but stable across renders.
 */
export const CELESTIAL_COLORS: Record<CelestialClass, string[]> = {
  asteroid: ["#8a8170", "#9a8d78", "#7d7466", "#a39a86"],
  moon: ["#cfd6e6", "#aab2cc", "#dfe6f5", "#9fb0c8"],
  planet: ["#6fb7ff", "#b388ff", "#5fe0b0", "#ffd166", "#ff9ec7", "#7af9ff"],
  gas_giant: ["#d8b48a", "#c98f5a", "#e6c79a", "#b87f99", "#caa06e", "#9fb6d8"],
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

/**
 * ONE emotional palette for the whole scene — links, packet particles, beacon
 * beams, the chat eye: gold = joyful, indigo = heavy, synapse green = neutral.
 * DERIVED from the shared EMOTION_COLORS so the galaxy render and the Legend can
 * never drift apart (single source of truth in @brain/shared).
 */
const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * The emotion palette is SWAPPABLE at runtime for colorblind accessibility (#3a).
 * `brain.colorblind` = "1" selects the Okabe–Ito blue/orange/grey set; otherwise the
 * default gold/indigo/green. `EMOTION_RGB` is an exported `let` so live ESM bindings in
 * the galaxy renderer pick up the swap on the next frame; the Legend re-reads it on the
 * `brain-palette-change` event. Meaning is never colour-alone — labels always accompany.
 */
const CB_KEY = "brain.colorblind";
function activeEmotionPalette(): Record<"positive" | "heavy" | "neutral", string> {
  return isColorblind() ? EMOTION_COLORS_CB : EMOTION_COLORS;
}
function computeEmotionRgb(): Record<"positive" | "heavy" | "neutral", readonly [number, number, number]> {
  const p = activeEmotionPalette();
  return { positive: hexToRgb(p.positive), heavy: hexToRgb(p.heavy), neutral: hexToRgb(p.neutral) };
}

export function isColorblind(): boolean {
  try {
    return localStorage.getItem(CB_KEY) === "1";
  } catch {
    return false;
  }
}
export function setColorblind(on: boolean): void {
  try {
    localStorage.setItem(CB_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  EMOTION_RGB = computeEmotionRgb();
  window.dispatchEvent(new Event("brain-palette-change"));
}

// eslint-disable-next-line prefer-const
export let EMOTION_RGB: Record<"positive" | "heavy" | "neutral", readonly [number, number, number]> = computeEmotionRgb();

export function emotionKind(ew: number, threshold = 0.12): keyof typeof EMOTION_RGB {
  return ew > threshold ? "positive" : ew < -threshold ? "heavy" : "neutral";
}
export function emotionColorHex(ew: number, threshold = 0.12): string {
  const [r, g, b] = EMOTION_RGB[emotionKind(ew, threshold)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
/** Current hex for an emotion band (drives the Legend swatches so they follow the toggle). */
export function emotionHex(kind: "positive" | "heavy" | "neutral"): string {
  return activeEmotionPalette()[kind];
}
