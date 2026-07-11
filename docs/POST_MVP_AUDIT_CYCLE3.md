# Post-MVP Hardening — Cycle 3 (2026-07-11)

Third focused hardening pass, run at the user's "then MVP post-freeze" checkpoint after a
large feature burst since Cycle 2.

## Scope (surface added since Cycle 2)

Smart Lenses (+ lens suggestions), the whole client **animation system** (arc fly-to,
fly-to-isolate, converging-stream constellation formation, light-up sweeps, click/arrival/
select pulses, rank-up salvo), **Awards + Codex expansion** (14→30 awards, Mind-layer +
new phenomena), the **chart_discovery** tool + `codex_discoveries` table/route, the
**grounded-insight** chat toggle (+ weekly-review extension), the **Tender Squadron** fleet,
and the **navigation** rework (recenter that fits any-size galaxy, scaled ceiling/scenery/
far-plane, level-ship, continuous forward-travel, upright recenter, solid-colour background).

## Findings

**Verdict: clean.** No correctness, security, or perf defects found.

- **Multi-tenancy:** every new query across `lenses`, `codex_discoveries`, the chart_discovery
  + weekly_review tools, and the inquiry lens/hub candidates is `space_id`-scoped
  (grep-verified; lens + hub-suggestion isolation is unit-tested).
- **Migrations:** the two new tables (`lenses`, `codex_discoveries`) are bootstrap
  `CREATE TABLE IF NOT EXISTS`; `space_meta.grounded_insight` is a guarded additive
  `migrateSchema` column (default 1). `migration.test.ts` green (idempotent on an existing
  volume).
- **Offline-safe:** the new tools (chart_discovery, weekly_review) are deterministic; the
  grounded-insight block is prompt-only (no hard dependency); the heuristic fallback path is
  untouched.
- **Route validation:** `lenses` uses a `.strict()` zod DSL (unknown keys rejected);
  `persona/grounded-insight` zod-validates; `codex/discoveries` is a read-only GET.
- **Per-frame cost (the "don't make her too fast / burn fuel" constraint) — respected:**
  the animation + fleet additions are visual only and bounded — Tender drones capped at 5,
  converging streams ≤ 8, light-up sweeps ≤ 6, one selected-body pulse, all reduced-motion-
  safe. NONE touch `maintenance/agent.ts`, her flight speed, or the fuel economy. The 8th
  router tool (chart_discovery) is rate-limited to 1/day like her other tools.

## Outcome

Gate green — typecheck · **307 server + 32 web tests** · web build. No fixes required;
the surface was built to the house rules (tests per feature, space-scoping, additive
migrations, offline fallback). **Freeze lifted** — clear to keep shipping under the lighter
loop. Re-run this pass before the next *major* expansion.
