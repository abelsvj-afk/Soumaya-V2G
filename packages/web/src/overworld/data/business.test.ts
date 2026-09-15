import { describe, it, expect, beforeEach } from "vitest";
import {
  BUSINESS_TYPES,
  armBusinessType,
  armedBusinessTypeId,
  businessById,
  businessDoorAt,
  businessNeglect,
  cancelArmedBusiness,
  canAffordBusiness,
  canAffordGood,
  clearArmedBusiness,
  isFootprintFreeForBusiness,
  ownedGoodIds,
  placeArmedBusiness,
  placedBusinesses,
  purchaseGoodFromBusiness,
} from "./business.js";
import { isNeglected } from "./buildingNeglect.js";
import { creditHour, treasuryBalanceCents } from "./townLedger.js";
import { armZoneType, zoneTileAt } from "./zoning.js";

const SPACE = "test-space";

beforeEach(() => localStorage.clear());

function fundTreasury(cents: number): void {
  const hours = Math.ceil(cents / 25); // WAGE_PER_HOUR_CENTS is 25 (townLedger.ts)
  for (let i = 0; i < hours; i++) creditHour(SPACE, "bank");
}

/** Zones a real, confirmed-open rectangle of the map (x=2..9, y=10..17 is fully clear of every
 *  real building/object/attendant/grass tile — verified against regionLayout.ts's own
 *  isPlacementBlocked in housing.test.ts) as commercial. */
function zoneCommercialRect(x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      armZoneType(SPACE, "commercial");
      zoneTileAt(SPACE, x, y);
    }
  }
}

