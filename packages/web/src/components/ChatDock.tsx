import { useEffect, useRef, useState } from "react";
import type { NodeRef } from "@brain/shared";
import { askChat, getSpaceId } from "../api/client.js";
import { colorForType } from "../graph/theme.js";
import { isVoiceSupported, isVoiceEnabled, setVoiceEnabled, speak, stopSpeaking } from "../voice.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ChatMessage {
  role: "you" | "soumaya";
  text: string;
  citations?: NodeRef[];
}

/** Browser SpeechRecognition (Chrome/Safari prefix it). Null if unsupported. */
function getRecognition(): any {
  const w = window as any;
  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Rec ? new Rec() : null;
}

const chatKey = (): string => `brain.chat.${getSpaceId() ?? "default"}`;

/**
 * Floating chat with Soumaya — a real conversation card (full back-and-forth
 * history, citations you can fly to, speak-to-type via the mic, optional voice
 * readback). Opened by the 💬 FAB; lives outside the dock so the flight-task
 * list never shoves it around. History persists per-brain in localStorage.
 */
export function ChatDock({
  spaceName = "Soumaya",
  onClose,
  onFocus,
  onRecall,
}: {
  spaceName?: string;
  onClose: () => void;
  onFocus: (id: number) => void;
  onRecall?: (ids: number[]) => void;
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
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const voiceSupported = isVoiceSupported();
  const micSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Persist + autoscroll on every change.
  useEffect(() => {
    try {
      localStorage.setItem(chatKey(), JSON.stringify(messages.slice(-60)));
    } catch {
      /* storage unavailable */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => { stopSpeaking(); recRef.current?.stop?.(); }, []);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "you", text: q }]);
    setBusy(true);
    try {
      const r = await askChat(q);
      const citations = r.citations ?? [];
      setMessages((m) => [...m, { role: "soumaya", text: r.answer || "(no answer)", citations }]);
      if (citations.length > 0) onRecall?.(citations.map((c) => c.id));
      if (speakOn) speak(r.answer, r.tone);
    } catch (err) {
      setMessages((m) => [...m, { role: "soumaya", text: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  // Mic: speak instead of type. Transcribes into the input, auto-sends on the
  // final result (hands-free, ChatGPT-style). Tap again to stop early.
  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop?.();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      const said = finalText.trim();
      if (said) void send(said);
    };
    setListening(true);
    rec.start();
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
  };

  return (
    <div className="chatdock" role="dialog" aria-label={`Chat with ${spaceName}`}>
      <header className="chatdock-head">
        <span className="chatdock-title">💬 {spaceName}</span>
        <div className="chatdock-tools">
          {voiceSupported && (
            <button
              className={`chatdock-tool ${speakOn ? "on" : ""}`}
              onClick={toggleSpeak}
              title={speakOn ? "Voice replies on" : "Voice replies off"}
            >
              {speakOn ? "🔊" : "🔈"}
            </button>
          )}
          {messages.length > 0 && (
            <button className="chatdock-tool" onClick={clearChat} title="Clear conversation">
              🗑
            </button>
          )}
          <button className="chatdock-tool" onClick={onClose} title="Close" aria-label="Close">
            ×
          </button>
        </div>
      </header>

      <div className="chatdock-msgs" ref={listRef}>
        {messages.length === 0 && (
          <p className="chatdock-empty">
            Ask {spaceName} anything about your galaxy — she answers from your memories and cites them.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chatdock-msg ${m.role}`}>
            <div className="chatdock-bubble">{m.text}</div>
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
          </div>
        ))}
        {busy && <div className="chatdock-msg soumaya"><div className="chatdock-bubble typing">…</div></div>}
      </div>

      <div className="chatdock-input">
        {micSupported && (
          <button
            className={`chatdock-mic ${listening ? "live" : ""}`}
            onClick={toggleMic}
            title={listening ? "Listening — tap to stop" : "Speak instead of type"}
            aria-label="Microphone"
          >
            {listening ? "🔴" : "🎤"}
          </button>
        )}
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : `Message ${spaceName}…`}
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
    </div>
  );
}
