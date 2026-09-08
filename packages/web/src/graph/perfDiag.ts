import * as THREE from "three";
import { snapshot as perfSnapshot } from "./perfStats.js";

/**
 * Galaxy Performance Isolation Mode — TEMPORARY, diagnostic-only.
 *
 * Lets a real device be tested with each major rendering category disabled one at a
 * time, to isolate which one is responsible for the large-View 0-1 FPS collapse,
 * without touching PerfHUD (which is not currently visible on-device) and without
 * building a live-toggle UI. Activate with `?galaxyDiag=1` in the URL; each category
 * defaults to ON (identical to normal behavior) unless explicitly turned off, e.g.:
 *
 *   ?galaxyDiag=1              — all categories on (sanity check: must look identical
 *                                 to the URL with no galaxyDiag param at all)
 *   ?galaxyDiag=1&links=0      — links off, everything else on
 *   ?galaxyDiag=1&bodies=0     — node bodies (+ their macro-LOD sibling) off
 *   ?galaxyDiag=1&labels=0     — memory/sector-title labels off
 *   ?galaxyDiag=1&glow=0       — node glow/corona sprites, asteroid belts, the
 *                                 star-light pool, and bloom postprocessing off
 *   ?galaxyDiag=1&aux=0        — Journey hubs, Money-sky, satellites, visitors,
 *                                 sub-agents off
 *
 * Deliberately NOT a live-toggle: this reads `location.search` once and caches it —
 * change categories by editing the URL and reloading. That keeps every call site a
 * one-time, construction-time or mount-time check (`diag.enabled && !diag.xxx`),
 * never a per-frame branch, per-frame allocation, or new animation loop, and means
 * deleting this file plus its ~6 call sites in Graph3D.tsx fully removes the tool.
 *
 * Entirely inert unless `galaxyDiag=1` is present: every flag defaults to `true`, so
 * `diag.enabled && !diag.xxx` can only be true when a category was explicitly turned
 * off AND diagnostic mode is on. With no `galaxyDiag` param at all (the normal case),
 * `enabled` is `false` and every touched call site takes its original, unmodified
 * branch — confirmed by inspection of each call site, not merely by this comment.
 */

export interface GalaxyDiagConfig {
  enabled: boolean;
  links: boolean;
  bodies: boolean;
  labels: boolean;
  glow: boolean;
  aux: boolean;
}

let cached: GalaxyDiagConfig | null = null;

function readBool(params: URLSearchParams, key: string, fallback: boolean): boolean {
  if (!params.has(key)) return fallback;
  return params.get(key) !== "0";
}

/** Reads `location.search` once per page load and caches the result — see the module
 *  doc for why this is deliberately not a live-updating config. */
export function getGalaxyDiagConfig(): GalaxyDiagConfig {
  if (cached) return cached;
  try {
    const params = new URLSearchParams(window.location.search);
    cached = {
      enabled: params.get("galaxyDiag") === "1",
      links: readBool(params, "links", true),
      bodies: readBool(params, "bodies", true),
      labels: readBool(params, "labels", true),
      glow: readBool(params, "glow", true),
      aux: readBool(params, "aux", true),
    };
  } catch {
    cached = { enabled: false, links: true, bodies: true, labels: true, glow: true, aux: true };
  }
  return cached;
}

/**
 * Classifies one child of a node's Object3D group into a diagnostic category, reusing
 * tags nodeObject.ts already sets for OTHER reasons (label texture-cache refcounting,
 * the macro-LOD swap, the frustum-cull fidelity grouping) — no new tags, no changes to
 * nodeObject.ts itself. Returns whether that child should be hidden, given the current
 * config. Called once per node at construction time (see nodeThreeObjectCb in
 * Graph3D.tsx), never per frame.
 */
export function shouldHideNodeChild(child: THREE.Object3D, cfg: GalaxyDiagConfig): boolean {
  if (!cfg.enabled) return false;
  const ud = child.userData ?? {};
  if (ud.isLabel) return !cfg.labels; // regular label + sector-title label (both makeLabel())
  if (ud.glowCacheKey != null) return !cfg.glow; // corona/glow sprite
  if (ud.isMacro) return !cfg.bodies; // far-LOD sibling of the full-detail body
  if (ud.isFidelity) {
    // isFidelity covers the full-detail mesh, an optional ring, an optional glow
    // sprite (already handled above via glowCacheKey — never reaches here), and an
    // optional asteroid belt (a THREE.Points, star-class only). Group the belt with
    // GLOW/LIGHTING (a small decorative luminous accent, not "the body" itself);
    // everything else left here is the mesh/ring, i.e. NODE BODIES.
    return child.type === "Points" ? !cfg.glow : !cfg.bodies;
  }
  return false;
}

/**
 * A plain-DOM (non-React) readout, deliberately independent of PerfHUD, which is not
 * currently visible on-device — this must not depend on whatever is wrong with that
 * component. Shows the active diagnostic configuration and, at a 2Hz poll (reusing
 * perfStats.ts's existing pull-based snapshot — no new sampling infrastructure), the
 * current FPS/frame time. Returns a cleanup function; call it from the same effect's
 * teardown that mounted it.
 */
export function mountGalaxyDiagOverlay(cfg: GalaxyDiagConfig): () => void {
  const el = document.createElement("div");
  el.setAttribute("data-galaxy-diag", "1");
  el.style.cssText = [
    "position:fixed", "left:8px", "bottom:8px", "z-index:99999",
    "background:rgba(0,0,0,0.75)", "color:#7af9c0", "font:11px/1.4 monospace",
    "padding:8px 10px", "border-radius:6px", "pointer-events:none",
    "white-space:pre", "max-width:70vw",
  ].join(";");
  document.body.appendChild(el);

  const render = () => {
    const s = perfSnapshot();
    const line = (k: string, on: boolean) => `${k}:${on ? "ON " : "OFF"}`;
    el.textContent = [
      "GALAXY DIAG",
      [line("links", cfg.links), line("bodies", cfg.bodies), line("labels", cfg.labels)].join("  "),
      [line("glow", cfg.glow), line("aux", cfg.aux)].join("  "),
      `fps:${s.fps.toFixed(0)}  frame:${s.present.p50.toFixed(1)}ms  tick:${s.tick.p50.toFixed(1)}ms`,
    ].join("\n");
  };
  render();
  const iv = window.setInterval(render, 500); // 2Hz — matches perfStats' own established poll rate

  return () => {
    window.clearInterval(iv);
    el.remove();
  };
}
