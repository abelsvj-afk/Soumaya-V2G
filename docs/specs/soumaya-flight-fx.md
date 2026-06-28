# Spec — Soumaya flight polish: Sun-safe path, engine trail, warp streaks

> Per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). Spatial/visual — logic
> reasoned + the Sun-clamp measured; final look confirmed on device after deploy
> ("verify before build" for code we can't see render).

## 🎯 Objectives
1. **Bug — she flies through the Sun.** Travel Bézier curves between bodies can cross the
   origin where the Sun sits. She must never enter the Sun.
2. **Long fading engine trail.** Today the "trail" is one static glow sprite. Want a long
   ribbon behind her engines that fades out along its length and with time, colored by the
   equipped trail color, longer when she's fast.
3. **More stars flying past when fast + focused on her.** A speed-gated "warp streak" field
   near the ship so high-speed cruises read as fast.

## 📐 Approach (all in `graph/soumaya.ts`; objects added to the scene by `Graph3D`)

### 1. Sun clamp (guaranteed)
`SUN_CLEAR = SUN_RADIUS_MAX + 80`. In `update()`'s `finally` (after all modes set
`group.position`), if she's inside that radius push her to the surface:
`if (group.position.lengthSq() > 1 && group.position.length() < SUN_CLEAR) group.position.setLength(SUN_CLEAR)`.
A blanket clamp is safe — orbits/station/dock are all well outside it, so it only ever acts
when a path would otherwise dive into the Sun, turning a fly-through into a graze around it.
*Verify:* a throwaway check that sampling a from→dest curve through the origin yields no
point inside `SUN_CLEAR` after clamping.

### REVISION (user feedback)
- **Removed** the ship-attached warp streaks (disliked the look).
- **Starfield** instead: per-star independent twinkle (ShaderMaterial with per-star
  phase/rate/size), more stars (4000→6500), and a camera-speed `uBlur` uniform (driven
  from Graph3D's loop) that enlarges/softens points so real stars smear past when you
  rush by close up.
- **Trail** changed from a thin additive line to a **plume**: a pool of soft additive
  puffs dropped at the exhaust, each living ~0.55s, expanding + fading where it was born
  → reads as a thicker cylinder that dissipates fast and lingers a moment when she stops.

### 2. Engine trail (superseded by the plume above)
A world-space `THREE.Line` (additive, vertex-colored, `depthWrite:false`, `frustumCulled:false`).
Ring buffer of recent exhaust points (behind the nose). Push a point when she's moved
≥ `STEP` (1.5u) since the last; when nearly stationary, shift the oldest off so it dissipates.
Cap at `TRAIL_MAX` (80). Vertex color = `trailRGB · (i/(n-1))` so it's bright at the ship and
fades to black (= invisible under additive) at the tail. `setTrailColor` also sets `trailRGB`.
Length is emergent: fast → points spread → long; slow/stopped → drains to nothing.

### 3. Warp streaks
A pool (`STREAK_N` ≈ 48) of short `LineSegments` in a volume around the ship. Each frame, when
`currentVel` is high, they stream backward along her heading and recycle ahead; opacity +
length scale with `currentVel` and drop to 0 when slow (so they only show at speed). Additive,
white-blue. Added to the scene by Graph3D; positioned relative to the ship each frame.

## Handle / Graph3D
`SoumayaHandle` gains `trail` + `streaks` objects; `Graph3D` does `scene.add(soumaya.trail)` /
`scene.add(soumaya.streaks)` alongside `taskLabel`/`cargo`. No new props.

## Verification
- `npm run typecheck && npm test && npm run build` green.
- Sun-clamp reasoned + spot-measured. Trail/streaks confirmed visually on device post-deploy.
