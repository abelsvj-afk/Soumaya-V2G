/**
 * 2026-09-15 audit fix (docs/overworld/gameplay-uiux-audit-2026-09-15.md, finding #2) — a real
 * cross-type overlap exploit: zoning had zero awareness of already-built homes/businesses, and
 * `isFootprintFreeForHome`/`isFootprintFreeForBusiness` each only checked their OWN category's
 * placed list, never the other's. Repro: zone residential, build a Cottage, re-zone the same
 * tile commercial (nothing stopped this), build a Bakery on the same tile — directly falsifying
 * `business.ts`'s own doc comment that "a business can never legally overlap a home."
 *
 * This tiny, dependency-free module is the fix's real shape, not a patch: `housing.ts` and
 * `business.ts` each already own their own placed-list reader (`placedHomes`/
 * `placedBusinesses`) and neither should import the other directly — `business.ts` already
 * depends on `housing.ts` for `CONSTRUCTION_MS`, so a home importing business.ts back would be a
 * real circular-module dependency. `zoning.ts` is meant to stay the foundational layer housing/
 * business build ON TOP OF, so it importing either back would invert that relationship too.
 * Instead, this module reads the exact same localStorage keys those two modules already use,
 * as a read-only, side-effect-free projection — `zoning.ts`, `housing.ts`, and `business.ts` all
 * depend on it one-way, and it depends on nothing.
 */

export interface Footprint {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function isFootprint(value: unknown): value is Footprint {
  const f = value as Partial<Footprint> | null;
  return !!f && typeof f.x0 === "number" && typeof f.y0 === "number" && typeof f.x1 === "number" && typeof f.y1 === "number";
}

function readFootprints(key: string): Footprint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(raw)) return [];
    // Projects to exactly {x0,y0,x1,y1} — the real stored records (PlacedHome/PlacedBusiness)
    // carry extra fields (id, typeId, door, builtAt) this module has no business reading.
    return raw.filter(isFootprint).map(({ x0, y0, x1, y1 }: Footprint) => ({ x0, y0, x1, y1 }));
  } catch {
    return [];
  }
}

/** Every real placed home's footprint — reads the exact same key `housing.ts`'s own
 *  `placedHomes` does, kept in sync by construction (both are `brain.housing.placed.${spaceId}`,
 *  covered by cross-module regression tests). */
export function placedHomeFootprints(spaceId: string): Footprint[] {
  return readFootprints(`brain.housing.placed.${spaceId}`);
}

/** Every real placed business's footprint — the `business.ts` twin of the above
 *  (`brain.business.placed.${spaceId}`). */
export function placedBusinessFootprints(spaceId: string): Footprint[] {
  return readFootprints(`brain.business.placed.${spaceId}`);
}

/** Whether a single tile falls inside any of the given footprints (inclusive). */
export function isInsideAnyFootprint(footprints: Footprint[], x: number, y: number): boolean {
  return footprints.some((f) => x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1);
}

/** Whether a candidate rectangle overlaps any of the given footprints (inclusive, same
 *  interval-overlap test `housing.ts`/`business.ts` already use for their own same-category
 *  check — kept consistent rather than reinvented). */
export function footprintOverlapsAny(candidate: Footprint, footprints: Footprint[]): boolean {
  return footprints.some((f) => candidate.x0 <= f.x1 && candidate.x1 >= f.x0 && candidate.y0 <= f.y1 && candidate.y1 >= f.y0);
}
