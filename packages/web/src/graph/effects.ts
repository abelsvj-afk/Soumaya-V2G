import * as THREE from "three";

/** Build one reusable additive "poof" sprite that expands and fades when fired. */
function makeBurst(): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(230,240,255,0.95)");
  g.addColorStop(0.4, "rgba(150,180,255,0.45)");
  g.addColorStop(1, "rgba(120,140,255,0)");
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
    const k = 8 + f * 70;
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
  spawn: (x: number, y: number, z: number) => void;
}

/**
 * A small round-robin pool of collision sparks. `spawn` fires the next free
 * burst at a point; the sprites self-animate via their userData.update hook
 * (run from the Graph3D tick), so dust blooms wherever bodies graze.
 */
export function makeCollisionBursts(count = 14): CollisionBursts {
  const group = new THREE.Group();
  const pool: THREE.Sprite[] = [];
  for (let i = 0; i < count; i++) {
    const b = makeBurst();
    pool.push(b);
    group.add(b);
  }
  let next = 0;
  return {
    group,
    spawn: (x, y, z) => {
      const b = pool[next % pool.length]!;
      next++;
      (b.userData.fire as (x: number, y: number, z: number) => void)(x, y, z);
    },
  };
}
