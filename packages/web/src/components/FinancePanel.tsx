import { useEffect, useState } from "react";
import type { FinBill, BillFrequency } from "@brain/shared";
import {
  getFinanceSummary, setBalance, addIncome, addExpense, createBill, deleteBill, markOccurrencePaid,
  type FinanceSummary,
} from "../api/finance.js";

/**
 * Financial OS — Stage 1a UI (mobile-first). The hero is "Safe to Spend", kept honest by the
 * deterministic Budget Engine on the server. Zero-AI: manual entry + bills. Money is cents on
 * the wire; dollars in the inputs. A shortfall is shown with icon + label + number (never
 * colour alone). See docs/financial-os/ux-design.md.
 */

const fmt = (cents: number): string =>
  (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtc = (cents: number): string =>
  (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
/** Parse a dollar string to integer cents; NaN → null. */
const toCents = (s: string): number | null => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const today = (): string => new Date().toISOString().slice(0, 10);

export function FinancePanel({ demo }: { demo?: boolean }) {
  const [sum, setSum] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reservedOpen, setReservedOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setSum(await getFinanceSummary());
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  if (demo) return <div className="fin-panel"><p className="fin-empty">Money is off in the demo galaxy — sign in to track your budget.</p></div>;
  if (loading && !sum) return <div className="fin-panel"><p className="fin-empty">Loading your budget…</p></div>;
  if (!sum) return <div className="fin-panel"><p className="fin-empty">Couldn't reach the budget (offline?). Try again.</p></div>;

  const b = sum.budget;

  return (
    <div className="fin-panel">
      {/* ---- Hero: Safe to Spend ---- */}
      <section className="fin-hero">
        <div className="fin-hero-label">Safe to Spend</div>
        <div className="fin-hero-amount">{fmt(b.safeToSpendCents)}</div>
        {b.shortfallCents > 0 && (
          <div className="fin-shortfall" role="status">
            <span aria-hidden>⚠️</span> Short by {fmtc(b.shortfallCents)} before {b.nextIncomeDate}
          </div>
        )}
      </section>

      <div className="fin-row2">
        <div className="fin-stat"><span>Earned this week</span><strong>{fmt(b.weekEarnedCents)}</strong></div>
        <div className="fin-stat"><span>Balance</span><strong>{fmt(b.balanceCents)}</strong></div>
      </div>

      {/* ---- Reserved (collapsible, itemized) ---- */}
      <button className="fin-reserved-head" onClick={() => setReservedOpen((v) => !v)} aria-expanded={reservedOpen}>
        <span>Reserved for bills</span>
        <strong>{fmt(b.reservedCents)} {reservedOpen ? "▾" : "▸"}</strong>
      </button>
      {reservedOpen && (
        <ul className="fin-reserved-list">
          {b.reserved.length === 0 && <li className="fin-muted">Nothing due before your next income.</li>}
          {b.reserved.map((r) => (
            <li key={`${r.billId}-${r.dueDate}`}><span>{r.name}</span><span>{r.dueDate}</span><strong>{fmt(r.amountCents)}</strong></li>
          ))}
        </ul>
      )}

      {msg && <div className="fin-msg">{msg}</div>}

      {/* ---- Quick actions ---- */}
      <BalanceEditor current={b.balanceCents} onSet={async (c) => { await setBalance(c); await refresh(); }} />
      <AddMoney onDone={async (kind, ok, dup) => { setMsg(ok ? `${kind} added${dup ? " (looks like a duplicate)" : ""}` : "Couldn't save"); await refresh(); }} />

      {/* ---- Upcoming bills ---- */}
      <section className="fin-bills">
        <h4>Upcoming bills</h4>
        {sum.upcoming.length === 0 && <p className="fin-muted">No upcoming bills. Add your recurring bills once below.</p>}
        <ul className="fin-bill-occ">
          {sum.upcoming.map((o) => (
            <li key={o.id}>
              <span className="fin-bill-name">{o.name}</span>
              <span className="fin-bill-due">{o.dueDate}</span>
              <strong>{fmt(o.amountCents)}</strong>
              <button className="fin-paid" onClick={async () => { await markOccurrencePaid(o.id); await refresh(); }}>Paid</button>
            </li>
          ))}
        </ul>
        <BillManager onChanged={refresh} />
      </section>
    </div>
  );
}

// ---- Balance quick-set ----
function BalanceEditor({ current, onSet }: { current: number; onSet: (cents: number) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  return (
    <div className="fin-balance-edit">
      {!open ? (
        <button className="fin-secondary" onClick={() => { setVal((current / 100).toFixed(2)); setOpen(true); }}>Set balance</button>
      ) : (
        <div className="fin-inline-form">
          <input inputMode="decimal" placeholder="0.00" value={val} onChange={(e) => setVal(e.target.value)} aria-label="Current balance in dollars" />
          <button onClick={() => { const c = toCents(val); if (c != null) onSet(c); setOpen(false); }}>Save</button>
          <button className="fin-secondary" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ---- Add income / expense (manual, Stage 1a) ----
function AddMoney({ onDone }: { onDone: (kind: string, ok: boolean, dup: boolean) => void }) {
  const [mode, setMode] = useState<"income" | "expense" | null>(null);
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(today());

  const submit = async () => {
    const c = toCents(amount);
    if (c == null || c <= 0) { onDone("Entry", false, false); return; }
    if (mode === "income") {
      const r = await addIncome({ date, netCents: c, platform: label || undefined });
      onDone("Income", !!r, !!r?.duplicate);
    } else {
      const r = await addExpense({ date, amountCents: c, category: label || "misc", direction: "out" });
      onDone("Expense", !!r, !!r?.duplicate);
    }
    setMode(null); setAmount(""); setLabel("");
  };

  if (!mode) return (
    <div className="fin-add-row">
      <button className="fin-primary" onClick={() => setMode("income")}>＋ Income</button>
      <button className="fin-primary" onClick={() => setMode("expense")}>－ Expense</button>
    </div>
  );
  return (
    <div className="fin-form">
      <div className="fin-form-title">{mode === "income" ? "Add income" : "Add expense"}</div>
      <input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in dollars" />
      <input placeholder={mode === "income" ? "Platform (e.g. GoPuff)" : "Category (e.g. food)"} value={label} onChange={(e) => setLabel(e.target.value)} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <div className="fin-form-actions">
        <button className="fin-primary" onClick={submit}>Save</button>
        <button className="fin-secondary" onClick={() => setMode(null)}>Cancel</button>
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

  const load = async () => {
    const list = await (await import("../api/finance.js")).listBills();
    setBills(list ?? []);
  };
  useEffect(() => { if (open) void load(); }, [open]);

  const add = async () => {
    const c = toCents(amount);
    if (!name.trim() || c == null || c <= 0) return;
    await createBill({ name: name.trim(), amountCents: c, frequency: freq, anchorDate: anchor });
    setName(""); setAmount("");
    await load(); onChanged();
  };

  return (
    <div className="fin-bill-manager">
      <button className="fin-secondary" onClick={() => setOpen((v) => !v)}>{open ? "Done managing bills" : "Manage recurring bills"}</button>
      {open && (
        <div className="fin-bill-edit">
          <ul className="fin-bill-list">
            {bills.map((bl) => (
              <li key={bl.id}>
                <span>{bl.name}</span><span className="fin-muted">{bl.frequency}</span><strong>{fmt(bl.amountCents)}</strong>
                <button className="fin-secondary" onClick={async () => { await deleteBill(bl.id); await load(); onChanged(); }}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="fin-form">
            <div className="fin-form-title">Add a bill (once)</div>
            <input placeholder="Name (e.g. Rent)" value={name} onChange={(e) => setName(e.target.value)} />
            <input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Bill amount in dollars" />
            <select value={freq} onChange={(e) => setFreq(e.target.value as BillFrequency)} aria-label="Frequency">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} aria-label="First due date" />
            <div className="fin-form-actions"><button className="fin-primary" onClick={add}>Add bill</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
