import type { Journey } from "@brain/shared";
import { UNCHARTED_ICON, UNCHARTED_PALETTE, type RegionTheme } from "../types.js";

/** Maps a real Journey to a region's visual theme; falls back to the neutral "uncharted" palette. */
export function journeyToRegionTheme(journey: Journey): RegionTheme {
  return {
    journeyId: journey.id,
    title: journey.title,
    paletteSeed: journey.color ?? UNCHARTED_PALETTE,
    icon: journey.icon ?? UNCHARTED_ICON,
  };
}
