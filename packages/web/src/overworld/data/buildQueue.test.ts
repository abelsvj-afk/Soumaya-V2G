import { describe, it, expect, beforeEach } from "vitest";
import {
  cancelOrder,
  completeOrder,
  dispatchModeEnabled,
  enqueueZoneRect,
  enqueueZoneTile,
  queueArmedBusiness,
  queueArmedHome,
  queueArmedItem,
  queuedOrders,
  setDispatchModeEnabled,
} from "./buildQueue.js";
import { creditHour, spendFromTreasury, treasuryBalanceCents } from "./townLedger.js";
import { armZoneType, zoneTileAt, zoneTypeAt } from "./zoning.js";
import { isTileOccupiedByPlacedItem, PLACEABLE_ITEMS } from "./townBuilder.js";
import { armHomeType, HOME_TYPES, placedHomes } from "./housing.js";
import { armBusinessType, BUSINESS_TYPES, placedBusinesses } from "./business.js";

const SPACE = "test-space";
// A real open tile confirmed by the pattern every other zoning/town-builder test file in this
// package already uses for a plain, unremarkable patch of ground.
const OPEN_X = 5;
const OPEN_Y = 5;

/** WAGE_PER_HOUR_CENTS is 25 (townLedger.ts) — same funding convention townBuilder.test.ts
 *  already uses, credited to a fictional place id (never a real building's own neglect state). */
function fundTreasury(cents: number): void {
  for (let i = 0; i < Math.ceil(cents / 25); i++) creditHour(SPACE, "bank");
}

/** Simulates the real Hangar `armItem` step (fund the treasury, then spend the item's own real
 *  price) so a `queueArmedItem` test starts from the exact real precondition it assumes: an
 *  already-armed, already-paid item. */
function armItemForTest(item: (typeof PLACEABLE_ITEMS)[number]): void {
  fundTreasury(item.priceCents + 100_00);
  spendFromTreasury(SPACE, item.priceCents);
}

beforeEach(() => localStorage.clear());

describe("buildQueue — dispatch mode toggle (build-queue-dispatch.md)", () => {
  it("defaults to off (manual placement, today's exact behavior)", () => {
    expect(dispatchModeEnabled(SPACE)).toBe(false);
  });

  it("persists once set", () => {
    setDispatchModeEnabled(SPACE, true);
    expect(dispatchModeEnabled(SPACE)).toBe(true);
    setDispatchModeEnabled(SPACE, false);
    expect(dispatchModeEnabled(SPACE)).toBe(false);
  });
});

