import type { DbHandle } from "./db/client.js";

/**
 * LLM usage + budget meter. OpenAI's API key can't read your real $ balance, so
 * we count the tokens every call actually consumes, estimate the cost, and let
 * the app warn + throttle BEFORE a user-set budget is overrun. Persisted in the
 * `settings` table so it survives restarts.
 */

// USD per token (rough public pricing). Falls back to the mini rate.
const PRICE: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15e-6, out: 0.6e-6 },
  "gpt-4o": { in: 2.5e-6, out: 10e-6 },
  "gpt-4.1-mini": { in: 0.4e-6, out: 1.6e-6 },
};
const rateFor = (model: string) => PRICE[model] ?? PRICE["gpt-4o-mini"]!;

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  fractionUsed: number; // 0..1
  overBudget: boolean;
  low: boolean; // < 20% remaining
}

export class UsageTracker {
  private inTok = 0;
  private outTok = 0;
  private cost = 0;

  constructor(private readonly h: DbHandle) {
    this.inTok = this.num("usage_in_tokens");
    this.outTok = this.num("usage_out_tokens");
    this.cost = this.num("usage_cost_usd");
  }

  private num(key: string): number {
    const r = this.h.sqlite.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return r ? Number(r.value) || 0 : 0;
  }
  private put(key: string, value: string): void {
    this.h.sqlite
      .prepare(`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`)
      .run(key, value, value);
  }

  /** Record one LLM call's token usage and accrue estimated cost. */
  record(model: string, inputTokens: number, outputTokens: number): void {
    const r = rateFor(model);
    this.inTok += inputTokens;
    this.outTok += outputTokens;
    this.cost += inputTokens * r.in + outputTokens * r.out;
    this.put("usage_in_tokens", String(this.inTok));
    this.put("usage_out_tokens", String(this.outTok));
    this.put("usage_cost_usd", String(this.cost));
  }

  get budget(): number {
    const v = this.num("usage_budget_usd");
    return v > 0 ? v : 5; // default $5
  }
  setBudget(usd: number): void {
    this.put("usage_budget_usd", String(Math.max(0, usd)));
  }
  reset(): void {
    this.inTok = 0;
    this.outTok = 0;
    this.cost = 0;
    this.put("usage_in_tokens", "0");
    this.put("usage_out_tokens", "0");
    this.put("usage_cost_usd", "0");
  }

  overBudget(): boolean {
    return this.cost >= this.budget;
  }
  /** True when little headroom remains — used to space out (throttle) spending. */
  low(): boolean {
    return this.budget > 0 && this.cost / this.budget >= 0.8;
  }

  summary(): UsageSummary {
    const budget = this.budget;
    return {
      inputTokens: this.inTok,
      outputTokens: this.outTok,
      estCostUsd: Number(this.cost.toFixed(4)),
      budgetUsd: budget,
      remainingUsd: Number(Math.max(0, budget - this.cost).toFixed(4)),
      fractionUsed: budget > 0 ? Math.min(1, this.cost / budget) : 0,
      overBudget: this.overBudget(),
      low: this.low(),
    };
  }
}