describe("business — a real multi-business economy gated on zoning (business.md)", () => {
  it("won't arm a business type the treasury can't afford", () => {
    expect(armBusinessType(SPACE, "bakery")).toBe(false);
    expect(armedBusinessTypeId(SPACE)).toBeNull();
  });

  it("won't arm an unknown business type id", () => {
    fundTreasury(2000);
    expect(armBusinessType(SPACE, "casino")).toBe(false);
  });

  it("arms an affordable business type and spends the real treasury immediately", () => {
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
    fundTreasury(bakery.priceCents);
    expect(canAffordBusiness(SPACE, bakery)).toBe(true);
    expect(armBusinessType(SPACE, "bakery")).toBe(true);
    expect(armedBusinessTypeId(SPACE)).toBe("bakery");
    expect(canAffordBusiness(SPACE, bakery)).toBe(false); // spent already
  });

  it("re-arming a second business type replaces the first — never a queue", () => {
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery");
    armBusinessType(SPACE, "tailor");
    expect(armedBusinessTypeId(SPACE)).toBe("tailor");
  });

  it("simcity-economy-construction.md 2026-09-15 audit fix — re-arming a different business type refunds the first, never forfeits the money", () => {
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
    const tailor = BUSINESS_TYPES.find((t) => t.id === "tailor")!;
    fundTreasury(2000);
    const balanceBeforeAnyPurchase = treasuryBalanceCents(SPACE);
    armBusinessType(SPACE, "bakery");
    armBusinessType(SPACE, "tailor"); // re-arm to a DIFFERENT type — bakery's price must come back
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeAnyPurchase - tailor.priceCents);
    expect(treasuryBalanceCents(SPACE)).not.toBe(balanceBeforeAnyPurchase - bakery.priceCents - tailor.priceCents);
  });

  it("cancelArmedBusiness refunds the armed business type's real price and clears the arm", () => {
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
    fundTreasury(2000);
    const balanceBeforePurchase = treasuryBalanceCents(SPACE);
    armBusinessType(SPACE, "bakery");
    expect(cancelArmedBusiness(SPACE)).toBe(true);
    expect(armedBusinessTypeId(SPACE)).toBeNull();
    expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforePurchase);
  });

  it("cancelArmedBusiness is a no-op, returning false, when nothing is armed", () => {
    expect(cancelArmedBusiness(SPACE)).toBe(false);
  });

  it("a footprint zoned residential (not commercial) is never buildable", () => {
    armZoneType(SPACE, "residential");
    zoneTileAt(SPACE, 2, 10);
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
    expect(isFootprintFreeForBusiness(SPACE, 2, 10, bakery)).toBe(false);
  });

  it("a footprint zoned commercial and clear of real geometry is buildable", () => {
    zoneCommercialRect(2, 10, 9, 17);
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
    expect(isFootprintFreeForBusiness(SPACE, 2, 10, bakery)).toBe(true);
  });

  it("places the armed business at a free footprint, persists it, and clears the armed state", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "tailor"); // 3x2
    const placed = placeArmedBusiness(SPACE, 2, 10);
    expect(placed?.typeId).toBe("tailor");
    expect(placed?.x0).toBe(2);
    expect(placed?.x1).toBe(4);
    expect(placed?.y1).toBe(11);
    expect(placed?.door).toEqual({ x: 3, y: 11 });
    expect(armedBusinessTypeId(SPACE)).toBeNull();
    expect(placedBusinesses(SPACE)).toHaveLength(1);
  });

  it("placing with nothing armed is a no-op, not an error", () => {
    expect(placeArmedBusiness(SPACE, 2, 10)).toBeNull();
  });

  it("a footprint overlapping an already-placed business is no longer free", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery"); // 2x2 at (2,10)-(3,11)
    placeArmedBusiness(SPACE, 2, 10);
    const tailor = BUSINESS_TYPES.find((t) => t.id === "tailor")!; // 3x2 — would overlap at (3,11)
    expect(isFootprintFreeForBusiness(SPACE, 3, 11, tailor)).toBe(false);
  });

  it("2026-09-15 audit fix — a footprint overlapping an already-placed HOME is no longer free either, closing the cross-type overlap exploit", () => {
    zoneCommercialRect(2, 10, 9, 17);
    // A real home footprint planted directly (bypassing zoning's own residential gate — this
    // test's only concern is business's own cross-category check; zoning.test.ts covers the
    // re-zoning half of this fix).
    localStorage.setItem(
      `brain.housing.placed.${SPACE}`,
      JSON.stringify([{ id: "h1", typeId: "cottage", x0: 2, y0: 10, x1: 3, y1: 11, door: { x: 2, y: 11 }, builtAt: 0 }]),
    );
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!; // 2x2 — exactly the home's own footprint
    expect(isFootprintFreeForBusiness(SPACE, 2, 10, bakery)).toBe(false);
  });

  it("clearArmedBusiness clears without placing anything", () => {
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery");
    clearArmedBusiness(SPACE);
    expect(armedBusinessTypeId(SPACE)).toBeNull();
    expect(placeArmedBusiness(SPACE, 2, 10)).toBeNull();
  });

  it("stepping onto a business's own door tile is found by businessDoorAt", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery");
    const placed = placeArmedBusiness(SPACE, 2, 10)!;
    expect(businessDoorAt(SPACE, placed.door.x, placed.door.y)?.id).toBe(placed.id);
    expect(businessDoorAt(SPACE, 0, 0)).toBeNull();
    expect(businessById(SPACE, placed.id)?.id).toBe(placed.id);
  });

  it("won't sell a good that doesn't belong to this business's own type", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery");
    const placed = placeArmedBusiness(SPACE, 2, 10)!;
    expect(purchaseGoodFromBusiness(SPACE, placed.id, "tailor_ribbon")).toBe(false);
  });

  it("buying a real good spends the treasury, marks it owned, and credits this business's own real hours", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery"); // $4.00
    const placed = placeArmedBusiness(SPACE, 2, 10, 0)!; // built "long ago" — past CONSTRUCTION_MS, so it's open for business
    const good = BUSINESS_TYPES.find((t) => t.id === "bakery")!.goods[0]!;
    expect(canAffordGood(SPACE, good)).toBe(true);
    expect(purchaseGoodFromBusiness(SPACE, placed.id, good.id)).toBe(true);
    expect(ownedGoodIds(SPACE, placed.id).has(good.id)).toBe(true);
    expect(purchaseGoodFromBusiness(SPACE, placed.id, good.id)).toBe(false); // already owned
    expect(isNeglected(businessNeglect(SPACE, placed))).toBe(false); // just worked — real reset
  });

  it("simcity-economy-construction.md — won't sell from a business still under construction", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery");
    const placed = placeArmedBusiness(SPACE, 2, 10)!; // real clock — just built, not open yet
    const good = BUSINESS_TYPES.find((t) => t.id === "bakery")!.goods[0]!;
    expect(purchaseGoodFromBusiness(SPACE, placed.id, good.id)).toBe(false);
  });

  it("a never-worked business is maximally neglected, same math as every other building", () => {
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery");
    const placed = placeArmedBusiness(SPACE, 2, 10)!;
    expect(businessNeglect(SPACE, placed)).toBe(1);
  });
});