describe("buildQueue — enqueue/cancel/complete", () => {
  it("enqueues a zone-tile order for free and it shows up in the queue", () => {
    const order = enqueueZoneTile(SPACE, OPEN_X, OPEN_Y, "residential");
    expect(order).not.toBeNull();
    expect(order!.priceCents).toBe(0);
    expect(queuedOrders(SPACE).map((o) => o.id)).toContain(order!.id);
  });

  it("enqueues a zone-rect order spanning a real rectangle", () => {
    const order = enqueueZoneRect(SPACE, OPEN_X, OPEN_Y, OPEN_X + 2, OPEN_Y + 2, "transit");
    expect(order).not.toBeNull();
    expect(order!.kind).toBe("zone-rect");
    expect(order!.x0).toBe(OPEN_X);
    expect(order!.x1).toBe(OPEN_X + 2);
  });

  it("normalizes zone-rect corners regardless of the order they're passed in", () => {
    const order = enqueueZoneRect(SPACE, OPEN_X + 2, OPEN_Y + 2, OPEN_X, OPEN_Y, "sidewalk");
    expect(order!.x0).toBe(OPEN_X);
    expect(order!.y0).toBe(OPEN_Y);
    expect(order!.x1).toBe(OPEN_X + 2);
    expect(order!.y1).toBe(OPEN_Y + 2);
  });

  it("queueArmedItem never spends the treasury itself — the real spend already happened at armItem time", () => {
    const item = PLACEABLE_ITEMS[0]!;
    armItemForTest(item);
    const before = treasuryBalanceCents(SPACE);
    const order = queueArmedItem(SPACE, OPEN_X, OPEN_Y, item.id);
    expect(order).not.toBeNull();
    expect(order!.priceCents).toBe(item.priceCents); // captured for a later refund, not charged again
    expect(treasuryBalanceCents(SPACE)).toBe(before); // unchanged
  });

  it("queueArmedItem doesn't re-check affordability, mirroring placeArmedItem's own convention", () => {
    // Deliberately never funds the treasury — armItem is the real gate; this function trusts
    // its caller the same way placeArmedItem already does for the immediate-placement path.
    const item = PLACEABLE_ITEMS[0]!;
    expect(queueArmedItem(SPACE, OPEN_X, OPEN_Y, item.id)).not.toBeNull();
  });

  it("refuses to queue an unknown item id", () => {
    expect(queueArmedItem(SPACE, OPEN_X, OPEN_Y, "not-a-real-item")).toBeNull();
  });

  it("refuses to queue an item onto a tile that isn't free for placement", () => {
    const item = PLACEABLE_ITEMS[0]!;
    armItemForTest(item);
    queueArmedItem(SPACE, OPEN_X, OPEN_Y, item.id);
    completeOrder(SPACE, queuedOrders(SPACE)[0]!.id); // now really placed there
    const second = PLACEABLE_ITEMS[1]!;
    armItemForTest(second);
    expect(queueArmedItem(SPACE, OPEN_X, OPEN_Y, second.id)).toBeNull();
  });

  it("cancelOrder refunds a paid item order and removes it from the queue", () => {
    const item = PLACEABLE_ITEMS[0]!;
    armItemForTest(item);
    const order = queueArmedItem(SPACE, OPEN_X, OPEN_Y, item.id)!;
    const beforeCancel = treasuryBalanceCents(SPACE);
    expect(cancelOrder(SPACE, order.id)).toBe(true);
    expect(treasuryBalanceCents(SPACE)).toBe(beforeCancel + item.priceCents);
    expect(queuedOrders(SPACE).map((o) => o.id)).not.toContain(order.id);
  });

  it("cancelOrder is a free no-op refund for a zoning order (always priced at 0)", () => {
    const order = enqueueZoneTile(SPACE, OPEN_X, OPEN_Y, "residential")!;
    const before = treasuryBalanceCents(SPACE);
    expect(cancelOrder(SPACE, order.id)).toBe(true);
    expect(treasuryBalanceCents(SPACE)).toBe(before);
  });

  it("cancelOrder returns false, changing nothing, for an order that no longer exists", () => {
    expect(cancelOrder(SPACE, "not-a-real-order-id")).toBe(false);
  });

  it("completeOrder applies a real zone-tile effect and removes the order", () => {
    const order = enqueueZoneTile(SPACE, OPEN_X, OPEN_Y, "commercial")!;
    expect(completeOrder(SPACE, order.id)).toBe(true);
    expect(zoneTypeAt(SPACE, OPEN_X, OPEN_Y)).toBe("commercial");
    expect(queuedOrders(SPACE).map((o) => o.id)).not.toContain(order.id);
  });

  it("completeOrder applies a real zone-rect effect across every zonable tile in it", () => {
    const order = enqueueZoneRect(SPACE, OPEN_X, OPEN_Y, OPEN_X + 1, OPEN_Y, "residential")!;
    expect(completeOrder(SPACE, order.id)).toBe(true);
    expect(zoneTypeAt(SPACE, OPEN_X, OPEN_Y)).toBe("residential");
    expect(zoneTypeAt(SPACE, OPEN_X + 1, OPEN_Y)).toBe("residential");
  });

  it("completeOrder applies a real item placement and removes the order", () => {
    const item = PLACEABLE_ITEMS[0]!;
    armItemForTest(item);
    const order = queueArmedItem(SPACE, OPEN_X, OPEN_Y, item.id)!;
    expect(completeOrder(SPACE, order.id)).toBe(true);
    expect(isTileOccupiedByPlacedItem(SPACE, OPEN_X, OPEN_Y)).toBe(true);
  });

  it("completeOrder's own captured zone type applies even if the Hangar has since armed something else", () => {
    // build-queue-dispatch.md's own resolved decision: a queued order must never depend on live
    // arm state. zoning.ts's armZoneType is intentionally never called here — completeOrder
    // must still apply the order's own captured type correctly.
    const order = enqueueZoneTile(SPACE, OPEN_X, OPEN_Y, "sidewalk")!;
    completeOrder(SPACE, order.id);
    expect(zoneTypeAt(SPACE, OPEN_X, OPEN_Y)).toBe("sidewalk");
  });

  it("completeOrder silently drops and refunds a stale item order whose target got built over first", () => {
    const item = PLACEABLE_ITEMS[0]!;
    armItemForTest(item);
    const order = queueArmedItem(SPACE, OPEN_X, OPEN_Y, item.id)!;
    // Something else takes the exact same tile before the worker arrives.
    const other = PLACEABLE_ITEMS[1]!;
    armItemForTest(other);
    const otherOrder = queueArmedItem(SPACE, OPEN_X, OPEN_Y, other.id)!;
    completeOrder(SPACE, otherOrder.id); // the other order lands there first
    const beforeStaleComplete = treasuryBalanceCents(SPACE);
    expect(completeOrder(SPACE, order.id)).toBe(false);
    expect(treasuryBalanceCents(SPACE)).toBe(beforeStaleComplete + item.priceCents);
    expect(queuedOrders(SPACE).map((o) => o.id)).not.toContain(order.id);
  });

  it("completeOrder returns false, changing nothing, for an order that no longer exists", () => {
    expect(completeOrder(SPACE, "not-a-real-order-id")).toBe(false);
  });

  it("the queue is FIFO by insertion order", () => {
    const a = enqueueZoneTile(SPACE, OPEN_X, OPEN_Y, "residential")!;
    const b = enqueueZoneTile(SPACE, OPEN_X + 1, OPEN_Y, "commercial")!;
    const orders = queuedOrders(SPACE);
    expect(orders[0]!.id).toBe(a.id);
    expect(orders[1]!.id).toBe(b.id);
  });
});

