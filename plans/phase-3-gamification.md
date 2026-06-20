# Phase 3 — Celestial Economy (Fuel & Entropy)

> **Status: IMPLEMENTED v1 (red zone — Claude's jurisdiction).**
> Reconstructed from `GEMINI_CHANGES.md` (the original file was never committed),
> then built per the user's direction: **Entropy = cosmetic aging + a "tend me"
> rescue nudge**, **Fuel = earned currency that powers Soumaya** (on top of the
> USD budget). Schema is additive + space-scoped; the economy runs free/offline.
>
> Shipped: `nodes.last_tended_at` + `space_meta(fuel)` (additive migrations);
> `entropyFrom()` in shared; `economy.ts` (earn/spend/gate, space-scoped); fuel
> earned on ingest/links/action-clear and spent+gated on autonomous LLM jobs;
> `entropy` enriched on every read; tend-on-focus/edit/synthesize + `POST
> /nodes/:id/tend`; digest "going cold" list; fuel gauge in the Command Center.
> Tests cover fuel earn/spend/gate/isolation + entropy cool/reset.

## Intent (from the title + the existing app)
A light "game layer" that makes tending your galaxy feel rewarding:
- **Fuel** — a resource tied to Soumaya's autonomous work.
- **Entropy** — neglected memories visibly "cool"/age until you tend them.

Gemini already shipped (green zone) the cosmetic half of entropy: memories
**redshift as they age while unconnected** (`star age tints`), plus the
serendipity **Flashback Comet**. Phase 3 would formalize this into a system.

## Hard guardrails (the user's prior rulings — must hold)
- **"Memories can't be destroyed."** Entropy must NOT delete memories or silently
  drop edges. Soft/cosmetic only, always reversible by tending.
- **"Growth = connections + significance, not age."** Age must not reduce a
  memory's mass; aging is a *prompt to act*, not a penalty to the graph.
- **No new always-on token spend.** Anything LLM-backed stays Research-Mode +
  budget gated. The economy itself must run free/offline.
- Everything **space-scoped** (multi-tenancy) and **additive/idempotent**
  migrations (so an existing Fly volume upgrades without crashing).

## Proposed schema (additive)
- `nodes.last_tended_at TEXT` — set on create and whenever the memory is
  focused/edited/linked/synthesized. Drives entropy (time since tended).
- `settings` (global) or per-space `space_meta`: `fuel` (number). Fuel is the
  deployment/brain's "energy" for autonomous work.
  (All columns nullable with safe defaults; added in `migrateSchema`.)

## Mechanic A — Entropy (recommended: "cosmetic + nudge")
- A memory's **entropy** = f(days since `last_tended_at`, degree). Unconnected,
  long-untended bodies cool/dim/desaturate (extends Gemini's redshift); hubs and
  recently-tended bodies stay bright. Purely visual + a soft "needs attention"
  marker in the digest.
- **Tending restores it:** focusing, linking, editing, or synthesizing a memory
  resets `last_tended_at` → it warms back up. This rewards revisiting without ever
  harming the data.
- Optional escalation (only if the user wants gameplay): very high-entropy bodies
  attract a "drift" visitor or a faint warning glow — never destruction.

## Mechanic B — Fuel (recommended: "earn by tending, spend on autonomy")
- **Earn** fuel (free) by adding memories, completing action items, and forging
  links — tending the galaxy generates energy.
- **Spend** fuel on Soumaya's autonomous LLM jobs, layered ON TOP of the existing
  Research-Mode + USD budget gate (fuel is the free in-app currency; the USD
  budget remains the real hard cap). At zero fuel the agent idles on free upkeep.
- Surfaced as a gauge in the Soumaya Command Center next to the API budget.

## Open questions for the user (drives implementation)
1. **Entropy:** cosmetic-only aging (recommended), or also soft gameplay (e.g.
   high-entropy bodies need "rescue" before a timer, à la action items)?
2. **Fuel:** a real gameplay currency that gates the agent, or just a cosmetic
   gauge mirroring the API budget?
3. Scope: per-brain (space-scoped) fuel — yes (assumed).

Once these are answered, implement schema (additive migration) → free
earn/spend + entropy services (space-scoped) → UI gauges + digest hooks → tests.
