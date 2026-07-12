# Financial OS — Decisions (resolving the architecture open questions)

> Resolves the "open questions for sign-off" in [architecture.md](./architecture.md) §11 so the design is
> complete enough to enter roadmap/task-generation. ADR-lite: each decision states the choice, why, and
> what it defers. These are Claude's architect decisions; the user can override any before implementation.

## D1 — Raw blob storage & at-rest protection
**Decision:** Store raw uploads (images/PDFs) as **files on the Fly persistent volume** (same volume as
SQLite, under a per-space subdirectory), referenced by `fin_source.blob_ref`; **never** inline blobs in DB
rows or API responses. Stage 1 relies on volume + OS file permissions + space-scoped access checks.
**App-level encryption of raw blobs is a Stage 2 hardening item** (encrypt-at-write with a per-deployment
key from a Fly secret; DB stays as-is).
**Why:** Matches how the app already persists data (single volume), keeps rows small, avoids a premature
crypto dependency while still isolating access by space. **Defers:** at-rest encryption to Stage 2, and any
object-store/CDN offload (not needed at this scale).

## D2 — Currency & accounts
**Decision:** Stage 1 = **one currency + one adjustable balance per space** (`fin_account`, single row).
Multiple accounts and multi-currency are **deferred to Stage 3** (the schema already keys `fin_account` by
id + `space_id`, so adding rows later is additive; no migration pain).
**Why:** The MVP's job is a trustworthy single Safe-to-Spend number; multiple accounts add reconciliation
complexity that doesn't change the core value. **Defers:** multi-account budgeting, transfers, FX.

## D3 — Balance source of truth
**Decision:** Stage 1 balance is **user-set-and-adjustable** (they enter/confirm their current balance;
income/expenses adjust it going forward). Stage 2 adds a **reconcile flow**: compare the running balance
against ingested net flow and offer a one-tap "set balance to $X" correction, with a visible last-reconciled
timestamp.
**Why:** Screenshot ingestion is never 100% complete (cash, missed uploads), so a derived-only balance
would drift and lose trust fast. A user-anchored balance that ingestion nudges is honest and correctable.
**Defers:** automatic balance derivation to the Stage 2 reconcile flow.

## D4 — OCR/vision provider (first implementation)
**Decision:** **Reuse the existing LLM vision path** (Gemini/OpenAI vision behind the LLM seam) as the
first `vision-llm` `OcrProvider`, with the **heuristic paste/text parser as the always-available offline
provider** and a resilient wrapper between them. A dedicated OCR engine (Tesseract/cloud OCR) is a **later,
optional** `OcrProvider` behind the same interface — only if extraction accuracy demands it.
**Why:** No new heavy dependency; reuses the configured provider and the flat-zod-`responseSchema` pattern;
degrades cleanly to manual/paste with no key. **Defers:** bespoke OCR engine until measured need.

## D5 — Balance/PII redaction scope for LLM
**Decision:** By default, the AI Orchestrator receives **only the aggregated `FinancialSnapshot`** (totals,
reserved lines, safe-to-spend, upcoming bills, active goals) — **never raw statement images or full
transaction logs**. Raw-document Q&A is **opt-in per space** via a settings toggle (default off).
**Why:** Minimizes sensitive data leaving the deployment while keeping useful Q&A. **Defers:** granular
per-document sharing controls.

## D6 — Where "financial intent" lives (fact vs. meaning split)
**Decision:** Financial **facts** live in `fin_*` relational tables (Budget Engine owns the SQL). Financial
**intent/goals** (pay off car, save for apartment) live as **existing knowledge-graph goal/intention
nodes**, joined via `fin_goal_link`. No money rows are denormalized into the graph.
**Why:** Keeps the graph clean (it already models goals with gravity) while letting the Orchestrator reason
across money + goals. Consistent with the "enrich on read, don't denormalize" convention. **Defers:**
nothing material; this is the intended integration point with the Second Brain.

## D7 — Feature flag / rollout
**Decision:** The module ships behind a **Financial tab** and a per-space **enable flag** (default off for
existing spaces, opt-in). Nothing about the galaxy/memory experience changes for users who never enable it.
**Why:** Fully additive; lets us dogfood with the primary user before broad exposure. **Defers:** nothing.

---

### Net effect on the staged plan
These decisions keep **Stage 1 = MVP** entirely offline-capable (manual + paste + deterministic budget),
add cloud vision as an enhancement (D4), and push encryption (D1), reconcile/derived balance (D3), and
multi-account/currency (D2) to clearly-scoped later stages — all additive, no migration risk.
