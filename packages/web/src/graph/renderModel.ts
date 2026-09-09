/**
 * Galaxy render-model boundary — Phase 2.1 (docs/specs/soumaya-galaxy-bounded-render-
 * architecture.md, docs/specs/soumaya-galaxy-large-small-workload-diff-audit.md).
 *
 * WHY THIS FILE EXISTS: the architecture audit confirmed the Large-View catastrophic FPS
 * collapse is dominated by an UNBOUNDED number of individually-drawn link `TubeGeometry`
 * meshes — the server caps nodes (`overview(limit)`) but places no equivalent cap on the
 * induced-subgraph edge count. This module is the smallest practical seam between "the
 * graph data we have" and "which of it gets the expensive Detailed three.js treatment,"
 * so a later phase can introduce Simplified/Aggregate representations (see `LinkTier`)
 * without another pass through Graph3D's link-prop wiring.
 *
 * SCOPE, DELIBERATELY NARROW (Phase 2.1 only): only the Detailed/Hidden distinction is
 * implemented. There is no Simplified-link fallback yet — a link that loses the Detailed
 * budget is fully excluded from the scene in this phase (see `Graph3D.tsx`'s
 * `linkVisibility` for where that exclusion happens), not merely dimmed. That limitation
 * is intentional and documented, not an oversight — building the Simplified tier is a
 * separate, later phase per the architecture doc's migration sequence.
 *
 * `selectDetailedLinks` is a PURE function — no React, no Three.js, no module-level
 * state — so it is fully unit-testable independent of the renderer. It reuses signals
 * this app ALREADY computes for other purposes (link weight/activity — see
 * `linkColor`/`linkWidthCb` in Graph3D.tsx — plus the existing `cluster`/`activeId`
 * selection state and `node.importance`); it introduces no new intelligence/relevance
 * model.
 */

/**
 * A link's current representation tier. Only `"detailed"` and `"hidden"` are populated by
 * this phase — `"simplified"`/`"aggregate"` are reserved names from the approved
 * architecture doc (§3/§5 there) so a later phase's `LinkTier` values slot in here without
 * renaming anything a caller already depends on.
 */
export type LinkTier = "detailed" | "hidden" | "simplified" | "aggregate";

/** Proposed engineering budget for the Phase 1 audit's "detailed link" ceiling (~400-600,
 *  per the architecture doc's §2 table) — a STARTING POINT, not a scientifically validated
 *  universal number. Override per-session via `?linkBudget=NNN` (see
 *  `getDetailedLinkBudget`) for real-device tuning without a redeploy. */
export const DEFAULT_DETAILED_LINK_BUDGET = 450;

/** Tunable scoring weights for the deterministic Tier-C ranking below. Exported so a
 *  later pass (or a live experiment) can retune without touching the selection logic
 *  itself. Not scientifically validated — chosen to weight an existing "how strong /
 *  active is this relationship right now" signal roughly evenly, with importance as a
 *  smaller tie-breaking factor. */
export const LINK_SCORE_WEIGHT = 1;
export const LINK_SCORE_ACTIVITY = 1;
export const LINK_SCORE_IMPORTANCE = 0.5;
/** Small score bonus for a link that was ALREADY in the Detailed set on the previous
 *  computation — the same anti-thrash "sticky" pattern already used elsewhere in this
 *  codebase (the label-cap sticky scan, the macro-view/link-LOD hysteresis bands) so a
 *  link sitting right at the budget boundary doesn't flap in/out across two adjacent,
 *  near-tied recomputes. */
export const LINK_SCORE_STICKY_BONUS = 0.15;

const EMPTY_NUMBER_SET: ReadonlySet<number> = new Set();
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

export interface LinkSelectionInput {
  /** Stable, undirected identity for this link — reuse `linkKey()` from
   *  `graph3dHelpers.ts` so this matches whatever three-forcegraph/Graph3D already uses
   *  to identify the same link. */
  key: string;
  sourceId: number;
  targetId: number;
  /** Existing per-link "how strong is this relationship" signal (already read by
   *  `linkColor`/`linkWidthCb` today, e.g. `l.weight ?? 0.4`). */
  weight: number;
  /** Existing per-link "how recently was this tended" signal (`getLinkActivity(l)`,
   *  already computed for `linkColor`/`linkWidth`/particles). */
  activity: number;
}

