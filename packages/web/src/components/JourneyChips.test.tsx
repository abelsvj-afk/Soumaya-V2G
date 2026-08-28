import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { Journey } from "@brain/shared";
import { JourneyChips } from "./JourneyChips.js";
import * as api from "../api/journeys.js";
import * as toasts from "./Toasts.js";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

function journey(overrides: { id: number; title: string }): Journey {
  return { description: "", status: "active", progress: 0, createdAt: "", updatedAt: "", ...overrides };
}

/** The one new piece of client logic this spec adds: a strongly-matching Journey
 *  (>=0.72 similarity) should link ITSELF with no user action, while a moderate match
 *  (0.40-0.72) must wait for a tap — getting this backwards would either spam links or
 *  make the feature invisible. */
describe("JourneyChips", () => {
  it("auto-links a high-confidence suggestion silently and announces it with a toast", async () => {
    const strong = journey({ id: 1, title: "Become an RN" });
    vi.spyOn(api, "journeysFor").mockResolvedValue([]);
    vi.spyOn(api, "getJourneys").mockResolvedValue([strong]);
    vi.spyOn(api, "suggestJourneys").mockResolvedValue({
      autoLink: [{ journey: strong, score: 0.9, tier: "auto" }],
      suggested: [],
    });
    const link = vi.spyOn(api, "linkToJourney").mockResolvedValue({ id: 1, journeyId: 1, kind: "node", refId: 42, createdAt: "" });
    const toast = vi.spyOn(toasts, "pushToast").mockImplementation(() => {});

    render(<JourneyChips kind="node" refId={42} />);

    await waitFor(() => expect(link).toHaveBeenCalledWith(1, "node", 42));
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Become an RN"), "🧭");
  });

  it("does NOT auto-link a moderate-confidence suggestion — shows it as a tap-to-confirm chip instead", async () => {
    const moderate = journey({ id: 2, title: "Get Healthy" });
    vi.spyOn(api, "journeysFor").mockResolvedValue([]);
    vi.spyOn(api, "getJourneys").mockResolvedValue([moderate]);
    vi.spyOn(api, "suggestJourneys").mockResolvedValue({
      autoLink: [],
      suggested: [{ journey: moderate, score: 0.55, tier: "suggested" }],
    });
    const link = vi.spyOn(api, "linkToJourney").mockResolvedValue(null);

    render(<JourneyChips kind="node" refId={42} />);

    await waitFor(() => screen.getByText(/Get Healthy/));
    expect(link).not.toHaveBeenCalled();
  });

  it("doesn't show an already-linked journey a second time in the suggested row", async () => {
    const j = journey({ id: 3, title: "Already Linked" });
    vi.spyOn(api, "journeysFor").mockResolvedValue([j]); // already linked
    vi.spyOn(api, "getJourneys").mockResolvedValue([j]);
    vi.spyOn(api, "suggestJourneys").mockResolvedValue({
      autoLink: [],
      suggested: [{ journey: j, score: 0.5, tier: "suggested" }], // server still returns it as a candidate
    });

    render(<JourneyChips kind="node" refId={42} />);

    await waitFor(() => screen.getByText(/Already Linked/));
    expect(screen.getAllByText(/Already Linked/)).toHaveLength(1);
  });
});
