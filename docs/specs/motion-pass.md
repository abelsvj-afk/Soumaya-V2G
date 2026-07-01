# Spec — 2D Motion Pass

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). Status: **✅ SHIPPED 2026-06-30.**
> Closes the third audit score-lifter (`docs/UX_AUDIO_HABIT_AUDIT.md` Phase 3): the 3D world was alive
> but the 2D interface was static.

## Objective
Make the interface feel as premium as the galaxy — panels that glide, lists that arrive, buttons that
press, numbers that tween — dependency-free and fully reduced-motion-safe.

## Built
- **Panel/overlay enter** — `.panel` (the RightDock + others) and `.help-overlay` glide in with a
  `panel-in` fade+slide+scale (soft ease), instead of popping.
- **Tactile button press** — `button:not(.fab):active { scale(0.96) }` app-wide; FABs (which own their
  transforms) get a brightness pulse instead so nothing jumps.
- **Staggered list reveals** — insights rows, help cards, award cards, and sector cards `fade-up` with a
  coarse per-row `nth-child` delay (first 8 cascade). Pure CSS.
- **Number tweens** — `hooks/useCountUp.ts` (rAF, easeOutCubic, reduced-motion-aware) eases the HUD
  memory count and streak instead of snapping.
- **Reduced-motion guard** — a global `@media (prefers-reduced-motion: reduce)` block collapses all
  animation/transition durations, so the whole pass (and the sound kit's default) respects the OS setting.

## Notes / follow-ups
Exit animations (panels animating out on close) need React unmount coordination and were left for a
later pass; enter-motion is the bulk of the perceived-quality win. Toasts already had a `toast-in`
keyframe. No new dependencies; all CSS + one tiny hook.
