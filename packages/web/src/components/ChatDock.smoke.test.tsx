import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";

const askChat = vi.fn();
const getSpaceId = vi.fn(() => "space1");
const ingestText = vi.fn();
const distillChat = vi.fn();
vi.mock("../api/client.js", () => ({
  askChat: (...a: unknown[]) => askChat(...a),
  getSpaceId: () => getSpaceId(),
  ingestText: (...a: unknown[]) => ingestText(...a),
  distillChat: (...a: unknown[]) => distillChat(...a),
}));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));
vi.mock("../voice.js", () => ({
  isVoiceSupported: () => false,
  isVoiceEnabled: () => false,
  setVoiceEnabled: () => {},
  speak: () => {},
  stopSpeaking: () => {},
}));

import { ChatDock } from "./ChatDock.js";

const CHAT_KEY = "brain.chat.space1";

beforeEach(() => {
  vi.resetAllMocks();
  getSpaceId.mockReturnValue("space1");
  localStorage.clear();
});

afterEach(() => cleanup());

describe("ChatDock — mood is never colour-alone", () => {
  it("pairs a mood-colored bubble with a visible icon, not just a border color", async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify([{ role: "soumaya", text: "That sounds heavy.", mood: "sad" }]),
    );
    render(<ChatDock onClose={() => {}} onFocus={() => {}} />);
    const text = await screen.findByText("That sounds heavy.");
    const bubble = text.closest(".chatdock-bubble");
    expect(bubble?.className).toContain("mood-sad");
    expect(bubble?.textContent).toContain("💙");
  });
});

describe("ChatDock — close button must not get stuck", () => {
  it("still closes when the end-of-chat distill call fails", async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify([
        { role: "you", text: "first" },
        { role: "soumaya", text: "reply" },
        { role: "you", text: "second" },
      ]),
    );
    distillChat.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();
    render(<ChatDock onClose={onClose} onFocus={() => {}} />);
    const closeBtn = await screen.findByTitle("Close");
    await act(async () => { closeBtn.click(); });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(pushToast).toHaveBeenCalledWith(expect.any(String), "⚠️", expect.any(Number));
  });
});

describe("ChatDock — saved memories survive a reload", () => {
  it("keeps a message marked saved after the component remounts, instead of re-offering it for duplicate ingestion", async () => {
    localStorage.setItem(CHAT_KEY, JSON.stringify([{ role: "you", text: "Remember this" }]));
    ingestText.mockResolvedValue({ nodes: [{ id: 5 }] });

    const { unmount } = render(<ChatDock onClose={() => {}} onFocus={() => {}} />);
    const saveBtn = await screen.findByLabelText("Save as memory");
    await act(async () => { saveBtn.click(); });
    await waitFor(() => expect(ingestText).toHaveBeenCalledTimes(1));

    unmount();
    render(<ChatDock onClose={() => {}} onFocus={() => {}} />);
    const reloadedBtn = await screen.findByLabelText("Save as memory");
    expect(reloadedBtn.getAttribute("disabled")).not.toBeNull();

    // Clicking the already-saved button again must not re-ingest.
    act(() => reloadedBtn.click());
    expect(ingestText).toHaveBeenCalledTimes(1);
  });
});

describe("ChatDock — clearing a conversation is destructive and needs confirmation", () => {
  it("keeps the conversation on cancel, clears it once confirmed", async () => {
    localStorage.setItem(CHAT_KEY, JSON.stringify([{ role: "you", text: "Keep me" }]));
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (window as unknown as { confirm: typeof confirmMock }).confirm = confirmMock;
    render(<ChatDock onClose={() => {}} onFocus={() => {}} />);
    await screen.findByText("Keep me");

    const clearBtn = screen.getByTitle("Clear conversation");
    act(() => clearBtn.click());
    expect(screen.getByText("Keep me")).toBeTruthy();

    act(() => clearBtn.click());
    expect(screen.queryByText("Keep me")).toBeNull();
  });
});
