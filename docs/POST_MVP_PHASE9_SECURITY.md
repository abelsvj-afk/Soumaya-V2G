# Post-MVP — Phase 9: Security Review

**Owner:** Claude · **Date:** 2026-07-10 · **Workflow:** [`AI_ENGINEERING_WORKFLOW_POST_MVP.md`](./AI_ENGINEERING_WORKFLOW_POST_MVP.md)

> Security is continuous, never "finished." This is a focused review of the standard areas, with one
> finding fixed this pass.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| **S1** | Low | The **admin-token** check (`usage.ts`, guards deployment-wide budget changes) used a plain `!==` string compare — **not constant-time**, so response timing could leak the token byte-by-byte. | 🟢 **Fixed** — now `timingSafeEqual` (matching the passcode + Telegram-webhook checks). |
| S2 | Info | `cors()` is wide-open (all origins). | 🟢 Accepted — auth is an explicit `x-space-id` **header** (not a cookie), so there's no ambient credential to steal via CSRF, and prod serves API + web **same-origin**. Documented; tighten to an allowlist only if a separate web origin is ever introduced. |

## Review by area

### Authentication — 🟢
- Name + passcode (no email/PII). Passcodes are **salted + `scryptSync`-hashed**; verification uses
  **`timingSafeEqual`** (`auth/spaces.ts`). The returned random space id is the bearer key
  (localStorage → `x-space-id` header). Auth endpoints are **rate-limited** (`AUTH_RATE_LIMIT_MAX`,
  default 10/min) to blunt passcode brute-force.

### Authorization — 🟢
- Every `/api` data route is behind `requireSpace` (`guard`) — verified: no data route is
  unguarded. Routes read the space via `spaceOf(res)` and pass it to **space-scoped repositories**,
  so a request can only ever touch its own brain (multi-tenant scoping audited clean in Phase 3).
- The one cross-tenant control (budget/usage) is **admin-token gated, fail-closed** (403 when
  `ADMIN_TOKEN` is unset) — now constant-time (S1).

### Input validation & injection — 🟢
- **Every route validates its body with zod** and returns 400 on bad input; `express.json` caps
  body size (1 MB API / 8 MB ingest).
- **SQL:** all values are bound via prepared-statement **parameters** (`?`). The few `${…}`
  interpolations are **hardcoded identifiers** (table/column names from const lists —
  `TABLES_WITH_SPACE`, vec table/pk, `PRAGMA table_info`, a SQL-fragment constant), never request
  data — SQLite can't parameterize identifiers, so this is the correct safe pattern.
- **FTS injection:** the keyword search sanitises the query (tested — a `"` + `NEAR/` payload
  doesn't throw, `hybridSearch.test.ts`).
- **XSS:** no `dangerouslySetInnerHTML` / `innerHTML=` anywhere; `MarkdownView` renders **real React
  nodes** (auto-escaped), not HTML strings.
- **No** `eval` / `new Function` / `child_process` / shell exec in the codebase.

### Secrets management — 🟢
- API keys, admin token, Telegram token live in **env / Fly secrets**, never in source (enforced by
  the house rule + verified). Cloud providers degrade to the offline heuristic if a key is pulled.

### Logging — 🟢
- No passwords, tokens, or passcodes are logged; agent/console logs carry labels + ids, not secrets.

### Transport / headers — 🟢
- `securityHeaders`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`. `trust proxy` set for correct client IPs behind Fly. HTTPS is
  terminated at Fly. In-memory `rateLimit` on `/api` (default 120/min).

### Dependency security — 🟡
- Lean, active dependencies (Phase 2). `npm audit` reports **1 low-severity** advisory (from the
  newly-added dev-only test tooling) — **dev-only, not shipped**; not a runtime risk. Re-run
  `npm audit` at each dependency bump.

## Deliverables

Security Audit Report (this doc) · Vulnerability Register (S1 fixed, S2 accepted) · the fix shipped.

**Verdict:** 🟢 the app's security posture is **strong** — hashed+timing-safe auth, complete
route-level authorization, space-scoped data isolation, zod validation everywhere, parameterized SQL,
no XSS/eval/exec, secrets in env. S1 (timing) is closed; S2 (open CORS) is a documented, accepted
non-issue given header-based (non-cookie) auth on a same-origin deployment.
