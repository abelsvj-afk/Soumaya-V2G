import Phaser from "phaser";
import type { InputBus, InputEvent } from "../engine/input.js";
import { completeMove, createMovementState, tryMove, type MovementState } from "../engine/movement.js";
import { tileInFront } from "../engine/interact.js";
import { prefersReducedMotion } from "../engine/reducedMotion.js";
import type { CreatureEntity } from "../types.js";
import {
  BANK_DOOR,
  isBankBuildingTile,
  isBankDoor,
  isGrassTile,
  isMovementPassable,
  PLAYER_SPAWN,
  REGION_HEIGHT,
  REGION_WIDTH,
} from "./regionLayout.js";

export const TILE_SIZE = 32;

export interface ExteriorSceneConfig {
  inputBus: InputBus;
  creatures: CreatureEntity[];
}

interface CreatureSprite {
  entity: CreatureEntity;
  container: Phaser.GameObjects.Container;
}

/**
 * FR1-FR12's exterior region: the Money-region shell (grid movement, the Bank door warp,
 * the tall-grass capture trigger) plus real creatures placed via the adapter layer. This
 * scene renders/consumes data handed to it — it never fetches, so it has no opinion about
 * loading/error states (that's OverworldRoot.tsx, per ux-design.md).
 *
 * Emitted events (consumed by OverworldRoot.tsx):
 *  - "enter-bank"              — player stepped on the Bank door tile.
 *  - "enter-grass"             — player stepped INTO the grass zone (edge-triggered once).
 *  - "greet-creature" (nodeId) — player pressed interact facing a creature.
 */
export class ExteriorScene extends Phaser.Scene {
  private inputBus!: InputBus;
  private movement!: MovementState;
  private pendingCreatures: CreatureEntity[] = [];
  private creatureSprites = new Map<number, CreatureSprite>();
  private player!: Phaser.GameObjects.Rectangle;
  private keys!: Partial<Record<string, Phaser.Input.Keyboard.Key>>;
  private unsubscribe: (() => void) | null = null;
  private wasOnGrass = false;
  private created = false;
  /** True while a React overlay (Bank/Capture/greet dialogue) owns input focus — set by
   *  OverworldRoot.tsx so a keypress typed into a textarea can't also walk the player. */
  private paused = false;

  constructor() {
    super("exterior-scene");
  }

