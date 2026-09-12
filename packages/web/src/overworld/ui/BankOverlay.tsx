import type { BankLedgerRow } from "../types.js";
import { OverlayShell } from "./OverlayShell.js";

export interface BankOverlayProps {
  rows: BankLedgerRow[];
  safeToSpendCents: number;
  onClose: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * FR5-FR7 — the Bank interior. Real bill/goal rows from GET /api/finance/sky, real
 * safe-to-spend from GET /api/finance/summary — no invented numbers. Every row pairs its
 * MoneyStarState with a non-color icon+label (financeAdapter.ts), not a tint alone.
 */
export function BankOverlay({ rows, safeToSpendCents, onClose }: BankOverlayProps) {
  return (
    <OverlayShell icon="🏦" title="Bank" onClose={onClose}>
      <p>
        Safe to spend: <strong>{formatCents(safeToSpendCents)}</strong>
      </p>
      {rows.length === 0 ? (
        <p>Nothing on the ledger yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.id}`}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}
            >
              <span aria-hidden="true">{row.icon}</span>
              <span style={{ flex: 1 }}>{row.label}</span>
              <span>{formatCents(row.amountCents)}</span>
              <span>
                {row.state}
                {row.isUrgent ? " — urgent" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
