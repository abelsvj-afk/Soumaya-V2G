import { useRef } from "react";
import { useDialogA11y } from "../hooks/useDialogA11y.js";
import { WealthPanel } from "./WealthPanel.js";

/**
 * The full-screen presentation of Wealth (docs/specs/wealth-goals-allocation.md §13) — the
 * SAME WealthPanel component as the embedded one inside FinancePanel, just wrapped in a
 * dedicated overlay context instead of the compact dock body. WealthPanel itself has zero
 * knowledge of which mode it's in; only this wrapper (and FinancePanel's own inline mount)
 * differ. Mirrors HelpPanel/ChatDock's exact overlay shape (role="dialog" +
 * useDialogA11y for Escape/focus-trap) rather than inventing a new pattern.
 */
export function WealthFullscreen({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useDialogA11y(overlayRef, onClose);

  return (
    <div className="wealth-fullscreen-overlay" role="dialog" aria-label="Wealth" ref={overlayRef}>
      <div className="wealth-fullscreen-head">
        <h2>🧭 Wealth</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="wealth-fullscreen-body">
        <WealthPanel />
      </div>
    </div>
  );
}
