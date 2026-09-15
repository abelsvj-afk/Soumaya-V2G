import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TownHud } from "./TownHud.js";
import { creditHour, spendFromTreasury, treasuryBalanceCents } from "../data/townLedger.js";
import { armedZoneType, armZoneType } from "../data/zoning.js";
import { armedItemId, armItem } from "../data/townBuilder.js";
import { armedHomeTypeId, armHomeType } from "../data/housing.js";
import { armedBusinessTypeId, armBusinessType } from "../data/business.js";

describe("TownHud (town-hud.md)", () => {
  beforeEach(() => localStorage.clear());

  it("shows real fuel/streak numbers, never invented", () => {
    render(<TownHud spaceId="space-1" fuel={{ fuel: 42, capacity: 100, jobCost: 5 }} streak={{ current: 3, best: 10, today: true }} />);
    expect(screen.getByText("🔥 3")).toBeTruthy();
    expect(screen.getByText("⚡ 42/100")).toBeTruthy();
  });

  it("defaults to zero, never a crash, when fuel/streak haven't loaded yet", () => {
    render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
    expect(screen.getByText("🔥 0")).toBeTruthy();
    expect(screen.getByText("⚡ 0/0")).toBeTruthy();
  });

  it("shows the real Town Treasury balance", () => {
    for (let i = 0; i < 40; i++) creditHour("space-1", "bank"); // 40 * 25c = $10.00
    render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
    expect(screen.getByText("🏦 $10.00")).toBeTruthy();
  });

  it("no zoning chip appears when nothing is armed", () => {
    render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
    expect(screen.queryByText(/Zoning:/)).toBeNull();
  });

  it("zoning-rework.md — shows an armed zone type/mode and a Stop button that disarms it", () => {
    armZoneType("space-1", "residential", "area");
    render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
    expect(screen.getByText(/Zoning: Residential \(Area\)/)).toBeTruthy();
    fireEvent.click(screen.getByText("Stop"));
    expect(screen.queryByText(/Zoning:/)).toBeNull();
    expect(armedZoneType("space-1")).toBeNull();
  });

  it("zoning-rework.md — Stop also notifies the caller so the scene can clear its own anchor sprite", () => {
    armZoneType("space-1", "commercial", "tile");
    const onZoningStopped = vi.fn();
    render(<TownHud spaceId="space-1" fuel={null} streak={null} onZoningStopped={onZoningStopped} />);
    fireEvent.click(screen.getByText("Stop"));
    expect(onZoningStopped).toHaveBeenCalledTimes(1);
  });

  describe("2026-09-15 audit fix — the other 3 arm modes (town-builder item, home, business) get the same chip + refunding Stop button zoning already had", () => {
    it("shows an armed town-builder item and a Stop button that refunds it", () => {
      for (let i = 0; i < 10; i++) creditHour("space-1", "bank"); // 10 * 25c = $2.50
      armItem("space-1", "garden_bed"); // $0.80
      const balanceAfterArm = treasuryBalanceCents("space-1");
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText(/Placing: Garden Bed/)).toBeTruthy();
      fireEvent.click(screen.getByText("Stop"));
      expect(screen.queryByText(/Placing:/)).toBeNull();
      expect(armedItemId("space-1")).toBeNull();
      expect(treasuryBalanceCents("space-1")).toBeGreaterThan(balanceAfterArm); // real refund, not forfeited
    });

    it("shows an armed home type and a Stop button that refunds it", () => {
      for (let i = 0; i < 20; i++) creditHour("space-1", "bank"); // $5.00
      armHomeType("space-1", "cottage"); // $3.00
      const balanceAfterArm = treasuryBalanceCents("space-1");
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText(/Building: Cottage/)).toBeTruthy();
      fireEvent.click(screen.getByText("Stop"));
      expect(screen.queryByText(/Building:/)).toBeNull();
      expect(armedHomeTypeId("space-1")).toBeNull();
      expect(treasuryBalanceCents("space-1")).toBeGreaterThan(balanceAfterArm);
    });

    it("shows an armed business type and a Stop button that refunds it", () => {
      for (let i = 0; i < 20; i++) creditHour("space-1", "bank"); // $5.00
      armBusinessType("space-1", "bakery"); // $4.00
      const balanceAfterArm = treasuryBalanceCents("space-1");
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText(/Building: Bakery/)).toBeTruthy();
      fireEvent.click(screen.getByText("Stop"));
      expect(screen.queryByText(/Building:/)).toBeNull();
      expect(armedBusinessTypeId("space-1")).toBeNull();
      expect(treasuryBalanceCents("space-1")).toBeGreaterThan(balanceAfterArm);
    });

    it("shows no item/home/business chip when nothing is armed", () => {
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.queryByText(/Placing:/)).toBeNull();
      expect(screen.queryByText(/Building:/)).toBeNull();
    });
  });

  describe("onboarding nudge (wave3-economy-depth.md decision #4)", () => {
    it("shows the tip on a genuinely fresh town", () => {
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText(/New here\? Walk into any building to explore/)).toBeTruthy();
    });

    it("hides the tip once anything has actually happened in the town", () => {
      creditHour("space-1", "bank");
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.queryByText(/New here\?/)).toBeNull();
    });

    it("dismissing the tip hides it and persists so it never shows again on this space", () => {
      const { unmount } = render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      fireEvent.click(screen.getByLabelText("Dismiss onboarding tip"));
      expect(screen.queryByText(/New here\?/)).toBeNull();
      unmount();
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.queryByText(/New here\?/)).toBeNull();
    });

    it("a dismissal on one space never hides the tip on a different, still-fresh space", () => {
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      fireEvent.click(screen.getByLabelText("Dismiss onboarding tip"));
      render(<TownHud spaceId="space-2" fuel={null} streak={null} />);
      expect(screen.getAllByText(/New here\?/)).toHaveLength(1); // only space-2's copy
    });

    it("names the real Treasury payoff, not just 'explore' — the 2026-09-15 discoverability fix", () => {
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText(/earn your Town Treasury/)).toBeTruthy();
    });
  });

  describe("earned-money flash (2026-09-15 real-feedback fix) — makes a Treasury increase visible", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("shows a real '+$0.25' next to the Treasury chip right after an action earns it", () => {
      const { rerender } = render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.queryByText("+$0.25")).toBeNull();
      act(() => {
        creditHour("space-1", "library"); // the real tall-grass-capture credit
      });
      rerender(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText("+$0.25")).toBeTruthy();
    });

    it("clears the flash again after a couple of seconds, never sticking around forever", () => {
      const { rerender } = render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      act(() => {
        creditHour("space-1", "library");
      });
      rerender(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.getByText("+$0.25")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(screen.queryByText("+$0.25")).toBeNull();
    });

    it("never flashes on first render, even when the town already has a real balance", () => {
      creditHour("space-1", "bank");
      render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.queryByText(/^\+\$/)).toBeNull();
    });

    it("never flashes when the balance only ever goes down (a spend), only on real increases", () => {
      for (let i = 0; i < 20; i++) creditHour("space-1", "bank"); // $5.00
      const { rerender } = render(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      act(() => {
        spendFromTreasury("space-1", 100);
      });
      rerender(<TownHud spaceId="space-1" fuel={null} streak={null} />);
      expect(screen.queryByText(/^\+\$/)).toBeNull();
    });
  });
});
