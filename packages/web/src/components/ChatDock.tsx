import { useEffect, useRef, useState } from "react";
import type { ChatMood, NodeRef } from "@brain/shared";
import { askChat, getSpaceId, ingestText, distillChat } from "../api/client.js";
import { colorForType } from "../graph/theme.js";
import { pushToast } from "./Toasts.js";
import { isVoiceSupported, isVoiceEnabled, setVoiceEnabled, speak, stopSpeaking } from "../voice.js";
import { SoumayaEye } from "./SoumayaEye.js";
import { CompanionPanel } from "./CompanionPanel.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ChatMessage {
  role: "you" | "soumaya";
  text: string;
  citations?: NodeRef[];
  mood?: ChatMood;
  /** Her interview instinct: a clarifying question rendered as its own bubble. */
  ask?: boolean;
  /** Which Companion config shaped the reply ("🎭 Coach", "📚 resume.pdf"). */
  applied?: string[];
}

/** Browser SpeechRecognition (Chrome/Safari prefix it). Null if unsupported. */
function getRecognition(): any {
  const w = window as any;
  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Rec ? new Rec() : null;
}

const chatKey = (): string => `brain.chat.${getSpaceId() ?? "default"}`;

/** How long she waits after you stop talking before sending (ms). The browser's
 *  own end-of-speech was cutting people off mid-thought. */
const MIC_SILENCE_MS = 2800;

/**
 * Floating chat with Soumaya — a real conversation card (full back-and-forth
 * history that SHE ALSO SEES, citations you can fly to, hands-free mic with a
 * patient silence window, optional voice readback, her living eye avatar, and
 * her persona controls via 🎭). Opened by the 💬 FAB. History persists
 * per-brain in localStorage.
 */
