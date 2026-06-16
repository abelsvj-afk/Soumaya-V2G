import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * A large space station that orbits the center of the galaxy.
 */
export function makeSpaceStation(): THREE.Object3D {
  const group = new THREE.Group();

  new GLTFLoader().load(
    "/space_station_3.glb",
    (gltf) => {
      const model = gltf.scene;
      
      // Add some emissive glow to the station's materials if they don't have it
      model.traverse((o: any) => {
        if (o.isMesh && o.material) {
          if (Array.isArray(o.material)) {
            o.material.forEach((m: any) => {
              m.metalness = 0.8;
              m.roughness = 0.2;
            });
          } else {
            o.material.metalness = 0.8;
            o.material.roughness = 0.2;
          }
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      
      // Make the station significantly larger than a ship.
      const k = 50 / maxDim;
      model.scale.setScalar(k);
      
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-k)); // recenter
      
      group.add(model);
    },
    undefined,
    (err) => console.warn("[space-station] model failed to load", err),
  );

  // Orbit parameters
  const orbitRadius = 1200;
  const orbitSpeed = 0.04;
  const orbitPhase = Math.random() * Math.PI * 2;

  group.userData.update = (time: number) => {
    const angle = time * orbitSpeed + orbitPhase;
    group.position.set(
      Math.cos(angle) * orbitRadius,
      Math.sin(angle * 0.7) * 150, // slow vertical oscillation
      Math.sin(angle) * orbitRadius
    );
    // Orient it towards the direction of travel + some slow self-rotation
    group.lookAt(
      Math.cos(angle + 0.01) * orbitRadius,
      Math.sin((angle + 0.01) * 0.7) * 150,
      Math.sin(angle + 0.01) * orbitRadius
    );
    group.rotateX(time * 0.05);
  };

  return group;
}
