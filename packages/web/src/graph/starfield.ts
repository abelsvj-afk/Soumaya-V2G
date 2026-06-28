import * as THREE from "three";

/**
 * A living stellar backdrop: thousands of colored points scattered far out, on a
 * spherical shell (so it reads as a sky, never a cube) that slowly drifts and
 * twinkles instead of sitting dead-still.
 */
export function makeStarfield(count = 6500, spread = 7000): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phase = new Float32Array(count); // per-star twinkle phase
  const tw = new Float32Array(count); // per-star twinkle speed
  const baseSize = new Float32Array(count); // per-star base size (varied)
  const palette = [
    new THREE.Color("#ffffff"),
    new THREE.Color("#9dd9ff"),
    new THREE.Color("#ffd9f0"),
    new THREE.Color("#cabfff"),
    new THREE.Color("#fff0c8"),
  ];

  const inner = spread * 0.18;
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(inner + Math.random() * (spread - inner));
    positions[i * 3] = dir.x;
    positions[i * 3 + 1] = dir.y;
    positions[i * 3 + 2] = dir.z;
    const c = palette[Math.floor(Math.random() * palette.length)]!;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    phase[i] = Math.random() * Math.PI * 2;
    tw[i] = 0.6 + Math.random() * 2.4; // each twinkles at its own rate
    baseSize[i] = 2.0 + Math.random() * Math.random() * 6.0; // mostly small, a few big
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute("aTw", new THREE.BufferAttribute(tw, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(baseSize, 1));

  // Per-star twinkle + speed blur via a small ShaderMaterial. uBlur (camera speed,
  // 0..1) enlarges + softens points so stars smear past when you rush by close up.
  const uniforms = { uTime: { value: 0 }, uBlur: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader: `
      attribute float aPhase; attribute float aTw; attribute float aSize;
      uniform float uTime; uniform float uBlur;
      varying vec3 vColor; varying float vBright;
      void main() {
        vColor = color;
        vBright = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * aTw + aPhase));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float att = 300.0 / max(1.0, -mv.z);
        gl_PointSize = aSize * att * (1.0 + uBlur * 5.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uBlur;
      varying vec3 vColor; varying float vBright;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.0, d);
        float a = soft * vBright * (0.95 - uBlur * 0.45);
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });

  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  // t = elapsed seconds-ish (ms*…); blur = camera-speed factor 0..1 from Graph3D.
  stars.userData.update = (t: number, blur = 0) => {
    stars.rotation.y = t * 0.004;
    stars.rotation.x = Math.sin(t * 0.02) * 0.03;
    uniforms.uTime.value = t;
    // ease toward the incoming blur so it ramps smoothly as she accelerates past.
    uniforms.uBlur.value += (blur - uniforms.uBlur.value) * 0.2;
  };
  return stars;
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
