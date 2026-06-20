/**
 * The Fleet roster — Soumaya and the agents that report to her. Static metadata
 * (icon / name / role / lore) shown in the Fleet panel + Help, merged at runtime
 * with each unit's live status from the 3D scene (Graph3D.getFleetStatus).
 */
export type FleetUnitId = "ship" | "station" | "beacon" | "scout" | "defender";

export interface FleetUnit {
  id: FleetUnitId;
  icon: string;
  name: string;
  role: string;
  lore: string;
}

export const FLEET: FleetUnit[] = [
  {
    id: "ship",
    icon: "🛸",
    name: "Soumaya",
    role: "Commander & caretaker",
    lore: "The starpilot herself. She tends the whole galaxy — surfacing connections, merging duplicates, researching your biggest hubs, and keeping the Captain's Log. The rest of the fleet reports to her.",
  },
  {
    id: "station",
    icon: "🌐",
    name: "Waystation Soumaya-Prime",
    role: "Home base",
    lore: "The megastructure orbiting your galaxy — the fleet's anchor and dock. She returns here between her rounds.",
  },
  {
    id: "beacon",
    icon: "🛰️",
    name: "Aura-class Beacons",
    role: "Warmth relays",
    lore: "A small fleet that seeks out memories going cold and pins a warm beam on them so none fade unseen; when nothing is cold they stand sentinel over your heaviest hub. Their beam takes on the memory's emotional color. Drifters fear them.",
  },
  {
    id: "scout",
    icon: "🛰",
    name: "Scout",
    role: "Frontier survey",
    lore: "A fast probe that flies to the newest and least-connected memories — the frontier — surveying what's just arrived and feeding Soumaya's curiosity when Research Mode is on.",
  },
  {
    id: "defender",
    icon: "🚀",
    name: "Defender",
    role: "Guardian",
    lore: "Holds station over your heaviest hub and breaks off to intercept hostile drifters that stray too close. The fleet's shield.",
  },
];
