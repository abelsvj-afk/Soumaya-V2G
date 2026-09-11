/**
 * Stage 2's single "hometown" region: every feature-tab from the old dock gets a real place
 * here (idea.md's core premise — a place you walk to, not a tab you click). Buildings are a
 * fixed footprint + one door tile (step onto it to enter); standalone objects (Soumaya, the
 * Bulletin Board) are a single impassable tile you face and press interact on, matching a
 * GBA signpost. Pure/no-Phaser so it's directly unit-testable (pokemon-reference.md).
 */

export const REGION_WIDTH = 26;
export const REGION_HEIGHT = 18;
export const PLAYER_SPAWN = { x: 13, y: 9 } as const;

export type PlaceId =
  | "bank"
  | "library"
  | "sanctuary"
  | "postOffice"
  | "observatory"
  | "gym"
  | "townHall"
  | "hangar"
  | "bulletinBoard"
  | "soumaya";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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

// North row — Bank, Library, Sanctuary, Post Office, Observatory.
const DOOR_PLACES: DoorPlace[] = [
  { id: "bank", kind: "door", label: "Bank", glyph: "🏦", footprint: { x0: 1, y0: 1, x1: 3, y1: 2 }, door: { x: 2, y: 2 } },
  { id: "library", kind: "door", label: "Library", glyph: "📚", footprint: { x0: 5, y0: 1, x1: 7, y1: 2 }, door: { x: 6, y: 2 } },
  { id: "sanctuary", kind: "door", label: "Sanctuary", glyph: "🧘", footprint: { x0: 9, y0: 1, x1: 11, y1: 2 }, door: { x: 10, y: 2 } },
  { id: "postOffice", kind: "door", label: "Post Office", glyph: "📮", footprint: { x0: 13, y0: 1, x1: 15, y1: 2 }, door: { x: 14, y: 2 } },
  { id: "observatory", kind: "door", label: "Observatory", glyph: "🔭", footprint: { x0: 17, y0: 1, x1: 19, y1: 2 }, door: { x: 18, y: 2 } },
  // South row — Gym, Town Hall, Hangar.
  { id: "gym", kind: "door", label: "Gym", glyph: "🏆", footprint: { x0: 1, y0: 14, x1: 3, y1: 15 }, door: { x: 2, y: 14 } },
  { id: "townHall", kind: "door", label: "Town Hall", glyph: "🗺️", footprint: { x0: 11, y0: 14, x1: 13, y1: 15 }, door: { x: 12, y: 14 } },
  { id: "hangar", kind: "door", label: "Hangar", glyph: "🛠️", footprint: { x0: 21, y0: 14, x1: 23, y1: 15 }, door: { x: 22, y: 14 } },
];

// Standalone objects in the town square.
const OBJECT_PLACES: ObjectPlace[] = [
  { id: "bulletinBoard", kind: "object", label: "Bulletin Board", glyph: "📋", tile: { x: 12, y: 10 } },
  { id: "soumaya", kind: "object", label: "Soumaya", glyph: "🛰️", tile: { x: 14, y: 10 } },
];

/** The open field on the region's east edge — FR8's tall-grass capture trigger. */
const GRASS_ZONE: Rect = { x0: 21, y0: 4, x1: 24, y1: 7 };

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
  // south/down at y1; south-row doors face north/up at y0 — see the DOOR_PLACES comments).
  const facesDown = place.door.y === y1;
  const posts: AttendantPost[] = [];
  for (let i = 1; i <= ATTENDANTS_PER_BUILDING; i++) {
    const row = facesDown ? y1 + i : y0 - i;
    posts.push({ placeId: place.id, a: { x: x0, y: row }, b: { x: x1, y: row } });
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
