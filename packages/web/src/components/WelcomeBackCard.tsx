import { useEffect } from "react";
import type { AwayDigest } from "@brain/shared";
import { playSfx } from "../graph/sfx.js";

/**
 * "While you were away" — a calm welcome-back card that reports what Soumaya did in
 * the background and what now needs you, since your last visit. Shown once per return
 * (only after a real absence with something to say); dismissing advances the window.
 */
function humanAway(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "a little while";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

export function WelcomeBackCard({
  digest,
  onFocus,
  onClose,
}: {
  digest: AwayDigest;
  onFocus: (id: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    playSfx("welcome");
  }, []);
  const did = digest.agentActions;
  const needs =
    digest.newContradictions + digest.expiredActions + digest.dueReminders.length + (digest.cooling > 0 ? 1 : 0);

  return (
    <div className="welcome-overlay" role="dialog" aria-label="While you were away" style={overlay}>
      <div style={card}>
        <div style={{ fontSize: "0.72rem", opacity: 0.6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          While you were away · {humanAway(digest.awayMs)}
        </div>
        <h2 style={{ margin: "0.3rem 0 0.9rem 0", fontSize: "1.15rem" }}>🛰️ {digest.greeting}</h2>

        {did.length > 0 && (
          <div style={section}>
            <div style={heading}>Soumaya tended your galaxy</div>
            <ul style={list}>
              {did.map((a) => (
                <li key={a.type} style={item}>
                  ✦ She {a.label}.
                </li>
              ))}
            </ul>
          </div>
        )}

        {needs > 0 && (
          <div style={section}>
            <div style={heading}>Waiting for you</div>
            <ul style={list}>
              {digest.newContradictions > 0 && (
                <li style={item}>
                  ⚡ {digest.newContradictions} contradiction{digest.newContradictions === 1 ? "" : "s"} surfaced to reconcile.
                </li>
              )}
              {digest.expiredActions > 0 && (
                <li style={item}>
                  ⏰ {digest.expiredActions} action item{digest.expiredActions === 1 ? "" : "s"} expired.
                </li>
              )}
              {digest.dueReminders.map((r) => (
                <li key={r.id} style={item}>
                  🔔 Reminder due:{" "}
                  <button style={linkBtn} onClick={() => { onFocus(r.id); onClose(); }}>
                    {r.label}
                  </button>
                </li>
              ))}
              {digest.cooling > 0 && (
                <li style={item}>❄️ {digest.cooling} memor{digest.cooling === 1 ? "y is" : "ies are"} cooling — a visit warms them.</li>
              )}
            </ul>
          </div>
        )}

        {digest.resurfaced && (
          <div style={section}>
            <div style={heading}>Resurfaced for today</div>
            <div style={item}>
              💤 A note from {digest.resurfaced.dormantDays} days ago:{" "}
              <button style={linkBtn} onClick={() => { onFocus(digest.resurfaced!.id); onClose(); }}>
                {digest.resurfaced.label}
              </button>
            </div>
          </div>
        )}

        <button style={enterBtn} onClick={onClose}>
          Enter the galaxy →
        </button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(4, 6, 18, 0.55)",
  backdropFilter: "blur(6px)",
  padding: "1.2rem",
};
const card: React.CSSProperties = {
  width: "min(440px, 100%)",
  maxHeight: "80vh",
  overflowY: "auto",
  background: "linear-gradient(160deg, rgba(18,22,44,0.96), rgba(10,12,28,0.96))",
  border: "1px solid rgba(122,200,255,0.22)",
  borderRadius: "14px",
  padding: "1.3rem 1.4rem",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  color: "#e8ecff",
};
const section: React.CSSProperties = { marginBottom: "0.9rem" };
const heading: React.CSSProperties = { fontSize: "0.72rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.35rem" };
const list: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.3rem" };
const item: React.CSSProperties = { fontSize: "0.86rem", lineHeight: 1.4 };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#7af9ff", cursor: "pointer", padding: 0, fontSize: "0.86rem", textDecoration: "underline" };
const enterBtn: React.CSSProperties = {
  marginTop: "0.4rem",
  width: "100%",
  padding: "0.6rem",
  borderRadius: "8px",
  border: "1px solid rgba(122,200,255,0.35)",
  background: "rgba(122,200,255,0.12)",
  color: "#e8ecff",
  fontSize: "0.9rem",
  cursor: "pointer",
};
