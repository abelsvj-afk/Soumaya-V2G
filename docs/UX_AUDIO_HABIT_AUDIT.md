# Soumaya · UX, Audio & Habit-Loop Audit

> Design audit (no code). Reviews the shipped product against the bar set by Apple, Notion,
> Obsidian, Duolingo, and premium space-exploration games. Grounded in the actual codebase
> (files cited). Author: Claude, acting as UX/Game/Audio/Behavioral/Growth director.
> Date: 2026-06-30.

## TL;DR — the one thing that matters most
The single highest-leverage change is **making Soumaya visibly work while you're away, then greet you
with what she did.** The engine already exists — a server-side 24/7 autonomy loop
(`packages/server/src/index.ts:110`, gated behind `AUTONOMY=on`, off by default) that runs the same
job ladder as the browser. What's missing is (1) turning it on and (2) a **"While you were away…"
welcome-back digest** assembled from `agent_logs` since your last visit. This converts the app from a
storage box into a living companion and is the strongest possible daily-return hook. Everything else in
this report is polish around that core.

The runner-up finding: **the product is beautiful but nearly mute.** The 3D galaxy is richly animated,
but almost every UI interaction is **silent and has no haptic**, and the 2D panels **pop in with no
motion.** Sound + micro-motion is where "good" becomes "premium."

---

## Phase 1 — Audio Audit

**Current state (verified):** the *only* audio in the app is a single ambient loop
(`graph/audio.ts` → `/ambient-loop.mp3`, gesture-started, fade in/out, toggled by the 🔈 chip). There
are **zero interaction sound effects** — no Web Audio, no per-action SFX anywhere in `packages/web/src`.
Every button, save, delete, achievement, and notification is silent.

Design rules for all recommendations below: honor a **master SFX toggle + volume** (separate from
music), **respect `prefers-reduced-motion`/reduced-sound and a mute**, keep every cue **short (<250ms)
and quiet (−18 to −30 dB under the music bed)**, add **±3–5% random pitch** on repeated cues so they
never feel mechanical, use **stereo/spatial panning** for in-world events (ship, beacons) based on
screen position, and pair the most important cues with **haptics** on mobile (`navigator.vibrate`).

| Interaction | Current | Missing? | Recommended sound | Priority |
|---|---|---|---|---|
| Button / tab tap | none | yes | soft muted "tick" (UI click), 40ms, quiet | High |
| Panel/menu open | none | yes | subtle rising "whoosh"/swell, 180ms | High |
| Panel/menu close | none | yes | inverse falling swell, 150ms | Med |
| Dock tab switch | none | yes | tiny detent "clack", pitch varies by tab | Med |
| Zoom galaxy (in/out) | none | yes | airy filtered-noise sweep tied to velocity | Med |
| Camera recenter | none | yes | gentle "reset" chime, 200ms | Med |
| Memory create (saved) | toast only | yes | warm confirming "bloom" + haptic tap | **Critical** |
| Memory delete (into Sun) | none | yes | low "whoomph"/ignite as it hits the Sun | High |
| Memory edit / importance slider | none | yes | soft granular ticks along the slider | Low |
| Node/planet selection | none | yes | short crystalline "select" ping, spatial | High |
| Search submit / result | none | yes | quiet "scan" sweep + result "ding" | Med |
| Filter / tag toggle | none | yes | tiny on/off blip (up vs down pitch) | Low |
| Achievement unlock | toast only | yes | triumphant 3-note sting + haptic | **Critical** |
| Daily login / welcome-back | none | yes | signature warm "home" motif (brand sound) | **Critical** |
| Streak extended | toast only | yes | ascending "streak" arpeggio (Duolingo-style) | High |
| Notification arrives | none | yes | soft radio "chirp", spatial from Soumaya | High |
| Soumaya hails you (chat pulse) | visual pulse | yes | distinctive "incoming transmission" chirp | High |
| Error / rejected action | none | yes | gentle low "denied" thud (never harsh) | Med |
| AI ship accelerate / thruster | visual plume | yes | rising engine hum + thruster burst, spatial | High |
| AI ship docking (station) | none | yes | mechanical clamp/hiss on dock | Med |
| AI scanning a memory | visual glow | yes | soft sonar "scan" pulse loop while working | Med |
| AI discovers a connection | toast only | yes | bright "insight" shimmer | High |
| AI thinking (research) | none | yes | quiet processing "computer" murmur | Low |
| AI speaking (voice) | browser TTS | partial | keep TTS; add mic-open/close blips | Med |
| Loading / sync / cloud up-down | none | yes | subtle progress "data" ticks; done "ok" | Low |
| Beacon deploy | visual | yes | launch "fwip" + arrival "lock" ping, spatial | Med |
| Fuel earned | toast + burst | yes | light coin-like "resource" shimmer | Med |

