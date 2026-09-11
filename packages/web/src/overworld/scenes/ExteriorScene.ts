import Phaser from "phaser";
import type { InputBus, InputEvent } from "../engine/input.js";
import { completeMove, createMovementState, tryMove, type MovementState } from "../engine/movement.js";
import { tileInFront } from "../engine/interact.js";
import { prefersReducedMotion } from "../../lib/motion.js";
import type { CreatureEntity } from "../types.js";
import { hangarKeys, trailColorHex } from "../data/hangarOptions.js";
import {
  allPlaces,
  attendantPosts,
  doorPlaceAt,
  isGrassTile,
  isMovementPassable,
  objectPlaceAt,
  placeById,
  PLAYER_SPAWN,
  REGION_HEIGHT,
  REGION_WIDTH,
  type AttendantPost,
  type Place,
  type PlaceId,
} from "./regionLayout.js";
import {
  ATLAS_TILE_PX,
  attendantFrameForPlace,
  creatureFrameForType,
  grassFrameFor,
  idleBobDelayMs,
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
  /** Used only to read the Hangar's saved "Cosmic Trail" color (localStorage) — see
   *  readTrailColor()/refreshTrailColor(). Never used for anything space-scoped/networked
   *  here; real space-scoped API calls stay in OverworldRoot.tsx/api/client.ts. */
  spaceId: string;
}

interface CreatureSprite {
  entity: CreatureEntity;
  container: Phaser.GameObjects.Container;
  /** A few nearby tiles the creature roams between (its "selected area" — never the whole
   *  map): its home tile plus whichever orthogonal neighbors are actually open ground. */
  cage: Array<{ x: number; y: number }>;
  cageIndex: number;
  /** Where the creature is RIGHT NOW, for interact/greet hit-testing — the home tile
   *  (`entity.tile`) stays a fixed placement anchor; this is what "facing it" actually checks. */
  currentTile: { x: number; y: number };
  roamTimer: Phaser.Time.TimerEvent | null;
}

interface AttendantSprite {
  post: AttendantPost;
  image: Phaser.GameObjects.Image;
  atA: boolean;
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
  private attendantSprites: AttendantSprite[] = [];
  private player!: Phaser.GameObjects.Sprite;
  /** Idle "breathing" loop, running whenever the player isn't mid-step — stopped/restarted
   *  around each move so it never fights the step-bounce tween (see startIdleBob/stopIdleBob). */
  private idleTween: Phaser.Tweens.Tween | null = null;
  private keys!: Partial<Record<string, Phaser.Input.Keyboard.Key>>;
  private unsubscribe: (() => void) | null = null;
  private wasOnGrass = false;
  private created = false;
  private spaceId = "default";
  /** The Hangar's saved "Cosmic Trail" color — read at create() and whenever
   *  refreshTrailColor() is called (OverworldRoot.tsx does this when the Hangar overlay
   *  closes, so a freshly-chosen trail shows up immediately without a scene reload). */
  private trailColor = trailColorHex("blue");
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
    this.spaceId = config.spaceId;
    this.movement = createMovementState(PLAYER_SPAWN);
    this.wasOnGrass = isGrassTile(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.created = false;
  }

  /** Re-reads the Hangar's saved trail color from localStorage — call after the Hangar
   *  overlay closes so a freshly-chosen trail takes effect immediately. */
  refreshTrailColor(): void {
    this.trailColor = this.readTrailColor();
  }

  private readTrailColor(): number {
    const saved = localStorage.getItem(hangarKeys(this.spaceId).trail) || "blue";
    return trailColorHex(saved);
  }

  preload(): void {
    // Kenney "Tiny Town" + "Tiny Dungeon" (CC0) — see tileAtlas.ts and public/CREDITS.md.
    this.load.spritesheet(TILE_ATLAS_KEY, TILE_ATLAS_URL, {
      frameWidth: ATLAS_TILE_PX,
      frameHeight: ATLAS_TILE_PX,
    });
  }

  create(): void {
    this.trailColor = this.readTrailColor();
    this.drawGround();
    this.spawnAttendants();
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
    this.startIdleBob();
    this.created = true;
  }

