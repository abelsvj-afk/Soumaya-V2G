import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TownHud } from "./TownHud.js";
import { creditHour } from "../data/townLedger.js";
import { armedZoneType, armZoneType } from "../data/zoning.js";

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
});
