import { useEffect, useState } from "react";
import { playSfx } from "../graph/sfx.js";

/**
 * Lightweight celebratory toast system (gamification Wave 1). Fire from anywhere
 * with `pushToast(...)`; the <Toasts/> overlay renders + auto-dismisses them.
 * Deliberately dependency-free + offline-safe — pure in-app, no network.
 */
/** Where a clickable notification takes you when tapped. */
export interface ToastAction {
  kind: "focus" | "tab" | "panel" | "chat";
  value?: string | number;
}

export interface Toast {
  id: number;
  text: string;
  icon: string;
  ttl: number;
  priority?: "low" | "normal" | "high";
  action?: ToastAction;
}

export interface InboxNotification {
  id: string;
  text: string;
  icon: string;
  timestamp: number;
  seen: boolean;
  seenAt: number | null;
  priority: "low" | "normal" | "high";
}

/** How many notifications the inbox log keeps. Defined once — InboxPanel used to
 *  render the list assuming it was bounded by this number without knowing it. */
export const INBOX_CAP = 100;

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let nextId = 1;

// Transient-display gate: while paused (e.g. the Observatory home is open over the
// galaxy), toasts are buffered instead of shown — they still get logged to the
// inbox — then flushed once unpaused, so a celebration never hides behind the cards.
let paused = false;
// Focus mode (#2) QUIETS non-essential toasts: low/normal are buffered for a calm
// reading session; only high-priority (she's hailing, rank-up) still breaks through.
let quiet = false;
const buffer: Toast[] = [];
function maybeFlush(): void {
  if (paused || buffer.length === 0) return;
  const flush = buffer.splice(0, buffer.length);
  for (const t of flush) for (const l of listeners) l(t);
}
export function setToastsPaused(p: boolean): void {
  if (p === paused) return;
  paused = p;
  if (!paused) maybeFlush();
}
export function setToastsQuiet(q: boolean): void {
  if (q === quiet) return;
  quiet = q;
  if (!quiet) maybeFlush();
}

/**
 * The one definition of the inbox storage key. `pushToast` writes to the canonical
 * `brain.spaceId` bucket (set at login) while InboxPanel used to build the key from a
 * prop — two sources for the same key, one prop-plumbing mistake away from the writer
 * and reader pointing at different buckets. Callers pass the id they have; passing
 * nothing resolves the canonical one.
 */
export function notificationsKey(spaceId?: string): string {
  const id = spaceId ?? (() => {
    try {
      return localStorage.getItem("brain.spaceId") || "default";
    } catch {
      return "default";
    }
  })();
  return `brain.notifications.${id}`;
}

/** Read the inbox log from storage. Always the source of truth — never React state. */
export function readNotifications(spaceId?: string): InboxNotification[] {
  try {
    const raw = localStorage.getItem(notificationsKey(spaceId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as InboxNotification[]) : [];
  } catch {
    return [];
  }
}

/** Persist the inbox log and tell every listener (this tab) to re-read. */
export function writeNotifications(list: InboxNotification[], spaceId?: string): void {
  try {
    localStorage.setItem(notificationsKey(spaceId), JSON.stringify(list.slice(-INBOX_CAP)));
    window.dispatchEvent(new Event("brain-notifications-updated"));
  } catch (e) {
    console.error("Failed to write notifications", e);
  }
}

/** Prune notifications: seen items > 5 minutes, normal unseen items > 24 hours. Important ones are kept. */
export function cleanupNotifications(spaceId: string): void {
  try {
    const list = readNotifications(spaceId);
    if (list.length === 0) return;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    const filtered = list.filter((item) => {
      if (item.seen) {
        return item.seenAt ? (now - item.seenAt < fiveMinutes) : false;
      }
      if (item.priority === "high") {
        return true;
      }
      return (now - item.timestamp < oneDay);
    });

    // Only write + announce when something actually changed. Cleanup used to write
    // silently, so a panel that had already loaded kept stale rows in state — and the
    // next Mark-All-Read/Clear-History wrote that stale array straight back, RESURRECTING
    // everything cleanup had just pruned. Announcing makes readers re-sync.
    if (filtered.length !== list.length) writeNotifications(filtered, spaceId);
  } catch (e) {
    console.error("Failed to cleanup notifications", e);
  }
}

/** Show a transient toast (top-center). Default to 8 seconds. */
export function pushToast(
  text: string,
  icon = "✨",
  ttl = 8000,
  priority: "low" | "normal" | "high" = "normal",
  action?: ToastAction,
): void {
  const t: Toast = { id: nextId++, text, icon, ttl, priority, action };
  // Buffer when paused, or when quieted (focus mode) unless it's high-priority.
  if (paused || (quiet && priority !== "high")) buffer.push(t); // still logged to inbox below
  else {
    for (const l of listeners) l(t);
    playSfx(priority === "high" ? "achievement" : "notify"); // audible cue when shown
  }

  // Write to the notification inbox log (scoped to space, via the shared key helper
  // so the writer and the inbox reader can never point at different buckets).
  try {
    const list = readNotifications();

    // Check for duplicate recent messages to prevent spam
    const lastMsg = list[list.length - 1];
    if (lastMsg && lastMsg.text === text && Date.now() - lastMsg.timestamp < 1000) {
      return; // skip duplicate within 1 sec
    }

    const newNote: InboxNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      text,
      icon,
      timestamp: Date.now(),
      seen: false,
      seenAt: null,
      priority,
    };
    list.push(newNote);
    writeNotifications(list);
  } catch (e) {
    console.error("Failed to append to notification inbox", e);
  }
}

export function Toasts() {
  const [items, setItems] = useState<(Toast & { remaining: number })[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    const add: Listener = (t) => {
      setItems((cur) => [...cur, { ...t, remaining: t.ttl }].slice(-4)); // limit to max 4 toasts
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  // Periodic interval countdown: pause countdown if the toast is hovered
  useEffect(() => {
    const timer = setInterval(() => {
      setItems((cur) => {
        return cur
          .map((item) => {
            if (hoveredId === item.id) {
              return item; // pause timer for hovered toast
            }
            return { ...item, remaining: item.remaining - 200 };
          })
          .filter((item) => item.remaining > 0);
      });
    }, 200);
    return () => clearInterval(timer);
  }, [hoveredId]);

  const removeToast = (id: number) => {
    setItems((cur) => cur.filter((x) => x.id !== id));
    if (hoveredId === id) setHoveredId(null);
  };

  const runAction = (t: Toast & { remaining: number }) => {
    if (!t.action) return;
    try { window.dispatchEvent(new CustomEvent("brain-toast-action", { detail: t.action })); } catch { /* no window */ }
    removeToast(t.id);
  };

  if (items.length === 0) return null;
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.action ? "actionable" : ""}`}
          onMouseEnter={() => setHoveredId(t.id)}
          onMouseLeave={() => setHoveredId(null)}
          onClick={t.action ? () => runAction(t) : undefined}
          role={t.action ? "button" : undefined}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            <span className="toast-ic">{t.icon}</span>
            <span className="toast-msg">{t.text}</span>
            {t.action && <span className="toast-go" aria-hidden>›</span>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.4)",
              fontSize: "18px",
              cursor: "pointer",
              padding: "0 0 0 6px",
              lineHeight: 1,
              transition: "color 0.2s"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)")}
            title="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
