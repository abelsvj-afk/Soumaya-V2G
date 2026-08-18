import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SettingsPanel } from "./SettingsPanel.js";

afterEach(cleanup);

describe("SettingsPanel", () => {
  it("renders the diagnostics section", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    expect(screen.getByText("🔬 Diagnostics")).toBeDefined();
    expect(screen.getByText("Diagnostic recording")).toBeDefined();
  });

  it("can toggle diagnostic recording", () => {
    render(<SettingsPanel onClose={vi.fn()} />);
    const toggle = screen.getByLabelText(/Diagnostic recording/i).parentElement?.querySelector("button")!;
    fireEvent.click(toggle);
    expect(toggle.className).toContain("on");
  });
});
