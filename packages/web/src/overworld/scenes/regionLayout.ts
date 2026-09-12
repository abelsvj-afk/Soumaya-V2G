/**
 * Stage 2's single "hometown" region: every feature-tab from the old dock gets a real place
 * here (idea.md's core premise — a place you walk to, not a tab you click). Buildings are a
 * fixed footprint + one door tile (step onto it to enter); standalone objects (Soumaya, the
 * Bulletin Board) are a single impassable tile you face and press interact on, matching a
 * GBA signpost. Pure/no-Phaser so it's directly unit-testable (pokemon-reference.md).
 *
 * Town Economy round (docs/overworld/npc-economy.md, 2026-09-12): buildings grew to 3x their
 * original footprint AREA (6 tiles -> 18: 6 wide x 3 tall, not 3x every linear dimension, which
 * would dwarf the whole old region) and two buildings (Market, Park) were added. Rather than
 * hand-typing a bigger coordinate table and risking a silent overlap, placement is now
 * GENERATED from a small per-row spec list + fixed spacing — overlap is structurally impossible
 * instead of something a test has to catch after the fact (still covered by regionLayout.test.ts
 * either way, per "verify before you build").
 */

import type { GridPosition } from "../engine/movement.js";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type PlaceId =
  | "bank"
  | "library"
  | "sanctuary"
  | "postOffice"
  | "observatory"
  | "gym"
  | "market"
  | "townHall"
  | "park"
  | "hangar"
  | "mayorsHall"
  | "bulletinBoard"
  | "soumaya";

export interface DoorPlace {
  id: PlaceId;
  kind: "door";
  label: string;
  glyph: string;
  footprint: Rect;
  /** The one passable tile in the footprint — stepping onto it triggers entry. */
  door: { x: number; y: number };
}

export interface ObjectPlace {
  id: PlaceId;
  kind: "object";
  label: string;
  glyph: string;
  /** Impassable — approach from an adjacent tile and press interact. */
  tile: { x: number; y: number };
}

export type Place = DoorPlace | ObjectPlace;

// --- Generated door-building layout -----------------------------------------------------

const BUILDING_WIDTH = 6;
const BUILDING_HEIGHT = 3;
/** Horizontal walking space between two buildings in the same row. */
const ROW_GAP = 3;
/** Outer walking margin kept clear on every edge of the region. */
const SIDE_MARGIN = 2;
/** Top of the north row / top of the south row — chosen so the 2-row attendant band each
 *  building's `attendantPostsFor` derives (just outside its own door) never reaches into the
 *  open plaza in between (verified by regionLayout.test.ts, not just eyeballed). */
const NORTH_Y0 = 1;
const SOUTH_Y0 = 20;

interface RowBuildingSpec {
  id: PlaceId;
  label: string;
  glyph: string;
}

/** Lays out a row of same-size buildings left to right, each door centered on the side
 *  facing the plaza — `facesDown` buildings (north row) door on their bottom edge, the rest
 *  (south row) on their top edge. Footprints can never overlap within a row: each building's
 *  x0 starts exactly `ROW_GAP` tiles past the previous one's x1. */
function layoutRow(specs: readonly RowBuildingSpec[], y0: number, facesDown: boolean): DoorPlace[] {
  let x = SIDE_MARGIN;
  return specs.map((spec) => {
    const x0 = x;
    const x1 = x0 + BUILDING_WIDTH - 1;
    const y1 = y0 + BUILDING_HEIGHT - 1;
    const door = { x: x0 + Math.floor(BUILDING_WIDTH / 2), y: facesDown ? y1 : y0 };
    x = x1 + 1 + ROW_GAP;
    return { id: spec.id, kind: "door" as const, label: spec.label, glyph: spec.glyph, footprint: { x0, y0, x1, y1 }, door };
  });
}

// North row — Bank, Library, Sanctuary, Post Office, Observatory (unchanged from Stage 2).
const NORTH_ROW_SPECS: RowBuildingSpec[] = [
  { id: "bank", label: "Bank", glyph: "🏦" },
  { id: "library", label: "Library", glyph: "📚" },
  { id: "sanctuary", label: "Sanctuary", glyph: "🧘" },
  { id: "postOffice", label: "Post Office", glyph: "📮" },
  { id: "observatory", label: "Observatory", glyph: "🔭" },
];

// South row — Gym, Market, Town Hall, Park, Hangar. Market and Park are new (npc-economy.md):
// Market is the cosmetic shop (spends the Town Treasury, never real Fuel/finance — see the
// doc's "Fuel is NOT the shop currency" note); Park is the NPCs' real Break-time destination.
const SOUTH_ROW_SPECS: RowBuildingSpec[] = [
  { id: "gym", label: "Gym", glyph: "🏆" },
  { id: "market", label: "Market", glyph: "🛒" },
  { id: "townHall", label: "Town Hall", glyph: "🗺️" },
  { id: "park", label: "Park", glyph: "🌳" },
  { id: "hangar", label: "Hangar", glyph: "🛠️" },
];

