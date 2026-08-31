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
const playSfx = vi.fn();
vi.mock("../graph/sfx.js", () => ({ playSfx: (...a: unknown[]) => playSfx(...a) }));

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

describe("ActionsPanel — clearing a task is celebrated, not silent", () => {
  it("plays a sound and toasts on a successful clear", async () => {
    deleteNode.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<ActionsPanel nodes={[node({ id: 1, label: "Ship it", kind: "action" })]} onFocus={() => {}} onChanged={onChanged} />);
    const doneBtn = await screen.findByTitle(/Mark done/);
    await act(async () => { doneBtn.click(); });
    expect(playSfx).toHaveBeenCalledWith("complete");
    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Ship it"), "✅", expect.any(Number));
    expect(onChanged).toHaveBeenCalled();
  });
});

describe("ActionsPanel — Agenda Zero is celebrated, not silent", () => {
  it("plays a milestone sound only on the real >0 → 0 transition, never on an empty mount", async () => {
    const { rerender } = render(<ActionsPanel nodes={[]} onFocus={() => {}} />);
    expect(playSfx).not.toHaveBeenCalled();

    rerender(<ActionsPanel nodes={[node({ id: 1, label: "One task", kind: "action" })]} onFocus={() => {}} />);
    await screen.findByText("One task");
    expect(playSfx).not.toHaveBeenCalled();

    rerender(<ActionsPanel nodes={[]} onFocus={() => {}} />);
    expect(playSfx).toHaveBeenCalledWith("milestone");
    expect(pushToast).toHaveBeenCalledWith(expect.stringContaining("Agenda Zero"), "🎯", expect.any(Number));
  });
});

describe("ActionsPanel — a huge action list doesn't render unbounded", () => {
  it("caps the action items list and shows a '+N more' hint", async () => {
    const many = Array.from({ length: 60 }, (_, i) => node({ id: i + 1, label: `Action ${i + 1}`, kind: "action" }));
    render(<ActionsPanel nodes={many} onFocus={() => {}} />);
    await screen.findByText("Action 1");
    expect(screen.queryByText("Action 51")).toBeNull();
    expect(screen.getByText(/\+10 more/)).toBeTruthy();
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
