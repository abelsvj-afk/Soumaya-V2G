# AI Engineering Workflow — Post-MVP

**Version:** 1.0 · **Status:** Active (governs post-MVP work) · **Project:** Soumaya Second Brain

> **Purpose.** This document defines the engineering workflow that begins *after* the MVP is
> complete. The MVP proves the product can work; this workflow transforms it into a professional,
> maintainable, secure, scalable, production-ready application. **No major feature expansion should
> occur until this workflow has been completed, or intentionally bypassed with documented
> justification.**

> **Activation in this repo (2026-07-10).** This is a **mandatory** standard for all post-MVP work.
> It becomes the operating workflow **once the current tools/functions build-out is finished**
> (Soumaya's tool-router fleet + the neuro-aligned features). Until then, day-to-day work continues
> under [`WORKFLOW.md`](../WORKFLOW.md) / [`AI_ENGINEERING_WORKFLOW.md`](./AI_ENGINEERING_WORKFLOW.md);
> after that cutover, the phases below (MVP Freeze → audits → hardening → AI validation → production
> readiness) govern.
>
> **Repo mapping.** This document describes a multi-agent org (Claude, ChatGPT, Codex, Gemini, GLM,
> Antigravity). In *this* repository the active agents are **Claude** (Senior Architect / Lead
> Engineer / final authority) and **Antigravity (`agy`)** (automation, mobile execution, browser QA).
> The other roles are advisory templates — apply their *responsibilities* to whichever tool fills
> them. Our canonical files map as: change log → [`GEMINI_CHANGES.md`](../GEMINI_CHANGES.md); zones
> & agent mandates → [`AGENTS.md`](../AGENTS.md) and [`CLAUDE.md`](../CLAUDE.md); backlog/state live
> in those + the docs set. Where a phase names `PROJECT_STATE.md`/`ROADMAP.md`/`TASKS.md`/`CHANGELOG.md`,
> use the nearest existing equivalent and note gaps rather than inventing files.

---

## Table of Contents

- **Part 1 — Foundation:** Philosophy · Core Principles · AI Capability Matrix · Green/Yellow/Red Zones · Agent Roles · Repository Rules
- **Part 2 — Post-MVP Operations:** MVP Freeze · Repository Audit · Bug Bash · Code Quality Audit · Technical Debt Assessment · Dependency Review
- **Part 3 — Engineering Execution:** Architecture Review · Refactoring · Security · Testing · Performance · Observability
- **Part 4 — AI Engineering & Validation:** AI Validation · Memory · Prompts · Retrieval · Hallucination Reduction · Cost Optimization · Orchestration
- **Part 5 — Product Readiness:** UX Polish · Accessibility · Docs Sync · Closed Beta · Production Readiness · Deployment · Rollback · Disaster Recovery · Monitoring
- **Part 6 — Continuous Operations:** Continuous Improvement · Repository Health · Technical Debt Management · Sprint Workflow · Governance · KPIs · Agent Operating Prompts · Templates & Checklists

---

# Part 1 — Foundation

## Core Philosophy

The goal is **not** to write more code. The goal is to improve the quality of the code that already
exists before increasing complexity.

- Every new feature adds maintenance cost.
- Every unresolved bug compounds technical debt.
- Every duplicate function increases future work.
- Every architectural shortcut eventually becomes expensive.

**After MVP, engineering quality becomes more important than engineering speed.**

## Engineering Principles

Every AI agent and every developer must follow these.

1. **Stability before features.** Do not build five new features while crashes remain unfixed. Fix the foundation first.
2. **Refactor before expanding.** If the architecture is becoming difficult to understand: stop, refactor, then continue.
3. **Remove before adding.** Before writing new code ask: does this already exist? Can an existing function be extended? Can two services become one? Can duplicate logic be removed? Never create duplicate systems intentionally.
4. **Documentation is part of development.** No architecture change is complete until docs are updated (`PROJECT_STATE.md`, `ARCHITECT.md`, `ROADMAP.md`, `TASKS.md`, `CHANGELOG.md` — or this repo's equivalents).
5. **Every change must have a reason.** Answer: why is this necessary? What problem does it solve? What becomes simpler afterward?
6. **Simplicity wins.** Prefer simple systems, APIs, services, folders, and functions. Avoid clever code.
7. **Single responsibility.** Every module has one responsibility; every service solves one problem; every file has one clear purpose.
8. **No silent failures.** Errors should be logged, handled, recoverable, and visible. Never hide failures.

## AI Capability Matrix

Defines **responsibility, not intelligence**. Each agent has areas where it is trusted most.

| Agent | Authority | Primary role | Key responsibilities |
|---|---|---|---|
| **Claude** | 🟢🟡🔴 | Senior Architect · Lead Engineer · Repository Guardian | Architecture, refactoring, production code, security, complex debugging, repo organization, large implementations, code review, **final approval**. May override any other agent. |
| **ChatGPT** | 🟢🟡 | Systems Planner · Documentation Lead | Workflow design, documentation, product planning, UX ideas, architecture discussion, feature decomposition. Not sole approver of critical production changes. |
| **Codex** | 🟡🔴 | Implementation Engineer | Code generation, refactoring, bug fixes, unit tests, PR assistance. Works from approved plans. |
| **Gemini** | 🟢 | Research Planner · Idea Generator | Brainstorming, research, requirement expansion, feature exploration, competitive analysis, alternatives. Produces proposals, not production decisions. |
| **GLM** | 🟢 | Secondary Reviewer | Summaries, alternative viewpoints, translation, documentation review, requirement verification. |
| **Antigravity** | depends | Automation · Execution · Orchestration | Task orchestration, pipeline/build assistance. Never make irreversible repository decisions without approval. |

## Engineering Zones

### 🟢 Green Zone — Low risk (Think / Analyze / Explore / Research / Plan)
Brainstorming, documentation, UX ideas, requirements, audits, bug discovery, feature proposals,
refactoring ideas, architecture discussion, risk identification, research, technical inventories.
*No repository modifications. Multiple agents may work simultaneously.*

### 🟡 Yellow Zone — Medium risk (Prepare implementation)
Refactor plans, architecture proposals, migration strategies, API redesign, testing/performance/
security plans, folder restructuring, database redesign proposals, middleware plans.
*Changes reviewed before implementation.*

### 🔴 Red Zone — High risk (Modify the project)
Production code, database migrations, security/auth changes, repository restructuring, file
deletion, service consolidation, deployment, CI/CD, infrastructure, production release.
**Every Red Zone task requires: an approved plan, review, testing, and a documentation update.**

### Collaboration rules by zone
- **Green:** all models participate; compare answers, combine ideas, identify risks, produce multiple solutions.
- **Yellow:** generate plans, review plans, challenge assumptions; do not modify production code.
- **Red:** only approved implementation agents execute; **Claude has final authority**; human approval recommended before major architectural changes.

## Repository Rules

Every implementation must: read architecture docs → read requirements → read `PROJECT_STATE.md` →
read `TASKS.md` → understand dependencies → verify existing implementations → avoid duplicate code →
update documentation → update changelog → update project state → run tests → review results → **only
then** continue to the next task.

## Post-MVP Mission & Priority Order

Transform a working prototype into production-quality software. Priority order:

1. Stability 2. Maintainability 3. Security 4. Performance 5. Scalability 6. User Experience 7. New Features

**Never sacrifice the first six priorities simply to add another feature.**

---

# Part 2 — Post-MVP Engineering Operations

## Phase 1 — MVP Freeze

**Purpose.** Stop feature creep long enough to stabilize, evaluate, and strengthen the system.

- **Goals:** establish a stable baseline; prevent unnecessary additions; identify unfinished work; separate bugs from feature requests; create a known starting point.
- **Entry criteria:** core MVP operational; major workflows completable; primary value proposition demonstrated; repository builds successfully.
- **Exit criteria:** MVP scope formally locked; backlog contains all future feature requests; no new features without explicit approval; priorities shift from creation to refinement.
- **Deliverables:** MVP Scope Lock document · Feature Backlog · Known Issues list · Initial Bug Inventory.
- **AI responsibilities:** Claude verifies completeness, identifies architectural weaknesses, approves the scope lock. ChatGPT organizes the backlog. Gemini separates future ideas from immediate priorities. Codex: documentation fixes only.

## Phase 2 — Repository Audit

**Purpose.** Understand the current health of the entire codebase before making changes. Nothing is
refactored until the project is fully understood.

Audit categories: **Folder structure** (organization, naming, separation of concerns, dead/duplicate
folders) · **File organization** (large/duplicate/unused/temporary/legacy files) · **Function
inventory** (duplicate logic, similar/dead/oversized functions, missing abstraction) · **Services**
(boundaries, responsibilities, reusability, dependency chains) · **API** (endpoint consistency,
naming, error responses, versioning, auth flow) · **Database** (duplicate tables, missing indexes,
unused columns, poor naming, consistency) · **Dependencies** (unused, deprecated, security risks,
version conflicts, duplicate functionality).

**Deliverables:** Repository Audit Report · Technical Debt Report · Dependency Report · Architecture Observations.

## Phase 3 — Bug Bash

**Purpose.** Find everything broken. Do not optimize or redesign — identify and eliminate failures.

| Severity | Examples |
|---|---|
| **Critical** | crashes, data corruption, auth failures, security vulnerabilities — immediate priority |
| **High** | broken workflows, incorrect data, failed API calls, memory leaks |
| **Medium** | visual bugs, performance issues, navigation inconsistencies, animation glitches |
| **Low** | typos, spacing, minor polish, cosmetic inconsistencies |

**AI responsibilities:** Claude debugs / root-causes / sets fix strategy; Codex implements fixes;
ChatGPT organizes and prioritizes reports; Gemini suggests edge cases.
**Deliverables:** Bug Report · Priority Matrix · Resolved Issue Log · Regression Checklist.

## Phase 4 — Code Quality Audit

**Purpose.** Determine whether the codebase is maintainable. Working code is not necessarily good code.

- **Review areas:** naming consistency, function size, file size, architecture violations, duplication, error handling, comments, documentation, complexity, readability.
- **Quality standards:** files under ~300 lines; functions under ~50 lines; one responsibility per module; strong typing; no magic numbers; meaningful names; minimal nesting; no dead code.
- **Deliverables:** Code Quality Report · Refactor Candidate List · Cleanup Priority List.

## Phase 5 — Technical Debt Assessment

**Purpose.** Identify engineering shortcuts that become expensive later.

Common debt: duplicate implementations, temporary hacks, poor naming, missing tests, hardcoded
values, circular dependencies, large classes/services, mixed responsibilities, inconsistent APIs,
missing documentation, manual processes.

Priority: **Critical** (blocks scalability, causes bugs, security risks) → **High** (slows
development, creates confusion) → **Medium** (improve soon) → **Low** (cleanup when convenient).
**Deliverables:** Technical Debt Register · Priority Score · Estimated Cleanup Effort.

## Phase 6 — Dependency Review

**Purpose.** Ensure every dependency is necessary, secure, and actively maintained.

- **Checklist:** actively maintained? secure? necessary? can native code replace it? is another dependency already doing this? version current? licensing fits?
- **Security checks:** known vulnerabilities, deprecated packages, breaking changes, license compliance, supply-chain risks.
- **Deliverables:** Dependency Inventory · Upgrade Plan · Removal Plan · Security Report.

## Operational Checklists

**Before any refactor:** repo builds · docs current · tests pass (if available) · existing behavior understood · scope approved · rollback strategy exists.
**Before deleting code:** confirm it is unused, unreachable, replaced, documented, safe to remove, covered by tests.
**Before merging duplicate functions:** behavior identical · inputs match · outputs match · edge cases preserved · tests pass · docs updated.
**Before replacing an existing system:** the replacement is demonstrably better · performance improves · complexity decreases · maintenance cost decreases · migration plan exists · rollback plan exists.

---

# Part 3 — Engineering Execution

*Begin structural improvements only after Part 2 audits are complete. The purpose is to improve
architecture, reliability, security, maintainability, and scalability — not to add features.*

## Phase 7 — Architecture Review

**Objectives:** validate overall design, identify bottlenecks, improve separation of concerns,
reduce coupling, increase modularity, simplify maintenance.

Review areas: **folder structure** (feature organization, layer separation, naming, module
ownership, scalability — can a new developer understand it quickly?) · **service boundaries** (one
problem each; split/merge/extract/remove abstractions) · **middleware** (still necessary? duplicated?
combinable? should it be a service?) · **API design** (consistency, naming, auth flow, authorization,
error responses, versioning, input validation) · **database** (schema organization, relationships,
indexing, query efficiency, normalization, migrations).

**Deliverables:** Architecture Review Report · Improvement Plan · Module Dependency Diagram · Updated architecture docs.

## Phase 8 — Refactoring Workflow

Refactoring improves internal structure **without changing external behavior**. If users notice a
behavioral change, it's a feature change and is treated separately.

- **Goals:** reduce duplication/complexity; improve readability/maintainability/modularity/consistency.
- **Candidates:** duplicate functions, oversized files, large classes/services, nested conditionals, repeated logic, unused utilities, legacy implementations, temporary workarounds, poor naming.
- **Rules:** never refactor blindly; understand behavior first; keep refactors small; one responsibility at a time; run tests after every major change; update docs immediately.
- **Function consolidation** — before creating a new function ask: does one exist? can it be extended? can versions become one? would abstraction simplify maintenance?
- **File cleanup:** remove dead/temporary files, unused assets, obsolete scripts, legacy experiments.
- **Deliverables:** Refactor Log · Consolidation Report · Cleanup Report · Updated `PROJECT_STATE.md`.

## Phase 9 — Security Workflow

Security is continuous and never "finished."

- **Authentication:** secure login, session handling, token expiration, password handling, MFA readiness.
- **Authorization:** least privilege, role separation, permission validation, server-side enforcement.
- **Input validation:** API inputs, forms, query params, headers, uploads. Prevent SQL injection, XSS, command injection, path traversal, unsafe deserialization.
- **Secrets:** never store API keys, passwords, tokens, certificates, or private keys in source. Use env vars / secret management.
- **Dependency security:** review third-party libs for vulnerabilities, maintenance status, advisories.
- **Logging security:** never log passwords, auth tokens, sensitive personal info, or secret keys.
- **Deliverables:** Security Audit Report · Vulnerability Register · Mitigation Plan · Security Checklist.

## Phase 10 — Testing Workflow

Every important behavior should be verified.

- **Unit** — individual functions, utilities, business logic.
- **Integration** — service interactions, database operations, external APIs, middleware.
- **End-to-end** — real user workflows, authentication, navigation, critical processes.
- **Regression** — every critical bug gets a test so it never returns.
- **Error handling** — graceful handling of invalid input, missing data, network failures, timeouts, unexpected exceptions.
- **Edge cases** — large/empty datasets, slow connections, interrupted requests, concurrent users, boundary values.
- **AI responsibilities:** Claude reviews strategy/coverage; Codex writes/maintains tests; ChatGPT designs plans + edge cases; Gemini suggests overlooked scenarios.
- **Deliverables:** Testing Report · Coverage Report · Regression Report · Quality Score.

## Phase 11 — Performance Optimization

Improve responsiveness without sacrificing maintainability. **Optimize only after measuring.**

- **Areas:** database queries, caching, memory, CPU, network requests, API latency, rendering, bundle size, background jobs, lazy loading.
- **Rules:** measure first → optimize → measure again → document results.
- **Common improvements:** indexing, query optimization, caching hot data, removing unnecessary rendering, reducing network requests, compressing assets, removing dependencies.
- **Deliverables:** Performance Audit · Benchmark Report · Optimization Log · Updated Performance Budget.

## Phase 12 — Observability & Monitoring

A production system should explain what it is doing; failures should be visible before users report them.

- **Logging:** auth events, errors, warnings, startup, background jobs, critical workflows.
- **Monitoring:** CPU, memory, database health, API latency, queue health, storage, error rates.
- **Metrics:** response time, success rate, crash frequency, user actions, memory-retrieval accuracy (AI), token usage, operational cost.
- **Health checks:** verify dependencies, database connectivity, external services, internal readiness.
- **Deliverables:** Monitoring Dashboard Plan · Logging Standards · Operational Metrics Catalog · Incident Response Checklist.

---

# Part 4 — AI Engineering & Validation

*AI software must be validated for both functionality **and** intelligence. A feature can operate
perfectly while producing poor answers, inconsistent reasoning, hallucinations, or low-quality
retrieval. For Soumaya, AI validation is equal in importance to software testing.*

## Phase 13 — AI Validation

Verify the AI produces accurate responses, uses memory correctly, chooses correct tools, maintains
context, avoids hallucinations, and responds consistently.

- **Response accuracy:** did it answer the request? misunderstand intent? invent information? omit important info?
- **Reasoning quality:** logical consistency, step-by-step reasoning, planning/decision quality, confidence.
- **Tool usage:** correct selection, sequence, parameters; no unnecessary calls; graceful failure recovery.
- **Context awareness:** short-term context, long-term memory, conversation continuity, previous decisions, repository awareness.
- **Deliverables:** AI Validation Report · Quality Score · Known AI Limitations · Improvement Backlog.

## Phase 14 — Memory Validation

The memory system is the foundation of Soumaya; poor memory quality destroys trust.

- **Creation** — memories created correctly? · **Retrieval** — found quickly? · **Ranking** — most relevant first? · **Updates** — safely modified? · **Deletion** — removed without damaging relationships?
- **Relationships:** links, references, tags, parent-child, knowledge graphs.
- **Consistency:** no duplicates, corruption, broken references, or orphan records.
- **Deliverables:** Memory Audit · Retrieval Metrics · Consistency Report · Relationship Graph Report.

## Phase 15 — Prompt Validation

Prompts are engineering assets — versioned, tested, reviewed, continuously improved.

- **Review:** clarity, specificity, repeatability, instruction hierarchy, tool instructions, fallback behavior, error handling, expected outputs.
- **Tests:** run the same prompt across multiple sessions, datasets, edge cases, incomplete inputs, contradictory inputs.
- **Version control:** track prompt version, author, date, purpose, changes, performance notes.
- **Deliverables:** Prompt Library · Prompt Test Report · Prompt Version History.

## Phase 16 — Retrieval Validation

- **Questions:** did retrieval return the correct info? was relevant info missed? was irrelevant info included? were rankings appropriate?
- **Metrics:** precision, recall, ranking quality, latency, completeness, context quality.
- **Stress tests:** very small / very large knowledge bases; duplicate, conflicting, old, and recently-updated information.
- **Deliverables:** Retrieval Benchmark · Search Quality Report · Ranking Improvements.

## Phase 17 — Hallucination Reduction

The objective is measurable **reduction**, not perfection.

- **Common:** invented APIs/files/documentation, incorrect assumptions, false repository structure, incorrect memory recall, unsupported claims.
- **Prevention:** require evidence; verify before stating facts; prefer uncertainty over fabrication; separate assumptions from verified info; request clarification when confidence is low.
- **Deliverables:** Hallucination Log · Mitigation Strategies · Verification Checklist.

## Phase 18 — AI Cost Optimization

Balance capability with operational cost and sustainability.

- **Areas:** prompt length, context size, token consumption, tool frequency, model selection, caching, streaming, repeated requests.
- **Principles:** use the smallest model capable of the task; reserve the most capable models for high-complexity/high-risk work; avoid repeated context transmission; reuse validated outputs.
- **Model routing:** Green Zone → lower-cost reasoning (planning/research/docs/ideas); Yellow Zone → mid-tier (architecture review, refactor plans, testing strategy, design evaluation); Red Zone → highest-capability (repo modifications, critical debugging, security, production releases, architecture approval).
- **Deliverables:** Token Usage Report · Monthly Cost Estimate · Optimization Opportunities · Model Routing Plan.

## Phase 19 — Multi-Agent Orchestration

Assign work to the best model instead of asking every model to solve every problem.

**Standard workflow:** Discover → Analyze → Brainstorm → Compare solutions → Produce proposal →
Review proposal → Approve plan → Implement → Test → Review implementation → Update documentation → Merge.

**Exit criteria (before Product Readiness):** memory retrieval reliable ✓ · prompt library validated ✓
· hallucinations documented and minimized ✓ · AI workflows repeatable ✓ · model routing defined ✓ ·
operational costs understood ✓ · multi-agent collaboration documented ✓.

---

# Part 5 — Product Readiness, Beta, Deployment & Operations

## Phase 20 — UX Polish

Every interaction should feel intentional.

- **Navigation:** every screen has a clear purpose; consistent; users always know where they are; important actions easy to find; no dead-ends.
- **Visual consistency:** typography, color, iconography, spacing, alignment, component consistency, layout hierarchy.
- **Loading states:** every async action communicates progress (indicators, skeletons, progress bars, sync status) — users never wonder if it's frozen.
- **Empty states:** explain why empty; suggest next action; link to relevant features.
- **Error states:** explain what/why (when appropriate); suggest recovery; avoid jargon unless intended.
- **Success feedback:** confirm completion (memory saved, synced, research completed, settings updated).
- **Animation:** smooth, consistent timing, meaningful motion, no unnecessary animations, acceptable performance impact.
- **Audio (optional):** consistent, appropriate volume, user control, no repetitive/distracting effects.
- **Deliverables:** UX Review Report · UI Consistency Checklist · Interaction Improvement Backlog.

## Phase 21 — Accessibility Review

Accessibility is designed in, not added later.

Review: keyboard navigation, screen-reader compatibility, color contrast, font scaling, touch-target
sizes, focus indicators, **motion-reduction options**, alt text, captions where applicable.
**Deliverables:** Accessibility Audit · Improvement Plan · Compliance Checklist.

## Phase 22 — Documentation Synchronization

Documentation must reflect the current state of the project — it is part of the product. Outdated
documentation is technical debt.

Update as needed: `README.md`, `ARCHITECT.md`, `AI_ENGINEERING_WORKFLOW.md`,
`AI_ENGINEERING_WORKFLOW_POST_MVP.md`, `ROADMAP.md`, `TASKS.md`, `CHANGELOG.md`, `PROJECT_STATE.md`,
requirements, user stories, architecture diagrams, API docs, environment setup guides.
Docs should be accurate, current, concise, searchable, version-controlled.
**Deliverables:** Documentation Review Report · Documentation Change Log · Repository Documentation Score.

## Phase 23 — Closed Beta Program

Validate with real users before public release; internal testing cannot replace real-world usage.

- **Objectives:** discover unexpected workflows; validate usability; measure stability; collect feature requests; identify high-priority bugs; evaluate AI response quality; measure performance under realistic conditions.
- **Participants:** represent the target audience; willing to give detailed feedback; understand the goals; can reproduce issues.
- **Feedback categories:** bugs, confusing UX, missing features, performance, AI quality, reliability, documentation gaps, feature requests.
- **Deliverables:** Beta Feedback Report · Issue Prioritization Matrix · Updated Product Backlog.

## Phase 24 — Production Readiness

No unresolved critical issues should remain.

- **Stability:** critical bugs resolved; regression tests passing; crash rate acceptable.
- **Security:** authentication & authorization verified; secrets secured; dependency vulnerabilities reviewed.
- **Performance:** benchmarks achieved; response times acceptable; resource usage monitored.
- **Documentation:** current, complete, reviewed.
- **AI systems:** memory & retrieval validated; prompt library approved; hallucination mitigation implemented; model routing verified.
- **Deliverables:** Production Readiness Report · Release Approval Checklist · Final Risk Assessment.

## Phase 25 — Deployment Workflow

Deploy in a controlled, repeatable, reversible way. Deployment must never depend on undocumented
manual steps.

**Principles:** automate where possible · keep deployments small · verify after deployment · monitor
continuously · maintain rollback capability.

**Steps:** 1. Freeze release branch · 2. Run automated tests · 3. Run security checks · 4. Verify
documentation · 5. Deploy to staging · 6. Validate staging · 7. Deploy to production · 8. Monitor
metrics · 9. Confirm system health · 10. Announce release.
**Deliverables:** Deployment Checklist · Deployment Log · Release Notes.

## Phase 26 — Rollback Strategy

Every deployment must have a documented recovery plan.

- **Triggers:** critical outage, data corruption, auth failure, severe performance regression, security incident, unrecoverable deployment error.
- **Requirements:** previous release available; database rollback strategy documented; configuration backups maintained; recovery procedures tested.
- **Deliverables:** Rollback Playbook · Recovery Checklist · Incident Report Template.

## Phase 27 — Disaster Recovery

Prepare for failures before they occur.

- **Recovery planning:** infrastructure failure, database failure, cloud outage, data loss, repository corruption, secret compromise, AI service outage.
- **Backups:** source code, database, configuration, documentation, prompt library, AI memory (where applicable).
- **Recovery objectives:** define RTO (Recovery Time Objective) and RPO (Recovery Point Objective).
- **Deliverables:** Disaster Recovery Plan · Backup Verification Report · Recovery Testing Report.

## Phase 28 — Post-Launch Monitoring

Deployment is the beginning of operational monitoring, not the end of development.

- **Monitor:** uptime, error rates, API latency, database health, memory/CPU, storage, AI response quality, retrieval accuracy, token consumption, operational costs, user engagement.
- **Incident response:** detection → triage → root-cause → resolution → documentation → preventive action.
- **Continuous feedback:** collect user feedback, crash reports, performance metrics, feature requests, AI quality reports; feed into planning cycles.

**Product Readiness exit criteria:** UX review ✓ · accessibility audit ✓ · docs synchronized ✓ ·
closed beta ✓ · critical beta issues resolved ✓ · production readiness approved ✓ · deployment
validated ✓ · rollback tested ✓ · disaster recovery documented ✓ · monitoring operational ✓.

---

# Part 6 — Continuous Operations, Governance & Templates

*A production application is never finished. After launch, engineering shifts from building a
product to operating, improving, and protecting a living system. Every release should make the
system better than the previous release.*

## Phase 29 — Continuous Improvement Cycle

**Loop:** Observe → Measure → Analyze → Prioritize → Plan → Implement → Test → Review → Deploy → Measure again.

1. **Observe** — user feedback, bug reports, analytics, monitoring, AI quality metrics, performance metrics, support requests.
2. **Measure** — every improvement has measurable impact (e.g. retrieval 4s → 800ms; onboarding completion +40%).
3. **Analyze** — what happened, why, root cause, what solutions exist.
4. **Prioritize** — by impact, urgency, engineering cost, risk.

**Improvement categories:** Critical (security, data-loss, major outages, broken core) → High
(performance, important UX, architecture slowing dev) → Medium (refactoring, minor usability, DX) →
Low (cosmetic, nice-to-have).

## Phase 30 — Repository Health System

Maintain a health score across: **Code quality** (duplication, complexity, maintainability,
organization) · **Test health** (coverage, regression protection, failing tests, missing scenarios)
· **Security health** (vulnerabilities, dependency risks, secret exposure, auth weaknesses) ·
**Documentation health** (accuracy, completeness, last-update date) · **Architecture health**
(coupling, separation of concerns, scalability) · **AI health** (retrieval accuracy, hallucination
rate, prompt quality, cost efficiency, response reliability).

**Review schedule:** Weekly → bugs, build failures, security alerts. Monthly → technical debt,
architecture, dependencies. Quarterly → full system review.

## Phase 31 — Technical Debt Management

Score each debt item 1–5 on **Impact**, **Frequency**, **Risk**, **Effort**.

> **Priority = Impact + Frequency + Risk − Effort.** High-value fixes first.

**Never ignore:** security debt, data-integrity debt, architecture debt blocking growth. **Document:**
why the debt exists, who created it, why it matters, how it will be removed.

## Phase 32 — Sprint Workflow

Create predictable engineering cycles.

- **Planning:** define goals, tasks, risks, dependencies.
- **Task selection:** each task includes description, purpose, acceptance criteria, testing requirements, documentation requirements.
- **Development:** follow architecture, requirements, task scope, testing standards.
- **Review:** code quality, security, testing, documentation, architecture compliance.
- **Completion:** update `PROJECT_STATE.md`, `TASKS.md`, `ROADMAP.md`, `CHANGELOG.md`.
- **Task requirements:** small, specific, testable, documented, independent.

## Phase 33 — AI Collaboration Governance

1. No AI independently redesigns the system without architecture approval.
2. No AI assumes anything about existing code — inspect first.
3. AI output is a **proposal** until reviewed.
4. The strongest reasoning model reviews the highest-risk decisions.

**Handoff process:** Idea → Research AI → Planning AI → Architecture AI → Implementation AI → Testing
AI → Review AI → Documentation update.

**Zone master workflow:** Green (Discovery — research, brainstorming, planning, docs, feature ideas,
UX exploration) → Yellow (Design — architecture, refactor plans, testing strategy, security/migration
planning) → Red (Execution — code/database/deployment/security/infrastructure changes; primary
agents Claude + Codex).

## Phase 34 — Engineering KPIs

- **Development:** deployment frequency, bug resolution time, failed-deployment rate, code-review time, technical-debt reduction.
- **Product:** user retention, feature usage, user satisfaction, task completion.
- **AI:** response accuracy, memory-retrieval accuracy, hallucination frequency, average response time, token cost, tool success rate.
- **Performance:** API latency, crash rate, database performance, resource usage.

---

## AI Agent Operating Prompts

*Role prompts (not feature prompts). Every agent follows: **inspect before acting** (understand
architecture, implementation, docs, dependencies, project state); **plan before changing** (state the
problem, solution, risks, files affected, testing needs); **preserve existing behavior** unless
explicitly changing it; **document every decision** (reason, alternatives, expected impact).*

### Claude — Senior Architect & Lead Engineer (🟢🟡🔴)

```text
You are the Senior Architect and Lead Engineer for this repository.
Your responsibility is to maintain the long-term health of the system.

Before making changes:
1. Read architecture documentation.
2. Read requirements.
3. Read project state.
4. Inspect existing implementation.
5. Identify risks.

Do not create duplicate systems. Do not add unnecessary complexity.

Prioritize: 1. Correctness 2. Maintainability 3. Security 4. Performance 5. Scalability

When reviewing code, identify: bugs, architecture violations, security risks,
technical debt, maintainability issues.

When implementing: follow existing architecture, write tests, update documentation,
update project state.

You have authority to reject poor designs.
```

### ChatGPT — Systems Planner & Documentation Architect (🟢🟡)

```text
You are the Systems Planner for this project.
Your role is to transform ideas into structured engineering plans.
Do not rush into implementation.

Analyze: user value, technical requirements, risks, dependencies, architecture impact.

Always provide: clear goals, acceptance criteria, risks, recommended approach,
required documentation updates.

Think like a product architect.
```

### Gemini — Research & Exploration Agent (🟢)

```text
You are the Research and Exploration Agent. Your purpose is to expand understanding.
Generate: possible solutions, research findings, alternative approaches, risks, opportunities.
Do not make final engineering decisions. Do not directly modify production systems.
Your output becomes input for planning and architecture review.
```

### Codex — Implementation Engineer (🟡🔴)

```text
You are the Implementation Engineer. You execute approved technical plans.
Before coding, read: architecture documentation, requirements, the current task, project state.
Only implement the requested scope. Do not redesign architecture unless instructed.
After changes: run tests, verify behavior, update documentation, report changed files, report risks.
```

### GLM — Review & Validation Agent (🟢)

```text
You are the Secondary Review Agent. Your responsibility is to challenge assumptions.
Look for: missing requirements, logical errors, alternative solutions, documentation problems,
potential risks.
Do not replace the primary architecture decision. Provide constructive review.
```

### Antigravity — Automation & Orchestration Agent

```text
You are the Automation and Orchestration Agent. Your role is to improve development efficiency.
Automate: repetitive workflows, checks, reports, validation.
Never perform destructive actions without approval. Never modify critical systems without
authorization. Prioritize safety and repeatability.
```

---

## Templates

### Architecture Review

```markdown
## Architecture Review
Date:            Reviewer:
## Problem            (describe the issue)
## Current Design     (explain existing behavior)
## Proposed Change    (describe improvement)
## Alternatives       (list considered solutions)
## Risks              (list possible problems)
## Decision           Approved / Rejected — Reason:
```

### Code Review

```markdown
## Code Review
## Summary          (what changed?)
## Correctness      (does it work?)
## Security         (any risks?)
## Maintainability  (is it understandable?)
## Testing          (are tests sufficient?)
## Documentation    (was documentation updated?)
## Recommendation   Approve / Request Changes
```

### Bug Report

```markdown
## Bug
Title:            Severity:            Environment:
Steps To Reproduce:
Expected Behavior:            Actual Behavior:
Evidence:            Root Cause:            Fix:            Regression Test:
```

### Feature Request

```markdown
## Feature
Problem:            User Benefit:
Requirements:            Dependencies:            Risks:
Acceptance Criteria:            Documentation Needed:
```

### Release Checklist

```markdown
Code
☐ Review complete   ☐ Tests passing   ☐ No critical bugs   ☐ No security issues
Documentation
☐ README updated   ☐ Changelog updated   ☐ Architecture updated   ☐ Project state updated
Deployment
☐ Backup created   ☐ Rollback tested   ☐ Monitoring enabled   ☐ Release notes prepared
```

---

## Final Master Engineering Loop

**Idea → Research → Requirements → Architecture → Implementation → Testing → Review → Documentation →
Deployment → Monitoring → Improvement → Repeat.**

> **Final rule.** The objective is not to write the most code — it is to build the most reliable,
> maintainable, scalable system possible. AI agents are tools. Architecture is the foundation.
> Documentation is memory. Testing is confidence. Review is protection. Continuous improvement is the
> process that keeps the system alive.
