/**
 * Celestial mechanics for the memory galaxy. A memory's "mass" is derived from
 * three signals and decides both its gravitational pull (heavy memories tug
 * lighter ones toward them) and what kind of body it renders as.
 */

export type CelestialClass =
  | "asteroid"
  | "moon"
  | "planet"
  | "gas_giant"
  | "giant"
  | "star"
  | "supergiant";

export const CELESTIAL_CLASSES: readonly CelestialClass[] = [
  "asteroid",
  "moon",
  "planet",
  "gas_giant",
  "giant",
  "star",
  "supergiant",
];

/** Display glyph per class (used in the list + inspector). */
export const CELESTIAL_ICON: Record<CelestialClass, string> = {
  asteroid: "▪",
  moon: "○",
  planet: "◍",
  gas_giant: "🪐",
  giant: "◉",
  star: "★",
  supergiant: "✸",
};

/** Human-facing label per class (the id `gas_giant` reads as "gas giant"). */
export const CELESTIAL_LABEL: Record<CelestialClass, string> = {
  asteroid: "asteroid",
  moon: "moon",
  planet: "planet",
  gas_giant: "gas giant",
  giant: "giant",
  star: "star",
  supergiant: "supergiant",
};

/** One-line meaning per class — what growing to this size actually means. */
export const CELESTIAL_MEANING: Record<CelestialClass, string> = {
  asteroid: "a new or fleeting thought, barely massed",
  moon: "a small memory finding its orbit",
  planet: "an established memory with real weight",
  gas_giant: "a heavy, well-connected memory",
  giant: "a major anchor in your thinking",
  star: "important, luminous, deeply connected",
  supergiant: "one of the great weights of your galaxy",
};

/**
 * SPECIAL-BODY + EMOTION colors — the single source of truth shared by the
 * galaxy renderer, the server (belief/constellation authoring), and the Legend,
 * so the visual key can never drift from what's actually drawn.
 */
export const SPECIAL_COLORS = {
  /** A consolidated belief (dream cycles). */
  belief: "#9686ff",
  /** A constellation hub (Map of Content). */
  constellation: "#ffe9a8",
  /** The Sun at the galaxy's core. */
  sun: "#ffcf6b",
} as const;

/** Link/emotion palette (matches the galaxy's link colors + the chat eye). */
export const EMOTION_COLORS = {
  positive: "#ffcd46", // joyful — warm gold
  heavy: "#9686ff", // heavy — indigo
  neutral: "#46f58c", // neutral — resting synapse green
} as const;

/**
 * The COGNITIVE LAYER — object classes that model what the mind is THINKING, not
 * just what it has remembered (see docs/COGNITIVE_LAYER.md). Each is a `nodes` row
 * with one of these `kind` values (the same proven pattern as `moc`/`belief`).
 * This one map is the single source of truth for colour/label/icon/durability used
 * by the galaxy renderer, the Legend, and the Mind panel — so the visual language
 * can never drift.
 */
export type CognitiveKind =
  | "goal"
  | "idea"
  | "skill"
  | "person_entity"
  | "identity"
  | "mental_model"
  | "intention"
  | "future_event"
  | "motivation";

export interface CognitiveMeta {
  label: string;
  icon: string;
  color: string;
  blurb: string;
  /** Durable = entropy-exempt (doesn't cool); ephemeral kinds get lifecycles later. */
  durable: boolean;
  /** Default importance → drives how large/anchoring it renders. */
  importance: number;
  /** Whether this kind carries a 0..1 progress (goals complete, skills level). */
  hasProgress: boolean;
}

export const COGNITIVE_META: Record<CognitiveKind, CognitiveMeta> = {
  goal: {
    label: "Goal",
    icon: "🎯",
    color: "#ff9d3c",
    blurb: "A long-term aim your memories orbit and drift toward.",
    durable: true,
    importance: 0.82,
    hasProgress: true,
  },
  idea: {
    label: "Idea",
    icon: "💡",
    color: "#8fdcff",
    blurb: "A potential future — it can grow, split, merge, or fade.",
    durable: false,
    importance: 0.4,
    hasProgress: false,
  },
  skill: {
    label: "Skill",
    icon: "🧬",
    color: "#9dff8a",
    blurb: "A capability that brightens as you practice it.",
    durable: true,
    importance: 0.6,
    hasProgress: true,
  },
  person_entity: {
    label: "Person",
    icon: "❤️",
    color: "#ff9ec7",
    blurb: "A person themselves — your interactions orbit them.",
    durable: true,
    importance: 0.7,
    hasProgress: false,
  },
  identity: {
    label: "Identity",
    icon: "🏛️",
    color: "#fff4d6",
    blurb: "Who you are — a core that brightens as evidence accrues.",
    durable: true,
    importance: 0.9,
    hasProgress: false,
  },
  mental_model: {
    label: "Mental Model",
    icon: "🧠",
    color: "#c9a6ff",
    blurb: "A reasoning tool — how you think, applied across memories.",
    durable: true,
    importance: 0.62,
    hasProgress: false,
  },
  intention: {
    label: "Intention",
    icon: "🌠",
    color: "#ffe9a8",
    blurb: "A short-lived plan — a comet passing through.",
    durable: false,
    importance: 0.3,
    hasProgress: false,
  },
  future_event: {
    label: "Future Event",
    icon: "⏳",
    color: "#a8d8ff",
    blurb: "Something ahead — an appointment, deadline, or prediction.",
    durable: false,
    importance: 0.4,
    hasProgress: false,
  },
  motivation: {
    label: "Motivation",
    icon: "🔥",
    color: "#ff7a45",
    blurb: "A drive that pulls on your behavior — a gravity well.",
    durable: true,
    importance: 0.72,
    hasProgress: false,
  },
};

