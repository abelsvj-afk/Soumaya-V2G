import * as THREE from "three";
import { type GraphNode, classify, deriveMass } from "@brain/shared";
import { bodyColor } from "./theme.js";
import { makeStarMaterial, makePlanetMaterial } from "./shaders.js";

const FONT_SIZE = 44;
const PADDING = 14;
const WORLD_SCALE = 0.11; // canvas px -> world units
const WINDOW_PX = 470; // max on-screen label width before it scrolls (marquee)
const MAX_CHARS = 80; // cap canvas width for very long entries

/**
 * Build a floating text label as a lightweight sprite (no polygons). Long names
 * aren't truncated — instead the sprite shows a fixed-width "window" and the text
 * gently scrolls back and forth (marquee). The animation + distance fade is
 * driven from the Graph3D tick loop via flags stashed in `userData`.
 */
function makeLabel(rawText: string): THREE.Sprite {
  const text = rawText.length > MAX_CHARS ? `${rawText.slice(0, MAX_CHARS)}…` : rawText;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${FONT_SIZE}px Inter, system-ui, sans-serif`;
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  canvas.width = textWidth + PADDING * 2;
  canvas.height = FONT_SIZE + PADDING * 2;

  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(text, PADDING, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  // depthTest false + high renderOrder => the name always draws on top of its body
  // no matter the camera angle (never hides behind the planet).
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;

  const tooWide = canvas.width > WINDOW_PX;
  const displayPx = tooWide ? WINDOW_PX : canvas.width;
  sprite.scale.set(displayPx * WORLD_SCALE, canvas.height * WORLD_SCALE, 1);
  sprite.position.set(0, 9, 0);

  sprite.userData.isLabel = true;
  if (tooWide) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = WINDOW_PX / canvas.width;
    sprite.userData.marquee = { range: 1 - WINDOW_PX / canvas.width, t: 0 };
  }
  return sprite;
}

const rgbOf = (hex: string): string => {
  const c = new THREE.Color(hex);
  return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
};

/** Soft radial-gradient sprite used as a star's corona / planet's atmosphere. */
function makeGlow(color: string, size: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  const rgb = rgbOf(color);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.35, `rgba(${rgb},0.35)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** A ring of drifting rock particles (asteroid belt) around a big body. */
function makeAsteroidBelt(inner: number, outer: number, count = 360): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = inner + Math.random() * (outer - inner);
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * (outer - inner) * 0.12; // thin disk
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const belt = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color: "#b9b2a0",
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  belt.userData.spin = true; // tick rotates it slowly around the body
  return belt;
}

function surfaceCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  return [c, c.getContext("2d")!];
}

