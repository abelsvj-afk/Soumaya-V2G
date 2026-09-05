# Soumaya Product Experience & System Audit (Phase L)

> Status: **audit complete, no code changes**. Baseline: `a613447` (Maya Intelligence frozen at
> `e77eb3c`, Phase K). This is a read-only, audit-first document — per the phase's own mandate,
> findings are documented and prioritized, not immediately built. Maya's intelligence architecture
> (Phases A–K) is unchanged and out of scope; every finding below is about the PRODUCT built
> around her, not her reasoning.

## Methodology note

Five parallel, independent code audits covered first-launch/domain inventory, source-of-truth/
relationships/terminology, the Galaxy's visual system, Maya's chat-UI integration and
discoverability/empty-states, and mobile/product-performance — each read the actual implementation
(components, schema, routes) and is cited by file:line throughout. Cross-domain workflows were
traced through the real code paths (not run in a live browser). **No live browser/device testing
was performed** — the sandbox cannot reliably render Three.js/WebGL or a real mobile viewport, and
static code/CSS inspection produced more precise, citable evidence than a best-effort screenshot
would have. This mirrors Phase J's own Track-1/Track-2 honesty split: what's below is what the
CODE does; a few mobile findings (keyboard-viewport behavior, the iOS zoom) are flagged as
"Confirmed in code, needs real-device confirmation of the visible symptom."

---

## 1. Product mission

Soumaya's stated mission (CLAUDE.md, `docs/VISION_2_JOURNEYS.md`): a personal Life + Financial
Operating System where memory, goals, money, relationships, journeys, vision, and intelligent
reasoning form one coherent system — not an AI chatbot with a 3D skin. Maya is the intelligence
layer (locked, Phases A–K); the Galaxy is the spatial interface; the domain systems (Money,
Wealth, Journeys, Mind/cognitive layer) are the structured reality underneath. This audit asks
whether the BUILT product delivers on that framing.

## 2. Current architecture overview (as relevant to this audit)

One relational core (`nodes`/`edges`, SQLite) underlies memories, Life Vision, People, and every
other "cognitive kind" (goal, idea, skill, identity, mental model, intention, future event,
motivation) — they're all `nodes` rows distinguished by `kind`, sharing one write/read/embedding
path (`analysis/cognitive.ts`). Three genuinely separate table families sit alongside it: Money/
Wealth (`fin_*` tables), Journeys (`journeys`/`journey_link`), and a handful of small support
tables (interaction preferences, persona, timeline chapters). Journeys and Life Vision cross-
reference the `nodes`/`fin_goal` world via explicit link tables/foreign-key-like columns
(`journey_link`, `fin_goal.vision_node_id`) rather than duplicating data — a sound design already
confirmed in Phase K's architecture-boundary audit. The Galaxy (`packages/web/src/graph/*`)
renders `nodes` rows as real 3D bodies and Journeys/Financial Goals/bills as a separate sprite
overlay system (§6). Chat (`ChatDock.tsx` → `chat/graphrag.ts`) is the one place all of this comes
together for the user, mediated by Maya.

## 3. Domain inventory

Eleven dock tabs (`RightDock.tsx` `TABS`), each independently navigable, plus several non-dock
overlays. Progressive Discovery (`RightDock.tsx:22-39`, built in an earlier phase) deliberately
hides Insights/Progress/Hangar until the user has earned them — a considered onboarding mechanism,
not a bug.

