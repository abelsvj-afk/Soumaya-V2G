# Spec — Stage 2: The Observatory (calm home entry)

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md).
> Parent plan: [SECOND_BRAIN_ALIGNMENT.md](../SECOND_BRAIN_ALIGNMENT.md). Depends on: Stage 1 for the
> "Your constellations" card (degrades gracefully without it). Status: **✅ IMPLEMENTED & SHIPPED**
> (verified by Claude 2026-06-30) — `packages/web/src/components/Observatory.tsx` is wired into
> `App.tsx` as the home overlay behind the 🔭 FAB. Retained as the design record.

## 🎯 Objective

Give the brain a calm, glanceable entry point instead of dropping the user into the full galaxy
sea. The briefing's "home note = the observatory" + progressive disclosure: a few starting points
that orient in one screen and click through into the galaxy. This also satisfies the workflow's
mandatory **Application Shell / Navigation** requirement (an explicit home/orient surface, not
implied by the sum of feature panels).

## 📐 Architecture / blast radius (🟢 mostly web; reads existing endpoints)

| Layer | Change |
|-------|--------|
| `web` new `Observatory` component | The home overlay/screen: a small set of cards over a dimmed galaxy. |
| `web` `App.tsx` | Show Observatory on sign-in (and via a Home button); dismiss into the galaxy; a Home affordance to return. |
| Reads | `getDailyDigest` (latest insight), `getGraph`/recent (jump-back-in), `getStreak` (done), Stage-1 constellations endpoint (top hubs). No new server contract required if Stage 1 exposes a list. |

No schema or shared-type change. Primary new navigation surface, so treat with care (it's the shell).

## Reconciliation with the existing cinematic opening (do NOT break it)

The app already plays a **cinematic fly-in** on first load: `Graph3D.frameGalaxy(3200, …,
isIntro=true)` swoops the camera from a far, steep angle into the framed galaxy over ~3.2s with
user controls locked (`initialFramedRef` guards it to once per open). The Observatory must
**compose with** this, not replace it:

- The cinematic swoop stays exactly as-is — it is the "arrival."
- The Observatory cards **fade in over the galaxy as the swoop settles** (start the fade near the
  tail of the 3.2s intro so the galaxy is already beautiful behind them). The dimmed/blurred
  backdrop the wireframe calls for = the just-arrived galaxy, slightly dimmed.
- Respect the intro's controls-lock window: don't re-enable controls early; the Observatory sits on
  top while the camera is locked, and "Enter the galaxy →" hands full control back.
- The Observatory must never disable or short-circuit the cinematic (no touching `isIntro`/
  `initialFramedRef`). If the Observatory is skipped (returning user preference), the cinematic
  still plays.

## UX (Phase 4.5) — wireframe

A centered stack of ≤5 calm cards over a dimmed/blurred galaxy backdrop:

```
┌──────────────────────────────────────────┐
│  ☉  Welcome back, {name}    🔥 {streak}d   │
│                                            │
│  TODAY        Drop a thought  ▸  (capture) │
│  INSIGHT      Soumaya: "{latest insight}"  │
│  CONSTELLATIONS  ✦ {hubA}  ✦ {hubB}  ✦ …   │
│  JUMP BACK IN   {recent A} · {recent B}    │
│                                            │
│        [ Enter the galaxy → ]              │
└──────────────────────────────────────────┘
```

- **Progressive disclosure:** only the essentials; detail lives one click deeper in the galaxy.
- Each card is a real click-through (capture opens ingest; insight flies to its nodes; a
  constellation isolates that system; a recent item flies to it). No dead cards (Reviewer rule).
- **States:** *Empty / new brain* → a single hero: "Drop your first thought to begin." (no empty
  card grid). *Loading* → skeleton cards. *Error* → fall through to the plain galaxy (never block
  entry). If Stage 1 isn't shipped, omit the Constellations card cleanly.
- **Responsive:** full-screen centered on desktop/tablet; single-column, scrollable on mobile.
- **Accessibility:** keyboard-focusable cards, visible focus ring, contrast-checked text on the
  dimmed backdrop, "Enter the galaxy" reachable by keyboard.

## 🧪 Test plan

- Observatory renders the right cards from mocked digest/streak/recent/constellations.
- New-brain empty state shows the hero, not an empty grid.
- Each card's action dispatches the correct navigation (capture/fly/isolate).
- Degrades when Stage 1 data is absent (no Constellations card, no crash).
- Gate green; manual walk-through in a real browser (workflow PR checklist).

## Risks

- **Becoming a wall in the way** → it must be fast, skippable ("Enter the galaxy"), and remember
  "skip to galaxy" preference per device.
- **Stale cards** → all cards read live endpoints; no cached snapshots.
- **Scope creep into a dashboard** → cap at ≤5 cards; resist Dataview-style density (briefing: calm,
  glanceable, not a control panel).

## ✅ Acceptance criteria

1. On sign-in, the user sees a calm ≤5-card home that orients in one glance.
2. Every card is a live, working click-through into the galaxy; none are dead.
3. New brains get the single capture hero; errors fall through to the galaxy.
4. A Home affordance returns to the Observatory; a "skip" preference persists. Gate green +
   human-verified in a browser.

## Open questions for review

1. Overlay over the galaxy (recommended — preserves the "you're in space" feel) vs a separate route?
2. Default on every launch, or only first launch of a session (with a Home button otherwise)?
3. Card set — is the proposed five right, or swap "Jump back in" for "Action items / agenda"?
