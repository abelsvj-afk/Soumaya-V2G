# Spec — "While you were away" companion digest + 24/7 autonomy

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). Status: **✅ SHIPPED 2026-06-30.**
> The keystone recommendation from `docs/UX_AUDIO_HABIT_AUDIT.md`: turn the app from a storage box into
> a companion that works while you're away and greets you with what it did.

## Objective
On return, show a short, honest digest of what changed **since your last visit** — what Soumaya did
autonomously, plus what now needs you — and make her 24/7 background work actually happen by default.

## Two parts
1. **Autonomy on by default.** The server loop already exists (`index.ts`, `AUTONOMY=on`, currently
   off). Flip the default so it runs unless `AUTONOMY=off`. It's already fully gated: free upkeep always
   runs, but LLM/paid work still needs Research Mode + USD budget + Fuel, and `withClaim` idempotency
   means the server + an open browser tab can't double-run a job. So default-on can never overspend.
2. **The welcome-back digest.** Track each brain's last visit; compute what happened since; surface it.

## Data model
- Add `last_seen_at TEXT` to `space_meta` (additive, raw-SQL migration like the streak columns).
- `agent_logs.created_at` already timestamps every autonomous action → the "what she did" source.

## Server
- `analysis/awayDigest.ts` → `buildAwayDigest(handle, spaceId, nowMs?)`:
  - Reads the *previous* `last_seen_at` (does NOT mutate).
  - `agentActions`: group `agent_logs` since `last_seen_at` by type into human lines —
    synthesis→"connected N related memories", research→"deep-dived N memories", merging→"fused N
    duplicates", sector_vibe→"charted N sectors", daily_log→"wrote a daily log". (patrol/pruning/etc.
    omitted as routine.)
  - `newContradictions`: count of `insights` (kind='contradiction') created since.
  - `expiredActions`: count of `agent_logs` action='action_expired' since (the always-on sweep logs these).
  - `dueReminders`: `nodes.remind_at` that fell between `last_seen_at` and now (id + label).
  - `resurfaced`: the top `buildDormantList` item, if any ("resurfaced a note from X ago").
  - `cooling`: count of memories cooling from neglect (`last_tended_at` > 14d).
  - `since`, `awayMs`, `greeting` (in-character), `isEmpty` (true when nothing worth showing).
  - Heuristic + offline; no LLM, no token cost.
- Routes (mounted under `/api/digest`):
  - `GET /away` → `buildAwayDigest` (read-only).
  - `POST /away/seen` → set `last_seen_at = now` (advances the window).
- Shared `AwayDigest` type.

## Web
- `client`: `getAwayDigest()`, `markAwaySeen()`.
- `WelcomeBackCard` overlay: on app load, fetch the digest; if `awayMs ≥ 1h` and `!isEmpty`, show a
  calm card — greeting + the action lines + due reminders (click to fly) + a resurfaced memory + a
  "cooling" nudge — with an "Enter the galaxy" dismiss. On dismiss → `markAwaySeen()`. If the card
  isn't shown (too-soon or empty), silently `markAwaySeen()` so the baseline still advances.
- Help entry ("While you were away").

## Guardrails
- First-ever visit (`last_seen_at` null) → `isEmpty`, no card; the POST seen sets the baseline.
- A quick refresh (< 1h away) never nags — card is suppressed, window still advances.
- Everything offline-safe + space-scoped; migration additive/idempotent.

## Verification
- Server test: `buildAwayDigest` groups agent_logs since a seed `last_seen_at`, counts contradictions/
  reminders/expired, and returns empty for a fresh brain. Gate green. Then Help + changelog.
