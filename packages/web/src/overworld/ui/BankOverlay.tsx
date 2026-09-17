import { useEffect, useState, type CSSProperties } from "react";
import {
  addExpense,
  addIncome,
  createBill,
  deleteBill,
  deleteExpense,
  deleteIncome,
  editExpense,
  editIncome,
  getAfford,
  getFinanceSummary,
  listBills,
  listExpense,
  listIncome,
  markOccurrencePaid,
  setBalance,
  type FinanceSummary,
} from "../../api/finance.js";
import type { BillFrequency, FinBill, FinExpense, FinIncome } from "@brain/shared";
import { recordBuildingWork } from "../data/npcJobs.js";
import type { BankLedgerRow } from "../types.js";
import { actionButtonStyle, ConfirmButton, fieldStyle, OverlayShell } from "./OverlayShell.js";
import { color, spacing } from "./theme.js";

export interface BankOverlayProps {
  spaceId: string;
  /** The real goal/bill "ledger" (GET /api/finance/sky) kept from before this round's rebuild —
   *  only its GOAL-kind rows are shown here (a bill would otherwise be listed twice, once here
   *  and once under "Upcoming bills" below). Full Wealth (buckets/allocations) stays deferred —
   *  see the module doc comment. */
  rows: BankLedgerRow[];
  onClose: () => void;
}

