import { useEffect, useState } from "react";

/**
 * Lightweight celebratory toast system (gamification Wave 1). Fire from anywhere
 * with `pushToast(...)`; the <Toasts/> overlay renders + auto-dismisses them.
 * Deliberately dependency-free + offline-safe — pure in-app, no network.
 */
export interface Toast {
  id: number;
  text: string;
  icon: string;
  ttl: number;
  priority?: "low" | "normal" | "high";
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

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let nextId = 1;

/** Prune notifications: seen items > 5 minutes, normal unseen items > 24 hours. Important ones are kept. */
export function cleanupNotifications(spaceId: string): void {
  const logKey = `brain.notifications.${spaceId}`;
  try {
    const listRaw = localStorage.getItem(logKey);
    if (!listRaw) return;
    const list: InboxNotification[] = JSON.parse(listRaw);
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

    localStorage.setItem(logKey, JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to cleanup notifications", e);
  }
}

/** Show a transient toast (top-center). Default to 8 seconds. */
export function pushToast(
  text: string,
  icon = "✨",
  ttl = 8000,
  priority: "low" | "normal" | "high" = "normal"
): void {
  const t: Toast = { id: nextId++, text, icon, ttl, priority };
  for (const l of listeners) l(t);

  // Write to notification inbox log (scoped to space)
  const spaceId = localStorage.getItem("current_space_id") || "default";
  const logKey = `brain.notifications.${spaceId}`;
  try {
    const listRaw = localStorage.getItem(logKey);
    const list: InboxNotification[] = listRaw ? JSON.parse(listRaw) : [];
    
    // Check for duplicate recent messages to prevent spam
    const lastMsg = list[list.length - 1];
    if (lastMsg && lastMsg.text === text && Date.now() - lastMsg.timestamp < 1000) {
      return; // skip duplicate within 1 sec
    }

    const newNote: InboxNotification = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      icon,
      timestamp: Date.now(),
      seen: false,
      seenAt: null,
      priority,
    };
    list.push(newNote);
    localStorage.setItem(logKey, JSON.stringify(list.slice(-100)));
    window.dispatchEvent(new Event("brain-notifications-updated"));
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

  if (items.length === 0) return null;
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div
          key={t.id}
          className="toast"
          onMouseEnter={() => setHoveredId(t.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            <span className="toast-ic">{t.icon}</span>
            <span className="toast-msg">{t.text}</span>
          </div>
          <button
            onClick={() => removeToast(t.id)}
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
