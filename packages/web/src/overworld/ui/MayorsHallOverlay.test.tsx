import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MayorsHallOverlay } from "./MayorsHallOverlay.js";
import { markWorked } from "../data/buildingNeglect.js";
import { creditHour } from "../data/townLedger.js";
import { armZoneType, zoneTileAt } from "../data/zoning.js";

describe("MayorsHallOverlay (mayors-hall.md)", () => {
  beforeEach(() => localStorage.clear());

  it("lists every other real door-building, never itself", () => {
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText("Bank")).toBeTruthy();
    expect(screen.getByText("Market")).toBeTruthy();
    const rowLabels = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rowLabels.some((text) => text?.includes("Mayor's Hall"))).toBe(false);
  });

  it("shows the real Town Treasury balance, never invented", () => {
    for (let i = 0; i < 40; i++) creditHour("space-1", "bank"); // 40 * 25c = $10.00
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText("$10.00")).toBeTruthy();
  });

  it("marks a never-worked building as needing a visit — the real neglect signal", () => {
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getAllByText("could use a visit").length).toBeGreaterThan(0);
  });

  it("shows a real recently-worked building as doing fine", () => {
    markWorked("space-1", "bank", Date.now());
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    const bankRow = screen.getByText("Bank").closest("li");
    expect(bankRow?.textContent).toContain("doing fine");
  });

  it("shows the real zoning plan counts, never an invented score", () => {
    armZoneType("space-1", "residential");
    zoneTileAt("space-1", 10, 10);
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText("1 zoned")).toBeTruthy();
    expect(screen.getAllByText("0 zoned").length).toBe(3); // commercial, sidewalk, transit
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<MayorsHallOverlay spaceId="space-1" onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
