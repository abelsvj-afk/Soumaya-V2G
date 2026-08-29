import { describe, it, expect } from "vitest";
import { visibleTabIds, type DockTab } from "./RightDock.js";

const ALL: { id: DockTab }[] = [
  { id: "details" },
  { id: "list" },
  { id: "mind" },
  { id: "actions" },
  { id: "insights" },
  { id: "soumaya" },
  { id: "inbox" },
  { id: "awards" },
  { id: "journeys" },
  { id: "money" },
  { id: "hangar" },
];

describe("visibleTabIds (Progressive Discovery gating)", () => {
  it("hides insights/awards/hangar for a brand-new, empty brain", () => {
    const shown = visibleTabIds(ALL, "details", { hasInsights: false, hasRealMemory: false });
    expect(shown).not.toContain("insights");
    expect(shown).not.toContain("awards");
    expect(shown).not.toContain("hangar");
  });

  it("never hides journeys, even with no data at all — no other UI can create the first one", () => {
    const shown = visibleTabIds(ALL, "details", { hasInsights: false, hasRealMemory: false });
    expect(shown).toContain("journeys");
  });

  it("keeps the always-core tabs regardless of readiness signals", () => {
    const shown = visibleTabIds(ALL, "details", { hasInsights: false, hasRealMemory: false });
    for (const id of ["details", "list", "mind", "actions", "soumaya", "inbox", "money"] as const) {
      expect(shown).toContain(id);
    }
  });

  it("reveals awards and hangar once there's a real (non-action) memory", () => {
    const shown = visibleTabIds(ALL, "details", { hasInsights: false, hasRealMemory: true });
    expect(shown).toContain("awards");
    expect(shown).toContain("hangar");
    expect(shown).not.toContain("insights");
  });

  it("reveals insights once at least one has been synthesized", () => {
    const shown = visibleTabIds(ALL, "details", { hasInsights: true, hasRealMemory: false });
    expect(shown).toContain("insights");
  });

  it("never hides the currently active tab, even if its gate isn't earned yet", () => {
    const shown = visibleTabIds(ALL, "insights", { hasInsights: false, hasRealMemory: false });
    expect(shown).toContain("insights");
  });

  it("shows every tab once all signals are true", () => {
    const shown = visibleTabIds(ALL, "details", { hasInsights: true, hasRealMemory: true });
    expect(shown).toHaveLength(ALL.length);
  });
});
