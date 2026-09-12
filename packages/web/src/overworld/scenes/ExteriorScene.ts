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
  isNpcPathPassable,
  objectPlaceAt,
  placeById,
  PLAYER_SPAWN,
  REGION_HEIGHT,
  REGION_WIDTH,
  townHallMeetingSlots,
  type AttendantPost,
  type DoorPlace,
  type ObjectPlace,
  type Place,
  type PlaceId,
} from "./regionLayout.js";
import { findPath } from "../engine/pathfinding.js";
import type { GridPosition, MovementGrid } from "../engine/movement.js";
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
  workIconForPlace,
} from "./tileAtlas.js";
import { allBuildingSprites, buildingSpriteForPlace } from "./buildingSprites.js";
import { asSocietyNpcId, dialogueFor, npcProfile, type SocietyNpcId } from "../data/npcDialogue.js";
import {
  armedItemId,
  isTileFreeForPlacement,
  placeArmedItem,
  placedItems,
  PLACEABLE_ITEMS,
  type PlacedItem,
} from "../data/townBuilder.js";
import { scheduleStateAt, type ScheduleState } from "../data/npcSchedule.js";
import { bumpRelationship, relationshipCount, relationshipTier } from "../data/npcRelationships.js";
import { buildingNeglect, isNeglected } from "../data/buildingNeglect.js";
import { loadUnlocked } from "../../components/achievements.js";

export const TILE_SIZE = 32;
/** Source art is 16x16 — scale every sprite up to fill a TILE_SIZE cell. */
const SPRITE_SCALE = TILE_SIZE / ATLAS_TILE_PX;
/** Real cross-town paths measured 40-50 tiles for opposite corners (npc-autonomy.md's own
 *  reproduction) — at the player's own 140ms/tile that's 6-7 real seconds one-way, too slow for
 *  a background decorative walk. NPCs move faster per tile than the player deliberately does. */
const NPC_STEP_MS = 160;
/** The passability rule NPC travel uses — real walls/objects/bounds, but not other attendants'
 *  fixed posts (npc-autonomy.md decision #2). One frozen object reused everywhere it's needed. */
const NPC_PATH_GRID: MovementGrid = { width: REGION_WIDTH, height: REGION_HEIGHT, isPassable: isNpcPathPassable };
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
  /** NPC Society — the schedule state this sprite was last painted for, so the enter/exit
   *  transition (applySocietyState) only animates on an actual state CHANGE, not every tick.
   *  Undefined until the first society tick (spawnAttendants leaves every sprite at post.a).
   *  Kept up to date even while `atMeeting` is true (see tickSociety), so it always reflects
   *  the real underlying schedule even when that isn't currently being rendered. */
  societyState?: ScheduleState;
  /** NPC Autonomy round (docs/overworld/npc-autonomy.md) — how many off-duty outings this NPC
   *  has taken, used only to alternate Park/Market deterministically (never Math.random). */
  outingCount?: number;
  /** True while this sprite is away at a real Town Meeting gathering — tickSociety's normal
   *  per-tick rendering is suspended for exactly this sprite so the meeting's own walk/return
   *  tweens are never fought by a Working/Break/Home transition firing mid-trip. */
  atMeeting?: boolean;
}

/** Soumaya, the partner NPC — a real autonomous companion (Stage 2.17: restores the role she
 *  had in the deleted 3D galaxy, "flew around to all the memories"). A container (position) +
 *  inner body image (idle bob), the same split CreatureSprite already uses, so her wander tween
 *  and idle bob never fight over the same object's y property. */
