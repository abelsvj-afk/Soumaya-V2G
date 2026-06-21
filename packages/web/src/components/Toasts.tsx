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
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let nextId = 1;

/** Show a transient toast (top-center). Default to 8 seconds. */
export function pushToast(text: string, icon = "✨", ttl = 8000): void {
  const t: Toast = { id: nextId++, text, icon, ttl };
  for (const l of listeners) l(t);
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
