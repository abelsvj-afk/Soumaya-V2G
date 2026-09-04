import { API, afetch } from "./http.js";
import type { GalaxyEntityDescriptor, GalaxyEntityKind, NavigationIntent } from "@brain/shared";

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
