import { useEffect, useMemo, useRef, useState } from "react";
import { type GraphNode, EARN_ACTION_DONE, ACTION_DONE_MIN_AGE_MINUTES } from "@brain/shared";
import { deleteNode, ackReminder } from "../api/client.js";
import { pushToast } from "./Toasts.js";
import { playSfx } from "../graph/sfx.js";
import { isReminderDue, parseTolerantMs as ms } from "../utils/dueReminders.js";

interface Props {
  nodes: GraphNode[];
  onFocus: (id: number) => void;
  /** Called after an action is cleared so the galaxy + fuel refresh. */
  onChanged?: () => void;
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

// A backstop against a genuinely huge agenda rendering unbounded — each list
// here already gets whittled down naturally (you clear actions, ack
// reminders), so this only ever bites in a pathological case.
const LIST_SHOWN_CAP = 50;

/** "in 5h" / "in 3d" / "overdue 2d" from a future-ish timestamp. A flat, unchanging
 *  "overdue" used to look identical whether something was 1 minute or 3 weeks late —
 *  this grows with elapsed time so severity is actually visible. */
function countdown(target: number): { text: string; urgent: boolean; over: boolean } {
  const diff = target - Date.now();
  if (Number.isNaN(target)) return { text: "", urgent: false, over: false };
  if (diff <= 0) {
    const overdueH = -diff / 3.6e6;
    const text =
      overdueH < 1 ? `overdue ${Math.max(1, Math.round(-diff / 6e4))}m` : overdueH < 24 ? `overdue ${Math.round(overdueH)}h` : `overdue ${Math.round(overdueH / 24)}d`;
    return { text, urgent: true, over: true };
  }
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
export function ActionsPanel({ nodes, onFocus, onChanged }: Props) {
  const actions = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === "action")
        .map((n) => ({ n, due: ms(n.expiresAt) }))
        .sort((a, b) => (a.due || Infinity) - (b.due || Infinity)),
    [nodes],
  );

  // Clearing the very last action item was a completely flat moment — no
  // achievement in this app covers tasks/agenda at all. Only fires on the real
  // >0 → 0 transition, never on a mount that starts with an empty agenda.
  const prevActionCount = useRef<number | null>(null);
  useEffect(() => {
    const count = actions.length;
    if (prevActionCount.current !== null && prevActionCount.current > 0 && count === 0) {
      playSfx("milestone");
      pushToast("Agenda Zero — every action item cleared. 🎯", "🎯", 4500);
    }
    prevActionCount.current = count;
  }, [actions.length]);

  // Acknowledged-this-session reminders (server clears remind_at; hide locally
  // until the next graph refresh catches up).
  const [acked, setAcked] = useState<Set<number>>(new Set());
  // Once a refresh actually lands the cleared remind_at, an acked id has nothing
  // left to mask — without this, the Set only ever grew for the life of the panel.
  useEffect(() => {
    setAcked((prev) => {
      if (prev.size === 0) return prev;
      const stillNeeded = new Set<number>();
      for (const id of prev) {
        const n = nodes.find((x) => x.id === id);
        if (n && n.remindAt) stillNeeded.add(id);
      }
      return stillNeeded.size === prev.size ? prev : stillNeeded;
    });
  }, [nodes]);
  const allReminders = useMemo(
    () =>
      nodes
        .filter((n) => n.kind !== "action" && n.remindAt)
        .map((n) => ({ n, at: ms(n.remindAt) }))
        .sort((a, b) => a.at - b.at),
    [nodes],
  );
  // DUE reminders used to silently VANISH here (the list filtered to future-only)
  // — the one moment a reminder mattered was the moment it disappeared. Both
  // lists share one `now` — reading Date.now() separately for each could (in
  // principle) straddle a millisecond boundary and disagree on a borderline item.
  const { dueReminders, reminders } = useMemo(() => {
    const now = Date.now();
    return {
      dueReminders: allReminders.filter(({ n }) => isReminderDue(n, now) && !acked.has(n.id)),
      reminders: allReminders.filter(({ at }) => at > now),
    };
  }, [allReminders, acked]);

