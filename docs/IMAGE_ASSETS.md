# Soumaya · Image-Asset Generation Brief

> A prioritized, copy-paste-ready list of everything currently drawn with an **emoji
> placeholder** that would be stronger as **real generated artwork**. Work top-to-bottom:
> each **Tier** is a self-contained batch — finish a whole tier before the next so you
> never end up with a half-illustrated section.
>
> **How to use:** hand each row's **Prompt** to an image-generation agent. Every prompt
> already carries the shared art direction, so the whole set comes back as one cohesive
> family. Save each asset to the **Save as** path; the code swap-in notes are in the last
> column so a dev (or `agy`) can wire them.
>
> Two asset formats appear:
> - **Icon** — a square PNG with a transparent background, read at ~24–64px in cards /
>   the Codex / the Legend. Crisp, centered, minimal.
> - **Body/Model art** — a larger square hero render (transparent or deep-space bg) for a
>   celestial body / craft / megastructure shown big when focused. (For the 3D craft that
>   already load a `.glb`, this hero art is the Codex/Hangar thumbnail, not the model.)

## Shared art direction (prepend is already baked into every prompt below)

> *Cohesive set for "Soumaya," a serene 3D memory-galaxy. Style: luminous celestial
> sci-fi, painterly-but-clean, soft volumetric glow, deep-space palette (indigo/black
> ground) with a warm-gold + cool-cyan accent language. Centered subject, square 1:1,
> transparent background unless noted, no text, no UI, no border, gentle bloom.*

---

## TIER 1 — The Fleet (do first)

**Why first:** the fleet is the most-watched moving thing in the app, it's the current
focus of UX work, and it currently leans on generic craft emoji (two of which collided).
Six assets; do all six together so the crew reads as one designed squadron.

| # | Asset | Current emoji | Where it shows | Format | Save as | Prompt |
|---|-------|---------------|----------------|--------|---------|--------|
| 1.1 | **Soumaya** (commander ship) | 🛸 | `graph/fleet.ts`, Codex, Hangar hull, focus menu, ObjectLoreCard | Body/Model art | `packages/web/public/art/fleet-soumaya.png` | *(shared direction) A sleek, friendly solo starship — the caretaker vessel of the galaxy — smooth white-and-warm-gold hull, a single calm cyan cockpit-eye, soft engine glow, poised as if gently tending. Elegant, non-military, a little cute. Hero 3/4 view.* |
| 1.2 | **Waystation Soumaya-Prime** (home base) | 🌐 | `fleet.ts`, Codex, Hangar figurine, focus menu | Body/Model art | `packages/web/public/art/fleet-station.png` | *(shared direction) A graceful orbital megastructure — a ringed waystation with warm-lit docking bays and slow-spinning habitat rings, the fleet's anchor. Awe-inspiring but welcoming. Deep-space background allowed.* |
| 1.3 | **Aura-class Beacon** (warmth relay) | 📡 | `fleet.ts`, Hangar figurine, Help, Codex | Body/Model art | `packages/web/public/art/fleet-beacon.png` | *(shared direction) A small salvaged relay-satellite firing a warm amber tractor-beam downward, dish + solar wings, the beam tinted gold. Reads as "keeping something warm." Lonely, tender, glowing.* |
| 1.4 | **Scout** (frontier survey probe) | 🛰️ | `fleet.ts`, Help | Body/Model art | `packages/web/public/art/fleet-scout.png` | *(shared direction) A fast, sleek survey probe with a forward sensor array and cyan scanning glow, built for darting to the newest edge of the galaxy. Curious, quick, streamlined — visibly different from a relay satellite.* |
| 1.5 | **Defender** (guardian) | 🛡️ | `fleet.ts`, Help | Body/Model art | `packages/web/public/art/fleet-defender.png` | *(shared direction) A compact guardian interceptor projecting a faint hexagonal energy shield, poised protectively over a bright hub-star. Calm sentinel, not aggressive — soft blue shield light.* |
| 1.6 | **Visitor** (alien drifter) | 👽 | `graph/visitors.ts` (name), Browse counts, focus menu | Body/Model art | `packages/web/public/art/visitor.png` | *(shared direction) A small curious alien drifter craft — organic, iridescent, slightly eerie but harmless — wandering the dark, drawn to bright memories. Bioluminescent teal/violet.* |

