import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";

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

describe("ChatDock — the quick-tools discovery row is reachable after the first message", () => {
  it("reveals the tools chips via the header toggle once a conversation exists", async () => {
    localStorage.setItem(CHAT_KEY, JSON.stringify([{ role: "you", text: "hi" }]));
    render(<ChatDock onClose={() => {}} onFocus={() => {}} />);
    await screen.findByText("hi");
    // Vanished after the first message before this fix — no way back to it.
    expect(screen.queryByTitle("Open Mind")).toBeNull();

    const toggle = screen.getByTitle("Explore Soumaya's other tools");
    act(() => toggle.click());
    expect(screen.getByTitle("Open Mind")).toBeTruthy();

    act(() => toggle.click());
    expect(screen.queryByTitle("Open Mind")).toBeNull();
  });
});

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

describe("ChatDock — Maya Chat → Galaxy Navigation", () => {
  const NAV = {
    target: { domain: "journey" as const, kind: "journey", id: 42, label: "Owner-operator transition" },
    reason: "Active journey — 40% along, 2 linked items",
  };

  it("a response carrying navigation renders a click-to-navigate chip", async () => {
    askChat.mockResolvedValue({ answer: "Here's what I found.", citations: [], navigation: NAV });
    render(<ChatDock onClose={() => {}} onFocus={() => {}} onNavigate={() => {}} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "why am I not making progress?" } });
    fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(askChat).toHaveBeenCalled());
    const chip = await screen.findByTitle(NAV.reason);
    expect(chip.textContent).toContain("Owner-operator transition");
  });

  it("clicking the navigation chip calls onNavigate with the exact NavigationIntent, and never fires on its own", async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify([{ role: "soumaya", text: "Here's what I found.", navigation: NAV }]),
    );
    const onNavigate = vi.fn();
    render(<ChatDock onClose={() => {}} onFocus={() => {}} onNavigate={onNavigate} />);
    const chip = await screen.findByTitle(NAV.reason);

    // Rendering alone must never trigger navigation — it's a one-shot, user-triggered action.
    expect(onNavigate).not.toHaveBeenCalled();

    act(() => chip.click());
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(NAV);
  });

  it("reloading persisted chat history containing navigation does NOT auto-fire it on mount", async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify([{ role: "soumaya", text: "Here's what I found.", navigation: NAV }]),
    );
    const onNavigate = vi.fn();
    const { unmount } = render(<ChatDock onClose={() => {}} onFocus={() => {}} onNavigate={onNavigate} />);
    await screen.findByTitle(NAV.reason);
    unmount();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("clicking the chip with no onNavigate provided does not throw", async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify([{ role: "soumaya", text: "Here's what I found.", navigation: NAV }]),
    );
    render(<ChatDock onClose={() => {}} onFocus={() => {}} />);
    const chip = await screen.findByTitle(NAV.reason);
    expect(() => act(() => chip.click())).not.toThrow();
  });

  it("existing citation chips still work unaffected by the new navigation chip", async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify([
        {
          role: "soumaya",
          text: "Here's what I found.",
          citations: [{ id: 7, label: "A real memory", type: "daily" }],
          navigation: NAV,
        },
      ]),
    );
    const onFocus = vi.fn();
    render(<ChatDock onClose={() => {}} onFocus={onFocus} onNavigate={() => {}} />);
    const citeChip = await screen.findByText("A real memory");
    act(() => citeChip.click());
    expect(onFocus).toHaveBeenCalledWith(7);
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
