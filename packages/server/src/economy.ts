import type { Fuel } from "@brain/shared";
import type { DbHandle } from "./db/client.js";
import { DEFAULT_SPACE } from "./db/schema.js";

/**
 * The "Celestial Economy": Fuel is a free, in-app energy that powers Soumaya's
 * autonomous work. You EARN it by tending the galaxy (adding memories, forging
 * links, clearing action items) and she SPENDS it on autonomous LLM jobs — on
 * top of the real USD budget, which remains the hard cap. At zero fuel she idles
 * on free upkeep only. Fully space-scoped (each brain has its own fuel).
 */
export const FUEL_START = 25;
export const FUEL_CAP = 120;
export const FUEL_JOB_COST = 2; // per autonomous LLM job
export const EARN_MEMORY = 3; // logging a real memory
export const EARN_LINK = 0.5; // each associative link formed
export const EARN_ACTION_DONE = 1.5; // clearing a day-to-day action item

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export class EconomyRepo {
  constructor(
    private readonly h: DbHandle,
    private readonly spaceId: string = DEFAULT_SPACE,
  ) {}

  /** Lazily create this brain's fuel row at the starting balance. */
  private ensure(): void {
    this.h.sqlite
      .prepare(`INSERT OR IGNORE INTO space_meta (space_id, fuel) VALUES (?, ?)`)
      .run(this.spaceId, FUEL_START);
  }

  get(): number {
    this.ensure();
    const row = this.h.sqlite
      .prepare(`SELECT fuel FROM space_meta WHERE space_id = ?`)
      .get(this.spaceId) as { fuel: number } | undefined;
    return row?.fuel ?? FUEL_START;
  }

  /** Credit fuel (saturates at the cap). Returns the new balance. */
  add(amount: number): number {
    if (!(amount > 0)) return this.get();
    this.ensure();
    const next = clamp(this.get() + amount, 0, FUEL_CAP);
    this.h.sqlite
      .prepare(`UPDATE space_meta SET fuel = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?`)
      .run(next, this.spaceId);
    return next;
  }

  /** Spend fuel if affordable. Returns true if the debit happened. */
  spend(amount: number): boolean {
    this.ensure();
    const cur = this.get();
    if (cur < amount) return false;
    this.h.sqlite
      .prepare(`UPDATE space_meta SET fuel = ?, updated_at = CURRENT_TIMESTAMP WHERE space_id = ?`)
      .run(cur - amount, this.spaceId);
    return true;
  }

  /** True if there's enough fuel for one autonomous LLM job. */
  canRunJob(): boolean {
    return this.get() >= FUEL_JOB_COST;
  }

  toFuel(): Fuel {
    return { fuel: Math.round(this.get() * 10) / 10, capacity: FUEL_CAP, jobCost: FUEL_JOB_COST };
  }
}
