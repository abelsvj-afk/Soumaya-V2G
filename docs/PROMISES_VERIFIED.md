# Promise verification — 2026-07-03

Every user-facing promise below was traced end-to-end and, where cheap, **proven by a
throwaway `npx tsx` script against the real routes** (in-memory DB, offline providers) —
not assumed from reading one file. Verdicts are post-fix; the "was" column records what
the sweep actually found.

| # | Promise | Was | Now | Fix shipped |
|---|---------|-----|-----|-------------|
| 1 | Reminders reach you when due | **PARTIAL** — Agenda *hid* a reminder the moment it came due; no alert chip; `remind_at` never cleared, so the digest's 5 oldest-first slots clogged with stale reminders forever | 🟢 | Agenda "🔔 Reminders due now" section with ✓ acknowledge; NotificationsBar due-reminder chip; `POST /nodes/:id/ack-reminder` clears + tends (tested) |
| 2 | Research questions flow (ask → notice → answer → clear) | 🟢 WORKS (proven roundtrip: chip → Details form → answer-research applies, clears, re-embeds) | 🟢 | — |
| 3 | Action items expire + you learn about it | 🟢 WORKS (60s sweep + heartbeat, hard-delete cascades, surfaces in daily/away/Telegram digests — proven) | 🟢 | — |
| 4 | Telegram daily digest actually pushes | 🟢 WORKS when `TELEGRAM_BOT_TOKEN`+`TELEGRAM_WEBHOOK_SECRET`+`PUBLIC_URL` are set (hourly sweep, idempotent per UTC day — proven with a collector send). Now also carries the Daily Contact question | 🟢 | — (env vars must be set on Fly for it to fire) |
| 5 | Contradiction scan finds conflicts | **BROKEN offline / near-inert** — flat 0.86 cosine gate; the planted "love my job / hate my job" pair measured **0.69** under hash embeddings → scan created 0 insights, always. "RECONCILE" badge had no affordance | 🟢 | Provider-aware gate (`contradictionOptionsFor`: 0.5 hash / 0.75 real); `POST /digest/insights/:id/resolve` + "✓ Reconciled" button (clears insight, warms both memories) — both tested |
| 6 | Beacons release when you warm the memory | **PARTIAL** — server reset entropy but the client copy only refreshed on a full graph refetch, so the beam never cut out mid-session | 🟢 | Optimistic client warm-up in `goTo` (entropy→0 on the live node object the 3D loop reads) |
| 7 | Lore/Chronicle evolves autonomously | 🟢 mechanism WORKS (autonomy loop evolves lore after every targeted job) — but chapters always read "burning bright": the composer got `entropy ?? 0` because repo rows never carry entropy | 🟢 | `evolveLore` computes real entropy (`entropyFrom(daysSinceTended, degree)`) |
| 8 | Synthesis → Insights tab → constellation promote → reconciliation | 🟢 WORKS (proven: hub + `summarizes` edges @0.9 + 384-d embedding stored; reconcile loop reads it) | 🟢 | — |
| 9 | Visitor activity accumulates | **PARTIAL** — the 20s flush lives in the rAF loop, which pauses in hidden tabs; no unload handler → the buffered tail silently lost on every close/background | 🟢 | `pagehide`/`visibilitychange` drain with `keepalive` fetch |
| 10 | Streak/fuel earn paths | 🟢 (covered by existing tests; Telegram `/log` now advances the streak too) | 🟢 | — |

## Known limits (accepted, not bugs)
- **No real-time push at the exact reminder minute.** Surfaces are: the alert chip +
  Agenda section (app open), the away report (on return), and the Telegram daily digest
  (phone). True web-push is a future feature, not a silent failure anymore.
- Offline (heuristic) research never generates clarifying questions — the form simply
  doesn't appear without a cloud key. By design.
- The server-side lore subjects for ship/station/beacon exist but only memory lore
  auto-evolves; the focus cards for craft recompute live client-side instead.
