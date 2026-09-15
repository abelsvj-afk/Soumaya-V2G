import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmButton, OverlayShell } from "./OverlayShell.js";

describe("OverlayShell", () => {
  it("renders the dialog role, icon, and title", () => {
    render(
      <OverlayShell icon="🏦" title="Bank" onClose={vi.fn()}>
        <p>content</p>
      </OverlayShell>,
    );
    expect(screen.getByRole("dialog", { name: "Bank" })).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("defaults the accessible name to the title, but an explicit ariaLabel wins", () => {
    render(
      <OverlayShell icon="🛰️" title="Soumaya" ariaLabel="Chat with Soumaya" onClose={vi.fn()}>
        <p>content</p>
      </OverlayShell>,
    );
    expect(screen.getByRole("dialog", { name: "Chat with Soumaya" })).toBeTruthy();
  });

  it("shows a default Leave button that calls onClose", () => {
    const onClose = vi.fn();
    render(
      <OverlayShell icon="📚" title="Library" onClose={onClose}>
        <p>content</p>
      </OverlayShell>,
    );
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders a custom footer instead of the default Leave button when provided", () => {
    render(
      <OverlayShell icon="🛰️" title="Soumaya" onClose={vi.fn()} footer={<button type="button">Ask</button>}>
        <p>content</p>
      </OverlayShell>,
    );
    expect(screen.queryByText("Leave")).toBeNull();
    expect(screen.getByText("Ask")).toBeTruthy();
  });

  it("2026-09-15 audit fix — out-ranks the persistent TownHud/button-row's zIndex:1, so it never sits behind or stays clickable through it", () => {
    render(
      <OverlayShell icon="🏦" title="Bank" onClose={vi.fn()}>
        <p>content</p>
      </OverlayShell>,
    );
    expect(screen.getByRole("dialog").style.zIndex).toBe("10");
  });
});

describe("ConfirmButton (2026-09-15 audit fix — finding #5, zero destructive-action confirmations anywhere)", () => {
  it("does nothing on the first tap — only arms the confirm step", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm?")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("calls onConfirm only on the second tap", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Confirm?"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Cancel backs out without ever calling onConfirm, returning to the original label", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Delete" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.queryByText("Confirm?")).toBeNull();
  });

  it("supports a custom confirm label", () => {
    render(<ConfirmButton label="Turn in" confirmLabel="Really turn in?" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("Turn in"));
    expect(screen.getByText("Really turn in?")).toBeTruthy();
  });
});
