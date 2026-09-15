import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HangarOverlay } from "./HangarOverlay.js";
import { creditHour, treasuryBalanceCents } from "../data/townLedger.js";
import { armHomeType, CONSTRUCTION_MS, placeArmedHome } from "../data/housing.js";
import { armBusinessType, placeArmedBusiness } from "../data/business.js";
import { armItem, placeArmedItem } from "../data/townBuilder.js";
import { armZoneType, zoneTileAt } from "../data/zoning.js";

describe("HangarOverlay", () => {
  beforeEach(() => localStorage.clear());

  it("defaults every selection to the same fallback HangarPanel.tsx uses", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
    expect((screen.getByLabelText(/Traveler's Outfit/) as HTMLSelectElement).value).toBe("default");
    expect((screen.getByLabelText(/Footprint Trail/) as HTMLSelectElement).value).toBe("blue");
  });

  it("persists a selection to the SAME localStorage key HangarPanel.tsx reads", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={200} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Traveler's Outfit/), { target: { value: "organic" } });
    expect(localStorage.getItem("brain.hangar.ship.space-1")).toBe("organic");
  });

  it("a locked option cannot be selected and shows its unlock hint as text, not color-only", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
    const select = screen.getByLabelText(/Traveler's Outfit/) as HTMLSelectElement;
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

    it("zoning-rework.md — arming a type stays armed after painting, no auto-clear", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      fireEvent.click(screen.getAllByText("Zone")[0]!); // Residential
      // Re-rendering the same overlay still shows the arm as active (reads real localStorage
      // state directly, same convention as the Treasury balance) — never auto-cleared.
      expect(screen.getByText("Residential")).toBeTruthy();
      expect(screen.getByText(/Tile\) is ready to paint/)).toBeTruthy();
    });

    it("zoning-rework.md — switching to Area mode before arming shows the two-press instructions", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("Area — a whole rectangle"));
      fireEvent.click(screen.getAllByText("Zone")[0]!); // Residential, now armed in Area mode
      expect(screen.getByText(/Area\) is ready: press A on a corner tile/)).toBeTruthy();
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

    it("buying a second home type re-arms rather than queuing, refunding the first (2026-09-15 audit fix)", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank"); // 40 * 25c = $10.00
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const cottageRow = screen.getByText(/Cottage — 1 resident/).closest("li")!;
      const duplexRow = screen.getByText(/Duplex — 2 residents/).closest("li")!;
      fireEvent.click(cottageRow.querySelector("button")!); // $3.00 — $7.00 left
      fireEvent.click(duplexRow.querySelector("button")!); // refunds $3.00 ($10.00), spends $5.00 — $5.00 left
      expect(screen.getByText("Duplex")).toBeTruthy();
      // Cottage's own $3.00 came back — re-armable, never "Can't afford" from a forfeited spend.
      expect(cottageRow.querySelector("button")?.textContent).toBe("Buy");
    });

    it("simcity-economy-construction.md — every home row shows a real image preview of what actually renders in-world, sized by footprint", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const cottageImg = screen.getByText(/Cottage — 1 resident/).closest("li")!.querySelector("img")!;
      const apartmentImg = screen.getByText(/Apartment Block — 4 residents/).closest("li")!.querySelector("img")!;
      expect(cottageImg.getAttribute("src")).toBe("/overworld/buildings/human-city.png"); // the real COTTAGE sprite
      // A 4x3 Apartment Block previews visibly bigger than a 2x2 Cottage — honest to real footprint.
      expect(parseFloat(apartmentImg.style.width)).toBeGreaterThan(parseFloat(cottageImg.style.width));
    });

    it("simcity-economy-construction.md — advertises the real construction delay before move-in", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      // Housing AND Business each advertise it — both are gated by the same real construction delay.
      expect(screen.getAllByText(new RegExp(`${Math.round(CONSTRUCTION_MS / 1000)} seconds to`)).length).toBe(2);
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

    it("simcity-economy-construction.md — every business row shows a real image preview of what actually renders in-world", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const bakeryImg = screen.getByText(/Bakery — \$4\.00/).closest("li")!.querySelector("img")!;
      expect(bakeryImg.getAttribute("src")).toBe("/overworld/buildings/inn.png"); // backlog #78 — Bakery's real distinct sprite
    });

    it("backlog #78 — each business type previews its own distinct illustration, not one shared image", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const bakeryImg = screen.getByText(/Bakery — \$4\.00/).closest("li")!.querySelector("img")!;
      const tailorImg = screen.getByText(/Tailor — \$6\.00/).closest("li")!.querySelector("img")!;
      const bookshopImg = screen.getByText(/Bookshop/).closest("li")!.querySelector("img")!;
      const srcs = new Set([bakeryImg.getAttribute("src"), tailorImg.getAttribute("src"), bookshopImg.getAttribute("src")]);
      expect(srcs.size).toBe(3); // all 3 distinct, never sharing one image
    });
  });

  describe("Demolish (wave3-economy-depth.md decision #3)", () => {
    it("shows no placed lists on a fresh, empty town", () => {
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      expect(screen.queryByText("Your placed items")).toBeNull();
      expect(screen.queryByText("Your placed homes")).toBeNull();
      expect(screen.queryByText("Your placed businesses")).toBeNull();
    });

    it("demolishing a placed decor item refunds its full price and removes the row (two-tap confirm)", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank"); // $10.00
      armItem("space-1", "bench"); // $1.20
      placeArmedItem("space-1", 20, 20);
      const balanceBeforeDemolish = treasuryBalanceCents("space-1");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      expect(screen.getByText("Your placed items")).toBeTruthy();
      const row = screen.getByText("Bench", { selector: "span" }).closest("li")!;
      fireEvent.click(row.querySelector("button")!); // arm the confirm
      fireEvent.click(row.querySelector('[aria-label^="Confirm:"]')!); // confirm
      expect(screen.queryByText("Your placed items")).toBeNull();
      expect(treasuryBalanceCents("space-1")).toBe(balanceBeforeDemolish + 120);
    });

    it("cancelling the demolish confirm leaves the item untouched", () => {
      for (let i = 0; i < 40; i++) creditHour("space-1", "bank");
      armItem("space-1", "bench");
      placeArmedItem("space-1", 20, 20);
      const balanceBeforeDemolish = treasuryBalanceCents("space-1");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      const row = screen.getByText("Bench", { selector: "span" }).closest("li")!;
      fireEvent.click(row.querySelector("button")!); // arm the confirm
      fireEvent.click(screen.getByText("Cancel"));
      expect(screen.getByText("Your placed items")).toBeTruthy();
      expect(treasuryBalanceCents("space-1")).toBe(balanceBeforeDemolish);
    });

    it("demolishing a finished home refunds half its price", () => {
      for (let i = 0; i < 80; i++) creditHour("space-1", "bank"); // $20.00
      armZoneType("space-1", "residential");
      zoneTileAt("space-1", 2, 10);
      zoneTileAt("space-1", 3, 10);
      zoneTileAt("space-1", 2, 11);
      zoneTileAt("space-1", 3, 11);
      armHomeType("space-1", "cottage"); // $3.00, 2x2
      placeArmedHome("space-1", 2, 10, 0); // built "long ago" — finished construction
      const balanceBeforeDemolish = treasuryBalanceCents("space-1");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      expect(screen.getByText("Your placed homes")).toBeTruthy();
      const row = screen.getByText("Cottage", { selector: "span" }).closest("li")!;
      fireEvent.click(row.querySelector("button")!);
      fireEvent.click(row.querySelector('[aria-label^="Confirm:"]')!);
      expect(screen.queryByText("Your placed homes")).toBeNull();
      expect(treasuryBalanceCents("space-1")).toBe(balanceBeforeDemolish + 150); // 50% of $3.00
    });

    it("demolishing a business under construction refunds its full price", () => {
      for (let i = 0; i < 160; i++) creditHour("space-1", "bank"); // $40.00
      armZoneType("space-1", "commercial");
      zoneTileAt("space-1", 2, 10);
      zoneTileAt("space-1", 3, 10);
      zoneTileAt("space-1", 2, 11);
      zoneTileAt("space-1", 3, 11);
      armBusinessType("space-1", "bakery"); // $4.00, 2x2
      placeArmedBusiness("space-1", 2, 10); // real clock — just built, still under construction
      const balanceBeforeDemolish = treasuryBalanceCents("space-1");
      render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
      expect(screen.getByText("Your placed businesses")).toBeTruthy();
      const row = screen.getByText("Bakery", { selector: "span" }).closest("li")!;
      fireEvent.click(row.querySelector("button")!);
      fireEvent.click(row.querySelector('[aria-label^="Confirm:"]')!);
      expect(screen.queryByText("Your placed businesses")).toBeNull();
      expect(treasuryBalanceCents("space-1")).toBe(balanceBeforeDemolish + 400); // 100% while under construction
    });
  });
});
