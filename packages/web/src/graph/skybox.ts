import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Load the uploaded nebula skybox glb and wrap it around the whole scene as a
 * giant inward-facing sphere. The gradient `scene.background` stays as the base
 * (and the fallback if the 16K texture fails on a device). Our starfield, comets
 * and constellations live INSIDE this sphere so they stay visible against it.
 */
export function loadNebulaSkybox(scene: THREE.Scene, radius = 12000): void {
  // The 16K texture (18MB) exceeds most mobile GPU limits (renders black) and can
  // OOM the decoder — so only attempt it on larger screens. Phones keep the rich
  // procedural nebula background, which always works.
  if (typeof window !== "undefined" && window.innerWidth < 1100) return;
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
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // Deep base gradient.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0a0620");
  g.addColorStop(0.5, "#070313");
  g.addColorStop(1, "#0c0524");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Colorful nebula clouds (soft additive blobs) — reliable on every device,
  // so the sky is always a nebula, never black, even without the heavy glb.
  const tints = ["#5a2db0", "#1f5fff", "#b0327f", "#1f9e8f", "#7a3cff", "#23407a"];
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 80 + Math.random() * 360;
    const t = tints[Math.floor(Math.random() * tints.length)]!;
    const col = new THREE.Color(t);
    const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${rgb},${0.05 + Math.random() * 0.06})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // Star dust.
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 1400; i++) {
    const a = 0.3 + Math.random() * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const s = Math.random() < 0.92 ? 1 : 2;
    ctx.fillRect(Math.random() * W, Math.random() * H, s, s);
  }

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