**Fastest wins (do first):** a single reusable Web-Audio "UI kit" (tap, open, close, confirm, error,
select) wired through one `playSfx(name)` helper, plus the four **Critical** brand moments (memory
saved, achievement, welcome-back, notification). That alone moves the whole product a tier.

---

## Phase 2 — Ambient Audio (a living soundscape)

Today the bed is one static loop. Design a **layered, adaptive** ambience that never fatigues:

- **Base galaxy bed** — the current calm drone, but as a *stem* (pad only).
- **Density layer** — a second stem that fades up subtly as the galaxy grows / when zoomed into a dense
  cluster; fades down in empty space. Ties ambience to *your* brain's size (ownership).
- **Ship presence** — a tiny, low engine hum that pans with Soumaya's on-screen position and swells
  on thruster bursts, so you *hear* her tending nearby.
- **Proximity accents** — faint "memory resonance" tone when the camera lingers on a body; brighter for
  stars/supergiants, cooler for cold/entropic ones (audio mirrors the visual temperature).
- **Sparse life** — very occasional, randomized distant radio chirps / soft computer beeps / orbital
  "wind", spaced 20–60s apart so they read as *alive*, never busy.
- **State shifts** — the bed brightens a semitone during a "welcome-back" moment or an achievement;
  darkens slightly when many memories are cooling (an emotional nudge to tend).

Rules: everything sits **under** the music, ducks when Soumaya speaks (TTS), and fully respects the
mute/reduced-sound setting. Calm, intelligent, futuristic — never a loop you notice.

---

## Phase 3 — Animation Audit

**Strong already (3D):** kinematic orbits (`graph/orbits.ts`), Soumaya's eased/banking flight + engine
plume (`graph/soumaya.ts`), the animated Sun (`graph/sun.ts`), starfield shimmer + camera-speed blur
(`graph/starfield.ts`), comets, collision bursts, satellites, and the cinematic intro fly-in. This layer
is genuinely premium.

**Static / lifeless (2D UI — the gap):**
- **Panels pop, they don't move.** The RightDock mounts/unmounts instantly — no slide/fade enter-exit.
  Add a 180–240ms slide+fade with a soft easing; it instantly reads as higher quality.
- **Cards don't stagger.** Lists (insights, library, list, sectors) appear all at once. A 20–30ms
  staggered fade-up per row makes content feel like it's "arriving."
- **Buttons lack press feedback.** Hover exists; add a quick scale-down "squish" on `:active` + optional
  haptic. Every premium app has tactile press motion.
- **Numbers snap.** Fuel, memory count, streak, rank progress jump instantly. Tween them (count-up,
  bar-fill easing) — cheap dopamine, very "game-like."
- **Toasts appear flatly.** Give them a spring-in + subtle idle float, and slide-out on dismiss.
- **No idle life in menus.** A faint parallax/drift on panel backgrounds or a slow shimmer on the header
  keeps even static screens breathing.
- **Empty states are plain text.** Replace with a small looping animation (a lone star forming, Soumaya
  drifting) so a new/empty brain still feels alive.
- **Selection has no "pull".** When you select a memory, a brief scale-pulse + ring expand on the body
  (some of this exists via bursts) and a matching motion on its detail panel ties the two together.
- **Reduced-motion:** gate all of the above behind `prefers-reduced-motion` with instant fallbacks.

Nothing important should appear lifeless — right now the *world* is alive but the *interface* isn't.

---

## Phase 4 — Daily Habit Loop Audit (maximize DAU, without manipulation)

