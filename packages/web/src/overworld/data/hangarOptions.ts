/**
 * Ports HangarPanel.tsx's exact cosmetic option lists + unlock gates, so the Overworld's
 * Hangar reads/writes the SAME localStorage keys and unlock predicates — a traveler's earned
 * cosmetics carry over between the galaxy and the Overworld exactly, nothing re-locks and
 * nothing new is invented here.
 *
 * wave4-full-vision.md §A — every display label below is reworded away from the deleted 3D
 * galaxy's space vocabulary ("Spaceship Hull," "Cosmic Trail," "Deep Space Figurine" and their
 * individual option names). Every stored `value` is UNCHANGED — these are real localStorage
 * keys a player may already have unlocked, so only display text changes, never an id.
 */

export interface HangarOption {
  value: string;
  label: string;
  unlocked: boolean;
  lockedHint?: string;
}

export function shipOptions(unlocked: ReadonlySet<string>, memoriesCount: number): HangarOption[] {
  const isOrganicUnlocked = unlocked.has("organic_ship_skin") || memoriesCount >= 150;
  const hasCosmicVoyager = unlocked.has("cosmic_voyager");
  const hasSentinel = unlocked.has("sentinel_command");
  return [
    { value: "default", label: "Everyday Wanderer", unlocked: true },
    {
      value: "organic",
      label: "Wildkeeper's Garb",
      unlocked: isOrganicUnlocked,
      lockedHint: "Unlock at 150 memories.",
    },
    {
      value: "fusion_core",
      label: "Voyager's Longcoat",
      unlocked: hasCosmicVoyager,
      lockedHint: "Unlock via 'Faithful Companion' (15 rounds).",
    },
    {
      value: "holographic",
      label: "Watcher's Cloak",
      unlocked: hasSentinel,
      lockedHint: "Unlock via 'Keeper of the Watch' (5 tending rounds).",
    },
  ];
}

/** Trail colors, as an in-world hex the Overworld can actually paint — the Hangar's "Footprint
 *  Trail" cosmetic previously had no visual effect outside the 3D galaxy (roadmap.md's known
 *  gap); ExteriorScene.ts reads this to color the fading trail left behind by the player's
 *  footsteps, so a traveler's chosen trail now shows up while walking, not just in the menu. */
const DEFAULT_TRAIL_COLOR_HEX = 0x3fa9f5;
const TRAIL_COLOR_HEX: Record<string, number> = {
  blue: DEFAULT_TRAIL_COLOR_HEX,
  neon: 0xff36e0,
  gold: 0xffd166,
  purple: 0x9b5de5,
};

export function trailColorHex(trail: string): number {
  return TRAIL_COLOR_HEX[trail] ?? DEFAULT_TRAIL_COLOR_HEX;
}

export function trailOptions(unlocked: ReadonlySet<string>): HangarOption[] {
  return [
    { value: "blue", label: "River Blue (Default)", unlocked: true },
    {
      value: "neon",
      label: "Festival Neon (Pink-Cyan)",
      unlocked: unlocked.has("consistent_pilot"),
      lockedHint: "Steady Hand streak.",
    },
    {
      value: "gold",
      label: "Harvest Gold",
      unlocked: unlocked.has("sector_pioneer"),
      lockedHint: "Cartographer's Eye path.",
    },
    {
      value: "purple",
      label: "Twilight Purple",
      unlocked: unlocked.has("grand_restorer"),
      lockedHint: "Restorer path.",
    },
  ];
}

export function figurineOptions(unlocked: ReadonlySet<string>, memoriesCount: number): HangarOption[] {
  const isStarUnlocked = unlocked.has("star_center_figurine") || memoriesCount >= 100;
  const isDysonUnlocked = unlocked.has("dyson_sphere_figurine") || memoriesCount >= 250;
  const hasSingularity = unlocked.has("singularity") || memoriesCount >= 365;
  return [
    { value: "none", label: "None (Empty Shelf)", unlocked: true },
    { value: "station", label: "Signpost Charm", unlocked: true },
    { value: "satellite", label: "Lantern Charm", unlocked: true },
    { value: "star_center", label: "Sundial Monument", unlocked: isStarUnlocked, lockedHint: "100 memories." },
    { value: "dyson_sphere", label: "Grand Clocktower Charm", unlocked: isDysonUnlocked, lockedHint: "250 memories." },
    {
      value: "quantum_core",
      label: "Heartwood Core",
      unlocked: unlocked.has("deep_cluster"),
      lockedHint: "Deep Cluster.",
    },
    {
      value: "hyper_array",
      label: "Loom of Threads",
      unlocked: unlocked.has("galactic_megastructure"),
      lockedHint: "Master Builder.",
    },
    {
      value: "shield_spire",
      label: "Warden's Spire",
      unlocked: unlocked.has("pathfinder_quest"),
      lockedHint: "Trailblazer.",
    },
    { value: "blackhole", label: "The Deep Well", unlocked: hasSingularity, lockedHint: "365 memories." },
  ];
}

export interface HangarKeys {
  ship: string;
  trail: string;
  fig1: string;
  fig2: string;
  focusFig1: string;
  focusFig2: string;
}

export function hangarKeys(spaceId: string): HangarKeys {
  return {
    ship: `brain.hangar.ship.${spaceId}`,
    trail: `brain.hangar.trail.${spaceId}`,
    fig1: `brain.hangar.fig1.${spaceId}`,
    fig2: `brain.hangar.fig2.${spaceId}`,
    focusFig1: `brain.hangar.focusFig1.${spaceId}`,
    focusFig2: `brain.hangar.focusFig2.${spaceId}`,
  };
}
