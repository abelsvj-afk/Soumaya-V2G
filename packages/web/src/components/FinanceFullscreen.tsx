import { useRef } from "react";
import { useDialogA11y } from "../hooks/useDialogA11y.js";
import { FinancePanel } from "./FinancePanel.js";

/**
 * The full-screen presentation of Money (docs/specs/paystub-ingestion.md §7) — closes the gap
 * an audit found where Wealth had a fullscreen and base Money didn't. The SAME FinancePanel
 * component as the embedded RightDock tab, just wrapped in a dedicated overlay context, with
 * its own header's expand button hidden (`embedded={false}`) so it doesn't try to open a
 * fullscreen of itself. Mirrors WealthFullscreen.tsx's exact overlay shape (role="dialog" +
 * useDialogA11y for Escape/focus-trap) rather than inventing a new pattern.
 */
export function FinanceFullscreen({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useDialogA11y(overlayRef, onClose);

  return (
    <div className="wealth-fullscreen-overlay" role="dialog" aria-label="Money" ref={overlayRef}>
      <div className="wealth-fullscreen-head">
        <h2>💵 Money</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="wealth-fullscreen-body">
        <FinancePanel embedded={false} />
      </div>
    </div>
  );
}
