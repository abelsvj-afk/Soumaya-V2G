import { useState } from "react";
import {
  businessById,
  businessTypeById,
  canAffordGood,
  ownedGoodIds,
  purchaseGoodFromBusiness,
} from "../data/business.js";
import { treasuryBalanceCents } from "../data/townLedger.js";
import { actionButtonStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

export interface BusinessOverlayProps {
  spaceId: string;
  businessId: string;
  onClose: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * A real multi-business economy (docs/overworld/business.md, task #67) — a generic overlay for
 * ANY placed business, parameterized by its own real type + real goods catalog, the same shape
 * `MarketOverlay.tsx` already established rather than a hand-built screen per type. Buying a
 * good here is this business's OWN real work event (`purchaseGoodFromBusiness` credits its own
 * hours and resets its own neglect clock), never the Hangar's or Market's.
 */
export function BusinessOverlay({ spaceId, businessId, onClose }: BusinessOverlayProps) {
  const business = businessById(spaceId, businessId);
  const type = business ? businessTypeById(business.typeId) : undefined;
  const [owned, setOwned] = useState(() => ownedGoodIds(spaceId, businessId));
  const [balance, setBalance] = useState(() => treasuryBalanceCents(spaceId));
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!business || !type) {
    // Tolerate-gracefully: a business the player somehow can't find real data for (should be
    // unreachable in practice — afterStep only emits this for a real businessDoorAt match).
    return (
      <OverlayShell icon="🏪" title="Business" onClose={onClose}>
        <p>This place isn't here anymore.</p>
      </OverlayShell>
    );
  }

  const buy = (goodId: string) => {
    setBusyId(goodId);
    const ok = purchaseGoodFromBusiness(spaceId, businessId, goodId);
    if (ok) {
      setOwned(ownedGoodIds(spaceId, businessId));
      setBalance(treasuryBalanceCents(spaceId));
    }
    setBusyId(null);
  };

  return (
    <OverlayShell icon={type.icon} title={type.name} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Town Treasury: <strong>{formatCents(balance)}</strong> — every real hour the town's earned, waiting to be spent.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {type.goods.map((good) => {
          const isOwned = owned.has(good.id);
          const affordable = canAffordGood(spaceId, good);
          return (
            <li key={good.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
              <span aria-hidden="true">{good.icon}</span>
              <span style={{ flex: 1 }}>
                {good.name} — {formatCents(good.priceCents)}
              </span>
              <button
                type="button"
                onClick={() => buy(good.id)}
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
