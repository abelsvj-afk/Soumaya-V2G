import type { GraphicsMode } from "./graphicsConfig.js";
import type { ShaderTier } from "./shaders.js";

/**
 * Performance Program Stage 6 — the adaptive quality controller.
 *
 * `detectTier()` (graphicsConfig.ts) is a one-shot guess made before the app has ever
 * rendered a frame — necessarily conservative, and the reason a sharp/powerful phone
 * could get stuck on a preset built for a much weaker one. This module closes the loop
 * on ACTUAL measured cost (perfStats' rolling p95 tick+render time) and climbs or
 * descends a small ordered "rung" ladder in response, so a phone that turns out to have
 * headroom gets MORE than its initial guess, not the same reduced preset forever.
 *
 * Two axes only — pixelRatio and a detail tier (which packs shader octaves, the star-
 * light pool size, and the baked-backdrop cube face size, all already keyed off this
 * same 3-value tier by Stages 3/4) — plus bloom last. The original plan sketched a
 * finer, per-knob ladder (octaves and lights escalating independently of each other and
 * of DPR); collapsing it to the two axes Stage 4 actually shipped is a deliberate
 * simplification: a decoupled per-knob ladder would need every consumer (nodeObject.ts,
 * backdropBake.ts, the light pool) to accept independent tier/light-count/face-size
 * inputs instead of one shared tier enum, which is a much larger and riskier refactor
 * for a finer-grained win than this stage's budget justifies. DPR still ascends before
 * detail tier does (rungs 1/3/4 raise DPR before rung 5 raises detail) — the plan's core
 * ask, "resolution first, it's the biggest perceived-sharpness win," is preserved.
 *
 * `step()` is a pure function: given the previous state and one new sample, it returns
 * the next state. No timers, no DOM, no randomness — the caller (Graph3D) owns the
 * clock and the sampling cadence, which is what makes this exhaustively unit-testable.
 */

export interface RungSettings {
  pixelRatioCap: number;
  detailTier: ShaderTier;
  bloom: boolean;
  bloomStrength: number;
}

// Ordered by ascending cost. Index = "rung".
export const RUNG_TABLE: readonly RungSettings[] = [
  { pixelRatioCap: 1.0, detailTier: "performance", bloom: false, bloomStrength: 0 },
  { pixelRatioCap: 1.25, detailTier: "performance", bloom: false, bloomStrength: 0 },
  { pixelRatioCap: 1.25, detailTier: "balanced", bloom: false, bloomStrength: 0 },
  { pixelRatioCap: 1.5, detailTier: "balanced", bloom: false, bloomStrength: 0 },
  { pixelRatioCap: 2.0, detailTier: "balanced", bloom: false, bloomStrength: 0 },
  { pixelRatioCap: 2.0, detailTier: "quality", bloom: false, bloomStrength: 0 },
  { pixelRatioCap: 2.0, detailTier: "quality", bloom: true, bloomStrength: 0.3 },
  { pixelRatioCap: 2.0, detailTier: "quality", bloom: true, bloomStrength: 0.4 },
];
export const RUNG_COUNT = RUNG_TABLE.length;
export const MAX_RUNG = RUNG_COUNT - 1;

/** An explicit mode still self-tunes, but only within its own band (overlapping at the
 *  seams, matching the plan: "perf 0-2, balanced 2-5, quality 5-7"). "auto" gets the
 *  full ladder. */
export function modeRungRange(mode: GraphicsMode): [number, number] {
  switch (mode) {
    case "performance":
      return [0, 2];
    case "balanced":
      return [2, 5];
    case "quality":
      return [5, MAX_RUNG];
    default:
      return [0, MAX_RUNG];
  }
}

/** The rung a fresh session starts on, before any real measurement exists — one notch
 *  into each explicit mode's own band (see `modeRungRange`), matching that mode's
 *  existing static preset closely (DPR/bloom-wise) so a first frame doesn't jump. */
export function seedRungFromTier(tier: "performance" | "balanced" | "quality"): number {
  return tier === "performance" ? 0 : tier === "balanced" ? 3 : 6;
}

export interface AdaptiveSample {
  /** Combined CPU+GPU cost for the sampled window (e.g. tick.p95 + render.p95 from
   *  perfStats) — a derived aggregate for capacity planning, not a per-frame pairing
   *  (Stage 0 keeps those separate for diagnosis; this controller can still sum their
   *  percentiles for a single "how loaded are we" number). */
  workMs: number;
  /** 1000/fpsCap with the plan's 20% safety margin already applied by the caller. */
  targetMs: number;
  /** Did the camera move at all during this sample's window? An idle scene is cheap
   *  and would falsely look like "plenty of headroom" — ascend decisions require at
   *  least some real motion as evidence. */
  cameraMoved: boolean;
  /** Caller-supplied clock (ms) — never Date.now() internally, so this stays pure. */
  now: number;
}

export interface AdaptiveState {
  rung: number;
  /** Never probe above this rung again this session — set once an ascend to a rung
   *  fails twice (an immediate descend back down shortly after climbing to it). */
  ceilingRung: number;
  failedAscents: Record<number, number>;
  goodStreak: number;
  badStreak: number;
  /** Evidence gate for the CURRENT good streak — reset whenever the streak breaks. */
  movedDuringStreak: boolean;
  lastChangeAt: number;
  lastDescendFromRung: number | null;
  lastDescendAt: number;
  lastAscendToRung: number | null;
  lastAscendAt: number;
}