export function ChatDock({
  spaceName = "Soumaya",
  onClose,
  onFocus,
  onRecall,
  onCreated,
  demo,
}: {
  spaceName?: string;
  onClose: () => void;
  onFocus: (id: number) => void;
  onRecall?: (ids: number[]) => void;
  /** Called with the new node ids after a message is saved as a memory. */
  onCreated?: (newIds: number[]) => void;
  demo?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(chatKey()) || "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(isVoiceEnabled());
  const [saved, setSaved] = useState<Set<number>>(new Set()); // message indices saved as memories
  // Her persona controls (About Me / roles / knowledge) — a view inside the chat,
  // since they configure WHO you're talking to right here.
  const [showPersona, setShowPersona] = useState(false);
  // End-of-conversation: notes Soumaya proposes to save (null = none shown yet).
  const [proposals, setProposals] = useState<string[] | null>(null);
  const [distilling, setDistilling] = useState(false);
  const distilledRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const micTimerRef = useRef<number | null>(null);
  const wantMicRef = useRef(false); // user intent — survives engine auto-restarts
  const voiceSupported = isVoiceSupported();
  const micSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // The eye mirrors the conversation: her last mood, and what she's doing now.
  const lastMood: ChatMood =
    [...messages].reverse().find((m) => m.role === "soumaya" && m.mood)?.mood ?? "neutral";
  const eyeState = busy ? "thinking" : listening ? "listening" : "idle";

  // Persist + autoscroll on every change.
  useEffect(() => {
    try {
      localStorage.setItem(chatKey(), JSON.stringify(messages.slice(-60)));
    } catch {
      /* storage unavailable */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(
    () => () => {
      stopSpeaking();
      wantMicRef.current = false;
      recRef.current?.stop?.();
      if (micTimerRef.current) window.clearTimeout(micTimerRef.current);
    },
    [],
  );

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    // She sees the recent thread too — this is what makes it a conversation
    // instead of a series of amnesiac one-shots. Fold an ask-back bubble back
    // INTO its answer turn so the model reads one coherent Soumaya turn (a bare
    // trailing "?" made it re-ask); the server still detects "just asked".
    const history: { role: "you" | "soumaya"; text: string }[] = [];
    for (const m of messages.slice(-9)) {
      const prev = history[history.length - 1];
      if (m.ask && prev && prev.role === "soumaya") prev.text = `${prev.text} ${m.text}`;
      else history.push({ role: m.role, text: m.text });
    }
    const trimmed = history.slice(-8);
    setMessages((m) => [...m, { role: "you", text: q }]);
    setBusy(true);
    try {
      const r = await askChat(q, trimmed);
      const citations = r.citations ?? [];
      // Visibility: which of your Companion roles/docs actually shaped this reply.
      const applied = [
        ...(r.appliedRoles ?? []).map((n) => `🎭 ${n}`),
        ...(r.appliedDocs ?? []).map((n) => `📚 ${n}`),
      ];
      setMessages((m) => {
        const next: ChatMessage[] = [
          ...m,
          { role: "soumaya", text: r.answer || "(no answer)", citations, mood: r.mood, applied },
        ];
        // Interview instinct: her clarifying question gets its own bubble so it
        // reads as HER asking, not a footnote.
        if (r.askBack) next.push({ role: "soumaya", text: r.askBack, mood: r.mood, ask: true });
        return next;
      });
      if (citations.length > 0) onRecall?.(citations.map((c) => c.id));
      if (speakOn) speak(r.askBack ? `${r.answer} ${r.askBack}` : r.answer, r.tone);
    } catch (err) {
      setMessages((m) => [...m, { role: "soumaya", text: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  // Save a line of the conversation into the galaxy as a real memory.
  const saveMemory = async (text: string, idx: number) => {
    if (saved.has(idx)) return;
    try {
      const r = await ingestText(text);
      const ids = (r.nodes ?? []).map((n) => n.id);
      setSaved((s) => new Set(s).add(idx));
      pushToast(`Soumaya is charting it into your galaxy ✦`, "🛰️", 4500);
      if (ids.length) onCreated?.(ids);
    } catch (err) {
      pushToast((err as Error).message || "Couldn't save that.", "⚠️", 4500);
    }
  };

  /**
   * Mic: hands-free speak-to-send that does NOT cut you off. The browser engine
   * loves to end after a short pause, so we run it in continuous mode, restart it
   * whenever it self-terminates while the mic is still "on", and only send after
   * a real silence window (MIC_SILENCE_MS) — or when you tap the mic off.
   */
  const stopMic = (sendNow: boolean, textOverride?: string) => {
    wantMicRef.current = false;
    if (micTimerRef.current) window.clearTimeout(micTimerRef.current);
    micTimerRef.current = null;
    try {
      recRef.current?.stop?.();
    } catch {
      /* already stopped */
    }
    setListening(false);
    const said = (textOverride ?? "").trim();
    if (sendNow && said) void send(said);
  };

  const toggleMic = () => {
    if (listening) {
      // Tap-off sends whatever's transcribed so far.
      stopMic(true, input);
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true; // don't let the engine decide when you're done
    let finalText = "";
    let latest = "";
    const armSilenceTimer = () => {
      if (micTimerRef.current) window.clearTimeout(micTimerRef.current);
      micTimerRef.current = window.setTimeout(() => {
        if (wantMicRef.current) stopMic(true, latest);
      }, MIC_SILENCE_MS);
    };
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      latest = (finalText + interim).trim();
      setInput(latest);
      armSilenceTimer(); // every bit of speech pushes the send window out
    };
    rec.onerror = (e: any) => {
      // "no-speech" just means a quiet stretch — the restart below handles it.
      if (e?.error && e.error !== "no-speech" && e.error !== "aborted") {
        stopMic(false);
      }
    };
    rec.onend = () => {
      // The engine self-terminated (it always does eventually). If the user
      // hasn't tapped off and the silence window hasn't fired, keep listening.
      if (wantMicRef.current) {
        try {
          rec.start();
        } catch {
          stopMic(true, latest);
        }
      }
    };
    wantMicRef.current = true;
    setListening(true);
    armSilenceTimer();
    rec.start();
  };

  // At the END of a conversation she proposes a few memory-worthy notes to keep
  // (never mid-chat). Runs on close when there's enough exchange; also manual.
  const runDistill = async (): Promise<boolean> => {
    if (distilling) return false;
    setDistilling(true);
    try {
      const notes = await distillChat(messages.map((m) => ({ role: m.role, text: m.text })));
      distilledRef.current = true;
      if (notes.length > 0) {
        setProposals(notes);
        return true;
      }
      return false;
    } finally {
      setDistilling(false);
    }
  };

  const userTurns = messages.filter((m) => m.role === "you").length;

  // Close, but first offer end-of-chat notes once (if the convo had substance).
  const handleClose = async () => {
    if (proposals === null && !distilledRef.current && userTurns >= 2) {
      const proposed = await runDistill();
      if (proposed) return; // keep open so the user can approve/skip
    }
    onClose();
  };

  const approveProposal = async (text: string, i: number) => {
    try {
      const r = await ingestText(text);
      const ids = (r.nodes ?? []).map((n) => n.id);
      if (ids.length) onCreated?.(ids);
      pushToast("Soumaya is charting it into your galaxy ✦", "🛰️", 4000);
    } catch (err) {
      pushToast((err as Error).message || "Couldn't save that.", "⚠️", 4000);
    }
    setProposals((p) => (p ? p.filter((_, idx) => idx !== i) : p));
  };

  const toggleSpeak = () => {
    const next = !speakOn;
    setSpeakOn(next);
    setVoiceEnabled(next);
    if (!next) stopSpeaking();
  };

  const clearChat = () => {
    stopSpeaking();
    setMessages([]);
    // Reset per-conversation state too — `saved` is index-keyed, so leftovers
    // marked new messages at old indices as already-saved (dead ＋ button), and
    // a stale distill flag suppressed the next conversation's wrap-up offer.
    setSaved(new Set());
    setProposals(null);
    distilledRef.current = false;
  };

  return (
    <div className="chatdock" role="dialog" aria-label={`Chat with ${spaceName}`}>
      <header className="chatdock-head">
        <span className="chatdock-title">
          <SoumayaEye state={eyeState} mood={lastMood} size={30} /> {spaceName}
        </span>
        <div className="chatdock-tools">
          <button
            className={`chatdock-tool ${showPersona ? "on" : ""}`}
            onClick={() => setShowPersona((v) => !v)}
            title="Who she is to you — About Me, custom roles, knowledge"
          >
            🎭
          </button>
          {voiceSupported && (
            <button
              className={`chatdock-tool ${speakOn ? "on" : ""}`}
              onClick={toggleSpeak}
              title={speakOn ? "Voice replies on" : "Voice replies off"}
            >
              {speakOn ? "🔊" : "🔈"}
            </button>
          )}
          {userTurns >= 2 && !showPersona && (
            <button
              className="chatdock-tool"
              onClick={() => void runDistill()}
              disabled={distilling}
              title="Wrap up — let Soumaya pick out anything worth saving"
            >
              ✨
            </button>
          )}
          {messages.length > 0 && !showPersona && (
            <button className="chatdock-tool" onClick={clearChat} title="Clear conversation">
              🗑
            </button>
          )}
          <button className="chatdock-tool" onClick={() => void handleClose()} title="Close" aria-label="Close">
            ×
          </button>
        </div>
      </header>

      {showPersona ? (
        <div className="chatdock-msgs chatdock-persona">
          <CompanionPanel demo={demo} spaceName={spaceName} />
        </div>
      ) : (
        <div className="chatdock-msgs" ref={listRef}>
          {messages.length === 0 && (
            <p className="chatdock-empty">
              {spaceName} has read your whole galaxy. Think out loud with her — "help me decide…",
              "what am I missing about…", "what have you noticed lately?" — and she'll connect it to
              what you've logged, name patterns, and push back when it helps. Tap ＋ to keep anything
              worth saving. (🎭 shapes who she is to you.)
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chatdock-msg ${m.role}`}>
              <div
                className={`chatdock-bubble ${m.ask ? "ask" : ""} ${m.role === "soumaya" && m.mood ? `mood-${m.mood}` : ""}`}
              >
                {m.ask && <span className="chatdock-ask-tag">she wants to understand</span>}
                {m.text}
                <button
                  className={`chatdock-save ${saved.has(i) ? "done" : ""}`}
                  onClick={() => saveMemory(m.text, i)}
                  disabled={saved.has(i)}
                  title={saved.has(i) ? "Saved as a memory" : "Save this as a memory"}
                  aria-label="Save as memory"
                >
                  {saved.has(i) ? "✓" : "＋"}
                </button>
              </div>
              {m.citations && m.citations.length > 0 && (
                <div className="chatdock-cites">
                  {m.citations.map((c) => (
                    <button
                      key={c.id}
                      className="pill"
                      style={{ borderColor: colorForType(c.type) }}
                      onClick={() => onFocus(c.id)}
                      title="Fly to this memory"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              {m.applied && m.applied.length > 0 && (
                <div className="chatdock-applied" title="The Companion config that shaped this reply (edit via 🎭)">
                  {m.applied.map((a) => (
                    <span key={a} className="chatdock-applied-chip">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="chatdock-msg soumaya">
              <div className="chatdock-bubble typing">
                <SoumayaEye state="thinking" mood={lastMood} size={24} />
              </div>
            </div>
          )}
        </div>
      )}

      {proposals && proposals.length > 0 && !showPersona && (
        <div className="chatdock-proposals">
          <div className="chatdock-prop-head">✨ Worth keeping from this chat?</div>
          {proposals.map((p, i) => (
            <div key={i} className="chatdock-prop">
              <span className="chatdock-prop-text">{p}</span>
              <button className="chatdock-prop-add" onClick={() => void approveProposal(p, i)} title="Save as a memory">
                ＋
              </button>
              <button
                className="chatdock-prop-skip"
                onClick={() => setProposals((ps) => (ps ? ps.filter((_, idx) => idx !== i) : ps))}
                title="Skip"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {!showPersona && (
        <div className="chatdock-input">
          {micSupported && (
            <button
              className={`chatdock-mic ${listening ? "live" : ""}`}
              onClick={toggleMic}
              title={listening ? "Listening — take your time; tap to send" : "Speak instead of type"}
              aria-label="Microphone"
            >
              {listening ? "🔴" : "🎤"}
            </button>
          )}
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening — take your time…" : `Message ${spaceName}…`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button className="chatdock-send" onClick={() => void send(input)} disabled={busy || !input.trim()}>
            ➤
          </button>
        </div>
      )}
    </div>
  );
}