  const done = (n: GraphNode) => {
    deleteNode(n.id)
      .then(() => {
        playSfx("complete");
        pushToast(
          earnsFuel(n) ? `"${n.label.slice(0, 30)}" cleared (+${EARN_ACTION_DONE} ⛽)` : `"${n.label.slice(0, 30)}" cleared ✓`,
          "✅",
          3000,
        );
        onChanged?.();
      })
      .catch(() => pushToast("Couldn't clear that — try again.", "⚠️", 3500));
  };

  const ack = (id: number) => {
    ackReminder(id)
      .then(() => {
        setAcked((s) => new Set(s).add(id));
        // Without this, the galaxy/NotificationsBar/NodeList — all of which read
        // the same remind_at — kept showing this reminder as live until whatever
        // OTHER action happened to trigger their own next refresh.
        onChanged?.();
      })
      .catch(() => pushToast("Couldn't acknowledge that reminder — try again.", "⚠️", 3500));
  };

  if (actions.length === 0 && reminders.length === 0 && dueReminders.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
        <p className="empty" style={{ margin: 0 }}>
          No action items or reminders. Add a thought and tick "📌 Action item", or set a reminder
          when you log a memory.
        </p>
        <button
          className="mini"
          onClick={() => window.dispatchEvent(new CustomEvent("brain-toast-action", { detail: { kind: "panel", value: "ingest" } }))}
        >
          ➕ Dump a thought
        </button>
      </div>
    );
  }

  return (
    <div className="dock-body">
      {dueReminders.length > 0 && (
        <>
          <h3 className="agenda-h">🔔 Reminders due now ({dueReminders.length})</h3>
          <ul className="agenda-list">
            {dueReminders.slice(0, LIST_SHOWN_CAP).map(({ n }) => (
              <li key={n.id} className="over">
                <button className="agenda-main" onClick={() => onFocus(n.id)} title="Fly to it">
                  <span className="agenda-label">{n.label}</span>
                  <span className="agenda-due urgent">due now</span>
                </button>
                <button className="mini agenda-done" onClick={() => ack(n.id)} title="Acknowledge — stop reminding">
                  ✓
                </button>
              </li>
            ))}
            {dueReminders.length > LIST_SHOWN_CAP && <li className="empty small">+{dueReminders.length - LIST_SHOWN_CAP} more</li>}
          </ul>
        </>
      )}

      <h3 className="agenda-h">📌 Action items {actions.length > 0 && `(${actions.length})`}</h3>
      {actions.length === 0 ? (
        <p className="empty small">Nothing due — you're clear.</p>
      ) : (
        <ul className="agenda-list">
          {actions.slice(0, LIST_SHOWN_CAP).map(({ n, due }) => {
            const c = countdown(due);
            return (
              <li key={n.id} className={c.over ? "over" : ""}>
                <button className="agenda-main" onClick={() => onFocus(n.id)} title="Fly to it">
                  <span className="agenda-label">{n.label}</span>
                  {c.text && <span className={`agenda-due ${c.urgent ? "urgent" : ""}`}>⏰ {c.text}</span>}
                </button>
                <button
                  className="mini agenda-done"
                  onClick={() => done(n)}
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
              </li>
            );
          })}
          {actions.length > LIST_SHOWN_CAP && <li className="empty small">+{actions.length - LIST_SHOWN_CAP} more</li>}
        </ul>
      )}

      {reminders.length > 0 && (
        <>
          <h3 className="agenda-h">⏰ Upcoming reminders ({reminders.length})</h3>
          <ul className="agenda-list">
            {reminders.slice(0, LIST_SHOWN_CAP).map(({ n, at }) => {
              const c = countdown(at);
              return (
                <li key={n.id} className={c.over ? "over" : ""}>
                  <button className="agenda-main" onClick={() => onFocus(n.id)} title="Fly to it">
                    <span className="agenda-label">{n.label}</span>
                    <span className={`agenda-due ${c.urgent ? "urgent" : ""}`}>
                      {c.text}
                      <br />
                      <span style={{ fontSize: "0.85em", opacity: 0.8 }}>
                        {new Date(at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </span>
                  </button>
                  <button className="mini agenda-done" onClick={() => ack(n.id)} title="Dismiss — cancel this reminder">
                    ✕
                  </button>
                </li>
              );
            })}
            {reminders.length > LIST_SHOWN_CAP && <li className="empty small">+{reminders.length - LIST_SHOWN_CAP} more</li>}
          </ul>
        </>
      )}
    </div>
  );
}
