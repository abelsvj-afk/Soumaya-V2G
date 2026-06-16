import * as THREE from "three";

/** A static stellar backdrop: thousands of colored points scattered far out. */
export function makeStarfield(count = 3000, spread = 6000): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [
    new THREE.Color("#ffffff"),
    new THREE.Color("#9dd9ff"),
    new THREE.Color("#ffd9f0"),
    new THREE.Color("#cabfff"),
  ];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    const c = palette[Math.floor(Math.random() * palette.length)]!;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

/** A drifting, slowly-rotating nebula cloud sprite (additive, far out). */
function makeNebula(spread: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const tints = ["#7a3cff", "#1f8fff", "#ff3c9d", "#22d3a0", "#b388ff"];
  for (let i = 0; i < 16; i++) {
    const x = 128 + (Math.random() - 0.5) * 120;
    const y = 128 + (Math.random() - 0.5) * 120;
    const r = 24 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const t = tints[Math.floor(Math.random() * tints.length)]!;
    const col = new THREE.Color(t);
    const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    g.addColorStop(0, `rgba(${rgb},0.20)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  // Soft circular vignette so the sprite never reads as a square "box".
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.6, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = "source-over";
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.16,
  });
  const s = new THREE.Sprite(mat);
  const size = 1100 + Math.random() * 1400;
  s.scale.set(size, size, 1);
  s.position.set(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
  );
  s.userData.update = () => {
    mat.rotation += 0.0004; // slow morph
  };
  return s;
}

/** A handful of distant nebulae / "galaxies" floating behind the memory galaxy. */
export function makeNebulae(count = 4, spread = 6200): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) group.add(makeNebula(spread));
  return group;
}

/** One shooting star: a fading streak (Line) that crosses, then respawns. */
function makeComet(spread: number): THREE.Line {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(6);
  const posAttr = new THREE.BufferAttribute(pos, 3);
  geom.setAttribute("position", posAttr);
  geom.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0.5, 0.7, 1]), 3),
  );
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geom, mat);

  const head = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let len = 120;
  let life = 0;
  let max = 0;

  const respawn = () => {
    head.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread * 0.7,
      (Math.random() - 0.5) * spread,
    );
    vel
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(16 + Math.random() * 26);
    len = 90 + Math.random() * 170;
    max = 60 + Math.random() * 120;
    life = -Math.floor(Math.random() * 700); // staggered delay before appearing
    mat.opacity = 0;
  };
  respawn();

  line.userData.update = () => {
    life++;
    if (life < 0) return;
    head.addScaledVector(vel, 1);
    const dir = vel.clone().normalize();
    pos[0] = head.x;
    pos[1] = head.y;
    pos[2] = head.z;
    pos[3] = head.x - dir.x * len;
    pos[4] = head.y - dir.y * len;
    pos[5] = head.z - dir.z * len;
    posAttr.needsUpdate = true;
    mat.opacity = Math.sin(Math.min(1, life / max) * Math.PI) * 0.9;
    if (life >= max) respawn();
  };
  return line;
}

/** A few shooting stars streaking through the far field. */
export function makeComets(count = 6, spread = 4200): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) group.add(makeComet(spread));
  return group;
}

/** One distant spiral galaxy: points along logarithmic arms (r = a·e^(bθ)). */
function makeSpiralGalaxy(): THREE.Points {
  const count = 1400;
  const arms = 2 + Math.floor(Math.random() * 4);
  const radius = 380 + Math.random() * 520;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const core = new THREE.Color("#ffe9c0");
  const edge = new THREE.Color(["#7ab8ff", "#b388ff", "#7af9ff", "#ff9ec7"][Math.floor(Math.random() * 4)]!);

  for (let i = 0; i < count; i++) {
    const t = Math.pow(Math.random(), 0.6); // denser core
    const r = t * radius;
    const arm = Math.floor(Math.random() * arms);
    const theta = t * 4.0 + (arm / arms) * Math.PI * 2;
    const spread = (1 - t) * 40 + 6;
    const x = Math.cos(theta) * r + (Math.random() - 0.5) * spread;
    const y = (Math.random() - 0.5) * (8 + (1 - t) * 26); // thin disk
    const z = Math.sin(theta) * r + (Math.random() - 0.5) * spread;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const col = core.clone().lerp(edge, t);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      size: 3,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  points.userData.update = () => {
    points.rotation.y += 0.00032; // slow, dreamy spin (a touch more visible)
  };
  return points;
}

/**
 * A few spiral galaxies on a far shell, well beyond the memory galaxy so they
 * never collide with / overlap your brain — just distant scenery.
 */
export function makeGalaxies(count = 3, minDist = 6500, maxDist = 9000): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const g = makeSpiralGalaxy();
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    g.position.copy(dir.multiplyScalar(minDist + Math.random() * (maxDist - minDist)));
    group.add(g);
  }
  return group;
}
