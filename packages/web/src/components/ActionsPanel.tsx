import { useMemo, useState } from "react";
import { type GraphNode, EARN_ACTION_DONE, ACTION_DONE_MIN_AGE_MINUTES } from "@brain/shared";
import { deleteNode, ackReminder } from "../api/client.js";
import { pushToast } from "./Toasts.js";
import { isReminderDue, parseTolerantMs as ms } from "../utils/dueReminders.js";

interface Props {
  nodes: GraphNode[];
  onFocus: (id: number) => void;
  /** Called after an action is cleared so the galaxy + fuel refresh. */
  onChanged?: () => void;
  readOnly?: boolean;
}

/**
 * Will clearing this action actually pay out? The server refuses fuel for an action
 * younger than ACTION_DONE_MIN_AGE_MINUTES (a create-then-delete loop was a free fuel
 * farm — see the DELETE handler in api/routes/nodes.ts). The button used to promise
 * "(+fuel)" unconditionally, so clearing a task you'd just written paid nothing with
 * no explanation.
 */
function earnsFuel(n: Pick<GraphNode, "createdAt">): boolean {
  const created = ms(n.createdAt);
  if (Number.isNaN(created)) return false;
  return Date.now() - created >= ACTION_DONE_MIN_AGE_MINUTES * 60_000;
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
  // Acknowledged-this-session reminders (server clears remind_at; hide locally
  // until the next graph refresh catches up).
  const [acked, setAcked] = useState<Set<number>>(new Set());
  const allReminders = useMemo(
    () =>
      nodes
        .filter((n) => n.kind !== "action" && n.remindAt)
        .map((n) => ({ n, at: ms(n.remindAt) }))
        .sort((a, b) => a.at - b.at),
    [nodes],
  );
  // DUE reminders used to silently VANISH here (the list filtered to future-only)
  // — the one moment a reminder mattered was the moment it disappeared.
  const dueReminders = allReminders.filter(({ n }) => isReminderDue(n, Date.now()) && !acked.has(n.id));
  const reminders = allReminders.filter(({ at }) => at > Date.now());

  const done = (id: number) => {
    deleteNode(id)
      .then(() => onChanged?.())
      .catch(() => pushToast("Couldn't clear that — try again.", "⚠️", 3500));
  };

  const ack = (id: number) => {
    ackReminder(id)
      .then(() => setAcked((s) => new Set(s).add(id)))
      .catch(() => pushToast("Couldn't acknowledge that reminder — try again.", "⚠️", 3500));
  };

  if (actions.length === 0 && reminders.length === 0 && dueReminders.length === 0) {
    return (
      <p className="empty">
        No action items or reminders. Add a thought and tick "📌 Action item", or set a reminder
        when you log a memory.
      </p>
    );
  }

  return (
    <div className="dock-body">
      {dueReminders.length > 0 && (
        <>
          <h3 className="agenda-h">🔔 Reminders due now ({dueReminders.length})</h3>
          <ul className="agenda-list">
            {dueReminders.map(({ n }) => (
              <li key={n.id} className="over">
                <button className="agenda-main" onClick={() => onFocus(n.id)} title="Fly to it">
                  <span className="agenda-label">{n.label}</span>
                  <span className="agenda-due urgent">due now</span>
                </button>
                {!readOnly && (
                  <button className="mini agenda-done" onClick={() => ack(n.id)} title="Acknowledge — stop reminding">
                    ✓
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

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
                  <button
                    className="mini agenda-done"
                    onClick={() => done(n.id)}
                    /* The server only pays out once an action is old enough — a
                       create-then-delete loop was a free fuel farm. The old flat
                       "(+fuel)" promised a reward the user often didn't get. */
                    title={
                      earnsFuel(n)
                        ? `Mark done (+${EARN_ACTION_DONE} ⛽)`
                        : `Mark done · earns ⛽ after ${ACTION_DONE_MIN_AGE_MINUTES} min`
                    }
                  >
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
                  <span className="agenda-due">
                    {countdown(at).text}
                    <br />
                    <span style={{ fontSize: "0.85em", opacity: 0.8 }}>
                      {new Date(at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