const ROWS_DOOR_PLACES: DoorPlace[] = [...layoutRow(NORTH_ROW_SPECS, NORTH_Y0, true), ...layoutRow(SOUTH_ROW_SPECS, SOUTH_Y0, false)];

const RIGHTMOST_X1 = Math.max(...ROWS_DOOR_PLACES.map((p) => p.footprint.x1));
export const REGION_WIDTH = RIGHTMOST_X1 + SIDE_MARGIN + 1;
/** South row's bottom edge + one clear margin row below it — where Mayor's Hall's own row starts. */
const SOUTH_ROW_BOTTOM = SOUTH_Y0 + BUILDING_HEIGHT + 1;

// Mayor's Hall (docs/overworld/mayors-hall.md, task #63) — soumaya-governance.md's real
// governing role for Soumaya gets literally the biggest building on the map: 4x any other
// building's area (12x6 = 72 tiles vs. every other place's uniform 6x3 = 18), in its own row
// below the south row rather than squeezed into the uniform grid — every collision/passability/
// attendant-post function here is already generic over a DoorPlace's own footprint/door fields,
// so a bigger footprint needs zero changes anywhere else.
const MAYORS_HALL_WIDTH = 12;
const MAYORS_HALL_HEIGHT = 6;

function mayorsHallPlace(): DoorPlace {
  const x0 = Math.round((REGION_WIDTH - MAYORS_HALL_WIDTH) / 2);
  const x1 = x0 + MAYORS_HALL_WIDTH - 1;
  const y0 = SOUTH_ROW_BOTTOM;
  const y1 = y0 + MAYORS_HALL_HEIGHT - 1;
  return {
    id: "mayorsHall",
    kind: "door",
    label: "Mayor's Hall",
    glyph: "🏛️",
    footprint: { x0, y0, x1, y1 },
    door: { x: x0 + Math.floor(MAYORS_HALL_WIDTH / 2), y: y0 },
  };
}

const DOOR_PLACES: DoorPlace[] = [...ROWS_DOOR_PLACES, mayorsHallPlace()];

/** Mayor's Hall's own bottom edge + one clear margin row below it. */
export const REGION_HEIGHT = SOUTH_ROW_BOTTOM + MAYORS_HALL_HEIGHT + 1;

const CENTER_X = Math.round(REGION_WIDTH / 2);
/** The plaza band (open ground between the two attendant bands) — roughly rows 6..17 with the
 *  current constants; derived, not hand-typed, so it can't silently drift if the constants
 *  above ever change. */
const PLAZA_CENTER_Y = Math.round((NORTH_Y0 + BUILDING_HEIGHT + 2 + (SOUTH_Y0 - 2)) / 2);

export const PLAYER_SPAWN = { x: CENTER_X, y: PLAZA_CENTER_Y - 1 } as const;

// Standalone objects in the town square.
const OBJECT_PLACES: ObjectPlace[] = [
  { id: "bulletinBoard", kind: "object", label: "Bulletin Board", glyph: "📋", tile: { x: CENTER_X - 2, y: PLAZA_CENTER_Y } },
  { id: "soumaya", kind: "object", label: "Soumaya", glyph: "🛰️", tile: { x: CENTER_X + 2, y: PLAZA_CENTER_Y } },
];

/** The open field near the region's east edge — FR8's tall-grass capture trigger. Sized up
 *  along with the rest of the region this round (6x4, was 4x4). */
const GRASS_ZONE: Rect = {
  x0: REGION_WIDTH - 10,
  y0: PLAZA_CENTER_Y - 4,
  x1: REGION_WIDTH - 5,
  y1: PLAZA_CENTER_Y - 1,
};

function within(x: number, y: number, r: Rect): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < REGION_WIDTH && y < REGION_HEIGHT;
}

export function allPlaces(): readonly Place[] {
  return [...DOOR_PLACES, ...OBJECT_PLACES];
}

export function placeById(id: PlaceId): Place {
  const place = allPlaces().find((p) => p.id === id);
  if (!place) throw new Error(`Unknown place id: ${id}`);
  return place;
}

/** The door-building the player just stepped onto, if any. */
export function doorPlaceAt(x: number, y: number): DoorPlace | undefined {
  return DOOR_PLACES.find((p) => p.door.x === x && p.door.y === y);
}

/** The standalone object at this exact tile, if any (for interact-facing checks). */
export function objectPlaceAt(x: number, y: number): ObjectPlace | undefined {
  return OBJECT_PLACES.find((p) => p.tile.x === x && p.tile.y === y);
}

