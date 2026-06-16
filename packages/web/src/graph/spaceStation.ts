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
      const k = 50 / maxDim;
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

  // Orbit close enough to the central cluster to be seen, and slowly.
  const orbitRadius = 320;
  const orbitSpeed = 0.012;
  const orbitPhase = Math.random() * Math.PI * 2;

  group.userData.update = (time: number) => {
    const dt = lastTime ? Math.min(0.05, time - lastTime) : 0;
    lastTime = time;
    mixer?.update(dt); // drive the model's built-in animations

    const angle = time * orbitSpeed + orbitPhase;
    group.position.set(
      Math.cos(angle) * orbitRadius,
      Math.sin(angle * 0.7) * 60, // gentle vertical drift
      Math.sin(angle) * orbitRadius,
    );
    group.lookAt(
      Math.cos(angle + 0.01) * orbitRadius,
      Math.sin((angle + 0.01) * 0.7) * 60,
      Math.sin(angle + 0.01) * orbitRadius,
    );
    selfSpin += dt * 0.08; // slow, smooth barrel roll (was an erratic fast spin)
    group.rotateZ(selfSpin);
  };

  return group;
}
