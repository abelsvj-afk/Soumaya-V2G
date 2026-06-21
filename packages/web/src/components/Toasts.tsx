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

/** Show a transient toast (top-center). `ttl` ms before it fades. */
export function pushToast(text: string, icon = "✨", ttl = 4500): void {
  const t: Toast = { id: nextId++, text, icon, ttl };
  for (const l of listeners) l(t);
}

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const add: Listener = (t) => {
      setItems((cur) => [...cur, t].slice(-4)); // never stack more than 4 on screen
      window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.ttl);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-ic">{t.icon}</span>
          <span className="toast-msg">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
