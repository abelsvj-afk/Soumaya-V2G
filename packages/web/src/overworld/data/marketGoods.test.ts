import { describe, it, expect, beforeEach } from "vitest";
import { creditHour } from "./townLedger.js";
import { canAffordGood, MARKET_GOODS, ownedGoodIds, purchaseGood } from "./marketGoods.js";

describe("marketGoods (Town Economy round — spends the real Town Treasury, never real Fuel/finance)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with nothing owned", () => {
    expect(ownedGoodIds("space-1").size).toBe(0);
  });

  it("refuses a purchase the treasury can't actually cover", () => {
    const good = MARKET_GOODS[0]!;
    expect(canAffordGood("space-1", good)).toBe(false);
    expect(purchaseGood("space-1", good.id)).toBe(false);
    expect(ownedGoodIds("space-1").size).toBe(0);
  });

  it("buys a real good once the treasury actually covers its price", () => {
    const good = MARKET_GOODS[0]!;
    for (let i = 0; i < 20; i++) creditHour("space-1", "market"); // plenty of real earned wages
    expect(canAffordGood("space-1", good)).toBe(true);
    expect(purchaseGood("space-1", good.id)).toBe(true);
    expect(ownedGoodIds("space-1").has(good.id)).toBe(true);
  });

  it("never buys the same good twice", () => {
    const good = MARKET_GOODS[0]!;
    for (let i = 0; i < 40; i++) creditHour("space-1", "market");
    expect(purchaseGood("space-1", good.id)).toBe(true);
    expect(purchaseGood("space-1", good.id)).toBe(false);
  });

  it("refuses an unknown good id", () => {
    expect(purchaseGood("space-1", "not-a-real-good")).toBe(false);
  });

  it("keeps ownership isolated per space", () => {
    const good = MARKET_GOODS[0]!;
    for (let i = 0; i < 20; i++) creditHour("space-1", "market");
    purchaseGood("space-1", good.id);
    expect(ownedGoodIds("space-2").has(good.id)).toBe(false);
  });
});
