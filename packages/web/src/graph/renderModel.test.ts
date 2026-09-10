import { describe, it, expect, beforeEach, vi } from "vitest";
import { selectDetailedLinks, type LinkSelectionInput } from "./renderModel.js";

/**
 * Phase 2.1 render-model boundary (docs/specs/soumaya-galaxy-bounded-render-
 * architecture.md). `selectDetailedLinks` is pure — no React, no Three.js — so it's
 * tested directly against small, hand-built fixtures rather than a live Graph3D scene.
 */

function link(key: string, sourceId: number, targetId: number, weight = 0.4, activity = 0): LinkSelectionInput {
  return { key, sourceId, targetId, weight, activity };
}

describe("selectDetailedLinks", () => {
  it("returns an empty set for an empty graph", () => {
    expect(selectDetailedLinks([], { budget: 100 })).toEqual(new Set());
  });

  it("returns every link when there are fewer than the budget", () => {
    const links = [link("1-2", 1, 2), link("2-3", 2, 3)];
    const result = selectDetailedLinks(links, { budget: 10 });
    expect(result.size).toBe(2);
    expect(result.has("1-2")).toBe(true);
    expect(result.has("2-3")).toBe(true);
  });

  it("never exceeds the configured budget, even with far more links than budget", () => {
    const links = Array.from({ length: 500 }, (_, i) => link(`k${i}`, i, i + 1, (i % 7) / 7));
    const result = selectDetailedLinks(links, { budget: 50 });
    expect(result.size).toBe(50);
  });

  it("is deterministic for the same input and options", () => {
    const links = [link("a", 1, 2, 0.9), link("b", 3, 4, 0.9), link("c", 5, 6, 0.1)];
    const r1 = selectDetailedLinks(links, { budget: 2 });
    const r2 = selectDetailedLinks(links, { budget: 2 });
    expect([...r1].sort()).toEqual([...r2].sort());
  });

  it("gives priority to a link touching an active (selected/hovered) node, regardless of its own score", () => {
    const links = [
      link("weak-active", 1, 2, 0, 0), // touches active node 1, but scores zero otherwise
      link("strong", 3, 4, 1, 1),
      link("strong2", 5, 6, 1, 1),
    ];
    const result = selectDetailedLinks(links, { budget: 2, activeNodeIds: new Set([1]) });
    expect(result.has("weak-active")).toBe(true);
  });

  it("promotes a required interaction link ahead of higher-scoring links, evicting the lowest-priority one to stay within budget", () => {
    const links = [
      link("high1", 1, 2, 1, 1),
      link("high2", 3, 4, 1, 1),
      link("active-weak", 5, 6, 0, 0),
    ];
    const result = selectDetailedLinks(links, { budget: 2, activeNodeIds: new Set([5]) });
    expect(result.size).toBe(2);
    expect(result.has("active-weak")).toBe(true);
  });

  it("gives cluster-membership priority over an ordinary score-ranked link", () => {
    const links = [link("in-cluster", 1, 2, 0, 0), link("high-score", 3, 4, 1, 1)];
    const result = selectDetailedLinks(links, { budget: 1, clusterIds: new Set([1, 2]) });
    expect(result.has("in-cluster")).toBe(true);
  });

  it("uses a stable, deterministic tie-break (ascending key) when scores are equal", () => {
    const links = [link("b", 1, 2, 0.5, 0), link("a", 3, 4, 0.5, 0)];
    const result = selectDetailedLinks(links, { budget: 1 });
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(false);
  });

  it("adapts to budget changes against the same input", () => {
    const links = Array.from({ length: 10 }, (_, i) => link(`k${i}`, i, i + 1, i / 10));
    expect(selectDetailedLinks(links, { budget: 3 }).size).toBe(3);
    expect(selectDetailedLinks(links, { budget: 7 }).size).toBe(7);
  });

  it("never returns duplicate selections for a duplicate-keyed input", () => {
    const links = [link("dup", 1, 2, 0.5), link("dup", 1, 2, 0.9)];
    const result = selectDetailedLinks(links, { budget: 10 });
    expect(result.size).toBe(1);
  });

  it("clamps a zero or negative budget to an empty selection", () => {
    const links = [link("a", 1, 2, 1, 1)];
    expect(selectDetailedLinks(links, { budget: 0 }).size).toBe(0);
    expect(selectDetailedLinks(links, { budget: -5 }).size).toBe(0);
  });

  it("uses node importance as a tertiary ranking factor when provided", () => {
    const links = [link("low-imp", 1, 2, 0.3, 0), link("high-imp", 3, 4, 0.3, 0)];
    const result = selectDetailedLinks(links, {
      budget: 1,
      nodeImportance: new Map([
        [1, 0],
        [2, 0],
        [3, 1],
        [4, 1],
      ]),
    });
    expect(result.has("high-imp")).toBe(true);
  });

  it("applies a small sticky bonus to a previously-detailed link to reduce boundary flapping", () => {
    const links = [link("was-detailed", 1, 2, 0.5, 0), link("new-contender", 3, 4, 0.55, 0)];
    const result = selectDetailedLinks(links, { budget: 1, previousDetailedKeys: new Set(["was-detailed"]) });
    expect(result.has("was-detailed")).toBe(true);
  });
});

