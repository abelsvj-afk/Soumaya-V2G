import type { JobType, JobRationale } from "./agent.js";

/**
 * The pure "why she chose this job" copy — derived from graph facts (the job type +
 * the one or two memory labels involved), never an LLM call, so every decision is
 * explainable even offline. Extracted from agent.ts (Post-MVP D4) so the big switch is
 * unit-testable on its own. The `import type` above is erased at build → no runtime cycle.
 *
 * Phase U bug fix (docs/specs/soumaya-proactive-communication-migration-wave2.md, found
 * during Phase T's audit): `pickResearchTarget()`'s scored `factors` (why THIS node was
 * chosen — e.g. "emotional intensity", "contradiction") already reached `agent.ts`'s
 * `description` field but never this function's `why` — the two "explainable why"
 * surfaces silently disagreed. `detail` (optional, `research`-only) closes that gap
 * without touching any other job type's rationale or `pickResearchTarget()`'s own
 * detection/scoring logic.
 */
export function rationaleFor(type: JobType, a: string, b: string, detail?: string): JobRationale {
  switch (type) {
    case "synthesis":
      return {
        objective: `Connect "${a}" with "${b}"`,
        why: `They read as semantically close yet sit far apart in your graph with no direct link — a thread you likely haven't drawn yourself.`,
        benefit: `Joins the dots between older and newer memories so latent through-lines in your thinking surface over time.`,
      };
    case "research":
      return {
        objective: `Deep-dive research on "${a}"`,
        why: `It clearly matters to you but sits under-connected and thinly documented — a probable blind spot in your history.${detail ? ` Prioritized for ${detail}.` : ""}`,
        benefit: `Fills the gap around "${a}" and proposes concrete angles you may not have known to look for.`,
      };
    case "merging":
      return {
        objective: `Fuse near-duplicate memories "${a}" and "${b}"`,
        why: `They're almost identical, splitting one idea across two bodies and diluting its weight.`,
        benefit: `Consolidates the idea so its true gravity shows and the galaxy stays legible.`,
      };
    case "pruning":
      return {
        objective: `Prune the weak link between "${a}" and "${b}"`,
        why: `The association is faint — more likely noise than a real relationship.`,
        benefit: `Keeps the graph honest so the meaningful connections stand out.`,
      };
    case "harmonization":
      return {
        objective: `Balance the emotional tone of "${a}"`,
        why: `Its emotional charge diverges sharply from the memories around it.`,
        benefit: `Settles an outlier so a cluster's true mood reads accurately.`,
      };
    case "sector_vibe":
      return {
        objective: `Chart the vibe of the sector around "${a}"`,
        why: `It anchors a dense cluster worth characterizing as a whole.`,
        benefit: `Gives this region of your mind a recognizable identity at a glance.`,
      };
    case "calibration":
      return {
        objective: `Recalibrate the mass of hub "${a}"`,
        why: `It's highly connected but under-weighted — its gravity doesn't match its real role.`,
        benefit: `Right-sizes it so the important hubs actually look important.`,
      };
    case "daily_log":
      return {
        objective: `Write today's Captain's Log`,
        why: `Enough has shifted in your brain today to be worth a reflective summary.`,
        benefit: `Keeps a running narrative of how your second brain is evolving.`,
      };
    case "patrol":
    default:
      return {
        objective: `Routine patrol & health check`,
        why: `Nothing higher-value needs attention right now.`,
        benefit: `Steady upkeep so nothing quietly rots.`,
      };
  }
}
