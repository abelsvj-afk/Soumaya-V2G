import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GraphData } from "@brain/shared";
import { GymOverlay } from "./GymOverlay.js";

describe("GymOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("brain.spaceId", "space-1");
  });

  it("shows real streak and fuel numbers, never invented ones", () => {
    const graph: GraphData = { nodes: [], links: [] };
    render(<GymOverlay graph={graph} fuel={{ fuel: 3, capacity: 10, jobCost: 1 }} streak={{ current: 5, best: 9, today: true }} onClose={vi.fn()} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows a locked achievement's real progress rather than just a lock icon", () => {
    const graph: GraphData = { nodes: [], links: [] };
    render(<GymOverlay graph={graph} fuel={null} streak={null} onClose={vi.fn()} />);
    expect(screen.getByText(/Progress: 0 \/ 25$/)).toBeTruthy();
  });

  it("shows a persisted-unlocked achievement as earned", () => {
    localStorage.setItem("brain.achv.space-1", JSON.stringify(["connector"]));
    const graph: GraphData = { nodes: [], links: [] };
    render(<GymOverlay graph={graph} fuel={null} streak={null} onClose={vi.fn()} />);
    expect(screen.getByText(/Connector — earned/)).toBeTruthy();
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<GymOverlay graph={{ nodes: [], links: [] }} fuel={null} streak={null} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
