import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import type { Constellation } from "@brain/shared";

const getDigest = vi.fn();
const getDailyDigest = vi.fn();
const getConstellations = vi.fn();
const getEmotionalTrajectory = vi.fn();
const getDormant = vi.fn();
const getEvolutionLinks = vi.fn();
const getLifeAreas = vi.fn();
const getSelfReview = vi.fn();
const getDailyLog = vi.fn();
const getBeliefs = vi.fn();
const promoteConstellation = vi.fn();
const resolveInsight = vi.fn();
const runDigest = vi.fn();
const runContradictions = vi.fn();
vi.mock("../api/client.js", () => ({
  getDigest: (...a: unknown[]) => getDigest(...a),
  getDailyDigest: (...a: unknown[]) => getDailyDigest(...a),
  getConstellations: (...a: unknown[]) => getConstellations(...a),
  getEmotionalTrajectory: (...a: unknown[]) => getEmotionalTrajectory(...a),
  getDormant: (...a: unknown[]) => getDormant(...a),
  getEvolutionLinks: (...a: unknown[]) => getEvolutionLinks(...a),
  getLifeAreas: (...a: unknown[]) => getLifeAreas(...a),
  getSelfReview: (...a: unknown[]) => getSelfReview(...a),
  getDailyLog: (...a: unknown[]) => getDailyLog(...a),
  getBeliefs: (...a: unknown[]) => getBeliefs(...a),
  promoteConstellation: (...a: unknown[]) => promoteConstellation(...a),
  resolveInsight: (...a: unknown[]) => resolveInsight(...a),
  runDigest: (...a: unknown[]) => runDigest(...a),
  runContradictions: (...a: unknown[]) => runContradictions(...a),
}));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { DigestPanel } from "./DigestPanel.js";

function constellation(over: Partial<Constellation>): Constellation {
  return { id: 1, name: "Work stress", cohesion: 0.8, nodes: [{ id: 1, label: "n1", type: "concept" }, { id: 2, label: "n2", type: "concept" }] as never, ...over } as Constellation;
}

beforeEach(() => {
  vi.resetAllMocks();
  getDigest.mockResolvedValue([]);
  getDailyDigest.mockResolvedValue(null);
  getConstellations.mockResolvedValue([]);
  getEmotionalTrajectory.mockResolvedValue(null);
  getDormant.mockResolvedValue([]);
  getEvolutionLinks.mockResolvedValue([]);
  getLifeAreas.mockResolvedValue([]);
  getSelfReview.mockResolvedValue([]);
  getDailyLog.mockResolvedValue(null);
  getBeliefs.mockResolvedValue([]);
});

afterEach(() => cleanup());

async function openPromotionForm() {
  getConstellations.mockResolvedValue([constellation({})]);
  render(<DigestPanel onFocus={() => {}} />);
  const makeBtn = await screen.findByText("✦ Save as constellation");
  act(() => makeBtn.click());
  return screen.getByPlaceholderText("Name this constellation…");
}

describe("DigestPanel — promoteConstellation error threading", () => {
  it("surfaces the server's real error message instead of a generic fallback", async () => {
    await openPromotionForm();
    promoteConstellation.mockResolvedValue({ hub: null, error: "at least 2 memories required" });
    const saveBtn = screen.getByText("✦ Save");
    await act(async () => { saveBtn.click(); });
    await waitFor(() => expect(pushToast).toHaveBeenCalledWith("at least 2 memories required", "⚠️", expect.any(Number)));
  });

  it("falls back to a generic message when the server gave no reason (e.g. a network failure)", async () => {
    await openPromotionForm();
    promoteConstellation.mockResolvedValue({ hub: null });
    const saveBtn = screen.getByText("✦ Save");
    await act(async () => { saveBtn.click(); });
    await waitFor(() => expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't chart"), "⚠️", expect.any(Number)));
  });

  it("celebrates and closes the form on success, without touching the error toast", async () => {
    await openPromotionForm();
    promoteConstellation.mockResolvedValue({ hub: { id: 42 } });
    const saveBtn = screen.getByText("✦ Save");
    await act(async () => { saveBtn.click(); });
    await waitFor(() => expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("charted"), "🌌", expect.any(Number)));
    expect(screen.queryByPlaceholderText("Name this constellation…")).toBeNull();
  });
});
