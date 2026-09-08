import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";

/**
 * Galaxy Performance Isolation Mode (TEMPORARY diagnostic tool — see perfDiag.ts's
 * module doc). `getGalaxyDiagConfig()` caches its parse of `location.search` for the
 * life of the page, matching this repo's existing convention for that pattern (e.g.
 * PerfHUD's own `perfHudEnabled()`) — so each test gets a fresh module instance via
 * `vi.resetModules()` + dynamic import, the same technique already used in
 * sfx.test.ts/Toasts.component.test.tsx, rather than exporting a test-only reset hook
 * that production code would never call.
 */

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

beforeEach(() => {
  vi.resetModules();
  setSearch("");
});

describe("perfDiag — getGalaxyDiagConfig", () => {
  it("is fully inert with no galaxyDiag param at all", async () => {
    setSearch("?foo=bar");
    const { getGalaxyDiagConfig } = await import("./perfDiag.js");
    const cfg = getGalaxyDiagConfig();
    expect(cfg).toEqual({ enabled: false, links: true, bodies: true, labels: true, glow: true, aux: true });
  });

  it("?galaxyDiag=1 alone turns every category on (must be visually identical to no param)", async () => {
    setSearch("?galaxyDiag=1");
    const { getGalaxyDiagConfig } = await import("./perfDiag.js");
    expect(getGalaxyDiagConfig()).toEqual({ enabled: true, links: true, bodies: true, labels: true, glow: true, aux: true });
  });

  it("turns off exactly the categories explicitly set to 0", async () => {
    setSearch("?galaxyDiag=1&links=0&glow=0");
    const { getGalaxyDiagConfig } = await import("./perfDiag.js");
    expect(getGalaxyDiagConfig()).toEqual({ enabled: true, links: false, bodies: true, labels: true, glow: false, aux: true });
  });

  it("a category param without galaxyDiag=1 has no effect (enabled stays false)", async () => {
    setSearch("?links=0");
    const { getGalaxyDiagConfig } = await import("./perfDiag.js");
    expect(getGalaxyDiagConfig().enabled).toBe(false);
  });

  it("caches the first read — changing the URL afterward doesn't retroactively change it", async () => {
    setSearch("?galaxyDiag=1&bodies=0");
    const { getGalaxyDiagConfig } = await import("./perfDiag.js");
    const first = getGalaxyDiagConfig();
    setSearch("?galaxyDiag=1&bodies=1");
    expect(getGalaxyDiagConfig()).toBe(first); // same cached object, not re-parsed
  });
});

describe("perfDiag — shouldHideNodeChild", () => {
  const ON = { enabled: false, links: true, bodies: true, labels: true, glow: true, aux: true };

  it("never hides anything when diagnostic mode is disabled, regardless of category flags", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const label = new THREE.Sprite();
    label.userData.isLabel = true;
    expect(shouldHideNodeChild(label, { ...ON, enabled: false, labels: false })).toBe(false);
  });

  it("classifies a label sprite (regular or sector-title) under LABELS", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const label = new THREE.Sprite();
    label.userData.isLabel = true;
    expect(shouldHideNodeChild(label, { ...ON, enabled: true, labels: false })).toBe(true);
    expect(shouldHideNodeChild(label, { ...ON, enabled: true, labels: true })).toBe(false);
  });

  it("classifies a glow/corona sprite under GLOW/LIGHTING via its glowCacheKey tag", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const glow = new THREE.Sprite();
    glow.userData.glowCacheKey = "x-1";
    glow.userData.isFidelity = true; // nodeObject.ts tags glow with BOTH — glowCacheKey must win
    expect(shouldHideNodeChild(glow, { ...ON, enabled: true, glow: false, bodies: true })).toBe(true);
    expect(shouldHideNodeChild(glow, { ...ON, enabled: true, glow: true, bodies: false })).toBe(false);
  });

  it("classifies the macro-LOD sibling under NODE BODIES via its isMacro tag", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const macro = new THREE.Mesh();
    macro.userData.isMacro = true;
    expect(shouldHideNodeChild(macro, { ...ON, enabled: true, bodies: false })).toBe(true);
    expect(shouldHideNodeChild(macro, { ...ON, enabled: true, bodies: true })).toBe(false);
  });

  it("classifies the full-detail mesh/ring (isFidelity, non-Points) under NODE BODIES", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const mesh = new THREE.Mesh();
    mesh.userData.isFidelity = true;
    expect(shouldHideNodeChild(mesh, { ...ON, enabled: true, bodies: false, glow: true })).toBe(true);
    expect(shouldHideNodeChild(mesh, { ...ON, enabled: true, bodies: true, glow: false })).toBe(false);
  });

  it("classifies the asteroid belt (isFidelity, Points) under GLOW/LIGHTING, not NODE BODIES", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const belt = new THREE.Points();
    belt.userData.isFidelity = true;
    expect(shouldHideNodeChild(belt, { ...ON, enabled: true, glow: false, bodies: true })).toBe(true);
    expect(shouldHideNodeChild(belt, { ...ON, enabled: true, glow: true, bodies: false })).toBe(false);
  });

  it("leaves an untagged/unrelated child alone", async () => {
    const { shouldHideNodeChild } = await import("./perfDiag.js");
    const plain = new THREE.Object3D();
    expect(shouldHideNodeChild(plain, { ...ON, enabled: true, links: false, bodies: false, labels: false, glow: false, aux: false })).toBe(false);
  });
});
