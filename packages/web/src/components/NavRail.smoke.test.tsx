import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NavRail, type NavRailProps } from "./NavRail.js";

afterEach(cleanup);

function props(over: Partial<NavRailProps> = {}): NavRailProps {
  return {
    onSearch: vi.fn(), onFlashback: vi.fn(), onConnections: vi.fn(), candCount: 0,
    onLegend: vi.fn(), onTimeline: vi.fn(), onReview: vi.fn(), dueCount: 0,
    onHelp: vi.fn(), onDock: vi.fn(), onRecenter: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn(),
    onFocusMode: vi.fn(), focusMode: false, onLenses: vi.fn(),
    ...over,
  };
}

describe("NavRail (extracted FAB rail)", () => {
  it("routes each button to its callback", () => {
    const p = props();
    render(<NavRail {...p} />);
    fireEvent.click(screen.getByLabelText("Search"));
    fireEvent.click(screen.getByLabelText("Suggested connections"));
    fireEvent.click(screen.getByLabelText("Recall session"));
    fireEvent.click(screen.getByLabelText("Recenter galaxy"));
    fireEvent.click(screen.getByLabelText("Zoom in"));
    fireEvent.click(screen.getByLabelText("Deep-space focus mode"));
    expect(p.onSearch).toHaveBeenCalled();
    expect(p.onConnections).toHaveBeenCalled();
    expect(p.onReview).toHaveBeenCalled();
    expect(p.onRecenter).toHaveBeenCalled();
    expect(p.onZoomIn).toHaveBeenCalled();
    expect(p.onFocusMode).toHaveBeenCalled();
  });

  it("labels the focus toggle as an exit when active", () => {
    render(<NavRail {...props({ focusMode: true })} />);
    expect(screen.getByLabelText("Exit focus mode")).toBeTruthy();
  });

  it("shows the connection + recall badges only when non-zero (capped at 99+)", () => {
    const { container } = render(<NavRail {...props({ candCount: 3, dueCount: 150 })} />);
    const badges = [...container.querySelectorAll(".fab-badge")].map((b) => b.textContent);
    expect(badges).toContain("3");
    expect(badges).toContain("99+"); // 150 capped
  });

  it("hides badges at zero", () => {
    const { container } = render(<NavRail {...props()} />);
    expect(container.querySelector(".fab-badge")).toBeNull();
  });
});
