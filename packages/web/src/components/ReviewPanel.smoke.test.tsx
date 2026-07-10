import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Mock the API module so the component's fetch-on-mount is deterministic. This is the
// pattern for testing any data-driven component (the majority) under the new harness.
const gradeReview = vi.fn().mockResolvedValue(true);
vi.mock("../api/client.js", () => ({
  getDueReviews: vi.fn().mockResolvedValue([{ id: 1, label: "the studio lease", strength: 0.1, reviewCount: 0 }]),
  gradeReview: (...a: unknown[]) => gradeReview(...a),
}));

import { ReviewPanel } from "./ReviewPanel.js";

afterEach(cleanup);

describe("ReviewPanel (recall session)", () => {
  it("loads a due memory, reveals on request, and grades the recall", async () => {
    render(<ReviewPanel onClose={vi.fn()} />);
    // The due memory's label appears once loaded.
    expect(await screen.findByText("the studio lease")).toBeTruthy();
    // Retrieval-first: the answer buttons only appear after you choose to reveal.
    expect(screen.queryByText("I remembered")).toBeNull();
    fireEvent.click(screen.getByText("Reveal & rate my recall"));
    fireEvent.click(screen.getByText("I remembered"));
    await waitFor(() => expect(gradeReview).toHaveBeenCalledWith(1, true));
  });
});
