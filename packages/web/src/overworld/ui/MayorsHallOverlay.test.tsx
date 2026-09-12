import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MayorsHallOverlay } from "./MayorsHallOverlay.js";
import { markWorked } from "../data/buildingNeglect.js";
import { creditHour } from "../data/townLedger.js";
import { armZoneType, zoneTileAt } from "../data/zoning.js";
import { armHomeType, placeArmedHome } from "../data/housing.js";
import { armBusinessType, placeArmedBusiness } from "../data/business.js";

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

  it("reports zero real residents housed on a fresh town, never a fake number", () => {
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/None of the town's \d+ residents have a home yet/)).toBeTruthy();
  });

  it("reports a real housing summary once a home is actually built", () => {
    // x=2..9,y=10..17 is real open ground clear of every building/object/attendant/grass tile
    // (verified against regionLayout.ts's own isPlacementBlocked in housing.test.ts).
    for (let y = 10; y <= 17; y++) {
      for (let x = 2; x <= 9; x++) {
        armZoneType("space-1", "residential");
        zoneTileAt("space-1", x, y);
      }
    }
    // Fund and build one real cottage (1 resident, lives alone) on the zoned land above.
    for (let i = 0; i < 12; i++) creditHour("space-1", "bank"); // 12 * 25c = $3.00 = cottage price
    armHomeType("space-1", "cottage");
    placeArmedHome("space-1", 2, 10);
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/1 of \d+ residents have a real home — 1 living alone, 0 sharing/)).toBeTruthy();
  });

  it("reports no real businesses built on a fresh town, never a fake one", () => {
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/No real businesses built yet/)).toBeTruthy();
  });

  it("reports a real, never-worked business as needing a visit — same neglect math as everything else", () => {
    for (let y = 10; y <= 17; y++) {
      for (let x = 2; x <= 9; x++) {
        armZoneType("space-1", "commercial");
        zoneTileAt("space-1", x, y);
      }
    }
    for (let i = 0; i < 16; i++) creditHour("space-1", "bank"); // 16 * 25c = $4.00 = bakery price
    armBusinessType("space-1", "bakery");
    placeArmedBusiness("space-1", 2, 10);
    render(<MayorsHallOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/1 of 1 businesses could use a visit/)).toBeTruthy();
    expect(screen.getByText("Bakery")).toBeTruthy();
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<MayorsHallOverlay spaceId="space-1" onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
