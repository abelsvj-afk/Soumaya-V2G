# Soumaya's Tools — an agentic tool-router she can call on her own

Status: **spec locked (v1)** · Owner: Claude · Branch: `claude/soumaya-second-brain-v1-m4z4hc`

## Why

Audit finding (2026-07-10): Soumaya's "autonomy" is a **fixed script** of internal graph-tidying
jobs. She has almost no tools that act in the real world, and she never freely *chooses* a tool —
`maintenance/agent.ts` picks one of 9 hardcoded jobs by a deterministic scorer; the LLM only
re-ranks. Concrete gaps the user chose to close (all four):

1. **Firing reminders** — `remindAt` is stored but nothing delivers at the time (only shown passively).
2. **Autonomous task creation** — she notices things but can't turn "I'll call the landlord" into an action.
3. **Proactive check-ins** — beyond the daily digest she can't reach out when something happens.
4. **Live web lookup** — `research()` is LLM-only; she can't pull real current info.

Architecture chosen: a **real tool-router** (function-calling loop) — given her state she reasons
which tool to invoke with what args. Built so the **offline/no-key path still works** (deterministic
detectors), with the LLM router layered on top when Research Mode + budget + a key are present.

## The seam (`packages/server/src/agent/tools/`)

```ts
interface Tool {
  name: string;
  description: string;                       // shown to the LLM router
  parameters: Record<string, unknown>;       // JSON-schema for function-calling
  guard?(tc): boolean;                       // budget / fuel / Research Mode / rate-limit
  detect(tc): ToolInvocation[];              // DETERMINISTIC opportunities (offline path)
  run(tc, args): Promise<ToolResult>;        // execute one invocation
}
interface ToolContext { ctx; spaceId; now; notify(text): Promise<void>; }
```

- **`registry.ts`** — the array of tools.
- **`router.ts`** — `runToolRouter(ctx, spaceId, { notify })`:
  1. offline path (always available): for each allowed tool, run `detect()` → execute each invocation
     (capped per tool), log every action to `agent_logs`.
  2. LLM path (seam, later): when `llm.route?` exists + Research Mode + budget, hand the LLM a compact
     state briefing + the tool schemas and let it choose invocations instead of running every `detect()`.
- **`notify`** — delivers to the user's real channel: Telegram (via `tgSend` to every chat linked to
  the space) today; extendable to web push. Every fire is also written to `agent_logs` so there's an
  in-app record regardless of channel.

Router runs on a **60s interval** (`index.ts`) so time-sensitive tools (reminders) fire promptly;
each tool self-gates its cadence inside `detect()`. Free + offline by default; only tools that call
the LLM/web are gated by Research Mode + USD budget (+ Fuel for expansion), same as `maintenance/agent.ts`.

## Tool 1 — Firing reminders (this slice; deterministic, free, offline)

- Additive `nodes.reminder_fired_at TEXT` column (idempotence — a reminder fires once).
- `detect`: nodes with `remind_at <= now AND reminder_fired_at IS NULL AND deleted_at IS NULL`
  (cap 5/tick) → one invocation each.
- `run`: mark `reminder_fired_at = now`, `notify("⏰ Reminder: …")`, log it.
- Never re-fires; never costs Fuel (core duty).

## Tool 2 — Autonomous task creation (next)

- `detect`: recent memories whose text contains a commitment ("I need to / I'll / have to / must / don't
  forget") and that don't already have a linked `action`. Deterministic phrase-matcher offline; LLM
  extraction when available for better recall.
- `run`: create an `action` node (the existing action-item kind) linked to the source memory, `notify`.
  Guarded against duplicates (one action per source memory). Also re-surfaces a dormant high-importance
  memory as a gentle task at most once/week.

## Tool 3 — Proactive check-ins (next; rate-limited)

- `detect`: a signal fired — a heavy emotional stretch (rolling mean emotional_weight dips), an unaddressed
  contradiction insight, or a promise that's overdue. At most **one check-in per space per day**
  (guard via `space_meta.last_checkin_date`, additive).
- `run`: compose a short message (heuristic offline; LLM voice when available) and `notify`.

## Tool 4 — Live web lookup (next; gated)

- `guard`: Research Mode ON + USD budget + a key (never offline; degrade to a note that it's unavailable).
- New provider method `webLookup?(query): Promise<{ text; sources }>` — Gemini grounding / a search API.
  `detect`: a `research` opportunity where the memory poses an external question. `run`: fetch, attach a
  cited note to the node, `notify`. Spends Fuel like other expansion jobs.

## Verification

- Gate `typecheck && test && build` green at each slice.
- Slice 1 tests (`tools.test.ts`): a due reminder fires exactly once (idempotent), a future reminder
  doesn't, firing marks `reminder_fired_at` + calls `notify` + writes an `agent_logs` row, deleted
  memories never fire.
- Offline path proven (no key, no Telegram → still marks fired + logs).
- Additive migration proven (existing volume upgrades in place).
