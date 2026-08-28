import { useEffect, useState } from "react";
import type { Journey, JourneyLinkSummary } from "@brain/shared";
import { getJourneys, createJourney, patchJourney, deleteJourney, journeyLinks } from "../api/journeys.js";

/**
 * Journeys (Vision 2.0) — the highest-level organizer: a life chapter everything can belong to
 * (Become an RN, Recover Financially, Buy My First Home…). This panel is the home for creating +
 * tending them; linking objects to a journey happens from those objects (a memory's inspector, a
 * transaction, etc.). Mobile-first. See docs/VISION_2_JOURNEYS.md.
 */

const SUGGESTED = [
  { title: "Recover Financially", icon: "💵" },
  { title: "Get Healthy", icon: "💪" },
  { title: "Build My Business", icon: "🚀" },
  { title: "Learn Something New", icon: "📚" },
];

export function JourneysPanel({ onFocus }: { onFocus?: (id: number) => void }) {
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("🧭");

  const refresh = async () => setJourneys(await getJourneys());
  useEffect(() => { void refresh(); }, []);

  const add = async (t: string, ic: string) => {
    if (!t.trim()) return;
    await createJourney({ title: t.trim(), icon: ic });
    setTitle(""); setAdding(false);
    await refresh();
  };

  if (!journeys) return <div className="jn-panel"><p className="jn-empty">Loading your journeys…</p></div>;

  const active = journeys.filter((j) => j.status !== "done");
  const done = journeys.filter((j) => j.status === "done");

  return (
    <div className="jn-panel">
      <div className="jn-intro">
        A <strong>Journey</strong> is a meaningful chapter of your life. Memories, money, tasks and goals
        all connect through it — so instead of "where do I save this?", the question becomes
        "<em>what Journey does this move forward?</em>"
      </div>

      {journeys.length === 0 && (
        <div className="jn-suggest">
          <div className="jn-empty">Start with one that fits your life right now:</div>
          <div className="jn-suggest-row">
            {SUGGESTED.map((s) => (
              <button key={s.title} className="jn-chip" onClick={() => add(s.title, s.icon)}>{s.icon} {s.title}</button>
            ))}
          </div>
        </div>
      )}

      {active.map((j) => <JourneyCard key={j.id} j={j} onChanged={refresh} onFocus={onFocus} />)}

      {adding ? (
        <div className="jn-form">
          <div className="jn-form-row">
            <input className="jn-icon-in" value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 2))} aria-label="Icon" />
            <input className="jn-title-in" placeholder="Name your journey (e.g. Become an RN)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Journey title" />
          </div>
          <div className="jn-form-actions">
            <button className="jn-primary" onClick={() => add(title, icon)}>Create</button>
            <button className="jn-secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="jn-primary jn-add" onClick={() => setAdding(true)}>＋ New Journey</button>
      )}

      {done.length > 0 && (
        <details className="jn-done">
          <summary>Completed ({done.length})</summary>
          {done.map((j) => <JourneyCard key={j.id} j={j} onChanged={refresh} onFocus={onFocus} />)}
        </details>
      )}
    </div>
  );
}

