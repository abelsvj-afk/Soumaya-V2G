import { COGNITIVE_META, skillTier } from "@brain/shared";
import type { AppContext } from "../context.js";
import { trimAnchorLinks } from "./cognitive.js";

/**
 * Skills leveling (Cognitive Layer Phase 4, docs/COGNITIVE_LAYER.md). A `skill` is a
 * durable capability that should BRIGHTEN as you practice it — not something you have
 * to hand-crank. Every memory that comes to support a skill (via the name/semantic
 * linking that already runs on ingest) is evidence of practice; the more practice,
 * the higher the skill's 0..1 `progress` (its level: Novice → Expert) and the
 * brighter it burns (importance → mass → size).
 *
 * Deterministic + offline. Runs on ingest (immediate) and each autonomy tick.
 * Progress only ever RATCHETS UP — you can't un-practice — so a manual bump in the
 * Mind tab is never clobbered downward. Skills are durable (entropy-exempt), so they
 * hold their level; they brighten with use rather than fading with neglect.
 */

const SKILL = COGNITIVE_META.skill;
/** Supporting memories for auto-practice to reach its CEILING. High on purpose: auto-
 *  linked memories are loose evidence, not deliberate practice, so they should nudge a
 *  skill up slowly, never crown you an Expert for merely mentioning a topic a few times.
 *  Raised 30 -> 60: `linkCognitiveAnchor` caps a skill at MAX_ANCHOR_LINKS (12) real
 *  supporters, so 12/30 let a skill reach "Practiced" (40%) the moment it hit that cap —
 *  often within days for a skill whose name is an ordinary word ("Guitar", "Coding")
 *  that shows up in unrelated memories too. 12/60 lands at "Beginner" (20%) instead,
 *  which actually reads as earned. */
const PRACTICE_TARGET = 60;
/** Auto-linking alone can't push a skill past "Practiced" — real mastery (Advanced/
 *  Expert) must be set deliberately in the Mind tab. This is why a skill no longer
 *  shoots to 100% just because similar memories piled onto it. (With PRACTICE_TARGET=60
 *  this ceiling is no longer reachable via auto-linking alone — MAX_ANCHOR_LINKS caps
 *  that path at 20% — but it stays as a defensive ceiling if that cap is ever raised.) */
const AUTO_CAP = 0.5;
/** Importance gained from Novice → Expert (0.60 → 0.78), so mastered skills shine. */
const BRIGHT_STEP = 0.18;

export interface SkillLevelUp {
  id: number;
  label: string;
  tier: string;
}

/** How many memories evidence practice of a skill (incoming `supports` edges). */
function practiceCount(ctx: AppContext, spaceId: string, id: number): number {
  return (ctx.handle.sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM edges WHERE space_id = ? AND target = ? AND relationship = 'supports'`,
    )
    .get(spaceId, id) as { c: number }).c;
}

/**
 * Re-derive every skill's level from its accumulated practice. Returns the skills
 * that crossed into a NEW tier this run (for a "you leveled up" nudge). Free/offline.
 */
export function stepSkills(ctx: AppContext, spaceId: string): SkillLevelUp[] {
  const s = ctx.handle.sqlite;
  const skills = s
    .prepare(
      `SELECT id, label, importance, progress FROM nodes
       WHERE space_id = ? AND deleted_at IS NULL AND kind = 'skill'`,
    )
    .all(spaceId) as { id: number; label: string; importance: number | null; progress: number | null }[];

  const levelUps: SkillLevelUp[] = [];
  for (const sk of skills) {
    // Self-healing: trim any skill that's accumulated more supporters than
    // linkCognitiveAnchor would ever ADD on its own (e.g. from before that cap
    // existed, or a burst that landed right at it) down to MAX_ANCHOR_LINKS, keeping
    // the strongest links — otherwise an over-linked skill reads its inflated
    // historical count on every run forever, no matter how the cap is tuned.
    trimAnchorLinks(ctx, spaceId, sk.id);
    const count = practiceCount(ctx, spaceId, sk.id);
    // Auto-practice is capped at AUTO_CAP so piled-on similar memories can't crown a
    // skill. Because the auto contribution is now low, a manual DOWN-adjust in the Mind
    // tab actually sticks (it won't get ratcheted back to 100% next tick like before).
    const derived = Math.min(AUTO_CAP, count / PRACTICE_TARGET);
    const oldProg = sk.progress ?? 0;
    const newProg = Math.max(oldProg, derived); // ratchets toward the (now low) auto level
    const newImp = SKILL.importance + newProg * BRIGHT_STEP;

    const progChanged = Math.abs(newProg - oldProg) > 0.001;
    const impChanged = Math.abs((sk.importance ?? SKILL.importance) - newImp) > 0.001;
    if (progChanged || impChanged) {
      s.prepare(`UPDATE nodes SET progress = ?, importance = ? WHERE id = ? AND space_id = ?`).run(
        newProg,
        newImp,
        sk.id,
        spaceId,
      );
    }

    if (newProg > oldProg && skillTier(newProg) !== skillTier(oldProg)) {
      const tier = skillTier(newProg);
      levelUps.push({ id: sk.id, label: sk.label, tier });
      try {
        s.prepare(
          `INSERT INTO agent_logs (space_id, action, description, targets) VALUES (?, 'skill_leveled', ?, ?)`,
        ).run(spaceId, `"${sk.label}" leveled up to ${tier}.`, JSON.stringify([sk.id]));
      } catch {
        /* best-effort */
      }
    }
  }
  return levelUps;
}
