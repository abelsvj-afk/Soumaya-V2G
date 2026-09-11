/**
 * Presentation-layer entity types for the overworld. These describe render/interaction
 * state derived FROM the real API data by the adapter layer — they never redefine domain
 * facts (mass/entropy/money math), only translate them into tile-world terms. See
 * docs/overworld/architecture.md and docs/overworld/pokemon-reference.md's domain-boundary
 * table before adding a field here.
 */
import type { CelestialClass, MoneyStarState, NodeType } from "@brain/shared";

/** D7 — the 7 CelestialClass tiers mapped 1:1 to rarity, each with a non-color badge shape. */
export type RarityTier =
  | "common"
  | "uncommon"
  | "rare"
  | "rare_plus"
  | "super_rare"
  | "epic"
  | "legendary";

export interface RarityMeta {
  tier: RarityTier;
  label: string;
  /** A shape/icon distinct per tier — never rely on color alone (accessibility non-negotiable). */
  badge: string;
}

/** A memory node, rendered as a creature in the world. */
export interface CreatureEntity {
  nodeId: number;
  name: string;
  type: NodeType;
  celestial: CelestialClass;
  rarity: RarityMeta;
  /** Raw 0..1 entropy from the server (undefined = never computed, treated as fresh/0). */
  entropy: number;
  /** Connection count (GraphNode.degree) — shown on the Details/Summary screen. */
  degree: number;
  /** entropy >= COOLING_ENTROPY (matches the rest of the app's convention) — render visibly dimmed. */
  isDue: boolean;
  spriteKey: string;
  /**
   * Deterministic per-node grid position, filled in by `adapter/placement.ts`'s
   * `placeCreaturesOnGrid` — undefined until placement runs (kept a separate step so tile
   * layout and domain-data mapping stay independently testable).
   */
  tile?: { x: number; y: number };
  /** True when the node has no Journey — placed in the "uncharted" strip, never an error state. */
  uncharted: boolean;
}

/** A MoneyStar (bill or goal), rendered as a Bank ledger row. */
export interface BankLedgerRow {
  id: number;
  kind: "bill" | "goal";
  label: string;
  amountCents: number;
  state: MoneyStarState;
  /** Non-color icon paired with `state` (D9 / accessibility non-negotiable). */
  icon: string;
  isUrgent: boolean;
  dueInDays?: number;
  fillPct?: number;
}

/** A Journey, rendered as a region's visual theme. */
export interface RegionTheme {
  journeyId: number;
  title: string;
  /** Falls back to a neutral "uncharted" palette when the Journey has no color set. */
  paletteSeed: string;
  icon: string;
}

export const UNCHARTED_PALETTE = "#4b4b63";
export const UNCHARTED_ICON = "🌫️";
