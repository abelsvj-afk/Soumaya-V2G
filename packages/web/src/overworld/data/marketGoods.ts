/**
 * Town Economy round (docs/overworld/npc-economy.md) — the Market's own small catalog, spent
 * from the real Town Treasury (townLedger.ts — never real Fuel/finance). Follows the exact
 * precedent HangarOverlay.tsx already established for its ship-hull/figurine choices: a real,
 * correctly-tracked selection with no further in-world rendering yet ("this building keeps
 * their *selection state* correct, which is what matters for parity, until/unless a later pass
 * gives them a real in-world effect") — not a new convention invented for this round.
 */

import { spendFromTreasury, treasuryBalanceCents } from "./townLedger.js";

export interface MarketGood {
  id: string;
  name: string;
  icon: string;
  priceCents: number;
}

export const MARKET_GOODS: readonly MarketGood[] = [
  { id: "banner_gold", name: "Gold Town Banner", icon: "🎌", priceCents: 100 },
  { id: "banner_teal", name: "Teal Town Banner", icon: "🏳️", priceCents: 100 },
  { id: "planter_box", name: "Market Planter Box", icon: "🪴", priceCents: 150 },
  { id: "lantern_string", name: "String of Lanterns", icon: "🏮", priceCents: 200 },
];

function ownedKey(spaceId: string): string {
  return `brain.marketGoods.owned.${spaceId}`;
}

export function ownedGoodIds(spaceId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(ownedKey(spaceId)) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

/** Spends real earned wages from the Town Treasury on one catalog item. Returns false and
 *  changes nothing if the item is unknown, already owned, or the treasury can't cover it. */
export function purchaseGood(spaceId: string, goodId: string): boolean {
  const good = MARKET_GOODS.find((g) => g.id === goodId);
  if (!good) return false;
  const owned = ownedGoodIds(spaceId);
  if (owned.has(goodId)) return false;
  if (!spendFromTreasury(spaceId, good.priceCents)) return false;
  owned.add(goodId);
  try {
    localStorage.setItem(ownedKey(spaceId), JSON.stringify([...owned]));
  } catch {
    /* the treasury spend above already happened — worst case this purchase isn't remembered */
  }
  return true;
}

export function canAffordGood(spaceId: string, good: MarketGood): boolean {
  return good.priceCents <= treasuryBalanceCents(spaceId);
}
