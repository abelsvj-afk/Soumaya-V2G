import { describe, it, expect, beforeEach } from "vitest";
import {
  HOME_TYPES,
  armHomeType,
  armedHomeTypeId,
  assignResidents,
  cancelArmedHome,
  canAffordHome,
  clearArmedHome,
  homeForNpc,
  housingSummary,
  isFootprintFreeForHome,
  placeArmedHome,
  placedHomes,
  residentsOfHome,
} from "./housing.js";
import { creditHour, treasuryBalanceCents } from "./townLedger.js";
import { armZoneType, zoneTileAt } from "./zoning.js";
import { allSocietyNpcIds } from "./npcDialogue.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

function fundTreasury(cents: number): void {
  const hours = Math.ceil(cents / 25); // WAGE_PER_HOUR_CENTS is 25 (townLedger.ts)
  for (let i = 0; i < hours; i++) creditHour(SPACE, "bank");
}

/** Zones a real, confirmed-open rectangle of the map (x=2..9, y=10..17 is fully clear of every
 *  real building/object/attendant/grass tile — verified against regionLayout.ts's own
 *  isPlacementBlocked, not assumed) as residential, one tile at a time (zoning.ts's real
 *  arm-then-paint flow, never a shortcut around it). */
function zoneResidentialRect(x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      armZoneType(SPACE, "residential");
      zoneTileAt(SPACE, x, y);
    }
  }
}

