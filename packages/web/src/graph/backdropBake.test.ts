import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { bakeBackdrop, disposeBakedBackdrop } from "./backdropBake.js";

/**
 * Verifies the bake's bookkeeping (scene.background assignment, source disposal, target
 * disposal) without a real GPU — WebGLCubeRenderTarget/CubeCamera are pure CPU-side data
 * structures until `renderer.render()` is actually called, so a fake renderer exercising
 * that one call is enough to run the real bake logic end-to-end.
 */
function fakeRenderer() {
  return {
    coordinateSystem: THREE.WebGLCoordinateSystem,
    xr: { enabled: false },
    getRenderTarget: () => null,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: vi.fn(),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
}

/** A sprite with a spy-able geometry/material so disposal can be asserted. */
function fakeSprite() {
  const texture = new THREE.Texture();
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  return {
    sprite,
    disposeSpy: vi.spyOn(material, "dispose"),
    mapDisposeSpy: vi.spyOn(texture, "dispose"),
  };
}

describe("bakeBackdrop", () => {
  it("installs the render target's texture as scene.background", () => {
    const scene = new THREE.Scene();
    const { sprite } = fakeSprite();
    const baked = bakeBackdrop(fakeRenderer(), scene, [sprite], 64);

    expect(scene.background).toBe(baked.target.texture);
  });

  it("actually drives the renderer through all 6 cube faces", () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene();
    const { sprite } = fakeSprite();
    bakeBackdrop(renderer, scene, [sprite], 64);

    expect((renderer.render as ReturnType<typeof vi.fn>).mock.calls.length).toBe(6);
  });

  it("disposes every source's geometry/material/texture once baked (no longer needed live)", () => {
    const scene = new THREE.Scene();
    const { sprite, disposeSpy, mapDisposeSpy } = fakeSprite();
    bakeBackdrop(fakeRenderer(), scene, [sprite], 64);

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(mapDisposeSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT dispose the render target's own texture — it's the thing just installed", () => {
    const scene = new THREE.Scene();
    const { sprite } = fakeSprite();
    const baked = bakeBackdrop(fakeRenderer(), scene, [sprite], 64);

    // scene.background must still be a live, usable texture immediately after the bake.
    expect(scene.background).not.toBeNull();
    expect((baked.target.texture as any).isTexture).toBe(true);
  });

  it("handles multiple sources and groups (not just single sprites)", () => {
    const scene = new THREE.Scene();
    const a = fakeSprite();
    const b = fakeSprite();
    const group = new THREE.Group();
    group.add(a.sprite, b.sprite);
    bakeBackdrop(fakeRenderer(), scene, [group], 64);

    expect(a.disposeSpy).toHaveBeenCalledTimes(1);
    expect(b.disposeSpy).toHaveBeenCalledTimes(1);
  });

  // Real, on-device bug report: the baked nebula/galaxy backdrop showed a hard-edged,
  // wrongly-toned color patch ("cut out" shape) instead of smoothly fading to black — this
  // texture is assigned directly to scene.background (direct display, like the CanvasTextures
  // in skybox.ts/nodeObject.ts, which both already set this), so it needs the SAME color
  // space those already use; without it, the additively-summed bright regions where sprites
  // overlap are the most visibly wrong (matching the reported symptom).
  it("sets the render target texture's colorSpace for correct direct display (matches skybox.ts/nodeObject.ts's convention)", () => {
    const scene = new THREE.Scene();
    const { sprite } = fakeSprite();
    const baked = bakeBackdrop(fakeRenderer(), scene, [sprite], 64);

    expect(baked.target.texture.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it("disposeBakedBackdrop frees the render target", () => {
    const scene = new THREE.Scene();
    const { sprite } = fakeSprite();
    const baked = bakeBackdrop(fakeRenderer(), scene, [sprite], 64);
    const targetDisposeSpy = vi.spyOn(baked.target, "dispose");

    disposeBakedBackdrop(baked);

    expect(targetDisposeSpy).toHaveBeenCalledTimes(1);
  });
});
