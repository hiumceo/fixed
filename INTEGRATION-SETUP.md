# v1124 AUTH — Telegram Integration

Replace the matching project files with the files in this package.

Environment variables:

AUTH app:
  TELEGRAM_BOT_USERNAME=v1124bot
  TELEGRAM_BOT_TOKEN=your BotFather token
  TELEGRAM_INTERNAL_SECRET=the same long random secret used by the bot

Telegram bot process:
  TELEGRAM_BOT_TOKEN=your BotFather token
  TELEGRAM_INTERNAL_SECRET=the same secret
  AUTH_BASE_URL=http://localhost:3000

For production, set AUTH_BASE_URL to the deployed AUTH origin.

The bot must run continuously. It uses Telegram long polling for inbound
/start <one-time-code> linking. The AUTH API uses the bot token directly
for outbound recovery messages.

Do not commit the bot token or internal secret.
