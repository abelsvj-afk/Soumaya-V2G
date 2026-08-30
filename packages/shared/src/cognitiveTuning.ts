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

/**
 * Working-memory mote color by `Thought.source` — RGB triplets (not hex) so both
 * consumers (MindPanel.tsx's in-panel list, MindSpace.tsx's ambient overlay) can drop
 * them straight into `rgb(...)`/`rgba(...,alpha)` without a hex→rgb conversion step.
 * Reuses COGNITIVE_META's own colors where the parallel is real (a goal-driven thought
 * glows the same as the Goal kind itself), so the ambient layer speaks the same visual
 * language as the rest of the Mind tab instead of a color system invented just for it.
 * Falls back to `manual`'s color for any source this map doesn't know about.
 */
export const THOUGHT_SOURCE_COLOR: Record<string, string> = {
  manual: "143,220,255", // a plain, spontaneous thought — the original mote blue
  chat: "201,166,255", // surfaced mid-conversation — mental_model's color (reasoning)
  goal: "255,157,60", // goal.color — this thought is pulling toward something you're aiming at
  priority: "255,122,69", // motivation.color — urgency, a drive
  emotion: "255,158,199", // person_entity.color — warmth/feeling
};
