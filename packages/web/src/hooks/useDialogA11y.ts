import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Standard modal keyboard/focus behavior, factored out once rather than
 * hand-rolled per dialog: Escape closes it, Tab is trapped within the
 * dialog's own focusable elements while it's open, and focus returns to
 * whatever had it (e.g. the FAB that opened the dialog) once it closes.
 * None of this app's overlays (Settings/Review/Help/ChatDock/ToolsMenu) had
 * any of the three.
 *
 * `active` defaults to true because most dialogs in this app are only ever
 * mounted while open (the parent conditionally renders the whole
 * component) — pass `active` explicitly for a component that stays mounted
 * and toggles its own open state internally (e.g. a popover menu).
 */
export function useDialogA11y(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (container && !container.contains(document.activeElement)) {
      const first = focusableIn(container)[0] ?? container;
      first.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const items = focusableIn(container);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [active, containerRef]);
}