**Existing hooks (good foundation):** daily digest (`synthesis/dailyDigest.ts`), daily quests
(`components/quests.ts`), streaks (`server/src/streak.ts`) + rank + milestones, the Observatory home,
reminders (`remindAt`), and the new reflective analyses (emotional weather, dormant recovery, evolution
chains, contradictions, self-check, life-area lens). The Inbox + toasts already carry alerts.

**The missing keystone — "While you were away" (your idea, and the biggest lever):**
Today there's only a *minimal* one-time greeting toast ("Welcome back — N memories · M cooling",
`App.tsx`) computed from live counts — it says nothing about what actually changed. Meanwhile a
lightweight heartbeat already runs server-side even when you're away (action-item expiry + one weak-link
prune, `index.ts:78`), and the *full* 24/7 autonomy loop exists but is off by default and invisible.
Turn autonomy on and replace the thin greeting with a real **"While you were away…" digest** built from
`agent_logs` since `last_active`:
- "While you were away, I connected 3 related memories."
- "I found 2 tasks that are now overdue."
- "I noticed a recurring idea across your journal this week."
- "I resurfaced a note from 6 months ago that seems relevant today."
This is the difference between a filing cabinet and a companion. It's mostly *surfacing* work the engine
already does. **Recommend building this next.**

**Daily-useful resurfacing prompts** (all genuinely useful, not attention bait — most are already
computable from shipped analyses):
- "You had this thought 8 months ago…" (dormant recovery already finds these).
- "This memory connects to 4 others." (degree is known).
- "You've mentioned this person 17 times." (a `person`-node mention count — small new query).
- "This goal hasn't been touched in 12 days." (dormant/cooling already covers this).
- "Today's unfinished tasks." (action items already exist — surface at open).
- "You were researching this yesterday." (agent_logs / recent research).
- "You said this was important." (high-importance, long-untended).
- "Here's what Future You wanted you to remember." (a `remindAt` due today — already stored, just needs
  a morning surface).

**Daily rhythm to design for:**
- **Morning trigger** — a gentle "good morning" card: welcome-back digest + today's reminders +
  yesterday's threads + one dormant resurfacing. One screen, 20 seconds.
- **Capture-anywhere** — the fastest possible dump (voice + text) is the core daily act; keep reducing
  friction (a global quick-capture, share-sheet ingestion, keyboard shortcut).
- **Evening reflection** — an optional "how did today feel?" one-tap mood + "anything to remember?"
  capture, which feeds the emotional-weather trajectory (closes a satisfying loop).
- **Weekly** — a "your week in the galaxy" recap (new stars, biggest constellation, mood arc) — a
  shareable, wonder-inducing moment.

Guardrail: every prompt must answer "does this genuinely help the user think/remember?" — not "does this
pull them back?" The whole set above passes that test.

---

## Phase 5 — Missing Features

### Critical (do next)
- **"While you were away" digest + 24/7 autonomy on by default** — the keystone (Phase 4). Impact: very
  high (core retention + product promise). Complexity: medium (surface existing `agent_logs`). 
- **UI sound kit + haptics** — the mute product problem (Phase 1). Impact: high (premium feel).
  Complexity: medium.
- **Global quick-capture** — capture a thought in <3s from anywhere (FAB is good; add keyboard shortcut,
  and on mobile a share-target / lock-screen path). Impact: high (drives the core daily act).
  Complexity: medium.

### Important
- **Panel/motion polish pass** (Phase 3). Impact: high perceived quality. Complexity: low–medium.
- **Onboarding / first-run tour** — the app is dense; a 4-step guided "here's your galaxy, dump a
  thought, meet Soumaya, come back tomorrow" dramatically lifts activation. Complexity: medium.
- **Morning/evening ritual cards** in the Observatory (Phase 4). Complexity: medium.
- **Person/entity rollups** — "everything about {person}", mention counts, last interaction. Complexity:
  medium (data exists).
- **Accessibility pass** — reduced-motion, focus rings/keyboard nav, contrast audit, SFX/haptic toggles,
  screen-reader labels (some `aria` exists). Complexity: medium.

### Nice to have
- Attachment previews (PDF/image inline) beyond the new download.
- Shareable "postcard" of a constellation or a week-recap.
- Themes / galaxy skins beyond the current look.
- Command palette (⌘K) for power users.

