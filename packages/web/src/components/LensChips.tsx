import { useEffect, useState, useCallback } from "react";
import type { Lens } from "@brain/shared";
import { getLenses, lensNodes } from "../api/lenses.js";

/**
 * On-galaxy quick chips for PINNED Smart Lenses — one-tap switching between your saved
 * views without opening the panel. The active lens is highlighted; tapping it again
 * exits. Live counts re-sync on ingest and whenever lenses change in the panel. Hidden
 * when there are no pinned lenses (so it never adds chrome you didn't ask for).
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
    refresh();
    const on = () => refresh();
    window.addEventListener("brain-memory-added", on);
    window.addEventListener("brain-lenses-changed", on);
    return () => {
      window.removeEventListener("brain-memory-added", on);
      window.removeEventListener("brain-lenses-changed", on);
    };
  }, [refresh]);

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
    <div className="lens-chips" role="toolbar" aria-label="Pinned lenses">
      {pinned.map((l) => {
        const on = activeLens === l.name;
        return (
          <button
            key={l.id}
            className={`lens-chip ${on ? "on" : ""}`}
            onClick={() => void tap(l)}
            aria-pressed={on}
            title={on ? `Exit “${l.name}”` : `View “${l.name}”`}
          >
            <span className="lens-chip-name">{l.name}</span>
            <span className="lens-chip-count">{on ? "✕" : (l.count ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}
