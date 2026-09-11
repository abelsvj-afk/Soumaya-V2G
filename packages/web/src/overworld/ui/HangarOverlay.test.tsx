import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HangarOverlay } from "./HangarOverlay.js";

describe("HangarOverlay", () => {
  beforeEach(() => localStorage.clear());

  it("defaults every selection to the same fallback HangarPanel.tsx uses", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
    expect((screen.getByLabelText(/Spaceship Hull/) as HTMLSelectElement).value).toBe("default");
    expect((screen.getByLabelText(/Cosmic Trail/) as HTMLSelectElement).value).toBe("blue");
  });

  it("persists a selection to the SAME localStorage key HangarPanel.tsx reads", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={200} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Spaceship Hull/), { target: { value: "organic" } });
    expect(localStorage.getItem("brain.hangar.ship.space-1")).toBe("organic");
  });

  it("a locked option cannot be selected and shows its unlock hint as text, not color-only", () => {
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={vi.fn()} />);
    const select = screen.getByLabelText(/Spaceship Hull/) as HTMLSelectElement;
    const organicOption = Array.from(select.options).find((o) => o.value === "organic");
    expect(organicOption?.disabled).toBe(true);
    expect(organicOption?.textContent).toMatch(/🔒/);
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<HangarOverlay spaceId="space-1" memoriesCount={0} onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
