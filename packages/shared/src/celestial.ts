/**
 * Celestial mechanics for the memory galaxy. A memory's "mass" is derived from
 * three signals and decides both its gravitational pull (heavy memories tug
 * lighter ones toward them) and what kind of body it renders as.
 */

export type CelestialClass =
  | "asteroid"
  | "moon"
  | "planet"
  | "giant"
  | "star"
  | "supergiant";

export const CELESTIAL_CLASSES: readonly CelestialClass[] = [
  "asteroid",
  "moon",
  "planet",
  "giant",
  "star",
  "supergiant",
];

/** Display glyph per class (used in the list + inspector). */
export const CELESTIAL_ICON: Record<CelestialClass, string> = {
  asteroid: "▪",
  moon: "○",
  planet: "◍",
  giant: "◉",
  star: "★",
  supergiant: "✸",
};

export interface MassSignals {
  /** 0..1 — how significant/serious/life-impacting (rated by the LLM). */
  importance?: number;
  /** Number of graph connections (structural gravity — hubs are heavy). */
  degree?: number;
  /** -1..1 — emotional charge; magnitude adds weight either way. */
  emotionalWeight?: number;
}

/** Connections past this count add diminishing mass (saturating curve). */
const DEGREE_SATURATION = 4;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Blend significance, connectedness, and emotional charge into a single 0..1
 * mass. Significance dominates, structure (degree) is second, raw emotion adds
 * a little — a serious, well-connected, emotionally-charged memory is a star.
 */
export function deriveMass({ importance, degree, emotionalWeight }: MassSignals): number {
  const sig = clamp01(importance ?? 0.4);
  const d = degree ?? 0;
  const structure = d / (d + DEGREE_SATURATION); // 0..1, saturating
  const emotion = Math.min(1, Math.abs(emotionalWeight ?? 0));
  // Significance weighted so a maxed importance (1.0) alone reaches star class,
  // letting you promote a memory to a sun by hand; connections + emotion add more.
  return clamp01(0.62 * sig + 0.28 * structure + 0.1 * emotion);
}

/**
 * Map a 0..1 mass onto a celestial body class. Six tiers give real progression:
 * faint scraps are asteroids; a maxed-out memory (importance 1 ≈ 0.62) reaches
 * star, and the heaviest, most-connected become supergiants.
 */
export function classify(mass: number): CelestialClass {
  if (mass >= 0.8) return "supergiant";
  if (mass >= 0.6) return "star";
  if (mass >= 0.44) return "giant";
  if (mass >= 0.26) return "planet";
  if (mass >= 0.12) return "moon";
  return "asteroid";
}

/**
 * "Entropy" 0..1 — how cold/neglected a memory has grown. It ramps up with days
 * since it was last tended (created/visited/edited/linked) and is resisted by
 * connectedness (well-linked hubs cool far slower). Never destroys anything; it's
 * a visual + nudge signal that fully resets to 0 the moment you tend the memory.
 */
export function entropyFrom(daysSinceTended: number, degree = 0): number {
  if (!(daysSinceTended > 0)) return 0;
  // Hubs are anchored: each connection slows the cooling.
  const resistance = 1 + degree * 0.6;
  const reaches1At = 21 * resistance; // ~3 weeks untended for a lone memory to fully cool
  const x = daysSinceTended / reaches1At;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