### Future Vision
- Real cloud sync + multi-device presence (today it's a single Fly volume; the header shows sync but
  it's local-first).
- Native mobile app with widgets ("today's resurfaced memory" on the home screen) — perfect for the
  always-on use case.
- Collaborative / shared brains (with the existing space model).
- On-device voice conversation with Soumaya (beyond browser TTS).

---

## Phase 6 — Emotional Design

| Emotion | Present? | Notes |
|---|---|---|
| Wonder | ✅ Strong | The galaxy, intro fly-in, comets, the black-hole Singularity — genuinely awe-inducing. |
| Calm | ✅ Good | Ambient bed, slow orbits, the Observatory. Would deepen with adaptive ambience (Phase 2). |
| Curiosity | ✅ Good | Insights/contradictions/evolution invite exploration. Resurfacing prompts (Phase 4) add more. |
| Trust | 🟡 Partial | Provenance ("✦ Charted by Soumaya") + the self-check help. Undercut by no visibility into
  *away* work and no clear data/privacy story surfaced in-app. |
| Accomplishment | ✅ Good | Ranks, streaks, achievements, milestones. Would spike with sound + number tweens. |
| Ownership | 🟡 Partial | It's *your* galaxy, but ambience/visuals don't yet scale with your brain; a weekly recap
  and "your week" moment would deepen it. |
| Comfort | 🟡 Partial | Soumaya's persona is warm, but silence + static panels make it feel less "held." Sound,
  motion, and the welcome-back greeting close this. |
| Delight | 🟡 Partial | Lots of latent delight; unlocked by micro-interactions (sound, squish, tweens, staggered
  reveals) that aren't there yet. |

**What's missing, precisely:** the app nails *wonder* but under-delivers on *intimacy and tactility* —
the small, constant, multi-sensory feedback (a sound when you save, a bar that fills, a panel that
glides, a companion who says "welcome back, here's what I did") that makes a product feel like it *cares*.

---

## Phase 7 — Polish Report (1–10)

| Dimension | Score | Why / how to close the gap |
|---|---|---|
| **Audio** | 3 | Only a music loop; every interaction is silent. → Phase 1 SFX kit + 4 brand moments + adaptive ambience. |
| **Animation** | 6 | World is a 9; UI is a 3. → Phase 3: panel transitions, staggered reveals, button squish, number tweens. |
| **Feedback** | 6 | Visual feedback is thorough; no audio, no haptics, numbers snap. → add sound/haptic + tweens. |
| **Navigation** | 7 | Rich HUD + focus system; can overwhelm. → onboarding tour + command palette + grouping. |
| **Discoverability** | 6 | A lot is packed in; the rewritten Help + Library help a lot. → first-run tour, empty-state hints, progressive disclosure. |
| **Retention** | 6 | Strong hooks exist but the away-loop is off and unsurfaced. → Phase 4 keystone (welcome-back + resurfacing). |
| **Personality** | 8 | Soumaya is a genuine, warm character with lore + voice + decisions. → give her a *voice signature* sound + more away-work narration. |
| **Emotional Design** | 7 | Wonder/calm are excellent; intimacy/tactility lag. → sound + motion + welcome-back. |
| **Delight** | 6 | Latent, not yet triggered. → micro-interactions across the board. |
| **Accessibility** | 4 | No reduced-motion, limited keyboard/focus, no contrast/SFX toggles audited. → dedicated a11y pass. |
| **Premium Feel** | 6 | The 3D sells premium; silence + static panels undercut it. → Phases 1–3 close most of it. |
| **Overall Experience** | 6.5 | A genuinely special core (galaxy + companion) held back by a silent, static *interface* and an invisible away-companion. The gap to "people love using it daily" is mostly **sound, micro-motion, and the welcome-back loop** — all high-leverage, none require rebuilding the hard parts. |

### The three moves that raise every score at once
1. **Turn on the away-companion + welcome-back digest** (Retention, Trust, Personality, Emotional).
2. **Ship the UI sound kit + haptics** (Audio, Feedback, Delight, Premium).
3. **Do the 2D motion pass** (Animation, Feedback, Premium, Delight).

Do those three and the product crosses from "impressive demo" to "quietly indispensable."