  init(config: ExteriorSceneConfig): void {
    this.inputBus = config.inputBus;
    this.pendingCreatures = config.creatures;
    this.movement = createMovementState(PLAYER_SPAWN);
    this.wasOnGrass = isGrassTile(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.created = false;
  }

  create(): void {
    this.drawGround();
    this.renderCreatures(this.pendingCreatures);

    this.player = this.add.rectangle(
      this.movement.position.x * TILE_SIZE + TILE_SIZE / 2,
      this.movement.position.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.6,
      TILE_SIZE * 0.6,
      0xffd166,
    );
    this.player.setDepth(10);

    const worldWidth = REGION_WIDTH * TILE_SIZE;
    const worldHeight = REGION_HEIGHT * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    const lerp = prefersReducedMotion() ? 1 : 0.18;
    this.cameras.main.startFollow(this.player, true, lerp, lerp);

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER") ?? {};
    this.unsubscribe = this.inputBus.subscribe((event) => this.handleInput(event));
    this.created = true;
  }

  private drawGround(): void {
    const gfx = this.add.graphics();
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        let color = 0x1c2540; // open ground (placeholder art — Stage 1 has no tile assets yet)
        if (isBankBuildingTile(x, y)) color = isBankDoor(x, y) ? 0xd1a054 : 0x5a4632;
        else if (isGrassTile(x, y)) color = 0x2f5233;
        gfx.fillStyle(color, 1);
        gfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }

  /**
   * Called by OverworldRoot.tsx on initial load and after every reconciliation (post-greet,
   * post-capture) — the scene never re-derives dim/vivid state itself, only paints whatever
   * the adapter layer already computed from the real API response.
   */
  setCreatures(creatures: CreatureEntity[]): void {
    this.pendingCreatures = creatures;
    if (this.created) this.renderCreatures(creatures);
  }

  private renderCreatures(creatures: CreatureEntity[]): void {
    const seen = new Set<number>();
    for (const entity of creatures) {
      if (!entity.tile) continue; // didn't fit on the grid this pass (placement.ts — never an error)
      seen.add(entity.nodeId);
      const existing = this.creatureSprites.get(entity.nodeId);
      if (existing) {
        existing.entity = entity;
        this.paintCreature(existing.container, entity);
        continue;
      }
      const container = this.add.container(
        entity.tile.x * TILE_SIZE + TILE_SIZE / 2,
        entity.tile.y * TILE_SIZE + TILE_SIZE / 2,
      );
      this.paintCreature(container, entity);
      this.creatureSprites.set(entity.nodeId, { entity, container });
    }
    for (const [id, sprite] of this.creatureSprites) {
      if (!seen.has(id)) {
        sprite.container.destroy();
        this.creatureSprites.delete(id);
      }
    }
  }

  private paintCreature(container: Phaser.GameObjects.Container, entity: CreatureEntity): void {
    container.removeAll(true);
    // FR10 — dim state is a real alpha change PLUS a non-color "?" marker; never color-only.
    const alpha = entity.isDue ? 0.45 : 1;
    const body = this.add.circle(0, 0, TILE_SIZE * 0.3, 0x8ecae6, alpha);
    container.add(body);
    if (entity.isDue) {
      const marker = this.add.text(0, -TILE_SIZE * 0.45, "?", { fontSize: "14px", color: "#ffffff" });
      marker.setOrigin(0.5);
      container.add(marker);
    }
    const badge = this.add.text(TILE_SIZE * 0.22, TILE_SIZE * 0.22, entity.rarity.badge, { fontSize: "10px" });
    badge.setOrigin(0.5);
    container.add(badge);
  }

  /** Called by OverworldRoot.tsx whenever a React overlay opens/closes. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private handleInput(event: InputEvent): void {
    if (this.paused) return;
    if (event.type === "interact") {
      this.handleInteract();
      return;
    }
    const result = tryMove(this.movement, event.direction, {
      width: REGION_WIDTH,
      height: REGION_HEIGHT,
      isPassable: isMovementPassable,
    });
    this.movement = result.state;
    if (!result.moved) return;

    const { x, y } = result.state.position;
    const targetX = x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = y * TILE_SIZE + TILE_SIZE / 2;
    const finish = () => {
      this.movement = completeMove(this.movement);
      this.afterStep(x, y);
    };
    if (prefersReducedMotion()) {
      this.player.setPosition(targetX, targetY);
      finish();
      return;
    }
    this.tweens.add({ targets: this.player, x: targetX, y: targetY, duration: 140, ease: "Linear", onComplete: finish });
  }

  private afterStep(x: number, y: number): void {
    if (isBankDoor(x, y)) {
      this.events.emit("enter-bank");
      return;
    }
    const onGrass = isGrassTile(x, y);
    if (onGrass && !this.wasOnGrass) this.events.emit("enter-grass");
    this.wasOnGrass = onGrass;
  }

  private handleInteract(): void {
    const front = tileInFront(this.movement.position, this.movement.facing);
    for (const { entity } of this.creatureSprites.values()) {
      if (entity.tile && entity.tile.x === front.x && entity.tile.y === front.y) {
        this.events.emit("greet-creature", entity.nodeId);
        return;
      }
    }
  }

  /** Called by OverworldRoot.tsx when the Bank interior overlay closes, to place the
   *  player back at the door tile (FR3 — leaving returns to the exact tile entered from). */
  returnToDoor(): void {
    this.movement = createMovementState(BANK_DOOR);
    this.player.setPosition(BANK_DOOR.x * TILE_SIZE + TILE_SIZE / 2, BANK_DOOR.y * TILE_SIZE + TILE_SIZE / 2);
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

    const space = this.keys.SPACE;
    const enter = this.keys.ENTER;
    const justPressed =
      (space && Phaser.Input.Keyboard.JustDown(space)) || (enter && Phaser.Input.Keyboard.JustDown(enter));
    if (justPressed) this.inputBus.emit({ type: "interact" });
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.creatureSprites.clear();
  }
}
