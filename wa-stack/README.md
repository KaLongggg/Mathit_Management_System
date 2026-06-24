# wa-stack — WhatsApp automation (live VPS deployment)

This is the **deployed** code running on the Mathit VPS at `/root/wa-stack`, kept in
version control here. It is separate from the frontend (which deploys to GitHub Pages).

## Services (docker-compose)
- **bot** (`bot/index.cjs`, Node + whatsapp-web.js) — holds the WhatsApp session,
  exposes token-gated `/send` + `/broadcast` (auth via `BOT_SHARED_SECRET`), runs the
  auto-reply flow, writes a heartbeat (state + login QR) to Supabase `bot_status`, and
  self-heals by restarting on dead-session send errors.
- **scheduler** (`scheduler/app.py`, Python + APScheduler) — reads `whatsapp_schedules`
  from Supabase, runs each rule's `sql_query` to build the recipient list, renders
  `message_template`, and posts to the bot. Supports **cron** and **one-time (`run_at`)**
  triggers; **aborts a run** if WhatsApp isn't ready (no failure floods); and **auto-purges**
  `failed` logs older than 14 days. `sent` logs are kept (they drive campaign de-dup).

## Deploy / update (on the VPS)
```sh
cd /root/wa-stack
docker compose up -d --build bot         # rebuild after code changes (or: scheduler)
docker compose restart bot               # clears a stale WhatsApp session (login persists)
docker logs -f whatsapp_bot              # watch logs (shows the QR on first link)
```

## Linking WhatsApp
Scan the QR with the MathitHK phone (Settings → Linked Devices → Link a Device).
The QR appears in the bot logs **and** on the management app's **Link WhatsApp** page
(the bot publishes it to `bot_status.qr`).

## Not in git (lives only on the VPS)
- `.env` — secrets (DB creds, `BOT_SHARED_SECRET`). See `.env.example`.
- `data/` — WhatsApp session + Chrome profile. If lost, re-link via QR.
- Campaign media beyond the formula sheet — add under `assets/` on the server.

## ⚠️ Note
The repo's legacy root `Test.js` / `Whatsapp_Scheduler.py` are **superseded** by this
folder. Deploy from here, not those.
