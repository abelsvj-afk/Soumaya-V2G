import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HangarOverlay } from "./HangarOverlay.js";
import { creditHour } from "../data/townLedger.js";

describe("HangarOverlay", () => {
  beforeEach(() => localStorage.clear());

  it("defaults every selection to the same fallback HangarPanel.tsx uses", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
    expect((screen.getByLabelText(/Spaceship Hull/) as HTMLSelectElement).value).toBe("default");
    expect((screen.getByLabelText(/Cosmic Trail/) as HTMLSelectElement).value).toBe("blue");
  });

  it("persists a selection to the SAME localStorage key HangarPanel.tsx reads", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={200} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Spaceship Hull/), { target: { value: "organic" } });
    expect(localStorage.getItem("brain.hangar.ship.space-1")).toBe("organic");
  });

  it("a locked option cannot be selected and shows its unlock hint as text, not color-only", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
    const select = screen.getByLabelText(/Spaceship Hull/) as HTMLSelectElement;
    const organicOption = Array.from(select.options).find((o) => o.value === "organic");
    expect(organicOption?.disabled).toBe(true);
    expect(organicOption?.textContent).toMatch(/🔒/);
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });

  describe("Town Building (town-builder.md)", () => {
    it("can't afford anything with an empty treasury", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      // 4 real town-builder decor items + 4 real home types (housing.md) + 3 real business
      // types (business.md), all unaffordable.
      expect(screen.getAllByText("Can't afford").length).toBe(11);
    });

    it("buying an affordable item arms it and spends the real treasury", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank"); // 40 * 25c = $10.00
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      fireEvent.click(screen.getAllByText("Buy")[0]!); // Garden Bed, $0.80
      expect(screen.getByText("Armed")).toBeTruthy();
      // Exact match: only the "ready to place" banner's <strong> has textContent exactly this.
      expect(screen.getByText("Garden Bed")).toBeTruthy();
    });

    it("buying a second item re-arms rather than queuing", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      fireEvent.click(screen.getAllByText("Buy")[0]!); // Garden Bed
      fireEvent.click(screen.getAllByText("Buy")[0]!); // Bench (Garden Bed's button now says "Armed")
      // Exact match: only the "ready to place" banner's <strong> has textContent exactly "Bench"
      // (the catalog row's own text is "Bench — $1.20", so it can't collide with this match).
      expect(screen.getByText("Bench")).toBeTruthy();
      expect(screen.getAllByText("Armed")).toHaveLength(1); // only Bench, not Garden Bed too
    });
  });

  describe("Zoning (zoning.md)", () => {
    it("shows zero zoned tiles per type with an empty plan, and arming is free regardless of treasury", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      expect(screen.getByText(/Residential — 0 zoned/)).toBeTruthy();
      expect(screen.getByText(/Commercial — 0 zoned/)).toBeTruthy();
      fireEvent.click(screen.getAllByText("Zone")[0]!); // Residential — no treasury needed
      expect(screen.getByText("Residential")).toBeTruthy(); // the "ready to paint" banner's <strong>
    });

    it("arming a second zone type re-arms rather than queuing", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      fireEvent.click(screen.getAllByText("Zone")[0]!); // Residential
      fireEvent.click(screen.getAllByText("Zone")[0]!); // Commercial (Residential's button now says "Armed")
      expect(screen.getByText("Commercial")).toBeTruthy();
      expect(screen.getAllByText("Armed")).toHaveLength(1);
    });
  });

  describe("Housing (housing.md)", () => {
    it("buying an affordable home type arms it and spends the real treasury, independent of town-builder's own arm slot", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank"); // 40 * 25c = $10.00
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      fireEvent.click(screen.getAllByText("Buy")[0]!); // Town Building's own first item, Garden Bed
      const cottageRow = screen.getByText(/Cottage — 1 resident/).closest("li")!;
      fireEvent.click(cottageRow.querySelector("button")!);
      expect(screen.getByText("Cottage")).toBeTruthy(); // the "ready to place" banner's <strong>
      expect(screen.getAllByText("Armed")).toHaveLength(2); // Garden Bed AND Cottage, independent arm slots
    });

    it("buying a second home type re-arms rather than queuing", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const cottageRow = screen.getByText(/Cottage — 1 resident/).closest("li")!;
      const duplexRow = screen.getByText(/Duplex — 2 residents/).closest("li")!;
      fireEvent.click(cottageRow.querySelector("button")!);
      fireEvent.click(duplexRow.querySelector("button")!);
      expect(screen.getByText("Duplex")).toBeTruthy();
      expect(cottageRow.querySelector("button")?.textContent).toBe("Can't afford"); // never re-armed
    });
  });

  describe("Business (business.md)", () => {
    it("buying an affordable business type arms it and spends the real treasury, independent of housing's own arm slot", () => {
      for (let i = 0; i < 80; i++) creditHour("space-1", "bank"); // 80 * 25c = $20.00
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const cottageRow = screen.getByText(/Cottage — 1 resident/).closest("li")!;
      fireEvent.click(cottageRow.querySelector("button")!);
      const bakeryRow = screen.getByText(/Bakery — \$4\.00/).closest("li")!;
      fireEvent.click(bakeryRow.querySelector("button")!);
      expect(screen.getByText("Bakery")).toBeTruthy(); // the "ready to place" banner's <strong>
      expect(screen.getAllByText("Armed")).toHaveLength(2); // Cottage AND Bakery, independent arm slots
    });

    it("buying a second business type re-arms rather than queuing", () => {
      for (let i = 0; i < 80; i++) creditHour("space-1", "bank");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const bakeryRow = screen.getByText(/Bakery — \$4\.00/).closest("li")!;
      const tailorRow = screen.getByText(/Tailor — \$6\.00/).closest("li")!;
      fireEvent.click(bakeryRow.querySelector("button")!);
      fireEvent.click(tailorRow.querySelector("button")!);
      expect(screen.getByText("Tailor")).toBeTruthy();
      expect(bakeryRow.querySelector("button")?.textContent).toBe("Buy"); // re-armable, never still "Armed"
      expect(screen.getAllByText("Armed")).toHaveLength(1); // only Tailor
    });
  });
});
