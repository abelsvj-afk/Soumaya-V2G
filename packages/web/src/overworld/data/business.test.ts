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
  demolishBusiness,
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

/** Task #128 — neglect now measures from when a town was founded, so these tests must age
 *  the town explicitly: a brand-new town is deliberately NOT neglected any more. Founding at the
 *  epoch makes every never-worked building maximally neglected, which is what each case here is
 *  actually about. */
function ageTownToAncient(spaceId: string): void {
  localStorage.setItem(`brain.townFoundedAt.${spaceId}`, "0");
}

beforeEach(() => {
  localStorage.clear();
  ageTownToAncient(SPACE);
});

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

  describe("demolishBusiness (wave3-economy-depth.md decision #3)", () => {
    it("refunds only 50% once construction is finished — never fully free relocation", () => {
      const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
      zoneCommercialRect(2, 10, 9, 17);
      fundTreasury(2000);
      armBusinessType(SPACE, "bakery");
      const business = placeArmedBusiness(SPACE, 2, 10, 0)!; // built "long ago" — finished construction
      const balanceBeforeDemolish = treasuryBalanceCents(SPACE);
      expect(demolishBusiness(SPACE, business.id)).toBe(true);
      expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeDemolish + Math.floor(bakery.priceCents * 0.5));
      expect(placedBusinesses(SPACE)).toHaveLength(0);
    });

    it("refunds the full real price when still under construction", () => {
      const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
      zoneCommercialRect(2, 10, 9, 17);
      fundTreasury(2000);
      armBusinessType(SPACE, "bakery");
      const builtAt = Date.now();
      const business = placeArmedBusiness(SPACE, 2, 10, builtAt)!; // just placed — still under construction
      const balanceBeforeDemolish = treasuryBalanceCents(SPACE);
      expect(demolishBusiness(SPACE, business.id, builtAt + 1000)).toBe(true);
      expect(treasuryBalanceCents(SPACE)).toBe(balanceBeforeDemolish + bakery.priceCents);
    });

    it("is a no-op, returning false, for an id that doesn't exist", () => {
      expect(demolishBusiness(SPACE, "nonexistent")).toBe(false);
    });
  });

  it("wave3-economy-depth.md decision #2 — a business genuinely adjacent to real transit ages at 75% of the normal rate", async () => {
    const { markWorked, neglectFor } = await import("./buildingNeglect.js");
    zoneCommercialRect(2, 10, 9, 17);
    fundTreasury(2000);
    armBusinessType(SPACE, "bakery"); // 2x2 at (2,10)-(3,11)
    const placed = placeArmedBusiness(SPACE, 2, 10)!;
    const fiveDaysAgo = Date.now() - 5 * 86_400_000;
    markWorked(SPACE, placed.id, fiveDaysAgo);

    const baseline = businessNeglect(SPACE, placed); // not yet transit-adjacent

    armZoneType(SPACE, "transit");
    zoneTileAt(SPACE, 2, 9); // directly above the footprint — a real adjacent transit stop
    const withTransit = businessNeglect(SPACE, placed);

    expect(withTransit).toBeLessThan(baseline); // ages more slowly with real transit access
    // real days elapsed (~5) times the 0.75 multiplier, run through the same real neglectFor math
    expect(withTransit).toBeCloseTo(neglectFor(5 * 0.75), 1);
  });

  describe("the Mall — a real multi-stall business (mall.md, backlog #83)", () => {
    it("stall-door formula reduces to the existing single-door formula when n = 1, for several widths", async () => {
      const { businessStallDoors } = await import("./business.js");
      for (const width of [2, 3, 4, 5, 7]) {
        const business = { id: "b", typeId: "bakery", x0: 10, y0: 10, x1: 10 + width - 1, y1: 12, door: { x: 0, y: 0 }, builtAt: 0 };
        const [door] = businessStallDoors(business);
        expect(door).toEqual({ x: 10 + Math.floor(width / 2), y: 12, stallIndex: 0 });
      }
    });

    it("has 3 real, distinct door tiles, all inside its own footprint", async () => {
      const { businessStallDoors } = await import("./business.js");
      zoneCommercialRect(2, 10, 9, 17);
      fundTreasury(2000);
      armBusinessType(SPACE, "mall");
      const mall = placeArmedBusiness(SPACE, 2, 10)!;
      const doors = businessStallDoors(mall);
      expect(doors).toHaveLength(3);
      const xs = new Set(doors.map((d) => d.x));
      expect(xs.size).toBe(3); // all distinct
      for (const d of doors) {
        expect(d.x).toBeGreaterThanOrEqual(mall.x0);
        expect(d.x).toBeLessThanOrEqual(mall.x1);
        expect(d.y).toBe(mall.y1);
      }
    });

    it("businessStallDoorAt resolves the right stall index for each real door, and null elsewhere", async () => {
      const { businessStallDoors, businessStallDoorAt } = await import("./business.js");
      zoneCommercialRect(2, 10, 9, 17);
      fundTreasury(2000);
      armBusinessType(SPACE, "mall");
      const mall = placeArmedBusiness(SPACE, 2, 10)!;
      for (const door of businessStallDoors(mall)) {
        const found = businessStallDoorAt(SPACE, door.x, door.y);
        expect(found?.business.id).toBe(mall.id);
        expect(found?.stallIndex).toBe(door.stallIndex);
      }
      expect(businessStallDoorAt(SPACE, 0, 0)).toBeNull();
    });

    it("purchaseGoodFromBusiness never lets one stall's own goodId resolve against a different stall", async () => {
      const { BUSINESS_TYPES: types } = await import("./business.js");
      const mallType = types.find((t) => t.id === "mall")!;
      zoneCommercialRect(2, 10, 9, 17);
      fundTreasury(5000);
      armBusinessType(SPACE, "mall");
      const past = -1_000_000; // built well in the past — real construction window already elapsed
      const mall = placeArmedBusiness(SPACE, 2, 10, past)!;
      const toyGood = mallType.stalls![0]!.goods[0]!;
      const flowerGood = mallType.stalls![1]!.goods[0]!;

      // Buying the Toy Stall's own good AT the Flower Stall's index must fail — wrong stall.
      expect(purchaseGoodFromBusiness(SPACE, mall.id, toyGood.id, 1)).toBe(false);
      // The SAME good, at its own real stall index, succeeds.
      expect(purchaseGoodFromBusiness(SPACE, mall.id, toyGood.id, 0)).toBe(true);
      // A different stall's good, at its own index, is entirely independent.
      expect(purchaseGoodFromBusiness(SPACE, mall.id, flowerGood.id, 1)).toBe(true);
    });

    it("goodsForStall returns a single-catalog type's own goods regardless of stallIndex", async () => {
      const { goodsForStall } = await import("./business.js");
      const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
      expect(goodsForStall(bakery, 0)).toBe(bakery.goods);
      expect(goodsForStall(bakery, 5)).toBe(bakery.goods); // out-of-range index ignored for non-mall types
    });
  });
});
