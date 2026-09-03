import type { Tool, ToolContext, ToolInvocation, ToolResult } from "./types.js";
import { FinIncomeRepo } from "../../repositories/finIncome.repo.js";
import { FinAssetRepo } from "../../repositories/finAsset.repo.js";
import { FinAssetSnapshotRepo } from "../../repositories/finAssetSnapshot.repo.js";

/**
 * Finance-freshness nudge (docs/specs/income-net-worth-trend.md, Decision #4) — since income
 * and net worth are entirely manual (no bank/brokerage connections yet), the Growth chart is
 * only as honest as how current the user keeps it. A light housekeeping nudge, NOT a real
 * money risk like bill_risk.ts — so it's weekly, not daily, and only fires once regardless of
 * how many of the two conditions are true (one combined message, not two nudges).
 *
 * Deliberately does not nag a user who's simply never used a feature: no income ever recorded,
 * or no asset ever added, is treated as "not applicable" rather than "stale."
 */
const DAY_MS = 86_400_000;
const INCOME_STALE_DAYS = 20;
const ASSET_STALE_DAYS = 30;
const NUDGE_COOLDOWN_DAYS = 7;

function daysSince(dateIso: string, now: number): number {
  return Math.floor((now - new Date(`${dateIso}T00:00:00Z`).getTime()) / DAY_MS);
}

export const financeFreshnessTool: Tool = {
  name: "finance_freshness",
  description:
    "When manually-tracked income or net worth data has gone stale, nudge the user to update it so the Growth chart stays accurate. At most once a week.",
  parameters: {
    type: "object",
    properties: { incomeDays: { type: "number" }, assetDays: { type: "number" } },
    required: [],
  },

  detect(tc: ToolContext): ToolInvocation[] {
    // agent_logs.created_at is SQLite's own CURRENT_TIMESTAMP format ("YYYY-MM-DD HH:MM:SS",
    // space-separated, no "T"/"Z") — the cutoff must match that shape for the string
    // comparison to sort correctly, not a full ISO string.
    const cutoff = new Date(tc.now - NUDGE_COOLDOWN_DAYS * DAY_MS).toISOString().slice(0, 19).replace("T", " ");
    const recent = tc.ctx.handle.sqlite
      .prepare(`SELECT 1 FROM agent_logs WHERE space_id = ? AND action = 'tool:finance_freshness' AND created_at >= ?`)
      .get(tc.spaceId, cutoff);
    if (recent) return [];

    const lastIncome = new FinIncomeRepo(tc.ctx.handle, tc.spaceId).mostRecentDate();
    const incomeDays = lastIncome ? daysSince(lastIncome, tc.now) : null;
    const incomeStale = incomeDays != null && incomeDays > INCOME_STALE_DAYS;

    const hasAssets = new FinAssetRepo(tc.ctx.handle, tc.spaceId).listAll().length > 0;
    const lastSnapshot = hasAssets ? new FinAssetSnapshotRepo(tc.ctx.handle, tc.spaceId).mostRecentAny() : null;
    // Assets exist but never got a first snapshot logged — treat the same as "stale" (there's
    // definitely nothing current), using their creation as day zero would need another query;
    // simplest honest signal is "has assets, has never logged a balance."
    const assetDays = lastSnapshot ? daysSince(lastSnapshot.asOf, tc.now) : null;
    const assetStale = hasAssets && (lastSnapshot == null || (assetDays != null && assetDays > ASSET_STALE_DAYS));

    if (!incomeStale && !assetStale) return [];
    const reasons = [
      incomeStale ? `income last logged ${incomeDays}d ago` : null,
      assetStale ? (lastSnapshot ? `assets last updated ${assetDays}d ago` : "assets added but never snapshotted") : null,
    ].filter(Boolean);
    return [{
      tool: "finance_freshness",
      args: { incomeStale, assetStale, incomeDays: incomeDays ?? 0, assetDays: assetDays ?? 0 },
      reason: reasons.join("; "),
    }];
  },

  async run(tc: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const incomeStale = !!args.incomeStale;
    const assetStale = !!args.assetStale;
    const incomeDays = Number(args.incomeDays ?? 0);

    let msg: string;
    if (incomeStale && assetStale) {
      msg = `📈 Your Growth chart is running on old numbers — income hasn't been logged in ${incomeDays} days and your net worth accounts haven't been updated either. A couple minutes to catch both up keeps the picture honest.`;
    } else if (incomeStale) {
      msg = `📈 It's been ${incomeDays} days since your last income entry — got a pay stub to add? Keeping this current is what makes your income line mean something.`;
    } else {
      msg = `📈 Your net worth accounts haven't been updated in a while — a quick balance check keeps your Growth chart honest.`;
    }

    let delivered = false;
    try { await tc.notify(msg); delivered = true; } catch { /* router logs it regardless */ }
    return { ok: true, summary: "finance freshness nudge", delivered, message: msg };
  },
};