const fmt = (cents: number): string => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtc = (cents: number): string => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const toCents = (s: string): number | null => {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Task #129 — a real rebuild of the Bank, direct response to the single most severe finding of
 * the overlay-parity investigation: the pre-Overworld galaxy's own Money panel (FinancePanel.tsx,
 * ~1200 lines) was reduced to a 48-line read-only ledger when the galaxy was deleted, even though
 * every real API it called (api/finance.ts, GET/POST /api/finance/*) survived untouched — only
 * the client UI was ever removed. This restores the load-bearing core: Safe-to-Spend + shortfall,
 * balance set, add income/expense, upcoming bills + mark paid, a recurring-bill manager, "what
 * can I afford?", and a full editable/deletable transaction history — every number here is real,
 * fetched from the same untouched server routes the galaxy used.
 *
 * Deliberately deferred to their own follow-up rounds, named here rather than silently dropped
 * (each is a genuinely distinct subsystem, not a trivial port): Wealth (goals/buckets/
 * allocations — its own nested panel in the original), Pay stub upload/extraction (vision-based
 * document parsing), Snap/Paste import (screenshot/text vision-extraction into draft rows), and
 * the Income/Net-Worth growth trend charts. A bill/expense/income row here can't yet be linked to
 * a Journey (JourneyChips) — that's Journeys-side wiring, not Bank's.
 *
 * Every real mutation credits this building's own work the same way every other Overlay's own
 * button already does (recordBuildingWork) — replacing the old diff-based `detectBankWork`
 * (removed: it existed only because this overlay used to have no button of its own to hook).
 */
export function BankOverlay({ spaceId, rows, onClose }: BankOverlayProps) {
  const [sum, setSum] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reservedOpen, setReservedOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setSum(await getFinanceSummary());
    setLoading(false);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const didWork = () => recordBuildingWork(spaceId, "bank");
  const goalRows = rows.filter((r) => r.kind === "goal");

  if (loading && !sum) return <OverlayShell icon="🏦" title="Bank" onClose={onClose}><p>Loading your budget…</p></OverlayShell>;
  if (!sum) return <OverlayShell icon="🏦" title="Bank" onClose={onClose}><p>Couldn't reach the budget (offline?). Try again.</p></OverlayShell>;

  const b = sum.budget;

  return (
    <OverlayShell icon="🏦" title="Bank" onClose={onClose}>
      <section style={{ marginBottom: spacing.md }}>
        <div style={{ fontSize: 12, color: color.textBody, opacity: 0.8 }}>Safe to Spend</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: color.textTitle }}>{fmt(b.safeToSpendCents)}</div>
        {b.shortfallCents > 0 && (
          <div role="status" style={{ color: "#ffb4a3", marginTop: 4 }}>
            <span aria-hidden="true">⚠️</span> Short by {fmtc(b.shortfallCents)} before {b.nextIncomeDate}
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: spacing.md, marginBottom: spacing.md }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.75 }}>Earned this week</div>
          <div style={{ fontWeight: 700 }}>{fmt(b.weekEarnedCents)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.75 }}>Balance</div>
          <div style={{ fontWeight: 700 }}>{fmt(b.balanceCents)}</div>
        </div>
      </div>

      <button type="button" onClick={() => setReservedOpen((v) => !v)} aria-expanded={reservedOpen} style={{ ...rowButtonStyle, marginBottom: spacing.sm }}>
        <span>Reserved for bills</span>
        <strong>{fmt(b.reservedCents)} {reservedOpen ? "▾" : "▸"}</strong>
      </button>
      {reservedOpen && (
        <ul style={listStyle}>
          {b.reserved.length === 0 && <li style={mutedStyle}>Nothing due before your next income.</li>}
          {b.reserved.map((r) => (
            <li key={`${r.billId}-${r.dueDate}`} style={rowStyle}>
              <span style={{ flex: 1 }}>{r.name}</span>
              <span style={{ opacity: 0.75 }}>{r.dueDate}</span>
              <strong>{fmt(r.amountCents)}</strong>
            </li>
          ))}
        </ul>
      )}

      {goalRows.length > 0 && (
        <section style={{ marginBottom: spacing.md }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>🎯 Goals</div>
          <ul style={listStyle}>
            {goalRows.map((r) => (
              <li key={`goal-${r.id}`} style={rowStyle}>
                <span aria-hidden="true">{r.icon}</span>
                <span style={{ flex: 1 }}>{r.label}</span>
                <span>{r.fillPct != null ? `${Math.round(r.fillPct * 100)}%` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {msg && <div style={{ marginBottom: spacing.sm, opacity: 0.85 }}>{msg}</div>}

      <BalanceEditor
        current={b.balanceCents}
        onSet={async (c) => {
          await setBalance(c);
          didWork();
          await refresh();
        }}
      />
      <div style={{ height: spacing.sm }} />
      <AddMoney
        onDone={async (kind, ok) => {
          setMsg(ok ? `${kind} added` : "Couldn't save");
          if (ok) didWork();
          await refresh();
        }}
      />

      <section style={{ marginTop: spacing.md }}>
        <h4 style={{ margin: "0 0 6px" }}>Upcoming bills</h4>
        {sum.upcoming.length === 0 && <p style={mutedStyle}>No upcoming bills. Add your recurring bills below.</p>}
        <ul style={listStyle}>
          {sum.upcoming.map((o) => (
            <li key={o.id} style={rowStyle}>
              <span style={{ flex: 1 }}>{o.name}</span>
              <span style={{ opacity: 0.75 }}>{o.dueDate}</span>
              <strong>{fmt(o.amountCents)}</strong>
              <button
                type="button"
                style={actionButtonStyle(false)}
                onClick={async () => {
                  await markOccurrencePaid(o.id);
                  didWork();
                  await refresh();
                }}
              >
                Paid
              </button>
            </li>
          ))}
        </ul>
        <BillManager
          onChanged={async () => {
            didWork();
            await refresh();
          }}
        />
      </section>

      <AffordCalculator />

      <History
        onChanged={async () => {
          didWork();
          await refresh();
        }}
      />
    </OverlayShell>
  );
}

const listStyle: CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
const rowStyle: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` };
const mutedStyle: CSSProperties = { opacity: 0.65, margin: "4px 0" };
const rowButtonStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  background: "transparent",
  color: color.textBody,
  border: "none",
  borderBottom: `1px solid ${color.divider}`,
  padding: "6px 0",
  fontFamily: "monospace",
  fontSize: 13,
  cursor: "pointer",
};

// ---- Balance quick-set ----
function BalanceEditor({ current, onSet }: { current: number; onSet: (cents: number) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        style={actionButtonStyle(false)}
        onClick={() => {
          setVal((current / 100).toFixed(2));
          setOpen(true);
        }}
      >
        Set balance
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input style={{ ...fieldStyle, flex: 1 }} inputMode="decimal" placeholder="0.00" value={val} onChange={(e) => setVal(e.target.value)} aria-label="Current balance in dollars" />
      <button
        type="button"
        style={actionButtonStyle(false)}
        onClick={() => {
          const c = toCents(val);
          if (c != null) onSet(c);
          setOpen(false);
        }}
      >
        Save
      </button>
      <button type="button" style={actionButtonStyle(false)} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

// ---- Add income / expense ----
function AddMoney({ onDone }: { onDone: (kind: string, ok: boolean) => void }) {
  const [mode, setMode] = useState<"income" | "expense" | null>(null);
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(today());

  const submit = async () => {
    const c = toCents(amount);
    if (c == null || c <= 0) {
      onDone("Entry", false);
      return;
    }
    if (mode === "income") {
      const r = await addIncome({ date, netCents: c, platform: label.trim() || undefined });
      onDone("Income", !!r);
    } else {
      const r = await addExpense({ date, amountCents: c, category: label || "misc", direction: "out" });
      onDone("Expense", !!r);
    }
    setMode(null);
    setAmount("");
    setLabel("");
  };

  if (!mode) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={actionButtonStyle(false)} onClick={() => setMode("income")}>
          ＋ Income
        </button>
        <button type="button" style={actionButtonStyle(false)} onClick={() => setMode("expense")}>
          － Expense
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{mode === "income" ? "Add income" : "Add expense"}</div>
      <input style={fieldStyle} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in dollars" />
      <input
        style={fieldStyle}
        placeholder={mode === "expense" ? "Category (e.g. food)" : "Platform (e.g. paycheck)"}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input style={fieldStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={actionButtonStyle(false)} onClick={submit}>
          Save
        </button>
        <button type="button" style={actionButtonStyle(false)} onClick={() => setMode(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Recurring bill manager ----
function BillManager({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [bills, setBills] = useState<FinBill[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<BillFrequency>("monthly");
  const [anchor, setAnchor] = useState(today());

  const load = async () => setBills((await listBills()) ?? []);
  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const add = async () => {
    const c = toCents(amount);
    if (!name.trim() || c == null || c <= 0) return;
    await createBill({ name: name.trim(), amountCents: c, frequency: freq, anchorDate: anchor });
    setName("");
    setAmount("");
    await load();
    onChanged();
  };

  return (
    <div style={{ marginTop: spacing.sm }}>
      <button type="button" style={actionButtonStyle(false)} onClick={() => setOpen((v) => !v)}>
        {open ? "Done managing bills" : "Manage recurring bills"}
      </button>
      {open && (
        <div style={{ marginTop: spacing.sm }}>
          <ul style={listStyle}>
            {bills.map((bl) => (
              <li key={bl.id} style={rowStyle}>
                <span style={{ flex: 1 }}>{bl.name}</span>
                <span style={{ opacity: 0.7 }}>{bl.frequency}</span>
                <strong>{fmt(bl.amountCents)}</strong>
                <ConfirmButton
                  label="Remove"
                  ariaLabel={`Remove bill ${bl.name}`}
                  onConfirm={async () => {
                    await deleteBill(bl.id);
                    await load();
                    onChanged();
                  }}
                />
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: spacing.sm }}>
            <div style={{ fontWeight: 700 }}>Add a bill (once)</div>
            <input style={fieldStyle} placeholder="Name (e.g. Rent)" value={name} onChange={(e) => setName(e.target.value)} />
            <input style={fieldStyle} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Bill amount in dollars" />
            <select style={fieldStyle} value={freq} onChange={(e) => setFreq(e.target.value as BillFrequency)} aria-label="Frequency">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
            <input style={fieldStyle} type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} aria-label="First due date" />
            <button type="button" style={actionButtonStyle(false)} onClick={add}>
              Add bill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- "What can I afford?" ----
function AffordCalculator() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState<{ weeks: number | null } | "error" | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    const targetCents = toCents(amount);
    if (targetCents == null || targetCents <= 0) return;
    const extraCents = extra ? toCents(extra) : 0;
    setBusy(true);
    const r = await getAfford(targetCents, extraCents && extraCents > 0 ? extraCents : 0);
    setResult(r ? { weeks: r.weeks } : "error");
    setBusy(false);
  };

  return (
    <section style={{ marginTop: spacing.md }}>
      <button type="button" style={actionButtonStyle(false)} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "🧮 What can I afford?"}
      </button>
      {open && (
        <div style={{ marginTop: spacing.sm }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={fieldStyle} inputMode="decimal" placeholder="Amount (e.g. 400)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Target amount in dollars" />
            <input style={fieldStyle} inputMode="decimal" placeholder="Extra $/week" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Extra income per week in dollars" />
            <button type="button" style={actionButtonStyle(busy || !amount)} disabled={busy || !amount} onClick={check}>
              {busy ? "…" : "Check"}
            </button>
          </div>
          {result === "error" && <p style={mutedStyle}>Couldn't reach the budget (offline?). Try again.</p>}
          {result && result !== "error" && (
            result.weeks == null ? (
              <p style={mutedStyle}>You're not currently saving toward this — earning more or cutting a bill would change that.</p>
            ) : (
              <p>
                <strong>~{result.weeks} week{result.weeks === 1 ? "" : "s"}</strong> at your current pace.
              </p>
            )
          )}
        </div>
      )}
    </section>
  );
}

// ---- History: recent income + expenses, each editable + deletable ----
interface TxnRow { kind: "income" | "expense"; id: number; date: string; cents: number; label: string; category?: string }

function History({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [editing, setEditing] = useState<TxnRow | null>(null);

  const load = async () => {
    const [inc, exp] = await Promise.all([listIncome(), listExpense()]);
    const merged: TxnRow[] = [
      ...(inc ?? []).map((i: FinIncome): TxnRow => ({ kind: "income", id: i.id, date: i.date, cents: i.netCents, label: i.platform ?? "" })),
      ...(exp ?? []).map((e: FinExpense): TxnRow => ({ kind: "expense", id: e.id, date: e.date, cents: e.amountCents, label: e.merchant ?? "", category: e.category })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    setRows(merged);
  };
  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const del = async (row: TxnRow) => {
    if (row.kind === "income") await deleteIncome(row.id);
    else await deleteExpense(row.id);
    await load();
    onChanged();
  };
  const save = async (row: TxnRow, amount: string, label: string, date: string, category: string) => {
    const c = toCents(amount);
    if (c == null || c <= 0) return;
    if (row.kind === "income") await editIncome(row.id, { netCents: c, platform: label || null, date });
    else await editExpense(row.id, { amountCents: c, merchant: label || null, date, category: category || "misc" });
    setEditing(null);
    await load();
    onChanged();
  };

  return (
    <section style={{ marginTop: spacing.md }}>
      <button type="button" style={actionButtonStyle(false)} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide history" : "🧾 View / edit history"}
      </button>
      {open && (
        <ul style={{ ...listStyle, marginTop: spacing.sm }}>
          {rows.length === 0 && <li style={mutedStyle}>Nothing recorded yet.</li>}
          {rows.map((row) =>
            editing && editing.id === row.id && editing.kind === row.kind ? (
              <li key={`${row.kind}-${row.id}`} style={rowStyle}>
                <EditRow row={row} onSave={save} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={`${row.kind}-${row.id}`} style={rowStyle}>
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75 }}>{row.kind === "income" ? "IN" : "OUT"}</span>
                <span style={{ flex: 1 }}>{row.label || (row.category ?? "—")}</span>
                <span style={{ opacity: 0.7 }}>{row.date}</span>
                <strong>{fmt(row.cents)}</strong>
                <button type="button" style={actionButtonStyle(false)} aria-label="Edit" onClick={() => setEditing(row)}>
                  ✏️
                </button>
                <ConfirmButton label="🗑️" confirmLabel="Delete?" ariaLabel="Delete transaction" onConfirm={() => del(row)} />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function EditRow({
  row,
  onSave,
  onCancel,
}: {
  row: TxnRow;
  onSave: (r: TxnRow, amount: string, label: string, date: string, category: string) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState((row.cents / 100).toFixed(2));
  const [label, setLabel] = useState(row.label);
  const [date, setDate] = useState(row.date);
  const [category, setCategory] = useState(row.category ?? "");
  return (
    <>
      <input style={{ ...fieldStyle, width: 70 }} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
      <input style={{ ...fieldStyle, flex: 1 }} value={label} placeholder={row.kind === "income" ? "Platform" : "Merchant"} onChange={(e) => setLabel(e.target.value)} />
      {row.kind === "expense" && <input style={{ ...fieldStyle, width: 80 }} value={category} placeholder="Category" onChange={(e) => setCategory(e.target.value)} />}
      <input style={fieldStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <button type="button" style={actionButtonStyle(false)} aria-label="Save" onClick={() => onSave(row, amount, label, date, category)}>
        ✅
      </button>
      <button type="button" style={actionButtonStyle(false)} aria-label="Cancel" onClick={onCancel}>
        ✖️
      </button>
    </>
  );
}