/**
 * Skill mastery tiers (Cognitive Layer Phase 4). A skill's 0..1 `progress` — raised
 * automatically as memories evidence practice — maps to a named level. Single source
 * so the server (leveling engine) and web (Mind tab label) always agree.
 */
export const SKILL_TIERS = ["Novice", "Beginner", "Practiced", "Skilled", "Advanced", "Expert"] as const;
export type SkillTier = (typeof SKILL_TIERS)[number];
export function skillTier(progress: number): SkillTier {
  if (progress >= 1) return "Expert";
  if (progress >= 0.8) return "Advanced";
  if (progress >= 0.6) return "Skilled";
  if (progress >= 0.4) return "Practiced";
  if (progress >= 0.2) return "Beginner";
  return "Novice";
}

export const COGNITIVE_KINDS = Object.keys(COGNITIVE_META) as CognitiveKind[];
/** Durable cognitive kinds never "cool" (entropy-exempt, like hubs + beliefs). */
export const DURABLE_COGNITIVE_KINDS = new Set(
  COGNITIVE_KINDS.filter((k) => COGNITIVE_META[k].durable),
);

export interface MassSignals {
  /** 0..1 — how significant/serious/life-impacting (rated by the LLM). */
  importance?: number;
  /** Number of graph connections (structural gravity — hubs are heavy). */
  degree?: number;
  /** -1..1 — emotional charge; magnitude adds weight either way. */
  emotionalWeight?: number;
  /** Days since the memory was created. Bodies GROW with survival, never instantly. */
  ageDays?: number;
  /** Reinforcement: how many latent insights this memory appears in (the AI
   *  surfacing hidden connections is what "feeds" a memory's growth over time). */
  reinforcement?: number;
}

/** Connections past this count add diminishing mass (saturating curve). */
const DEGREE_SATURATION = 4;
/** Latent insights past this count add diminishing mass. */
const REINFORCE_SATURATION = 5;
/** Days for survival alone to contribute "half" its growth (~8 months). */
const AGE_SUSTAIN_DAYS = 240;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Blend the signals into a single 0..1 mass — but a memory is BORN SMALL (an
 * asteroid) and must EARN its size over time. This is the core of "a brain that
 * grows with you for years":
 *
 * - **Importance** only gives a modest *base* (a profound brand-new memory is at
 *   most a moon, never an instant planet) and raises the *ceiling* of how big it
 *   can ever get.
 * - The real growth is **earned**: graph connections, the **latent insights** the
 *   AI surfaces about it, **survival age**, and emotional charge — signals that
 *   only accrue over weeks and months. So nothing balloons into a ringed planet
 *   in 24 hours; asteroids stay asteroids until they prove they matter.
 */
export function deriveMass({
  importance,
  degree,
  emotionalWeight,
  ageDays,
  reinforcement,
}: MassSignals): number {
  const sig = clamp01(importance ?? 0.4);
  const d = degree ?? 0;
  const structure = d / (d + DEGREE_SATURATION); // 0..1, saturating
  const r = reinforcement ?? 0;
  const reinforced = r / (r + REINFORCE_SATURATION); // 0..1, saturating
  const age = ageDays ?? 0;
  const survived = age / (age + AGE_SUSTAIN_DAYS); // 0..1, slow
  const emotion = Math.min(1, Math.abs(emotionalWeight ?? 0));

  const base = 0.26 * sig + 0.04 * emotion; // a hand-maxed importance reaches ~planet; auto-rated stays asteroid/moon
  const growth = 0.4 * structure + 0.22 * reinforced + 0.14 * survived; // 0..0.76 (earned)
  const ceiling = 0.55 + 0.45 * sig; // trivial memories can never grow as large as profound ones
  return clamp01(Math.min(ceiling, base + growth * (0.6 + 0.4 * sig)));
}

/**
 * Map a 0..1 mass onto a celestial body class. Six tiers give real progression:
 * faint scraps are asteroids; a maxed-out memory (importance 1 ≈ 0.62) reaches
 * star, and the heaviest, most-connected become supergiants.
 */
export function classify(mass: number): CelestialClass {
  if (mass >= 0.8) return "supergiant";
  if (mass >= 0.6) return "star"; // a hand-maxed importance (1 ≈ 0.62) reaches star
  if (mass >= 0.48) return "giant";
  if (mass >= 0.36) return "gas_giant";
  if (mass >= 0.24) return "planet";
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

