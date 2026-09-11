import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AuthGate } from "./AuthGate.js";

vi.mock("../api/client.js", () => ({
  currentSpace: vi.fn(),
  logoutSpace: vi.fn(),
}));
vi.mock("./OverworldRoot.js", () => ({
  OverworldRoot: () => <div>THE OVERWORLD</div>,
}));

describe("AuthGate (replaces App.tsx's boot/auth gate now that the galaxy is gone)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading state before the auth check resolves", async () => {
    const { currentSpace } = await import("../api/client.js");
    let resolve!: (v: unknown) => void;
    (currentSpace as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<AuthGate />);
    expect(screen.getByText(/Aligning the stars/)).toBeTruthy();
    resolve(null);
    await waitFor(() => expect(screen.queryByText(/Aligning the stars/)).toBeNull());
  });

  it("shows LoginScreen when no space is open — the app is never unreachable for a signed-out user", async () => {
    const { currentSpace } = await import("../api/client.js");
    (currentSpace as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    render(<AuthGate />);
    await waitFor(() => expect(screen.getByLabelText(/gamer tag/i)).toBeTruthy());
  });

  it("mounts the Overworld once a space is open", async () => {
    const { currentSpace } = await import("../api/client.js");
    (currentSpace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1", name: "Test Brain" });
    render(<AuthGate />);
    await waitFor(() => expect(screen.getByText("THE OVERWORLD")).toBeTruthy());
  });

  it("logging out clears the space and returns to LoginScreen", async () => {
    const { currentSpace, logoutSpace } = await import("../api/client.js");
    (currentSpace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1", name: "Test Brain" });
    render(<AuthGate />);
    await waitFor(() => screen.getByText("THE OVERWORLD"));
    fireEvent.click(screen.getByText(/Log out/));
    expect(logoutSpace).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/gamer tag/i)).toBeTruthy());
  });
});
