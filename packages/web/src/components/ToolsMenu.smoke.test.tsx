import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToolsMenu } from "./ToolsMenu.js";

afterEach(cleanup);

function props(over = {}) {
  return {
    onSearch: vi.fn(), onLenses: vi.fn(), onConnections: vi.fn(), candCount: 0,
    onReview: vi.fn(), dueCount: 0, onTimeline: vi.fn(), onLegend: vi.fn(),
    onFlashback: vi.fn(), onFocusMode: vi.fn(), focusMode: false, onHelp: vi.fn(),
    ...over,
  };
}

describe("ToolsMenu (mobile-first tool consolidation)", () => {
  it("opens on tap and routes an item (Lenses) — the button was unreachable before", () => {
    const p = props();
    render(<ToolsMenu {...p} />);
    // Menu closed → items hidden.
    expect(screen.queryByText("Lenses")).toBeNull();
    fireEvent.click(screen.getByLabelText("Tools"));
    fireEvent.click(screen.getByText("Lenses"));
    expect(p.onLenses).toHaveBeenCalled();
    // Selecting an item closes the menu.
    expect(screen.queryByText("Lenses")).toBeNull();
  });

  it("shows a combined alert badge for pending connections + due recalls", () => {
    const { container } = render(<ToolsMenu {...props({ candCount: 2, dueCount: 3 })} />);
    expect(container.querySelector(".fab-badge")?.textContent).toBe("5");
  });
});
