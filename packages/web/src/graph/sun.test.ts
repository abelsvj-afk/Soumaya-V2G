import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { neutralizeSunMaterial } from "./sun.js";

/**
 * Regression coverage for the single most expensive thing the galaxy was doing.
 *
 * `sun.glb` ships KHR_materials_transmission with transmissionFactor 1. three.js routes any
 * material with `transmission > 0` into `renderTransmissionPass()`, which re-renders the
 * background and every opaque object into a full-resolution multisampled half-float target,
 * MSAA-resolves it and regenerates its mipmap chain — every frame, inside renderer.render().
 * The assertion that matters is not "we set a field" but "three.js can no longer classify
 * this material as transmissive", which is exactly the `transmission > 0` test three.js
 * itself applies when building its render lists.
 */
describe("neutralizeSunMaterial", () => {
  it("clears transmission so three.js cannot classify the material as transmissive", () => {
    const mat = new THREE.MeshPhysicalMaterial({ transmission: 1 });
    expect(mat.transmission).toBeGreaterThan(0); // the pathological starting state

    neutralizeSunMaterial(mat);

    expect(mat.transmission).toBe(0);
    expect(mat.transmission > 0).toBe(false); // three.js's own render-list predicate
  });

  it("zeroes envMapIntensity so the sun stays self-luminous, not reflective", () => {
    const mat = new THREE.MeshStandardMaterial({ envMapIntensity: 1 });
    neutralizeSunMaterial(mat);
    expect(mat.envMapIntensity).toBe(0);
  });

  it("handles a material with neither property without throwing or inventing fields", () => {
    const mat = new THREE.MeshBasicMaterial();
    expect(() => neutralizeSunMaterial(mat)).not.toThrow();
    expect("transmission" in mat).toBe(false);
    expect("envMapIntensity" in mat).toBe(false);
  });

  it("leaves emissive appearance untouched — the sun must still glow", () => {
    const mat = new THREE.MeshPhysicalMaterial({
      transmission: 1,
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.75,
    });

    neutralizeSunMaterial(mat);

    expect(mat.emissiveIntensity).toBe(0.75);
    expect(mat.emissive.getHexString()).toBe("ffffff");
  });
});