interface SoumayaSprite {
  container: Phaser.GameObjects.Container;
  currentTile: GridPosition;
  /** True for the duration of a walk leg — guards against the wander timer starting a second
   *  leg before a real, possibly-long, town-wide walk has finished. */
  walking: boolean;
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
  /** NPC Society (docs/overworld/npc-society.md, rolled out to all 10 buildings by
   *  npc-economy.md) — one shared clock so every building's two attendants can be checked
   *  against EACH OTHER on the same tick, instead of drifting independently like the old
   *  decorative pacing timers did. Keyed per building so 10 buildings' interactions never
   *  interfere with each other. */
  private societyTickCount = 0;
  private societyBothOnBreak = new Map<PlaceId, boolean>();
  /** NPC Autonomy round — npcIds (post.npcId) currently mid-outing, so a real schedule
   *  transition or a Town Meeting call can cleanly interrupt one in flight (kill the in-progress
   *  walk tween) instead of fighting it. */
  private outingActive = new Set<string>();
  private soumaya: SoumayaSprite | null = null;
  /** Town Builder (docs/overworld/town-builder.md, task #65) — real player-placed decor, keyed
   *  by its persisted PlacedItem id so a single placement can be re-rendered without redrawing
   *  every other one. */
  private placedItemSprites = new Map<string, Phaser.GameObjects.Text>();
  /** Cycles through every door place in turn — deterministic, never Math.random, matching the
   *  rest of this scene's desync convention. She tours the whole town over time instead of an
   *  arbitrary open tile, which reads as "doing her rounds" rather than aimless wandering. */
  private soumayaTourIndex = 0;
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
    // Complete pre-made building illustrations, not a modular kit — see buildingSprites.ts.
    for (const sprite of allBuildingSprites()) this.load.image(sprite.key, sprite.url);
  }

  create(): void {
    this.trailColor = this.readTrailColor();
    this.drawGround();
    this.spawnAttendants();
    this.spawnSoumaya();
    this.renderPlacedItems();
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
    // The camera's own viewport size (not the world) — with Scale.RESIZE (OverworldRoot.tsx)
    // this is genuinely the device's screen, usually smaller than the 26x18-tile world, so
    // this is a real scrolling camera now, not a shrunk-to-fit picture of the whole map.
    this.cameras.main.setSize(this.scale.width, this.scale.height);
    this.scale.on("resize", this.handleResize, this);
    const lerp = prefersReducedMotion() ? 1 : 0.18;
    this.cameras.main.startFollow(this.player, true, lerp, lerp);

    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER") ?? {};
    this.unsubscribe = this.inputBus.subscribe((event) => this.handleInput(event));
    this.startIdleBob();
    this.created = true;
  }

  /** Keeps the camera's viewport matching the real device size as it changes — a rotation,
   *  a resized browser window, or a mobile browser's chrome showing/hiding. */
  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
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

    // Buildings: one complete pre-made illustration per door-place (buildingSprites.ts),
    // scaled to fill its footprint — real user feedback against the previous modular-tile
    // assembly ("that's not appropriate... find already made building assets").
    for (const place of allPlaces()) {
      if (place.kind !== "door") continue;
      const sprite = buildingSpriteForPlace(place.id);
      const { x0, y0, x1, y1 } = place.footprint;
      const width = (x1 - x0 + 1) * TILE_SIZE;
      const height = (y1 - y0 + 1) * TILE_SIZE;
      const image = this.add.image(x0 * TILE_SIZE + width / 2, y0 * TILE_SIZE + height / 2, sprite.key);
      image.setDisplaySize(width, height);
      image.setDepth(1);
    }

    // Standalone objects — the Bulletin Board is a real signpost and stays fixed here. Soumaya
    // is excluded: she's a real autonomous companion now (spawnSoumaya, Stage 2.17), drawn and
    // moved as her own dynamic sprite instead of a static ground-layer image.
    for (const place of allPlaces()) {
      if (place.kind !== "object" || place.id === "soumaya") continue;
      this.tileAt(place.tile.x, place.tile.y, objectFrameForPlace(place.id), 1);
    }

    // Every place gets a readable name plate, not a bare emoji glyph at 14px — small emoji
    // at this scale reads as an ambiguous smudge (real user feedback: "buildings should have
    // names on them, not emojis"). Doors get theirs above the roofline; standalone objects
    // get theirs just above their single tile. Soumaya is excluded — a moving companion reads
    // by her sprite, not a floating label anchored to a home tile she's no longer standing on;
    // creatures don't get nameplates for the same reason.
    for (const place of allPlaces()) {
      if (place.kind === "door") {
        const { x0, x1, y0 } = place.footprint;
        const centerX = ((x0 + x1 + 1) / 2) * TILE_SIZE;
        this.addNameplate(centerX, y0 * TILE_SIZE - 2, place.label);
      } else if (place.id !== "soumaya") {
        this.addNameplate(place.tile.x * TILE_SIZE + TILE_SIZE / 2, place.tile.y * TILE_SIZE - 2, place.label);
      }
    }
  }

  /** Soumaya's real, autonomous role in the town (Stage 2.17) — she's a companion, not a
   *  fixture: spawned at her home tile as a moving container+body sprite instead of the old
   *  static ground-layer image, with the same idle bob preserved on her inner body so wandering
   *  never fights it (container moves position, body only bobs a relative y offset). */
  private spawnSoumaya(): void {
    const home = (placeById("soumaya") as ObjectPlace).tile;
    const container = this.add.container(home.x * TILE_SIZE + TILE_SIZE / 2, home.y * TILE_SIZE + TILE_SIZE / 2);
    container.setDepth(1);
    const body = this.add.image(0, 0, TILE_ATLAS_KEY, objectFrameForPlace("soumaya"));
    body.setScale(SPRITE_SCALE);
    container.add(body);
    this.soumaya = { container, currentTile: home, walking: false };
    if (prefersReducedMotion()) return;
    this.tweens.add({ targets: body, y: -TILE_SIZE * 0.08, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.time.addEvent({ delay: 7000, loop: true, callback: () => this.tickSoumayaWander() });
  }

  /** Deterministically tours the town's real buildings, one leg per tick — "doing her rounds"
   *  rather than aimless wandering, and restores the autonomous role she had in the deleted 3D
   *  galaxy (she used to fly to every memory on her own; here she walks to every building).
   *  Skips silently (tolerate-gracefully, same as every other NPC pathing call in this scene)
   *  while a React overlay owns input focus, mid-leg already, or no route currently exists. */
  private tickSoumayaWander(): void {
    const soumaya = this.soumaya;
    if (!soumaya || this.paused || soumaya.walking) return;
    const doors = allPlaces().filter((p): p is DoorPlace => p.kind === "door");
    if (doors.length === 0) return;
    this.soumayaTourIndex = (this.soumayaTourIndex + 1) % doors.length;
    const destination = doors[this.soumayaTourIndex]!.door;
    const path = findPath(soumaya.currentTile, destination, NPC_PATH_GRID);
    if (!path) return;
    soumaya.walking = true;
    this.walkSoumayaPath(path, () => {
      soumaya.walking = false;
    });
  }

  /** Walks Soumaya's container along a real path tile-by-tile — a dedicated twin of walkPath
   *  (below) rather than a forced shared abstraction, since she moves a Container (position)
   *  while every other NPC sprite here moves a plain Image; keeping them separate means neither
   *  has to accommodate the other's shape. */
  private walkSoumayaPath(path: GridPosition[], onComplete?: () => void): void {
    const soumaya = this.soumaya;
    if (!soumaya) return;
    const last = path[path.length - 1];
    if (prefersReducedMotion() || path.length <= 1 || !last) {
      if (last) {
        soumaya.container.setPosition(last.x * TILE_SIZE + TILE_SIZE / 2, last.y * TILE_SIZE + TILE_SIZE / 2);
        soumaya.currentTile = last;
      }
      onComplete?.();
      return;
    }
    const steps = path.slice(1);
    const animateStep = (index: number): void => {
      if (index >= steps.length) {
        onComplete?.();
        return;
      }
      const tile = steps[index]!;
      this.tweens.add({
        targets: soumaya.container,
        x: tile.x * TILE_SIZE + TILE_SIZE / 2,
        y: tile.y * TILE_SIZE + TILE_SIZE / 2,
        duration: NPC_STEP_MS,
        ease: "Linear",
        onComplete: () => {
          soumaya.currentTile = tile;
          animateStep(index + 1);
        },
      });
    };
    animateStep(0);
  }

  /** Town Builder — draws every real placed item as a text glyph (this session's established
   *  convention for a marker with no dedicated atlas art, same as the "?" dim marker and the
   *  📢 meeting cue) at its persisted tile. Called once from create(); OverworldRoot.tsx calls
   *  `refreshPlacedItems()` after a real placement instead of a full scene reload. */
  private renderPlacedItems(): void {
    for (const placed of placedItems(this.spaceId)) this.paintPlacedItem(placed);
  }

  private paintPlacedItem(placed: PlacedItem): void {
    if (this.placedItemSprites.has(placed.id)) return; // already painted — placements never move
    const item = PLACEABLE_ITEMS.find((i) => i.id === placed.itemId);
    const glyph = this.add.text(
      placed.x * TILE_SIZE + TILE_SIZE / 2,
      placed.y * TILE_SIZE + TILE_SIZE / 2,
      item?.icon ?? "❔", // tolerate-gracefully: an unrecognized itemId still renders, never crashes
      { fontSize: "16px" },
    );
    glyph.setOrigin(0.5);
    glyph.setDepth(1);
    this.placedItemSprites.set(placed.id, glyph);
  }

  /** Re-reads real placed-item state and paints anything new — call after a successful
   *  placement (OverworldRoot.tsx) instead of reloading the whole scene. Idempotent: an
   *  already-painted placement is skipped by `paintPlacedItem`'s own guard. */
  refreshPlacedItems(): void {
    if (!this.created) return;
    this.renderPlacedItems();
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
      // The two Town Hall NPCs (NPC Society v1) are driven by the shared society clock below
      // instead — everyone else keeps the original independent-timer pacing + work icon.
      if (asSocietyNpcId(post.npcId)) continue;
      // Reuse the same deterministic hash creatures use for their own desync — the
      // attendant index is a fine seed since it's already unique and stable per post. Always
      // runs (even under reduced motion) — real user feedback: NPCs need to "do work... not
      // just walk back and forth", so the work-icon cue is the part that must never disappear;
      // only the walking half of it is decorative motion.
      const offset = idleBobDelayMs(index++);
      this.time.addEvent({ delay: 2600 + offset, loop: true, callback: () => this.attendantWorkTick(sprite) });
    }
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.tickSociety() });
    this.spawnOutingTimers();
  }

  /** NPC Autonomy round — one independent, desynced timer per society NPC that occasionally
   *  tries to send them on a real off-duty outing (Park or Market) while they're genuinely
   *  Home. Decoupled from the schedule's own short Home window on purpose (npc-autonomy.md
   *  decision #3) — a real round trip across town can take longer than Home lasts, so this
   *  just tries periodically and skips silently whenever the NPC isn't actually Home right now. */
  private spawnOutingTimers(): void {
    let index = 0;
    for (const sprite of this.attendantSprites) {
      if (!asSocietyNpcId(sprite.post.npcId)) continue;
      const offset = idleBobDelayMs(index++) * 30; // spreads the 0..900ms hash out to 0..27s
      const period = 25000 + offset; // roughly every 25-52 real seconds, desynced per NPC
      this.time.addEvent({ delay: period, loop: true, callback: () => this.maybeStartOuting(sprite) });
    }
  }

  /** NPC Society — the shared clock tick, now for every building's pair (npc-economy.md's
   *  rollout from Town Hall-only to all 10). For each society NPC: apply its Working/Break/Home
   *  enter-exit transition (applySocietyState), then per BUILDING, check whether its own two
   *  attendants are both on Break at once — if so, trigger their interaction, once per
   *  overlapping window, not once per tick. Working attendants flash their work icon from the
   *  door tile they've just entered (never nothing — "doing work", not just gone quiet). */
  private tickSociety(): void {
    this.societyTickCount += 1;
    const byPlace = new Map<PlaceId, Array<{ sprite: AttendantSprite; id: SocietyNpcId; state: ScheduleState }>>();
    for (const sprite of this.attendantSprites) {
      const id = asSocietyNpcId(sprite.post.npcId);
      if (!id) continue;
      const state = scheduleStateAt(id, this.societyTickCount);
      // A sprite away at a real Town Meeting keeps its OWN walk/return tweens running
      // uninterrupted (npc-autonomy.md) — the real schedule state is still tracked underneath
      // (restingTileFor reads it the moment they get back) but never rendered while they're away.
      if (sprite.atMeeting) {
        sprite.societyState = state;
      } else {
        this.applySocietyState(sprite, state);
      }
      const list = byPlace.get(sprite.post.placeId) ?? [];
      list.push({ sprite, id, state });
      byPlace.set(sprite.post.placeId, list);
    }

    for (const [placeId, entries] of byPlace) {
      const available = entries.filter((e) => !e.sprite.atMeeting);
      const onBreak = available.filter((e) => e.state === "break");
      const [first, second] = onBreak;
      const wasBothOnBreak = this.societyBothOnBreak.get(placeId) ?? false;
      if (first && second) {
        if (!wasBothOnBreak) {
          this.societyBothOnBreak.set(placeId, true);
          this.triggerNpcInteraction(first, second);
        }
      } else {
        this.societyBothOnBreak.set(placeId, false);
      }
      for (const entry of available) {
        if (entry.state === "working") this.showWorkIcon(entry.sprite);
      }
    }
  }

  /** The real doorway a society NPC's building enters/exits through. Attendants only ever
   *  exist at door-buildings (regionLayout.ts's attendantPosts), so this is never called for
   *  anything else — throwing on a mismatch surfaces a real bug instead of silently misplacing
   *  a sprite. */
  private doorTileFor(placeId: PlaceId): { x: number; y: number } {
    const place = placeById(placeId);
    if (place.kind !== "door") throw new Error(`${placeId} has no door — attendants only exist at door-buildings`);
    return place.door;
  }

  /** "Enter buildings when working, exit for break, and stay visible off duty too" (real user
   *  feedback reversed the original v1 behavior: NPCs shouldn't fade away just because they're
   *  not working — they have lives outside a job the same way the outing system already sends
   *  them out to Park/Market). Animates the transition exactly once per actual state CHANGE
   *  (sprite.societyState tracks what was last painted), never re-running every tick while a
   *  state holds. Working = walk to the door, then hidden (truly "gone inside" — the work icon
   *  still flashes from that same door position). Break AND Home both step out to their own post
   *  and stay visible — the two are visually the same at rest; what actually makes Home "a life
   *  outside work" is the outing system periodically sending them off to Park/Market, not a
   *  different resting pose. */
  private applySocietyState(sprite: AttendantSprite, state: ScheduleState): void {
    if (sprite.societyState === state) return;
    const firstPaint = sprite.societyState === undefined;
    sprite.societyState = state;
    // A real schedule transition always wins over an in-flight outing — kill its walk tween
    // (never fires the walk's own onComplete chain, so it can't fight this transition's own
    // tween on the same sprite.image) rather than letting the two compete.
    if (this.outingActive.delete(sprite.post.npcId)) {
      this.tweens.killTweensOf(sprite.image);
    }
    const door = this.doorTileFor(sprite.post.placeId);
    const doorX = door.x * TILE_SIZE + TILE_SIZE / 2;
    const doorY = door.y * TILE_SIZE + TILE_SIZE / 2;
    const postX = sprite.post.a.x * TILE_SIZE + TILE_SIZE / 2;
    const postY = sprite.post.a.y * TILE_SIZE + TILE_SIZE / 2;
    const reduced = prefersReducedMotion();

    if (state === "working") {
      sprite.image.setVisible(true);
      if (reduced || firstPaint) {
        sprite.image.setPosition(doorX, doorY);
        sprite.image.setVisible(false);
      } else {
        this.tweens.add({
          targets: sprite.image,
          x: doorX,
          y: doorY,
          duration: 500,
          ease: "Sine.easeInOut",
          onComplete: () => sprite.image.setVisible(false),
        });
      }
      return;
    }

    // break or home — both rest visibly at the attendant's own post (see the method comment for
    // why Home no longer fades to hidden).
    sprite.image.setVisible(true);
    if (reduced || firstPaint) {
      sprite.image.setPosition(postX, postY);
    } else {
      sprite.image.setPosition(doorX, doorY);
      this.tweens.add({ targets: sprite.image, x: postX, y: postY, duration: 500, ease: "Sine.easeInOut" });
    }
    this.applyNeglectVisual(sprite);
  }

  /** A neglected building's attendants render exactly like a neglected memory does — a real
   *  alpha change PLUS a non-color "?" marker, never color-only (buildingNeglect.ts reuses the
   *  same entropy math a creature's own dim state already comes from). Only painted while
   *  actually visible (Break or Home) — no point marking a sprite that's currently hidden
   *  (Working) anyway. */
  private applyNeglectVisual(sprite: AttendantSprite): void {
    const neglected = isNeglected(buildingNeglect(this.spaceId, sprite.post.placeId));
    sprite.image.setAlpha(neglected ? 0.45 : 1);
    if (neglected) this.showWorkIcon(sprite, "❓");
  }

  /** The tile a sprite is currently standing on/nearest to, derived from its own pixel position
   *  — used as a pathfinding start point for a sprite that might be anywhere (mid-outing,
   *  mid-meeting, or simply at its post), never assumed to be exactly at post.a. */
  private spriteTile(sprite: AttendantSprite): GridPosition {
    return {
      x: Math.round((sprite.image.x - TILE_SIZE / 2) / TILE_SIZE),
      y: Math.round((sprite.image.y - TILE_SIZE / 2) / TILE_SIZE),
    };
  }

  /** Walks a sprite along a real path tile-by-tile (skipping the path's own first entry, which
   *  is just its current tile), then calls `onComplete`. A no-op straight jump under reduced
   *  motion — same convention as every other tween-driven movement in this scene. */
  private walkPath(sprite: AttendantSprite, path: GridPosition[], onComplete?: () => void): void {
    const last = path[path.length - 1];
    if (prefersReducedMotion() || path.length <= 1 || !last) {
      if (last) sprite.image.setPosition(last.x * TILE_SIZE + TILE_SIZE / 2, last.y * TILE_SIZE + TILE_SIZE / 2);
      onComplete?.();
      return;
    }
    const steps = path.slice(1);
    const animateStep = (index: number): void => {
      if (index >= steps.length) {
        onComplete?.();
        return;
      }
      const tile = steps[index]!;
      this.tweens.add({
        targets: sprite.image,
        x: tile.x * TILE_SIZE + TILE_SIZE / 2,
        y: tile.y * TILE_SIZE + TILE_SIZE / 2,
        duration: NPC_STEP_MS,
        ease: "Linear",
        onComplete: () => animateStep(index + 1),
      });
    };
    animateStep(0);
  }

  /** Alternates Park and Market deterministically per NPC (never Math.random) — the two real
   *  off-duty destinations this round ships (npc-autonomy.md decision #4). Falls back to the
   *  NPC's own post if neither building's posts can be found, which should be unreachable in
   *  practice (both are always in DOOR_PLACES) but keeps this tolerate-gracefully rather than
   *  throwing on a future layout change. */
  private outingDestinationTile(sprite: AttendantSprite, sequence: number): GridPosition {
    const posts = attendantPosts();
    const park = posts.find((p) => p.placeId === "park");
    const market = posts.find((p) => p.placeId === "market");
    const chosen = sequence % 2 === 0 ? park : market;
    return (chosen ?? sprite.post).a;
  }

  /** NPC Autonomy round — tries to send this NPC on a real off-duty outing. Only actually
   *  starts one while they're genuinely Home right now and not already on one; otherwise it's
   *  a silent no-op (spawnOutingTimers just tries again next period, tolerate-gracefully). */
  private maybeStartOuting(sprite: AttendantSprite): void {
    if (sprite.societyState !== "home") return;
    if (sprite.atMeeting) return;
    if (this.outingActive.has(sprite.post.npcId)) return;

    const sequence = sprite.outingCount ?? 0;
    sprite.outingCount = sequence + 1;
    const destination = this.outingDestinationTile(sprite, sequence);
    const outbound = findPath(this.spriteTile(sprite), destination, NPC_PATH_GRID);
    if (!outbound) return; // genuinely unreachable — tolerate gracefully, just skip this outing

    // Stays in outingActive for the ENTIRE round trip (out, linger, AND back) — only cleared
    // by a real interrupting transition (applySocietyState) or the outing's own natural
    // completion below. Clearing it as soon as the return leg starts would leave that leg's
    // walk tween unprotected: a real transition firing mid-return would have nothing left to
    // kill, and its own tween would fight the still-running return-walk tween on the same sprite.
    this.outingActive.add(sprite.post.npcId);
    sprite.image.setVisible(true);
    sprite.image.setAlpha(1);
    this.walkPath(sprite, outbound, () => {
      const lingerMs = prefersReducedMotion() ? 200 : 1800;
      this.time.delayedCall(lingerMs, () => {
        // A real schedule transition may have already reclaimed this sprite (applySocietyState
        // deletes from outingActive and kills the tween) — if so, there's nothing left to do.
        if (!this.outingActive.has(sprite.post.npcId)) return;
        const inbound = findPath(destination, sprite.post.a, NPC_PATH_GRID);
        if (!inbound) {
          // Couldn't route back — snap straight to post rather than leaving them stranded
          // visibly at an unreachable tile; Home stays visible now, so this can't just hide.
          this.outingActive.delete(sprite.post.npcId);
          sprite.image.setPosition(sprite.post.a.x * TILE_SIZE + TILE_SIZE / 2, sprite.post.a.y * TILE_SIZE + TILE_SIZE / 2);
          this.applyNeglectVisual(sprite);
          return;
        }
        this.walkPath(sprite, inbound, () => {
          this.outingActive.delete(sprite.post.npcId);
          this.applyNeglectVisual(sprite); // already visible at post.a — Home no longer hides on return
        });
      });
    });
  }

  /** One real interaction between a building's own two attendants: they step toward each
   *  other, each shows a real dialogue line (job-flavor always available; personal lines gated
   *  on real achievements; the friend line gated on relationship tier), and the relationship
   *  counter bumps once — the minimal, real relationship construct the user explicitly asked
   *  to seed in, now running independently at all 10 buildings. A neglected building (real
   *  work hasn't happened there in a while — buildingNeglect.ts) pauses this: its attendants
   *  still visibly break, but the growth stops until someone actually interacts there again. */
  private triggerNpcInteraction(
    a: { sprite: AttendantSprite; id: SocietyNpcId },
    b: { sprite: AttendantSprite; id: SocietyNpcId },
  ): void {
    if (!prefersReducedMotion()) {
      const midX = (a.sprite.image.x + b.sprite.image.x) / 2;
      const midY = (a.sprite.image.y + b.sprite.image.y) / 2;
      this.tweens.add({ targets: a.sprite.image, x: midX - TILE_SIZE * 0.2, y: midY, duration: 500, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: b.sprite.image, x: midX + TILE_SIZE * 0.2, y: midY, duration: 500, ease: "Sine.easeInOut" });
    }

    const unlocked = loadUnlocked(this.spaceId);
    const count = relationshipCount(this.spaceId, a.id, b.id);
    const tier = relationshipTier(count);
    const nameA = npcProfile(a.id).name;
    const nameB = npcProfile(b.id).name;
    const seed = this.societyTickCount;
    this.showSpeechBubble(a.sprite, dialogueFor(a.id, unlocked, tier, nameB, seed));
    this.showSpeechBubble(b.sprite, dialogueFor(b.id, unlocked, tier, nameA, seed + 1));
    // A neglected building's relationship growth pauses — the user's own "if I never do
    // anything... that strains relationships" cascade — never decays into a negative, matches
    // the no-dark-patterns rule (a paused number, not a punished one).
    const placeId = npcProfile(a.id).placeId;
    if (!isNeglected(buildingNeglect(this.spaceId, placeId))) {
      bumpRelationship(this.spaceId, a.id, b.id);
    }
  }

  private showSpeechBubble(sprite: AttendantSprite, text: string): void {
    if (!text) return;
    const bubble = this.add.text(sprite.image.x, sprite.image.y - TILE_SIZE * 0.75, `💬 ${text}`, {
      fontSize: "10px",
      color: "#12142a",
      backgroundColor: "#f4f1ff",
      padding: { x: 4, y: 2 },
      wordWrap: { width: 150 },
    });
    bubble.setOrigin(0.5, 1);
    bubble.setDepth(6);
    this.time.delayedCall(this.dialogueHoldMs(text), () => bubble.destroy());
  }

  /** Real user feedback: dialogue "doesn't stick around long enough to read." The previous
   *  fixed 2600ms held every line for the same length regardless of how long it actually was —
   *  the longer "personal"/"friend" lines (npcDialogue.ts) never got a fair reading window.
   *  Scaled by a real reading-pace estimate (~45ms/char, a comfortable — not rushed — pace)
   *  with a floor for the shortest job-flavor lines and a ceiling so nothing lingers forever.
   *  Deliberately the SAME formula regardless of `prefersReducedMotion()` — reduced motion is
   *  about vestibular/motion sensitivity, not reading speed; a reduced-motion user needs just as
   *  long to read the words, never less. */
  private dialogueHoldMs(text: string): number {
    const BASE_MS = 700;
    const MS_PER_CHAR = 45;
    const MIN_MS = 1800;
    const MAX_MS = 5000;
    return Math.min(MAX_MS, Math.max(MIN_MS, BASE_MS + text.length * MS_PER_CHAR));
  }

  /** Where a sprite should actually end up once it's back from an errand — read from the real
   *  schedule state, not assumed. Exhaustive over ScheduleState's 3 real values: Working rests
   *  hidden at the door, Break and Home both rest visibly at the attendant's own post (Home no
   *  longer means hidden — see applySocietyState's own comment). */
  private restingTileFor(sprite: AttendantSprite): { tile: GridPosition; visible: boolean } {
    if (sprite.societyState === "working") return { tile: this.doorTileFor(sprite.post.placeId), visible: false };
    return { tile: sprite.post.a, visible: true };
  }

  /** The Town Meeting gathering (npc-autonomy.md) — real teeth, real distance. Every one of
   *  the 20 society NPCs actually walks to a real meeting slot near Town Hall (spread across
   *  more slots than any one building has attendants, so up to 20 arrivals never stack on the
   *  same tile), shows the 📢 cue there, then walks back to wherever their own schedule says
   *  they currently belong. Called from OverworldRoot.tsx once the real effect (the Bulletin
   *  Board post) has actually gone through. Sending everyone was the ORIGINAL npc-society.md
   *  proposal — only ever scaled back for the crowding risk a straight-line tween couldn't
   *  safely handle; real pathfinding removes that risk (arrivals now stagger by real travel
   *  time instead of all teleporting to the same spot at once). */
  announceTownMeeting(): void {
    const slots = townHallMeetingSlots();
    if (slots.length === 0) return; // defensive — Town Hall always has slots in practice
    let slotIndex = 0;
    for (const sprite of this.attendantSprites) {
      if (!asSocietyNpcId(sprite.post.npcId)) continue;
      const slot = slots[slotIndex % slots.length];
      slotIndex++;
      if (slot) this.sendToMeeting(sprite, slot);
    }
  }

  private sendToMeeting(sprite: AttendantSprite, slot: GridPosition): void {
    if (sprite.atMeeting) return; // already on their way from a very recent double-fire
    const outbound = findPath(this.spriteTile(sprite), slot, NPC_PATH_GRID);
    if (!outbound) return; // genuinely unreachable — tolerate gracefully, this one NPC just stays put

    // A real gathering always wins over an in-flight outing.
    if (this.outingActive.delete(sprite.post.npcId)) {
      this.tweens.killTweensOf(sprite.image);
    }
    sprite.atMeeting = true;
    sprite.image.setVisible(true);
    sprite.image.setAlpha(1);
    this.walkPath(sprite, outbound, () => {
      const icon = this.add.text(sprite.image.x, sprite.image.y - TILE_SIZE * 0.55, "📢", { fontSize: "12px" });
      icon.setOrigin(0.5);
      icon.setDepth(5);
      const holdMs = prefersReducedMotion() ? 700 : 1600;
      this.time.delayedCall(holdMs, () => {
        icon.destroy();
        const resting = this.restingTileFor(sprite);
        const inbound = findPath(slot, resting.tile, NPC_PATH_GRID);
        if (!inbound) {
          sprite.atMeeting = false;
          sprite.image.setVisible(resting.visible);
          return;
        }
        this.walkPath(sprite, inbound, () => {
          sprite.atMeeting = false;
          sprite.image.setVisible(resting.visible);
          if (resting.visible) this.applyNeglectVisual(sprite);
        });
      });
    });
  }

  private attendantWorkTick(sprite: AttendantSprite): void {
    if (!prefersReducedMotion()) {
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
    this.showWorkIcon(sprite);
  }

  /** A brief icon above an attendant showing what they're actually doing (tileAtlas.ts's
   *  workIconForPlace) — the concrete "doing work" cue, not just movement. An explicit
   *  `iconOverride` (the neglect "?" marker) takes priority over the building's own work icon. */
  private showWorkIcon(sprite: AttendantSprite, iconOverride?: string): void {
    const icon = this.add.text(sprite.image.x, sprite.image.y - TILE_SIZE * 0.55, iconOverride ?? workIconForPlace(sprite.post.placeId), {
      fontSize: "12px",
    });
    icon.setOrigin(0.5);
    icon.setDepth(4);
    if (prefersReducedMotion()) {
      this.time.delayedCall(700, () => icon.destroy());
      return;
    }
    icon.setAlpha(0);
    this.tweens.add({
      targets: icon,
      alpha: 1,
      y: icon.y - 6,
      duration: 200,
      yoyo: true,
      hold: 400,
      onComplete: () => icon.destroy(),
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
    // spaced-repetition.md — a DIFFERENT signal from isDue's ambient entropy dim, offset to a
    // different anchor so both markers can render at once without overlapping.
    if (entity.dueForRecall) {
      const recallMarker = this.add.text(TILE_SIZE * 0.4, -TILE_SIZE * 0.45, "💭", { fontSize: "13px" });
      recallMarker.setOrigin(0.5);
      container.add(recallMarker);
    }
    const badge = this.add.text(TILE_SIZE * 0.22, TILE_SIZE * 0.22, entity.rarity.badge, { fontSize: "10px" });
    badge.setOrigin(0.5);
    container.add(badge);
  }

  /** Called by OverworldRoot.tsx whenever a React overlay opens/closes. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    // An overlay opening unmounts TouchControls, which can never fire the pointerup that
    // would otherwise clear a held D-pad direction — clear it defensively so a finger that
    // was mid-hold when a door opened doesn't leave the player walking on their own forever.
    if (paused) this.inputBus.setHeldDirection(null);
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
    // Town Builder — while an item is armed (bought from the Hangar, not yet placed), interact
    // is exclusively about placement: a free tile places it, a blocked one is a silent no-op,
    // matching a real "arm mode" rather than falling through to greet/chat for this same press.
    const armedId = armedItemId(this.spaceId);
    if (armedId) {
      const creatureHere = [...this.creatureSprites.values()].some(
        (sprite) => sprite.currentTile.x === front.x && sprite.currentTile.y === front.y,
      );
      const soumayaHere = this.soumaya && front.x === this.soumaya.currentTile.x && front.y === this.soumaya.currentTile.y;
      if (!creatureHere && !soumayaHere && isTileFreeForPlacement(this.spaceId, front.x, front.y)) {
        const placed = placeArmedItem(this.spaceId, front.x, front.y);
        if (placed) {
          this.paintPlacedItem(placed);
          this.events.emit("item-placed", placed.itemId);
        }
      }
      return;
    }
    // Checked against currentTile (where the creature actually is right now), not its fixed
    // placement anchor — otherwise a mid-roam creature couldn't be greeted where it's standing.
    for (const sprite of this.creatureSprites.values()) {
      if (sprite.currentTile.x === front.x && sprite.currentTile.y === front.y) {
        this.events.emit("greet-creature", sprite.entity.nodeId);
        return;
      }
    }
    // Checked against her real current tile, not her fixed home anchor — she wanders now
    // (Stage 2.17), the same "current position, not placement anchor" rule creatures use above.
    if (this.soumaya && front.x === this.soumaya.currentTile.x && front.y === this.soumaya.currentTile.y) {
      this.events.emit("enter-place", "soumaya" satisfies PlaceId);
      return;
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
    const keyboardDirection = held("UP", "W")
      ? "up"
      : held("DOWN", "S")
        ? "down"
        : held("LEFT", "A")
          ? "left"
          : held("RIGHT", "D")
            ? "right"
            : null;
    // Touch works the same way keyboard always has: held down = keep moving, not one tap =
    // one step (real user feedback — "you can't hold down the button to keep moving").
    const direction = keyboardDirection ?? this.inputBus.heldDirection;
    if (direction) this.inputBus.emit({ type: "move", direction });

    const space = this.keys.SPACE;
    const enter = this.keys.ENTER;
    const justPressed =
      (space && Phaser.Input.Keyboard.JustDown(space)) || (enter && Phaser.Input.Keyboard.JustDown(enter));
    if (justPressed) this.inputBus.emit({ type: "interact" });
  }

  shutdown(): void {
    this.scale.off("resize", this.handleResize, this);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.idleTween?.stop();
    this.idleTween = null;
    for (const sprite of this.creatureSprites.values()) sprite.roamTimer?.remove();
    this.creatureSprites.clear();
    this.attendantSprites = [];
  }
}
