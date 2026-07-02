import { useEffect, useState } from "react";
import type { AwayDigest, GraphNode, Constellation, Insight } from "@brain/shared";
import {
  getConstellations,
  getDigest,
  getDailyContact,
  answerDailyContact,
  type DailyContact,
} from "../api/client.js";
import { dailyQuests } from "./quests.js";
import { playSfx } from "../graph/sfx.js";
import { pushToast } from "./Toasts.js";
import { SoumayaEye } from "./SoumayaEye.js";

/** Why she's asking — the icon that frames her daily question. */
const CONTACT_ICON: Record<string, string> = {
  research: "🔬",
  contradiction: "⚡",
  cooling: "❄️",
  heavy: "🖤",
};

/** "13 hours" / "2 days" from an away duration. */
function humanAway(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "a little while";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/**
 * The Observatory — a calm home that fades in *after* the cinematic fly-in settles
 * (it never touches the intro). A handful of live, click-through cards orient the
 * owner in one glance instead of dropping them into the full galaxy. Progressive
 * disclosure: essentials here, detail one click deeper. Offline-safe — every card
 * degrades to nothing if its data isn't there; the galaxy is always reachable via
 * "Enter the galaxy".
 *
 * This is the ONE arrival screen: the "while you were away" report renders as its
 * top card (a separate welcome-back overlay used to stack on top of this — two
 * pop-ups both saying "welcome back" with their own Enter buttons).
 */
export function Observatory({
  spaceName,
  memories,
  streak,
  fedToday,
  away,
  onCapture,
  onFocus,
  onOpenInsights,
  onEnter,
}: {
  spaceName: string;
  memories: GraphNode[]; // non-action nodes
  streak: number;
  fedToday: boolean;
  /** "While you were away" digest (null/undefined = nothing to report). */
  away?: AwayDigest | null;
  onCapture: () => void;
  onFocus: (id: number) => void;
  onOpenInsights: () => void;
  onEnter: () => void;
}) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  // The Daily Contact — she initiates; answering right here feeds the brain.
  const [contact, setContact] = useState<DailyContact | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getDigest()
      .then((items) => setInsight(items[0] ?? null))
      .catch(() => {});
    getConstellations()
      .then((c) => setConstellations(c.slice(0, 3)))
      .catch(() => {});
    getDailyContact()
      .then(setContact)
      .catch(() => {});
  }, []);
  // The welcome-home motif used to play from the separate away card.
  useEffect(() => {
    if (away) playSfx("welcome");
  }, [away]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await answerDailyContact(text);
      if (r) {
        setContact((c) => (c ? { ...c, answered: true } : c));
        setReply("");
        playSfx("achievement");
        pushToast(
          `She's weaving your answer into the galaxy ✦ +${Math.round(r.fuelEarned * 10) / 10} ⛽${r.streakAdvanced ? " · 🔥 streak fed" : ""}`,
          "🛰️",
          6500,
        );
      } else {
        pushToast("Couldn't reach her — try again in a moment.", "⚠️", 4500);
      }
    } finally {
      setSending(false);
    }
  };

  const count = memories.length;
  // Most-recent memories ("jump back in") — newest first by created time.
  const recent = [...memories]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 3);

  // New brain: a single calm hero, not an empty card grid.
  if (count === 0) {
    return (
      <div className="observatory" role="dialog" aria-label="Welcome">
        <div className="obs-card obs-hero">
          <h2>Welcome, {spaceName}.</h2>
          <p>Your galaxy is empty. Drop your first thought and watch it become a star.</p>
          <button className="obs-primary" onClick={onCapture}>
            ✍️ Drop your first thought
          </button>
          <button className="obs-enter" onClick={onEnter}>
            Enter the galaxy →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="observatory" role="dialog" aria-label="Observatory home">
      <div className="obs-stack">
        <header className="obs-head">
          <h2>Welcome back, {spaceName}.</h2>
          <span className="obs-sub">
            {count} {count === 1 ? "memory" : "memories"}
            {streak > 0 ? ` · 🔥 ${streak}-day streak` : ""}
            {away ? ` · away ${humanAway(away.awayMs)}` : ""}
          </span>
        </header>

        {away && (
          <div className="obs-card obs-away">
            <span className="obs-ic">🛰️</span>
            <span className="obs-body">
              <span className="obs-title">While you were away</span>
              {away.agentActions.length > 0 && (
                <span className="obs-line">
                  ✦ She {away.agentActions.map((a) => a.label).join(", ")}.
                </span>
              )}
              {(away.newContradictions > 0 || away.expiredActions > 0 || away.cooling > 0) && (
                <span className="obs-line">
                  {[
                    away.newContradictions > 0
                      ? `⚡ ${away.newContradictions} contradiction${away.newContradictions === 1 ? "" : "s"} to reconcile`
                      : null,
                    away.expiredActions > 0
                      ? `⏰ ${away.expiredActions} action${away.expiredActions === 1 ? "" : "s"} expired`
                      : null,
                    away.cooling > 0 ? `❄️ ${away.cooling} cooling` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
              {(away.dueReminders.length > 0 || away.resurfaced) && (
                <span className="obs-chips">
                  {away.dueReminders.map((r) => (
                    <button key={r.id} className="obs-chip" onClick={() => onFocus(r.id)} title="Reminder due — fly to it">
                      🔔 {r.label.length > 24 ? `${r.label.slice(0, 24)}…` : r.label}
                    </button>
                  ))}
                  {away.resurfaced && (
                    <button
                      className="obs-chip"
                      onClick={() => onFocus(away.resurfaced!.id)}
                      title={`Resurfaced from ${away.resurfaced.dormantDays} days ago`}
                    >
                      💤 {away.resurfaced.label.length > 24 ? `${away.resurfaced.label.slice(0, 24)}…` : away.resurfaced.label}
                    </button>
                  )}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Her Daily Contact — the reason to come back: SHE has something for you. */}
        {contact?.question && !contact.answered && (
          <div className="obs-card obs-contact">
            <span className="obs-ic">
              <SoumayaEye state="idle" mood="thoughtful" size={26} />
            </span>
            <span className="obs-body">
              <span className="obs-title">
                {CONTACT_ICON[contact.question.source] ?? "🪞"} She has a question for you
              </span>
              <span className="obs-line">{contact.question.text}</span>
              {contact.question.nodeId != null && (
                <button
                  className="obs-chip"
                  onClick={() => onFocus(contact.question!.nodeId!)}
                  title="Fly to the memory she's asking about"
                >
                  ✦ {contact.question.nodeLabel}
                </button>
              )}
              <span className="obs-answer">
                <textarea
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Answer her — it becomes a memory…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                />
                <button className="obs-answer-send" onClick={() => void sendReply()} disabled={sending || !reply.trim()}>
                  {sending ? "…" : "➤"}
                </button>
              </span>
            </span>
          </div>
        )}
        {contact?.question && contact.answered && (
          <div className="obs-card obs-contact answered">
            <span className="obs-ic">✓</span>
            <span className="obs-body">
              <span className="obs-title">You answered her today</span>
              <span className="obs-line">She's weaving it in — come back tomorrow, she'll have a new one.</span>
            </span>
          </div>
        )}
        {contact?.discovery && (
          <button
            className="obs-card"
            onClick={() => contact.discovery!.nodeId != null && onFocus(contact.discovery!.nodeId!)}
            title="Her best recent find"
          >
            <span className="obs-ic">🔭</span>
            <span className="obs-body">
              <span className="obs-title">Her discovery of the day</span>
              <span className="obs-line obs-clamp">{contact.discovery.text}</span>
            </span>
          </button>
        )}

        <button className="obs-card obs-action" onClick={onCapture}>
          <span className="obs-ic">✍️</span>
          <span className="obs-body">
            <span className="obs-title">Capture a thought</span>
            <span className="obs-line">Add to your galaxy — it links itself.</span>
          </span>
        </button>

        {(() => {
          const quests = dailyQuests(memories, fedToday);
          return (
            <div className="obs-card obs-quests">
              <span className="obs-ic">🎯</span>
              <span className="obs-body">
                <span className="obs-title">Today's tending</span>
                <span className="obs-questlist">
                  {quests.map((q) => (
                    <button
                      key={q.id}
                      className={`obs-quest ${q.done ? "done" : ""}`}
                      onClick={() => (q.action === "capture" ? onCapture() : q.focusId != null ? onFocus(q.focusId) : onOpenInsights())}
                      disabled={q.done && q.action === "capture"}
                    >
                      <span className="obs-quest-ic">{q.done ? "✓" : q.icon}</span>
                      {q.text}
                    </button>
                  ))}
                </span>
              </span>
            </div>
          );
        })()}

        {/* (The old "surfaced a connection" card merged into "Her discovery of the
            day" above — same data, one card.) */}
        {!contact?.discovery && insight && (
          <button
            className="obs-card"
            onClick={() => (insight.nodes[0] ? onFocus(insight.nodes[0].id) : onOpenInsights())}
            title="See the connection"
          >
            <span className="obs-ic">🔭</span>
            <span className="obs-body">
              <span className="obs-title">Her discovery of the day</span>
              <span className="obs-line obs-clamp">{insight.text}</span>
            </span>
          </button>
        )}

        {constellations.length > 0 && (
          <div className="obs-card obs-constellations">
            <span className="obs-ic">✦</span>
            <span className="obs-body">
              <span className="obs-title">Your constellations</span>
              <span className="obs-chips">
                {constellations.map((c) => (
                  <button
                    key={c.id}
                    className="obs-chip"
                    onClick={() => c.nodes[0] && onFocus(c.nodes[0].id)}
                    title={`${c.nodes.length} memories`}
                  >
                    {c.name}
                  </button>
                ))}
              </span>
            </span>
          </div>
        )}

        {recent.length > 0 && (
          <div className="obs-card obs-recent">
            <span className="obs-ic">🛰️</span>
            <span className="obs-body">
              <span className="obs-title">Jump back in</span>
              <span className="obs-chips">
                {recent.map((n) => (
                  <button key={n.id} className="obs-chip" onClick={() => onFocus(n.id)}>
                    {n.label.length > 28 ? `${n.label.slice(0, 28)}…` : n.label}
                  </button>
                ))}
              </span>
            </span>
          </div>
        )}

        <button className="obs-enter" onClick={onEnter}>
          Enter the galaxy →
        </button>
      </div>
    </div>
  );
}