describe("isBoundedLinksEnabled / getDetailedLinkBudget (URL config)", () => {
  function setSearch(search: string) {
    window.history.replaceState(null, "", `/${search}`);
  }

  beforeEach(() => {
    vi.resetModules();
    setSearch("");
    localStorage.clear();
  });

  it("defaults to disabled, with the default budget", async () => {
    const { isBoundedLinksEnabled, getDetailedLinkBudget, DEFAULT_DETAILED_LINK_BUDGET } = await import(
      "./renderModel.js"
    );
    expect(isBoundedLinksEnabled()).toBe(false);
    expect(getDetailedLinkBudget()).toBe(DEFAULT_DETAILED_LINK_BUDGET);
  });

  it("?boundedLinks=1 enables the feature", async () => {
    setSearch("?boundedLinks=1");
    const { isBoundedLinksEnabled } = await import("./renderModel.js");
    expect(isBoundedLinksEnabled()).toBe(true);
  });

  it("?linkBudget=NNN overrides the default budget", async () => {
    setSearch("?linkBudget=123");
    const { getDetailedLinkBudget } = await import("./renderModel.js");
    expect(getDetailedLinkBudget()).toBe(123);
  });

  it("an invalid ?linkBudget falls back to the default", async () => {
    setSearch("?linkBudget=not-a-number");
    const { getDetailedLinkBudget, DEFAULT_DETAILED_LINK_BUDGET } = await import("./renderModel.js");
    expect(getDetailedLinkBudget()).toBe(DEFAULT_DETAILED_LINK_BUDGET);
  });

  it("caches the first read — changing the URL afterward doesn't retroactively change it", async () => {
    setSearch("?boundedLinks=1");
    const { isBoundedLinksEnabled } = await import("./renderModel.js");
    const first = isBoundedLinksEnabled();
    setSearch("");
    expect(isBoundedLinksEnabled()).toBe(first);
  });

  it("setBoundedLinksEnabled persists to localStorage, readable with no URL param (Settings-panel path)", async () => {
    const { setBoundedLinksEnabled } = await import("./renderModel.js");
    setBoundedLinksEnabled(true);
    vi.resetModules();
    const { isBoundedLinksEnabled } = await import("./renderModel.js");
    expect(isBoundedLinksEnabled()).toBe(true);
  });

  it("setDetailedLinkBudget persists to localStorage, readable with no URL param (Settings-panel path)", async () => {
    const { setDetailedLinkBudget } = await import("./renderModel.js");
    setDetailedLinkBudget(300);
    vi.resetModules();
    const { getDetailedLinkBudget } = await import("./renderModel.js");
    expect(getDetailedLinkBudget()).toBe(300);
  });

  it("a URL param takes precedence over a stored Settings-panel value", async () => {
    const { setBoundedLinksEnabled, setDetailedLinkBudget } = await import("./renderModel.js");
    setBoundedLinksEnabled(true);
    setDetailedLinkBudget(300);
    vi.resetModules();
    setSearch("?boundedLinks=0&linkBudget=200");
    const { isBoundedLinksEnabled, getDetailedLinkBudget } = await import("./renderModel.js");
    expect(isBoundedLinksEnabled()).toBe(false);
    expect(getDetailedLinkBudget()).toBe(200);
  });

  it("a corrupt stored budget value falls back to the default", async () => {
    localStorage.setItem("galaxy.linkBudget.v2", "not-a-number");
    const { getDetailedLinkBudget, DEFAULT_DETAILED_LINK_BUDGET } = await import("./renderModel.js");
    expect(getDetailedLinkBudget()).toBe(DEFAULT_DETAILED_LINK_BUDGET);
  });

  it("a value persisted under the OLD (pre-migration) key is ignored, not read as an override", async () => {
    // Regression test for a real-device bug: a device that had ever visited
    // ?linkBudget=450 (the original Phase 2.1 audit's own suggested value) kept reading
    // that persisted 450 forever, completely masking a later reduction to
    // DEFAULT_DETAILED_LINK_BUDGET. The storage key was versioned specifically so this
    // can never happen again for any FUTURE default change either.
    localStorage.setItem("galaxy.linkBudget", "450");
    const { getDetailedLinkBudget, DEFAULT_DETAILED_LINK_BUDGET } = await import("./renderModel.js");
    expect(getDetailedLinkBudget()).toBe(DEFAULT_DETAILED_LINK_BUDGET);
    expect(getDetailedLinkBudget()).not.toBe(450);
  });

  it("setDetailedLinkBudget clamps a negative/fractional value", async () => {
    const { setDetailedLinkBudget } = await import("./renderModel.js");
    setDetailedLinkBudget(-5.7);
    vi.resetModules();
    const { getDetailedLinkBudget } = await import("./renderModel.js");
    expect(getDetailedLinkBudget()).toBe(0);
  });
});