---

## TIER 2 — Celestial body classes (the whole galaxy)

**Why second:** *every* memory renders as one of these seven classes — the single
highest-frequency visual in the product. They currently use geometric glyphs
(`▪ ○ ◍ 🪐 ◉ ★ ✸`) in the list, Legend, Inspector and Codex. Real class thumbnails make
"body size = how much it matters" legible at a glance. Do all seven as one graded set so
mass reads as a clear progression.

Source of truth: `packages/shared/src/celestial.ts` → `CELESTIAL_ICON`, `CELESTIAL_LABEL`,
`CELESTIAL_MEANING`.

| # | Class | Current glyph | Meaning | Save as | Prompt |
|---|-------|---------------|---------|---------|--------|
| 2.1 | asteroid | ▪ | a new/fleeting thought, barely massed | `public/art/class-asteroid.png` | *(shared direction) A tiny dim rocky asteroid, cold grey, barely lit — the smallest, newest body. Icon.* |
| 2.2 | moon | ○ | a small memory finding its orbit | `public/art/class-moon.png` | *(shared direction) A small pale cratered moon catching a little light. Icon.* |
| 2.3 | planet | ◍ | an established memory with real weight | `public/art/class-planet.png` | *(shared direction) A solid terrestrial planet, subtle atmosphere, established and calm. Icon.* |
| 2.4 | gas_giant | 🪐 | a heavy, well-connected memory | `public/art/class-gasgiant.png` | *(shared direction) A banded gas giant with a faint ring, weighty and luminous. Icon.* |
| 2.5 | giant | ◉ | a major anchor in your thinking | `public/art/class-giant.png` | *(shared direction) A large glowing giant world radiating warm light, clearly a major anchor. Icon.* |
| 2.6 | star | ★ | important, luminous, deeply connected | `public/art/class-star.png` | *(shared direction) A brilliant burning star with soft corona, radiant and important. Icon.* |
| 2.7 | supergiant | ✸ | one of the great weights of your galaxy | `public/art/class-supergiant.png` | *(shared direction) A colossal supergiant star, blazing, the greatest weight in the galaxy, intense bloom. Icon.* |

---

## TIER 3 — Cognitive bodies (the Mind layer)

**Why third:** the new **Mind** tab renders these nine as first-class galaxy bodies, each
with its own color already defined. They're prominent and currently pure emoji. Keep each
prompt's color locked to the code value so art and render agree.

Source of truth: `packages/shared/src/celestial.ts` → `COGNITIVE_META` (icon + color + blurb).

