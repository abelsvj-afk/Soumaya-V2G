# Spec — UI Sound Kit

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). Status: **✅ SHIPPED 2026-06-30.**
> Closes the #1 gap from `docs/UX_AUDIO_HABIT_AUDIT.md` (Audio scored 3/10 — the app was silent).

## Objective
Give the interface a subtle, premium sound layer without shipping audio files or a dependency, and
without ever risking the UI.

## Design
- **`graph/sfx.ts`** — a procedural Web Audio engine. Each sound is synthesized at runtime (oscillator +
  exponential gain envelope), so no assets, and each play gets ±4% pitch jitter so repeats never feel
  mechanical. One `playSfx(name)` API. Lazy `AudioContext` init on the first gesture (resumed if
  suspended). Everything wrapped in try/catch — audio is non-critical.
- **Master enable + volume**, separate from the music, persisted in localStorage (`sfx.enabled`,
  `sfx.volume` default 0.35). Default ON, but **off when the OS asks for reduced motion** (treated as
  reduce-sound) unless the user explicitly enables it. A `tap`-only throttle prevents machine-gunning.
- **Sound set:** tap, open, close, confirm, select, notify, achievement, error, delete, welcome —
  all <0.5s and quiet.

## Wiring (central, minimal touch)
- **Global button tap** — one delegated `document` click listener in App plays a soft `tap` for any
  `<button>` press (covers FABs, dock tabs, panels, mini buttons) and also wakes the AudioContext.
- **All toasts** — `pushToast` plays `achievement` for high-priority, else `notify`, only when actually
  shown (buffered ones stay silent). This covers milestones, achievements, decisions, fuel, etc. in one
  place.
- **Node select** — the 3D canvas selection (`Graph3D onSelect`) plays `select` (not a button → no
  double-tap).
- **Delete** — the memory delete action plays `delete`.
- **Welcome-back** — the `WelcomeBackCard` plays `welcome` on mount.
- **Settings** — an "Interface sounds" toggle; **Help** — an entry explaining the kit + reduced-motion.

## Follow-ups (noted, not built)
Spatial panning for in-world events (ship/beacons), adaptive ambient stems, and richer per-event cues
(ship thruster, scan) from the audit's Phase 1/2 — a later pass.
