/**
 * Townwide civic-concern signal (docs/overworld/civic-concern.md, task #64) — the D3-compliant
 * reframe of "crime/policing": decisions.md D3 is a hard, permanent "no battle mechanic, ever"
 * rule, so this is never a literal crime system. Reuses the exact real, non-violent governance
 * mechanism this town already has (townMeeting.ts's announceTownMeeting()) with a second,
 * independent trigger — a real majority of buildings neglected at once, not one bad building.
 * Edge-triggered like townMeeting.ts's own "never re-announce the same insight twice", adapted
 * to a level-crossing signal: announces once on the transition into "widespread", re-arms only
 * once neglect has actually dropped back below the threshold.
 */

function storageKey(spaceId: string): string {
  return `brain.civicConcern.${spaceId}`;
}

function isCurrentlyActive(spaceId: string): boolean {
  try {
    return localStorage.getItem(storageKey(spaceId)) === "1";
  } catch {
    return false;
  }
}

/** Records that a concern was just announced, so it won't re-announce again until neglect
 *  actually drops back below the threshold (`clearConcern` below). */
export function markConcernAnnounced(spaceId: string): void {
  try {
    localStorage.setItem(storageKey(spaceId), "1");
  } catch {
    /* storage unavailable — worst case, this re-announces on the next check too */
  }
}

/** Clears the active flag once neglect has genuinely improved, re-arming the signal for a
 *  future widespread period. Called every check, not just when a concern fires. */
export function clearConcern(spaceId: string): void {
  try {
    localStorage.removeItem(storageKey(spaceId));
  } catch {
    /* nothing to do */
  }
}

export interface CivicConcernCheck {
  shouldMeet: boolean;
  neglectedLabels: string[];
}

/** A concern is due exactly when a real majority of buildings are neglected AND this hasn't
 *  already been announced for the current widespread period (cleared once it improves).
 *  `neglectedCount`/`totalCount`/`neglectedLabels` are read by the caller from the same real
 *  `buildingNeglect.ts` data every other overlay already uses — never recomputed here.
 *  2026-09-15 audit fix: NOT actually pure despite this comment's earlier claim — it calls
 *  `clearConcern()` (a real localStorage write) as a side effect whenever things have genuinely
 *  improved. That write is intentional and idempotent, so behavior is unaffected; the label was
 *  just misleading to anyone tempted to memoize or double-invoke this expecting no side effect. */
export function checkCivicConcern(
  spaceId: string,
  neglectedCount: number,
  totalCount: number,
  neglectedLabels: readonly string[],
): CivicConcernCheck {
  const widespread = totalCount > 0 && neglectedCount > totalCount / 2;
  if (!widespread) {
    clearConcern(spaceId);
    return { shouldMeet: false, neglectedLabels: [] };
  }
  if (isCurrentlyActive(spaceId)) return { shouldMeet: false, neglectedLabels: [] };
  return { shouldMeet: true, neglectedLabels: [...neglectedLabels] };
}

/** A plain-language Bulletin Board post naming real buildings — never an invented crime/decline
 *  narrative, matching idea.md's "never invent data" rule and the same honest "could use a
 *  visit" language MayorsHallOverlay/ParkOverlay already use. */
export function concernAnnouncementText(neglectedLabels: readonly string[], totalCount: number): string {
  const names = neglectedLabels.slice(0, 3).join(", ");
  return `Town meeting: ${neglectedLabels.length} of ${totalCount} buildings haven't had real work in a while — ${names}${
    neglectedLabels.length > 3 ? ", and others" : ""
  }.`;
}