| # | Kind | Emoji | Color | Save as | Prompt |
|---|------|-------|-------|---------|--------|
| 3.1 | Goal | 🎯 | `#ff9d3c` amber | `public/art/cog-goal.png` | *(shared direction) A warm amber-orange anchor-star that lighter bodies visibly orbit — a long-term aim exerting gravity. Icon.* |
| 3.2 | Idea | 💡 | `#8fdcff` cyan | `public/art/cog-idea.png` | *(shared direction) A flickering unstable cyan-white spark-star, a potential not yet fixed, could grow or fade. Icon.* |
| 3.3 | Skill | 🧬 | `#9dff8a` lime | `public/art/cog-skill.png` | *(shared direction) A lime-green helix of light that brightens with mastery — a capability. Icon.* |
| 3.4 | Person | ❤️ | `#ff9ec7` rose | `public/art/cog-person.png` | *(shared direction) A warm rose star that others orbit — a person at the center of a small system. Soft, human warmth. Icon.* |
| 3.5 | Identity | 🏛️ | `#fff4d6` white-gold | `public/art/cog-identity.png` | *(shared direction) A massive serene white-gold core star, steady and foundational — who you are. Icon.* |
| 3.6 | Mental Model | 🧠 | `#c9a6ff` violet | `public/art/cog-mentalmodel.png` | *(shared direction) A violet lens/prism of light — a reasoning tool that refracts thought. Calm, geometric. Icon.* |
| 3.7 | Intention | 🌠 | `#ffe9a8` pale gold | `public/art/cog-intention.png` | *(shared direction) A pale-gold comet streaking through the dark — a short-lived plan passing through. Icon.* |
| 3.8 | Future Event | ⏳ | `#a8d8ff` pale blue | `public/art/cog-futureevent.png` | *(shared direction) A pale-blue marker on the horizon of space, a scheduled point ahead, faint hourglass motif. Icon.* |
| 3.9 | Motivation | 🔥 | `#ff7a45` ember | `public/art/cog-motivation.png` | *(shared direction) An ember-orange gravity well glowing at its core, a drive that pulls behavior inward. Icon.* |

---

## TIER 4 — Deep-space megastructures (Hangar monuments)

**Why fourth:** unlockable prestige monuments — rare, high "wow," but only seen once
earned/previewed. Currently emoji in the Hangar + focus HUD. Bespoke hero art here is a big
payoff for the players who reach them.

Source of truth: `App.tsx` focus-icon resolver + `components/HangarPanel.tsx`.

| # | Monument | Emoji | Unlock | Save as | Prompt |
|---|----------|-------|--------|---------|--------|
| 4.1 | Solar Monument | 🌟 | 100 memories | `public/art/mega-solar.png` | *(shared direction) A radiant solar monument — a captured miniature sun in an ornate orbital frame. Hero render, deep-space bg.* |
| 4.2 | Dyson Megastructure | 🪐 | 250 memories | `public/art/mega-dyson.png` | *(shared direction) A partial Dyson swarm — panels encircling a star, awe-inspiring engineering, warm light leaking through gaps. Hero render.* |
| 4.3 | Quantum Singularity Core | 🌌 | achievement | `public/art/mega-quantum.png` | *(shared direction) A quantum core — a caged shard of folded spacetime, violet and cyan energy lattice. Hero render.* |
| 4.4 | Synapse Hyper-Array | 📡 | achievement | `public/art/mega-hyperarray.png` | *(shared direction) A vast array of linked relay dishes forming a neural lattice across space — a "synapse" of the galaxy. Hero render.* |
| 4.5 | Aegis Shield Spire | 🛡️ | achievement | `public/art/mega-aegis.png` | *(shared direction) A towering defense spire projecting a planetary shield dome, calm blue energy. Hero render.* |
| 4.6 | The Singularity (black hole) | 🕳️ | 365 memories | `public/art/mega-singularity.png` | *(shared direction) A real black hole with a luminous swirling accretion disk, gravitational lensing, the rarest prestige monument. Hero render, dramatic.* |
| 4.7 | Monument (fallback) | 🗿 | — | `public/art/mega-fallback.png` | *(shared direction) A mysterious monolithic space monument, neutral, used when a specific one isn't set. Hero render.* |

---

## TIER 5 — Badges & phenomena medallions (lowest priority)

**Why last:** these are collectible **badges** (achievements + Codex "phenomena"). They read
fine as emoji today, but bespoke medallion art both looks premium AND resolves several of the
emoji collisions below (e.g. an achievement sharing an emoji with a live feature). Only start
this tier once 1–4 are done. Treat as one coherent medallion set (circular emblem, engraved,
warm-gold rim on dark).

Sources: `components/achievements.ts` (14 awards) and `components/codex.ts` phenomena
(First Synapse 🔌, Ignition ★, Deep Cluster 🧲, Ancient Light 🕰️, The Cold ❄️, The Gardener 🌿).
Generate each as: *(shared direction) A circular collectible achievement medallion, engraved
relief of {SUBJECT}, warm-gold rim, dark enamel center, subtle glow. Icon.* — filling `{SUBJECT}`
from each award's name/theme (e.g. "Galaxy Reader" → an open eye over a constellation).

