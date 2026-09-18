import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  completeTelegramLink,
  createRecoveryTicket,
  createSession,
  createUser,
  deleteSession,
  getTelegramLinkStatus,
  getUserBySession,
  publicUser,
  startTelegramLink,
  prepareRecoveryTicketPasswordReset,
  commitRecoveryTicketPasswordReset,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "v1124_auth_session";
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "v1124bot";
const TELEGRAM_INTERNAL_SECRET = process.env.TELEGRAM_INTERNAL_SECRET || "";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365 * 20,
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function sendTemporaryPasswordTelegram(
  telegramId: string,
  username: string,
  temporaryPassword: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: "NOT_CONFIGURED" as const };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text:
          "Password Recovery\n" +
          "Hello from v1124,\n\n" +
          `Temporary password: ${temporaryPassword}\n\n` +
          `Use ${temporaryPassword} as password to sign in to v1124 AUTH, then update your password immediately.\n\n` +
          "v1124 AUTH",
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) return { status: "FAILED" as const };
    return { status: "SENT" as const };
  } catch {
    return { status: "FAILED" as const };
  }
}

export async function GET(request: NextRequest) {
  const user = getUserBySession(request.cookies.get(COOKIE)?.value);
  return NextResponse.json(
    { authenticated: !!user, user: user ? publicUser(user) : null },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "telegram-link-start") {
      const link = startTelegramLink();
      return NextResponse.json({
        ok: true,
        linkId: link.id,
        code: link.code,
        expiresAt: link.expiresAt,
        telegramUrl: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(link.code)}`,
      });
    }

    if (action === "telegram-link-status") {
      const link = getTelegramLinkStatus(String(body?.linkId || ""));
      return NextResponse.json({ ok: true, link });
    }

    if (action === "telegram-link-complete") {
      if (!TELEGRAM_INTERNAL_SECRET || String(body?.secret || "") !== TELEGRAM_INTERNAL_SECRET) {
        return jsonError("TELEGRAM BOT AUTHORIZATION REQUIRED.", 403);
      }

      const link = completeTelegramLink(
        String(body?.code || ""),
        String(body?.telegramId || ""),
        String(body?.telegramUsername || "")
      );

      return NextResponse.json({ ok: true, link });
    }

    if (action === "signup") {
      const link = getTelegramLinkStatus(String(body?.linkId || ""));
      if (link.status !== "LINKED" || !link.telegramId) {
        throw new Error("TELEGRAM MUST BE CONNECTED.");
      }

      const user = createUser(
        String(body.username || ""),
        String(body.password || ""),
        link.telegramId,
        link.telegramUsername || ""
      );

      const token = createSession(user.id);
      const response = NextResponse.json({ user: publicUser(user) });
      response.cookies.set(COOKIE, token, cookieOptions);
      return response;
    }

    if (action === "signin") {
      const user = authenticate(String(body.username || ""), String(body.password || ""));
      const token = createSession(user.id);
      const response = NextResponse.json({ user: publicUser(user) });
      response.cookies.set(COOKIE, token, cookieOptions);
      return response;
    }

    if (action === "signout") {
      const token = request.cookies.get(COOKIE)?.value;
      if (token) deleteSession(token);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }

    if (action === "update-username") {
      const current = getUserBySession(request.cookies.get(COOKIE)?.value);
      if (!current) throw new Error("AUTHENTICATION REQUIRED.");

      const username = String(body.username || "").trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error("INVALID USERNAME.");

      const fs = await import("node:fs");
      const path = await import("node:path");
      const dataPath = path.join(process.cwd(), "data", "auth.json");
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

      if (data.users.some((x: any) => x.id !== current.id && String(x.username).toLowerCase() === username.toLowerCase())) {
        throw new Error("USERNAME IS ALREADY IN USE.");
      }

      const user = data.users.find((x: any) => x.id === current.id);
      if (!user) throw new Error("ACCOUNT NOT FOUND.");
      user.username = username;
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");

      return NextResponse.json({ user: publicUser(user) });
    }

    if (action === "update-account") {
      const token = request.cookies.get(COOKIE)?.value;
      const current = getUserBySession(token);
      if (!current) throw new Error("AUTHENTICATION REQUIRED.");

      const username = String(body.username || current.username).trim();
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dataPath = path.join(process.cwd(), "data", "auth.json");
      const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
      const u = data.users.find((x: any) => x.id === current.id);
      if (!u) throw new Error("ACCOUNT NOT FOUND.");

      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error("INVALID USERNAME.");
      if (data.users.some((x: any) => x.id !== current.id && String(x.username).toLowerCase() === username.toLowerCase())) {
        throw new Error("USERNAME IS ALREADY IN USE.");
      }

      u.username = username;
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");
      return NextResponse.json({ user: publicUser(u) });
    }

    if (action === "signout") {
      deleteSession(request.cookies.get(COOKIE)?.value);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
      return response;
    }

    if (action === "recovery") {
      const ticket = createRecoveryTicket(String(body.username || ""));
      const prepared = prepareRecoveryTicketPasswordReset(ticket.id, "");
      const delivery = await sendTemporaryPasswordTelegram(
        prepared.telegramId,
        prepared.username,
        prepared.temporaryPassword
      );

      if (delivery.status !== "SENT") {
        return jsonError(
          delivery.status === "NOT_CONFIGURED"
            ? "TELEGRAM BOT IS NOT CONFIGURED."
            : "TEMPORARY PASSWORD COULD NOT BE DELIVERED TO TELEGRAM."
        );
      }

      const result = commitRecoveryTicketPasswordReset(
        prepared.ticketId,
        prepared.temporaryPassword,
        ""
      );

      return NextResponse.json({
        ok: true,
        ticketId: result.ticket.id,
        status: result.ticket.status,
        delivery,
      });
    }

    return NextResponse.json({ error: "UNKNOWN AUTH ACTION." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AUTHENTICATION FAILED." },
      { status: 400 }
    );
  }
}
