import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const getSpaceId = vi.fn(() => "space1");
vi.mock("../api/client.js", () => ({ getSpaceId: () => getSpaceId() }));
const playSfx = vi.fn();
vi.mock("../graph/sfx.js", () => ({ playSfx: (...a: unknown[]) => playSfx(...a) }));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { HelpPanel } from "./HelpPanel.js";

beforeEach(() => {
  vi.resetAllMocks();
  getSpaceId.mockReturnValue("space1");
  localStorage.clear();
});
afterEach(() => cleanup());

describe("HelpPanel — dialog semantics", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<HelpPanel onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("exposes a dialog role with a readable label", () => {
    render(<HelpPanel onClose={() => {}} />);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Galaxy Pilot Manual");
  });
});

describe("HelpPanel — a category's 'Try it' button is reachable, not just readable", () => {
  it("dispatches the mapped action for a category that has one", () => {
    const onAction = vi.fn();
    window.addEventListener("brain-toast-action", onAction);
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.click(screen.getByText("💬"));
    const tryBtn = screen.getByText("💬 Open chat");
    fireEvent.click(tryBtn);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ detail: { kind: "chat" } }));
    window.removeEventListener("brain-toast-action", onAction);
  });

  it("shows no 'Try it' button for a category with no clean single action", () => {
    render(<HelpPanel onClose={() => {}} />);
    // Default tab is "navigation", which has no CATEGORY_TRY_IT entry.
    expect(screen.queryByText(/^Open /)).toBeNull();
  });
});

describe("HelpPanel — zero search results is no longer a dead end", () => {
  it("offers an ask-Soumaya escape hatch", () => {
    const onAction = vi.fn();
    window.addEventListener("brain-toast-action", onAction);
    render(<HelpPanel onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Search pilot guide/), { target: { value: "zzzznomatch" } });
    const askBtn = screen.getByText("💬 Ask Soumaya instead");
    fireEvent.click(askBtn);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ detail: { kind: "chat" } }));
    window.removeEventListener("brain-toast-action", onAction);
  });
});

describe("HelpPanel — reading the whole manual is finally rewarded", () => {
  it("celebrates only once every category has actually been visited", () => {
    render(<HelpPanel onClose={() => {}} />);
    const tabs = screen.getAllByRole("button", { name: /./ }).filter((b) => b.className.includes("help-tab-btn"));
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) {
      act(() => tab.click());
    }
    expect(playSfx).toHaveBeenCalledWith("achievement");
    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Pilot Manual"), "📖", expect.any(Number));
  });

  it("does not celebrate again on a fresh mount after completion was already recorded", () => {
    localStorage.setItem(
      "brain.help.seen.space1",
      JSON.stringify(["start", "navigation", "rules", "structure", "talk", "explore", "fleet", "hangar", "money", "journeys"]),
    );
    render(<HelpPanel onClose={() => {}} />);
    expect(playSfx).not.toHaveBeenCalled();
  });
});
