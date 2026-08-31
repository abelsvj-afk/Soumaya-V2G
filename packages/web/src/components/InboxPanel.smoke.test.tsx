import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { InboxNotification } from "./Toasts.js";

const cleanupNotifications = vi.fn();
const readNotifications = vi.fn();
const writeNotifications = vi.fn();
vi.mock("./Toasts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./Toasts.js")>();
  return {
    ...actual,
    cleanupNotifications: (...a: unknown[]) => cleanupNotifications(...a),
    readNotifications: (...a: unknown[]) => readNotifications(...a),
    writeNotifications: (...a: unknown[]) => writeNotifications(...a),
  };
});
const playSfx = vi.fn();
vi.mock("../graph/sfx.js", () => ({ playSfx: (...a: unknown[]) => playSfx(...a) }));

import { InboxPanel } from "./InboxPanel.js";

function note(over: Partial<InboxNotification>): InboxNotification {
  return { id: "1", text: "a note", icon: "🛰️", timestamp: Date.now(), seen: false, seenAt: null, priority: "normal", ...over };
}

beforeEach(() => {
  vi.resetAllMocks();
  cleanupNotifications.mockImplementation(() => {});
});

afterEach(() => cleanup());

describe("InboxPanel — reaching inbox-zero is celebrated, not silently mounted into", () => {
  it("does not play a sound just from mounting on an already-empty inbox", async () => {
    readNotifications.mockReturnValue([]);
    render(<InboxPanel spaceId="s1" />);
    await screen.findByText(/completely clear/);
    expect(playSfx).not.toHaveBeenCalled();
  });

  it("plays a chime the moment the last unseen item is marked read", async () => {
    const single = [note({ id: "1", text: "Only one" })];
    readNotifications.mockReturnValue(single);
    writeNotifications.mockImplementation((list: InboxNotification[]) => {
      readNotifications.mockReturnValue(list);
    });
    render(<InboxPanel spaceId="s1" />);
    await screen.findByText("Only one");

    const markAllBtn = screen.getByText("Mark All Read");
    await act(async () => { markAllBtn.click(); });

    expect(playSfx).toHaveBeenCalledWith("chime");
  });
});
