import { NextRequest, NextResponse } from "next/server";
import { changePassword, getUserBySession } from "@/lib/auth";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const user = getUserBySession(request.cookies.get("v1124_auth_session")?.value); if (!user) return NextResponse.json({ error: "AUTHENTICATION REQUIRED." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try { changePassword(user.id, String(body.currentPassword || ""), String(body.newPassword || "")); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PASSWORD COULD NOT BE CHANGED." }, { status: 400 }); }
}
