import type { GraphData } from "@brain/shared";
import { objectLoreFor, type LoreObjectKind } from "../graph/objectLore.js";

/**
 * A small glass card shown while a lore object (the station or the ship) is
 * focused. Its story is generated live from the brain, so it mutates and grows
 * as you add memories — and reflects what the object is + how long it's served.
 */
export function ObjectLoreCard({
  kind,
  graph,
  onClose,
}: {
  kind: LoreObjectKind;
  graph: GraphData;
  onClose: () => void;
}) {
  const { title, log } = objectLoreFor(kind, graph);
  return (
    <div className="object-lore">
      <div className="object-lore-head">
        <span className="object-lore-title">
          {kind === "ship" ? "🛸" : kind === "satellite" ? "🛰️" : "🪐"} {title}
        </span>
        <button className="object-lore-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="object-lore-log">✦ {log}</p>
    </div>
  );
}