const BAD_STREAK_TO_DESCEND = 2;
const GOOD_STREAK_TO_ASCEND = 5;
const ASCEND_COOLDOWN_MS = 8000;
// "Never ascend within 4s of a descend at the same rung" — blocks immediately re-
// climbing into a rung this device just proved it can't sustain.
const REASCEND_BLOCK_MS = 4000;
// How soon after an ascend a descend counts as "that ascend failed" (rather than an
// unrelated later regression, e.g. the scene just got heavier for real reasons).
const FAILED_ASCENT_WINDOW_MS = 15000;
const FAILED_ASCENTS_TO_CEILING = 2;

export function initialState(seedRung: number, rungRange: [number, number]): AdaptiveState {
  const rung = clampRung(seedRung, rungRange);
  return {
    rung,
    ceilingRung: rungRange[1],
    failedAscents: {},
    goodStreak: 0,
    badStreak: 0,
    movedDuringStreak: false,
    // -Infinity, not 0: a fresh session has no prior change to cool down against. Using
    // a finite "epoch" value here would work by accident in production (Date.now() is
    // always far larger than 8s) but is semantically wrong and breaks under a test clock
    // that starts at 0 — the very first ascend shouldn't be gated by a cooldown against
    // a change that never happened.
    lastChangeAt: -Infinity,
    lastDescendFromRung: null,
    lastDescendAt: -Infinity,
    lastAscendToRung: null,
    lastAscendAt: -Infinity,
  };
}

function clampRung(rung: number, [min, max]: [number, number]): number {
  return Math.min(max, Math.max(min, rung));
}

/** Pure state transition — see the module doc for the algorithm. */
export function step(state: AdaptiveState, sample: AdaptiveSample, rungRange: [number, number]): AdaptiveState {
  const [minRung, maxRung] = rungRange;
  let rung = clampRung(state.rung, rungRange);
  const ceilingRung = Math.min(state.ceilingRung, maxRung);
  let { failedAscents, goodStreak, badStreak, movedDuringStreak, lastChangeAt, lastDescendFromRung, lastDescendAt, lastAscendToRung, lastAscendAt } = state;

  const over = sample.workMs > sample.targetMs;
  if (over) {
    badStreak += 1;
    goodStreak = 0;
    movedDuringStreak = false;
  } else {
    goodStreak += 1;
    badStreak = 0;
    if (sample.cameraMoved) movedDuringStreak = true;
  }

  // Descend: react fast, no cooldown — protecting the user from a stall matters more
  // than avoiding a rung flap.
  if (badStreak >= BAD_STREAK_TO_DESCEND && rung > minRung) {
    const from = rung;
    rung = from - 1;
    // If we're bailing out of a rung shortly after climbing INTO it, that ascend didn't
    // hold up — count it, and after enough failures stop ever probing that high again.
    if (lastAscendToRung === from && sample.now - lastAscendAt < FAILED_ASCENT_WINDOW_MS) {
      const fails = (failedAscents[from] ?? 0) + 1;
      failedAscents = { ...failedAscents, [from]: fails };
    }
    goodStreak = 0;
    badStreak = 0;
    movedDuringStreak = false;
    lastChangeAt = sample.now;
    lastDescendFromRung = from;
    lastDescendAt = sample.now;
  } else if (
    goodStreak >= GOOD_STREAK_TO_ASCEND &&
    rung < maxRung &&
    rung + 1 <= ceilingRung &&
    movedDuringStreak &&
    sample.now - lastChangeAt >= ASCEND_COOLDOWN_MS &&
    !(lastDescendFromRung === rung + 1 && sample.now - lastDescendAt < REASCEND_BLOCK_MS)
  ) {
    const to = rung + 1;
    rung = to;
    goodStreak = 0;
    badStreak = 0;
    movedDuringStreak = false;
    lastChangeAt = sample.now;
    lastAscendToRung = to;
    lastAscendAt = sample.now;
  }

  const nextCeiling =
    (failedAscents[rung + 1] ?? 0) >= FAILED_ASCENTS_TO_CEILING ? Math.min(ceilingRung, rung) : ceilingRung;

  return {
    rung,
    ceilingRung: nextCeiling,
    failedAscents,
    goodStreak,
    badStreak,
    movedDuringStreak,
    lastChangeAt,
    lastDescendFromRung,
    lastDescendAt,
    lastAscendToRung,
    lastAscendAt,
  };
}

// Bump whenever RUNG_TABLE's shape or the cost model changes, so a rung learned under
// the OLD model isn't trusted after this file changes — deliberately not the app's
// package.json semver (which changes for unrelated reasons); this only needs to move
// when the meaning of "rung N" itself changes.
export const ADAPTIVE_MODEL_VERSION = "1";

// --- Persistence: learn once, start good next launch --------------------------------
// Deliberately NOT a per-device key: localStorage is already scoped per browser
// profile/device by the platform, so a separate device-identity check would only add
// complexity for a case (the same origin's storage literally shared across different
// hardware) that doesn't happen in practice. `appVersion` is the real invalidation
// lever — bump it whenever the rung table or its cost model changes shape, so a stale
// learned rung from before the change is never trusted.
const STORAGE_KEY = "brain.graphics.adaptiveRung";

export interface PersistedRung {
  rung: number;
  ceilingRung: number;
  appVersion: string;
}

export function loadPersistedRung(appVersion: string): PersistedRung | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRung>;
    if (parsed.appVersion !== appVersion) return null; // model changed — don't trust it
    if (typeof parsed.rung !== "number" || typeof parsed.ceilingRung !== "number") return null;
    return { rung: parsed.rung, ceilingRung: parsed.ceilingRung, appVersion };
  } catch {
    return null;
  }
}

export function savePersistedRung(state: AdaptiveState, appVersion: string): void {
  try {
    const payload: PersistedRung = { rung: state.rung, ceilingRung: state.ceilingRung, appVersion };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* best-effort — a private-browsing quota error shouldn't break rendering */
  }
}
