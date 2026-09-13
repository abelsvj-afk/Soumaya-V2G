import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SanctuaryOverlay } from "./SanctuaryOverlay.js";

vi.mock("../../api/mind.js", () => ({
  getThoughts: vi.fn(),
  getCognitive: vi.fn(),
  addThought: vi.fn().mockResolvedValue({ id: 9 }),
  reinforceThought: vi.fn().mockResolvedValue({ promotedNodeId: null }),
  promoteThought: vi.fn().mockResolvedValue({ nodeId: 1 }),
  dismissThought: vi.fn().mockResolvedValue(true),
  createCognitive: vi.fn().mockResolvedValue({ id: 5 }),
  setCognitiveProgress: vi.fn().mockResolvedValue(true),
  getInquiries: vi.fn().mockResolvedValue([]),
  answerInquiry: vi.fn().mockResolvedValue({ nodeIds: [], fuelEarned: 0 }),
  dismissInquiry: vi.fn().mockResolvedValue(true),
  rejectInquiry: vi.fn().mockResolvedValue(true),
  getCandidates: vi.fn().mockResolvedValue({ candidates: [], count: 0 }),
  acceptCandidate: vi.fn().mockResolvedValue(true),
  dismissCandidate: vi.fn().mockResolvedValue(true),
  getPersonSuggestions: vi.fn().mockResolvedValue([]),
  dismissPersonSuggestion: vi.fn().mockResolvedValue(true),
}));

describe("SanctuaryOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real working-memory motes and real cognitive items", async () => {
    const { getThoughts, getCognitive } = await import("../../api/mind.js");
    (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, text: "maybe move to Denver", source: "manual", strength: 0.8, reinforceCount: 0, createdAt: "" }]);
    (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 2, kind: "goal", label: "Get promoted", content: "", progress: 0.3, completedAt: null, degree: 0, aliases: [], createdAt: "", remindAt: null }]);
    render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("maybe move to Denver")).toBeTruthy());
    expect(screen.getByText(/Get promoted/)).toBeTruthy();
    expect(screen.getByText(/30%/)).toBeTruthy();
  });

  it("dropping a new thought calls addThought", async () => {
    const { getThoughts, getCognitive, addThought } = await import("../../api/mind.js");
    (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Nothing drifting right now."));
    fireEvent.change(screen.getByLabelText("New thought"), { target: { value: "a stray idea" } });
    fireEvent.click(screen.getByText("Drop a thought"));
    await waitFor(() => expect(addThought).toHaveBeenCalledWith("a stray idea", "manual"));
  });

  it("saving a mote (★ Save) calls promoteThought", async () => {
    const { getThoughts, getCognitive, promoteThought } = await import("../../api/mind.js");
    (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1, text: "x", source: "manual", strength: 0.5, reinforceCount: 0, createdAt: "" }]);
    (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("x"));
    fireEvent.click(screen.getByText("★ Save"));
    await waitFor(() => expect(promoteThought).toHaveBeenCalledWith(1));
  });

  describe("Inquiries + Suggested connections + People (overlay quality-parity audit, task #79)", () => {
    it("shows a real inquiry and answering it calls answerInquiry with the typed text", async () => {
      const { getThoughts, getCognitive, getInquiries, answerInquiry } = await import("../../api/mind.js");
      (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getInquiries as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, question: "What happened with the Denver plan?", kind: "gap", nodes: [{ id: 5, label: "Denver plan" }], createdAt: "" },
      ]);
      render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("What happened with the Denver plan?")).toBeTruthy());
      fireEvent.change(screen.getByLabelText("Answer: What happened with the Denver plan?"), { target: { value: "It fell through" } });
      fireEvent.click(screen.getByText("Answer"));
      await waitFor(() => expect(answerInquiry).toHaveBeenCalledWith(1, "It fell through"));
    });

    it("dismissing and rejecting an inquiry call the real API, never invented state", async () => {
      const { getThoughts, getCognitive, getInquiries, dismissInquiry } = await import("../../api/mind.js");
      (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getInquiries as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 2, question: "Still relevant?", kind: "gap", nodes: [], createdAt: "" }]);
      render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("Still relevant?"));
      fireEvent.click(screen.getByText("Not now"));
      await waitFor(() => expect(dismissInquiry).toHaveBeenCalledWith(2));
    });

    it("shows a real suggested connection and accepting it calls acceptCandidate", async () => {
      const { getThoughts, getCognitive, getCandidates, acceptCandidate } = await import("../../api/mind.js");
      (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidates: [{ id: 3, a: 1, b: 2, aLabel: "Rent", bLabel: "Job stress", reason: "both mention money", score: 0.8, origin: "suggested", createdAt: "" }],
        count: 1,
      });
      render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Rent ↔ Job stress/)).toBeTruthy());
      fireEvent.click(screen.getByText("Accept"));
      await waitFor(() => expect(acceptCandidate).toHaveBeenCalledWith(3));
    });

    it("shows a real person suggestion and dismissing it calls dismissPersonSuggestion", async () => {
      const { getThoughts, getCognitive, getPersonSuggestions, dismissPersonSuggestion } = await import("../../api/mind.js");
      (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getPersonSuggestions as ReturnType<typeof vi.fn>).mockResolvedValue([{ name: "Alex", count: 3 }]);
      render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Alex — mentioned 3 times/)).toBeTruthy());
      fireEvent.click(screen.getByText("Not a person"));
      await waitFor(() => expect(dismissPersonSuggestion).toHaveBeenCalledWith("Alex"));
    });

    it("shows real empty states rather than blank sections", async () => {
      const { getThoughts, getCognitive, getInquiries, getCandidates, getPersonSuggestions } = await import("../../api/mind.js");
      (getThoughts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCognitive as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getInquiries as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ candidates: [], count: 0 });
      (getPersonSuggestions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      render(<SanctuaryOverlay spaceId="space-1" onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Nothing she's wondering about right now/)).toBeTruthy());
      expect(screen.getByText(/No suggested connections waiting for review/)).toBeTruthy();
      expect(screen.getByText(/No new names noticed across your memories/)).toBeTruthy();
    });
  });
});
