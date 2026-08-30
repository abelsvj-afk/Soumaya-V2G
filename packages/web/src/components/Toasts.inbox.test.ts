import { describe, it, expect, beforeEach } from "vitest";
import {
  type InboxNotification,
  notificationsKey,
  readNotifications,
  writeNotifications,
  cleanupNotifications,
  INBOX_CAP,
} from "./Toasts.js";

const SPACE = "s1";

function note(over: Partial<InboxNotification>): InboxNotification {
  return {
    id: Math.random().toString(36).slice(2),
    text: "a note",
    icon: "🛰️",
    timestamp: Date.now(),
    seen: false,
    seenAt: null,
    priority: "normal",
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe("inbox storage helpers", () => {
  it("uses one key definition, and falls back to the canonical brain.spaceId", () => {
    expect(notificationsKey(SPACE)).toBe(`brain.notifications.${SPACE}`);
    localStorage.setItem("brain.spaceId", "canonical");
    expect(notificationsKey()).toBe("brain.notifications.canonical");
    localStorage.removeItem("brain.spaceId");
    expect(notificationsKey()).toBe("brain.notifications.default");
  });

  it("reads back an empty list for a missing or corrupt bucket instead of throwing", () => {
    expect(readNotifications(SPACE)).toEqual([]);
    localStorage.setItem(notificationsKey(SPACE), "{not json");
    expect(readNotifications(SPACE)).toEqual([]);
    localStorage.setItem(notificationsKey(SPACE), '{"a":1}'); // valid JSON, wrong shape
    expect(readNotifications(SPACE)).toEqual([]);
  });

  it("caps the stored log at INBOX_CAP, keeping the newest", () => {
    const many = Array.from({ length: INBOX_CAP + 20 }, (_, i) => note({ text: `n${i}` }));
    writeNotifications(many, SPACE);
    const back = readNotifications(SPACE);
    expect(back).toHaveLength(INBOX_CAP);
    expect(back[back.length - 1]!.text).toBe(`n${INBOX_CAP + 19}`);
  });
});

describe("cleanupNotifications", () => {
  const old = Date.now() - 10 * 60 * 1000; // 10 minutes ago

  it("prunes long-seen items but keeps unseen and high-priority ones", () => {
    writeNotifications(
      [
        note({ text: "seen-old", seen: true, seenAt: old }),
        note({ text: "unseen-recent" }),
        note({ text: "important-old", timestamp: Date.now() - 48 * 3600 * 1000, priority: "high" }),
      ],
      SPACE,
    );
    cleanupNotifications(SPACE);
    const texts = readNotifications(SPACE).map((n) => n.text);
    expect(texts).not.toContain("seen-old");
    expect(texts).toContain("unseen-recent");
    expect(texts).toContain("important-old");
  });

  it("announces a real prune so already-loaded readers re-sync", () => {
    let fired = 0;
    const onUpdate = () => { fired++; };
    window.addEventListener("brain-notifications-updated", onUpdate);
    try {
      writeNotifications([note({ text: "seen-old", seen: true, seenAt: old })], SPACE);
      fired = 0; // ignore the write's own event
      cleanupNotifications(SPACE);
      expect(fired).toBe(1);

      // A no-op cleanup must NOT announce (that would loop readers pointlessly).
      fired = 0;
      cleanupNotifications(SPACE);
      expect(fired).toBe(0);
    } finally {
      window.removeEventListener("brain-notifications-updated", onUpdate);
    }
  });

  it("REGRESSION: a stale in-memory snapshot must not resurrect pruned rows", () => {
    // Reproduces the original bug: the panel loaded state, cleanup then pruned storage
    // without announcing, and the next mutation wrote the stale snapshot back — undoing
    // the prune. The fix is that mutations re-read storage instead of trusting state.
    writeNotifications(
      [note({ text: "keep-me" }), note({ text: "prune-me", seen: true, seenAt: old })],
      SPACE,
    );
    const staleSnapshot = readNotifications(SPACE); // what a mounted panel would hold
    expect(staleSnapshot).toHaveLength(2);

    cleanupNotifications(SPACE);
    expect(readNotifications(SPACE).map((n) => n.text)).toEqual(["keep-me"]);

    // The panel's mutate() re-reads rather than writing `staleSnapshot` back.
    const fresh = readNotifications(SPACE).map((n) => ({ ...n, seen: true, seenAt: Date.now() }));
    writeNotifications(fresh, SPACE);

    const finalTexts = readNotifications(SPACE).map((n) => n.text);
    expect(finalTexts).toEqual(["keep-me"]);
    expect(finalTexts).not.toContain("prune-me");
  });
});
