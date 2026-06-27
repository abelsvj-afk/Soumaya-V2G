/**
 * Pilot rank — visible progression (gamification Wave 3). The same growth that
 * makes Soumaya fly faster (memory count, see App's pilotSpeed) is surfaced here
 * as a named pilot level with a progress bar + level-up toast. Pure client-side,
 * offline-safe; tiers are memory-count thresholds so they read clearly.
 */
export interface PilotRank {
  level: number; // 1-based
  title: string;
  /** Current memory count. */
  cur: number;
  /** Threshold this level started at. */
  prevAt: number;
  /** Threshold the next level needs (null at max). */
  nextAt: number | null;
  /** 0..1 progress toward the next level (1 at max). */
  progress: number;
}

const TIERS: { at: number; title: string }[] = [
  { at: 0, title: "Cadet" },
  { at: 10, title: "Ensign" },
  { at: 25, title: "Pilot" },
  { at: 50, title: "Navigator" },
  { at: 100, title: "Captain" },
  { at: 250, title: "Commander" },
  { at: 500, title: "Starfarer" },
  { at: 1000, title: "Voyager of the Deep" },
];

/** Compute the pilot rank from the memory count. */
export function pilotRank(memories: number): PilotRank {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (memories >= TIERS[i]!.at) idx = i;
  }
  const tier = TIERS[idx]!;
  const next = TIERS[idx + 1] ?? null;
  const span = next ? next.at - tier.at : 1;
  const progress = next ? Math.min(1, (memories - tier.at) / span) : 1;
  return {
    level: idx + 1,
    title: tier.title,
    cur: memories,
    prevAt: tier.at,
    nextAt: next ? next.at : null,
    progress,
  };
}