function JourneyCard({ j, onChanged, onFocus }: { j: Journey; onChanged: () => void; onFocus?: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<JourneyLinkSummary[] | null>(null);
  const pct = Math.round((j.progress ?? 0) * 100);

  useEffect(() => {
    if (open) void journeyLinks(j.id).then(setLinks);
  }, [open, j.id]);

  const setProgress = async (p: number) => { await patchJourney(j.id, { progress: Math.max(0, Math.min(1, p)) }); onChanged(); };
  const setStatus = async (status: "active" | "paused" | "done") => { await patchJourney(j.id, { status }); onChanged(); };

  return (
    <div className={`jn-card ${j.status}`}>
      <button className="jn-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="jn-icon">{j.icon ?? "🧭"}</span>
        <span className="jn-name">{j.title}</span>
        <span className="jn-links">{j.linkCount ?? 0} linked</span>
      </button>
      <div className="jn-bar" aria-label={`${pct}% progress`}><div className="jn-bar-fill" style={{ width: `${pct}%` }} /></div>
      {open && (
        <div className="jn-detail">
          {j.description && <p className="jn-desc">{j.description}</p>}
          <div className="jn-progress-row">
            <span>Progress</span>
            <input type="range" min={0} max={100} value={pct} onChange={(e) => void setProgress(Number(e.target.value) / 100)} aria-label="Progress" />
            <strong>{pct}%</strong>
          </div>
          <div className="jn-detail-actions">
            {j.status !== "done" ? (
              <button className="jn-secondary" onClick={() => void setStatus("done")}>Mark complete</button>
            ) : (
              <button className="jn-secondary" onClick={() => void setStatus("active")}>Reopen</button>
            )}
            {j.status === "active" ? (
              <button className="jn-secondary" onClick={() => void setStatus("paused")}>Pause</button>
            ) : j.status === "paused" ? (
              <button className="jn-secondary" onClick={() => void setStatus("active")}>Resume</button>
            ) : null}
            <button className="jn-danger" onClick={async () => { if (confirm(`Delete "${j.title}"? Its links are removed (the memories/items stay).`)) { await deleteJourney(j.id); onChanged(); } }}>Delete</button>
          </div>
          <JourneyLinksSection links={links} onFocus={onFocus} />
        </div>
      )}
    </div>
  );
}

const fmt = (cents: number): string => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });

/** Everything linked to a Journey — memories/tasks with fly-to, transactions with a
 *  running +earned/-spent total. A linked bill shows as a separate note rather than
 *  folding into the total: it's a recurring schedule, not a dated transaction. */
function JourneyLinksSection({ links, onFocus }: { links: JourneyLinkSummary[] | null; onFocus?: (id: number) => void }) {
  if (links === null) return <p className="jn-hint">Loading what's linked…</p>;
  if (links.length === 0) {
    return <p className="jn-hint">Nothing linked yet — connect a memory, task, or transaction from where you're already working.</p>;
  }
  const memories = links.filter((l) => l.kind === "node" || l.kind === "insight" || l.kind === "doc");
  const income = links.filter((l) => l.kind === "income");
  const expense = links.filter((l) => l.kind === "expense");
  const bills = links.filter((l) => l.kind === "bill");
  const earned = income.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const spent = expense.reduce((sum, l) => sum + (l.amount ?? 0), 0);

  return (
    <div className="jn-links">
      {memories.length > 0 && (
        <div className="jn-links-group">
          <div className="jn-links-label">🧭 Memories &amp; Tasks</div>
          {memories.map((l) => (
            <button key={`${l.kind}-${l.refId}`} className="jn-link-row" onClick={() => onFocus?.(l.refId)} title="Find it in the galaxy">
              {l.label}
            </button>
          ))}
        </div>
      )}
      {(income.length > 0 || expense.length > 0) && (
        <div className="jn-links-group">
          <div className="jn-links-label">💵 Transactions</div>
          {[...income, ...expense].map((l) => (
            <div key={`${l.kind}-${l.refId}`} className="jn-link-row jn-link-txn">
              <span>{l.label}</span>
              <strong className={l.kind === "income" ? "jn-earn" : "jn-spend"}>
                {l.kind === "income" ? "+" : "-"}{fmt(l.amount ?? 0)}
              </strong>
            </div>
          ))}
          <div className="jn-links-total">
            <strong className="jn-earn">+{fmt(earned)} earned</strong> · <strong className="jn-spend">-{fmt(spent)} spent</strong>
          </div>
        </div>
      )}
      {bills.length > 0 && (
        <div className="jn-links-note">📅 {bills.length} recurring bill{bills.length !== 1 ? "s" : ""} linked</div>
      )}
    </div>
  );
}
