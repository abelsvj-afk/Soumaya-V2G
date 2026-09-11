/**
 * Ports HangarPanel.tsx's exact cosmetic option lists + unlock gates, so the Overworld's
 * Hangar reads/writes the SAME localStorage keys and unlock predicates — a pilot's earned
 * cosmetics carry over between the galaxy and the Overworld exactly, nothing re-locks and
 * nothing new is invented here.
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
    { value: "default", label: "Default Scout Craft", unlocked: true },
    {
      value: "organic",
      label: "Organic Specimen Hull",
      unlocked: isOrganicUnlocked,
      lockedHint: "Unlock at 150 memories.",
    },
    {
      value: "fusion_core",
      label: "Fusion Core Destroyer",
      unlocked: hasCosmicVoyager,
      lockedHint: "Unlock via 'Cosmic Voyager' (15 travel hops).",
    },
    {
      value: "holographic",
      label: "Holographic Sentinel",
      unlocked: hasSentinel,
      lockedHint: "Unlock via 'Sentinel Command' (5 beacons).",
    },
  ];
}

/** Trail colors, as an in-world hex the Overworld can actually paint — the Hangar's "Cosmic
 *  Trail" cosmetic previously had no visual effect outside the 3D galaxy (roadmap.md's known
 *  gap); ExteriorScene.ts reads this to color the fading trail left behind by the player's
 *  footsteps, so a pilot's chosen trail now shows up while walking, not just in the menu. */
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
    { value: "blue", label: "Blue Nebula (Default)", unlocked: true },
    {
      value: "neon",
      label: "Hyperdrive Neon (Pink-Cyan)",
      unlocked: unlocked.has("consistent_pilot"),
      lockedHint: "Consistent Pilot streak.",
    },
    {
      value: "gold",
      label: "Solar Gold Exhaust",
      unlocked: unlocked.has("sector_pioneer"),
      lockedHint: "Sector Pioneer path.",
    },
    {
      value: "purple",
      label: "Void Purple Flare",
      unlocked: unlocked.has("grand_restorer"),
      lockedHint: "Grand Restorer path.",
    },
  ];
}

export function figurineOptions(unlocked: ReadonlySet<string>, memoriesCount: number): HangarOption[] {
  const isStarUnlocked = unlocked.has("star_center_figurine") || memoriesCount >= 100;
  const isDysonUnlocked = unlocked.has("dyson_sphere_figurine") || memoriesCount >= 250;
  const hasSingularity = unlocked.has("singularity") || memoriesCount >= 365;
  return [
    { value: "none", label: "None (Empty Void)", unlocked: true },
    { value: "station", label: "Waystation Figurine", unlocked: true },
    { value: "satellite", label: "Aura Beacon Figurine", unlocked: true },
    { value: "star_center", label: "Solar Monument (Star Center)", unlocked: isStarUnlocked, lockedHint: "100 memories." },
    { value: "dyson_sphere", label: "Dyson Megastructure", unlocked: isDysonUnlocked, lockedHint: "250 memories." },
    {
      value: "quantum_core",
      label: "Quantum Singularity Core",
      unlocked: unlocked.has("deep_cluster"),
      lockedHint: "Deep Cluster.",
    },
    {
      value: "hyper_array",
      label: "Synapse Hyper-Array",
      unlocked: unlocked.has("galactic_megastructure"),
      lockedHint: "Galactic Megastructure.",
    },
    {
      value: "shield_spire",
      label: "Aegis Shield Spire",
      unlocked: unlocked.has("pathfinder_quest"),
      lockedHint: "Pathfinder Quest.",
    },
    { value: "blackhole", label: "The Singularity (Black Hole)", unlocked: hasSingularity, lockedHint: "365 memories." },
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
