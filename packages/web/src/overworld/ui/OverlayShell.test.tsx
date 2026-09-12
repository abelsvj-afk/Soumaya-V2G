import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayShell } from "./OverlayShell.js";

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
});
