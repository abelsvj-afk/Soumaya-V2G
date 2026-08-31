import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HelpPanel } from "./HelpPanel.js";

afterEach(() => cleanup());

describe("HelpPanel — dialog semantics", () => {
  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<HelpPanel onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("exposes a dialog role with a readable label", () => {
    render(<HelpPanel onClose={() => {}} />);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Galaxy Pilot Manual");
  });
});
