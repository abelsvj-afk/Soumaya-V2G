# Phase 1 — Density Core (InstancedMesh rendering)

> **Status: RECONSTRUCTED SPEC (red zone — Claude's jurisdiction).**
> Gemini's `GEMINI_CHANGES.md` referenced `plans/phase-1-density-core.md` but the
> file was never committed, so the original spec is lost. This is Claude's
> reconstruction from the title + the codebase. **Recommendation: DEFER until
> profiling shows it's needed** (see "Decision").

## Goal
Keep the galaxy at 60fps as the brain grows to hundreds/thousands of memories.

## Current rendering (the cost)
Each node is a `THREE.Group` built in `graph/nodeObject.ts` containing, per body:
- a custom **ShaderMaterial** sphere (blackbody star / terrain+atmosphere planet),
- a corona/atmosphere **Sprite**, and
- a canvas **label Sprite**.

The per-frame `tick` in `Graph3D.tsx` also `scene.traverse(...)`-es every object
to drive pulse/corona/label LOD. At N≈hundreds this is fine; at N≈thousands the
draw-call count and traverse cost will drop frames.

## Proposed approach (LOD + instancing)
1. **Two-tier rendering by importance/zoom:**
   - *Hero bodies* (stars, giants, supergiants, the focused system, anything the
     camera is near) keep the rich per-body ShaderMaterial meshes — that's the
     visual signature and must not regress.
   - *Bulk bodies* (asteroids/moons, distant/small, dimmed) render as a single
     `THREE.InstancedMesh` (one draw call) or a `THREE.Points` field with a
     sprite texture, colored per-instance.
2. **Promote/demote on the fly:** as the camera approaches, a bulk body is
   "promoted" to a hero mesh; as it recedes, demoted back into the instanced
   buffer. Hysteresis so it doesn't thrash at the boundary.
3. **Move per-frame work off `scene.traverse`:** keep an explicit array of
   animated bodies; update instance matrices/colors in one pass.
4. Labels already LOD-fade; cap visible labels to the nearest K.

## Constraints / risks (why this is red zone)
- Must **not** break: the kinematic orbit pinning (`orbits.ts` writes fx/fy/fz),
  the per-body shaders/coronae, bloom, hover/selected dimming, tap-to-select
  raycasting, or the Soumaya/station/visitor objects.
- InstancedMesh raycasting for click-to-select needs `instanceId` handling.
- This is a sizable rewrite of `nodeObject.ts` + the `Graph3D` tick.

## Decision
At the current scale (a personal brain — tens to low-hundreds of memories) the
existing renderer holds 60fps, and the rich per-body meshes are core to the look.
An InstancedMesh rewrite now is **high-risk for no current payoff**. Recommended:
ship a tiny **profiler/guard** (cap particle/label counts under load — partly
already done) and only execute this rewrite once real devices drop below ~50fps
with the actual node counts. Spec kept here, ready to pick up when that day comes.
