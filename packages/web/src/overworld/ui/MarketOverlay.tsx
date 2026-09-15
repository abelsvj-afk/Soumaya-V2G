import { useState } from "react";
import { canAffordGood, MARKET_GOODS, ownedGoodIds, purchaseGood, type MarketGood } from "../data/marketGoods.js";
import { revenueForPriceCents, treasuryBalanceCents } from "../data/townLedger.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

export interface MarketOverlayProps {
  spaceId: string;
  onClose: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The Market (new this round, npc-economy.md) — the town's shop. Everything for sale is paid
 * for out of the real Town Treasury: the sum of every building's real, earned cosmetic wages
 * (townLedger.ts) — never real Fuel/finance. Buying something is itself the Market's own real
 * work event, same as every other building's real interaction. Selection state is tracked
 * correctly (ownedGoodIds) with no further in-world rendering yet — the exact same precedent
 * HangarOverlay.tsx already established for its outfit/charm choices.
 */
export function MarketOverlay({ spaceId, onClose }: MarketOverlayProps) {
  const [owned, setOwned] = useState(() => ownedGoodIds(spaceId));
  const [balance, setBalance] = useState(() => treasuryBalanceCents(spaceId));
  const [busyId, setBusyId] = useState<string | null>(null);

  const buy = (good: MarketGood) => {
    setBusyId(good.id);
    const ok = purchaseGood(spaceId, good.id);
    if (ok) {
      // simcity-economy-construction.md — the treasury earns a real cut of THIS sale's own
      // price, not a flat rate regardless of what was actually sold.
      recordBuildingWork(spaceId, "market", Date.now(), revenueForPriceCents(good.priceCents));
      setOwned(ownedGoodIds(spaceId));
      setBalance(treasuryBalanceCents(spaceId));
    }
    setBusyId(null);
  };

  return (
    <OverlayShell icon="🛒" title="Market" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Town Treasury: <strong>{formatCents(balance)}</strong> — every real hour the town's earned, waiting to be spent.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {MARKET_GOODS.map((good) => {
          const isOwned = owned.has(good.id);
          const affordable = canAffordGood(spaceId, good);
          return (
            <li
              key={good.id}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}
            >
              <span aria-hidden="true">{good.icon}</span>
              <span style={{ flex: 1 }}>
                {good.name} — {formatCents(good.priceCents)}
              </span>
              <button
                type="button"
                onClick={() => buy(good)}
                disabled={isOwned || !affordable || busyId === good.id}
                style={actionButtonStyle(isOwned || !affordable || busyId === good.id)}
              >
                {isOwned ? "Owned" : busyId === good.id ? "…" : affordable ? "Buy" : "Can't afford"}
              </button>
            </li>
          );
        })}
      </ul>
    </OverlayShell>
  );
}
