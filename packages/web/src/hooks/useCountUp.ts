import { useEffect, useRef, useState } from "react";

/**
 * Ease a displayed integer toward a target value so counters (memory count, streak,
 * fuel) tween up/down instead of snapping — cheap "game feel". Honors
 * prefers-reduced-motion (jumps instantly). Dependency-free rAF.
 */
export function useCountUp(target: number, ms = 600): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target || !Number.isFinite(target)) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, ms]);

  return display;
}
