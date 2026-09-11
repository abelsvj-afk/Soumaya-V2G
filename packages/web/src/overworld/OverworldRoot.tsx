import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { InputBus } from "./engine/input.js";
import type { MovementGrid } from "./engine/movement.js";
import { ProofScene, TILE_SIZE, type ProofSceneConfig } from "./scenes/ProofScene.js";
import { TouchControls } from "./ui/TouchControls.js";

/**
 * Stage 1 engine-shell proof map (roadmap.md item 1) — a small static grid with one
 * placeholder blocked tile, just to prove movement/collision/camera-follow work end to
 * end. Real content (Money region, Bank interior, real creatures) replaces this in the
 * vertical-slice work (roadmap.md items 3+); this component intentionally makes zero
 * API calls.
 */
const PROOF_GRID: MovementGrid = {
  width: 12,
  height: 9,
  isPassable: (x, y) => !(x === 5 && y === 4),
};

/**
 * Mounts the overworld's Phaser game. Additive per docs/overworld/decisions.md D1/D6:
 * this component is only ever rendered behind an explicit opt-in (see main.tsx) during
 * the staged-replacement period, so the existing 3D galaxy is provably unaffected.
 */
export function OverworldRoot() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputBusRef = useRef(new InputBus());

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent,
      width: PROOF_GRID.width * TILE_SIZE,
      height: PROOF_GRID.height * TILE_SIZE,
      backgroundColor: "#0c0e1a",
      pixelArt: true,
      scene: [ProofScene],
    };
    const game = new Phaser.Game(config);
    const sceneConfig: ProofSceneConfig = {
      inputBus: inputBusRef.current,
      grid: PROOF_GRID,
      start: { x: 1, y: 1 },
    };
    game.scene.start("proof-scene", sceneConfig);

    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <div ref={containerRef} data-testid="overworld-canvas-root" />
      <TouchControls onEvent={(event) => inputBusRef.current.emit(event)} />
    </div>
  );
}
