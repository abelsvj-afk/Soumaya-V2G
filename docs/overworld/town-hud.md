# A persistent ambient town HUD + a Settings/Help entry point (Stage 2.31, task #73)

> Per Rule #1. Direct answer to a real flagged gap from the 2026-09-11 parity audit: "no
> persistent Fuel/Streak HUD or Settings/Help entry point anywhere." Confirmed still true by
> reading the real code before writing anything — Fuel/Streak only ever show inside the Gym
> overlay (`GymOverlay.tsx`), Treasury only ever shows inside Market/Hangar/Mayor's Hall, and
> there was no Settings/Help surface at all, only the two bare music buttons already floating in
> the top-right corner.

## What already exists that this must reuse, not reinvent

- **`snapshot.fuel`/`snapshot.streak`** — already fetched every refresh (`loadWorldSnapshot.ts`),
  already rendered once inside `GymOverlay.tsx` with the established icon convention (🔥
  Streak, ⚡ Fuel) — reused verbatim, not re-invented.
- **`treasuryBalanceCents(spaceId)`** — the same real Town Treasury every other overlay already
  reads.
- **The real key bindings** (`ExteriorScene.ts`'s `addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,
  ENTER")` + touch D-pad/A button) — Help text describes exactly these, nothing invented.
- **`musicEnabled`/`toggleMusic`/`nextTrack`** — the two existing floating buttons' own real
  logic, exposed a second way from Settings rather than duplicated with new state.

## Resolved decisions

**1. A compact, always-visible HUD bar, top-left (the existing music controls already own
top-right).** Three real numbers only — 🔥 streak, ⚡ fuel, 🏦 treasury — never a score, never an
invented "town health %". Same semi-transparent floating-button visual language the music
controls already use, so it reads as one consistent UI layer, not a second competing style.

**2. A single ⚙️ Settings button joins the existing top-right music controls**, opening a real
`SettingsOverlay.tsx` (the shared `OverlayShell`) with two sections: "Sound" (the same real
music toggle/track-switch, exposed a second, more discoverable way) and "How to Play" (real,
accurate controls only: WASD/arrow keys to move, Space/Enter or the touch A button to interact,
walking into a building's door to enter it, walking into the tall grass to capture a new
memory). No invented mechanic is described.

**3. The HUD never blocks input or gameplay.** Purely a `position: absolute` overlay layer at a
low `zIndex`, same as the existing music buttons — never intercepts clicks meant for the canvas,
never pauses the scene (only opening the Settings overlay itself does, the same way every other
overlay already pauses input via `sceneRef.current?.setPaused`).

## Data model / wiring

New `ui/TownHud.tsx` (pure presentational, no new data fetching — reads `fuel`/`streak` props
passed down from `snapshot` plus a live `treasuryBalanceCents(spaceId)` read) and
`ui/SettingsOverlay.tsx` (reuses `musicEnabled`/`setMusicEnabled`/`nextTrack` directly, same as
`OverworldRoot.tsx`'s own existing buttons). `OverworldRoot.tsx` renders `TownHud` unconditionally
alongside the canvas, adds a ⚙️ button next to the two existing music buttons, and a new
`{ kind: "settings" }` overlay variant.

## Deferred, explicitly

Any additional HUD stat beyond the 3 named above (e.g. a live neglect/business-count readout) —
Mayor's Hall already owns the honest, detailed version of that; the HUD stays intentionally
minimal. A dedicated keybinding-remap settings screen (no such feature exists to configure).
