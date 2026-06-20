# 3D / Media Assets — Needed & Present

Drop new `.glb` (or texture) files into **`packages/web/public/`** with the exact
filename listed below; the code already looks for these paths (`/<name>`), and
Vite copies `public/` into the build. Keep models low-poly and ideally ≤ a few MB
(mobile GPUs are limited — see the nebula note).

## ✅ Present (wired up)
- `packages/web/public/soumaya-ship.glb` — Soumaya's maintenance ship.
- `packages/web/public/space_station_3.glb` — the orbiting space station.
- `packages/web/public/aura-satellite.glb` — Aura-class Beacon (the warmth-relay
  satellites that beam memories going cold). Loaded by `graph/satellites.ts` with a
  procedural probe fallback.
- `packages/web/public/nebula-skybox.glb` — nebula skybox (16K texture, **desktop-only**;
  mobile uses the procedural nebula because 16K exceeds phone GPU limits).

## ⏳ Needed (features waiting on these)
- **`defense-ship.glb`** — for #11. Soumaya dispatches it to guard memory zones
  under "attack" (negative-memory / timed-out action-item events). Until uploaded,
  no defender renders.
- **`visitor-traveler.glb`** and **`visitor-wanderer.glb`** (or a single
  `visitor.glb`) — to replace the procedural visitor saucers (#12) with real
  alien/human craft. Warm memories draw the traveler; heavy/negative draw the wanderer.
- **`astronaut.glb`** — optional crew member that disembarks during station docking
  / lands on a planet during a maintenance visit (earlier idea). Keep it small.

## How to upload (from the deploy branch)
1. Put the file in `packages/web/public/<name>.glb`.
2. Commit on the deploy branch `claude/soumaya-second-brain-v1-m4z4hc` and push.
3. Tell Claude the filename — it'll wire the loader (with a procedural fallback).

> Note: GitHub web upload caps at ~25MB; larger needs Git LFS or the desktop app.
