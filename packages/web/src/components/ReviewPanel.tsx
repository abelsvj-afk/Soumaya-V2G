import { useEffect, useState } from "react";
import { getDueReviews, gradeReview, type DueReview } from "../api/client.js";

/**
 * Active recall (NEURO_ALIGNMENT #1) — "memory is made by retrieval, not storage".
 * Soumaya surfaces memories that have decayed to their spaced-repetition point and
 * asks you to RECALL them before revealing. You self-grade (remembered / forgot);
 * SM-2 reschedules server-side. A gentle, few-at-a-time session — not an Anki drill.
 */
export function ReviewPanel({ onClose, onFocus }: { onClose: () => void; onFocus?: (id: number) => void }) {
  const [due, setDue] = useState<DueReview[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    void getDueReviews().then((d) => setDue(d));
  }, []);

  const current = due && idx < due.length ? due[idx] : null;

  const grade = async (remembered: boolean) => {
    if (!current) return;
    await gradeReview(current.id, remembered);
    setDone((n) => n + 1);
    setRevealed(false);
    setIdx((i) => i + 1);
  };

  return (
    <div className="review-overlay">
      <div className="review-card">
        <button className="rv-x" onClick={onClose} aria-label="Close">×</button>
        <div className="rv-head">
          <span className="rv-glyph">🧠</span>
          <div>
            <div className="rv-title">Recall session</div>
            <div className="rv-sub">Retrieval, not re-reading — try to remember before you open it.</div>
          </div>
        </div>

        {due === null && <div className="rv-empty">Finding memories ready to revisit…</div>}

        {due && due.length === 0 && (
          <div className="rv-empty">
            <p>Nothing due right now — your memories are fresh. 🌟</p>
            <p className="rv-empty-sub">Soumaya will resurface them as they gently fade.</p>
          </div>
        )}

        {due && due.length > 0 && !current && (
          <div className="rv-empty">
            <p>Session complete — you revisited {done} memor{done === 1 ? "y" : "ies"}. ✨</p>
            <button className="rv-btn primary" onClick={onClose}>Done</button>
          </div>
        )}

        {current && (
          <div className="rv-body">
            <div className="rv-progress">{idx + 1} / {due!.length}</div>
            <div className="rv-prompt">Do you remember this one?</div>
            <button className="rv-label" onClick={() => current && onFocus?.(current.id)} title="Find it in the galaxy">
              {current.label}
            </button>
            {!revealed ? (
              <button className="rv-btn reveal" onClick={() => setRevealed(true)}>Reveal & rate my recall</button>
            ) : (
              <div className="rv-grade">
                <button className="rv-btn forgot" onClick={() => void grade(false)}>Forgot</button>
                <button className="rv-btn primary" onClick={() => void grade(true)}>I remembered</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
