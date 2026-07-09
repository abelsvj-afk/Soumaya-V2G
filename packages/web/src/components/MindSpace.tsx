import { useEffect, useState } from "react";
import { getThoughts, type Thought } from "../api/client.js";

/**
 * The Mind Space (Cognitive Layer Phase 2) — an ambient overlay that floats your
 * live working-memory thoughts as glowing motes drifting at the edges of the
 * galaxy, so "what you're thinking now" is present around you, not buried in a tab.
 * Motes brighten with a thought's strength and fade as it decays; the layer is
 * purely decorative (pointer-events: none) so it never blocks the 3D view.
 *
 * Self-contained: it reads its own on/off flag from localStorage and re-reads on a
 * `mindspace-toggle` window event (dispatched by the Mind panel), and polls the
 * working-memory API directly — no prop-drilling through the app tree.
 */

const KEY = "mindspace.ambient";
export function mindSpaceEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setMindSpaceEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("mindspace-toggle"));
}

/**
 * Deterministic placement in a READABLE safe band — clear of the top header, the right
 * FAB column, the left HUD (fuel/streak), and the bottom controls — so a drifting
 * thought is never stuck behind a button. Two motes on the same id-hash still spread via
 * the index. The float animation (CSS) then moves each one gently around that anchor.
 */
function moteStyle(t: Thought, idx: number): React.CSSProperties {
  const hx = ((t.id * 47 + idx * 29) % 100) / 100; // 0..1
  const hy = ((t.id * 31 + idx * 53 + 13) % 100) / 100;
  const left = 16 + hx * 52; // 16%..68% — inside the left HUD and right FABs
  const top = 26 + hy * 46; // 26%..72% — below the header, above the bottom FABs
  return {
    left: `${left}%`,
    top: `${top}%`,
    opacity: 0.55 + t.strength * 0.4,
    animationDelay: `${(t.id * 7 + idx * 3) % 20 * -1}s`,
    animationDuration: `${14 + ((t.id * 5) % 10)}s`,
    "--mote-glow": `${5 + t.strength * 14}px`,
  } as React.CSSProperties;
}

export function MindSpace({ demo, hidden }: { demo?: boolean; hidden?: boolean }) {
  const [on, setOn] = useState(mindSpaceEnabled());
  const [thoughts, setThoughts] = useState<Thought[]>([]);

  useEffect(() => {
    const sync = () => setOn(mindSpaceEnabled());
    window.addEventListener("mindspace-toggle", sync);
    return () => window.removeEventListener("mindspace-toggle", sync);
  }, []);

  useEffect(() => {
    if (!on || demo) {
      setThoughts([]);
      return;
    }
    const load = () => getThoughts().then(setThoughts).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [on, demo]);

  // Vanish while a menu/panel is open so drifting motes never sit over what you're reading.
  if (!on || demo || hidden || thoughts.length === 0) return null;

  return (
    <div className="mindspace-layer" aria-hidden>
      {thoughts.slice(0, 12).map((t, i) => (
        <span key={t.id} className="mindspace-mote" style={moteStyle(t, i)}>
          <span className="mindspace-dot" />
          <span className="mindspace-text">{t.text}</span>
        </span>
      ))}
    </div>
  );
}