  /** Gentle "breathing" loop for the player while standing still — stopped before every step
   *  (stopIdleBob) so it never fights the move/squash tween, restarted once the step lands.
   *  A no-op under reduced motion, same as every other decorative loop in this scene. */
  private startIdleBob(): void {
    if (prefersReducedMotion()) return;
    this.player.setScale(SPRITE_SCALE);
    this.idleTween = this.tweens.add({
      targets: this.player,
      scaleY: SPRITE_SCALE * 1.05,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private stopIdleBob(): void {
    this.idleTween?.stop();
    this.idleTween = null;
    this.player.setScale(SPRITE_SCALE);
  }

  /** A small fading dot left at the player's current tile on every step, tinted with the
   *  Hangar's saved "Cosmic Trail" cosmetic (readTrailColor/refreshTrailColor) — the pilot's
   *  chosen trail now actually shows up while walking, not just as a menu selection. Motion
   *  trails are a classic reduced-motion-off case, so this is a no-op under it. */
  private spawnTrailParticle(): void {
    if (prefersReducedMotion()) return;
    const dot = this.add.circle(this.player.x, this.player.y, TILE_SIZE * 0.16, this.trailColor, 0.55);
    dot.setDepth(9); // just under the player (depth 10), above ground/buildings.
    this.tweens.add({
      targets: dot,
      alpha: 0,
      scale: 0.3,
      duration: 350,
      ease: "Quad.easeIn",
      onComplete: () => dot.destroy(),
    });
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
      const img = this.tileAt(place.tile.x, place.tile.y, objectFrameForPlace(place.id), 1);
      // Only Soumaya gets an idle bob — she's a companion, not a fixture; the Bulletin Board
      // is a signpost and correctly stays still.
      if (place.id === "soumaya" && !prefersReducedMotion()) {
        this.tweens.add({
          targets: img,
          y: img.y - TILE_SIZE * 0.08,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    // Every place gets a readable name plate, not a bare emoji glyph at 14px — small emoji
    // at this scale reads as an ambiguous smudge (real user feedback: "buildings should have
    // names on them, not emojis"). Doors get theirs above the roofline; standalone objects
    // get theirs just above their single tile.
    for (const place of allPlaces()) {
      if (place.kind === "door") {
        const { x0, x1, y0 } = place.footprint;
        const centerX = ((x0 + x1 + 1) / 2) * TILE_SIZE;
        this.addNameplate(centerX, y0 * TILE_SIZE - 2, place.label);
      } else {
        this.addNameplate(place.tile.x * TILE_SIZE + TILE_SIZE / 2, place.tile.y * TILE_SIZE - 2, place.label);
      }
    }
  }

  /** One small NPC per attendant post (regionLayout.ts's attendantPosts — a few per building,
   *  never just one), pacing back and forth between its post's two tiles on a slow, desynced
   *  timer. Purely decorative "the town is staffed and alive" flavor, not interactive/talkable —
   *  a no-op loop under reduced motion (they still stand at their post, just don't pace). */
  private spawnAttendants(): void {
    let index = 0;
    for (const post of attendantPosts()) {
      const frame = attendantFrameForPlace(post.placeId);
      const image = this.tileAt(post.a.x, post.a.y, frame, 1);
      const sprite: AttendantSprite = { post, image, atA: true };
      this.attendantSprites.push(sprite);
      if (!prefersReducedMotion()) {
        // Reuse the same deterministic hash creatures use for their own desync — the
        // attendant index is a fine seed since it's already unique and stable per post.
        const offset = idleBobDelayMs(index++);
        this.time.addEvent({ delay: 2600 + offset, loop: true, callback: () => this.paceAttendant(sprite) });
      }
    }
  }

  private paceAttendant(sprite: AttendantSprite): void {
    sprite.atA = !sprite.atA;
    const target = sprite.atA ? sprite.post.a : sprite.post.b;
    this.tweens.add({
      targets: sprite.image,
      x: target.x * TILE_SIZE + TILE_SIZE / 2,
      y: target.y * TILE_SIZE + TILE_SIZE / 2,
      duration: 900,
      ease: "Sine.easeInOut",
    });
  }

  /** A small readable name above a place — anchored bottom-center so it floats just above
   *  whatever it labels, regardless of the building's/object's own height. */
  private addNameplate(x: number, y: number, text: string): void {
    const plate = this.add.text(x, y, text, {
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "#00000099",
      padding: { x: 4, y: 2 },
    });
    plate.setOrigin(0.5, 1);
    plate.setDepth(3);
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
      const home = entity.tile;
      const container = this.add.container(home.x * TILE_SIZE + TILE_SIZE / 2, home.y * TILE_SIZE + TILE_SIZE / 2);
      this.paintCreature(container, entity);
      const sprite: CreatureSprite = {
        entity,
        container,
        cage: this.buildRoamCage(home),
        cageIndex: 0,
        currentTile: home,
        roamTimer: null,
      };
      this.creatureSprites.set(entity.nodeId, sprite);
      this.startRoaming(sprite);
    }
    for (const [id, sprite] of this.creatureSprites) {
      if (!seen.has(id)) {
        sprite.roamTimer?.remove();
        sprite.container.destroy();
        this.creatureSprites.delete(id);
      }
    }
  }

  /** A creature's "selected area" (never the whole map) — its home tile plus whichever
   *  orthogonal neighbors are actually open ground, so it can never roam through a wall,
   *  another building, or off the edge of the region. */
  private buildRoamCage(home: { x: number; y: number }): Array<{ x: number; y: number }> {
    const candidates = [
      home,
      { x: home.x + 1, y: home.y },
      { x: home.x - 1, y: home.y },
      { x: home.x, y: home.y + 1 },
      { x: home.x, y: home.y - 1 },
    ];
    return candidates.filter((t) => isMovementPassable(t.x, t.y));
  }

  /** Wanders the creature between its cage tiles on a slow, desynced timer — a no-op (stays
   *  put at home) under reduced motion, same as every other decorative loop in this scene. */
  private startRoaming(sprite: CreatureSprite): void {
    if (prefersReducedMotion()) return;
    if (sprite.cage.length <= 1) return; // nowhere else open to roam to — stay put, still fine
    const period = 3200 + idleBobDelayMs(sprite.entity.nodeId) * 2;
    sprite.roamTimer = this.time.addEvent({ delay: period, loop: true, callback: () => this.stepRoam(sprite) });
  }

  private stepRoam(sprite: CreatureSprite): void {
    sprite.cageIndex = (sprite.cageIndex + 1) % sprite.cage.length;
    const next = sprite.cage[sprite.cageIndex];
    if (!next) return;
    sprite.currentTile = next;
    this.tweens.add({
      targets: sprite.container,
      x: next.x * TILE_SIZE + TILE_SIZE / 2,
      y: next.y * TILE_SIZE + TILE_SIZE / 2,
      duration: 550,
      ease: "Sine.easeInOut",
    });
  }

  private paintCreature(container: Phaser.GameObjects.Container, entity: CreatureEntity): void {
    // Stop any tween left over from a previous paint of this same creature before its old
    // sprite is destroyed below — a stale tween otherwise keeps ticking against a dead target.
    this.tweens.killTweensOf(container.getAll());
    container.removeAll(true);
    // FR10 — dim state is a real alpha change PLUS a non-color "?" marker; never color-only.
    const alpha = entity.isDue ? 0.45 : 1;
    const body = this.add.sprite(0, 0, TILE_ATLAS_KEY, creatureFrameForType(entity.type));
    body.setScale(SPRITE_SCALE * 0.8);
    body.setAlpha(alpha);
    container.add(body);
    // A gentle, desynced idle bob — the town reads as alive, not a static screenshot.
    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: body,
        y: -TILE_SIZE * 0.08,
        duration: 900,
        delay: idleBobDelayMs(entity.nodeId),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
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
    this.stopIdleBob();
    this.spawnTrailParticle();
    const finish = () => {
      this.movement = completeMove(this.movement);
      this.afterStep(x, y);
      this.startIdleBob();
    };
    if (prefersReducedMotion()) {
      this.player.setPosition(targetX, targetY);
      finish();
      return;
    }
    this.tweens.add({ targets: this.player, x: targetX, y: targetY, duration: 140, ease: "Linear", onComplete: finish });
    // A quick squash-and-recover per step ("hop") — game-feel juice, not gameplay state.
    this.tweens.add({
      targets: this.player,
      scaleX: SPRITE_SCALE * 0.85,
      scaleY: SPRITE_SCALE * 1.15,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
    });
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
    // Checked against currentTile (where the creature actually is right now), not its fixed
    // placement anchor — otherwise a mid-roam creature couldn't be greeted where it's standing.
    for (const sprite of this.creatureSprites.values()) {
      if (sprite.currentTile.x === front.x && sprite.currentTile.y === front.y) {
        this.events.emit("greet-creature", sprite.entity.nodeId);
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
    this.idleTween?.stop();
    this.idleTween = null;
    for (const sprite of this.creatureSprites.values()) sprite.roamTimer?.remove();
    this.creatureSprites.clear();
    this.attendantSprites = [];
  }
}
