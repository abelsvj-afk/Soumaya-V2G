import { useEffect, useState, useCallback } from "react";
import type { Lens } from "@brain/shared";
import { getLenses, lensNodes } from "../api/lenses.js";

/**
 * PINNED Smart Lenses — one-tap switching between your saved views without opening the
 * full Lenses panel. The active lens is highlighted; tapping it again exits. Live counts
 * re-sync on ingest and whenever lenses change in the panel. Renders nothing when there
 * are no pinned lenses (so it never adds chrome you didn't ask for).
 *
 * Rendered as a plain in-flow LIST inside the Views dropdown (`GalaxyViews.tsx`), not as
 * its own floating overlay — a real, on-device bug report showed this previously as an
 * independently `position:absolute`-anchored row that could visually collide with the
 * Views toggle (see `.gv-wrap`'s CSS comment for the root cause) whenever the two floating
 * elements' unrelated anchor math didn't line up on a given device. Living inside the SAME
 * dropdown as Views removes that whole class of collision — there is only one floating
 * element now, not two independently-positioned ones.
 */
export function LensChips({
  activeLens,
  onOpen,
  onExit,
  hidden,
}: {
  activeLens: string | null;
  /** Isolate the galaxy to these ids under this lens name. */
  onOpen: (ids: number[], name: string) => void;
  onExit: () => void;
  hidden?: boolean;
}) {
  const [pinned, setPinned] = useState<Lens[]>([]);

  const refresh = useCallback(
    () => getLenses().then((ls) => setPinned(ls.filter((l) => l.pinned))).catch(() => {}),
    [],
  );
  useEffect(() => {
    // While hidden (the Views dropdown is collapsed, or a full panel/chat/Observatory is
    // open), there's no reason to keep fetching on every memory add. Re-running this
    // effect when `hidden` flips back to false refreshes once on the way back in, so it's
    // never stale when it reappears.
    if (hidden) return;
    refresh();
    const on = () => refresh();
    window.addEventListener("brain-memory-added", on);
    window.addEventListener("brain-lenses-changed", on);
    return () => {
      window.removeEventListener("brain-memory-added", on);
      window.removeEventListener("brain-lenses-changed", on);
    };
  }, [refresh, hidden]);

  if (hidden || pinned.length === 0) return null;

  const tap = async (l: Lens) => {
    if (activeLens === l.name) {
      onExit();
      return;
    }
    const ids = await lensNodes(l.id);
    if (ids.length > 0) onOpen(ids, l.name);
  };

  return (
    <div className="lens-list" role="list" aria-label="Pinned lenses">
      <div className="lens-list-label">📌 Pinned Lenses</div>
      {pinned.map((l) => {
        const on = activeLens === l.name;
        return (
          <button
            key={l.id}
            className={`lens-list-item ${on ? "on" : ""}`}
            onClick={() => void tap(l)}
            aria-pressed={on}
            role="listitem"
            title={on ? `Exit “${l.name}”` : `View “${l.name}”`}
          >
            <span className="lens-list-name">{l.name}</span>
            <span className="lens-list-count">{on ? "✕" : (l.count ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}
