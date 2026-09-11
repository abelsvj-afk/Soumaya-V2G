import type { CelestialClass } from "@brain/shared";
import type { RarityMeta, RarityTier } from "../types.js";

/**
 * D7 (docs/overworld/decisions.md): rarity uses all 7 real CelestialClass values 1:1,
 * not the build brief's 6 — gas_giant gets its own tier between Rare and Super Rare.
 * Every tier carries a badge shape, never a color-only cue.
 */
const RARITY_BY_CLASS: Record<CelestialClass, RarityMeta> = {
  asteroid: { tier: "common", label: "Common", badge: "○" },
  moon: { tier: "uncommon", label: "Uncommon", badge: "●" },
  planet: { tier: "rare", label: "Rare", badge: "◆" },
  gas_giant: { tier: "rare_plus", label: "Rare+", badge: "◈" },
  giant: { tier: "super_rare", label: "Super Rare", badge: "✦" },
  star: { tier: "epic", label: "Epic", badge: "✶" },
  supergiant: { tier: "legendary", label: "Legendary", badge: "✸" },
};

export function rarityFor(celestial: CelestialClass): RarityMeta {
  return RARITY_BY_CLASS[celestial];
}
