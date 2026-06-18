# 🛠️ Skill: Implementation Craft (anti-stupidity edition)

*Read this when you are about to WRITE CODE. It exists because vibe-coded, unverified
changes have broken this app repeatedly. These are the habits that separate a real
engineer from an autocomplete. Follow them literally.*

---

## 0. The Prime Directive: VERIFY, NEVER ASSUME

You do not "think" code works. You **prove** it. Every claim you make ("fixed it",
"this works") must be backed by a command you actually ran. If you didn't run the
gate, you did not finish. Saying "done" without `npm run typecheck && npm test &&
npm run build -w @brain/web` passing is a lie, and Claude will catch it.

---

## 1. Grep before you write. NEVER invent an API.

90% of Gemini's bugs are **hallucinated function signatures, props, and imports.**
Cure: before you call anything, look at how it's already used.

- About to call a repo/service/helper? `grep` its definition AND one existing caller.
  Copy the real signature. Do not guess argument order. (A real bug: `openai.ts`
  passed `research/summarizeSector` args in the wrong order — caught only because the
  types eventually screamed.)
- About to use a React prop or a three.js method? Find an existing usage in this repo
  and mirror it. If it's not used anywhere, read the library's `.d.ts`.
- About to import something? Confirm the export exists (`grep "export.*Name"`). Don't
  import from memory.

> Rule: **If you can't point to where a thing is defined, you may not call it.**

## 2. Trace the data end-to-end BEFORE editing.

A feature in this repo almost always crosses layers. Walk the whole path first:

```
DB column (db/schema.ts) → migration (db/client.ts) → Repo row→object mapper
  → Service/pipeline → Route (zod body) → api/client.ts → React state → render
```

If you add a field and forget any link, it silently vanishes. Write the chain down,
then edit each link. (When `tags` were added, ALL of these had to change — miss one
and the tag never shows up.)

## 3. Smallest diff that solves it. Nothing else.

- No "just-in-case" code. No drive-by refactors. No reformatting files you didn't
  change (it destroys the diff and hides your real change).
- Use surgical `replace` edits with enough surrounding context to be unique. Do not
  rewrite a whole file to change three lines.
- **Never delete or wholesale-replace a file Claude authored.** Additive only.

## 4. Respect the contract (this is the #1 Red Zone trap).

`packages/shared` types/zod schemas are the contract between server and web. Changing
a shape ripples both ways. If your change touches a shared type, a db column, how data
is scoped by `space_id`, how tokens/USD/Fuel are spent, or a route's request/response
shape → **STOP. That's Red Zone. Stage a plan + diff, hand to Claude.**

## 5. TypeScript is your friend, not your enemy. Obey it.

- Run `npm run typecheck` constantly, not just at the end. Fix the FIRST error first;
  later errors are often cascades.
- **Do not paper over types with `any` or `as` casts** to silence the compiler. A cast
  is you telling the compiler "trust me" — and you are exactly the one who shouldn't be
  trusted yet. If you need `any`, you misunderstood the type; go read it.
- Honor strict null checks. `foo?.bar`, guard array access (`arr[0]` is `T | undefined`).
  Many past crashes were unchecked `candidates[0]` / `targets[0]`.

## 6. The offline fallback is SACRED.

The app must run with **zero API keys** (`hash` embeddings + `heuristic` LLM). Never
make a feature hard-require a cloud provider. If it uses the LLM, it must degrade
gracefully when `llm.available === false`. Test your feature with no keys set.

## 7. Multi-tenancy: everything is scoped by `space_id`.

Every per-user query passes a `spaceId`. If you write or read `nodes/edges/insights/
agent_logs/daily_logs`, it MUST be filtered by space, or you leak one user's brain into
another's. (This is Red Zone — but you must still recognize it to avoid proposing a
leak.)

## 8. Migrations are additive + idempotent or the deploy dies.

`migrateSchema` runs on boot against the live Fly volume. A non-idempotent or
destructive migration crashes every existing user on deploy. Only
`ADD COLUMN`-style, `IF NOT EXISTS`, guarded changes. (Red Zone — stage it.)

## 9. Visual honesty.

Any backend state change the user can trigger MUST have a matching visual event in the
galaxy. A feature with no on-screen feedback is unfinished.

## 10. Finish the loop: gate → log → push.

1. `npm run typecheck && npm test && npm run build -w @brain/web` — all green.
2. Add an entry to `GEMINI_CHANGES.md` (template at the top of that file). You NEVER
   tick "Verified by Claude".
3. Commit on `claude/soumaya-second-brain-v1-m4z4hc`. Never `--force`, never `git init`.

---

## 🧨 Hall of Shame — real bugs that shipped here. Do not repeat them.

| What happened | The lesson |
| --- | --- |
| `INSERT OR REPLACE` into the vec0 vector table → silent 500s on re-embed | vec0 isn't normal SQLite. Verify exotic APIs; don't assume. |
| SQLite UTC timestamps parsed as local time → wrong "star age"/expiry | Always normalize to ISO+`Z` before `Date.parse`. |
| Metallic GLBs rendered as black silhouettes | PBR needs an environment map (now global PMREM). |
| OrbitControls damping did nothing | Damping needs `controls.update()` once per frame. |
| `SoumayaPanel` called `fetch('/api/...')` directly → 401 under multi-tenancy | Always go through `api/client.ts` (sends `x-space-id`). |
| `git init` on the clone → orphaned `master`, lost all of Claude's work | Never re-init git. Never force-push. |
| Wrong arg order in LLM provider methods | Grep the real signature before calling. |

When you hit a new bug, add a row here in your post-mortem so the next agent learns.
