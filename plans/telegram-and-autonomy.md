# Telegram + Server-Side Autonomy

How to talk to your Soumaya brain from Telegram, and the roadmap from "answers when
you message her" to "thinks and reaches out on her own."

This deployment hosts **many private brains** (anyone can open one), so Telegram is
multi-brain: a chat first **links** to a brain by name + passcode, then everything
routes to that brain.

## Phase A — Chat + Log (SHIPPED)

Message the bot → she answers from your memories (GraphRAG, with what she drew on);
`/log <thought>` → ingests a memory and reports what landed + fuel earned.

- `server/src/telegram/bot.ts` — `handleTelegramUpdate` (send injected, unit-tested),
  `tgSend`, `setTelegramWebhook`, `formatDigest`, `sendDailyDigests`.
- `server/src/api/routes/telegram.ts` — `POST /api/telegram/webhook/:secret`
  (open route; verifies the secret in the path AND the
  `X-Telegram-Bot-Api-Secret-Token` header; acks immediately, processes async).
- Webhook auto-registers on boot when the secrets + `PUBLIC_URL` are set.

## Phase B — Proactive nudges (SHIPPED)

Soumaya reaches out, not just responds.

- `sendDailyDigests` (bot.ts) sweeps every linked chat and pushes that brain's
  **daily digest** — fresh memories with her take, latent connections she surfaced,
  and **"going cold" beacon nudges** (cooling memories to revisit) + expired actions.
- Driven by an hourly `setInterval` in `index.ts` (gated on `TELEGRAM_BOT_TOKEN`).
  Idempotent within a UTC day via `telegram_links.last_digest_date`, so the hourly
  tick simply fires the digest on the first run after midnight UTC.
- **Free:** `buildDailyDigest` never calls the LLM, so — like the heartbeat — it can
  never drain the API budget. `/digest` lets a user pull the same digest on demand.

## Multi-brain linking (SHIPPED — was Phase D "multi-user")

- `telegram_links(chat_id PRIMARY KEY, space_id, space_name, last_digest_date,
  created_at)` (`db/client.ts` bootstrap + idempotent migration; `telegram/links.ts`
  owns the SQL via `TelegramLinksRepo`).
- `/link <name> <passcode>` authenticates via the existing `SpacesRepo.authOrCreate`
  (creates the brain if the name is new, rejects a wrong passcode) and binds the chat.
  `/unlink` disconnects. Until a chat links, `/log` and questions are refused with help.
- Two chats linked to two brains stay fully isolated (covered by `telegram.test.ts`).

> Passcode hygiene: `/link` puts the passcode in the chat history, so the success
> reply tells the user to delete that message. (Same lightweight auth as the web app.)

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

## Phase D — Voice notes (hybrid growth)

- **Voice replies:** browser TTS can't run server-side, so spoken Telegram replies
  need a cloud TTS service (e.g. an API that returns an OGG/MP3). Reuse the
  `shared/dramatize.ts` tone to pick prosody, send as a Telegram voice note, and
  keep text as the default/fallback. Gate behind a `TELEGRAM_TTS_*` key so the
  offline path is never broken.

## Setup (one time)
1. In Telegram, message **@BotFather** → `/newbot` → copy the bot token.
2. Pick a long random webhook secret (any opaque string).
3. Set Fly secrets and redeploy:
   ```
   fly secrets set \
     TELEGRAM_BOT_TOKEN=123456:ABC... \
     TELEGRAM_WEBHOOK_SECRET=<random-string> \
     PUBLIC_URL=https://brain-soumaya-v1.fly.dev
   ```
4. On boot the server registers the webhook. Message the bot `/start`, then
   `/link <name> <passcode>` with the same credentials you use on the web app.

> Feature is fully opt-in: with no `TELEGRAM_BOT_TOKEN` nothing changes.
> Network note: the deployment must allow outbound HTTPS to `api.telegram.org`.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | to enable | BotFather token. Also enables the daily digest sweep. |
| `TELEGRAM_WEBHOOK_SECRET` | to enable | Verifies inbound webhooks (path + header). |
| `PUBLIC_URL` | for auto-register | Public base URL of the deployment. |
| `TELEGRAM_DIGEST_SWEEP_MS` | optional | How often to check for due digests (default hourly). |