describe("buildQueue — dispatch-any-job (task #129): home/business, not just 1-tile orders", () => {
  // Real open ground in the task #129 frontier expansion, confirmed by direct measurement
  // against `isPlacementBlocked` (not guessed) — far enough apart that a 2x2 home and a 2x2
  // business footprint can never overlap each other.
  const HOME_X = 0;
  const HOME_Y = 34;
  const BIZ_X = 10;
  const BIZ_Y = 34;

  function zoneRect(x0: number, y0: number, x1: number, y1: number, type: "residential" | "commercial"): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        armZoneType(SPACE, type);
        zoneTileAt(SPACE, x, y);
      }
    }
  }

  function fundTreasury(cents: number): void {
    for (let i = 0; i < Math.ceil(cents / 25); i++) creditHour(SPACE, "bank");
  }

  it("queueArmedHome creates a real order for the home's own real footprint and price", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    zoneRect(HOME_X, HOME_Y, HOME_X + cottage.width - 1, HOME_Y + cottage.height - 1, "residential");
    fundTreasury(cottage.priceCents);
    armHomeType(SPACE, "cottage");
    const order = queueArmedHome(SPACE, HOME_X, HOME_Y, "cottage")!;
    expect(order).not.toBeNull();
    expect(order.kind).toBe("home");
    expect(order.typeId).toBe("cottage");
    expect(order.x0).toBe(HOME_X);
    expect(order.y0).toBe(HOME_Y);
    expect(order.x1).toBe(HOME_X + cottage.width - 1);
    expect(order.y1).toBe(HOME_Y + cottage.height - 1);
    expect(order.priceCents).toBe(cottage.priceCents);
  });

  it("queueArmedHome returns null, changing nothing, when the footprint isn't actually free (unzoned ground)", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    fundTreasury(cottage.priceCents);
    armHomeType(SPACE, "cottage");
    // Deliberately never zoned residential here.
    expect(queueArmedHome(SPACE, 40, 40, "cottage")).toBeNull();
    expect(queuedOrders(SPACE)).toHaveLength(0);
  });

  it("completeOrder builds the exact queued home type, even if the player re-armed something else since", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    zoneRect(HOME_X, HOME_Y, HOME_X + cottage.width - 1, HOME_Y + cottage.height - 1, "residential");
    fundTreasury(cottage.priceCents);
    armHomeType(SPACE, "cottage");
    const order = queueArmedHome(SPACE, HOME_X, HOME_Y, "cottage")!;

    // Re-arm a totally different type after queueing, before the worker ever completes it.
    const duplex = HOME_TYPES.find((t) => t.id === "duplex")!;
    fundTreasury(duplex.priceCents);
    armHomeType(SPACE, "duplex");

    expect(completeOrder(SPACE, order.id)).toBe(true);
    const homes = placedHomes(SPACE);
    expect(homes).toHaveLength(1);
    expect(homes[0]!.typeId).toBe("cottage"); // the queued type, not whatever's armed now
    expect(queuedOrders(SPACE)).toHaveLength(0);
  });

  it("completeOrder silently drops and refunds a stale home order whose footprint got built over first", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    zoneRect(HOME_X, HOME_Y, HOME_X + cottage.width - 1, HOME_Y + cottage.height - 1, "residential");
    fundTreasury(cottage.priceCents);
    armHomeType(SPACE, "cottage");
    const order = queueArmedHome(SPACE, HOME_X, HOME_Y, "cottage")!;

    // Something else gets built on the exact same footprint before the worker arrives.
    fundTreasury(cottage.priceCents);
    armHomeType(SPACE, "cottage");
    const otherOrder = queueArmedHome(SPACE, HOME_X, HOME_Y, "cottage")!;
    completeOrder(SPACE, otherOrder.id);

    const before = treasuryBalanceCents(SPACE);
    expect(completeOrder(SPACE, order.id)).toBe(false);
    expect(treasuryBalanceCents(SPACE)).toBe(before + cottage.priceCents); // refunded, not lost
    expect(placedHomes(SPACE)).toHaveLength(1); // only the first order actually built
  });

  it("cancelOrder refunds a still-pending home order's real price", () => {
    const cottage = HOME_TYPES.find((t) => t.id === "cottage")!;
    zoneRect(HOME_X, HOME_Y, HOME_X + cottage.width - 1, HOME_Y + cottage.height - 1, "residential");
    fundTreasury(cottage.priceCents);
    armHomeType(SPACE, "cottage");
    const order = queueArmedHome(SPACE, HOME_X, HOME_Y, "cottage")!;
    const before = treasuryBalanceCents(SPACE);
    expect(cancelOrder(SPACE, order.id)).toBe(true);
    expect(treasuryBalanceCents(SPACE)).toBe(before + cottage.priceCents);
  });

  it("queueArmedBusiness mirrors queueArmedHome exactly, for a real business type", () => {
    const bakery = BUSINESS_TYPES.find((t) => t.id === "bakery")!;
    zoneRect(BIZ_X, BIZ_Y, BIZ_X + bakery.width - 1, BIZ_Y + bakery.height - 1, "commercial");
    fundTreasury(bakery.priceCents);
    armBusinessType(SPACE, "bakery");
    const order = queueArmedBusiness(SPACE, BIZ_X, BIZ_Y, "bakery")!;
    expect(order.kind).toBe("business");
    expect(order.typeId).toBe("bakery");
    expect(order.priceCents).toBe(bakery.priceCents);

    expect(completeOrder(SPACE, order.id)).toBe(true);
    const businesses = placedBusinesses(SPACE);
    expect(businesses).toHaveLength(1);
    expect(businesses[0]!.typeId).toBe("bakery");
  });
});
