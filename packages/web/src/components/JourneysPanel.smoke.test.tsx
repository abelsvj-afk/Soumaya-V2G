import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import type { Journey } from "@brain/shared";

const getJourneys = vi.fn();
const createJourney = vi.fn();
const patchJourney = vi.fn();
const deleteJourney = vi.fn();
const journeyLinks = vi.fn();
vi.mock("../api/journeys.js", () => ({
  getJourneys: (...a: unknown[]) => getJourneys(...a),
  createJourney: (...a: unknown[]) => createJourney(...a),
  patchJourney: (...a: unknown[]) => patchJourney(...a),
  deleteJourney: (...a: unknown[]) => deleteJourney(...a),
  journeyLinks: (...a: unknown[]) => journeyLinks(...a),
}));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { JourneysPanel } from "./JourneysPanel.js";

beforeEach(() => {
  vi.resetAllMocks();
  // Sane default so opening a card never crashes a test that isn't specifically
  // exercising the links-loading behavior.
  journeyLinks.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function journey(over: Partial<Journey>): Journey {
  return { id: 1, title: "Recover Financially", icon: "💵", status: "active", progress: 0.3, linkCount: 0, ...over } as Journey;
}

describe("JourneysPanel — loading trap", () => {
  it("shows a retry option instead of 'Loading' forever when the initial fetch fails", async () => {
    getJourneys.mockResolvedValue(null);
    render(<JourneysPanel />);
    await screen.findByText(/Couldn't load your Journeys/);
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("keeps the existing list instead of wiping it when a mutation's refresh fails", async () => {
    // First load succeeds; every call after that fails — reproducing "a blip
    // mid-session wipes the whole panel back to permanent loading."
    getJourneys.mockResolvedValueOnce([journey({ id: 1 })]).mockResolvedValue(null);
    patchJourney.mockResolvedValueOnce(journey({ id: 1, status: "done" }));

    render(<JourneysPanel />);
    const head = await screen.findByText("Recover Financially");
    act(() => head.click());
    const markComplete = await screen.findByText("Mark complete");
    await act(async () => { markComplete.click(); });

    // onChanged() -> refresh() -> getJourneys() resolves null this time.
    await waitFor(() => expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't refresh"), "⚠️", expect.any(Number)));
    expect(screen.queryByText(/Loading your journeys/)).toBeNull();
    expect(screen.getByText("Recover Financially")).toBeTruthy();
  });
});

describe("JourneysPanel — active-only suggestion gate", () => {
  it("shows starter suggestions when every Journey is completed, not just when there are zero ever", async () => {
    getJourneys.mockResolvedValue([journey({ id: 1, status: "done" })]);
    render(<JourneysPanel />);
    await screen.findByText("Start with one that fits your life right now:");
  });

  it("hides suggestions once at least one Journey is active", async () => {
    getJourneys.mockResolvedValue([journey({ id: 1, status: "active" })]);
    render(<JourneysPanel />);
    await screen.findByText("Recover Financially");
    expect(screen.queryByText("Start with one that fits your life right now:")).toBeNull();
  });
});

describe("JourneysPanel — progress slider debounce", () => {
  it("does not fire a PATCH per onChange tick, and saves only the settled value", async () => {
    vi.useFakeTimers();
    getJourneys.mockResolvedValue([journey({ id: 1, progress: 0.2 })]);
    patchJourney.mockResolvedValue(journey({ id: 1, progress: 0.75 }));

    render(<JourneysPanel />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const head = screen.getByText("Recover Financially");
    act(() => head.click());

    const slider = screen.getByRole("progressbar") as HTMLInputElement;
    for (const v of [30, 45, 60, 75]) {
      act(() => {
        Object.defineProperty(slider, "value", { value: String(v), configurable: true });
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    expect(patchJourney).not.toHaveBeenCalled(); // still debouncing

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(patchJourney).toHaveBeenCalledTimes(1);
    expect(patchJourney).toHaveBeenCalledWith(1, { progress: 0.75 });
  });
});

describe("JourneysPanel — links race guard", () => {
  it("ignores a stale journeyLinks response that resolves after the card is closed", async () => {
    getJourneys.mockResolvedValue([journey({ id: 1 })]);
    let resolveLinks!: (v: unknown) => void;
    journeyLinks.mockReturnValueOnce(new Promise((r) => { resolveLinks = r; }));

    render(<JourneysPanel />);
    const head = await screen.findByText("Recover Financially");
    act(() => head.click()); // open
    await screen.findByText("Loading what's linked…");
    act(() => head.click()); // close before the fetch resolves

    await act(async () => {
      resolveLinks([{ kind: "node", refId: 1, label: "should not appear" }]);
      await Promise.resolve();
    });
    expect(screen.queryByText("should not appear")).toBeNull();
  });

  it("shows a distinct error instead of spinning forever when the links fetch fails", async () => {
    getJourneys.mockResolvedValue([journey({ id: 1 })]);
    journeyLinks.mockResolvedValueOnce(null);
    render(<JourneysPanel />);
    const head = await screen.findByText("Recover Financially");
    act(() => head.click());
    await screen.findByText(/Couldn't load what's linked/);
  });
});

describe("JourneysPanel — paused/done status is never opacity-alone", () => {
  it("shows a visible ⏸ Paused badge, not just a dimmer card", async () => {
    getJourneys.mockResolvedValue([journey({ id: 1, status: "paused" })]);
    render(<JourneysPanel />);
    await screen.findByText("Recover Financially");
    expect(screen.getByText("⏸ Paused")).toBeTruthy();
  });

  it("shows a visible ✓ Done badge for a completed journey", async () => {
    getJourneys.mockResolvedValue([journey({ id: 1, status: "done" })]);
    render(<JourneysPanel />);
    await screen.findByText("Recover Financially");
    expect(screen.getByText("✓ Done")).toBeTruthy();
  });
});

describe("JourneysPanel — checked writes", () => {
  it("toasts and does not clear the form when creating a Journey fails", async () => {
    getJourneys.mockResolvedValue([]);
    createJourney.mockResolvedValue(null);
    render(<JourneysPanel />);
    await screen.findByText("Start with one that fits your life right now:");
    act(() => screen.getByText("💵 Recover Financially").click());
    await waitFor(() => expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't create"), "⚠️", expect.any(Number)));
  });
});
