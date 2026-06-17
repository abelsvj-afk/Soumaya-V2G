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

      const b = pool[next % pool.length]!;
      next++;
      (b.userData.fire as (x: number, y: number, z: number) => void)(x, y, z);
    },
  };
}
