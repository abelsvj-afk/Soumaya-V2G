# Spec — The Delete Ritual: Soumaya Carries It Into the Sun

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Grew out of a direct question tonight: is this worth building, or scope creep? Verified against
> the actual codebase before answering — the expensive-sounding part turned out to already exist.
> Status: **approved — build the scoped version below.** The customizable-mascot/face system is
> explicitly deferred, not cut (see **Deferred, not forgotten**) — the user was clear this stays on
> the list for later, this doc is where it's recorded so it isn't lost.

## 🎯 Objective

Deleting a memory today is a bare confirm dialog — the one purely negative, personality-free action
in an app built entirely around Soumaya's voice and the galaxy's physicality. Turn it into a small,
skippable ritual: she flies to the memory, narrates what she's doing (typed out, with a soft
clicking sound, music ducked low), and carries it into the sun. One tap to skip if you'd rather not
watch. This is a delight/retention feature — it doesn't fix a bug, it makes an existing, frequent
action feel like it belongs to the same world as everything else in this app.

## What already exists (verified before scoping this — the reason it's cheap)

| Piece needed | Already built? | Source |
|---|---|---|
| Ship navigates to a specific node | ✅ | `soumaya.ts`'s `planRoute`/job system — already drives Night Replay's fly-to-and-narrate sequences |
| A job carries a narration string shown while she travels | ✅ | `currentJob.description`, rendered via the floating ship-task label (`showShipTask`) |
| Camera can follow the ship ("tag along") | ✅ | `followShip` state + orbit/cockpit view modes (`App.tsx`) — exactly the "tag along while she flies" the user described |
| A one-shot celebratory/impact animation | ✅ (pattern, not this exact one) | `celebrate()` bloom used elsewhere for achievements/goal-reached |
| Procedural sound effects (no audio assets) | ✅ | `graph/sfx.ts` — synthesized tones via Web Audio, not samples; a new "typing click" is one more entry in the same table, not a new asset |
| The ship physically **moving another object** (dragging the node itself toward the sun) | ❌ | New — existing flights move the ship/camera, never a second, separate mesh in tandem |
| Typewriter-style text reveal, synced to the clicking sound | ❌ | New, but small — a timed character reveal + one sfx trigger per N characters |
| Music ducking during narration | ⚠️ partial | `graph/audio.ts` has engine-audio volume handling; needs a small addition to duck ambient music specifically for this sequence, not a new system |
| Play/skip control | ❌ | New — small UI, no precedent needed |

Net: this is "wire an existing fly-to-and-narrate system to a new trigger, plus one new choreography
(the drag-to-sun) and one new UI control (play/skip)" — not a cutscene system built from scratch.

## Deferred, not forgotten

**The customizable mascot/face-popup system** (an animated caricature — retro/cyberpunk/other
aesthetic skins, eventually user-editable into "their own little character") is explicitly **out of
this build**, per the user's own call: don't cut it, log it for later. Reasoning for deferring now:
it's a genuinely separate feature (asset/skin system, a picker UI, persistence, eventual
user-editing) bolted onto what should ship as a small, fast flourish — pairing the most ambitious
future idea with the most mundane trigger (deleting a memory) undersells it. **When this gets
picked up later:** it most naturally extends the Hangar (`HangarPanel.tsx`) — Hangar already owns
ship/trail/figurine cosmetic selection, so a "companion face" picker slots into an existing,
understood pattern rather than a new one. Revisit this note when that's ready to scope.

## Logic / choreography

