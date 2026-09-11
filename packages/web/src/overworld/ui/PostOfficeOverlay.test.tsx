import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { writeNotifications, type InboxNotification } from "../../components/Toasts.js";
import { PostOfficeOverlay } from "./PostOfficeOverlay.js";

function makeNotification(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: "n1",
    text: "A bill is due soon",
    icon: "💵",
    timestamp: Date.now(),
    seen: false,
    seenAt: null,
    priority: "normal",
    ...overrides,
  };
}

describe("PostOfficeOverlay", () => {
  beforeEach(() => localStorage.clear());

  it("lists real notifications from the shared toast-log storage, newest first", () => {
    writeNotifications(
      [makeNotification({ id: "old", text: "Old one", timestamp: 1 }), makeNotification({ id: "new", text: "New one", timestamp: 2 })],
      "space-1",
    );
    render(<PostOfficeOverlay spaceId="space-1" onClose={vi.fn()} onOpenPlace={vi.fn()} />);
    const texts = screen.getAllByText(/one/).map((el) => el.textContent);
    expect(texts[0]).toContain("New one");
  });

  it("routes a tab-action notification (old dock tab id) to the matching Overworld place", () => {
    writeNotifications([makeNotification({ action: { kind: "tab", value: "money" } })], "space-1");
    const onOpenPlace = vi.fn();
    render(<PostOfficeOverlay spaceId="space-1" onClose={vi.fn()} onOpenPlace={onOpenPlace} />);
    fireEvent.click(screen.getByText("Open"));
    expect(onOpenPlace).toHaveBeenCalledWith("bank");
  });

  it("routes a chat-action notification to Soumaya", () => {
    writeNotifications([makeNotification({ action: { kind: "chat" } })], "space-1");
    const onOpenPlace = vi.fn();
    render(<PostOfficeOverlay spaceId="space-1" onClose={vi.fn()} onOpenPlace={onOpenPlace} />);
    fireEvent.click(screen.getByText("Open"));
    expect(onOpenPlace).toHaveBeenCalledWith("soumaya");
  });

  it("shows an empty-mailbox message rather than a blank screen", () => {
    render(<PostOfficeOverlay spaceId="space-1" onClose={vi.fn()} onOpenPlace={vi.fn()} />);
    expect(screen.getByText("No mail right now.")).toBeTruthy();
  });
});
