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

/** Deterministic edge position for a mote from its id, so it doesn't jump on refresh. */
function moteStyle(t: Thought, idx: number): React.CSSProperties {
  const golden = 137.508; // golden angle → even spread
  const angle = ((t.id * golden) % 360) * (Math.PI / 180);
  // Push motes toward the edges (radius 34–46% of the viewport) so the centre stays clear.
  const radius = 34 + ((t.id * 7) % 12);
  const cx = 50 + Math.cos(angle) * radius;
  const cy = 50 + Math.sin(angle) * radius * 0.82; // slightly flattened
  return {
    left: `${cx}%`,
    top: `${cy}%`,
    opacity: 0.25 + t.strength * 0.6,
    animationDelay: `${(t.id % 12) * -0.7}s`,
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
