import * as THREE from "three";

/**
 * Pure helpers extracted from the large soumaya.ts (Post-MVP D4 refactor): vector
 * conversion, the eased smoothstep, the marquee task-label sprite factory, and body
 * radius. No ship state — pure functions.
 */

export const vecOf = (n: any): THREE.Vector3 => new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);

/** Smoothstep ease (slow start + slow finish) — gives accel/decel along a path. */
export const smooth = (x: number): number => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

/**
 * A billboard "task" label that floats above the ship and shows what she's doing.
 * Long text marquee-scrolls. Kept as a standalone object (added to the scene by
 * Graph3D) so the ship's banking/roll never tilts or swings it.
 */
export function makeTaskLabel() {
  const canvas = document.createElement("canvas");
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  // Enable depthTest so the label sorts correctly in 3D space instead of drawing on top of the ship
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  const H = 56; // canvas px height
  const HU = 7.5; // world height (smaller from 11)
  const MAXW = 85; // world width before it marquees (smaller from 120)
  let scroll = false;
  let off = 0;
  let widthUnits = HU;

  const draw = (text: string) => {
    const ctx = canvas.getContext("2d")!;
    const FS = 32;
    const pad = 22;
    ctx.font = `600 ${FS}px system-ui, -apple-system, sans-serif`;
    const textWidth = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const baseWidthUnits = (textWidth / H) * HU;
    const needScroll = baseWidthUnits > MAXW;
    
    // Add gap space at the end if scrolling so it doesn't loop-clump immediately
    const gap = needScroll ? 140 : 0;
    const w = Math.max(64, textWidth + gap);
    
    canvas.width = w;
    canvas.height = H;
    const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, w, H);
    c.font = `600 ${FS}px system-ui, -apple-system, sans-serif`;
    c.textBaseline = "middle";
    // translucent pill
    c.fillStyle = "rgba(8,5,20,0.65)";
    c.fillRect(0, 0, w, H);
    c.fillStyle = "#cfe0ff";
    c.fillText(text, pad, H / 2 + 1);
    tex.needsUpdate = true;
    
    widthUnits = (w / H) * HU;
    if (needScroll) {
      scroll = true;
      tex.repeat.x = MAXW / widthUnits;
      sprite.scale.set(MAXW, HU, 1);
    } else {
      scroll = false;
      tex.repeat.x = 1;
      tex.offset.x = 0;
      sprite.scale.set(widthUnits, HU, 1);
    }
  };

  const tick = (dt: number) => {
    if (scroll) {
      off = (off + dt * 0.08) % 1; // scroll slightly faster for cool effect
      tex.offset.x = off;
    }
  };

  return { sprite, draw, tick };
}

/** Approximate a body's visual radius (mirrors nodeObject sizing) for standoff. */
export const bodyRadius = (n: any): number => {
  const m = n.mass ?? 0.3;
  switch (n.celestial) {
    case "supergiant":
      return 9 + m * 7;
    case "star":
      return 6 + m * 6;
    case "giant":
      return 6.5 + m * 5;
    case "gas_giant":
      return 5.5 + m * 4.5;
    case "planet":
      return 4 + m * 4;
    case "moon":
      return 3 + m * 2.5;
    default:
      return 2.2 + m * 2;
  }
};
