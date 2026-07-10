# Feature Runway — post-freeze batch (2026-07-10)

Status: **spec locked** · Owner: Claude · Branch: `claude/soumaya-second-brain-v1-m4z4hc`

Five areas, built in gate-green slices. Order: **#5 first** (product depth), then #1, #3, #2, #4.
Each stays offline-safe, space-scoped, additive-migration-only.

## #5 — Product depth (build first)

- **5a · Node status (active / archived).** Additive `nodes.status TEXT DEFAULT 'active'`. Archiving
  keeps a memory but drops it from the galaxy + retrieval by default (it's not deleted, just resting).
  `POST /api/nodes/:id/archive` + `/unarchive`. The graph read + `knn`/keyword retrieval exclude
  `status='archived'` unless asked. Browse gains an "Archived" lens; NodeInspector gets an archive
  toggle. *(Closes the audit's deferred `status`.)*
- **5b · Editable per-space soul.** Additive `space_meta.soul TEXT`. `identity.soulText(spaceId)`
  returns the space's soul, falling back to the global `soul.md`. `GET/PUT /api/persona/soul`
  (space-scoped). A "Soumaya's soul" editor in the Companion tab. Injected into chat exactly as today.
- **5c · Auto-proposed constellation hubs.** In the autonomy loop, detect a **dense un-hubbed cluster**
  (≥ N tightly-interlinked memories with no `moc` over them) and raise a `hub_suggestion` inquiry
  ("These N memories form a tight cluster — name it a constellation?"). Answering promotes it via the
  existing `constellations/promote`. Deterministic + offline; rate-limited (one open at a time).

## #1 — Spaced-repetition / associative depth

- **1a · "Connect two distant stars" prompt.** A new proactive card: pick two *semantically-distant*
  memories (low similarity, no path) and invite the user to articulate the link → creates the edge
  (generation effect). Reuses the inquiry surface.
- **1b · Constellation-forming animation on link creation.** When a link is made (manual or accepted
  candidate), draw a brief particle line between the two stars. Client-only, `prefers-reduced-motion`-safe.
- **1c · Endowed/seeded progress.** A brand-new brain starts with its first star already "glowing"
  (a seeded welcome memory) so nobody faces a stark zero (endowed-progress effect).

## #3 — Accessibility backlog

- **3a · Colorblind-safe palette toggle.** Settings toggle → swaps the 3-colour emotion palette
  (gold/indigo/green) for a colorblind-safe set (blue/orange/grey) at the source, so links + the
  chat eye + beacons all follow. Persisted; the Legend reflects it.
- **3b · WebGL reduced-motion.** Under `prefers-reduced-motion` (or the toggle), calm the galaxy —
  slow/pause orbital drift + the ribbon flow + bloom pulsing.

## #2 — Deep-space focus mode

A "focus" toggle that dims the UI to the current cluster/selection, hides the FAB counts + ambient
motion, and pauses non-essential toasts for a distraction-free review/reading session. Restores on exit.

## #4 — New autonomous tool: periodic review

A `weekly_review` tool on the router: once a week she composes a short reflective digest of the
week's memories/mood/milestones (heuristic offline; LLM voice when available) and delivers it
(in-app + Telegram). Gentle, rate-limited (one/week). *(Calendar/.ics export is a stretch add.)*

## Verification

Gate green per slice (`typecheck · test · build`), new server + web tests for each behavioural piece,
offline path proven, additive migrations covered.
