import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";
import { getBudgetSummary } from "../../finance/summary.js";
import { FinBillRepo } from "../../repositories/finBill.repo.js";
import { parseDay } from "../../finance/bills.js";

/**
 * Bill-risk nudge (Financial OS, docs/financial-os/architecture.md §5) — Soumaya's proactive
 * money moment. When your cushion is thin against an upcoming NON-autopay bill, she warns you
 * BEFORE an overspend makes it short, in her own voice. Deterministic + offline: the numbers
 * come from the pure Budget Engine (LLM-free); at most one nudge per space per day.
 */

const DAY_MS = 86_400_000;
const dollars = (cents: number): string => `$${Math.round(cents / 100)}`;

export const billRiskTool: Tool = {
  name: "bill_risk",
  description:
    "When today's spending pace could make an upcoming (non-autopay) bill short, warn the user before it happens. At most one nudge per day.",
  parameters: {
    type: "object",
    properties: { billId: { type: "number" }, mode: { type: "string" }, threshold: { type: "number" } },
    required: ["billId"],
  },

  detect(tc: ToolContext): ToolInvocation[] {
    const today = new Date(tc.now).toISOString().slice(0, 10);
    const didToday = tc.ctx.handle.sqlite
      .prepare(`SELECT 1 FROM agent_logs WHERE space_id = ? AND action = 'tool:bill_risk' AND substr(created_at,1,10) = ?`)
      .get(tc.spaceId, today);
    if (didToday) return [];

    const budget = getBudgetSummary(tc.ctx.handle, tc.spaceId, new Date(tc.now));
    if (budget.reserved.length === 0) return []; // nothing reserved → nothing at risk

    // Only NON-autopay bills need a heads-up (autopay is assumed to clear).
    const autopay = new Map(new FinBillRepo(tc.ctx.handle, tc.spaceId).list().map((b) => [b.id, b.autopay]));
    const atRisk = budget.reserved.filter((r) => !autopay.get(r.billId))[0]; // earliest (reserved is due-sorted)
    if (!atRisk) return [];

    // Fire only when the cushion is genuinely thin: already short, OR safe-to-spend is smaller
    // than the bill itself (so a bit of overspending would break it).
    const tight = budget.shortfallCents > 0 || budget.safeToSpendCents <= atRisk.amountCents;
    if (!tight) return [];

    const days = Math.max(1, Math.round((parseDay(atRisk.dueDate).getTime() - parseDay(today).getTime()) / DAY_MS));
    if (budget.shortfallCents > 0) {
      return [{ tool: "bill_risk", args: { billId: atRisk.billId, mode: "short", threshold: budget.shortfallCents },
        reason: `short ${dollars(budget.shortfallCents)} for "${atRisk.name}" due ${atRisk.dueDate}` }];
    }
    const perDay = Math.floor(budget.safeToSpendCents / days);
    return [{ tool: "bill_risk", args: { billId: atRisk.billId, mode: "pace", threshold: perDay },
      reason: `tight cushion before "${atRisk.name}" due ${atRisk.dueDate}` }];
  },

  async run(tc: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const billId = Number(args.billId);
    const bill = new FinBillRepo(tc.ctx.handle, tc.spaceId).get(billId);
    if (!bill) return { ok: false, summary: `bill ${billId} gone` };
    const mode = String(args.mode ?? "pace");
    const threshold = Number(args.threshold ?? 0);

    const msg = mode === "short"
      ? `💸 Heads up — you're ${dollars(threshold)} short for ${bill.name} (${dollars(bill.amountCents)}). A little more income this week, or one extra shift, covers it.`
      : `💸 ${bill.name} (${dollars(bill.amountCents)}) is coming up. If you spend more than ${dollars(threshold)} today, it'll be short — worth holding back.`;

    let delivered = false;
    try { await tc.notify(msg); delivered = true; } catch { /* router logs it regardless */ }
    return { ok: true, summary: `bill-risk nudge for "${bill.name}" (${mode})`, delivered, message: msg };
  },
};
