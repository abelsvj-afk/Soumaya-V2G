# Graph3D Performance Checkpoint - 2026-08-12

This document records the current state of Graph3D performance work for continuity and recovery.

## 1. Completed Optimizations

### Fix A: Camera Rotation Stutter
- **Goal:** Eliminate unnecessary recursive scene graph traversal during camera updates.
- **File:** `packages/web/src/graph/Graph3D.tsx`
- **Change:** Replaced `fo.getWorldPosition(sp)` with `sp.copy(fo.position)` for top-level follow objects.

### Fix B: Maintenance Queue Throttling
- **Goal:** Prevent O(N) patrol search spikes on every frame during queue replenishment.
- **File:** `packages/web/src/graph/soumaya.ts`
- **Change:** Introduced `lastMaintenanceRefresh` and a 1000ms throttle in `fillPlannedMaintenance()`.

### Fix C: Inner Rendering Loop Optimization
- **Goal:** Skip expensive animation math (`pulse`, `corona`, `marquee`) for culled/invisible children.
- **File:** `packages/web/src/graph/Graph3D.tsx`
- **Change:** Reordered LOD/visibility logic to execute *before* animation math; added `if (!child.visible) continue;` guard.

## 2. Status & Verification
- **Uncommitted Changes:** `packages/web/src/graph/Graph3D.tsx` (Changes A & C), `packages/web/src/graph/soumaya.ts` (Change B).
- **Typecheck Result:** `npm run typecheck` in `packages/web` passed successfully for all changes.

## 3. Pending/Untested Items
- **Functional Testing:** None of these changes have been verified via functional application runs.
- **Edge Cases:** Maintenance queue replenishment timing under extremely high job turnover has not been stressed.

## 4. Recommended Next Steps
1. **Functional Validation:** Run the application to verify that Soumaya's behavior, camera follow functionality, and label/animation visibility are intact.
2. **Performance Benchmarking:** If stutter persists, profile the `tick()` function in the browser to identify the next highest CPU consumer (likely graph rendering or `soumaya.update` pathfinding).
