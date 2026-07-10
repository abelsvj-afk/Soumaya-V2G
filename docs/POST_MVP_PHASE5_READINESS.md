# Post-MVP — Phase 5: Product Readiness, Deployment & Operations

**Owner:** Claude · **Date:** 2026-07-10 · **Workflow:** [`AI_ENGINEERING_WORKFLOW_POST_MVP.md`](./AI_ENGINEERING_WORKFLOW_POST_MVP.md)

> Transforms a technically-sound app into one real users can adopt, trust, and keep using — while
> minimizing operational risk. This is a **family/private product** (the user + partner), so the
> "beta" is a live two-person one and the deployment surface is a single Fly.io container.

---

## Phase 20 — UX Polish (audit)

| Area | State |
|---|---|
| Navigation | 🟢 FAB rail + RightDock tabs; recenter/zoom; every screen has a purpose, no dead-ends. |
| Loading states | 🟢 boot overlay with fast-fail timeouts (a stalled `/api/graph` can't freeze the app); "Writing…" per-node processing. |
| Empty states | 🟢 guided (Observatory home, Chronicle "your chronicle begins…", Recall "nothing due — fresh"). |
| Error states | 🟢 global error bar + isolated `ErrorBoundary`; friendly copy; the pointerId 3D-lib noise is filtered. |
| Success feedback | 🟢 toasts + SFX on save/link/achievement; fuel pops. |
| Visual consistency | 🟢 one glass design system; the Legend documents the galaxy's visual language. |

**Verdict:** UX is polished; refinements (deep-space focus mode) are backlog, not blockers.

## Phase 21 — Accessibility (audit + this cycle's fixes)

| Item | State |
|---|---|
| `prefers-reduced-motion` (HUD/CSS) | 🟢 comprehensive reset (done earlier this cycle). |
| **Keyboard focus ring (WCAG 2.4.7)** | 🟢 **added this phase** — a `:focus-visible` ring for keyboard/AT users (the old `outline:none` left keyboard users blind to focus). |
| Meaning not by colour alone | 🟢 the Legend pairs every colour with shape/size/label; celestial classes differ by size + form, not just hue. |
| Touch targets | 🟢 FABs are 46px; controls are finger-sized. |
| **Backlog (documented):** | 🟡 WebGL-galaxy reduced-motion (canvas motion isn't gated); an optional **colorblind-safe palette** toggle; a full screen-reader pass. None are compliance blockers (colour is never the *sole* encoder), but they're the next a11y wins. |

## Phase 22 — Documentation Synchronization

🟢 The docs set is current: `AI_ENGINEERING_WORKFLOW_POST_MVP.md` (governing workflow),
`POST_MVP_AUDIT.md` (Phases 1–3 + D4 progress), `POST_MVP_PHASE4_AI_VALIDATION.md`,
`SOUMAYA_TOOLS.md`, `TIMELINE_DESIGN.md`, `NEURO_ALIGNMENT.md`, and `GEMINI_CHANGES.md` (the live
change log). CLAUDE.md carries the standing mandates.

## Phase 23 — Beta

🟢 **Live private beta** = the user + partner (both fully unlocked). Feedback is direct and
continuous (this whole session is beta feedback → fixes). No formal cohort needed at this scale.

## Phase 24 — Production Readiness checklist

| Gate | State |
|---|---|
| Stability | 🟢 server **278** + web **15** tests; additive/idempotent migrations (`migration.test.ts`) can't crash boot on the existing volume. |
| Security | 🟢 space-scoped multi-tenancy (audited clean, Phase 3); `securityHeaders` + in-memory `rateLimit`; 1 MB/8 MB body caps; secrets in env/Fly secrets (never in source); scrypt-hashed passcodes. |
| Performance | 🟢 LOD + lite mode + adaptive graphics + pause-on-hidden; bundle warns >500 kB (code-split is the known lever). |
| AI systems | 🟢 grounding/retrieval/consistency measured (Phase 4); offline heuristic fallback; budget-gated cloud work. |
| Docs | 🟢 current. |
| **Blocker** | 🔴 **K1 — the deploy gap:** the accumulated `master` is **not live**. Nothing is production-real until a `fly deploy` runs (below). |

## Phase 25 — Deployment Workflow (the REAL, repeatable process)

**Reality (verified in CLAUDE.md):** GitHub Actions is **blocked on this account** (private-repo
runner/minutes unavailable) — `.github/workflows/fly-deploy.yml` runs `startup_failure` and ships
nothing. **Pushing to `master` does NOT deploy.**

**The working path** — a manual remote build on Fly:
1. From an environment with `flyctl` + the `FLY_API_TOKEN` (the user's **Termux**, via `agy`):
   `fly deploy --remote-only` (builds the `Dockerfile` on Fly's builders; this sandbox has no flyctl/Fly network).
2. Watch for the log flag `image found remotely` — if the build reused a stale image, redeploy clean.
3. Verify on-device: `curl https://brain-soumaya-v1.fly.dev/sw.js` shows the new stamped cache id;
   load the live app (the self-healing service worker + `no-cache` shell pull the new build).

**Durable fix (recommended):** reconnect **Fly's native GitHub auto-deploy** (Fly dashboard → app →
GitHub) — it builds the Dockerfile on push **without** GitHub Actions, closing K1 permanently.

**Container:** single Fly.io app; `Dockerfile` builds the web app + bakes the MiniLM embedding model;
Express serves API + static web; SQLite persists on a Fly **volume at `/data`**.

## Phase 26 — Rollback Strategy

- **App rollback:** Fly retains prior releases → `fly releases` then `fly releases rollback` (or
  `fly deploy --image <prior-digest>`). Fast + reversible.
- **Why it's safe:** every schema change is an **additive, idempotent** `migrateSchema` step, so an
  older image booting on a newer volume never crashes (extra columns are ignored) — the #1 rollback
  hazard is designed out.
- **Trigger:** crash-on-boot, data corruption, auth failure, or a severe regression.

## Phase 27 — Disaster Recovery

- **State at risk:** the SQLite DB on the Fly volume (`/data`) — memories, edges, attachments,
  economy, spaces. This is the crown jewel.
- **Backup:** periodically copy the DB off the volume — `fly ssh console` → copy `/data/brain.db`
  out (or enable **Fly volume snapshots**). Prompts live in git (`llm/prompts.ts`); source in git.
- **Objectives (target):** RPO ≤ 24 h (daily backup); RTO ≤ 1 h (redeploy + restore the DB file).
- **Secret compromise:** rotate via `fly secrets set` (LLM keys, admin token, TG token); the app
  degrades to the offline heuristic if a key is pulled, so it stays up during rotation.

## Phase 28 — Post-Launch Monitoring

- **In-app:** `/api/health` (embeddings + LLM status); the top alert chips (low fuel, LLM degraded,
  overdue) surface problems to the user; console logs on the container.
- **Gap (documented):** no external uptime/latency monitor and no aggregated error dashboard. For a
  two-person deployment this is acceptable; if it grows, add a Fly metrics alert + an uptime pinger.

---

## Phase 5 exit status

| Criterion | Status |
|---|---|
| UX reviewed | 🟢 |
| Accessibility audited (+ focus ring shipped) | 🟢 (WebGL-motion + colorblind toggle backlogged) |
| Docs synchronized | 🟢 |
| Beta running | 🟢 (private two-person) |
| Production readiness | 🟡 **gated only by K1 (deploy)** |
| Deployment process documented + repeatable | 🟢 (this doc) |
| Rollback documented | 🟢 |
| Disaster recovery documented | 🟢 |
| Monitoring | 🟡 in-app only |

**Verdict:** the product is **production-ready pending one action — K1, run `fly deploy` (delegate
to `agy`) and verify on-device.** Everything else (rollback, DR, readiness) is documented and
repeatable. The durable fix is reconnecting Fly's native GitHub auto-deploy so pushing ships again.
