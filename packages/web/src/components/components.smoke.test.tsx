import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { StreakEmber } from "./StreakEmber.js";
import { FuelEarnSheet } from "./FuelEarnSheet.js";

afterEach(cleanup);

/**
 * Leaf-component render smoke tests — the first web component tests. They prove the
 * harness renders React in happy-dom and give a real safety net for refactoring these
 * (and, by pattern, other) components. WebGL-bound components (Graph3D) are out of
 * scope here and are mocked when their parents are tested.
 */

describe("StreakEmber", () => {
  it("shows the streak count + banked shields, and is hidden at zero", () => {
    const { container } = render(<StreakEmber streak={5} atRisk={false} shields={2} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(container.querySelector(".se-shields")).toBeTruthy();
  });

  it("renders nothing when there is no streak", () => {
    const { container } = render(<StreakEmber streak={0} atRisk={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("flags 'at risk' when unfed today", () => {
    const { container } = render(<StreakEmber streak={3} atRisk={true} />);
    expect(container.querySelector(".streak-ember.at-risk")).toBeTruthy();
  });
});

describe("FuelEarnSheet", () => {
  const fuel = { fuel: 40, capacity: 200, jobCost: 2 };

  it("lists the ways to earn (with the current amounts) and closes", () => {
    const onClose = vi.fn();
    render(<FuelEarnSheet fuel={fuel} onAction={vi.fn()} onClose={onClose} />);
    expect(screen.getByText("Ways to earn Fuel")).toBeTruthy();
    expect(screen.getByText("Log a memory")).toBeTruthy();
    expect(screen.getByText("+15")).toBeTruthy(); // the bumped memory reward
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("routes a 'Go' button to the right earn action", () => {
    const onAction = vi.fn();
    render(<FuelEarnSheet fuel={fuel} onAction={onAction} onClose={vi.fn()} />);
    // The first actionable row is "Log a memory" → kind "memory".
    fireEvent.click(screen.getAllByText("Go")[0]!);
    expect(onAction).toHaveBeenCalledWith("memory");
  });
});