function toMap(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 
 * A simple, extremely lightweight glowing point for "Macro View".
 * Used as Level of Detail (LOD) to keep the galaxy performing at high density.
 */
function makeMacroBody(color: string, size: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  const rgb = rgbOf(color);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.4, `rgba(${rgb},0.4)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size * 1.5, size * 1.5, 1);
  sprite.userData.isMacro = true;
  sprite.visible = false; // Hidden by default; toggled by Graph3D tick based on distance
  return sprite;
}

/** Pale grey, cratered moon. */
function makeMoonSurface(): THREE.CanvasTexture {
  const [c, ctx] = surfaceCanvas();
  ctx.fillStyle = "#9aa0b4";
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 128;
    const r = 2 + Math.random() * 9;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#6b7080";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#cfd5e6";
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toMap(c);
}

/**
 * Build a node as a celestial body. Mass (derived server-side from importance +
 * connections + emotion) sets size and class. Bodies are textured spheres so a
 * star reads as a sun, a planet as a world (sometimes ringed), a moon as a pale
 * cratered rock. Animation flags (spin / pulse / corona) and the base emissive
 * are stashed in userData for the Graph3D tick loop (which also dims emissive up
 * close so labels stay readable and surface detail shows).
 */
export function makeNodeObject(node: GraphNode): THREE.Object3D {
  // Action items are urgent little satellites (amber/red), not celestial bodies:
  // small jagged core, a fast-pulsing alert glow, and a warning ring.
  if (node.kind === "action") {
    const g = new THREE.Group();
    const col = "#ffb340";
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.4, 0),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: new THREE.Color(col),
        emissiveIntensity: 1.1,
        roughness: 0.4,
        metalness: 0.3,
      }),
    );
    core.userData.spin = true;
    core.userData.pulse = { base: 1.0, amp: 0.8, speed: 3.2, phase: (node.id % 7) * 0.6 }; // fast, urgent
    g.add(core);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.1, 28),
      new THREE.MeshBasicMaterial({
        color: "#ff7a3c",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2.3;
    g.add(ring);
    g.add(makeGlow(col, 12));
    g.add(makeLabel(`⏰ ${node.label}`));
    g.userData.nodeId = node.id;
    return g;
  }

  const mass =
    node.mass ??
    deriveMass({
      importance: node.importance,
      degree: node.degree,
      emotionalWeight: node.emotionalWeight,
    });
  const cls = node.celestial ?? classify(mass);
  const group = new THREE.Group();

  // Time-based progression — but SIZE/growth comes only from mass (significance +
  // connections), never age. Age only affects vitality (glow):
  //  - a just-added/edited memory is "active" and glows brighter for ~48h, then
  //  - if it stays UNCONNECTED it slowly fades/cools (a forgotten thought), while
  //    connected/significant memories never fade (they're held alive by the web).
  const rawDate = node.createdAt ?? "";
  const isoDate = rawDate.includes("Z") ? rawDate : rawDate.replace(" ", "T") + "Z";
  const created = Date.parse(isoDate);
  const ageH = Number.isFinite(created) ? (Date.now() - created) / 3.6e6 : 9999;
  const fresh = Math.max(0, 1 - ageH / 48);
  const connected = (node.degree ?? 0) >= 1;
  const fade = connected ? 0 : Math.min(0.6, Math.max(0, ageH - 48) / 240); // ~10d -> -60%
  const vitality = (1 + 0.5 * fresh) * (1 - fade);

  // Age-based Evolution Logic (Green Lane Gamification)
  const isHot = ageH < 24; // Created in the last 24h
  const isAncient = ageH > 720 && !connected; // Older than a month and lonely

  // Tweak color based on age
  let evolvedColor = new THREE.Color(bodyColor(node));
  if (isHot) {
    evolvedColor.lerp(new THREE.Color("#ffffff"), 0.15); // Hot white glow
  } else if (isAncient) {
    evolvedColor.lerp(new THREE.Color("#ff6b6b"), 0.15).multiplyScalar(0.85); // Redshift + Weathered dim
  }
  const color = `#${evolvedColor.getHexString()}`;

  const isStarLike = cls === "star" || cls === "supergiant";
  const isPlanetLike = cls === "planet" || cls === "giant";
  const isRocky = cls === "moon" || cls === "asteroid";

  // Size grows with class then mass within the class.
  const SIZE: Record<string, number> = {
    asteroid: 2.2 + mass * 2,
    moon: 3 + mass * 2.5,
    planet: 4 + mass * 4,
    giant: 6.5 + mass * 5,
    star: 6 + mass * 6,
    supergiant: 9 + mass * 7,
  };
  const size = SIZE[cls] ?? 4;

  // Stars/supergiants = blackbody GLSL; planets/giants = terrain+atmosphere GLSL;
  // moons/asteroids = cheap cratered rock. Any failure falls back to a solid body.
  let material: THREE.Material;
  let baseBrightness: number;
  try {
    if (isStarLike) {
      material = makeStarMaterial(color);
      baseBrightness = cls === "supergiant" ? 1.4 : 1.25;
    } else if (isPlanetLike) {
      material = makePlanetMaterial(color);
      baseBrightness = 1.0;
    } else {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cls === "moon" ? "#c2c8da" : color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.16,
        roughness: 1,
        metalness: 0.05,
      });
      try {
        m.map = makeMoonSurface();
      } catch {
        /* solid rock */
      }
      material = m;
      baseBrightness = 0.16;
    }
  } catch {
    material = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.8,
    });
    baseBrightness = 0.8;
  }

  // Asteroids are jagged rocks; everything else is a sphere.
  const geom =
    cls === "asteroid"
      ? new THREE.IcosahedronGeometry(size, 0)
      : new THREE.SphereGeometry(size, isRocky ? 24 : 48, isRocky ? 24 : 48);
  const mesh = new THREE.Mesh(geom, material);
  mesh.userData.spin = true; // every body turns; speed handled in the tick
  mesh.userData.pulse = {
    base: baseBrightness,
    amp: isStarLike ? 0.25 : isPlanetLike ? 0.12 : 0.06,
    speed: (0.6 + mass * 0.9) * (1 + fresh), // fresh memories pulse a touch faster
    phase: (node.id % 12) * 0.5,
    vitality, // age-driven glow: brighter when fresh, dimmer when stale + unconnected
  };

  // 1. The High-Fidelity Body (Complex geometry, lights, etc.)
  const fidelity = new THREE.Group();
  fidelity.userData.isFidelity = true;
  fidelity.add(mesh);

  // Rings: always on gas giants, on ~a third of planets.
  if (cls === "giant" || (cls === "planet" && node.id % 3 === 0)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size * 1.5, size * 2.3, 48),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2.4;
    fidelity.add(ring);
  }

  // Brighter bodies give off more light. Star-like bodies get a corona + a real
  // point light that illuminates nearby worlds; giants/planets get a faint glow.
  if (isStarLike) {
    const glow = makeGlow(color, size * (cls === "supergiant" ? 2.8 : 2.2));
    glow.userData.corona = {
      base: glow.scale.x,
      baseOpacity: cls === "supergiant" ? 0.4 : 0.3,
      speed: 0.5 + mass * 0.7,
      phase: (node.id % 7) * 0.7,
    };
    fidelity.add(glow);
    const light = new THREE.PointLight(
      new THREE.Color(color),
      cls === "supergiant" ? 2.5 + mass * 3 : 1.2 + mass * 2.6,
      size * (cls === "supergiant" ? 60 : 45),
      2,
    );
    fidelity.add(light);
    // A faint asteroid belt orbiting the sun.
    fidelity.add(makeAsteroidBelt(size * 2.6, size * 3.8));
  } else if (isPlanetLike) {
    const glow = makeGlow(color, size * (cls === "giant" ? 1.5 : 1.35));
    glow.userData.corona = {
      base: glow.scale.x,
      baseOpacity: cls === "giant" ? 0.14 : 0.12,
      speed: 0.4 + mass * 0.6,
      phase: (node.id % 7) * 0.7,
    };
    fidelity.add(glow);
  }

  // 2. The Macro Body (Single sprite for high-density performance)
  const macro = makeMacroBody(color, size);

  // 3. Sector Title (Special huge label for Macro view)
  if (mass >= 0.44 && node.celestialTitle) {
    const sectorLabel = makeLabel(node.celestialTitle.toUpperCase());
    sectorLabel.scale.multiplyScalar(2.5); // Giant sector name
    sectorLabel.position.set(0, size * 4 + 10, 0);
    sectorLabel.userData.isSectorTitle = true;
    sectorLabel.visible = false; // Toggled by LOD logic
    group.add(sectorLabel);
  }

  group.add(makeLabel(node.label));
  group.add(fidelity);
  group.add(macro);
  group.userData.nodeId = node.id;
  return group;
}