1. **Trigger:** the existing delete confirm (`NodeInspector.tsx`'s "🗑 Delete memory") — same
   confirm dialog, same `deleteNode(id)` call, same failure-toast fix from tonight. The ritual is
   purely a NEW visual layered on top of a successful delete; the delete itself is unchanged.
2. **Skippable, but the scene is the default experience — not something to escape.** Per explicit
   direction: don't make skip so easy or so automatic that people rarely see it. Concretely: no
   auto-skip-after-N-deletes throttle (rejecting my own earlier suggestion) — every delete gets the
   full offer. "Skip" is one visible tap, always available, but never pre-selected or defaulted to.
   The one restraint kept: **respect `prefers-reduced-motion`** (skip the choreography outright,
   keep only a plain toast) — accessibility, not a frequency cap, and non-negotiable per this
   codebase's standing rule.
3. **Sequence, once triggered:**
   - Camera enters `followShip` mode (reusing the existing toggle, not a new camera path); ambient
     music ducks to a low bed (new: a volume-ramp addition to `graph/audio.ts`, not a new mixer).
   - Ship flies to the node (existing `planRoute`), narration types out character-by-character in
     the existing floating task-label location, with a new soft "typing click" sfx triggered every
     few characters (throttled, not per-character, so it doesn't buzz).
   - On arrival: the node's own mesh (not the ship) tweens along a path into the sun — new, small,
     bounded animation (position lerp + shrink + fade, same tweening discipline as every other
     transition in this codebase — "dial, don't snap").
   - A brief impact/absorb flash at the sun (reuses the existing bloom/`celebrate()`-style flash
     pattern), then music and camera return to normal.
   - "Skip" at any point: cancels the choreography immediately, node is already deleted (it happened
     on confirm, not at the end of the animation — the ritual is decorative, never gates the actual
     delete), camera/music return to normal right away.
4. **The line she says is generated once per delete** from a small rotating set of in-voice
   phrasings (not always the same sentence) — matches the "gamified way... a statement that means
   that, but said some other way" ask. A handful of variants is enough; no LLM call needed (this is
   flavor text, not reasoning — keeps it instant and offline-safe).

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `graph/soumaya.ts` | New job type `"delete_ritual"` (parallel to the existing `"replay"` type) — carries the target's last known position (since the node is already gone from `nodes` by the time this runs) and the chosen narration line. | 🟡 (extends the job/task state machine an existing feature already depends on — needs care, not a rewrite) |
| `graph/Graph3D.tsx` | New imperative handle method `playDeleteRitual(atPosition, label, onDone)`, mirroring the existing `replayEvents` entry point. Drives the node-into-sun tween and the impact flash. | 🟡 |
| `graph/audio.ts` | Small addition: `duckMusic(active: boolean)` — ramps ambient bed volume down/up, reusing the existing gain-node plumbing rather than a new audio graph. | 🟢 |
| `graph/sfx.ts` | One new `SfxName` entry (`"type_click"`), a short synthesized tone matching the existing table's style — no new asset. | 🟢 |
| `components/NodeInspector.tsx` | Delete confirm, on success: if `prefers-reduced-motion` is off, call the new ritual entry point with a random phrasing before invoking `onDeleted()`; a "Skip" control renders over the scene while it plays. Reduced-motion path: unchanged (today's plain toast). | 🟢 |
| `web/data/deleteLines.ts` (NEW, small) | The rotating phrasing set — plain data, easy to extend later. | 🟢 |

No server change, no schema change — this is entirely a client-side presentation layer over an
already-successful delete.

## UX

- The play/skip control is a small, unobtrusive overlay (matches this app's existing minimal-chrome
  overlay style — e.g. the "✕ Exit system view" button pattern) — visible the instant the sequence
  starts, not buried.
- Narration text uses the SAME floating task-label styling Night Replay already uses — no new
  visual language introduced for text display.
- Sound: the typing click is soft and throttled (not a click per letter); ducked music returns to
  its prior volume over ~1s, not a hard cut — matches this codebase's "tween, don't snap" rule.

## 🧪 Test plan

- Unit test the phrasing rotation (`deleteLines.ts`): never repeats the same line twice in a row for
  a small sample size, always returns a non-empty string.
- `graph/audio.test.ts` (or extend if one exists): `duckMusic(true)` lowers gain, `duckMusic(false)`
  restores it, both ramp rather than snap.
- Manual/structural check (this is graphics code this sandbox can't render): confirm
  `prefers-reduced-motion` genuinely bypasses the whole sequence and falls back to today's plain
  toast — this is the one behavior that must be exactly right and is cheap to verify by reading the
  branch, even without a rendered frame.
- Full gate: `npm run typecheck && npm test && npm run build -w @brain/web`.

## Risks

- Camera-follow + a second animated mesh (the deleted node) running alongside the ship's own motion
  is the one piece of real complexity — scope it to reuse `followShip`'s existing camera math
  rather than inventing a second camera mode.
- This is graphics/animation code this sandbox cannot visually verify (standing limitation this
  whole session). Ships behind the same discipline as the rest of the perf program: structural
  correctness verified here, visual correctness logged in `CLAUDE.md`'s Pending Validation section
  for the owner to check once Fly billing is resolved.

## ✅ Acceptance criteria

1. Deleting a memory offers the ritual by default; skip is one tap, never forced or auto-triggered.
2. `prefers-reduced-motion` bypasses the whole sequence — no partial/broken animation state.
3. The delete itself is unaffected either way — confirm → deleted, ritual is purely decorative.
4. No new audio assets; no new schema; no server changes.
5. Gate green.

## Next step after approval

Implement directly.