---

# Appendix — Emoji collision map (fix these regardless of art)

Distinct things currently share one emoji, which is confusing. **Already fixed this pass:**
the Fleet's beacon/scout/defender now use `📡 / 🛰️ / 🛡️` (was `🛰️ / 🛰 / 🚀` — beacon & scout
were the same satellite). Remaining recommended reassignments (safe = display-only, low ripple):

| Emoji | Conflicting meanings | Recommended fix |
|-------|----------------------|-----------------|
| 🛰️ | Soumaya tab **and** Scout **and** beacon-focus HUD | Keep 🛰️ = Scout/satellite; give the **Soumaya dock tab** her ship 🛸 (or a portrait icon); make the **beacon focus button** 📡 to match the beacon. |
| 🪐 | gas-giant class · Dyson monument · Hubs subtab · drifting memories | Keep 🪐 = gas-giant (celestial). Hubs → 🌠 or a cluster glyph; drifting → 🌑; Dyson keeps 🪐 only in Hangar. |
| 🌌 | Constellations · Quantum Core · "Sector Pioneer" award · default digest | Keep 🌌 = Constellations. Award → medallion (Tier 5); Quantum Core → 🔮; default digest → 🛰️(Soumaya). |
| 📡 | Hyper-Array · sync-toast · "Sentinel Command" award · Aura Beacon | Make 📡 = **Aura Beacon** (fleet) everywhere; Hyper-Array → 🕸️; sync toast → 🔄; award → medallion. |
| 🧠 | Mind tab · Mental Model body · "Nexus" award | Keep 🧠 = Mind tab. Mental Model → 🔮 or a lens glyph; award → medallion. |
| 🔥 | daily streak · Motivation body | Keep 🔥 = Motivation. Streak → a flame-with-number chip or 🔆. |
| 🎯 | focus/target menu · Goal body · Undertaking title | Keep 🎯 = Goal. Focus menu → 🧭; Undertaking → 🚩. |
| 🛸 | Soumaya ship/fleet · research-question card | Keep 🛸 = Soumaya. Research-question → 🛰️? no — use ❓-on-card or 🔬. |
| 🖤 | Belief · "heavy" emotion tone | Keep 🖤 = Belief. Heavy tone → 💙 (indigo) to match link color. |
| 📖 | Codex · daily_log digest · "Galactic Atlas" award · Chronicle | Keep 📖 = Codex. daily_log → 📓; Chronicle → 📜; award → medallion. |
| 📚 | Browse tab · Library · Companion Knowledge | Keep 📚 = Browse. Library → 📂; Knowledge → 📗. |
| 🔭 | Observatory · isolate/enter a system | Keep 🔭 = Observatory. Isolate-system → 🎛️ or ⊙. |
| 🔍 | Search · Soumaya self-check | Keep 🔍 = Search. Self-check → 🧪. |
| 🔔 | Inbox tab · reminders-due | Keep 🔔 = Inbox. Reminder-due → ⏰ (already used for reminder time — unify). |
| 🚀 | Fleet section header · (was Defender) · inbox-cleared | Header 🚀 ok now (Defender moved to 🛡️); inbox-cleared → 🎉. |
| ⚙️ | Settings · node "Writing…" state | Keep ⚙️ = Settings. Writing… → 🌀. |
| ✨ / ✦ | broad decorative overload (Insights, demo, distill, trails, provenance…) | Reserve ✨ = Insights; use 🧪 for demo, 🪄 for distill (already), keep ✦ only for "charted-by-Soumaya" provenance. |

> These are display-only string swaps (no logic depends on the emoji), so they can be applied
> incrementally without risk. The Tier-5 medallions above make most of the *achievement-vs-feature*
> rows moot on their own.
