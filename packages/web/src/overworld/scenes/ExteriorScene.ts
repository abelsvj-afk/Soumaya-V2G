import Phaser from "phaser";
import type { InputBus, InputEvent } from "../engine/input.js";
import { completeMove, createMovementState, tryMove, type MovementState } from "../engine/movement.js";
import { tileInFront } from "../engine/interact.js";
import { prefersReducedMotion } from "../../lib/motion.js";
import type { CreatureEntity } from "../types.js";
import {
  allPlaces,
  doorPlaceAt,
  isGrassTile,
  isMovementPassable,
  objectPlaceAt,
  placeById,
  PLAYER_SPAWN,
  REGION_HEIGHT,
  REGION_WIDTH,
  type Place,
  type PlaceId,
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
 * The town exterior: grid movement, every building/object door-or-signpost from
 * scenes/regionLayout.ts, plus real creatures placed via the adapter layer. This scene
 * renders/consumes data handed to it — it never fetches, so it has no opinion about
 * loading/error states (that's OverworldRoot.tsx, per ux-design.md).
 *
 * Emitted events (consumed by OverworldRoot.tsx):
 *  - "enter-place" (placeId)   — player stepped on a door tile, or interacted facing an object tile.
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
  /** Tracked ourselves rather than read off Phaser's camera internals — true unless a
   *  flyToNode() pan is currently parking the camera away from the player. */
  private following = true;
  /** True while a React overlay owns input focus — set by OverworldRoot.tsx so a keypress
   *  typed into a textarea can't also walk the player. */
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
        let color = 0x1c2540; // open ground (placeholder art — Stage 1/2 have no tile assets yet)
        if (!isMovementPassable(x, y) && doorPlaceAt(x, y) === undefined && objectPlaceAt(x, y) === undefined) {
          color = 0x5a4632; // a building wall tile
        } else if (isGrassTile(x, y)) {
          color = 0x2f5233;
        }
        gfx.fillStyle(color, 1);
        gfx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
    // Doors and standalone objects each get their own tile + glyph so they read distinctly
    // from plain ground/wall — non-color labeling for every place, not just a tint.
    for (const place of allPlaces()) {
      const tile = place.kind === "door" ? place.door : place.tile;
      const color = place.kind === "door" ? 0xd1a054 : 0x7a5cff;
      gfx.fillStyle(color, 1);
      gfx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
      const label = this.add.text(tile.x * TILE_SIZE + TILE_SIZE / 2, tile.y * TILE_SIZE + TILE_SIZE / 2, place.glyph, {
        fontSize: "16px",
      });
      label.setOrigin(0.5);
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
    if (!this.following) this.resumeFollow();

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
    const door = doorPlaceAt(x, y);
    if (door) {
      this.events.emit("enter-place", door.id);
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
    const object = objectPlaceAt(front.x, front.y);
    if (object) this.events.emit("enter-place", object.id);
  }

  /** Called by OverworldRoot.tsx when a door-building's overlay closes, to place the player
   *  back at the exact door tile (FR3 — leaving returns to the exact tile entered from). */
  returnToDoor(placeId: PlaceId): void {
    const place = placeById(placeId) as Place & { door?: { x: number; y: number } };
    const door = place.door;
    if (!door) return;
    this.movement = createMovementState(door);
    this.player.setPosition(door.x * TILE_SIZE + TILE_SIZE / 2, door.y * TILE_SIZE + TILE_SIZE / 2);
  }

  /** Soumaya chat's cited-source "fly to" — pans the camera to a creature's tile without
   *  moving the player (2D equivalent of the galaxy's existing chat-citation navigation).
   *  Stops following the player so the pan isn't immediately fought/overridden; walking
   *  again re-triggers movement, which doesn't re-follow automatically — acceptable for a
   *  one-off "look over there" moment, not a permanent camera-lock. */
  flyToNode(nodeId: number): void {
    const sprite = this.creatureSprites.get(nodeId);
    if (!sprite?.entity.tile) return;
    const { x, y } = sprite.entity.tile;
    const targetX = x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = y * TILE_SIZE + TILE_SIZE / 2;
    this.cameras.main.stopFollow();
    this.following = false;
    if (prefersReducedMotion()) {
      this.cameras.main.centerOn(targetX, targetY);
    } else {
      this.cameras.main.pan(targetX, targetY, 500, "Sine.easeInOut");
    }
  }

  /** Resumes following the player (e.g. after a fly-to, once they move again). */
  resumeFollow(): void {
    this.following = true;
    this.cameras.main.startFollow(this.player, true, prefersReducedMotion() ? 1 : 0.18, prefersReducedMotion() ? 1 : 0.18);
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
