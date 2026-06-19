import * as THREE from "three";
import { gltfLoader } from "./gltf.js";

/**
 * The Sun — the gigantic star at the center of the galaxy that every cluster
 * revolves around. It is NOT a memory: it's the fixed heart of the system at the
 * origin. Memories render at ~2–16 world units, so the sun (hundreds of units)
 * dwarfs everything — the sun-to-earth scale the user asked for.
 *
 * Role (provisional): the user's "core self". It grows a little as the brain grows
 * but is hard-clamped so it can never overgrow and look ridiculous.
 */
export const SUN_RADIUS = 460; // base render radius (world units)
export const SUN_RADIUS_MAX = 600; // clamp — orbits clear THIS so bodies never clip the sun

export function makeSun(): THREE.Object3D {
  const group = new THREE.Group();
  let currentRadius = SUN_RADIUS;

  // Procedural glowing fallback until the glTF loads (and a base for the corona).
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshBasicMaterial({ color: "#ffcf6b" }),
  );
  fallback.scale.setScalar(SUN_RADIUS);
  group.add(fallback);

  // Soft additive corona so the sun reads as a luminous body, not a flat ball.
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,240,200,0.9)");
  g.addColorStop(0.35, "rgba(255,180,90,0.45)");
  g.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  corona.scale.setScalar(SUN_RADIUS * 3.2);
  group.add(corona);

  // The sun is the system's primary light source.
  const light = new THREE.PointLight(new THREE.Color("#fff2d0"), 2.4, 0, 1.5);
  group.add(light);

  let mixer: THREE.AnimationMixer | null = null;
  let model: THREE.Object3D | null = null;
  let baseModelScale = 1;
  let last = 0;
  let spin = 0;

  gltfLoader().load(
    "/sun.glb",
    (gltf) => {
      model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      baseModelScale = (currentRadius * 2) / maxDim; // diameter = 2 * radius
      model.scale.setScalar(baseModelScale);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-baseModelScale)); // recenter
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
      }
      fallback.visible = false;
      group.add(model);
      applyRadius();
    },
    undefined,
    (err) => console.warn("[sun] model failed to load; using glowing fallback", err),
  );

  const applyRadius = () => {
    fallback.scale.setScalar(currentRadius);
    corona.scale.setScalar(currentRadius * 3.2);
    light.intensity = 2.0 + (currentRadius / SUN_RADIUS_MAX) * 1.2;
    if (model) {
      // Re-fit the model to the current radius (baseModelScale was for SUN_RADIUS).
      model.scale.setScalar(baseModelScale * (currentRadius / SUN_RADIUS));
    }
  };

  // Core-self sizing: grow gently with brain size, hard-clamped so it never bloats.
  group.userData.setBrainScale = (count: number) => {
    const t = Math.min(1, Math.log10(Math.max(1, count)) / 2.5); // saturates ~300 memories
    const target = SUN_RADIUS + (SUN_RADIUS_MAX - SUN_RADIUS) * t;
    if (Math.abs(target - currentRadius) > 1) {
      currentRadius = target;
      applyRadius();
    }
  };

  group.userData.update = (time: number) => {
    const dt = last ? Math.min(0.05, time - last) : 0;
    last = time;
    mixer?.update(dt);
    spin += dt * 0.02; // slow, ponderous rotation
    if (model) model.rotation.y = spin;
    else fallback.rotation.y = spin;
  };

  return group;
}
