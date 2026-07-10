import * as THREE from "three";
import { gltfLoader } from "./gltf.js";

/**
 * Module-scope helpers extracted from the large Graph3D.tsx (Post-MVP D4 refactor):
 * link level-of-detail thresholds + key helpers, procedural/GLB figurine building,
 * and Three.js GPU-resource disposal. No component state — pure functions.
 */

// Link level-of-detail thresholds (perf on dense brains). Below LINK_LOD_MIN links,
// everything always draws. At/above it, when the camera sits farther than LINK_LOD_ZOOM,
// only connections whose weight+activity clears LINK_LOD_CUTOFF render — the weak faint
// filaments (the bulk of a dense graph) are skipped until you zoom in.
export const LINK_LOD_MIN = 350;
export const LINK_LOD_ZOOM = 650;
export const LINK_LOD_CUTOFF = 0.6;
export const linkEnd = (v: any): number => (typeof v === "object" && v !== null ? v.id : v);
/** Stable key for a connection (undirected) so we can track which are already drawn. */
export const linkKey = (l: any): string => {
  const a = linkEnd(l.source);
  const b = linkEnd(l.target);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
};

export function updateFigurine(
  group: THREE.Group,
  type: string,
  position: THREE.Vector3,
  getEnv: () => THREE.Texture | null
) {
  // Clear previous children (and free their GPU resources so re-equipping a figurine
  // doesn't leak geometries/materials/textures).
  while (group.children.length > 0) {
    const child = group.children[0]!;
    group.remove(child);
    disposeObject3D(child);
  }

  if (type === "none") {
    group.visible = false;
    return;
  }

  group.visible = true;
  group.position.copy(position);
  group.userData.focusDist = 4000; // default camera framing distance; big figurines override

  let fallbackMesh: THREE.Object3D;
  let modelPath = "";
  let targetSize = 1000; // desired scale size in world units

  if (type === "station") {
    modelPath = "/space_station_3.glb";
    targetSize = 1300;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7af9ff,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x003355,
      emissiveIntensity: 0.5
    });
    fallbackMesh = new THREE.Mesh(new THREE.TorusGeometry(600, 100, 16, 48), mat);
  } else if (type === "blackhole") {
    // The Singularity — prestige unlock. Real glTF (converted to metallic-roughness +
    // Draco; see docs/specs/blackhole-singularity.md). A black hole is the most massive
    // object in any galaxy — it must DWARF the sun (~600) and every other figurine
    // (Dyson ~1800), so it gets a colossal targetSize, is pushed deep into the back so
    // it doesn't engulf the galaxy, and records its own (large) camera focus distance.
    modelPath = "/blackhole.glb";
    targetSize = 10000; // ~5x the sun's visual extent — unmistakably the biggest thing
    group.position.copy(position).multiplyScalar(1.6); // pushed far behind the galaxy
    group.userData.focusDist = 13000; // camera frames it from this far so it fills the sky
    const voidMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 1.0,
      metalness: 0.0
    });
    const diskMat = new THREE.MeshStandardMaterial({
      color: 0xffa040,
      emissive: 0xff7722,
      emissiveIntensity: 2.4
    });
    // Fallback void+disk sized to roughly match the loaded model so there's no pop.
    const subGroup = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(2100, 48, 48), voidMat);
    const disk = new THREE.Mesh(new THREE.TorusGeometry(4100, 420, 16, 96), diskMat);
    disk.rotation.x = Math.PI / 2.4;
    subGroup.add(core);
    subGroup.add(disk);
    fallbackMesh = subGroup;
  } else if (type === "satellite") {
    modelPath = "/aura-satellite.glb";
    targetSize = 1000;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0x443300,
      emissiveIntensity: 0.3
    });
    fallbackMesh = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 800, 16), mat);
  } else if (type === "star_center") {
    modelPath = "/star-center.glb";
    targetSize = 1500;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffbb44,
      emissive: 0xff8800,
      emissiveIntensity: 2.0,
      roughness: 0.1,
      metalness: 0.9
    });
    fallbackMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 32), mat);
  } else if (type === "dyson_sphere") {
    modelPath = "/dyson-sphere.glb";
    targetSize = 1800;
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff0000,
      emissiveIntensity: 1.8
    });
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x334466,
      roughness: 0.4,
      metalness: 0.8
    });
    const subGroup = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 32), innerMat);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(750, 50, 8, 48), outerMat);
    outer.rotation.x = Math.PI / 4;
    subGroup.add(inner);
    subGroup.add(outer);
    fallbackMesh = subGroup;
  } else if (type === "quantum_core") {
    modelPath = "/space_station_3.glb";
    targetSize = 1100;
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.9,
      metalness: 0.1
    });
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2.0
    });
    const subGroup = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 32), innerMat);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(800, 40, 8, 48), outerMat);
    outer.rotation.x = Math.PI / 2;
    subGroup.add(inner);
    subGroup.add(outer);
    fallbackMesh = subGroup;
  } else if (type === "hyper_array") {
    modelPath = "/aura-satellite.glb";
    targetSize = 1200;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x008844,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.8
    });
    const subGroup = new THREE.Group();
    const torus1 = new THREE.Mesh(new THREE.TorusGeometry(600, 40, 8, 48), mat);
    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(600, 40, 8, 48), mat);
    torus2.rotation.y = Math.PI / 2;
    subGroup.add(torus1);
    subGroup.add(torus2);
    fallbackMesh = subGroup;
  } else if (type === "shield_spire") {
    modelPath = "/space_station_3.glb";
    targetSize = 1400;
    const matBase = new THREE.MeshStandardMaterial({
      color: 0x557799,
      roughness: 0.4,
      metalness: 0.7
    });
    const matOrb = new THREE.MeshStandardMaterial({
      color: 0x7af9ff,
      emissive: 0x7af9ff,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.65
    });
    const subGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(50, 150, 900, 16), matBase);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(250, 16, 16), matOrb);
    orb.position.y = 450;
    subGroup.add(base);
    subGroup.add(orb);
    fallbackMesh = subGroup;
  } else {
    return;
  }

  // Add procedural fallback first
  group.add(fallbackMesh);

  // Load GLB
  gltfLoader().load(
    modelPath,
    (gltf) => {
      // Remove fallback
      group.remove(fallbackMesh);
      const model = gltf.scene;

      // Compute bounding box to normalize scale
      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      const k = targetSize / maxDim;
      model.scale.setScalar(k);

      // Recenter model
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-k));

      // Enable environment maps on loaded model if available
      const env = getEnv();
      if (env) {
        model.traverse((o: any) => {
          if (o.isMesh) {
            o.material.envMap = env;
            o.material.needsUpdate = true;
          }
        });
      }

      group.add(model);
    },
    undefined,
    (err) => {
      console.warn(`[figurine] failed to load '${modelPath}'; using procedural fallback`, err);
    }
  );
}

/**
 * Free the GPU resources held by a node/figurine object before we drop our last
 * reference to it. react-force-graph swaps the scene object when nodeThreeObject
 * returns a new instance, but it never disposes the old one's geometry/materials/
 * textures — so without this, every content change (degree/entropy/label) on a busy
 * brain leaks VRAM until the context is lost. Lights need no disposal.
 */
export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((o: any) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) {
        const v = (m as any)[k];
        if (v && v.isTexture) v.dispose?.();
      }
      m.dispose?.();
    }
  });
}