| Domain | Represents | Component | Nav | Completeness |
|---|---|---|---|---|
| Details | Selected memory inspector | `NodeInspector.tsx` | ⓘ tab, default on load | Feature-complete |
| Browse | All memories: flat/folder/hub views | `NodeList.tsx`/`LibraryPanel.tsx`/`SectorView.tsx` | 📚 tab | Complete, 3 sub-views |
| Mind | Cognitive layer: goals, Life Vision, identities, skills, people, ideas, mental models | `MindPanel.tsx` | 🧠 tab | Complete but generically labeled (§9/§10) |
| Agenda | Action items from memories | `ActionsPanel.tsx` | ✅ tab | Complete |
| Insights | Synthesis digest (connections, contradictions, dormant items) | `DigestPanel.tsx` | ✨ tab, gated until 1st insight | Complete |
| Soumaya | Companion status, active tasks, Fleet sub-section | `SoumayaPanel.tsx`+`FleetPanel.tsx` | 🛰️ tab (user's chosen name) | Complete |
| Inbox | Notifications | `InboxPanel.tsx` | 🔔 tab | Complete |
| Progress | Codex + Achievements | `CodexPanel.tsx`/`AchievementsPanel.tsx` | 🏆 tab, gated | Complete |
| Journeys | Life-chapter groupings linking memories/tasks/money | `JourneysPanel.tsx` | 🧭 tab, never gated | Complete, best-documented tab (§10) |
| Money | Budget, bills, income, pay stubs, afford calc, nested Wealth | `FinancePanel.tsx` | 💵 tab | Very built-out |
| Hangar | Ship cosmetics | `HangarPanel.tsx` | 🛠️ tab, gated | Complete |

Non-dock overlays: Settings, Connections, Timeline/Chronicle, Recall (spaced repetition), Legend,
Smart Lenses, Chat (ChatDock), Observatory (home/empty-state), Money/Wealth fullscreen expansions.
`HelpPanel.tsx` (9 categories) documents every one of the above by name and icon — no dock tab is
undocumented in Help, and Help additionally documents several non-dock overlays. **People has no
dedicated screen** — it exists only as `person_entity` nodes inside Mind, the same "concept lives
inside a differently-named tab" pattern as Life Vision (§10), though less severe since Mind's
person entries read intuitively once found.

**First-launch experience** (traced end-to-end): `LoginScreen.tsx` (name+passcode, no email) has
zero explanation of what Soumaya/Maya/the Galaxy are — copy is limited to "Create a new private
galaxy" / trust language about passcode hashing. After auth, a ~3.2s cinematic fly-in is followed
by `Observatory.tsx` opening full-screen; for a genuinely empty space it shows one real "start
here" affordance: *"Your galaxy is empty. Drop your first thought and watch it become a star."*
with a primary "✍️ Drop your first thought" button. A second, independent, auto-dismissing (10s)
toast fires the same nudge — a minor redundancy, not a gap. **There is no tutorial, tooltip walk-
through, or forced first-open of Help/Legend** — a new user's only path to understanding what a
"star" or "sector" means is to find and open the Legend themselves.

## 4. Source-of-truth map

| Concept | Authoritative store | Notes |
|---|---|---|
| Memories | `nodes` table, no `kind` (or `kind:"memory"`) | No dedicated repo; via `nodes.repo.ts` |
| Life Vision | `nodes` row, `kind:"life_vision"` | Same read/write path as every cognitive kind |
| Mind Goal | `nodes` row, `kind:"goal"` | **Distinct from Financial Goal** — see §9 |
| People | `nodes` row, `kind:"person_entity"` | Same store as memories/Life Vision |
| Financial Goals / Wealth | `fin_goal` table | **"Wealth" and "Financial Goals" are the literal same table** — one domain, two UI names |
| Money (income/expense/bills/balance) | `fin_account`/`fin_income`/`fin_expense`/`fin_bill` | Separate table family from Wealth |
| Debt / Credit | **Does not exist as a tracked entity** | Only a `category:"debt"` auto-classification string on expenses; no `fin_debt`/`fin_credit` table, repo, or route |
| Pay Stubs | `fin_paystub` | Always produces one `fin_income` row |
| Journeys | `journeys` + `journey_link` | Link-only by design ("we LINK, never copy") |
| Interaction preferences | `interaction_preferences` | Kept separate from `nodes` and `instruction_profiles` (Phase H) |
| Persona/"About Me" | `user_persona` (singleton per space) | — |
| Timeline chapters | `timeline_chapters` | Separate from `lore` (append-only narrative) |

**Duplication found:** `fin_goal_link` (`schemaSql.ts:395-403`) is a legacy, node-linked goal
table with **zero repo, route, or UI references anywhere in the codebase** (confirmed by grep) —
its own neighboring schema comment explains it was deliberately superseded by `fin_bucket`/
`fin_goal`/`fin_allocation` ("its `node_id NOT NULL` shape doesn't fit optional"). It is orphaned,
not actively duplicating anything today, but is dead schema created on every boot. **No other
duplication found** — every other "concept" that looks like it could be a second store (People,
Life Vision, Mind Goal) is actually the SAME `nodes` table differentiated by `kind`, and Wealth
data is refetched from the server on every relevant event rather than cached into a UI store that
could drift (`WealthPanel.tsx`'s `brain-finance-changed` listener).

## 5. Domain relationship map

| Link | Status |
|---|---|
| Life Vision → Financial Goal → Money | **(a) fully wired both ends** — `fin_goal.vision_node_id`, funding-requirement math (`visionRequirementCents`), UI on both the Mind-panel Vision card and the Wealth panel |
| Financial Goal ↔ Wealth | Not a link — literally one table/domain |
| Memories → Journeys (`journey_link` kind=node) | **(a) fully wired** — `JourneyChips` mounted in `NodeInspector`/`IngestPanel`, read side in `JourneysPanel` |
| Journeys → Money (`journey_link` kind=income/expense/bill) | **(a) fully wired** — `JourneyChips` in `FinancePanel` rows |
| Journeys → Wealth Goal (`journey_link` kind=goal) | **(a) fully wired** — `JourneyChips` in `WealthPanel` |
| Memories → Mind/cognitive anchors | **(a) wired** via generic `edges` (`relationship:"supports"`), surfaced only as generic graph edges, not a dedicated widget |
| **Journeys/memories → Maya's reasoning** | **(c) not connected** — see finding below |

**Real gap found:** `journey_link` is never read by `chat/graphrag.ts` or any `analysis/*.ts`
module (confirmed by grep — zero hits). Maya's retrieval for a question about a specific Journey
relies entirely on ordinary GraphRAG similarity/keyword matching against the question text; it has
no signal that a memory was EXPLICITLY attached to that Journey by the user. A user who diligently
links memories to "Owner-Operator Transition" and then asks Maya about that Journey gets no
guarantee those specific memories are the ones retrieved. This is a real, demonstrated relationship
gap — see §15 for its priority classification and why it is NOT being fixed in this audit-only
phase.

## 6. Galaxy audit

**Citizens vs. overlays.** Every `nodes` row — memories AND all ten cognitive kinds (goal, idea,
skill, person_entity, identity, mental_model, intention, future_event, motivation, life_vision) —
gets a real, clickable, mass/orbit-participating 3D body (`nodeObject.ts`). **Journeys and
Financial Goals are structurally second-class**: they render as separate `THREE.Sprite` rings
(`journeyHubs.ts`, `moneySky.ts`) populated from non-`nodes` data. They're clickable (raycast) but
don't participate in mass/orbit/gravity, aren't real `GraphNode`s, and — confirmed by tracing the
click handler — **clicking one does NOT open `NodeInspector`**; it only fires a toast + camera
fly-to. `FinBucket` has no Galaxy representation at all (likely intentional — not every ledger
grouping needs a body). Ordinary transactions (income/expense rows) never render as bodies.

**Visual hierarchy.** Shape is driven purely by computed mass class (asteroid→supergiant), never
by domain kind — a memory and a Goal in the same mass band are the same sphere shape. Color is the
one per-kind signal (`COGNITIVE_META`), but several kinds cluster tightly in the same orange/gold
band (`goal` #ff9d3c, `motivation` #ff7a45, `life_vision` #ffb37a, plus `intention`'s gold sitting
near the constellation-hub color) — hard to distinguish at a glance, especially once age/entropy
tinting shifts the rendered color. **Confirmed data-not-surfaced bug-adjacent finding**:
`NodeInspector.tsx:207-219` renders a generic `"Concept"` chip (via `colorForType(node.type)`) for
EVERY cognitive kind except `belief`/`moc` — a Goal, Person-entity, Identity, Life Vision, etc. all
show the identical chip with no per-kind icon/label, and no progress bar despite
`COGNITIVE_META[kind].hasProgress` existing for goal/skill/life_vision. The rich distinctions the
rest of the system carefully maintains (Legend, MindPanel, color) collapse the moment a user clicks
through to the inspector.

**Navigation.** Galaxy is the unconditional landing view. Galaxy→domain works well for real
`GraphNode`s (click → `NodeInspector`). Domain→Galaxy fly-to (`onFocus`) is wired through nearly
every panel (Mind, Agenda, Journeys' linked items, Codex, Fleet, Observatory, Review, Timeline,
Connections, Soumaya) — **but is absent for a Journey's own hub and for Financial Goals/bills**:
`FinancePanel.tsx`/`WealthPanel.tsx` have zero fly-to reference; the only route to see a goal in
the Galaxy is the separate GalaxyViews "Money sky" toggle, a one-way discovery path with no link
back from the panel that manages it.

**Discoverability of what the Galaxy means.** A genuinely thorough `Legend.tsx` exists (mass
explanation, per-class meanings, cognitive-kind blurbs, Journey-hub/Money-sky glyph key), but it
must be manually found and opened — no in-canvas caption or first-run cue. `GalaxyViews.tsx`'s
"Views"/"Lens" system (isolate-by-category, save-as-persistent-filter) is real and useful but
starts collapsed with no onboarding cue beyond its own label.

## 7. Maya/product integration audit

Chat UI integration is, on the whole, the strongest-executed part of the product:
- **Citations** render as real clickable pills (colored by type) that fly the camera to the cited
  memory (`ChatDock.tsx:503-517` → `App.tsx`'s `focus()`) — not decorative.
- **Navigation chips** (`ChatResponse.navigation`) show `{icon} Go to {label}` and, on click, drive
  the SAME server-validated fly-to path as clicking a Galaxy body directly, plus a confirming toast
  with the real `reason` — genuinely functional, not a stub.
- **askBack** (clarifying questions) get a visually distinct bubble/tag ("she wants to
  understand") — a user can tell it's a question, not a normal reply.
- **Mood** is surfaced three ways (avatar expression, bubble border color, an explicit icon with a
  `title` tooltip) — deliberately not color-only, an accessibility-conscious choice.
- **Weak point, confirmed**: context transparency stops at citation chips and an "applied roles/
  docs" chip row — there's no domain-level summary ("used your Finance data," "referenced 3
  memories") the way the FINANCE SNAPSHOT/EMOTIONAL CONTEXT/etc. blocks exist richly on the
  server side but never surface their EXISTENCE to the user, only their conclusions.
- **Weak point, confirmed**: no clickable quick-start conversation prompts — the empty state has
  example phrasings only as prose, and the actually-clickable `QUICK_TOOLS` chips navigate to app
  TABS, not conversation starters.
- **The `journey_link` gap from §5** lands squarely here: asking Maya "what's going on with my
  Owner-Operator Journey" has no guaranteed connection to memories the user explicitly filed under
  that Journey.

## 8. Terminology audit

Three deliberately distinct "goal-ish" concepts exist, each with its own code comment explaining
the distinction: **Mind Goal** (`nodes.kind:"goal"`, cognitive layer, icon 🎯), **Life Vision**
(`nodes.kind:"life_vision"`, "a whole chapter, not a task"), **Financial Goal** (`fin_goal` table,
same domain as "Wealth"). UI copy is disciplined about disambiguating "Financial Goal" specifically
whenever both a Mind Goal and a Financial Goal could be in view (e.g., MindPanel's "Financial
Goals" section header, never bare "Goals," when inside a Life Vision card). The one residual risk:
bare **"Goal"** alone (as used inside the Wealth panel itself, or casually in conversation) is
genuinely ambiguous out of context — this is a real but minor, already-mitigated-where-it-matters
finding, not a naming mistake to fix. **"Wealth" vs "Money"**: presented to the user as one
navigational entry point (a single "Money" dock tab) with Wealth as a nested, collapsible sub-
section — disciplined vocabulary is maintained throughout (Wealth deliberately avoids "saved"/
"balance" language to not imply a real transfer) even though they are, in code, two separate panel
components sharing one CSS class for their fullscreen overlays. **"Journey"** is used consistently
with no confusion against Life Vision (different icons, different tabs, no shared string).
**"Debt"/"Credit"** never appear as a real feature — see §4; this is a scope observation, not a
terminology inconsistency.

## 9. Discoverability audit

**Life Vision — the one explicitly flagged in this phase's brief.** Still the weakest discoverable
concept in the product. It lives inside a generically-named "Mind" tab (no hint that "Life Vision"
lives there), is the LAST of ten equal-weight options in a flat kind-picker with no visual
promotion, and has no dedicated empty state — the section simply doesn't render until one exists.
The Mind tab's own whole-panel empty copy explicitly nudges toward "a goal you're working toward,"
not Life Vision. A new user has no signal steering them toward the single concept the product's
own mission statement puts at the TOP of the Life OS hierarchy (Vision → Goals → Journeys →
Memory). Phase H's earlier fix for this (re-confirmed by reading the actual commit) was a HelpPanel
text addition, not a UI-behavior change — the underlying discoverability weakness is unchanged
since then.

**Journeys — for contrast, done well.** A self-explanatory tab label/icon, never gated, and (best
in the app) an ALWAYS-VISIBLE, permanent intro line the moment the tab opens: *"A Journey is a
meaningful chapter of your life. Memories, money, tasks and goals all connect through it — so
instead of 'where do I save this?', the question becomes 'what Journey does this move forward?'"*
This is the product's single best piece of in-context, unprompted explanation and a template
worth reusing for Life Vision.

**People** shares Life Vision's "hidden inside a differently-named tab" pattern (no dedicated
screen; lives inside Mind as `person_entity`), though less severely since a "Mind" tab containing
tracked people reads intuitively once a user is already inside it.

## 10. Empty-state audit

| Screen | What/Why/Next-step present? |
|---|---|
| Observatory (zero memories) | **Yes, all three** — names the product, explains the action, one clear CTA |
| ChatDock history | **Yes, richest in the app** — explains what Maya does, why, and how to start, with example phrasings |
| JourneysPanel (zero active) | Intro line (what/why) + 4 one-tap starter chips (what to do) — strong |
| WealthPanel (zero buckets/goals) | Names the concept + concrete example — good, doesn't explain WHY |
| MindPanel — Life Vision specifically | **No dedicated empty state at all** — section is simply absent until created; whole-tab generic copy doesn't mention it |
| InboxPanel | Pure status lines ("Your inbox is completely clear! 🚀") — no what/why, but Inbox is self-explanatory enough that this is low-severity |
| ActionsPanel (fully empty) | What-to-do present (concrete CTA), why is implicit only |

## 11. Cross-domain user journeys (traced through real code, not run live)

- **A — Life → Money**: **Works, well-implemented.** `visionNodeId` links, `visionRequirementCents`
  correctly excludes archived goals and tracks open-ended ones separately (re-confirmed from
  Phase J/K), and the Mind-panel Vision card shows real funding progress inline.
- **B — Memory → Maya**: **Works**, extensively validated by real `chat()` calls in Phases I/J
  (retrieval → citation → fly-to). Not re-traced from scratch here; cited as already proven.
- **C — Money → Maya**: **Works**, including the Phase J fix that made Financial Goals visible to
  `financialSnapshotText`. Re-confirmed present in the current `chat/graphrag.ts`.
- **D — Journey → Memory → Maya**: **Breaks at the last hop.** Journey↔memory linking (data model
  + UI) works fully (§5); Maya's retrieval simply never consults `journey_link` (§5/§7 finding).
  A user can build a perfect Journey with perfectly-linked memories and Maya still won't
  specifically favor them when asked about that Journey.
- **E — Maya → Galaxy**: **Works**, and is one of the best-executed chains in the product — a
  proposed navigation candidate is server-validated then drives the exact same fly-to path a direct
  Galaxy click would use (§7).

## 12. Mobile audit

Deliberate fluid-first design (`min()`/`vw`/`dvh` sizing) rather than many discrete breakpoints —
defensible for a single-column phone-first layout, not itself a problem. Concrete findings:
- **Confirmed, real, high-frequency**: the primary chat composer textarea is `0.88rem` (~14.1px) —
  below the ~16px threshold that triggers Safari's auto-zoom-on-focus; several other real inputs
  (tag input, finance draft-review fields, chat-form input) share this. The login form and
  `FinancePanel`'s primary forms correctly use ~16px, showing the intent exists but wasn't applied
  everywhere.
- **Confirmed in code, needs real-device confirmation**: no `visualViewport`/keyboard-aware
  handling exists anywhere; `.chatdock`/`.dock` are `position:fixed` with hardcoded offsets, a
  common source of on-screen-keyboard clipping on a real phone.
- Financial lists deliberately avoid horizontal scroll (flex/grid `<ul>`s with ellipsis truncation,
  no `<table>` anywhere) — good mobile practice, no overflow risk found.
- The historical FAB/z-index overlap bug CLASS has been fixed repeatedly with commented, deliberate
  offsets; no NEW instance was found — but the fix pattern itself (a hand-maintained pixel-offset
  table with no shared layout system) is a fragile process risk for the next added element, not a
  live bug today.
- A handful of small (22–32px) touch targets exist (task reorder arrows, chat-bubble save button,
  Observatory close/search) — minor, mostly secondary actions.

**Update (Phase M, docs/specs/product-coherence.md):** the two findings above that named the
primary chat input specifically are fixed — `.chatdock-input textarea` is now `1rem` (16px), and
`.chatdock-mic`/`.chatdock-send` are now 44px touch targets; `ChatDock.tsx` now listens to
`window.visualViewport` and lifts/shrinks the dock to stay clear of an on-screen keyboard, exposed
as two CSS custom properties (`--keyboard-inset`, `--vv-height`) the existing `bottom`/`height`
rules already consume. **What remains unverified**: this environment cannot run real iOS/Android
Safari — the fix is verified by code/unit-test only (a simulated `visualViewport` resize; see
`ChatDock.smoke.test.tsx`'s "mobile input" tests), not by an actual on-device keyboard. The other
inputs this finding named (tag input, finance draft-review fields) were left unchanged — they
were out of Phase M's four scoped areas.

## 13. Performance observations (product-level, not the already-optimized Galaxy render loop)

- Each `RightDock` panel independently fetches its own data on mount with no cross-tab cache —
  switching tabs re-fetches from scratch. Minor on a fast connection, more noticeable bouncing
  between tabs on mobile data.
- `TimelineView.tsx` fires up to 30-40 individual attachment-fetch requests in parallel when
  opening a photo-heavy chapter (an N+1 pattern) — the one clear "could stall on a throttled mobile
  network" finding.
- Bundle lazy-loading is otherwise handled well: Three.js/react-force-graph-3d, mammoth, and
  pdfjs-dist are all dynamically imported only when needed; only the eleven dock-tab panel
  components are statically imported up front, and none of them pull in a heavy dependency
  themselves.
- Chat has a proper typing/thinking indicator — no frozen-UI perception during a `chat()` round
  trip.

## 14. Product coherence assessment

**The underlying data model is genuinely unified** — one `nodes` table carries memories, Life
Vision, People, and every cognitive concept; Journeys and Money cross-reference it through real
link tables rather than duplicating data (Phase K already confirmed no accidental duplication).
That is a real, working "operating system," not a marketing claim.

**Where coherence breaks is presentation, not architecture**, concentrated in a few nameable
points: Journeys and Financial Goals are visually second-class in the Galaxy (sprites, not
citizens) even though they're first-class in the data model — undermining the promise that the
Galaxy IS the spatial reflection of the whole system. The generic "Concept" chip in NodeInspector
flattens every cognitive distinction the rest of the app carefully maintains. And Life Vision — the
apex of the Life OS hierarchy the product's own mission statement describes — is simultaneously
the hardest single concept to discover. None of these are "five apps sharing a UI" — they are
specific, fixable seams in an otherwise coherent whole.

## 15. Prioritized findings

| # | Finding | Severity | Category | Confidence | Status |
|---|---|---|---|---|---|
| 1 | Life Vision discoverability (flat picker, no promotion, no dedicated empty state) | P1 | Discoverability | Confirmed | **Fixed (Phase M)** — a contextual entry card in MindPanel, above the flat picker |
| 2 | NodeInspector shows generic "Concept" for all 10 cognitive kinds, ignoring `COGNITIVE_META` | P1 | UI / Data-model-underuse | Confirmed | **Fixed (Phase M)** — reuses `COGNITIVE_META` directly, no new metadata |
| 3 | Journeys/Financial Goals are second-class Galaxy citizens (sprites, no NodeInspector, no fly-to from their own panels) | P1 | Architecture / UX | Confirmed | Deferred — out of Phase M's scope (Galaxy rendering architecture) |
| 4 | `journey_link` never consulted by Maya's retrieval (Journey D breaks) | P1/P2 | Integration (bounded fix would touch locked Maya code — needs its own scoped spec) | Confirmed | Deferred — explicitly out of scope for Phase M; needs its own architectural review |
| 5 | No first-launch product framing (what is Soumaya/Maya/Galaxy) | P1 | Onboarding | Confirmed | **Fixed (Phase M)** — a single, one-time, dismissible framing card |
| 6 | iOS zoom-on-focus on primary chat input + several other real inputs (<16px font) | P1 | Mobile | Confirmed (device symptom needs validation) | **Fixed (Phase M)** for the primary chat input specifically (now 16px); the other inputs named in this finding (tag input, finance draft fields) are unchanged — out of Phase M's scoped area |
| 7 | No keyboard-aware viewport handling for fixed chat/dock | P1/P2 | Mobile | Needs validation | **Fixed (Phase M)** via `window.visualViewport`; real-device confirmation still outstanding (see §12 update below) |
| 8 | No domain-level "what Maya used" transparency beyond citation chips | P2 | Trust / UX | Confirmed | Deferred — needs its own design pass |
| 9 | No clickable quick-start chat prompts | P2 | Discoverability | Confirmed | Deferred — not in Phase M's four scoped areas |
| 10 | Hand-maintained z-index/offset table — fragile for future additions | P2 | Architecture / Maintainability | Confirmed (risk is Likely) | Deferred — no live bug, process risk only |
| 11 | TimelineView N+1 photo-fetch burst | P2 | Performance / Mobile | Confirmed | Deferred — not in Phase M's four scoped areas |
| 12 | No cross-tab data cache in RightDock panels | P2/P3 | Performance | Confirmed | Deferred |
| 13 | `fin_goal_link` orphaned legacy table | P3 | Data model / cleanup | Confirmed | Deferred — explicitly not to be touched this phase |
| 14 | Tight color clustering among orange/gold cognitive kinds | P3 | UI | Confirmed | Deferred — a Galaxy-visual change, not attempted (preserve the aesthetic per Phase M's own rule) |
| 15 | Debt/Credit absent as tracked entities | P2 | Product strategy (scope question, not a bug) | Confirmed | Deferred — a product-strategy question, not a Phase M implementation item |
| 16 | People has no dedicated screen (same pattern as Life Vision, milder) | P3 | Discoverability | Confirmed |

## 16. Recommended next phase

A scoped **"Product Coherence & Discoverability"** build phase — UI/product work, explicitly NOT
touching Maya's locked reasoning core except for the one small, precedented retrieval-bounding
change below. Suggested order (each should get its own short spec before code, per this repo's
standing workflow):
1. Life Vision discoverability fix (promote it out of the flat picker; consider a real "Life OS"
   entry surface; add a dedicated empty state) — directly closes the phase brief's named concern.
2. NodeInspector: render each cognitive kind's real icon/label/progress instead of "Concept" —
   small, reuses existing `COGNITIVE_META`, no new data needed.
3. A minimal, skippable first-launch framing screen (what Soumaya/Maya/the Galaxy are) — one
   screen, not a multi-step tour (no evidence a longer tutorial is needed).
4. Mobile input font-size pass (16px minimum on real text inputs) + a real-device check of
   keyboard/viewport behavior around ChatDock.
5. A small, bounded extension letting Maya's retrieval favor `journey_link`'d memories when the
   conversation is clearly about a specific Journey — modeled exactly on the existing "bounded to
   contextNodeIds" pattern already used for emotional/causal reasoning (Phases E/G), NOT a new
   subsystem. This one item should get its own short spec reviewed against the Phase K freeze
   policy before any code is written, since it touches the locked chat pipeline (even though the
   change itself is additive and small).

## 17. Explicitly deferred work

- Journeys/Financial Goals becoming full Galaxy citizens (real bodies with mass/orbit) — a larger,
  more invasive Galaxy-architecture change than this phase's evidence justifies rushing; the
  simpler "fly-to from their own panels" and "click opens something" gaps can likely be closed
  without it.
- Any Debt/Credit tracking feature — no evidence of user demand surfaced in this audit; flagged
  only as a scope observation, not a recommendation to build.
- A domain-level "what Maya used" transparency UI — real finding, but needs its own design pass
  (what would it actually say, and where) rather than a quick bolt-on.
- The z-index/offset maintainability risk — no live bug today; worth a proper shared-layout
  solution only if/when a new fixed element actually collides.
- Full mobile device-lab testing — this audit's mobile findings are code-confirmed but device-
  symptom-unconfirmed; a real-device pass would sharpen priority further.

---

## 18. Final scorecard (0–10)

| Dimension | Score | Why |
|---|---|---|
| Understanding | 4 | Zero product framing at first launch; understanding depends on either using it long enough to infer, or manually finding Help/Legend |
| Navigation | 6 | Dock is clear and well-labeled overall, but Mind hides several major concepts (including the flagship Life Vision) behind a generic name |
| Coherence | 6 | Data model is genuinely unified; presentation has specific, nameable fragmentation points (§14) |
| Financial OS | 7 | Deep and real — deterministic budget math, pay stubs, growth trends, afford calculator, Wealth buckets/goals, all cross-linked to Journeys; Debt/Credit simply isn't in scope yet |
| Life OS | 5 | The Vision→Goals→Journeys→Memory chain computes correctly once populated, but Vision itself is the hardest single thing to find in the whole app |
| Maya Integration | 6 | Citations/navigation/mood/askBack are genuinely well-executed in the chat UI; the Journey-linked-memory blind spot and lack of domain-level transparency hold this back |
| Galaxy | 5 | Visually rich with a real, thorough Legend, but Journeys/Goals are second-class citizens and cognitive-kind distinctions collapse in the inspector |
| Mobile UX | 5 | Deliberate, mostly-sound fluid design, but the PRIMARY chat input has a real iOS zoom issue and no keyboard-aware handling exists |
| Performance | 7 | The Galaxy render loop is already extensively optimized (Phases prior to this one); remaining product-level issues are modest and non-urgent |
| Trust | 6 | Citation chips, mood, and askBack labeling are honest and clear; the missing domain-level "what informed this" summary and the Journey blind spot are real gaps |

## 19. Final decision

**1. Single biggest product weakness:** Life Vision's discoverability — the concept the product's
own mission statement puts at the top of the Life OS hierarchy is the single hardest thing to find
in the entire app, and this was already flagged once before (Phase H) without the underlying UI
behavior actually changing.

**2. Single strongest part:** the unified, non-duplicated data model plus the Financial OS's real
depth (deterministic, cited, cross-linked to Journeys and Life Vision) — the "operating system"
claim is substantively true underneath the UI, and Journeys' own in-context explainer copy is the
best piece of unprompted product explanation anywhere in the app.

**3. What prevents full cohesion:** presentation and discoverability seams, not architecture —
Journeys/Goals being second-class Galaxy citizens, the generic "Concept" chip flattening real
distinctions, and zero first-launch framing.

**4. Top 5 improvements worth building** (see §16 for detail): Life Vision discoverability;
NodeInspector per-kind identity; a minimal first-launch framing screen; the mobile input/keyboard
pass; a small, bounded Journey-aware retrieval extension for Maya (spec'd separately given it
touches locked code).

**5. What should NOT be built:** another intelligence subsystem of any kind; a full Galaxy visual
redesign; a multi-step onboarding tutorial system; new Debt/Credit tracking (no demonstrated need).

**6. Is the current architecture sufficient for the next product stage?** Yes — every recommended
item is a presentation or wiring fix within the existing data model; none requires a new table, a
new intelligence subsystem, or an architectural rewrite.

**7. What should the next implementation phase actually be?** A scoped, spec-first "Product
Coherence & Discoverability" phase covering §16's five items, each gated individually, explicitly
not reopening Maya's locked reasoning core beyond the one small, precedented retrieval-bounding
change (itself gated behind its own short spec and Phase K policy review before any code is
written).

---

## Verification

No code was changed in this phase — every finding required either a design judgment call (Life
Vision promotion, NodeInspector redesign, onboarding copy) or touches the locked Maya pipeline,
neither of which clears this phase's own "trivial, extremely low-risk" bar for an in-phase fix.
Consistent with that: `git status` is unchanged by this audit beyond adding this document.

- `npm run typecheck`: clean (server, shared, web) — unchanged from baseline, no code touched.
- `npm test` (server): 844 tests passing — identical to the Phase J/K baseline.
- `npm test` (web): 320 tests passing — identical to the Phase J/K baseline.
- `npm run build -w @brain/web`: succeeds.
- Working tree: clean except this new document.
