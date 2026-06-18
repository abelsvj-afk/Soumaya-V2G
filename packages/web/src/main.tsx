import { createRoot } from "react-dom/client";
import App from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import "./index.css";

// Note: no StrictMode — the 3D scene does one-time imperative setup (bloom,
// starfield, render loop) that double-invocation would duplicate.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Register the service worker so the app is installable (Add to Home Screen) and
// resilient offline. Prod only — the dev server shouldn't be intercepted. The SW
// itself never caches /api, so live brain data is always fresh.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  });
}

