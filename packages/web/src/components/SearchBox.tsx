import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { searchDetailed, type SearchHit } from "../api/client.js";

interface Props {
  onFocus: (id: number) => void;
  onClose?: () => void;
}

export function SearchBox({ onFocus, onClose }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A slow first search resolving after a faster second one used to let the
  // stale response silently overwrite the newer results.
  const requestSeq = useRef(0);

  async function run(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    const { hits: found, error: err } = await searchDetailed(query);
    if (seq !== requestSeq.current) return; // a newer search has already superseded this one
    setBusy(false);
    setHits(found);
    setError(err ?? null);
    setOpen(true);
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose?.();
  };

  return (
    <div className="panel search" onKeyDown={onKeyDown} role="search">
      <form onSubmit={run}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your mind…"
          aria-label="Search your mind"
        />
        {onClose && (
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </form>
      {busy && <p className="empty">Searching…</p>}
      {!busy && open && (
        <ul className="results" aria-live="polite">
          {error && <li className="empty">⚠️ {error}</li>}
          {!error && hits.length === 0 && <li className="empty">No matches.</li>}
          {!error &&
            hits.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => {
                    onFocus(h.id);
                    setOpen(false);
                  }}
                >
                  {h.label}
                  <em>{typeof h.similarity === "number" ? `${(h.similarity * 100).toFixed(0)}%` : ""}</em>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
