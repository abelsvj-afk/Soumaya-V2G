import { API, afetch } from "./http.js";
import type { GalaxyEntityDescriptor, GalaxyEntityKind, NavigationIntent, ProvenanceRef } from "@brain/shared";

/**
 * Galaxy Entity Intelligence client (docs/specs/maya-intelligence-architecture.md, Part I3).
 * Thin wrapper over `GET /api/graph/entity/:kind/:id` — resolves a clicked Galaxy body (a
 * Journey hub, a Money-sky star, a memory) into a human-meaning descriptor + the bounded
 * reason navigating there is meaningful. Offline-safe (returns null on any failure).
 */
export async function galaxyEntity(
  kind: GalaxyEntityKind,
  id: number,
): Promise<{ descriptor: GalaxyEntityDescriptor; navigation: NavigationIntent } | null> {
  try {
    const res = await afetch(`${API}/graph/entity/${kind}/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as { descriptor: GalaxyEntityDescriptor; navigation: NavigationIntent };
  } catch {
    return null;
  }
}

/**
 * Maya Chat → Galaxy Navigation: a `NavigationIntent.target` is a `ProvenanceRef` (server-
 * shaped identity), but `Graph3D.flyToGalaxyEntity` — the ONLY existing, proven camera-fly
 * path for these bodies (I3) — takes the narrower click-facing `GalaxyEntityKind`. This is
 * the one small, pure adapter between the two; a wrong mapping here would silently fly the
 * camera to the wrong body, so it's kept as its own tested function rather than inlined.
 * Memory (`domain:"memory"`) never maps to a Galaxy-fly kind — memory navigation already has
 * its own complete mechanism (citation chips + `focusNode`), so this returns `null` for it.
 */
export function galaxyEntityKindFromRef(ref: ProvenanceRef): "journey" | "bill" | "goal" | null {
  if (ref.domain === "journey") return "journey";
  if (ref.kind === "fin_bill") return "bill";
  if (ref.kind === "fin_goal") return "goal";
  return null;
}
