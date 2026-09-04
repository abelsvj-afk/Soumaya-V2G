import { describe, it, expect } from "vitest";
import type { ProvenanceRef } from "@brain/shared";
import { galaxyEntityKindFromRef } from "./graph.js";

/**
 * Maya Chat → Galaxy Navigation: the one small, pure adapter between a server-shaped
 * `ProvenanceRef` and the `GalaxyEntityKind` `Graph3D.flyToGalaxyEntity` expects. A wrong
 * mapping here would silently fly the camera to the wrong body, so it gets its own tests.
 */

const ref = (over: Partial<ProvenanceRef>): ProvenanceRef => ({
  domain: "money",
  kind: "fin_bill",
  id: 1,
  ...over,
});

describe("galaxyEntityKindFromRef", () => {
  it("maps a journey ref to 'journey'", () => {
    expect(galaxyEntityKindFromRef(ref({ domain: "journey", kind: "journey" }))).toBe("journey");
  });

  it("maps a fin_bill ref to 'bill'", () => {
    expect(galaxyEntityKindFromRef(ref({ domain: "money", kind: "fin_bill" }))).toBe("bill");
  });

  it("maps a fin_goal ref to 'goal'", () => {
    expect(galaxyEntityKindFromRef(ref({ domain: "money", kind: "fin_goal" }))).toBe("goal");
  });

  it("returns null for a memory ref — memory navigation already has its own mechanism", () => {
    expect(galaxyEntityKindFromRef(ref({ domain: "memory", kind: "node" }))).toBeNull();
  });

  it("returns null for an unrecognized money kind rather than guessing", () => {
    expect(galaxyEntityKindFromRef(ref({ domain: "money", kind: "fin_income" }))).toBeNull();
  });
});
