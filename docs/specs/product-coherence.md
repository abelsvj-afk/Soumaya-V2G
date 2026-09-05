# Product Coherence & Discoverability (Phase M)

> Status: **implemented**. Baseline `14f9293` (Phase L audit). Implements the four highest-
> confidence, lowest-risk findings from `docs/specs/soumaya-product-audit.md` — Maya's
> intelligence architecture (Phases A–K, frozen at `e77eb3c`) is untouched; `journey_link`-aware
> retrieval and the GraphRAG relevance floor remain explicitly deferred to their own future review.

## 1. Life Vision discoverability

**Decision:** a contextual entry card (`.mind-vision-entry` / `.mind-vision-card`) in
`MindPanel.tsx`, placed right after the panel's existing intro copy and before the generic
kind picker. It reads the SAME `items`/`byKind` state the rest of the panel already computes —
no second data source. Two states, both driven by the existing add-flow (`setKind("life_vision")`
+ `setAdding(true)`) and the existing rendered section further down (a stable `id` was added to
each per-kind section so the card can `scrollIntoView` to it):
- **No Life Vision yet:** "🌅 Set a Life Vision" + the kind's own existing blurb, clicking it opens
  the add form with `life_vision` already selected.
- **One (or more) exists:** "🌅 Your Life Vision" with a one-line summary, clicking it scrolls to
  the existing rendered section below.

**Rejected alternatives:** a new top-level dock tab (explicitly disallowed — Life Vision is one
cognitive kind among ten, not a peer of Journeys/Money); a second Life Vision list/route (would
duplicate the source of truth); reordering the kind picker to put Life Vision first (a smaller
change, but doesn't fix the deeper problem — a new user still wouldn't know to open the picker at
all without already knowing the concept exists).

## 2. NodeInspector identity

**Decision:** `NodeInspector.tsx`'s chip block now checks `node.kind in COGNITIVE_META` (the exact
map `Legend.tsx`/`MindPanel.tsx`/the galaxy renderer already use) before falling back to the
generic `colorForType(node.type)` chip. When it matches, the chip shows the kind's real
icon+label+color+blurb; a read-only progress indicator (reusing the same `.mind-bar`/`.mind-pct`
CSS classes MindPanel already defines, plus the skill-tier label for `skill`) renders below it
when `COGNITIVE_META[kind].hasProgress` is true. `belief`/`moc`'s existing special-case chips are
unchanged and still take priority.

**Rejected alternatives:** ten independent `if (kind === "goal") ...` branches (explicitly
disallowed — the metadata already exists in one place); making the progress bar interactive
(bump buttons) here too — NodeInspector is a read-only inspector; editing an item's progress
remains MindPanel's job, avoiding two places that can mutate the same state.

## 3. First-launch framing

**Decision:** one new component, `WelcomeIntro.tsx` — a single dismissible card (three short
bullets: what Soumaya is, who the companion is by their own chosen name, what the Galaxy shows),
styled identically to the existing `Legend` overlay pattern. Gated in `App.tsx` by a per-space
localStorage flag (`brain.introSeen.${space.id}`), the exact same mechanism the existing one-time
Legend reveal already uses (`brain.legendSeen.${space.id}`) — no new persistence system. The
existing Observatory-reveal (3.4s) and Legend-reveal (5.2s) timers were each given one additional
guard (`&& !showIntro`) so a genuinely new space sees the framing card FIRST and only once, rather
than three "welcome" surfaces stacking within a few seconds of each other; both timers effectively
start counting from the framing card's dismissal instead of from page load, for a brand-new space
only — a returning space (flag already set) is completely unaffected and behaves exactly as
before.

**Copy discipline:** never introduces a second name ("Maya") for the companion — the companion is
always referred to by the name the user actually gave it (`space.name`, e.g. "Luna"); "Soumaya" is
used only as the product/system name, matching how the rest of the app already treats it (the
gamer-tag reservation check, `CLAUDE.md`'s own framing). Never claims omniscience ("she knows
everything") or that the Galaxy shows literally everything — worded to match what the product
actually does (reasons over what's in the graph; says so when something isn't there yet).

**Rejected alternatives:** a multi-step tour (no evidence one is needed — the product's actual gap
was zero explanation, not insufficient depth of explanation); merging this into the existing
Legend (a different job — visual-symbol meaning vs. product identity — and the Legend's own
70/86dvh card is already dense).

## 4. Mobile chat input/keyboard behavior

**Decision, three small changes to `ChatDock`/its CSS, all additive:**
1. `.chatdock-input textarea` font-size `0.88rem` → `1rem` (16px) — the one change that actually
   prevents iOS Safari's zoom-on-focus; `min-height`/padding adjusted to match. `.chatdock-mic`/
   `.chatdock-send` widened from 38px to the 44px touch-target guideline.
2. A `useEffect` in `ChatDock.tsx` listens to `window.visualViewport`'s `resize`/`scroll` events
   (feature-detected; a no-op where unsupported) and sets two CSS custom properties on the dock
   element: `--keyboard-inset` (how much the keyboard is currently covering) and `--vv-height`
   (the actual visible height). Both default to `0px`/`100vh` when no keyboard is open, so this is
   a no-op in the common case.
3. `.chatdock`'s existing `bottom`/`height` rules (base and the `max-width:560px` mobile variant)
   were extended to consume those two properties: `bottom: calc(80px + var(--keyboard-inset, 0px))`
   lifts the dock above the keyboard; `height: min(72vh, 560px, calc(var(--vv-height, 100vh) -
   110px))` additionally caps the dock's height to the real visible area, so a short visible area
   (a small phone with a tall keyboard open) shrinks the dock instead of pushing its top edge off
   -screen.

**What was verified, and what wasn't:** typecheck, the full existing web test suite (no
regressions), and new unit tests simulating a `visualViewport` resize (`ChatDock.smoke.test.tsx`)
confirm the CSS variables update correctly and the dock's positioning rules read them. **This
sandbox cannot run real iOS/Android Safari** — the actual on-device "does the keyboard visibly
clip the input, and does it un-clip smoothly" experience is unverified and should be checked on a
real phone before considering this fully closed (flagged in `soumaya-product-audit.md` §12).

**Rejected alternatives:** a heavier "mobile keyboard library" (explicitly disallowed — this is a
~15-line native-API effect); redesigning ChatDock's layout (explicitly disallowed — the existing
visual design is unchanged, only positioning math gained two more inputs).

## Verification

- `npm run typecheck`: clean.
- Server tests: unaffected (no server code touched this phase) — see the phase's final report for
  the exact re-run count.
- Web tests: 335 passing (320 baseline + 15 new: 6 NodeInspector, 3 MindPanel, 4 WelcomeIntro, 2
  ChatDock).
- Web build: succeeds.
- No changes to Maya Intelligence, GraphRAG, `journey_link` retrieval, or the `fin_goal_link`
  schema.
