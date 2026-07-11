import { useEffect, useState } from "react";
import { getInquiries, answerInquiry, dismissInquiry, rejectInquiry, confirmInquiry, type Inquiry } from "../api/client.js";
import { pushToast } from "./Toasts.js";
import { playSfx } from "../graph/sfx.js";

/**
 * "Soumaya noticed…" — the proactive-intelligence surface. She NEVER pops this open on
 * her own anymore. It's a quiet 💭 button that only appears when she has something, and
 * GLOWS while that something is new/unseen. Opening it clears the glow — even if you
 * don't act — because you've now seen it; a fresh noticing lights it up again. Tap to
 * read her grounded question, fly to the bodies involved, answer, connect, or wave off.
 *
 * Hidden entirely while a panel/Observatory is up (via `hidden`) and in demo brains.
 */
export function NoticingCard({
  onFocus,
  onAnswered,
  hidden,
  demo,
  spaceId,
}: {
  onFocus: (id: number) => void;
  onAnswered?: () => void;
  hidden?: boolean;
  demo?: boolean;
  spaceId?: string;
}) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const seenKey = `brain.noticing.seen.${spaceId ?? "legacy"}`;
  const [seenId, setSeenId] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(seenKey) || "0", 10) || 0; } catch { return 0; }
  });
  // Re-sync the "seen" baseline when the brain changes (undefined→real id at login),
  // otherwise the button re-glows for noticings already seen in this space.
  useEffect(() => {
    try { setSeenId(parseInt(localStorage.getItem(seenKey) || "0", 10) || 0); } catch { setSeenId(0); }
  }, [seenKey]);

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
  const maxId = inquiries.reduce((m, i) => Math.max(m, i.id), 0);
  const glow = maxId > seenId; // there's a noticing you haven't opened yet

  // Opening marks everything currently here as "seen" so the glow stops — whether or not
  // you end up acting on it. (A later, higher-id noticing re-lights the button.)
  const markSeen = () => {
    if (maxId > seenId) {
      setSeenId(maxId);
      try { localStorage.setItem(seenKey, String(maxId)); } catch { /* ignore */ }
    }
  };
  const toggle = () => {
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      markSeen();
    }
  };

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
  const afterAct = async () => {
    // If that was the last one, close the popover; the button hides itself (length 0).
    const remaining = inquiries.filter((x) => x.id !== q.id);
    if (remaining.length === 0) setOpen(false);
  };
  const wave = async () => {
    setInquiries((xs) => xs.filter((x) => x.id !== q.id));
    await dismissInquiry(q.id);
    void afterAct();
  };
  const reject = async () => {
    setInquiries((xs) => xs.filter((x) => x.id !== q.id));
    await rejectInquiry(q.id);
    pushToast("Got it — I won't tie those together.", "🧠", 3500);
    onAnswered?.(); // the galaxy may lose an edge → refresh
    void afterAct();
  };
  const isHub = q.kind === "hub_suggestion";
  const isLens = q.kind === "lens_suggestion";
  const confirmToast = isHub
    ? "Constellation named ✨ — a new hub anchors that cluster."
    : isLens
      ? "Lens saved ⧉ — pinned to your galaxy."
      : "Connected ✦ — woven into your galaxy.";
  const confirm = async () => {
    setInquiries((xs) => xs.filter((x) => x.id !== q.id));
    await confirmInquiry(q.id);
    playSfx("achievement");
    pushToast(confirmToast, "🧠", 3500);
    if (isLens) window.dispatchEvent(new Event("brain-lenses-changed")); // refresh the chips
    onAnswered?.();
    void afterAct();
  };
  // A one-tap "yes" makes sense for the connection-style + hub + lens noticings.
  const canConfirm = q.kind === "anchor" || q.kind === "bridge" || isHub || isLens;

  return (
    <>
      <button
        className={`fab noticing-fab ${glow ? "glow" : ""} ${open ? "on" : ""}`}
        onClick={toggle}
        aria-label={`Soumaya noticed ${inquiries.length}`}
        title={glow ? "Soumaya noticed something new" : "Soumaya's noticings"}
      >
        💭
        <span className="fab-badge noticing-count">{inquiries.length > 9 ? "9+" : inquiries.length}</span>
      </button>

      {open && (
        <div className="noticing-card" role="dialog" aria-label="Soumaya noticed something">
          <div className="noticing-head">
            <span className="noticing-eye">💭</span>
            <span className="noticing-title">Soumaya noticed{inquiries.length > 1 ? ` (1 of ${inquiries.length})` : ""}</span>
            <button className="noticing-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <p className="noticing-q">{q.question}</p>
          {q.nodes.length > 0 && (
            <div className="noticing-chips">
              {q.nodes.slice(0, 8).map((n) => (
                <button key={n.id} className="noticing-chip" onClick={() => onFocus(n.id)} title="Fly to it">
                  {n.label}
                </button>
              ))}
              {q.nodes.length > 8 && (
                <span className="noticing-chip noticing-chip-more" aria-label={`${q.nodes.length - 8} more`}>
                  +{q.nodes.length - 8} more
                </span>
              )}
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
            {canConfirm && (
              <button className="noticing-confirm" onClick={() => void confirm()} title="Connect them">
                ✦ Yes, connect
              </button>
            )}
            <button onClick={() => void send()} disabled={busy || !reply.trim()}>
              {busy ? "Weaving…" : "Answer"}
            </button>
            <button className="mini ghost" onClick={() => void reject()} title="Sever this connection and don't suggest it again">
              Not related
            </button>
            <button className="mini ghost" onClick={() => void wave()}>Not now</button>
          </div>
        </div>
      )}
    </>
  );
}
