# Overworld — UX Design (Phase 4.5)

> Scoped to Stage 1. No implementation until this is read alongside
> [architecture.md](./architecture.md). Placeholder/programmer art is acceptable for Stage 1 —
> this doc specifies layout, states, and interaction, not final pixel art.

## Design system

- **Palette**: per-region, seeded from `Journey.color` (falls back to a neutral "uncharted"
  slate/violet palette for nodes with no Journey, matching the brief's "wild frontier" treatment
  — never an error state). Semantic roles, each with an explicit non-color pairing:
  - **Urgent / needs attention** (overdue bill, `entropy > COOLING_ENTROPY` creature): warm
    accent color **+** a blink/bounce icon marker (not a static tint alone).
  - **Calm / healthy**: base palette, no marker.
  - **Disabled** (an item above `safeToSpendCents` in the Bank shop-counter view): desaturated
    **+** a lock icon, not just greyed color.
  - **Success** (greet completed, capture confirmed): a brief sparkle/flare **+** a short chime
    cue (distinct per event type, matching the brief's audio direction) — never relies on sound
    alone either, since the flare carries the same information visually.
- **Typography**: pixel-style font for in-world UI (dialogue box, menus), reused everywhere so
  every building's menu overlay feels like one system, not eleven different screens.

## Component inventory

| Component | States |
|---|---|
| `DialogueBox` (bottom-of-screen, portrait + text) | typing-in, idle (awaiting input), choice-prompt, closing |
| `CaptureMenu` | empty (text entry), submitting ("identifying species..."), reveal (result card), error (extraction failed → offer manual/offline path, never a dead end) |
| `TouchControls` (D-pad + A/B) | idle, pressed (visual + haptic-if-available feedback), hidden (keyboard detected) |
| Bank ledger row | calm, approaching, cooling, overdue, paid, goal_filling, goal_reached (all 7 `MoneyStarState` values, each with its own icon per D9) |
| Creature sprite | vivid (fresh), dimming (entropy rising, mid-range), dimmed (`entropy > COOLING_ENTROPY`, idle "?" marker), greeted-flare (transient, on tend success) |
| Region banner ("You are entering...") | shown on warp between exterior areas; **instant**, no forced pan, under `prefers-reduced-motion` |

## Screen inventory (Stage 1)

1. **Money region exterior** — a small fixed tile map: player spawn point, the Bank building
   (door tile → warp), a tall-grass capture zone, a scatter of creature spawn points (deterministic
   per D-adapter placement) representing real nodes loosely associated with this Journey plus the
   "uncharted" edge strip for unsorted nodes. Primary action: walk (implicit); secondary: interact
   (approach + confirm) with any creature/door.
   - **Empty state**: a space with zero nodes and zero finance data still renders a walkable region
     with the Bank building and grass zone — never a blank/error screen (brief non-negotiable).
   - **Loading state**: while `getGraph()`/finance calls are in flight, the region renders with a
     calm "the stars are still arriving" placeholder animation (reduced-motion: static text only),
     not a spinner over a black screen.
   - **Error state**: a failed fetch keeps the last-known world state on screen (mirrors `App.tsx`'s
     existing "preserve last known graph on error" behavior) with a small non-blocking banner, never
     a full-screen crash.
2. **Bank interior** (Pokémon-Center-style overlay screen, not a modal stacked on 3D) — ledger list
   (bills/goals from `/finance/sky`), a "what can I afford" counter (`/finance/summary`), an exit
   warp tile back to the exact exterior spot. Same empty/loading/error treatment as above.
3. **Capture flow overlay** — triggered from the exterior grass zone; see `CaptureMenu` states above.
4. **Greet dialogue** — triggered by interacting with a dimmed (or any) creature; shows the creature's
   name/type/rarity plus a short recall-style line in Soumaya's voice, a single confirm ("Greet") and
   a dismiss (walk away) — both are valid, neither is penalized (per FR12/story 5's acceptance).

## Navigation map (Stage 1)

`Exterior (Money region)` ⇄ `Bank interior` (via door/exit warp tiles) · `Exterior` → `Capture
overlay` (via grass-zone trigger, returns to same exterior tile on close) · `Exterior` →
`Greet dialogue` (via creature interact, returns to exterior on close). No screen is reachable
except by walking to it in the world — matches "if a screen isn't on this map, it doesn't get
built."

## Responsive behavior

- **Mobile (primary target)**: full-viewport canvas, `TouchControls` visible, dialogue box spans
  full width at the bottom, safe-area padding respected.
- **Desktop**: same canvas, keyboard input, `TouchControls` hidden; canvas may letterbox rather
  than stretch (pixel-art integrity) with the surrounding chrome using the theme tokens already
  established for the rest of the app.
- All screens tested down to ~360px width per the artifact/mobile-first convention already used
  elsewhere in this codebase's UI work.

## Accessibility baseline

- Keyboard-only play is fully possible on desktop (arrow keys + a defined "interact" key); touch
  is not the only path.
- Every interactive tile/creature/door has a focus-equivalent affordance reachable by movement +
  interact, no mouse-only interaction.
- Contrast: dialogue box text meets 4.5:1 against its background in both light/dark-mode-aware
  palettes (the world itself is pixel-art and exempt from the flat-UI contrast rule, but all
  **text UI chrome** — dialogue box, menus — is held to it).
- `prefers-reduced-motion` behavior specified per-component above; verified in the same pass as
  the adapter/threshold unit tests (architecture.md test plan item 3), not left to visual QA only.
