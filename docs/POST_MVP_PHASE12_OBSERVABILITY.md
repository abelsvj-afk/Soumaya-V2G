# Post-MVP — Phase 12: Observability & Monitoring

**Owner:** Claude · **Date:** 2026-07-10 · **Workflow:** [`AI_ENGINEERING_WORKFLOW_POST_MVP.md`](./AI_ENGINEERING_WORKFLOW_POST_MVP.md)

> A production system should explain what it's doing, and failures should be visible before users
> report them. This is a **single-container, two-person** deployment, so the bar is "detectable +
> diagnosable," not a full APM stack.

## What shipped this phase

**`GET /api/health` is now a real dependency probe** (was: static provider info). It runs a live
`SELECT 1` against SQLite and returns **HTTP 503** when the DB handle is dead, plus `uptimeSec`, so an
external uptime pinger can actually detect an outage instead of a blind 200. LLM `degraded` is
reported but never fails the check (the offline heuristic is a normal, functional state).

```jsonc
GET /api/health → 200 (or 503 if DB down)
{ "ok": true, "uptimeSec": 4213, "db": { "ok": true },
  "embeddings": { "model": "…", "dim": 384 },
  "llm": { "model": "…", "available": true, "degraded": false } }
```

## Logging standards

| Event class | Where | Level |
|---|---|---|
| Startup / boot | `index.ts` (`[BOOT]`, autonomy loop "ON") | info |
| Autonomy actions | per-space tick logs (gravity, dedup, chapters, tool actions `[tools]`) | info |
| Errors | central Express-5 error handler + `console.error` in every `try/catch` | error |
| LLM degradation | `ResilientLlmProvider.note()` on cloud failure → offline fallback | warn |
| Background sweeps | digest push, reminder fires, expiry sweeps | info |
| **Never logged** | passcodes, tokens, API keys, PII (verified Phase 9) | — |

**Standard:** every failure is logged with context (space id prefix, ids, the operation) and
**handled** (degrade/skip), never swallowed silently — the "no silent failures" principle. Logs go
to the container's stdout/stderr (Fly captures them; `fly logs` to tail).

## Operational metrics catalog

| Metric | Source today |
|---|---|
| Uptime / DB health | `GET /api/health` (new) |
| API spend (USD, deployment-wide) | `usage.ts` budget meter; `overBudget()` trips the offline fallback |
| Token usage | `UsageTracker` (per cloud call, prompt+completion) |
| Fuel (per brain) | `space_meta.fuel`; low-fuel alert chip |
| Retrieval accuracy / grounding | measured in tests (Phase 4), not live-metered |
| Crash/error surfacing | in-app alert chips (LLM degraded, low fuel, overdue); global error bar |

**In-app monitoring the user already sees:** the top alert chips (low fuel, cloud-LLM
degraded/offline, overdue actions, pending questions) surface problems the moment they occur — the
user is the first-line monitor.

## Health-check usage (recommended)

Point any free uptime monitor (e.g. an UptimeRobot HTTP check) at
`https://brain-soumaya-v1.fly.dev/api/health` on a 5-min interval — it alerts on 503 or timeout.
Fly's own dashboard covers CPU/memory/restart metrics for the container.

## Incident response checklist

1. **Detect** — health 503 / uptime alert / an error chip / a user report.
2. **Triage** — `fly logs` (tail stderr); hit `/api/health` to see which dependency (DB vs LLM).
3. **Root cause** — DB down → volume/boot issue; LLM 5xx/quota → provider (app auto-degrades to
   heuristic, so it stays up); crash-loop → check the last deploy.
4. **Resolve** — restart (`fly apps restart`) / rollback (`fly releases rollback`, safe because
   migrations are additive — see the Phase 5 playbook) / rotate a leaked secret (`fly secrets set`).
5. **Document** — note the cause in `GEMINI_CHANGES.md`.
6. **Prevent** — add a regression test if it was a code bug.

## Gaps (documented, accepted at this scale)

- 🟡 No aggregated error dashboard / structured log shipping — stdout + `fly logs` suffices for two
  users; add structured logging + a sink (e.g. Logtail) if it grows.
- 🟡 No live retrieval-accuracy/latency metering — pinned by tests instead (Phase 4).
- 🟡 No external uptime monitor is *configured* — the endpoint is now ready for one (above).

## Deliverables

Logging Standards · Operational Metrics Catalog · Incident Response Checklist · Monitoring plan
(this doc) — plus the shipped `/api/health` dependency probe.

**Verdict:** 🟢 observability is now **adequate for the deployment's scale** — a genuine health probe
for external monitoring, consistent error logging, in-app alerting the user sees first, and a clear
incident runbook. The remaining gaps are appropriately deferred until the user base grows.