function isInsideAnyFootprint(x: number, y: number): boolean {
  return DOOR_PLACES.some((p) => within(x, y, p.footprint));
}

function isBuildingWallTile(x: number, y: number): boolean {
  return DOOR_PLACES.some((p) => within(x, y, p.footprint) && !(p.door.x === x && p.door.y === y));
}

/** FR8 — the tall-grass free-thought zone that triggers the capture flow. */
export function isGrassTile(x: number, y: number): boolean {
  return within(x, y, GRASS_ZONE);
}

export interface AttendantPost {
  placeId: PlaceId;
  /** Stable per-attendant identity ("<placeId>-<index>", 0-based) — lets an individual
   *  attendant be addressed by name (NPC Society, docs/overworld/npc-society.md /
   *  npc-economy.md), distinct from every other attendant at the same building. */
  npcId: string;
  /** The two tiles the attendant paces between — always directly in front of its own
   *  building's door, never past the building's own left/right edge. */
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** How many attendants pace in front of each building — "a few of them per job building",
 *  not just one. Each gets its own row directly outside, so their 2-tile paces never cross. */
const ATTENDANTS_PER_BUILDING = 2;

function attendantPostsFor(place: DoorPlace): AttendantPost[] {
  const { x0, x1, y0, y1 } = place.footprint;
  // Stand just outside on whichever side the door actually faces (north-row doors face
  // south/down at y1; south-row doors face north/up at y0 — see the row-spec comments above).
  const facesDown = place.door.y === y1;
  const posts: AttendantPost[] = [];
  for (let i = 1; i <= ATTENDANTS_PER_BUILDING; i++) {
    const row = facesDown ? y1 + i : y0 - i;
    posts.push({ placeId: place.id, npcId: `${place.id}-${i - 1}`, a: { x: x0, y: row }, b: { x: x1, y: row } });
  }
  return posts;
}

/** A few patrol posts per door-building, derived purely from its own footprint (never
 *  hand-authored, so they can never drift out of sync with where the building actually is) —
 *  "NPCs autonomous per their job" (roadmap.md Stage 2.8): a small attendant NPC paces at each. */
export function attendantPosts(): readonly AttendantPost[] {
  return DOOR_PLACES.flatMap(attendantPostsFor);
}

function isAttendantTile(x: number, y: number): boolean {
  return attendantPosts().some((p) => (p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y));
}

/** FR2 — collision: building walls, standalone objects, and attendant NPCs block movement;
 *  doors don't. */
export function isMovementPassable(x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  if (isBuildingWallTile(x, y)) return false;
  if (objectPlaceAt(x, y)) return false;
  if (isAttendantTile(x, y)) return false;
  return true;
}

/** NPC Autonomy round (docs/overworld/npc-autonomy.md) — the same rule as `isMovementPassable`
 *  MINUS the attendant-tile block. NPCs traveling across town don't physically collide with
 *  each other (plain sprites, not physics bodies), so a building's own or another building's
 *  post tiles are valid pathfinding destinations, unlike for the player. Every other real rule
 *  (walls, objects, bounds) stays identical. */
export function isNpcPathPassable(x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  if (isBuildingWallTile(x, y)) return false;
  if (objectPlaceAt(x, y)) return false;
  return true;
}

/** A few real tiles just beyond Town Hall's own attendant band, derived purely from its
 *  footprint (never hand-typed, same convention as `attendantPosts()`) — the Town Meeting
 *  gathering's real destination. Deliberately more slots than any one building has attendants,
 *  so up to all 20 arriving NPCs spread out rather than stacking on the same couple of tiles. */
const MEETING_ROWS_OUT = 2;

export function townHallMeetingSlots(): readonly GridPosition[] {
  const townHall = DOOR_PLACES.find((p) => p.id === "townHall");
  if (!townHall) return [];
  const { x0, x1, y0, y1 } = townHall.footprint;
  const facesDown = townHall.door.y === y1;
  const slots: GridPosition[] = [];
  for (let i = ATTENDANTS_PER_BUILDING + 1; i <= ATTENDANTS_PER_BUILDING + MEETING_ROWS_OUT; i++) {
    const row = facesDown ? y1 + i : y0 - i;
    for (let x = x0; x <= x1; x++) slots.push({ x, y: row });
  }
  return slots;
}

/** Creatures never spawn inside a building, on an object tile, on an attendant's patrol tile,
 *  in the grass zone, or on the player's own start tile. */
export function isPlacementBlocked(x: number, y: number): boolean {
  if (isInsideAnyFootprint(x, y)) return true;
  if (objectPlaceAt(x, y)) return true;
  if (isGrassTile(x, y)) return true;
  if (isAttendantTile(x, y)) return true;
  if (x === PLAYER_SPAWN.x && y === PLAYER_SPAWN.y) return true;
  return false;
}
