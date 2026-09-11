/**
 * Single source of truth for "should the galaxy calm its motion?" (accessibility).
 *
 * Two inputs, OR'd together:
 *  • the OS `prefers-reduced-motion: reduce` setting, and
 *  • an in-app override the user can flip in Settings (localStorage `brain.reducedMotion`
 *    = "1" to force calm, "0" to force full motion, unset = follow the OS).
 *
 * Consumers (link-forming flourish #1b, ambient orbital drift / ribbon flow / bloom
 * pulsing #3b) read `prefersReducedMotion()` and slow or skip non-essential motion.
 * Changing the override dispatches `brain-motion-change` so live listeners re-read it.
 */
const KEY = "brain.reducedMotion";

export function prefersReducedMotion(): boolean {
  try {
    const override = localStorage.getItem(KEY);
    if (override === "1") return true;
    if (override === "0") return false;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The user's explicit choice, or null when following the OS. */
export function reducedMotionOverride(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Mirror the EFFECTIVE reduced-motion state onto `<html data-reduced-motion="1">`.
 *
 * Why this exists: the in-app Settings toggle only wrote localStorage, while every
 * CSS animation block in the app keys off `@media (prefers-reduced-motion: reduce)`
 * — the OS setting. So a user who explicitly asked for calm in Settings still got
 * the toast slide, rank-up pop, streak flicker, fuel burn and song-dot spin. Nothing
 * in the app ever touched `documentElement`, so CSS had no way to see the override.
 *
 * The attribute drives one global rule in index.css. Deliberately mirrors only the
 * ACCESSIBILITY state, not `focusCalm` — focus mode calms the galaxy for a reading
 * session, but freezing every UI transition mid-session would read as broken.
 */
function syncReducedMotionAttr(): void {
  try {
    const root = document?.documentElement;
    if (!root) return;
    if (prefersReducedMotion()) root.setAttribute("data-reduced-motion", "1");
    else root.removeAttribute("data-reduced-motion");
  } catch {
    /* non-DOM environment (tests/SSR) — nothing to mirror */
  }
}

// Apply at module load, and keep it correct if the OS setting changes at runtime.
syncReducedMotionAttr();
try {
  window.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener?.("change", syncReducedMotionAttr);
} catch {
  /* ignore */
}

/** Set (or clear, with null) the override and notify listeners. */
export function setReducedMotionOverride(v: boolean | null): void {
  try {
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  syncReducedMotionAttr();
  window.dispatchEvent(new Event("brain-motion-change"));
}

/**
 * Deep-space focus mode (#2) calms motion for the duration of a reading session WITHOUT
 * touching the persisted accessibility setting — it's ephemeral and in-memory only.
 * `shouldCalmMotion()` is what the galaxy actually reads: the a11y setting OR focus mode.
 */
let focusCalm = false;
export function setFocusCalm(on: boolean): void {
  if (focusCalm === on) return;
  focusCalm = on;
  window.dispatchEvent(new Event("brain-motion-change"));
}
export function shouldCalmMotion(): boolean {
  return focusCalm || prefersReducedMotion();
}
