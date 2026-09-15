import { useEffect, useState } from "react";
import type { LoreEntry } from "@brain/shared";
import { evolveLore, getLore } from "../../api/client.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { selectShowings } from "../data/theater.js";
import type { CreatureEntity } from "../types.js";
import { actionButtonStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

export interface TheaterOverlayProps {
  spaceId: string;
  creatures: readonly CreatureEntity[];
  onClose: () => void;
}

/**
 * The Theater (backlog #81, docs/overworld/theater-and-gazette.md) — tonight's "showings" are
 * the player's own most significant real memories (selectShowings, ranked by the same celestial
 * tier the rest of the Overworld already uses for rarity), each with its real evolving lore
 * (getLore/evolveLore, task #71's revival). Nothing here is invented programming — every listing
 * and every line of "showing" text is either the player's own captured content or Soumaya's own
 * real lore-evolution output. Recording real building work on an actual "Evolve" (not merely
 * opening the overlay) matches every other overlay's own convention.
 */
export function TheaterOverlay({ spaceId, creatures, onClose }: TheaterOverlayProps) {
  const showings = selectShowings(creatures);
  const [loreByNode, setLoreByNode] = useState<Record<number, LoreEntry[]>>({});
  const [evolvingNode, setEvolvingNode] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(showings.map((c) => getLore("memory", String(c.nodeId)).then((lore) => [c.nodeId, lore] as const))).then(
      (entries) => {
        if (cancelled) return;
        setLoreByNode(Object.fromEntries(entries));
      },
    );
    return () => {
      cancelled = true;
    };
    // Only the actual node ids matter for re-fetching — showings itself is recomputed fresh
    // every render from the same creatures list, which would otherwise re-trigger this on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showings.map((c) => c.nodeId).join(",")]);

  const evolve = async (nodeId: number) => {
    setEvolvingNode(nodeId);
    try {
      const history = await evolveLore("memory", String(nodeId));
      setLoreByNode((prev) => ({ ...prev, [nodeId]: history }));
      recordBuildingWork(spaceId, "theater");
    } finally {
      setEvolvingNode(null);
    }
  };

  return (
    <OverlayShell icon="🎭" title="Theater" onClose={onClose}>
      <p style={{ marginTop: 0, fontSize: 13, opacity: 0.85 }}>
        Tonight's showings — your own most significant memories, each with its real, still-evolving story.
      </p>
      {showings.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.8 }}>No showings yet — capture a few memories and the house will fill up.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {showings.map((creature) => {
            const lore = loreByNode[creature.nodeId];
            const latest = lore && lore.length > 0 ? lore[lore.length - 1] : null;
            return (
              <li key={creature.nodeId} style={{ padding: "8px 0", borderBottom: `1px solid ${color.divider}` }}>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>
                  {creature.rarity.badge} {creature.name}
                </div>
                {lore === undefined ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Reading its story so far...</div>
                ) : latest ? (
                  <>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Chapter {latest.version}</div>
                    <div style={{ fontSize: 12 }}>{latest.text}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>No story chronicled yet.</div>
                )}
                <button
                  type="button"
                  style={{ ...actionButtonStyle(evolvingNode === creature.nodeId), marginTop: 6 }}
                  disabled={evolvingNode === creature.nodeId}
                  onClick={() => void evolve(creature.nodeId)}
                >
                  {evolvingNode === creature.nodeId ? "…" : "✦ Evolve"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </OverlayShell>
  );
}
