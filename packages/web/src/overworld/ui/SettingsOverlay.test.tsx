import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsOverlay } from "./SettingsOverlay.js";

vi.mock("../../lib/music.js", () => ({
  musicEnabled: vi.fn(() => true),
  setMusicEnabled: vi.fn(),
  nextTrack: vi.fn().mockResolvedValue(undefined),
}));

import { musicEnabled, setMusicEnabled, nextTrack } from "../../lib/music.js";

describe("SettingsOverlay (town-hud.md)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows real, accurate controls in How to Play, never an invented mechanic", () => {
    render(<SettingsOverlay onClose={vi.fn()} />);
    expect(screen.getByText(/WASD or the arrow keys/)).toBeTruthy();
    expect(screen.getByText(/Space or Enter to interact/)).toBeTruthy();
  });

  it("toggling music calls the same real setMusicEnabled the floating buttons use", () => {
    (musicEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    render(<SettingsOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/Music on/));
    expect(setMusicEnabled).toHaveBeenCalledWith(false);
  });

  it("next track calls the same real nextTrack the floating button uses", () => {
    render(<SettingsOverlay onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/Next track/));
    expect(nextTrack).toHaveBeenCalled();
  });

  it("calls onClose when leaving", () => {
    const onClose = vi.fn();
    render(<SettingsOverlay onClose={onClose} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });
});
