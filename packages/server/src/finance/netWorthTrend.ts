import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { NetWorthPoint } from "@brain/shared";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinAssetRepo } from "../repositories/finAsset.repo.js";
import { FinAssetSnapshotRepo } from "../repositories/finAssetSnapshot.repo.js";

/**
 * Net worth trend (docs/specs/income-net-worth-trend.md) — cash (fin_account) + every
 * fin_asset's most-recent-as-of snapshot, summed at each month-end. `fin_asset` naturally
 * excludes NOTHING here (spec: "archive should keep the history") — an archived asset's past
 * snapshots still count toward historical points via `listAll()`, only "add a new snapshot"
 * pickers hide it going forward (that filtering lives in the route/UI, not here).
 *
 * `fin_account` has no history (Stage 1: one balance) — its contribution is today's real
 * balance, projected backward across every PAST point (Decision #3). `cashIsProjected` marks
 * every point outside the current month so the chart can render that segment distinctly
 * rather than presenting fabricated history as fact; the current month's point uses today's
 * genuinely-current balance, so it is not "projected."
 */
function monthEnds(months: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)).toISOString().slice(0, 10));
  }
  return out;
}

export function netWorthSeries(handle: DbHandle, spaceId: string = DEFAULT_SPACE, months = 12, now: Date = new Date()): NetWorthPoint[] {
  const ends = monthEnds(Math.max(1, months), now);
  const account = new FinAccountRepo(handle, spaceId).getOrCreate();
  const assets = new FinAssetRepo(handle, spaceId).listAll();
  const snapshotRepo = new FinAssetSnapshotRepo(handle, spaceId);
  const currentMonthKey = now.toISOString().slice(0, 7);

  return ends.map((asOf) => {
    let assetsTotal = 0;
    for (const asset of assets) {
      const snap = snapshotRepo.latestAsOf(asset.id, asOf);
      if (snap) assetsTotal += snap.amountCents;
    }
    return {
      asOf,
      totalCents: account.balanceCents + assetsTotal,
      cashIsProjected: asOf.slice(0, 7) !== currentMonthKey,
    };
  });
}
