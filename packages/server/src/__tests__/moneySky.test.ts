import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinBillRepo } from "../repositories/finBill.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { moneySky } from "../finance/sky.js";

/** Stage 4 — bills become stars with a state (cooling=blue) + an on-focus glyph. */

let handle: DbHandle;
beforeEach(() => { handle = createDb(":memory:"); });
afterEach(() => { handle.sqlite.close(); });
const NOW = new Date("2026-01-10T00:00:00Z");

function cadence() {
  const inc = new FinIncomeRepo(handle, "s");
  inc.create({ date: "2026-01-01", netCents: 1000 });
  inc.create({ date: "2026-01-10", netCents: 1000 }); // ~monthly-ish horizon via median gap
}

describe("moneySky", () => {
  it("is empty with no bills", () => {
    expect(moneySky(handle, "s", NOW)).toHaveLength(0);
  });

  it("a comfortably-funded bill due soon is 'approaching'", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Phone", amountCents: 7000, frequency: "monthly", anchorDate: "2026-01-14" });
    const star = moneySky(handle, "s", NOW).find((x) => x.label === "Phone")!;
    expect(star.state).toBe("approaching");
    expect(star.glyph).toBe("◐");
    expect(star.kind).toBe("bill");
  });

  it("a bill you can't cover cools to blue (state 'cooling')", () => {
    new FinAccountRepo(handle, "s").setBalance(3000); // < the bill
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Insurance", amountCents: 25000, frequency: "monthly", anchorDate: "2026-01-14" });
    const star = moneySky(handle, "s", NOW).find((x) => x.label === "Insurance")!;
    expect(star.state).toBe("cooling");
    expect(star.glyph).toBe("❄");
    expect(star.intensity).toBe(1);
  });

  it("a past-due unpaid bill is 'overdue'", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Rent", amountCents: 60000, frequency: "monthly", anchorDate: "2026-01-05" }); // before now
    const star = moneySky(handle, "s", NOW).find((x) => x.label === "Rent")!;
    expect(star.state).toBe("overdue");
    expect(star.glyph).toBe("!");
  });

  it("one star per bill (nearest occurrence)", () => {
    new FinAccountRepo(handle, "s").setBalance(500000);
    cadence();
    new FinBillRepo(handle, "s").create({ name: "Weekly", amountCents: 1000, frequency: "weekly", anchorDate: "2026-01-12" });
    const stars = moneySky(handle, "s", NOW).filter((x) => x.label === "Weekly");
    expect(stars).toHaveLength(1);
  });
});
