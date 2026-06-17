import { useRef, useState } from "react";
import { ingestText } from "../api/client.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SpeechRec =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

export function IngestPanel({
  onIngested,
  onClose,
}: {
  onIngested: (newIds?: number[]) => void;
  onClose?: () => void;
}) {
  const [text, setText] = useState("");
  const [details, setDetails] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [listening, setListening] = useState(false);
  const [action, setAction] = useState(false);
  const [ttl, setTtl] = useState(24); // hours
  const recRef = useRef<any>(null);

  async function submit() {
    const body = details.trim() ? `${text.trim()}\n\n${details.trim()}` : text.trim();
    if (!body) return;
    recRef.current?.stop();
    setBusy(true);
    setMsg("");
    try {
      const r = await ingestText(body, action ? { kind: "action", ttlHours: ttl } : undefined);
      const n = r.nodes.length;
      const e = r.extractedEdges.length + r.associativeEdges.length;
      setMsg(action ? `Action item added (expires in ${ttl}h)` : `+${n} node${n !== 1 ? "s" : ""}, ${e} connection${e !== 1 ? "s" : ""}`);
      setText("");
      setDetails("");
      setShowDetails(false);
      onIngested(r.nodes.map((x: any) => x.id));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Voice → text via the browser's Web Speech API (no dependency, mobile Chrome OK).
  function toggleMic() {
    if (!SpeechRec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) setText((t) => (t ? `${t} ${final.trim()}` : final.trim()));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="panel ingest">
      <div className="panel-head">
        <h2>Dump a thought</h2>
        {onClose && (
          <button className="panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A business idea, a reflection, a random thought…"
        rows={4}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />

      {showDetails ? (
        <textarea
          className="ingest-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="More context (optional) — the why, the backstory, related people, how it makes you feel…"
          rows={3}
        />
      ) : (
        <button className="ingest-more" onClick={() => setShowDetails(true)}>
          + Add more context (optional)
        </button>
      )}

      <label className="action-toggle">
        <input type="checkbox" checked={action} onChange={(e) => setAction(e.target.checked)} />
        📌 Action item (a to-do that times out)
        {action && (
          <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
            <option value={24}>today (24h)</option>
            <option value={72}>3 days</option>
            <option value={168}>1 week</option>
          </select>
        )}
      </label>

      <div className="row">
        <button onClick={submit} disabled={busy}>
          {busy ? "Thinking…" : action ? "Add action item" : "Add to brain"}
        </button>
        {SpeechRec && (
          <button
            className={`mic-btn ${listening ? "on" : ""}`}
            onClick={toggleMic}
            title={listening ? "Stop recording" : "Speak your memory"}
            aria-label="Voice input"
          >
            {listening ? "● Listening…" : "🎤 Speak"}
          </button>
        )}
        <span className="msg">{msg}</span>
      </div>
    </div>
  );
}
