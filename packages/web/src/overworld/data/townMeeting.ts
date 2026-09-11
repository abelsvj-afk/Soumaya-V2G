/**
 * NPC Society v1 (docs/overworld/npc-society.md) — governance "with real teeth": a Town Meeting
 * is called the first time a NEW Synthesis Digest insight becomes available (`getDigest()` —
 * the Observatory's own real data source), and its one concrete effect is a real Bulletin Board
 * post (`ingestText(text, { kind: "action" })`), not flavor-only. Never re-announces the same
 * insight twice; never invents a meeting when the digest is empty.
 */

import type { Insight } from "@brain/shared";

function storageKey(spaceId: string): string {
  return `brain.townMeeting.${spaceId}`;
}

function loadLastAnnouncedId(spaceId: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(spaceId));
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/** Records that this insight has now been announced, so it's never posted twice. */
export function markAnnounced(spaceId: string, insightId: number): void {
  try {
    localStorage.setItem(storageKey(spaceId), String(insightId));
  } catch {
    /* storage unavailable — worst case, the same insight gets announced again next check */
  }
}

export interface TownMeetingCheck {
  shouldMeet: boolean;
  insight: Insight | null;
}

/** Pure: a meeting is due exactly when the digest's top insight exists and hasn't already been
 *  announced for this space. */
export function checkTownMeeting(spaceId: string, digest: readonly Insight[]): TownMeetingCheck {
  const top = digest[0];
  if (!top) return { shouldMeet: false, insight: null };
  if (loadLastAnnouncedId(spaceId) === top.id) return { shouldMeet: false, insight: null };
  return { shouldMeet: true, insight: top };
}

/** A plain-language wrapper around the insight for the Bulletin Board post — never invents
 *  content beyond the insight's own text/nodes, matching idea.md's "never invent data" rule. */
export function meetingAnnouncementText(insight: Insight): string {
  const names = insight.nodes.map((n) => n.label).slice(0, 2).join(" and ");
  const prefix = insight.kind === "contradiction" ? "Town meeting: something doesn't line up" : "Town meeting: word going around";
  return names ? `${prefix} — ${names}. ${insight.text}` : `${prefix}: ${insight.text}`;
}
