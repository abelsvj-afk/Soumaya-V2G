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
import {
  ATLAS_TILE_PX,
  creatureFrameForType,
  grassFrameFor,
  objectFrameForPlace,
  TILE_ATLAS_KEY,
  TILE_ATLAS_URL,
  TileFrame,
  wallFamilyForIndex,
} from "./tileAtlas.js";

export const TILE_SIZE = 32;
/** Source art is 16x16 — scale every sprite up to fill a TILE_SIZE cell. */
const SPRITE_SCALE = TILE_SIZE / ATLAS_TILE_PX;
/** The town square: a purely cosmetic dirt-path patch around the spawn/standalone objects —
 *  never touches collision, so it must stay inside `isMovementPassable`'s open ground. */
const PLAZA: { x0: number; y0: number; x1: number; y1: number } = { x0: 10, y0: 8, x1: 16, y1: 11 };
function inPlaza(x: number, y: number): boolean {
  return x >= PLAZA.x0 && x <= PLAZA.x1 && y >= PLAZA.y0 && y <= PLAZA.y1;
}

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
  private player!: Phaser.GameObjects.Sprite;
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

  preload(): void {
    // Kenney "Tiny Town" + "Tiny Dungeon" (CC0) — see tileAtlas.ts and public/CREDITS.md.
    this.load.spritesheet(TILE_ATLAS_KEY, TILE_ATLAS_URL, {
      frameWidth: ATLAS_TILE_PX,
      frameHeight: ATLAS_TILE_PX,
    });
  }

  create(): void {
    this.drawGround();
    this.renderCreatures(this.pendingCreatures);

    this.player = this.add.sprite(
      this.movement.position.x * TILE_SIZE + TILE_SIZE / 2,
      this.movement.position.y * TILE_SIZE + TILE_SIZE / 2,
      TILE_ATLAS_KEY,
      TileFrame.player,
    );
    this.player.setScale(SPRITE_SCALE);
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

  /** Places a single atlas-frame tile, scaled up from ATLAS_TILE_PX to fill a TILE_SIZE cell. */
  private tileAt(x: number, y: number, frame: number, depth = 0): Phaser.GameObjects.Image {
    const img = this.add.image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, TILE_ATLAS_KEY, frame);
    img.setScale(SPRITE_SCALE);
    img.setDepth(depth);
    return img;
  }

  private drawGround(): void {
    // Base ground layer: grass everywhere, with the FR8 grass-zone and the cosmetic town-square
    // path patch swapped in. Building interiors get painted over below (they're never walked on).
    for (let y = 0; y < REGION_HEIGHT; y++) {
      for (let x = 0; x < REGION_WIDTH; x++) {
        const frame = isGrassTile(x, y) ? TileFrame.grassZone : inPlaza(x, y) ? TileFrame.path : grassFrameFor(x, y);
        this.tileAt(x, y, frame);
      }
    }

    // Buildings: each door-place draws from one wall "family" so its door tile lines up
    // seamlessly with its own walls (tileAtlas.ts's wallFamilyForIndex/WallFamily).
    let doorIndex = 0;
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      const family = wallFamilyForIndex(doorIndex++);
      const { x0, y0, x1, y1 } = place.footprint;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const isDoor = place.door.x === x && place.door.y === y;
          const frame = isDoor ? family.door : y === y1 ? (x === x0 ? family.wallLeft : x === x1 ? family.wallRight : family.wall) : family.wall;
          this.tileAt(x, y, frame, 1);
        }
      }
    }

    // Standalone objects (Bulletin Board, Soumaya) — a distinct sprite each, tolerate-gracefully
    // fallback to a generic signpost for any future object id without dedicated art.
    for (const place of allPlaces()) {
      if (place.kind !== "object") continue;
      this.tileAt(place.tile.x, place.tile.y, objectFrameForPlace(place.id), 1);
    }

    // Every place still gets its glyph label on top — non-color labeling, not just new art.
    for (const place of allPlaces()) {
      const tile = place.kind === "door" ? place.door : place.tile;
      const label = this.add.text(tile.x * TILE_SIZE + TILE_SIZE / 2, tile.y * TILE_SIZE + TILE_SIZE * 0.2, place.glyph, {
        fontSize: "14px",
      });
      label.setOrigin(0.5);
      label.setDepth(2);
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
    const body = this.add.sprite(0, 0, TILE_ATLAS_KEY, creatureFrameForType(entity.type));
    body.setScale(SPRITE_SCALE * 0.8);
    body.setAlpha(alpha);
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
