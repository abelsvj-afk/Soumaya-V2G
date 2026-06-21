import { useEffect, useRef, useState, type FormEvent } from "react";
import { type ChatResponse, NEUTRAL_TONE } from "@brain/shared";
import { askChat } from "../api/client.js";
import { TYPE_COLORS } from "../graph/theme.js";
import {
  isVoiceEnabled,
  isVoiceSupported,
  setVoiceEnabled as persistVoice,
  speak,
  stopSpeaking,
} from "../voice.js";

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

export function ChatPanel({
  onFocus,
  onRecall,
  showShipTask,
  setShowShipTask,
  shipViewMode,
  setShipViewMode,
  tasks,
  onReorderTasks,
}: {
  onFocus: (id: number) => void;
  onRecall?: (ids: number[]) => void;
  showShipTask?: boolean;
  setShowShipTask?: (v: boolean) => void;
  shipViewMode?: "orbit" | "cockpit";
  setShipViewMode?: (v: "orbit" | "cockpit") => void;
  tasks?: any[];
  onReorderTasks?: (newOrder: any[]) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponse | null>(null);
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(false);
  const [voiceOn, setVoiceOn] = useState(isVoiceEnabled());
  const [speaking, setSpeaking] = useState(false);
  const soundRef = useRef(true);
  const voiceSupported = isVoiceSupported();

  const moveTask = (index: number, direction: "up" | "down") => {
    if (!tasks || !onReorderTasks) return;
    const plannedTasks = tasks.filter((t) => t.status === "planned");
    const targetPlannedIndex = plannedTasks.findIndex(t => t.id === tasks[index].id);
    if (targetPlannedIndex === -1) return;
    
    const nextPlannedIndex = direction === "up" ? targetPlannedIndex - 1 : targetPlannedIndex + 1;
    if (nextPlannedIndex < 0 || nextPlannedIndex >= plannedTasks.length) return;
    
    const newPlanned = [...plannedTasks];
    const temp = newPlanned[targetPlannedIndex]!;
    newPlanned[targetPlannedIndex] = newPlanned[nextPlannedIndex]!;
    newPlanned[nextPlannedIndex] = temp;
    
    const doing = tasks.filter((t) => t.status === "doing");
    const done = tasks.filter((t) => t.status === "done");
    
    const newOrder = [...doing, ...newPlanned, ...done];
    onReorderTasks(newOrder);
  };

  // Stop any speech if the panel unmounts.
  useEffect(() => () => stopSpeaking(), []);

  // When an answer arrives, speak it aloud (with its emotional tone) if voice is on.
  useEffect(() => {
    if (!resp?.answer || !voiceOn) return;
    speak(resp.answer, resp.tone ?? NEUTRAL_TONE, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resp]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    persistVoice(next);
    if (!next) setSpeaking(false);
    else if (resp?.answer)
      speak(resp.answer, resp.tone ?? NEUTRAL_TONE, {
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      });
  };

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
      const response = await askChat(q);
      setResp(response);
      if (response.citations && response.citations.length > 0) {
        const ids = response.citations.map((c) => c.id);
        onRecall?.(ids);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dock-body">
      <div className="dock-head">
        <h3>Talk to Soumaya {speaking && <span className="speaking-dot" title="Speaking…">◗</span>}</h3>
        <div className="head-tools">
          {setShipViewMode && (
            <button
              className={`link-btn ${shipViewMode === "cockpit" ? "active" : ""}`}
              title={shipViewMode === "cockpit" ? "Camera Mode: Cockpit Lock" : "Camera Mode: Orbit Follow"}
              onClick={() => setShipViewMode(shipViewMode === "cockpit" ? "orbit" : "cockpit")}
              style={{ fontSize: "1.1rem" }}
            >
              {shipViewMode === "cockpit" ? "🎥 Lock" : "🎥 Free"}
            </button>
          )}
          {setShowShipTask && (
            <button
              className={`link-btn ${showShipTask ? "active" : ""}`}
              title={showShipTask ? "Hide ship task label" : "Show ship task label"}
              onClick={() => setShowShipTask(!showShipTask)}
              style={{ fontSize: "1.1rem" }}
            >
              🏷️
            </button>
          )}
          {voiceSupported && (
            <button
              className={`link-btn ${voiceOn ? "active" : ""}`}
              title={voiceOn ? "Soumaya's voice: ON" : "Soumaya's voice: OFF"}
              onClick={toggleVoice}
            >
              {voiceOn ? "🗣️" : "🔇"}
            </button>
          )}
          <button
            className="link-btn"
            title="Toggle typing sound"
            onClick={() => (soundRef.current = !soundRef.current)}
          >
            ⌨️
          </button>
        </div>
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

      {tasks && tasks.length > 0 && (
        <div className="ship-tasks-section">
          <h4>Soumaya's Active Flight Tasks</h4>
          <ul className="ship-tasks-list">
            {tasks.map((task, idx) => {
              const isPlanned = task.status === "planned";
              const isDoing = task.status === "doing";
              const isDone = task.status === "done";
              
              const plannedTasks = tasks.filter((t) => t.status === "planned");
              const pIdx = plannedTasks.findIndex(t => t.id === task.id);
              
              return (
                <li key={task.id} className={`ship-task-item ${task.status}`}>
                  <span className={`status-indicator ${task.status}`}>
                    {isDoing && <span className="pulse-dot" />}
                    {isDone && "✓"}
                    {isPlanned && "○"}
                  </span>
                  <span className="task-label">{task.label}</span>
                  {isPlanned && (
                    <div className="task-controls">
                      <button
                        className="task-btn"
                        disabled={pIdx === 0}
                        onClick={() => moveTask(idx, "up")}
                        title="Move task up in priority"
                      >
                        ▲
                      </button>
                      <button
                        className="task-btn"
                        disabled={pIdx === plannedTasks.length - 1}
                        onClick={() => moveTask(idx, "down")}
                        title="Move task down in priority"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
