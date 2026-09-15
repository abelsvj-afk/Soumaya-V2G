import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GraphData, GraphNode } from "@brain/shared";
import { BulletinBoardOverlay } from "./BulletinBoardOverlay.js";

vi.mock("../../api/client.js", () => ({
  deleteNode: vi.fn().mockResolvedValue(undefined),
  ackReminder: vi.fn().mockResolvedValue(true),
  ingestText: vi.fn().mockResolvedValue({ nodes: [] }),
}));

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return { id: 1, label: "n", type: "concept", content: "", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("BulletinBoardOverlay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists action nodes as quests and non-action nodes with remindAt as reminders", () => {
    const graph: GraphData = {
      nodes: [
        makeNode({ id: 1, kind: "action", label: "Call the bank" }),
        makeNode({ id: 2, label: "Dentist follow-up", remindAt: "2026-02-01" }),
        makeNode({ id: 3, label: "Untouched memory" }),
      ],
      links: [],
    };
    render(<BulletinBoardOverlay graph={graph} spaceId="space-1" onClose={vi.fn()} refresh={vi.fn()} />);
    expect(screen.getByText("Call the bank")).toBeTruthy();
    expect(screen.getByText("Dentist follow-up")).toBeTruthy();
    expect(screen.queryByText("Untouched memory")).toBeNull();
  });

  it("turning in a quest deletes it and refreshes, behind a real confirm step (2026-09-15 audit fix)", async () => {
    const { deleteNode } = await import("../../api/client.js");
    const refresh = vi.fn();
    const graph: GraphData = { nodes: [makeNode({ id: 1, kind: "action", label: "Call the bank" })], links: [] };
    render(<BulletinBoardOverlay graph={graph} spaceId="space-1" onClose={vi.fn()} refresh={refresh} />);
    fireEvent.click(screen.getByText("Turn in"));
    expect(deleteNode).not.toHaveBeenCalled(); // the first tap only arms the confirm, never turns it in
    fireEvent.click(screen.getByText("Really turn in?"));
    await waitFor(() => expect(deleteNode).toHaveBeenCalledWith(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("acking a reminder calls ackReminder and refreshes", async () => {
    const { ackReminder } = await import("../../api/client.js");
    const refresh = vi.fn();
    const graph: GraphData = { nodes: [makeNode({ id: 2, label: "Dentist", remindAt: "2026-02-01" })], links: [] };
    render(<BulletinBoardOverlay graph={graph} spaceId="space-1" onClose={vi.fn()} refresh={refresh} />);
    fireEvent.click(screen.getByText("Ack"));
    await waitFor(() => expect(ackReminder).toHaveBeenCalledWith(2));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("posting a new quest calls ingestText with kind action", async () => {
    const { ingestText } = await import("../../api/client.js");
    const refresh = vi.fn();
    render(<BulletinBoardOverlay graph={{ nodes: [], links: [] }} spaceId="space-1" onClose={vi.fn()} refresh={refresh} />);
    fireEvent.change(screen.getByLabelText("New quest"), { target: { value: "Renew passport" } });
    fireEvent.click(screen.getByText("Post"));
    await waitFor(() => expect(ingestText).toHaveBeenCalledWith("Renew passport", { kind: "action" }));
  });
});
