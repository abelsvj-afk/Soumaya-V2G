import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DialogueBox } from "./DialogueBox.js";

describe("DialogueBox", () => {
  it("shows the greet prompt with both a confirm and a no-pressure dismiss (FR12 — never penalized)", () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(
      <DialogueBox
        title="A memory"
        text="Remember this?"
        confirmLabel="Greet"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("Greet"));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Not now"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("disables confirm while busy and shows a waiting indicator, never a silent freeze", () => {
    render(<DialogueBox text="Sending..." confirmLabel="Greet" onConfirm={() => {}} onDismiss={() => {}} busy />);
    const button = screen.getByRole("button", { name: "…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders as a close-only dialogue when there's no confirm action", () => {
    const onDismiss = vi.fn();
    render(<DialogueBox text="Just info." onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
