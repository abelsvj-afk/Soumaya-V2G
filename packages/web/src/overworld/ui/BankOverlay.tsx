import type { BankLedgerRow } from "../types.js";

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
    <div
      role="dialog"
      aria-label="Bank"
      style={{
        position: "absolute",
        inset: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: 16,
        fontFamily: "monospace",
        overflowY: "auto",
      }}
    >
      <h2 style={{ marginTop: 0 }}>🏦 Bank</h2>
      <p>
        Safe to spend: <strong>{formatCents(safeToSpendCents)}</strong>
      </p>
      {rows.length === 0 ? (
        <p>Nothing on the ledger yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {rows.map((row) => (
            <li
              key={`${row.kind}-${row.id}`}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}
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
      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