export interface LinkSelectionOptions {
  /** Hard ceiling — the returned set's size never exceeds this (clamped to >= 0). */
  budget: number;
  /** Node ids currently active (selected and/or hovered and/or followed) — ANY link
   *  touching one of these ids is required (Tier A) and is placed ahead of every other
   *  link, regardless of its own weight/activity/importance score. This is what
   *  guarantees "if an interaction requires a link to become detailed, it must be
   *  promoted" — promotion happens by PRIORITY ORDER, not by a separate mutate-after-
   *  the-fact eviction step, so it composes correctly with the budget instead of ever
   *  needing to exceed it. */
  activeNodeIds?: ReadonlySet<number>;
  /** The active cluster/lens isolate's member ids, or `null`/omitted when no isolate is
   *  active. A link with BOTH endpoints inside gets Tier B priority (after Tier A, ahead
   *  of ordinary score-ranked links). */
  clusterIds?: ReadonlySet<number> | null;
  /** Existing `node.importance` values, keyed by node id — used only as a small,
   *  tertiary ranking factor for the remaining (Tier C) links; a missing id defaults to
   *  0 rather than throwing. */
  nodeImportance?: ReadonlyMap<number, number>;
  /** The Detailed set from the PREVIOUS computation, if any — see
   *  `LINK_SCORE_STICKY_BONUS`. Omit for a first-ever computation. */
  previousDetailedKeys?: ReadonlySet<string>;
}

/**
 * Deterministically selects which links deserve the expensive Detailed (curved-tube)
 * representation right now, given a hard budget.
 *
 * Priority, highest first (never randomized, never dependent on input array order):
 *   1. Links touching an active (selected/hovered/followed) node — Tier A.
 *   2. Links fully inside the active cluster/lens isolate — Tier B.
 *   3. Everything else, ranked by weight + activity + node importance, highest first —
 *      Tier C. A link already Detailed on the previous call gets a small sticky bonus
 *      here to reduce boundary flapping between near-equal scores.
 * Within a tier, ties break on the link's own key (ascending, lexicographic) — a plain
 * string compare, never on insertion order or a random seed — so the same inputs always
 * produce the same output.
 *
 * The result's size is NEVER greater than `budget`. If Tier A alone exceeds the budget
 * (e.g. an unusually high-fan-out node is selected on a very small budget), only the
 * first `budget` Tier-A links (by the same stable tie-break) become Detailed — a
 * documented, deliberately-accepted edge case, not a silent bug: see
 * docs/specs/soumaya-galaxy-bounded-render-architecture.md §4/§17's "priority ordering
 * IS the eviction mechanism" note.
 */
export function selectDetailedLinks(
  links: readonly LinkSelectionInput[],
  options: LinkSelectionOptions,
): Set<string> {
  const budget = Math.max(0, Math.floor(options.budget) || 0);
  const result = new Set<string>();
  if (budget === 0 || links.length === 0) return result;

  const activeNodeIds = options.activeNodeIds ?? EMPTY_NUMBER_SET;
  const clusterIds = options.clusterIds ?? null;
  const nodeImportance = options.nodeImportance;
  const previousDetailedKeys = options.previousDetailedKeys ?? EMPTY_STRING_SET;

  // Dedupe by key first — "no duplicate detailed selections" holds by construction
  // below (a Set), but a duplicate-keyed input would otherwise silently double-count
  // toward the budget while only ever occupying one Set slot.
  const byKey = new Map<string, LinkSelectionInput>();
  for (const l of links) byKey.set(l.key, l);

  const tierA: LinkSelectionInput[] = [];
  const tierB: LinkSelectionInput[] = [];
  const tierC: { link: LinkSelectionInput; score: number }[] = [];

  for (const l of byKey.values()) {
    if (activeNodeIds.has(l.sourceId) || activeNodeIds.has(l.targetId)) {
      tierA.push(l);
      continue;
    }
    if (clusterIds != null && clusterIds.has(l.sourceId) && clusterIds.has(l.targetId)) {
      tierB.push(l);
      continue;
    }
    const importance = nodeImportance
      ? Math.max(nodeImportance.get(l.sourceId) ?? 0, nodeImportance.get(l.targetId) ?? 0)
      : 0;
    let score = l.weight * LINK_SCORE_WEIGHT + l.activity * LINK_SCORE_ACTIVITY + importance * LINK_SCORE_IMPORTANCE;
    if (previousDetailedKeys.has(l.key)) score += LINK_SCORE_STICKY_BONUS;
    tierC.push({ link: l, score });
  }

  const byKeyAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  tierA.sort((a, b) => byKeyAsc(a.key, b.key));
  tierB.sort((a, b) => byKeyAsc(a.key, b.key));
  tierC.sort((a, b) => (b.score !== a.score ? b.score - a.score : byKeyAsc(a.link.key, b.link.key)));

  for (const l of tierA) {
    if (result.size >= budget) return result;
    result.add(l.key);
  }
  for (const l of tierB) {
    if (result.size >= budget) return result;
    result.add(l.key);
  }
  for (const { link } of tierC) {
    if (result.size >= budget) return result;
    result.add(link.key);
  }
  return result;
}

