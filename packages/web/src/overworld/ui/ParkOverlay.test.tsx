import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParkOverlay } from "./ParkOverlay.js";
import { markWorked } from "../data/buildingNeglect.js";

vi.mock("../../api/http.js", () => ({ getSpaceId: () => "space-1" }));

describe("ParkOverlay", () => {
  beforeEach(() => localStorage.clear());

  it("lists every OTHER real door-building, never itself", () => {
    render(<ParkOverlay onClose={vi.fn()} />);
    expect(screen.getByText("Bank")).toBeTruthy();
    expect(screen.getByText("Market")).toBeTruthy();
    expect(screen.queryByText("Park")).toBeNull();
  });

  it("marks a never-worked building as needing a visit — the real neglect signal, never invented", () => {
    render(<ParkOverlay onClose={vi.fn()} />);
    expect(screen.getAllByText("could use a visit").length).toBeGreaterThan(0);
  });

  it("shows a real recently-worked building as doing fine", () => {
    markWorked("space-1", "bank", Date.now());
    render(<ParkOverlay onClose={vi.fn()} />);
    const bankRow = screen.getByText("Bank").closest("li");
    expect(bankRow?.textContent).toContain("doing fine");
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<ParkOverlay onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
