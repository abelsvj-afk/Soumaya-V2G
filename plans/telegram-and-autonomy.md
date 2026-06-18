# Telegram + Server-Side Autonomy

How to talk to your Soumaya brain from Telegram, and the roadmap from "answers when
you message her" to "thinks and reaches out on her own."

## Phase A — Chat + Log (SHIPPED)

Single brain, text replies, webhook. Message the bot → she answers from your
memories (GraphRAG, with what she drew on); `/log <thought>` → ingests a memory and
reports what landed + fuel earned.

- `server/src/telegram/bot.ts` — `handleTelegramUpdate` (send injected, unit-tested),
  `tgSend`, `setTelegramWebhook`, `resolveTelegramSpace`.
- `server/src/api/routes/telegram.ts` — `POST /api/telegram/webhook/:secret`
  (open route; verifies the secret in the path AND the
  `X-Telegram-Bot-Api-Secret-Token` header; acks immediately, processes async).
- Webhook auto-registers on boot when the secrets + `PUBLIC_URL` are set.

### Setup (one time)
1. In Telegram, message **@BotFather** → `/newbot` → copy the bot token.
2. Pick a long random webhook secret (any opaque string).
3. Get your **Brain ID** from the app: open the Soumaya Command Center → "Talk to me
   on Telegram" → tap the Brain ID to copy.
4. Set Fly secrets and redeploy:
   ```
   fly secrets set \
     TELEGRAM_BOT_TOKEN=123456:ABC... \
     TELEGRAM_WEBHOOK_SECRET=<random-string> \
     TELEGRAM_SPACE_ID=<your Brain ID> \
     PUBLIC_URL=https://brain-soumaya-v1.fly.dev
   ```
   Optional hard lock to your own chat: `TELEGRAM_ALLOWED_CHAT_ID=<your chat id>`
   (DM the bot once, then read the chat id from the server log or @userinfobot).
5. On boot the server registers the webhook. Message the bot `/start`.

> Feature is fully opt-in: with no `TELEGRAM_BOT_TOKEN` nothing changes.
> Network note: the deployment must allow outbound HTTPS to `api.telegram.org`.

## Phase B — Proactive nudges (NEXT)

Soumaya reaches out, not just responds.

- A server-side scheduler (extend the existing heartbeat in `index.ts`) pushes the
  **daily digest** and **"going cold" beacon nudges** to the linked chat.
- Requires persisting the chat id (a `telegram_links` table — see Phase D) and a
  per-brain "last digest sent" marker so it fires once/day.
- Must respect the USD budget server-side (already tracked) — digests are free
  (no LLM) so this is cheap; any LLM summary goes through the budget gate.

## Phase C — Full server-side autonomy (BIGGER)

Today the *thinking* agent (synthesis/research/merging/daily-log) is **browser-
driven** (`web/src/graph/soumaya.ts` polls `/maintenance/next-job`). Move it
server-side so she evolves 24/7 and Telegram talks to that same agent.

- A server loop calls the existing `next-job`/`complete-job` logic on a timer,
  gated by Research Mode + USD budget + **fuel** (move fuel/budget checks fully
  server-side; they already live there).
- Add **job claiming/idempotency** so the server loop and any open browser tab
  can't double-execute the same job (a `claimed_at`/lock on the chosen target).
- Optional: replace the fixed if/else job ladder with an LLM "pick the next action"
  step over the maintenance ops exposed as **tools** — turning the scheduler into a
  real planning agent. Keep the deterministic ladder as the offline fallback.

## Phase D — Voice notes (hybrid growth) + multi-user

- **Voice replies:** browser TTS can't run server-side, so spoken Telegram replies
  need a cloud TTS service (e.g. an API that returns an OGG/MP3). Reuse the
  `shared/dramatize.ts` tone to pick prosody, send as a Telegram voice note, and
  keep text as the default/fallback. Gate behind a `TELEGRAM_TTS_*` key so the
  offline path is never broken.
- **Multi-user:** a `telegram_links(chat_id PRIMARY KEY, space_id, created_at)`
  table + a `/link <name> <passcode>` command that authenticates via the existing
  `SpacesRepo` and binds the chat to that brain. Replaces the single-brain
  `TELEGRAM_SPACE_ID` resolution with a per-chat lookup.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | to enable | BotFather token. |
| `TELEGRAM_WEBHOOK_SECRET` | to enable | Verifies inbound webhooks (path + header). |
| `TELEGRAM_SPACE_ID` | recommended | Which brain the bot talks to (your Brain ID). |
| `PUBLIC_URL` | for auto-register | Public base URL of the deployment. |
| `TELEGRAM_ALLOWED_CHAT_ID` | optional | Restrict the bot to one chat. |
