import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ActionRail, type ActionRailProps } from "./ActionRail.js";

afterEach(cleanup);

function props(over: Partial<ActionRailProps> = {}): ActionRailProps {
  return {
    onIngest: vi.fn(), onObservatory: vi.fn(), onChat: vi.fn(),
    chatActive: false, chatPulse: false, spaceName: "Nova", onSettings: vi.fn(), ...over,
  };
}

describe("ActionRail (extracted bottom FABs)", () => {
  it("routes each button to its callback", () => {
    const p = props();
    render(<ActionRail {...p} />);
    fireEvent.click(screen.getByLabelText("Add a memory"));
    fireEvent.click(screen.getByLabelText("Talk to Soumaya"));
    fireEvent.click(screen.getByLabelText("Settings"));
    expect(p.onIngest).toHaveBeenCalled();
    expect(p.onChat).toHaveBeenCalled();
    expect(p.onSettings).toHaveBeenCalled();
  });

  it("reflects chat active/pulse state in the class + names the space in the title", () => {
    const { container } = render(<ActionRail {...props({ chatActive: true, chatPulse: true })} />);
    const chat = container.querySelector(".fab-chat")!;
    expect(chat.className).toContain("on");
    expect(chat.className).toContain("pulse");
    expect(chat.getAttribute("title")).toBe("Talk to Nova");
  });
});
