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
    tw[i] = 0.42 + Math.random() * 1.7; // each twinkles at its own rate (eased ~30% slower)
    baseSize[i] = 2.0 + Math.random() * Math.random() * 6.0; // mostly small, a few big
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  // Custom-named attributes so we don't depend on three's built-in `color`/USE_COLOR
  // wiring (which differs between materials and silently dropped the whole field).
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
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
    vertexShader: `
      attribute vec3 aColor; attribute float aPhase; attribute float aTw; attribute float aSize;
      uniform float uTime; uniform float uBlur;
      varying vec3 vColor; varying float vBright;
      void main() {
        vColor = aColor;
        vBright = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * aTw + aPhase));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float att = 300.0 / max(1.0, -mv.z);
        gl_PointSize = max(1.0, aSize * att * (1.0 + uBlur * 5.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
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

/**
 * The Milky Way — the luminous galactic band that arcs across a real night sky and is
 * the signature element of NASA's Deep Star Maps. Built 100% procedurally (no shipped
 * image, no licence, works offline), so it's safe to ship in a paid product. Two additive
 * point layers on a randomly-oriented great circle: a soft HAZE (few big, very faint points
 * → the milky glow) and dense STAR DUST (many tiny points → the grainy stellar sea). Both
 * concentrate near the galactic plane with a Gaussian off-plane falloff, and are brightened
 * along bright knots + darkened by dust-lane rifts so it never reads as a uniform smear.
 *
 * `level` scales the point counts so it runs on mid-range mobile, not just the top tier.
 */
export function makeMilkyWay(radius = 8600, level: "low" | "medium" | "high" = "medium"): THREE.Group {
  const group = new THREE.Group();

  // Random galactic plane: an in-plane basis (u, v) + the pole (n).
  const n = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const u = new THREE.Vector3()
    .crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
    .normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  // Two random seeds so the bright-knot / dust-lane pattern differs every session.
  const seedA = Math.random() * Math.PI * 2;
  const seedB = Math.random() * Math.PI * 2;

  const warm = new THREE.Color("#fff1d8"); // core glow
  const pale = new THREE.Color("#cfd8ff"); // cool star dust
  const rust = new THREE.Color("#caa27a"); // dust-lane tint

  // Brightness along the band: broad lobes (knots) × finer rifts, clamped ≥ 0 for dark lanes.
  const patch = (ang: number) =>
    Math.max(0, (0.55 + 0.45 * Math.sin(ang * 2.1 + seedA)) * (0.62 + 0.42 * Math.sin(ang * 6.3 + seedB)));

  // One point layer concentrated on the band.
  const layer = (count: number, thickness: number, size: number, opacity: number, warmMix: number): THREE.Points => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const dir = new THREE.Vector3();
    const base = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      // Box–Muller Gaussian → dense on the plane, thinning out with |latitude|.
      const g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      dir
        .copy(u)
        .multiplyScalar(Math.cos(ang))
        .addScaledVector(v, Math.sin(ang))
        .addScaledVector(n, g * thickness)
        .normalize()
        .multiplyScalar(radius * (0.95 + Math.random() * 0.1));
      pos[i * 3] = dir.x;
      pos[i * 3 + 1] = dir.y;
      pos[i * 3 + 2] = dir.z;
      // Colour: warm core lerped toward cool star dust, tinted rust where a dust lane bites.
      const bright = patch(ang) * Math.exp(-Math.abs(g) * 0.4);
      base.copy(warm).lerp(pale, Math.random() * warmMix);
      if (bright < 0.28) base.lerp(rust, 0.35); // rifts glow faint rusty, not black
      base.multiplyScalar(0.35 + 0.65 * bright);
      col[i * 3] = base.r;
      col[i * 3 + 1] = base.g;
      col[i * 3 + 2] = base.b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    points.frustumCulled = false;
    return points;
  };

  // Lighter point budgets (mobile was hitting the <24fps lag nag) but brighter, so the band
  // reads MORE clearly with LESS geometry — visibility from opacity/size, not point count.
  const haze = level === "low" ? 240 : level === "medium" ? 380 : 700;
  const dust = level === "low" ? 1600 : level === "medium" ? 2800 : 5200;
  group.add(layer(haze, 0.16, 240, 0.07, 0.25)); // soft milky glow (bigger, a touch brighter)
  group.add(layer(dust, 0.1, 8, 0.6, 0.85)); // grainy stellar sea (brighter, fewer points)
  // Barely-there drift so the band feels alive without visibly wandering.
  group.userData.update = (t: number) => {
    group.rotation.z = t * 0.0006;
  };
  return group;
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
  // Bigger so they stay grand at their farther distance (see makeGalaxies).
  const radius = 700 + Math.random() * 950;
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
      size: 6.5, // bigger so they still read as galaxies at their far distance on a phone
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
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
// Distances are well beyond the camera's zoom-out ceiling (~6200) so these spinning
// clusters are pure backdrop — you can never reach or orbit behind them.
export function makeGalaxies(count = 3, minDist = 10500, maxDist = 15000): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const g = makeSpiralGalaxy();
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    g.position.copy(dir.multiplyScalar(minDist + Math.random() * (maxDist - minDist)));
    group.add(g);
  }
  return group;
}
