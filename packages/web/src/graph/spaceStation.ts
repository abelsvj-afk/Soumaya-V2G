import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

  new GLTFLoader().load(
    "/space_station_3.glb",
    (gltf) => {
      const model = gltf.scene;

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

      fallback.visible = false;
      group.add(model);
    },
    undefined,
    (err) => console.warn("[space-station] model failed to load", err),
  );

  // Orbit FAR out beyond the memory cluster so planets can never pass through it
  // (the cluster lives well inside ~1000 units; the station holds a wide lane and
  // rides above the galactic plane for extra clearance), and slowly.
  const orbitRadius = 1700;
  const orbitSpeed = 0.012;
  const orbitPhase = Math.random() * Math.PI * 2;
  const planeLift = 420; // keep the station above the plane the bodies orbit in

  group.userData.update = (time: number) => {
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
  };

  return group;
}
