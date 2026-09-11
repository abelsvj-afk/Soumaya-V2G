import Phaser from "phaser";
import type { InputBus, InputEvent } from "../engine/input.js";
import {
  completeMove,
  createMovementState,
  tryMove,
  type MovementGrid,
  type MovementState,
} from "../engine/movement.js";
import { prefersReducedMotion } from "../../lib/motion.js";

export const TILE_SIZE = 32;

export interface ProofSceneConfig {
  inputBus: InputBus;
  grid: MovementGrid;
  start: { x: number; y: number };
}

/**
 * Stage 1 "engine shell" proof map (roadmap.md item 1): grid movement + collision +
 * camera follow against a static, placeholder tile map — deliberately no API calls yet.
 * Real tile/sprite art and real API-backed content land with the vertical slice
 * (roadmap.md items 3+); this scene only proves the movement/input/camera plumbing.
 *
 * Collision is the pure `MovementGrid.isPassable` check from engine/movement.ts, not
 * Phaser's arcade-physics tilemap collider — grid movement here is a manual tile-to-tile
 * tween, so there's no physics body to collide; this keeps the whole rule testable
 * without a browser (see engine/movement.test.ts), matching architecture.md's test plan.
 */
export class ProofScene extends Phaser.Scene {
  private grid!: MovementGrid;
  private inputBus!: InputBus;
  private movement!: MovementState;
  private player!: Phaser.GameObjects.Rectangle;
  private unsubscribe: (() => void) | null = null;
  private keys!: Partial<Record<string, Phaser.Input.Keyboard.Key>>;

  constructor() {
    super("proof-scene");
  }

  init(config: ProofSceneConfig): void {
    this.grid = config.grid;
    this.inputBus = config.inputBus;
    this.movement = createMovementState(config.start);
  }

  create(): void {
    const gfx = this.add.graphics();
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const passable = this.grid.isPassable(x, y);
        gfx.fillStyle(passable ? 0x1c2540 : 0x3a2233, 1);
        gfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }

    this.player = this.add.rectangle(
      this.movement.position.x * TILE_SIZE + TILE_SIZE / 2,
      this.movement.position.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.6,
      TILE_SIZE * 0.6,
      0xffd166,
    );

    const worldWidth = this.grid.width * TILE_SIZE;
    const worldHeight = this.grid.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    // Grid-snapped follow with light smoothing; instant (no lerp) under reduced-motion
    // so there's no camera pan/glide to fight the accessibility non-negotiable.
    const lerp = prefersReducedMotion() ? 1 : 0.18;
    this.cameras.main.startFollow(this.player, true, lerp, lerp);

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") ?? {};
    this.unsubscribe = this.inputBus.subscribe((event) => this.handleInput(event));
  }

  private handleInput(event: InputEvent): void {
    if (event.type !== "move") return;
    const result = tryMove(this.movement, event.direction, this.grid);
    this.movement = result.state;
    if (!result.moved) return;

    const targetX = result.state.position.x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = result.state.position.y * TILE_SIZE + TILE_SIZE / 2;

    if (prefersReducedMotion()) {
      this.player.setPosition(targetX, targetY);
      this.movement = completeMove(this.movement);
      return;
    }

    this.tweens.add({
      targets: this.player,
      x: targetX,
      y: targetY,
      duration: 140,
      ease: "Linear",
      onComplete: () => {
        this.movement = completeMove(this.movement);
      },
    });
  }

  update(): void {
    const held = (...names: string[]) => names.some((n) => this.keys[n]?.isDown);
    const direction = held("UP", "W")
      ? "up"
      : held("DOWN", "S")
        ? "down"
        : held("LEFT", "A")
          ? "left"
          : held("RIGHT", "D")
            ? "right"
            : null;
    if (direction) this.inputBus.emit({ type: "move", direction });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
