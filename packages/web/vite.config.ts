import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "three/webgpu": path.resolve(__dirname, "src/graph/webgpuStub.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the @brain/server backend during development.
      "/api": "http://localhost:3001",
    },
  },
});
