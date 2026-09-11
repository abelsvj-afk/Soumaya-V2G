import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Regression test for a real production crash: "Cannot read properties of null
 * (reading 'events')". Root cause (confirmed by reading Phaser's own source —
 * SceneManager.add()'s JSDoc: "The added Scene, if it was added immediately,
 * otherwise null"): `game.scene.add()` returns null until the SceneManager has
 * booted, and Phaser's boot is asynchronous — calling `.add()` synchronously
 * right after `new Phaser.Game()` hit that null case on every real page load.
 * The fix waits for `Phaser.Core.Events.READY` before calling `.add()`. This
 * test simulates Phaser's real timing (READY fires on a later tick, not
 * synchronously) with a fake Game, without needing a real canvas/WebGL context
 * (unavailable in this sandbox — see CLAUDE.md).
 */
let readyCallback: (() => void) | null = null;
const sceneAdd = vi.fn();
const gameDestroy = vi.fn();

vi.mock("phaser", () => {
  class FakeGame {
    events = {
      once: (_event: string, cb: () => void) => {
        readyCallback = cb;
      },
    };
    scene = { add: sceneAdd };
    destroy = gameDestroy;
  }
  return {
    default: {
      AUTO: 0,
      Core: { Events: { READY: "ready" } },
      Scale: { FIT: "FIT", RESIZE: "RESIZE", CENTER_BOTH: "CENTER_BOTH" },
      Game: FakeGame,
    },
  };
});

vi.mock("./scenes/ExteriorScene.js", () => ({
  ExteriorScene: class FakeExteriorScene {},
  TILE_SIZE: 32,
}));

vi.mock("./data/loadWorldSnapshot.js", () => ({
  loadWorldSnapshot: vi.fn().mockResolvedValue({
    creatures: [],
    bank: { rows: [], safeToSpendCents: 0 },
    graph: { nodes: [], links: [] },
    fuel: null,
    streak: null,
  }),
  greetCreature: vi.fn(),
}));

vi.mock("../api/client.js", () => ({ ingestText: vi.fn() }));
vi.mock("../api/http.js", () => ({ getSpaceId: () => "space-1" }));

describe("OverworldRoot Phaser boot sequencing", () => {
  beforeEach(() => {
    readyCallback = null;
    sceneAdd.mockReset();
    gameDestroy.mockReset();
  });

  it("does not call scene.add() until Phaser's READY event fires", async () => {
    const { OverworldRoot } = await import("./OverworldRoot.js");
    render(<OverworldRoot />);
    expect(sceneAdd).not.toHaveBeenCalled();
    expect(readyCallback).not.toBeNull();
  });

  it("calls scene.add() once READY fires, and wires up its events without crashing", async () => {
    const on = vi.fn();
    sceneAdd.mockReturnValue({ events: { on } });
    const { OverworldRoot } = await import("./OverworldRoot.js");
    render(<OverworldRoot />);
    readyCallback?.();
    await waitFor(() => expect(sceneAdd).toHaveBeenCalledTimes(1));
    expect(on).toHaveBeenCalledWith("enter-place", expect.any(Function));
    expect(on).toHaveBeenCalledWith("enter-grass", expect.any(Function));
    expect(on).toHaveBeenCalledWith("greet-creature", expect.any(Function));
  });

  it("shows a visible, retryable error instead of crashing if scene.add() ever returns null", async () => {
    sceneAdd.mockReturnValue(null);
    const { OverworldRoot } = await import("./OverworldRoot.js");
    render(<OverworldRoot />);
    readyCallback?.();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
