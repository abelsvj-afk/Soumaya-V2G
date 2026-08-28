import { useEffect, useRef, useState } from "react";
import { SUGGESTED_TAGS } from "@brain/shared";
import { ingestText } from "../api/client.js";
import { JourneyChips } from "./JourneyChips.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SpeechRec =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

/** datetime-local value (local wall-clock, no tz) → ISO 8601 UTC, or undefined. */
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function IngestPanel({
  onIngested,
  onClose,
}: {
  onIngested: (newIds?: number[], fuelEarned?: number, linkCount?: number) => void;
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
  // Temporal + context metadata.
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [showWhen, setShowWhen] = useState(false);
  const [occurred, setOccurred] = useState(""); // datetime-local
  const [remind, setRemind] = useState(""); // datetime-local
  const recRef = useRef<any>(null);
  // The most recently saved capture's node id — shown as an optional, skippable
  // "add to a Journey?" prompt below the confirmation. Cleared on the next submit or
  // after ~8s untouched (docs/specs/journeys-connective-tissue.md).
  const [savedNodeId, setSavedNodeId] = useState<number | null>(null);
  const savedNodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedNodeTimerRef.current) clearTimeout(savedNodeTimerRef.current); }, []);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setCustomTag("");
  };

  async function submit() {
    const body = details.trim() ? `${text.trim()}\n\n${details.trim()}` : text.trim();
    if (!body) return;
    recRef.current?.stop();
    setBusy(true);
    setMsg("");
    if (savedNodeTimerRef.current) clearTimeout(savedNodeTimerRef.current);
    setSavedNodeId(null);
    try {
      const r = await ingestText(body, {
        ...(action ? { kind: "action" as const, ttlHours: ttl } : {}),
        ...(tags.length ? { tags } : {}),
        ...(toIso(occurred) ? { occurredAt: toIso(occurred) } : {}),
        ...(toIso(remind) ? { remindAt: toIso(remind) } : {}),
      });
      const n = r.nodes.length;
      const e = r.extractedEdges.length + r.associativeEdges.length;
      const fuelBit = r.fuelEarned ? ` · +${r.fuelEarned.toFixed(1)} ⛽` : "";
      // #9 "no research zone": tell the user whether this is worth a deep-dive. A
      // weighty memory may get researched in Research Mode; a light one is just stored.
      const weighty = r.nodes.some((x: any) => (x.importance ?? 0) >= 0.6);
      const researchBit = action ? "" : weighty ? " · 🔬 may deep-dive in Research Mode" : " · 🗃️ stored, no research needed";
      setMsg(
        action
          ? `Action item added (expires in ${ttl}h)${fuelBit}`
          : `+${n} node${n !== 1 ? "s" : ""}, ${e} connection${e !== 1 ? "s" : ""}${fuelBit}${researchBit}`,
      );
      setText("");
      setDetails("");
      setShowDetails(false);
      setTags([]);
      setOccurred("");
      setRemind("");
      setShowWhen(false);
      const firstId = r.nodes[0]?.id ?? null;
      setSavedNodeId(firstId);
      if (firstId != null) {
        savedNodeTimerRef.current = setTimeout(() => setSavedNodeId(null), 8000);
      }
      onIngested(r.nodes.map((x: any) => x.id), r.fuelEarned, e);
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

      {/* Tag chips: curated blend (life-areas + moods) plus free-form. */}
      <div className="tag-row">
        {SUGGESTED_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tag-chip ${tags.includes(t) ? "on" : ""}`}
            onClick={() => toggleTag(t)}
          >
            {t}
          </button>
        ))}
        {tags
          .filter((t) => !SUGGESTED_TAGS.includes(t))
          .map((t) => (
            <button key={t} type="button" className="tag-chip on" onClick={() => toggleTag(t)}>
              {t} ×
            </button>
          ))}
        <input
          className="tag-input"
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustomTag();
            }
          }}
          placeholder="+ tag"
          aria-label="Add a custom tag"
        />
      </div>

      {/* When did this happen + optional reminder. */}
      {showWhen ? (
        <div className="when-block">
          <label className="when-field">
            <span>🕰️ When did this happen?</span>
            <input
              type="datetime-local"
              value={occurred}
              onChange={(e) => setOccurred(e.target.value)}
            />
          </label>
          <label className="when-field">
            <span>⏰ Remind me</span>
            <input
              type="datetime-local"
              value={remind}
              onChange={(e) => setRemind(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <button className="ingest-more" onClick={() => setShowWhen(true)}>
          + When / remind me (optional)
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
      {savedNodeId != null && (
        <div className="ingest-journey-prompt">
          <JourneyChips kind="node" refId={savedNodeId} />
        </div>
      )}
    </div>
  );
}
