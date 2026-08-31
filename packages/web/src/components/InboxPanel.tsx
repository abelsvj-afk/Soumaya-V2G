import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type InboxNotification,
  cleanupNotifications,
  readNotifications,
  writeNotifications,
} from "./Toasts.js";

interface InboxPanelProps {
  spaceId: string;
}

export function InboxPanel({ spaceId }: InboxPanelProps) {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unseen" | "seen">("unseen");

  const loadNotifications = useCallback(() => {
    setNotifications(readNotifications(spaceId));
  }, [spaceId]);

  useEffect(() => {
    // Prune BEFORE the first read. The old order (load, then prune) left state
    // holding rows that no longer existed in storage — and because every mutation
    // below used to write React state back wholesale, the next Mark-All-Read or
    // Clear-History RESURRECTED everything cleanup had just deleted.
    cleanupNotifications(spaceId);
    loadNotifications();

    window.addEventListener("brain-notifications-updated", loadNotifications);
    // Real cross-tab sync. The old comment claimed to listen for "other tabs" but
    // only registered the in-window custom event, so another tab's notifications
    // never appeared.
    window.addEventListener("storage", loadNotifications);
    return () => {
      window.removeEventListener("brain-notifications-updated", loadNotifications);
      window.removeEventListener("storage", loadNotifications);
    };
  }, [spaceId, loadNotifications]);

  /**
   * Every mutation goes through here. It re-reads storage first rather than trusting
   * React state: `pushToast` appends to the same key concurrently, so a toast that
   * fired since the last render would be silently erased by a state-based write.
   * Read → modify → write → announce.
   */
  const mutate = useCallback(
    (fn: (list: InboxNotification[]) => InboxNotification[]) => {
      const next = fn(readNotifications(spaceId));
      writeNotifications(next, spaceId); // dispatches; our own listener re-reads
      setNotifications(next);
    },
    [spaceId],
  );

  const handleMarkSeen = (id: string) =>
    mutate((list) => list.map((n) => (n.id === id ? { ...n, seen: true, seenAt: Date.now() } : n)));

  const handleMarkAllSeen = () =>
    mutate((list) => list.map((n) => (n.seen ? n : { ...n, seen: true, seenAt: Date.now() })));

  const handleClearHistory = () => {
    const seenCount = notifications.filter((n) => n.seen).length;
    if (seenCount === 0) return;
    // Destructive and irreversible — it used to wipe the whole history on one tap.
    if (!confirm(`Clear ${seenCount} read notification${seenCount === 1 ? "" : "s"}? This can't be undone.`)) return;
    mutate((list) => list.filter((n) => !n.seen));
  };

  const unseenList = useMemo(() => notifications.filter((n) => !n.seen), [notifications]);
  const seenList = useMemo(() => notifications.filter((n) => n.seen), [notifications]);

  // Sort: newest first.
  const sortedList = useMemo(() => {
    const displayed = filter === "unseen" ? unseenList : filter === "seen" ? seenList : notifications;
    return [...displayed].sort((a, b) => b.timestamp - a.timestamp);
  }, [filter, unseenList, seenList, notifications]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="dock-body notification-inbox" style={{ display: "flex", flexDirection: "column", height: "100%", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Notification Log</h2>
        {unseenList.length > 0 && (
          <button
            onClick={handleMarkAllSeen}
            className="nc-action-btn"
            style={{ fontSize: "0.75rem", padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--glass-border)", borderRadius: "4px", color: "var(--text)", cursor: "pointer" }}
          >
            Mark All Read
          </button>
        )}
      </div>

      <p className="section-desc" style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "-4px 0 8px 0" }}>
        Important alerts stay until read. Normal logs expire after 24h.
      </p>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "8px" }}>
        <button
          onClick={() => setFilter("all")}
          style={{
            background: filter === "all" ? "var(--accent-dim, rgba(168, 85, 247, 0.2))" : "transparent",
            color: filter === "all" ? "var(--text)" : "var(--muted)",
            border: "1px solid " + (filter === "all" ? "var(--accent)" : "var(--glass-border)"),
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "0.8rem",
            cursor: "pointer",
            fontWeight: 500
          }}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter("unseen")}
          style={{
            background: filter === "unseen" ? "var(--accent-dim, rgba(168, 85, 247, 0.2))" : "transparent",
            color: filter === "unseen" ? "var(--text)" : "var(--muted)",
            border: "1px solid " + (filter === "unseen" ? "var(--accent)" : "var(--glass-border)"),
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "0.8rem",
            cursor: "pointer",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          Inbox
          {unseenList.length > 0 && (
            <span style={{ background: "#ef4444", color: "white", borderRadius: "50%", padding: "1px 6px", fontSize: "0.7rem", fontWeight: "bold" }}>
              {unseenList.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setFilter("seen")}
          style={{
            background: filter === "seen" ? "var(--accent-dim, rgba(168, 85, 247, 0.2))" : "transparent",
            color: filter === "seen" ? "var(--text)" : "var(--muted)",
            border: "1px solid " + (filter === "seen" ? "var(--accent)" : "var(--glass-border)"),
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "0.8rem",
            cursor: "pointer",
            fontWeight: 500
          }}
        >
          History ({seenList.length})
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
        {sortedList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)", fontSize: "0.85rem" }}>
            {filter === "unseen"
              ? "Your inbox is completely clear! 🚀"
              : filter === "seen"
                ? "No dismissed notifications in history."
                : "No notifications yet."}
          </div>
        ) : (
          sortedList.map((item) => {
            const isHigh = item.priority === "high";
            return (
              <div
                key={item.id}
                style={{
                  background: isHigh && !item.seen ? "rgba(168, 85, 247, 0.08)" : "var(--glass-panel, rgba(255, 255, 255, 0.03))",
                  border: `1px solid ${isHigh && !item.seen ? "rgba(168, 85, 247, 0.3)" : "var(--glass-border)"}`,
                  borderRadius: "6px",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  transition: "all 0.25s ease",
                  position: "relative"
                }}
              >
                <span style={{ fontSize: "1.2rem", flexShrink: 0, marginTop: "2px" }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
                    <div style={{ fontSize: "0.82rem", color: "var(--text)", wordBreak: "break-word", lineHeight: 1.35 }}>
                      {item.text}
                    </div>
                    {!item.seen && (
                      <button
                        onClick={() => handleMarkSeen(item.id)}
                        title="Mark as seen"
                        aria-label="Mark as seen"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--accent)",
                          cursor: "pointer",
                          padding: "2px",
                          fontSize: "1.1rem",
                          lineHeight: 1,
                          flexShrink: 0,
                          transition: "transform 0.2s"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        ✓
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{formatTime(item.timestamp)}</span>
                    {isHigh && (
                      <span style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", borderRadius: "3px", padding: "1px 4px", fontSize: "0.62rem", fontWeight: "bold" }}>
                        IMPORTANT
                      </span>
                    )}
                    {item.seen && (
                      <span style={{ color: "var(--muted)", fontSize: "0.7rem", fontStyle: "italic" }}>
                        (Dismissed)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {filter === "seen" && seenList.length > 0 && (
        <button
          onClick={handleClearHistory}
          style={{
            width: "100%",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "4px",
            color: "#f87171",
            padding: "6px",
            fontSize: "0.78rem",
            cursor: "pointer",
            fontWeight: 500,
            marginTop: "auto"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)")}
        >
          Clear History
        </button>
      )}
    </div>
  );
}
