/**
 * Adaptive graphics configuration — one place that decides how heavy the 3D galaxy
 * renders, so a flagship phone gets the cinematic experience and a budget phone gets
 * the SAME app, just optimized (never a stripped feature set). Graph3D CONSUMES this;
 * it never decides performance itself.
 *
 * Modes: auto (detect the device) · performance · balanced · quality. Individual
 * knobs (bloom, star density, particles, animation, render resolution, battery saver,
 * FPS cap) can be overridden in Settings. Everything persists in localStorage so the
 * pilot never reconfigures. An FPS monitor can suggest Performance Mode if it's rough.
 */

export type GraphicsMode = "auto" | "performance" | "balanced" | "quality";
export type Level = "low" | "medium" | "high";
export type RenderQuality = "auto" | Level;
export type FpsCap = 30 | 45 | 60;

export interface GraphicsSettings {
  mode: GraphicsMode;
  bloom: boolean;
  starDensity: Level;
  particles: Level;
  animationQuality: Level;
  renderQuality: RenderQuality;
  batterySaver: boolean;
  fpsCap: FpsCap;
  /** Force the heavy background scenery on/off, or leave it to the tier ("auto").
   *  Lets you perf-test the full scenery on any device without switching whole modes. */
  sceneryOverride?: "auto" | "on" | "off";
}

/** The concrete numbers Graph3D reads each build/settings-change. */
export interface ResolvedGraphics {
  bloom: boolean;
  bloomStrength: number;
  starCount: number;
  /** 0..1 multipliers the scene systems can scale their work by. */
  particleScale: number;
  animationScale: number;
  pixelRatio: number;
  fpsCap: number;
  /** Render the heavy background scenery (nebulae/galaxies/comets)? Top tier only. */
  heavyScenery: boolean;
  /** The tier that was detected (for diagnostics + the Settings label). */
  tier: "performance" | "balanced" | "quality";
}

const KEY = "brain.graphics";

// Bloom (UnrealBloomPass) allocates several full-screen render targets and is the
// #1 cause of a phone stalling on the first WebGL frame — so it's OFF for everything
// except the top "quality" tier. Reliability first; the cinematic look is opt-in.
const PRESETS: Record<"performance" | "balanced" | "quality", Omit<GraphicsSettings, "mode">> = {
  performance: { bloom: false, starDensity: "low", particles: "low", animationQuality: "low", renderQuality: "low", batterySaver: false, fpsCap: 30 },
  balanced: { bloom: false, starDensity: "medium", particles: "medium", animationQuality: "medium", renderQuality: "low", batterySaver: false, fpsCap: 45 },
  quality: { bloom: true, starDensity: "high", particles: "high", animationQuality: "high", renderQuality: "high", batterySaver: false, fpsCap: 60 },
};

/**
 * Detect a rough capability tier (cheap, synchronous, best-effort). Deliberately
 * CONSERVATIVE: "quality" (bloom + heavy scenery) only for clearly high-end devices,
 * because guessing high on a mid phone freezes it on the first galaxy render. When
 * unknown, assume "performance" (iOS hides deviceMemory → treat as low, not mid).
 */
export function detectTier(): "performance" | "balanced" | "quality" {
  try {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 3; // GB; unknown → low-ish
    const cores = navigator.hardwareConcurrency ?? 4;
    const dpr = window.devicePixelRatio || 1;
    const minSide = Math.min(window.screen?.width ?? 1024, window.screen?.height ?? 768);
    let score = 0;
    if (mem <= 3) score -= 2;
    else if (mem >= 8) score += 2;
    else if (mem >= 6) score += 1;
    if (cores <= 4) score -= 1;
    else if (cores >= 8) score += 1;
    if (minSide <= 480) score -= 1; // small phone screen
    if (dpr >= 3) score -= 1; // very high-DPI is expensive to fill
    if (score <= 1) return "performance"; // bias low: most phones/mid-range (like A37 5G) land here (no bloom)
    if (score >= 3) return "quality"; // bloom only for genuinely powerful devices
    return "balanced";
  } catch {
    return "performance";
  }
}

export function defaultSettings(): GraphicsSettings {
  return { mode: "auto", ...PRESETS[detectTier()] };
}

export function getGraphics(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
      return { ...defaultSettings(), ...parsed };
    }
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

type Listener = (s: GraphicsSettings) => void;
const listeners = new Set<Listener>();
export function onGraphicsChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function persistAndEmit(s: GraphicsSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(s);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("brain-graphics-change"));
}

/** Switch mode: a preset seeds all fields (auto seeds from the detected tier). */
export function setGraphicsMode(mode: GraphicsMode): GraphicsSettings {
  const preset = mode === "auto" ? PRESETS[detectTier()] : PRESETS[mode];
  const next: GraphicsSettings = { mode, ...preset };
  persistAndEmit(next);
  return next;
}

/** Override one individual knob (keeps the current mode; it's now effectively custom). */
export function setGraphicsField<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): GraphicsSettings {
  const next = { ...getGraphics(), [key]: value };
  persistAndEmit(next);
  return next;
}

const STAR = { low: 1200, medium: 3500, high: 6500 } as const;
const PARTICLE = { low: 0.35, medium: 0.7, high: 1 } as const;
const ANIM = { low: 0.5, medium: 0.8, high: 1 } as const;

/** Translate the stored settings into the concrete numbers Graph3D consumes. */
export function resolveGraphics(s: GraphicsSettings = getGraphics()): ResolvedGraphics {
  const detected = detectTier();
  const tier = s.mode === "auto" ? detected : s.mode;
  // In auto mode the device decides; otherwise honor the stored (possibly custom) fields.
  const eff: Omit<GraphicsSettings, "mode"> = s.mode === "auto" ? { ...PRESETS[tier] } : s;
  const dpr = window.devicePixelRatio || 1;

  const tierCap = tier === "performance" ? 1 : tier === "balanced" ? 1.5 : 2;
  let pixelRatio: number;
  switch (eff.renderQuality) {
    case "low": pixelRatio = 1; break;
    case "medium": pixelRatio = Math.min(1.5, dpr); break;
    case "high": pixelRatio = Math.min(2, dpr); break;
    default: pixelRatio = Math.min(dpr, tierCap); // "auto"
  }

  let bloom = eff.bloom;
  let fpsCap: number = eff.fpsCap;
  if (eff.batterySaver) {
    bloom = false;
    fpsCap = Math.min(fpsCap, 30);
    pixelRatio = Math.min(pixelRatio, 1);
  }

  return {
    bloom,
    bloomStrength: bloom ? (eff.animationQuality === "high" ? 0.4 : 0.3) : 0,
    starCount: STAR[eff.starDensity],
    particleScale: PARTICLE[eff.particles],
    animationScale: ANIM[eff.animationQuality],
    pixelRatio,
    fpsCap,
    // Nebulae + galaxy sprites + comets are extra draw calls; only render them on the
    // top tier so a mid/low phone isn't asked to build them on the first frame — unless
    // you've explicitly forced scenery on/off (perf-testing lever).
    heavyScenery:
      s.sceneryOverride === "on"
        ? true
        : s.sceneryOverride === "off"
          ? false
          : tier === "quality" && !eff.batterySaver,
    tier,
  };
}

export const GRAPHICS_MODES: { id: GraphicsMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Match your device" },
  { id: "performance", label: "Performance", hint: "Smoothest on weaker phones" },
  { id: "balanced", label: "Balanced", hint: "Good looks + speed" },
  { id: "quality", label: "Quality", hint: "Full cinematic galaxy" },
];
