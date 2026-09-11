import { classify, COOLING_ENTROPY, type GraphNode, type NodeType } from "@brain/shared";
import type { CreatureEntity } from "../types.js";
import { rarityFor } from "./rarity.js";

/**
 * Sprite key per NodeType, with an explicit fallback for anything unmapped — required by
 * "the world must tolerate unsorted gracefully" (idea.md non-negotiables): an unrecognized
 * or future node type must still render as a creature, never as a missing-texture error.
 */
const SPRITE_BY_TYPE: Partial<Record<NodeType, string>> = {
  person: "creature_person",
  project: "creature_project",
  decision: "creature_decision",
  company: "creature_company",
  meeting: "creature_meeting",
  daily: "creature_daily",
  knowledge: "creature_knowledge",
  concept: "creature_concept",
  moc: "creature_hub",
};
const DEFAULT_SPRITE_KEY = "creature_default";

export function spriteKeyForType(type: NodeType): string {
  return SPRITE_BY_TYPE[type] ?? DEFAULT_SPRITE_KEY;
}

export interface NodeToCreatureOpts {
  /** Whether this node is linked to at least one Journey — false places it in the "uncharted" strip. */
  hasJourney?: boolean;
}

/**
 * Maps a real GraphNode (as returned by getGraph()) into the overworld's creature
 * representation. Reads celestial/entropy exactly as the server computed them — never
 * re-derives the mass/decay math client-side (see pokemon-reference.md's domain boundary).
 */
export function nodeToCreature(node: GraphNode, opts: NodeToCreatureOpts = {}): CreatureEntity {
  const celestial = node.celestial ?? classify(node.mass ?? 0);
  const entropy = node.entropy ?? 0;
  return {
    nodeId: node.id,
    name: node.celestialTitle ?? node.label,
    type: node.type,
    celestial,
    rarity: rarityFor(celestial),
    entropy,
    degree: node.degree ?? 0,
    isDue: entropy >= COOLING_ENTROPY,
    spriteKey: spriteKeyForType(node.type),
    uncharted: !opts.hasJourney,
  };
}
