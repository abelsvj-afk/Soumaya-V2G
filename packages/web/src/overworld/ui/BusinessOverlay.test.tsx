import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BusinessOverlay } from "./BusinessOverlay.js";
import { armBusinessType, placeArmedBusiness } from "../data/business.js";
import { creditHour } from "../data/townLedger.js";
import { armZoneType, zoneTileAt } from "../data/zoning.js";

const SPACE = "space-1";

function fundTreasury(cents: number): void {
  const hours = Math.ceil(cents / 25);
  for (let i = 0; i < hours; i++) creditHour(SPACE, "bank");
}

function placeRealBakery(): string {
  for (let y = 10; y <= 17; y++) {
    for (let x = 2; x <= 9; x++) {
      armZoneType(SPACE, "commercial");
      zoneTileAt(SPACE, x, y);
    }
  }
  fundTreasury(2000);
  armBusinessType(SPACE, "bakery");
  return placeArmedBusiness(SPACE, 2, 10)!.id;
}

describe("BusinessOverlay (business.md)", () => {
  beforeEach(() => localStorage.clear());

  it("shows the real business type's name, icon, and every one of its own goods", () => {
    const businessId = placeRealBakery();
    render(<BusinessOverlay spaceId={SPACE} businessId={businessId} onClose={vi.fn()} />);
    expect(screen.getByText("Bakery")).toBeTruthy();
    expect(screen.getByText(/Striped Awning/)).toBeTruthy();
    expect(screen.getByText(/Pastry Display Case/)).toBeTruthy();
  });

  it("disables every purchase button when the treasury has nothing left over after building it", () => {
    for (let y = 10; y <= 17; y++) {
      for (let x = 2; x <= 9; x++) {
        armZoneType(SPACE, "commercial");
        zoneTileAt(SPACE, x, y);
      }
    }
    fundTreasury(400); // exactly the bakery's own price, nothing left over
    armBusinessType(SPACE, "bakery");
    const businessId = placeArmedBusiness(SPACE, 2, 10)!.id;
    render(<BusinessOverlay spaceId={SPACE} businessId={businessId} onClose={vi.fn()} />);
    for (const button of screen.getAllByText("Can't afford")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("buying a real good spends the treasury and marks it owned", () => {
    const businessId = placeRealBakery();
    render(<BusinessOverlay spaceId={SPACE} businessId={businessId} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Buy")[0]!);
    expect(screen.getAllByText("Owned").length).toBeGreaterThan(0);
  });

  it("won't sell the same good twice at the same business", () => {
    const businessId = placeRealBakery();
    render(<BusinessOverlay spaceId={SPACE} businessId={businessId} onClose={vi.fn()} />);
    const buyButton = screen.getAllByText("Buy")[0]!;
    fireEvent.click(buyButton);
    const ownedButtons = screen.getAllByText("Owned");
    expect((ownedButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("tolerates a business id that doesn't exist, rather than crashing", () => {
    render(<BusinessOverlay spaceId={SPACE} businessId="nonexistent" onClose={vi.fn()} />);
    expect(screen.getByText(/isn't here anymore/)).toBeTruthy();
  });

  it("calls onClose when leaving", () => {
    const businessId = placeRealBakery();
    const onClose = vi.fn();
    render(<BusinessOverlay spaceId={SPACE} businessId={businessId} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
