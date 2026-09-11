import * as THREE from "three";
import { gltfLoader } from "./gltf.js";

/**
 * Distance-gated fidelity for the station's loaded glTF (perf experiment, targeting the
 * heaviest single decorative asset in the app: space_station_3.glb, ~14.6MB / hundreds of
 * thousands of triangles, previously rendered at full detail regardless of camera distance).
 * Beyond `STATION_LOD_FAR`, the heavy model is hidden and the cheap procedural fallback
 * (already built for the pre-load state — a glowing torus + aura sprite + point light) is
 * shown instead, so the station's presence/position/glow stays intact while the expensive
 * mesh disappears. `STATION_LOD_HYST` is an asymmetric band around the threshold — the
 * same hysteresis pattern already used for Graph3D.tsx's MACRO_DIST/MACRO_HYST node-body
 * LOD swap — so hovering right at the boundary doesn't flicker between the two every frame.
 */
export const STATION_LOD_FAR = 6000;
export const STATION_LOD_HYST = 600;

/** Pure hysteresis gate: true means "hide the heavy model, show the fallback". Exported
 *  so the threshold/band math is unit-testable without touching GLTFLoader or the DOM. */
export function shouldHideStationModel(dist: number, wasHidden: boolean): boolean {
  return wasHidden ? dist > STATION_LOD_FAR - STATION_LOD_HYST : dist > STATION_LOD_FAR + STATION_LOD_HYST;
}

/**
 * A large space station that orbits the center of the galaxy.
 */
export function makeSpaceStation(): THREE.Object3D {
  const group = new THREE.Group();

  // Procedural fallback (a rotating octagonal ring / frame)
  const fallback = new THREE.Mesh(
    new THREE.TorusGeometry(25, 2, 8, 32),
    new THREE.MeshStandardMaterial({
      color: "#222244",
      emissive: "#1a1a3a",
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.1,
    })
  );
  fallback.rotation.x = Math.PI / 2;
  group.add(fallback);

  // Subtle glow accent (keeps the model's original textures untouched): a soft
  // additive aura + a gentle light so the station reads against deep space.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const gctx = glowCanvas.getContext("2d")!;
  const gg = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gg.addColorStop(0, "rgba(150,190,255,0.5)");
  gg.addColorStop(0.4, "rgba(110,150,255,0.18)");
  gg.addColorStop(1, "rgba(90,120,255,0)");
  gctx.fillStyle = gg;
  gctx.fillRect(0, 0, 128, 128);
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    }),
  );
  aura.scale.set(700, 700, 1);
  group.add(aura);
  group.add(new THREE.PointLight(new THREE.Color("#9fc0ff"), 1.0, 1400, 2));

  let mixer: THREE.AnimationMixer | null = null;
  let lastTime = 0;
  let selfSpin = 0;
  let model: THREE.Object3D | null = null;
  let modelHidden = false; // hysteresis state for shouldHideStationModel

  gltfLoader().load(
    "/space_station_3.glb",
    (gltf) => {
      model = gltf.scene;

      // Keep the model's ORIGINAL materials/colors/textures (do NOT override them).
      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      const k = 460 / maxDim; // colossal — a looming celestial megastructure
      model.scale.setScalar(k);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-k)); // recenter

      // Play any animation clips baked into the model (rotating rings, lights…).
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
      }

      // Default to visible (close/no-distance-info state); update() re-gates this every
      // frame once a camera position is supplied.
      fallback.visible = false;
      group.add(model);
    },
    undefined,
    (err) => console.warn("[space-station] model failed to load", err),
  );

  // Orbit just beyond the memory cluster so planets can never pass through it.
  // The radius is set live from the current galaxy size (setOrbit, below) so the
  // station always rides outside the bodies — and inside the surrounding stars.
  let orbitRadius = 1700;
  const orbitSpeed = 0.012;
  const orbitPhase = Math.random() * Math.PI * 2;
  let planeLift = 420; // keep the station above the plane the bodies orbit in

  // Graph3D feeds the live galaxy radius so the station sits just outside it.
  group.userData.setOrbit = (r: number) => {
    orbitRadius = r;
    planeLift = Math.max(180, r * 0.22);
  };

  // `cameraPos` is optional and purely an LOD hint (same contract as orbits.ts's
  // `update(dt, nodes, cameraPos?)`) — omitting it (any caller that doesn't pass a
  // camera position) reproduces the exact pre-LOD behavior: once loaded, the model
  // stays visible unconditionally, same as before this experiment.
  group.userData.update = (time: number, cameraPos?: THREE.Vector3) => {
    const dt = lastTime ? Math.min(0.05, time - lastTime) : 0;
    lastTime = time;
    mixer?.update(dt); // drive the model's built-in animations

    const angle = time * orbitSpeed + orbitPhase;
    group.position.set(
      Math.cos(angle) * orbitRadius,
      planeLift + Math.sin(angle * 0.7) * 90, // ride high, gentle vertical drift
      Math.sin(angle) * orbitRadius,
    );
    group.lookAt(
      Math.cos(angle + 0.01) * orbitRadius,
      planeLift + Math.sin((angle + 0.01) * 0.7) * 90,
      Math.sin(angle + 0.01) * orbitRadius,
    );
    selfSpin += dt * 0.08; // slow, smooth barrel roll (was an erratic fast spin)
    group.rotateZ(selfSpin);

    if (model && cameraPos) {
      const dist = group.position.distanceTo(cameraPos);
      modelHidden = shouldHideStationModel(dist, modelHidden);
      model.visible = !modelHidden;
      fallback.visible = modelHidden;
    }
  };

  return group;
}
