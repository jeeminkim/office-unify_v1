# ai_office

Discord + Node.js + TypeScript + Supabase based investment office bot.

## Run

1. Set environment variables in `.env`
2. Install dependencies
3. Build and run

```bash
npm install
npm run build
npm start
```

## PM2

```bash
pm2 start dist/index.js --name ai-office --interpreter node
pm2 logs ai-office
pm2 restart ai-office
```

## Supabase Schema Apply

1. Open Supabase SQL editor
2. Run `schema.sql`
3. Verify tables: `stocks`, `portfolio`, `expenses`, `cashflow`, `user_settings`, `chat_history`

## Notes

- Portfolio identity key is `discord_user_id`
- Mode setting is persisted in `user_settings`
- Main panel state file is `state/discord-panel.json`
