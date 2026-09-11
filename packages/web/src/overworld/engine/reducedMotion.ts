/**
 * Single source of truth for prefers-reduced-motion, used by both the React touch/dialogue
 * overlay and the Phaser scene glue — see architecture.md "Accessibility hooks."
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
