import { useState } from "react";
import { readNotifications, writeNotifications, type InboxNotification } from "../../components/Toasts.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import type { PlaceId } from "../scenes/regionLayout.js";
import { actionButtonStyle, OverlayShell } from "./OverlayShell.js";

export interface PostOfficeOverlayProps {
  spaceId: string;
  onClose: () => void;
  /** Lets a notification's existing action ("open the money tab", "open chat", ...) route
   *  straight to the matching Overworld place, reusing the exact same toast data the
   *  galaxy UI already produces. */
  onOpenPlace: (placeId: PlaceId) => void;
}

/** Old dock-tab ids (App.tsx's DockTab) a notification's `action.value` may still carry
 *  → the Overworld place that replaces that tab. */
const TAB_TO_PLACE: Record<string, PlaceId> = {
  money: "bank",
  list: "library",
  mind: "sanctuary",
  actions: "bulletinBoard",
  insights: "observatory",
  inbox: "postOffice",
  awards: "gym",
  journeys: "townHall",
  hangar: "hangar",
  soumaya: "soumaya",
};

function routeFor(n: InboxNotification): PlaceId | null {
  if (!n.action) return null;
  if (n.action.kind === "chat") return "soumaya";
  if (n.action.kind === "tab" && typeof n.action.value === "string") {
    return TAB_TO_PLACE[n.action.value] ?? null;
  }
  return null;
}

/**
 * The Post Office (Inbox tab equivalent). Backed by the SAME localStorage-persisted
 * notification log the galaxy's toast system already writes to (Toasts.tsx) — there is
 * no server endpoint for this, so this is a pure client-state mailbox, same as today.
 */
export function PostOfficeOverlay({ spaceId, onClose, onOpenPlace }: PostOfficeOverlayProps) {
  const [items, setItems] = useState<InboxNotification[]>(() =>
    [...readNotifications(spaceId)].sort((a, b) => b.timestamp - a.timestamp),
  );

  const markRead = (id: string) => {
    const wasUnread = items.find((n) => n.id === id)?.seen === false;
    const next = items.map((n) => (n.id === id ? { ...n, seen: true, seenAt: Date.now() } : n));
    setItems(next);
    writeNotifications(next, spaceId);
    // A real notification actually read for the FIRST time is the Post Office's own real work
    // event (npc-economy.md) — never re-credited for re-opening something already read.
    if (wasUnread) recordBuildingWork(spaceId, "postOffice");
  };

  const open = (n: InboxNotification) => {
    const place = routeFor(n);
    markRead(n.id);
    if (place) {
      onOpenPlace(place);
    } else {
      onClose();
    }
  };

  const unreadCount = items.filter((n) => !n.seen).length;

  return (
    <OverlayShell icon="📮" title="Post Office" onClose={onClose}>
      <p style={{ marginTop: 0 }}>{unreadCount} unread</p>
      {items.length === 0 ? (
        <p>No mail right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((n) => (
            <li
              key={n.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "6px 0",
                borderBottom: "1px solid #2a2c55",
                opacity: n.seen ? 0.6 : 1,
              }}
            >
              <span aria-hidden="true">{n.icon}</span>
              <span style={{ flex: 1 }}>
                {n.text} {!n.seen && <strong>(new)</strong>}
                {n.priority === "high" && " — urgent"}
              </span>
              <button type="button" onClick={() => open(n)} style={actionButtonStyle()}>
                {routeFor(n) ? "Open" : "Read"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
