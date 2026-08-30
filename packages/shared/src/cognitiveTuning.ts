/**
 * Tuning numbers that MUST agree between server logic and their client-side display —
 * previously duplicated (one hardcoded copy in each place), the exact "two places agree
 * only by convention" bug shape this codebase has hit before. Single source of truth here;
 * both sides import instead of restating.
 */

/** Supporting-memory count at which an idea is considered "ripe" to promote to a goal. */
export const IDEA_PROMOTE_SUPPORT = 4;

/** Working-memory decay rate: effective strength lost per hour since last reinforcement. */
export const WORKING_MEMORY_DECAY_PER_HOUR = 0.008;