describe("housing — real, player-built homes gated on zoning (housing.md)", () => {
  it("won't arm a home type the treasury can't afford", () => {
    expect(armHomeType(SPACE, "cottage")).toBe(false);
    expect(armedHomeTypeId(SPACE)).toBeNull();
  });

  it("won't arm an unknown home type id", () => {
    fundTreasury(2000);
    expect(armHomeType(SPACE, "mansion")).toBe(false);
  });

  it("arms an affordable home type and spends the real treasury immediately", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    fundTreasury(cottage.priceCents);
    expect(canAffordHome(SPACE, cottage)).toBe(true);
    expect(armHomeType(SPACE, "cottage")).toBe(true);
    expect(armedHomeTypeId(SPACE)).toBe("cottage");
    expect(canAffordHome(SPACE, cottage)).toBe(false); // spent already
  });

  it("re-arming a second home type replaces the first — never a queue", () => {
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    armHomeType(SPACE, "duplex");
    expect(armedHomeTypeId(SPACE)).toBe("duplex");
  });

  it("simcity-economy-construction.md 2026-09-15 audit fix — re-arming a different home type refunds the first, never forfeits the money", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    const duplex = HOME_TYPES.find((t) => t.id === "duplex")!;
    fundTreasury(2000);
    const balanceBeforeAnyPurchase = treasuryBalanceCents(SPACE);
    armHomeType(SPACE, "cottage");
    armHomeType(SPACE, "duplex"); // re-arm to a DIFFERENT type — cottage's price must come back
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeAnyPurchase - duplex.priceCents);
    expect(treasuryBalanceCents(SPACE)).not.toBe(balanceBeforeAnyPurchase - cottage.priceCents - duplex.priceCents);
  });

  it("cancelArmedHome refunds the armed home type's real price and clears the arm", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    fundTreasury(2000);
    const balanceBeforePurchase = treasuryBalanceCents(SPACE);
    armHomeType(SPACE, "cottage");
    expect(cancelArmedHome(SPACE)).toBe(true);
    expect(armedHomeTypeId(SPACE)).toBeNull();
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforePurchase);
  });

  it("cancelArmedHome is a no-op, returning false, when nothing is armed", () => {
    expect(cancelArmedHome(SPACE)).toBe(false);
  });

  it("a footprint on unzoned open ground is never buildable — zoning gates where a home can go", () => {
    // x=2..9,y=10..17 is real open ground, but nothing has been zoned residential yet.
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    expect(isFootprintFreeForHome(SPACE, 2, 10, cottage)).toBe(false);
  });

  it("a footprint zoned residential and clear of real geometry is buildable", () => {
    zoneResidentialRect(2, 10, 9, 17);
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    expect(isFootprintFreeForHome(SPACE, 2, 10, cottage)).toBe(true);
  });

  it("places the armed home at a free footprint, persists it, and clears the armed state", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "duplex"); // 3x2
    const placed = placeArmedHome(SPACE, 2, 10);
    expect(placed?.typeId).toBe("duplex");
    expect(placed?.x0).toBe(2);
    expect(placed?.y0).toBe(10);
    expect(placed?.x1).toBe(4);
    expect(placed?.y1).toBe(11);
    expect(armedHomeTypeId(SPACE)).toBeNull();
    expect(placedHomes(SPACE)).toHaveLength(1);
  });

  it("placing with nothing armed is a no-op, not an error", () => {
    expect(placeArmedHome(SPACE, 2, 10)).toBeNull();
  });

  it("a footprint overlapping an already-placed home is no longer free", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage"); // 2x2 at (2,10)-(3,11)
    placeArmedHome(SPACE, 2, 10);
    const duplex = HOME_TYPES.find((t) => t.id === "duplex")!; // 3x2 — would overlap at (3,11)
    expect(isFootprintFreeForHome(SPACE, 3, 11, duplex)).toBe(false);
  });

  it("2026-09-15 audit fix — a footprint overlapping an already-placed BUSINESS is no longer free either, closing the cross-type overlap exploit", () => {
    zoneResidentialRect(2, 10, 9, 17);
    // A real business footprint planted directly (bypassing zoning's own commercial gate,
    // since this test's only concern is housing's own cross-category check, not how the
    // business itself got there — zoning.test.ts covers the re-zoning half of this fix).
    localStorage.setItem(
      `brain.business.placed.${SPACE}`,
      JSON.stringify([{ id: "b1", typeId: "bakery", x0: 2, y0: 10, x1: 3, y1: 11, door: { x: 2, y: 11 }, builtAt: 0 }]),
    );
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!; // 2x2 — exactly the business's own footprint
    expect(isFootprintFreeForHome(SPACE, 2, 10, cottage)).toBe(false);
  });

  it("clearArmedHome clears without placing anything", () => {
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    clearArmedHome(SPACE);
    expect(armedHomeTypeId(SPACE)).toBeNull();
    expect(placeArmedHome(SPACE, 2, 10)).toBeNull();
  });

  it("assigns residents deterministically, packed to each home's real capacity in build order", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage"); // capacity 1
    placeArmedHome(SPACE, 2, 10, 0); // built "long ago" — past CONSTRUCTION_MS, so it's move-in ready
    fundTreasury(2000);
    armHomeType(SPACE, "duplex"); // capacity 2
    placeArmedHome(SPACE, 6, 10, 0);

    const npcIds = allSocietyNpcIds();
    const assignments = assignResidents(SPACE);
    expect(assignments).toHaveLength(3); // 1 (cottage) + 2 (duplex)

    const cottageHome = placedHomes(SPACE)[0]!;
    const duplexHome = placedHomes(SPACE)[1]!;
    expect(residentsOfHome(SPACE, cottageHome.id)).toEqual([npcIds[0]]);
    expect(residentsOfHome(SPACE, duplexHome.id)).toEqual([npcIds[1], npcIds[2]]);
    expect(homeForNpc(SPACE, npcIds[0]!)).toBe(cottageHome.id);
    expect(homeForNpc(SPACE, npcIds[3]!)).toBeNull(); // no home built for them yet
  });

  it("reports an honest housing summary — real counts, never an invented story", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage"); // 1 resident, lives alone
    placeArmedHome(SPACE, 2, 10, 0); // built "long ago" — past CONSTRUCTION_MS, so it's move-in ready
    fundTreasury(2000);
    armHomeType(SPACE, "house"); // 3 residents, sharing
    placeArmedHome(SPACE, 6, 12, 0);

    const summary = housingSummary(SPACE);
    expect(summary.housed).toBe(4);
    expect(summary.total).toBe(allSocietyNpcIds().length);
    expect(summary.livingAlone).toBe(1);
    expect(summary.sharing).toBe(1);
  });

  it("simcity-economy-construction.md — a freshly-placed home is still under construction and houses nobody yet", () => {
    zoneResidentialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armHomeType(SPACE, "cottage");
    placeArmedHome(SPACE, 2, 10); // real clock — just built, not move-in ready yet
    expect(housingSummary(SPACE).housed).toBe(0);
  });

  it("a fresh town has zero housed NPCs, not a crash", () => {
    const summary = housingSummary(SPACE);
    expect(summary.housed).toBe(0);
    expect(summary.livingAlone).toBe(0);
    expect(summary.sharing).toBe(0);
  });
});
