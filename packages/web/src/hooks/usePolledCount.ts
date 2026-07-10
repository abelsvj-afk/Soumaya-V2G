import { useEffect, useState } from "react";

/**
 * Poll a count on an interval (and optionally on a window event) while `enabled`,
 * re-polling whenever `refreshKey` changes. Extracted from App.tsx (Post-MVP D4) to
 * DRY the badge-count effects (suggested-connections, due-reviews). Behaviour matches
 * the originals exactly: load immediately, poll on the interval, refresh 1s after the
 * event, and tear everything down on unmount / dependency change.
 */
export function usePolledCount(
  fetchCount: () => Promise<number>,
  enabled: boolean,
  intervalMs: number,
  opts: { refreshEvent?: string; refreshKey?: unknown } = {},
): number {
  const { refreshEvent, refreshKey } = opts;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      fetchCount()
        .then((n) => {
          if (alive) setCount(n);
        })
        .catch(() => {});
    };
    load();
    const onEvent = refreshEvent ? () => window.setTimeout(load, 1000) : undefined;
    if (refreshEvent && onEvent) window.addEventListener(refreshEvent, onEvent);
    const iv = window.setInterval(load, intervalMs);
    return () => {
      alive = false;
      if (refreshEvent && onEvent) window.removeEventListener(refreshEvent, onEvent);
      window.clearInterval(iv);
    };
    // fetchCount is intentionally omitted — it's a stable-behaviour module call, and
    // including an inline closure would re-run the poll every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, refreshEvent, refreshKey]);
  return count;
}
