import { describe, it, expect, beforeEach } from "vitest";
import type { Insight } from "@brain/shared";
import { checkTownMeeting, markAnnounced, meetingAnnouncementText } from "./townMeeting.js";

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: 1,
    text: "your Sanctuary and your Fisherman's Guild projects might be connected",
    score: 0.8,
    createdAt: "2026-01-01T00:00:00.000Z",
    nodes: [
      { id: 10, label: "Sanctuary practice", type: "concept" },
      { id: 11, label: "Fisherman's Guild", type: "project" },
    ],
    ...overrides,
  };
}

describe("townMeeting", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("checkTownMeeting", () => {
    it("never calls a meeting for an empty digest", () => {
      expect(checkTownMeeting("space-1", [])).toEqual({ shouldMeet: false, insight: null });
    });

    it("calls a meeting for a brand-new insight", () => {
      const insight = makeInsight();
      const check = checkTownMeeting("space-1", [insight]);
      expect(check.shouldMeet).toBe(true);
      expect(check.insight).toEqual(insight);
    });

    it("never re-announces the same insight twice", () => {
      const insight = makeInsight();
      markAnnounced("space-1", insight.id);
      expect(checkTownMeeting("space-1", [insight]).shouldMeet).toBe(false);
    });

    it("calls a new meeting once a genuinely different insight becomes the top one", () => {
      markAnnounced("space-1", 1);
      const next = makeInsight({ id: 2 });
      const check = checkTownMeeting("space-1", [next]);
      expect(check.shouldMeet).toBe(true);
      expect(check.insight?.id).toBe(2);
    });

    it("keeps announcements isolated per space", () => {
      const insight = makeInsight();
      markAnnounced("space-1", insight.id);
      expect(checkTownMeeting("space-2", [insight]).shouldMeet).toBe(true);
    });
  });

  describe("meetingAnnouncementText", () => {
    it("names the involved memories and never invents content beyond the insight itself", () => {
      const text = meetingAnnouncementText(makeInsight());
      expect(text).toContain("Sanctuary practice");
      expect(text).toContain("Fisherman's Guild");
      expect(text).toContain("your Sanctuary and your Fisherman's Guild projects might be connected");
    });

    it("uses a different framing for a contradiction than a synthesis", () => {
      const synthesis = meetingAnnouncementText(makeInsight({ kind: "synthesis" }));
      const contradiction = meetingAnnouncementText(makeInsight({ kind: "contradiction" }));
      expect(synthesis).not.toBe(contradiction);
    });

    it("still produces real text for an insight with no linked nodes", () => {
      const text = meetingAnnouncementText(makeInsight({ nodes: [] }));
      expect(text.length).toBeGreaterThan(0);
    });
  });
});
