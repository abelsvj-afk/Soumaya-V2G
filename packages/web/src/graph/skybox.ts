import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Load the uploaded nebula skybox glb and wrap it around the whole scene as a
 * giant inward-facing sphere. The gradient `scene.background` stays as the base
 * (and the fallback if the 16K texture fails on a device). Our starfield, comets
 * and constellations live INSIDE this sphere so they stay visible against it.
 */
export function loadNebulaSkybox(scene: THREE.Scene, radius = 12000): void {
  new GLTFLoader().load(
    "/nebula-skybox.glb",
    (gltf) => {
      const sky = gltf.scene;
      const sphere = new THREE.Box3().setFromObject(sky).getBoundingSphere(new THREE.Sphere());
      const k = sphere.radius > 0 ? radius / sphere.radius : 1;
      sky.scale.setScalar(k);
      sky.position.copy(sphere.center.multiplyScalar(-k)); // center on origin
      sky.traverse((o: any) => {
        if (o.isMesh && o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            m.side = THREE.BackSide; // visible from the inside
            m.depthWrite = false;
            m.toneMapped = false;
            if ("fog" in m) m.fog = false;
          }
          o.renderOrder = -10; // draw behind everything
          o.frustumCulled = false;
        }
      });
      scene.add(sky);
    },
    undefined,
    (err) => console.warn("[skybox] nebula glb failed to load; using gradient", err),
  );
}


/**
 * Procedural deep-space backdrop generated at runtime (no shipped image): a dark
 * vertical scattering gradient (indigo → near-black → faint violet) with a dusting
 * of faint baked stars. Returned as a texture for `scene.background`, so it always
 * draws behind everything with no depth/occlusion concerns.
 */
export function makeSpaceBackground(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0a0418"); // top — deep indigo
  g.addColorStop(0.45, "#06030f");
  g.addColorStop(0.75, "#070416");
  g.addColorStop(1, "#0e0622"); // bottom — faint violet (twilight scatter)
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A few recognizable constellations as normalized 2D coords + connecting edges.
interface Constellation {
  points: [number, number][];
  edges: [number, number][];
}
const CONSTELLATIONS: Constellation[] = [
  {
    // Ursa Major (Big Dipper)
    points: [
      [0, 0],
      [1.1, 0.15],
      [2.2, 0.1],
      [3.2, 0.5],
      [4.2, 0.35],
      [4.3, 1.4],
      [3.1, 1.5],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 3],
    ],
  },
  {
    // Orion (belt + shoulders/feet)
    points: [
      [0, 2.4],
      [1.6, 2.6],
      [0.8, 1.3],
      [1.0, 1.2],
      [1.2, 1.1],
      [0.4, 0],
      [1.9, 0.1],
    ],
    edges: [
      [0, 2],
      [1, 4],
      [2, 3],
      [3, 4],
      [2, 5],
      [4, 6],
    ],
  },
  {
    // Cassiopeia (W)
    points: [
      [0, 0],
      [1, 0.9],
      [2, 0.1],
      [3, 1.0],
      [4, 0.2],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    // Cygnus (cross)
    points: [
      [2, 0],
      [2, 1.2],
      [2, 2.6],
      [0.6, 1.4],
      [3.4, 1.0],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [3, 1],
      [1, 4],
    ],
  },
];

/**
 * Plot the constellations far out on the celestial sphere as dim star points with
 * faint connecting lines (THREE.LineSegments). Each is given a random orientation
 * so they scatter naturally around the galaxy.
 */
export function makeConstellations(radius = 5000, scale = 150): THREE.Group {
  const group = new THREE.Group();

  for (const con of CONSTELLATIONS) {
    // Random basis on a sphere: a center direction + two perpendicular axes.
    const dir = new THREE.Vector3()
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize();
    const u = new THREE.Vector3()
      .crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
      .normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    const center = dir.multiplyScalar(radius);

    // Centroid so the figure sits centered on its anchor.
    let cx = 0;
    let cy = 0;
    for (const [x, y] of con.points) {
      cx += x;
      cy += y;
    }
    cx /= con.points.length;
    cy /= con.points.length;

    const worldPts = con.points.map(([x, y]) =>
      center
        .clone()
        .addScaledVector(u, (x - cx) * scale)
        .addScaledVector(v, (y - cy) * scale),
    );

    // Star points.
    const starGeom = new THREE.BufferGeometry().setFromPoints(worldPts);
    group.add(
      new THREE.Points(
        starGeom,
        new THREE.PointsMaterial({
          color: "#dfe9ff",
          size: 9,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      ),
    );

    // Connecting lines.
    const linePts: THREE.Vector3[] = [];
    for (const [a, b] of con.edges) {
      linePts.push(worldPts[a]!, worldPts[b]!);
    }
    const lineGeom = new THREE.BufferGeometry().setFromPoints(linePts);
    group.add(
      new THREE.LineSegments(
        lineGeom,
        new THREE.LineBasicMaterial({
          color: "#7aa0ff",
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      ),
    );
  }

  return group;
}
