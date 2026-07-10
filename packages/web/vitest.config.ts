import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Web test harness (Post-MVP: makes component/refactor work verifiable, not just
 * typecheck-able). happy-dom is a light DOM so React components render without a real
 * browser; WebGL/three.js isn't available here, so those pieces are mocked in tests.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
