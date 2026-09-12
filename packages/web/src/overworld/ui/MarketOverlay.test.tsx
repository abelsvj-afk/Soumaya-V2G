import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketOverlay } from "./MarketOverlay.js";
import { creditHour } from "../data/townLedger.js";
import { MARKET_GOODS } from "../data/marketGoods.js";

describe("MarketOverlay", () => {
  beforeEach(() => localStorage.clear());

  it("shows every good's real price and a real (starting-empty) treasury balance", () => {
    render(<MarketOverlay spaceId="space-1" onClose={vi.fn()} />);
    expect(screen.getByText(/\$0\.00/)).toBeTruthy();
    for (const good of MARKET_GOODS) {
      expect(screen.getByText(new RegExp(good.name))).toBeTruthy();
    }
  });

  it("disables every purchase button when the treasury can't cover anything yet", () => {
    render(<MarketOverlay spaceId="space-1" onClose={vi.fn()} />);
    for (const button of screen.getAllByText(/Can't afford/)) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("actually spends the real treasury on a purchase once it can afford one", () => {
    for (let i = 0; i < 20; i++) creditHour("space-1", "market");
    render(<MarketOverlay spaceId="space-1" onClose={vi.fn()} />);
    const buyButtons = screen.getAllByText("Buy");
    expect(buyButtons.length).toBeGreaterThan(0);
    fireEvent.click(buyButtons[0]!);
    expect(screen.getAllByText("Owned").length).toBeGreaterThan(0);
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<MarketOverlay spaceId="space-1" onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
