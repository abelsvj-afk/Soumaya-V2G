import { useEffect, useState } from "react";
import { getInquiries, answerInquiry, dismissInquiry, type Inquiry } from "../api/client.js";
import { pushToast } from "./Toasts.js";
import { playSfx } from "../graph/sfx.js";

/**
 * "Soumaya noticed…" — the proactive-intelligence surface. When she spots a
 * structural connection in your graph (a memory bridging two people/goals, a note
 * sitting on an anchor it didn't name, an emerging theme) she raises ONE grounded
 * question here. Answering ingests + links your reply, so her noticing grows the
 * brain. Self-contained: polls /api/inquiries, shows the freshest open one, and
 * lets you fly to the bodies she's asking about, answer, or wave it off.
 *
 * Hidden while a panel is open (so it never covers the dock) and in demo brains.
 */
export function NoticingCard({
  onFocus,
  onAnswered,
  hidden,
  demo,
}: {
  onFocus: (id: number) => void;
  onAnswered?: () => void;
  hidden?: boolean;
  demo?: boolean;
}) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => getInquiries().then(setInquiries).catch(() => {});
  useEffect(() => {
    if (demo) return;
    refresh();
    const t = setInterval(refresh, 30_000);
    // A fresh memory can produce a noticing server-side — re-check after ingests.
    const onIngest = () => setTimeout(refresh, 800);
    window.addEventListener("brain-memory-added", onIngest);
    return () => {
      clearInterval(t);
      window.removeEventListener("brain-memory-added", onIngest);
    };
  }, [demo]);

  if (demo || hidden || inquiries.length === 0) return null;
  const q = inquiries[0]!;

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const r = await answerInquiry(q.id, reply.trim());
      if (r) {
        playSfx("achievement");
        pushToast("Answered — woven into your galaxy 🧠", "💭", 4000);
        setReply("");
        await refresh();
        onAnswered?.();
      } else {
        pushToast("Couldn't send that — try again.", "⚠️", 3500);
      }
    } finally {
      setBusy(false);
    }
  };
  const wave = async () => {
    setInquiries((xs) => xs.filter((x) => x.id !== q.id));
    await dismissInquiry(q.id);
  };

  return (
    <div className="noticing-card" role="dialog" aria-label="Soumaya noticed something">
      <div className="noticing-head">
        <span className="noticing-eye">💭</span>
        <span className="noticing-title">Soumaya noticed{inquiries.length > 1 ? ` (1 of ${inquiries.length})` : ""}</span>
        <button className="noticing-x" onClick={() => void wave()} aria-label="Not now">×</button>
      </div>
      <p className="noticing-q">{q.question}</p>
      {q.nodes.length > 0 && (
        <div className="noticing-chips">
          {q.nodes.map((n) => (
            <button key={n.id} className="noticing-chip" onClick={() => onFocus(n.id)} title="Fly to it">
              {n.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        className="companion-textarea"
        rows={2}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        placeholder="Tell her… (this becomes a memory, linked in)"
      />
      <div className="noticing-actions">
        <button onClick={() => void send()} disabled={busy || !reply.trim()}>
          {busy ? "Weaving…" : "Answer"}
        </button>
        <button className="mini ghost" onClick={() => void wave()}>Not now</button>
      </div>
    </div>
  );
}
