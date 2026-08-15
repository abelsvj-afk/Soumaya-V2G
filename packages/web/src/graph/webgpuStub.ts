/**
 * Lightweight stub for the unused `three/webgpu` entrypoint.
 * `three-render-objects` imports `WebGPURenderer` from `three/webgpu` at module scope,
 * but Soumaya uses standard `THREE.WebGLRenderer` exclusively.
 * Aliasing `three/webgpu` to this stub excludes ~100 kB of WebGPU node builder code
 * and prevents upstream WebGPUConstants runtime initialization crashes.
 */
export class WebGPURenderer {
  constructor() {
    throw new Error("WebGPURenderer is not supported in this WebGL build.");
  }
}
