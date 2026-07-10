import * as THREE from "three";

/** Build one reusable additive "poof" sprite that expands and fades when fired. */
function makeBurst(color = "rgba(150,180,255,0.45)", size = 70): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.4, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);

  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;

  let life = 0;
  const max = 26;
  sprite.userData.update = () => {
    if (life <= 0) {
      if (sprite.visible) sprite.visible = false;
      return;
    }
    life--;
    const f = 1 - life / max; // 0 -> 1 over lifetime
    const k = 8 + f * size;
    sprite.scale.set(k, k, 1);
    mat.opacity = (1 - f) * 0.85;
  };
  sprite.userData.fire = (x: number, y: number, z: number) => {
    sprite.position.set(x, y, z);
    life = max;
    sprite.visible = true;
  };
  return sprite;
}

export interface CollisionBursts {
  group: THREE.Group;
  spawn: (x: number, y: number, z: number, type?: string) => void;
}

export function makeCollisionBursts(count = 20): CollisionBursts {
  const group = new THREE.Group();
  
  // Create pools for different colors
  const poolDefault: THREE.Sprite[] = [];
  const poolSynthesis: THREE.Sprite[] = []; // Cyan/Blue
  const poolPruning: THREE.Sprite[] = [];    // Red/Orange
  const poolHarmonization: THREE.Sprite[] = []; // Gold/Yellow
  const poolCalibration: THREE.Sprite[] = [];  // White/Indigo
  const poolMerging: THREE.Sprite[] = [];      // Dark Purple Vortex
  const poolUser: THREE.Sprite[] = [];         // Emerald Green (User Activity)
  const poolFuel: THREE.Sprite[] = [];         // Warm Gold (Fuel earned)
  const poolConsume: THREE.Sprite[] = [];      // Fiery red/orange (memory flung into the Sun)

  for (let i = 0; i < count; i++) {
    const b = makeBurst("rgba(150,180,255,0.45)");
    poolDefault.push(b);
    group.add(b);
    
    const s = makeBurst("rgba(100,200,255,0.6)", 120);
    poolSynthesis.push(s);
    group.add(s);

    const p = makeBurst("rgba(255,100,80,0.6)", 90);
    poolPruning.push(p);
    group.add(p);

    const h = makeBurst("rgba(255,220,100,0.6)", 150);
    poolHarmonization.push(h);
    group.add(h);

    const c = makeBurst("rgba(200,200,255,0.7)", 180);
    poolCalibration.push(c);
    group.add(c);

    const m = makeBurst("rgba(150,50,255,0.5)", 220);
    poolMerging.push(m);
    group.add(m);

    const u = makeBurst("rgba(80,255,150,0.7)", 160);
    poolUser.push(u);
    group.add(u);

    const f = makeBurst("rgba(255,200,80,0.8)", 200); // amber fuel sparkle
    poolFuel.push(f);
    group.add(f);

    const cons = makeBurst("rgba(255,120,40,0.9)", 340); // big fiery consumption flare
    poolConsume.push(cons);
    group.add(cons);
  }

  let next = 0;
  return {
    group,
    spawn: (x, y, z, type = "patrol") => {
      let pool = poolDefault;
      if (type === "synthesis") pool = poolSynthesis;
      else if (type === "pruning") pool = poolPruning;
      else if (type === "harmonization") pool = poolHarmonization;
      else if (type === "calibration") pool = poolCalibration;
      else if (type === "merging") pool = poolMerging;
      else if (type === "user") pool = poolUser;
      else if (type === "fuel") pool = poolFuel;
      else if (type === "consume") pool = poolConsume;

      const b = pool[next % pool.length]!;
      next++;
      (b.userData.fire as (x: number, y: number, z: number) => void)(x, y, z);
    },
  };
}

/** A short comet of light that streaks from one star to another as a link forms. */
function makeStream(count: number): { group: THREE.Group; fire: (a: THREE.Vector3, b: THREE.Vector3, color: string) => void; update: () => void } {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g2 = c.getContext("2d")!;
  const grad = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);

  const group = new THREE.Group();
  const dots: THREE.Sprite[] = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    dots.push(s);
    group.add(s);
  }

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let life = 0;
  const max = 34; // ~0.55s at 60fps — a quick spark, never a distraction
  const col = new THREE.Color();

  const update = () => {
    if (life <= 0) return;
    life--;
    const head = 1 - life / max; // 0 -> 1: the comet's leading edge sweeps A -> B
    for (let i = 0; i < dots.length; i++) {
      const s = dots[i]!;
      const t = head - i * 0.06; // trailing tail behind the head
      if (t < 0 || t > 1) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.lerpVectors(a, b, t);
      const fade = Math.sin(Math.min(1, life / max) * Math.PI); // in then out over the whole life
      const mat = s.material as THREE.SpriteMaterial;
      mat.opacity = fade * (1 - i / dots.length) * 0.9;
      mat.color.copy(col);
      const sz = 10 + (1 - i / dots.length) * 12;
      s.scale.set(sz, sz, 1);
    }
    if (life === 0) for (const s of dots) s.visible = false;
  };

  return {
    group,
    fire: (from, to, color) => {
      a.copy(from);
      b.copy(to);
      col.set(color);
      life = max;
    },
    update,
  };
}

export interface LinkForming {
  group: THREE.Group;
  /** Streak a spark from A to B in the given CSS colour (a new connection forming). */
  fire: (a: THREE.Vector3, b: THREE.Vector3, color?: string) => void;
  update: () => void;
}

/**
 * Constellation-forming flourish (#1b): when a link appears, a brief comet of light
 * sweeps from one star to the other, so the connection reads as *drawn*, not popped in.
 * A small pool of reusable streams handles overlapping links. Purely cosmetic and
 * self-contained — the caller is expected to skip firing under reduced-motion.
 */
export function makeLinkForming(streams = 6): LinkForming {
  const group = new THREE.Group();
  const pool = Array.from({ length: streams }, () => {
    const st = makeStream(7);
    group.add(st.group);
    return st;
  });
  let next = 0;
  return {
    group,
    fire: (a, b, color = "rgba(180,200,255,1)") => {
      pool[next % pool.length]!.fire(a, b, color);
      next++;
    },
    update: () => {
      for (const st of pool) st.update();
    },
  };
}
