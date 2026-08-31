import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import type { GraphNode } from "@brain/shared";

const deleteNode = vi.fn();
const ackReminder = vi.fn();
vi.mock("../api/client.js", () => ({
  deleteNode: (...a: unknown[]) => deleteNode(...a),
  ackReminder: (...a: unknown[]) => ackReminder(...a),
}));
const pushToast = vi.fn();
vi.mock("./Toasts.js", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }));

import { ActionsPanel } from "./ActionsPanel.js";

function node(over: Partial<GraphNode>): GraphNode {
  return { id: 1, label: "A reminder", type: "concept", content: "", ...over } as GraphNode;
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("ActionsPanel — acknowledging a due reminder tells the rest of the app", () => {
  it("calls onChanged() after a successful ack, so other stale views refresh", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const onChanged = vi.fn();
    ackReminder.mockResolvedValue(true);
    render(<ActionsPanel nodes={[node({ id: 1, label: "Due thing", remindAt: past })]} onFocus={() => {}} onChanged={onChanged} />);

    const ackBtn = await screen.findByTitle("Acknowledge — stop reminding");
    await act(async () => { ackBtn.click(); });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe("ActionsPanel — the acked mask clears once the server catches up", () => {
  it("stops masking an id once its remindAt is actually gone from a refreshed nodes prop", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    ackReminder.mockResolvedValue(true);
    const withReminder = [node({ id: 1, label: "Due thing", remindAt: past })];
    const { rerender } = render(<ActionsPanel nodes={withReminder} onFocus={() => {}} />);

    const ackBtn = await screen.findByTitle("Acknowledge — stop reminding");
    await act(async () => { ackBtn.click(); });
    await waitFor(() => expect(screen.queryByText("Due thing")).toBeNull());

    // Server hasn't actually cleared remind_at yet on this next render — still masked.
    rerender(<ActionsPanel nodes={withReminder} onFocus={() => {}} />);
    expect(screen.queryByText("Due thing")).toBeNull();

    // Now a real refresh lands with remind_at cleared — the same id must be able
    // to surface again as a fresh reminder later, not be masked forever.
    rerender(<ActionsPanel nodes={[node({ id: 1, label: "Due thing", remindAt: undefined })]} onFocus={() => {}} />);
    rerender(<ActionsPanel nodes={[node({ id: 1, label: "Due thing", remindAt: past })]} onFocus={() => {}} />);
    await screen.findByText("Due thing");
  });
});

describe("ActionsPanel — upcoming reminders show real urgency, not just text", () => {
  it("marks a reminder due within the hour as urgent", async () => {
    const soon = new Date(Date.now() + 30 * 60_000).toISOString(); // in 30 min
    render(<ActionsPanel nodes={[node({ id: 1, label: "Soon thing", remindAt: soon })]} onFocus={() => {}} />);
    const label = await screen.findByText("Soon thing");
    const due = label.closest("button")?.querySelector(".agenda-due");
    expect(due?.className).toContain("urgent");
  });
});
