import { useEffect, useState } from "react";
import type { FinGoalWithProgress, WealthSummary } from "@brain/shared";
import {
  getWealthSummary, createBucket, patchBucket, archiveBucket,
  createGoal, archiveGoal, listAllocations, allocate,
} from "../api/finance.js";
import type { FinAllocation } from "@brain/shared";

const fmt = (cents: number): string => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * The Wealth surface (docs/specs/wealth-goals-allocation.md): what the user is intentionally
 * BUILDING with their money, layered on top of Money's own "what's happening right now."
 * Deliberately vocabulary-disciplined throughout — "allocate"/"earmarked"/"pledged", never
 * "saved"/"balance"/"deposited"/"invested" — because nothing here is a real money transfer.
 *
 * Renders identically whether embedded (default) or wrapped in a full-screen overlay by the
 * parent — this component has no knowledge of which mode it's in.
 */
export function WealthPanel() {
  const [summary, setSummary] = useState<WealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [newBucketName, setNewBucketName] = useState("");
  const [expandedBucket, setExpandedBucket] = useState<number | null>(null);

  const refresh = async () => {
    setSummary(await getWealthSummary());
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // Deployable depends on Safe-to-Spend too — a plain Money change (spending, a bill paid)
    // can flip Reconciliation even when nothing in Wealth's own data changed.
    const onChanged = () => void refresh();
    window.addEventListener("brain-finance-changed", onChanged);
    return () => window.removeEventListener("brain-finance-changed", onChanged);
  }, []);

  async function addBucket() {
    const name = newBucketName.trim();
    if (!name) return;
    setNewBucketName("");
    await createBucket({ name });
    await refresh();
  }

  if (loading && !summary) return <p className="fin-muted">Loading your Wealth…</p>;
  if (!summary) return <p className="fin-empty">Couldn't reach Wealth (offline?). Try again.</p>;

  return (
    <div className="wealth-panel">
      <div className={`wealth-deployable ${summary.reconciliation === "over_committed" ? "over" : ""}`}>
        <div className="fin-hero-label">Deployable</div>
        <div className="wealth-deployable-amount">{fmt(summary.deployableCents)}</div>
        <p className="fin-muted" style={{ margin: "2px 0 0" }}>
          Safe-to-Spend minus what you've already earmarked toward goals.
        </p>
        {summary.reconciliation === "over_committed" && (
          <p className="wealth-warning" role="status">
            ⚠️ Your current financial position is below the amount you've earmarked toward goals by{" "}
            {fmt(-summary.deployableCents)}. Nothing was changed automatically — you decide what, if
            anything, to withdraw.
          </p>
        )}
      </div>

      {summary.buckets.length === 0 && (
        <p className="fin-muted">No buckets yet — start with one that fits what you're building (Emergency, Retirement, a big purchase…).</p>
      )}

      <ul className="wealth-buckets">
        {summary.buckets.map((b) => {
          const goals = summary.goals.filter((g) => g.bucketId === b.id);
          const open = expandedBucket === b.id;
          return (
            <li key={b.id} className="wealth-bucket">
              <button className="wealth-bucket-head" onClick={() => setExpandedBucket(open ? null : b.id)} aria-expanded={open}>
                <span className="wealth-bucket-name">{b.name}</span>
                <span className="fin-muted">{goals.length} goal{goals.length === 1 ? "" : "s"}</span>
                <span>{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="wealth-bucket-body">
                  {goals.length === 0 && <p className="fin-muted">No goals in this bucket yet.</p>}
                  {goals.map((g) => (
                    <GoalCard key={g.id} goal={g} deployableCents={summary.deployableCents} onChanged={refresh} />
                  ))}
                  <NewGoalForm bucketId={b.id} onCreated={refresh} />
                  <div className="wealth-bucket-actions">
                    <button
                      className="fin-mini"
                      onClick={async () => {
                        const name = prompt("Rename bucket", b.name);
                        if (!name || !name.trim()) return;
                        await patchBucket(b.id, { name: name.trim() });
                        await refresh();
                      }}
                    >
                      ✏️ Rename
                    </button>
                    <button
                      className="fin-mini"
                      onClick={async () => {
                        if (!confirm(`Archive "${b.name}"? Its goals stay, just tucked away.`)) return;
                        await archiveBucket(b.id);
                        setExpandedBucket(null);
                        await refresh();
                      }}
                    >
                      📥 Archive
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="wealth-new-bucket">
        <input
          className="list-filter"
          value={newBucketName}
          maxLength={80}
          placeholder="New bucket name (e.g. Trucking, Retirement)…"
          onChange={(e) => setNewBucketName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addBucket()}
        />
        <button className="fin-secondary" disabled={!newBucketName.trim()} onClick={() => void addBucket()}>
          ➕ New bucket
        </button>
      </div>
    </div>
  );
}

function NewGoalForm({ bucketId, onCreated }: { bucketId: number; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const targetCents = target.trim() ? Math.round(parseFloat(target) * 100) : null;
    setName("");
    setTarget("");
    await createGoal({ bucketId, name: trimmed, targetCents: Number.isFinite(targetCents) ? targetCents : null });
    await onCreated();
  }

  return (
    <div className="wealth-new-goal">
      <input className="list-filter" value={name} maxLength={120} placeholder="New goal (e.g. First Truck Down Payment)…" onChange={(e) => setName(e.target.value)} />
      <input className="list-filter" value={target} placeholder="Target $ (optional)" inputMode="decimal" onChange={(e) => setTarget(e.target.value)} style={{ maxWidth: "140px" }} />
      <button className="fin-mini" disabled={!name.trim()} onClick={() => void submit()}>
        ➕ Add goal
      </button>
    </div>
  );
}

function GoalCard({
  goal,
  deployableCents,
  onChanged,
}: {
  goal: FinGoalWithProgress;
  deployableCents: number;
  onChanged: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<FinAllocation[] | null>(null);

  async function submit(sign: 1 | -1) {
    const raw = parseFloat(amount);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const amountCents = Math.round(raw * 100) * sign;
    // Point-of-action warning (docs/specs/wealth-goals-allocation.md §3/§9): a courtesy, not a
    // block — the write still succeeds either way. Only checked for an ALLOCATE (sign > 0);
    // withdrawing only ever increases Deployable, so it never needs this warning.
    if (sign > 0 && amountCents > deployableCents) {
      const over = amountCents - deployableCents;
      if (!confirm(`This would put you ${fmt(over)} past what's currently deployable. Allocate anyway?`)) return;
    }
    setBusy(true);
    const result = await allocate(goal.id, amountCents);
    setBusy(false);
    if (!result) {
      alert(sign < 0 ? "That withdrawal would take this goal's total below zero." : "Couldn't save that allocation — try again.");
      return;
    }
    setAmount("");
    if (showHistory) setHistory(await listAllocations(goal.id));
    await onChanged();
  }

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) setHistory(await listAllocations(goal.id));
  }

  return (
    <div className="wealth-goal">
      <div className="wealth-goal-head">
        <strong>{goal.name}</strong>
        {goal.targetDate && <span className="fin-muted">by {goal.targetDate}</span>}
      </div>
      {goal.fillPct != null ? (
        <div className="wealth-progress-track" role="progressbar" aria-valuenow={Math.round(goal.fillPct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="wealth-progress-fill" style={{ width: `${Math.round(goal.fillPct * 100)}%` }} />
        </div>
      ) : null}
      <div className="wealth-goal-amounts">
        <span>{fmt(goal.totalCents)}{goal.targetCents ? ` of ${fmt(goal.targetCents)}` : " allocated (open-ended)"}</span>
        {goal.state === "goal_reached" && <span className="wealth-reached">✦ Reached</span>}
      </div>
      <div className="wealth-goal-controls">
        <input
          className="list-filter"
          value={amount}
          placeholder="Amount $"
          inputMode="decimal"
          disabled={busy}
          onChange={(e) => setAmount(e.target.value)}
          style={{ maxWidth: "110px" }}
        />
        <button className="fin-mini" disabled={busy || !amount.trim()} onClick={() => void submit(1)}>+ Allocate</button>
        <button className="fin-mini" disabled={busy || !amount.trim()} onClick={() => void submit(-1)}>− Withdraw</button>
        <button className="fin-mini" onClick={() => void toggleHistory()}>{showHistory ? "Hide" : "History"}</button>
        <button
          className="fin-mini"
          onClick={async () => {
            if (!confirm(`Archive "${goal.name}"? Its history stays, just tucked away.`)) return;
            await archiveGoal(goal.id);
            await onChanged();
          }}
        >
          📥
        </button>
      </div>
      {showHistory && (
        <ul className="wealth-history">
          {history === null && <li className="fin-muted">Loading…</li>}
          {history !== null && history.length === 0 && <li className="fin-muted">No allocations yet.</li>}
          {history?.map((a) => (
            <li key={a.id}>
              <span className={a.amountCents >= 0 ? "wealth-in" : "wealth-out"}>{a.amountCents >= 0 ? "+" : ""}{fmt(a.amountCents)}</span>
              <span className="fin-muted">{a.createdAt.slice(0, 10)}</span>
              {a.note && <span className="fin-muted">— {a.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
