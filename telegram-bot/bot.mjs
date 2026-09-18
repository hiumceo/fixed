const token = process.env.TELEGRAM_BOT_TOKEN;
const authBaseUrl = (process.env.AUTH_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const internalSecret = process.env.TELEGRAM_INTERNAL_SECRET;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}

if (!internalSecret) {
  console.error("Missing TELEGRAM_INTERNAL_SECRET.");
  process.exit(1);
}

async function telegramApi(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.description ?? "Unknown Telegram error"}`);
  return data.result;
}

async function completeAuthLink(code, user) {
  const response = await fetch(`${authBaseUrl}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "telegram-link-complete",
      secret: internalSecret,
      code,
      telegramId: String(user.id),
      telegramUsername: user.username || ""
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "AUTH TELEGRAM LINK FAILED.");
  return data.link;
}

const bot = await telegramApi("getMe");

console.log("Telegram connection successful.");
console.log(`Bot: ${bot.first_name} (@${bot.username})`);
console.log(`AUTH endpoint: ${authBaseUrl}`);
console.log("Waiting for Telegram messages...");
console.log("Press Ctrl+C to stop.");

let offset = 0;

while (true) {
  try {
    const updates = await telegramApi("getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message"]
    });

    for (const update of updates) {
      offset = update.update_id + 1;

      const message = update.message;
      if (!message?.chat?.id) continue;

      const user = message.from;
      const text = message.text ?? "";

      console.log("\nIncoming Telegram message:");
      console.log({
        telegramId: user?.id,
        username: user?.username ?? null,
        firstName: user?.first_name ?? null,
        text
      });

      if (text.startsWith("/start")) {
        const parts = text.trim().split(/\s+/);
        const linkingCode = parts[1] ?? null;

        if (linkingCode) {
          try {
            const link = await completeAuthLink(linkingCode, user);

            await telegramApi("sendMessage", {
              chat_id: message.chat.id,
              text:
                "✓ Telegram connected successfully.\n\n" +
                `Telegram ID: ${link.telegramId}\n` +
                `Telegram Username: ${link.telegramUsername ? "@" + link.telegramUsername.replace(/^@/, "") : "(none)"}\n\n` +
                "Return to v1124 AUTH to finish creating your account."
            });
          } catch (error) {
            await telegramApi("sendMessage", {
              chat_id: message.chat.id,
              text: `Telegram connection failed: ${error instanceof Error ? error.message : "AUTH LINK FAILED."}`
            });
          }
        } else {
          await telegramApi("sendMessage", {
            chat_id: message.chat.id,
            text:
              "v1124 AUTH Telegram connection is working.\n\n" +
              `Telegram ID: ${user.id}\n` +
              `Telegram Username: ${user.username ? "@" + user.username : "(none)"}`
          });
        }
      }

      if (text.trim() === "/recoverytest") {
        await telegramApi("sendMessage", {
          chat_id: message.chat.id,
          text:
            "v1124 AUTH — Temporary Password\n\n" +
            "Temporary password: Test-Temp-8472\n\n" +
            "Sign in with this password and change it immediately."
        });
        console.log(`Recovery test message sent to Telegram ID ${user.id}.`);
      }
    }
  } catch (error) {
    console.error("\nTelegram error:", error.message);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
