import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useDialogA11y } from "./useDialogA11y.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function buildDialog(): { container: HTMLDivElement; first: HTMLButtonElement; last: HTMLButtonElement } {
  const container = document.createElement("div");
  const first = document.createElement("button");
  first.textContent = "First";
  const middle = document.createElement("button");
  middle.textContent = "Middle";
  const last = document.createElement("button");
  last.textContent = "Last";
  container.append(first, middle, last);
  document.body.appendChild(container);
  return { container, first, last };
}

describe("useDialogA11y", () => {
  it("calls onClose on Escape", () => {
    const { container } = buildDialog();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = container;
    const onClose = vi.fn();
    renderHook(() => useDialogA11y(ref, onClose));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it("moves focus into the dialog on mount", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { container, first } = buildDialog();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = container;
    renderHook(() => useDialogA11y(ref, vi.fn()));
    expect(document.activeElement).toBe(first);
  });

  it("restores focus to the previously-focused element on unmount", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { container } = buildDialog();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = container;
    const { unmount } = renderHook(() => useDialogA11y(ref, vi.fn()));
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab forward at the last focusable element", () => {
    const { container, first, last } = buildDialog();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = container;
    renderHook(() => useDialogA11y(ref, vi.fn()));
    last.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
  });

  it("traps Shift+Tab backward at the first focusable element", () => {
    const { container, first, last } = buildDialog();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = container;
    renderHook(() => useDialogA11y(ref, vi.fn()));
    first.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });

  it("does nothing while inactive", () => {
    const { container } = buildDialog();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement }).current = container;
    const onClose = vi.fn();
    renderHook(() => useDialogA11y(ref, onClose, false));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