// ---------------------------------------------------------------------------------------
// A/B configuration — same "read `location.search` once, cache for the page's life"
// pattern already established by `perfDiag.ts`'s `getGalaxyDiagConfig()` and
// `PerfHUD.tsx`'s `perfHudEnabled()`. Deliberately a SEPARATE cache/flag from
// `perfDiag.ts` (that module is explicitly documented as a temporary, throwaway
// diagnostic tool meant to be deleted outright later; this flag governs a real,
// lasting production code path this program intends to eventually default on).
// ---------------------------------------------------------------------------------------

let boundedLinksCache: boolean | null = null;

const BOUNDED_LINKS_KEY = "galaxy.boundedLinks";
const LINK_BUDGET_KEY = "galaxy.linkBudget";

/**
 * Enables Phase 2.1's bounded Detailed-link selection for a real-device A/B comparison.
 * Defaults to OFF (today's exact unbounded behavior) so this is fully inert unless
 * explicitly opted into. Two ways to opt in, checked in this order:
 *   1. `?boundedLinks=1` in the URL (unchanged from the original implementation) — also
 *      persists to localStorage so it "sticks" across reloads, matching `perfHudEnabled`.
 *   2. The "Bounded detailed links" toggle in Settings (`setBoundedLinksEnabled`), for
 *      anyone who can't edit the URL (e.g. an installed PWA with no visible address bar).
 * Cached per page load — same reasoning as `perfHudEnabled`/`getGalaxyDiagConfig`: every
 * consumer treats this as a one-time, mount-time check, never a per-frame branch. The
 * Settings toggle reloads the page immediately after writing, so "cached per load" never
 * leaves the UI showing a stale value.
 */
export function isBoundedLinksEnabled(): boolean {
  if (boundedLinksCache !== null) return boundedLinksCache;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("boundedLinks")) {
      boundedLinksCache = params.get("boundedLinks") === "1";
      localStorage.setItem(BOUNDED_LINKS_KEY, boundedLinksCache ? "1" : "0");
    } else {
      boundedLinksCache = localStorage.getItem(BOUNDED_LINKS_KEY) === "1";
    }
  } catch {
    boundedLinksCache = false;
  }
  return boundedLinksCache;
}

/** Settings-panel setter for `isBoundedLinksEnabled` — writes the persisted flag. Callers
 *  (SettingsPanel) reload the page right after calling this, so the in-memory cache update
 *  here is a courtesy for same-session callers, not relied on as a live toggle. */
export function setBoundedLinksEnabled(on: boolean): void {
  try {
    localStorage.setItem(BOUNDED_LINKS_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  boundedLinksCache = on;
}

let linkBudgetCache: number | null = null;

/**
 * Overrides `DEFAULT_DETAILED_LINK_BUDGET` for the current page load — the "easy to
 * change later" mechanism for real-device tuning without a redeploy. Checked in the same
 * order as `isBoundedLinksEnabled`: `?linkBudget=NNN` in the URL (persists to localStorage
 * too), else the Settings-panel value (`setDetailedLinkBudget`), else the default. An
 * absent or invalid value at any step falls back to the default.
 */
export function getDetailedLinkBudget(): number {
  if (linkBudgetCache !== null) return linkBudgetCache;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("linkBudget")) {
      const parsed = Number.parseInt(params.get("linkBudget")!, 10);
      linkBudgetCache = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DETAILED_LINK_BUDGET;
      localStorage.setItem(LINK_BUDGET_KEY, String(linkBudgetCache));
    } else {
      const stored = Number.parseInt(localStorage.getItem(LINK_BUDGET_KEY) ?? "", 10);
      linkBudgetCache = Number.isFinite(stored) && stored >= 0 ? stored : DEFAULT_DETAILED_LINK_BUDGET;
    }
  } catch {
    linkBudgetCache = DEFAULT_DETAILED_LINK_BUDGET;
  }
  return linkBudgetCache;
}

/** Settings-panel setter for `getDetailedLinkBudget` — same reload-after-write contract
 *  as `setBoundedLinksEnabled`. */
export function setDetailedLinkBudget(budget: number): void {
  try {
    localStorage.setItem(LINK_BUDGET_KEY, String(Math.max(0, Math.floor(budget))));
  } catch {
    /* private mode */
  }
  linkBudgetCache = Math.max(0, Math.floor(budget));
}
