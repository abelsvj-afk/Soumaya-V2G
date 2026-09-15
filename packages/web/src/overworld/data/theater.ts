/**
 * Theater (backlog #81, docs/overworld/theater-and-gazette.md) — pure selection of which real
 * memories the Theater lists as tonight's "showings." Never invented: picks from the player's
 * own actual creatures, ranked by the same celestial/rarity tier `adapter/rarity.ts` already
 * derives from mass (asteroid..supergiant) — the most significant real memories get top billing.
 */

import type { CelestialClass } from "@brain/shared";
import type { CreatureEntity } from "../types.js";

const CELESTIAL_ORDER: readonly CelestialClass[] = [
  "asteroid",
  "moon",
  "planet",
  "gas_giant",
  "giant",
  "star",
  "supergiant",
];

/** Bounded, not an exhaustive listing — a real theater has a finite bill, not a full catalog. */
export const MAX_SHOWINGS = 4;

/** Highest celestial tier first; ties break on nodeId (deterministic, never Math.random —
 *  matches this app's own placement/layout convention). */
export function selectShowings(creatures: readonly CreatureEntity[]): readonly CreatureEntity[] {
  return [...creatures]
    .sort((a, b) => {
      const rank = CELESTIAL_ORDER.indexOf(b.celestial) - CELESTIAL_ORDER.indexOf(a.celestial);
      return rank !== 0 ? rank : a.nodeId - b.nodeId;
    })
    .slice(0, MAX_SHOWINGS);
}
