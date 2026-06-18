# 🌌 Skill: Galaxy & Frontend Mastery (your home turf)

*The 3D/visual layer is your Green Zone — where you're allowed to move fast. But
three.js punishes guessing. These are the concrete patterns that already work in this
repo. Copy them; don't reinvent them.*

---

## The architecture you're working inside

- Rendering = `react-force-graph-3d` (wraps three.js). The force simulation is **OFF**
  — charge/center/link forces are zeroed in `Graph3D.tsx`. Bodies move by the
  **kinematic orbit system** (`graph/orbits.ts`, RED ZONE — read only). Each body
  orbits its heaviest neighbor on a fixed path, pinned via `fx/fy/fz`, so it never
  collapses.
- One `requestAnimationFrame` tick lives in `Graph3D.tsx`. It (a) advances orbits,
  (b) calls `userData.update(time)` on every scene object, (c) does LOD/brightness,
  (d) drives the camera follow-locks, (e) calls `controls.update()` **once**.
- Global scene state set once: lights, a **PMREM `RoomEnvironment`** (so PBR models
  are lit), bloom (`addBloom`), starfield/nebula/skybox, ship, station, satellites,
  visitors, collision bursts.

## ⭐ The canonical "add a 3D object" recipe (memorize this)

Mirror `graph/spaceStation.ts` / `satellites.ts` / `soumaya.ts`:

```ts
export function makeThing(): THREE.Object3D {
  const group = new THREE.Group();

  // 1) PROCEDURAL FALLBACK first — works with no GLB, no network.
  const fallback = new THREE.Mesh(geom, mat);
  group.add(fallback);

  // 2) Load the GLB and swap it in. Never hard-depend on it.
  new GLTFLoader().load("/model.glb", (gltf) => {
    const model = gltf.scene;
    // 3) Normalize scale + recenter to the group origin.
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const k = TARGET / (Math.max(size.x, size.y, size.z) || 1);
    model.scale.setScalar(k);
    const c = new THREE.Vector3(); box.getCenter(c);
    model.position.copy(c.multiplyScalar(-k));
    // Keep the model's OWN materials — the global env map lights them.
    fallback.visible = false;
    group.add(model);
  }, undefined, (err) => console.warn("[thing] model failed", err));

  // 4) Animate via userData.update — the Graph3D tick calls this every frame.
  let last = 0;
  group.userData.update = (time: number) => {
    const dt = last ? Math.min(0.05, time - last) : 0; last = time;
    // ...move/rotate using dt, never assume 60fps...
  };
  return group;
}
```

Then in `Graph3D.tsx`: `const thing = makeThing(); scene.add(thing); thingRef.current = thing;`

## 🚫 Three.js traps that WILL bite you

- **Black models** = metallic PBR with no env map. The scene env map fixes this
  globally; don't override model materials or set `metalness:1` with no environment.
- **Huge GLBs kill mobile** (>~15MB → black/crash). The 18MB nebula skybox is
  desktop-only + a procedural default for exactly this reason. Keep assets lean.
- **Damping needs `controls.update()` every frame** — there is exactly ONE call at the
  end of the tick. Don't add a second (double-speed damping); don't remove it.
- **Don't start your own rAF loop.** Register `userData.update`. Multiple loops =
  jitter + leaks.
- **Don't fight camera tweens.** `fg.cameraPosition(pos, target, ms)` animates the
  camera; don't also write `camera.position` the same frames.
- **Dispose nothing the framework owns**, but DO clean up listeners you add (see the
  `handleClick` cleanup in `Graph3D.tsx`).
- **Frame-rate independence:** scale motion by `dt`, clamp it (`Math.min(0.05, dt)`)
  so a lag spike doesn't teleport objects.

## ✨ Visual building blocks already in the repo (reuse, don't rebuild)

- **Glow / aura / beam impact:** additive `THREE.Sprite` with a radial-gradient
  `CanvasTexture`, `depthWrite:false`, `blending:THREE.AdditiveBlending`. See
  `satellites.ts makeGlowSprite`.
- **A tapered beam:** open-ended `CylinderGeometry`, oriented with
  `quaternion.setFromUnitVectors(UP, dir)`, scaled to the gap. See `satellites.ts`.
- **LOD:** mark children `userData.isMacro` / `isFidelity` / `isLabel`; the tick
  toggles visibility by camera distance. Add to those flags, don't write new LOD logic.
- **Celestial mass:** a body's size/class comes from `shared/celestial.ts`
  `deriveMass` + `classify`. If you add a signal that should affect gravity, it belongs
  in `deriveMass` (RED — stage it), not a one-off size hack.
- **Bursts:** `effects.ts` has typed burst pools (synthesis/harmonize/prune/etc).
  Trigger one for any new user-visible event (visual-honesty rule).

## 🎛️ UI / React panels (Green Zone)

- Panels live in `components/*`, styled in `index.css`. Match the glass/neon system
  (`var(--accent)`, `var(--glass-border)`, `var(--muted)`); reuse existing classes
  (`.panel`, `.fab`, `.tag-chip`, `.budget-box`) before inventing new ones.
- **All data access goes through `api/client.ts`** (it attaches `x-space-id`). Never
  `fetch('/api/...')` directly from a component — that 401s under multi-tenancy.
- Keep components controlled + typed against `@brain/shared` types. No `any` on props.
- Mobile matters: this is used on phones. Test layout at narrow widths; respect the
  bottom-sheet inset logic that already exists.

## 🎧 Audio (Green Zone)

`graph/audio.ts` is a dependency-free generative Web-Audio engine (no files). Lazily
built on first user gesture (mobile blocks autoplay). If you extend it: keep it
infinite/seamless (no looped buffers), schedule with `ctx.currentTime`, and ramp gains
(`linearRampToValueAtTime`) — never set `.value` abruptly (clicks/pops).
