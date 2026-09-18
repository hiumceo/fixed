import { NextRequest, NextResponse } from "next/server";
import {
  getAdminBySession,
  listAdminUsers,
  listRecoveryTickets,
  processRecoveryTicket,
  resetUserPassword,
  prepareUserPasswordReset,
  commitUserPasswordReset,
  prepareRecoveryTicketPasswordReset,
  commitRecoveryTicketPasswordReset,
  setUserRole,
  setUserStatus,
  setRecoveryTicketStatus,
  type RecoveryStatus,
  type UserRole,
  type UserStatus,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "v1124_auth_session";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function sendTemporaryPasswordTelegram(telegramId: string, username: string, temporaryPassword: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: "NOT_CONFIGURED" as const };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text:
          "v1124 AUTH — Temporary Password\n\n" +
          `Hello ${username},\n\n` +
          `Temporary password: ${temporaryPassword}\n\n` +
          "Sign in with this password and change it immediately.\n\n" +
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
  const admin = getAdminBySession(request.cookies.get(COOKIE)?.value);
  if (!admin) return jsonError("ADMIN AUTHORIZATION REQUIRED.", 403);

  const resource = String(request.nextUrl.searchParams.get("resource") || "all").toLowerCase();
  const users = listAdminUsers();
  const tickets = listRecoveryTickets();
  const activeUsers = users.filter(user => user.status === "ACTIVE").length;
  const disabledUsers = users.filter(user => user.status === "DISABLED").length;
  const openTickets = tickets.filter(ticket => ticket.status === "OPEN" || ticket.status === "IN_REVIEW").length;

  if (resource === "users") return NextResponse.json({ users }, { headers: { "cache-control": "no-store" } });
  if (resource === "tickets") return NextResponse.json({ tickets }, { headers: { "cache-control": "no-store" } });
  if (resource === "status") {
    return NextResponse.json({
      status: "OPERATIONAL",
      authenticatedAs: admin.username,
      counts: { users: users.length, activeUsers, disabledUsers, tickets: tickets.length, openTickets },
      storage: "AUTH STORE ONLINE",
      timestamp: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({
    admin: { id: admin.id, username: admin.username, email: admin.email },
    users,
    tickets,
    counts: { users: users.length, activeUsers, disabledUsers, tickets: tickets.length, openTickets },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const admin = getAdminBySession(request.cookies.get(COOKIE)?.value);
  if (!admin) return jsonError("ADMIN AUTHORIZATION REQUIRED.", 403);
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "set-status") {
      const status = String(body?.status || "") as UserStatus;
      if (status !== "ACTIVE" && status !== "DISABLED") return jsonError("INVALID ACCOUNT STATUS.");
      const user = setUserStatus(String(body?.userId || ""), status, admin.id);
      return NextResponse.json({ ok: true, user });
    }
    if (action === "set-role") {
      const role = String(body?.role || "") as UserRole;
      if (role !== "USER" && role !== "ADMIN") return jsonError("INVALID ACCOUNT ROLE.");
      const user = setUserRole(String(body?.userId || ""), role, admin.id);
      return NextResponse.json({ ok: true, user });
    }
    if (action === "reset-password") {
      const prepared = prepareUserPasswordReset(String(body?.userId || ""), admin.id);
      const delivery = await sendTemporaryPasswordTelegram(prepared.telegramId, prepared.username, prepared.temporaryPassword);
      if (delivery.status !== "SENT") {
        return jsonError(delivery.status === "NOT_CONFIGURED" ? "TELEGRAM BOT IS NOT CONFIGURED." : "TEMPORARY PASSWORD COULD NOT BE DELIVERED TO TELEGRAM.");
      }
      const result = commitUserPasswordReset(prepared.userId, prepared.temporaryPassword, admin.id);
      return NextResponse.json({ ok: true, user: result.user, temporaryPassword: result.temporaryPassword, delivery });
    }
    if (action === "process-ticket") {
      const prepared = prepareRecoveryTicketPasswordReset(String(body?.ticketId || ""), admin.id);
      const delivery = await sendTemporaryPasswordTelegram(prepared.telegramId, prepared.username, prepared.temporaryPassword);
      if (delivery.status !== "SENT") {
        return jsonError(delivery.status === "NOT_CONFIGURED" ? "TELEGRAM BOT IS NOT CONFIGURED." : "TEMPORARY PASSWORD COULD NOT BE DELIVERED TO TELEGRAM.");
      }
      const result = commitRecoveryTicketPasswordReset(prepared.ticketId, prepared.temporaryPassword, admin.id);
      return NextResponse.json({ ok: true, ticket: result.ticket, user: result.user, temporaryPassword: result.temporaryPassword, delivery });
    }
    if (action === "set-ticket-status") {
      const status = String(body?.status || "") as RecoveryStatus;
      if (!["OPEN", "IN_REVIEW", "PROCESSED", "CLOSED"].includes(status)) return jsonError("INVALID TICKET STATUS.");
      const ticket = setRecoveryTicketStatus(String(body?.ticketId || ""), status);
      return NextResponse.json({ ok: true, ticket });
    }
    return jsonError("UNKNOWN ADMIN ACTION.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "ADMIN ACTION FAILED.");
  }
}
