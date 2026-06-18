import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Shared glTF loader, configured once for the whole app.
 *
 * Why this exists: some of our models (e.g. aura-satellite.glb) are exported with
 * KHR_draco_mesh_compression. A bare GLTFLoader has no Draco decoder, so it throws
 * on load — the model silently falls back to its procedural stand-in (right shape,
 * but none of the real textures/designs). We attach a DRACOLoader pointing at the
 * decoder we bundle in /public/draco (served as static assets, so it works offline
 * and behind any network policy — no CDN dependency). WebP textures
 * (EXT_texture_webp) are handled by three's GLTFLoader natively.
 *
 * The decoder is only fetched the first time a Draco mesh is actually decoded, so
 * non-Draco models (ship, station) pay nothing.
 */
let loader: GLTFLoader | null = null;

export function gltfLoader(): GLTFLoader {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath("/draco/");
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}
