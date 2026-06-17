import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatResponse } from "@brain/shared";
import { askChat } from "../api/client.js";
import { TYPE_COLORS } from "../graph/theme.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Tiny, very quiet "terminal key" tick for the typewriter effect.
let actx: AudioContext | null = null;
function playTick() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = "square";
    o.frequency.value = 1400 + Math.random() * 500;
    g.gain.setValueAtTime(0.0009, t);
    g.gain.exponentialRampToValueAtTime(0.00001, t + 0.03);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + 0.035);
  } catch {
    /* audio not available */
  }
}

export function ChatPanel({ onFocus }: { onFocus: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponse | null>(null);
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(false);
  const soundRef = useRef(true);

  // Typewriter: reveal the answer character-by-character with a soft key click.
  useEffect(() => {
    const full = resp?.answer ?? "";
    if (!full) {
      setDisplayed("");
      return;
    }
    let i = 0;
    setDisplayed("");
    setTyping(true);
    const id = setInterval(() => {
      i += 2;
      setDisplayed(full.slice(0, i));
      if (soundRef.current && i % 4 === 0) playTick();
      if (i >= full.length) {
        clearInterval(id);
        setTyping(false);
      }
    }, 16);
    return () => clearInterval(id);
  }, [resp]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResp(await askChat(q));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dock-body">
      <div className="dock-head">
        <h3>Talk to Soumaya</h3>
        <button
          className="link-btn"
          title="Toggle typing sound"
          onClick={() => (soundRef.current = !soundRef.current)}
        >
          🔊/🔇
        </button>
      </div>
      <form onSubmit={ask} className="chat-form">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Soumaya…" />
        <button disabled={busy}>{busy ? "…" : "Ask"}</button>
      </form>
      {resp && (
        <div className="chat-answer">
          <p>
            {displayed}
            {typing && <span className="type-caret">▋</span>}
          </p>
          {!typing && resp.citations.length > 0 && (
            <div className="pills">
              {resp.citations.map((c) => (
                <button
                  key={c.id}
                  className="pill"
                  style={{ borderColor: TYPE_COLORS[c.type] }}
                  onClick={() => onFocus(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
