import { useMemo } from "react";
import type { GraphNode } from "@brain/shared";
import { deleteNode } from "../api/client.js";

interface Props {
  nodes: GraphNode[];
  onFocus: (id: number) => void;
  /** Called after an action is cleared so the galaxy + fuel refresh. */
  onChanged?: () => void;
  /** Demo galaxy has no backend — hide the destructive "Done" there. */
  readOnly?: boolean;
}

/** Parse a SQLite/ISO timestamp tolerantly → ms, or NaN. */
function ms(raw?: string): number {
  if (!raw) return NaN;
  const iso = raw.includes("Z") || raw.includes("+") ? raw : raw.replace(" ", "T") + "Z";
  return Date.parse(iso);
}

/** "in 5h" / "in 3d" / "overdue" from a future-ish timestamp. */
function countdown(target: number): { text: string; urgent: boolean; over: boolean } {
  const diff = target - Date.now();
  if (Number.isNaN(target)) return { text: "", urgent: false, over: false };
  if (diff <= 0) return { text: "overdue", urgent: true, over: true };
  const h = diff / 3.6e6;
  if (h < 1) return { text: `in ${Math.max(1, Math.round(diff / 6e4))}m`, urgent: true, over: false };
  if (h < 24) return { text: `in ${Math.round(h)}h`, urgent: h < 6, over: false };
  return { text: `in ${Math.round(h / 24)}d`, urgent: false, over: false };
}

/**
 * The agenda: day-to-day action items (kind="action", which expire) up top, then
 * upcoming reminders set on real memories (remind_at). Both are time-driven, so
 * they live together here instead of being scattered as tiny bodies in the galaxy.
 */
export function ActionsPanel({ nodes, onFocus, onChanged, readOnly }: Props) {
  const actions = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === "action")
        .map((n) => ({ n, due: ms(n.expiresAt) }))
        .sort((a, b) => (a.due || Infinity) - (b.due || Infinity)),
    [nodes],
  );
  const reminders = useMemo(
    () =>
      nodes
        .filter((n) => n.kind !== "action" && n.remindAt && ms(n.remindAt) > Date.now())
        .map((n) => ({ n, at: ms(n.remindAt) }))
        .sort((a, b) => a.at - b.at),
    [nodes],
  );

  const done = (id: number) => {
    deleteNode(id)
      .then(() => onChanged?.())
      .catch(() => {});
  };

  if (actions.length === 0 && reminders.length === 0) {
    return (
      <p className="empty">
        No action items or reminders. Add a thought and tick "📌 Action item", or set a reminder
        when you log a memory.
      </p>
    );
  }

  return (
    <div className="dock-body">
      <h3 className="agenda-h">📌 Action items {actions.length > 0 && `(${actions.length})`}</h3>
      {actions.length === 0 ? (
        <p className="empty small">Nothing due — you're clear.</p>
      ) : (
        <ul className="agenda-list">
          {actions.map(({ n, due }) => {
            const c = countdown(due);
            return (
              <li key={n.id} className={c.over ? "over" : ""}>
                <button className="agenda-main" onClick={() => onFocus(n.id)} title="Fly to it">
                  <span className="agenda-label">{n.label}</span>
                  {c.text && <span className={`agenda-due ${c.urgent ? "urgent" : ""}`}>⏰ {c.text}</span>}
                </button>
                {!readOnly && (
                  <button className="mini agenda-done" onClick={() => done(n.id)} title="Mark done (+fuel)">
                    ✓
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {reminders.length > 0 && (
        <>
          <h3 className="agenda-h">⏰ Upcoming reminders ({reminders.length})</h3>
          <ul className="agenda-list">
            {reminders.map(({ n, at }) => (
              <li key={n.id}>
                <button className="agenda-main" onClick={() => onFocus(n.id)} title="Fly to it">
                  <span className="agenda-label">{n.label}</span>
                  <span className="agenda-due">{countdown(at).text}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
