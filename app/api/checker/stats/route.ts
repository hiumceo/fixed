import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, publicUser, recordCheckerStats } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "v1124_auth_session";
const TYPES = ["LINK", "IMAGE", "VIDEO", "ULTIMATE"] as const;
type CheckerType = typeof TYPES[number];

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function POST(request: NextRequest) {
  const user = getUserBySession(request.cookies.get(COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "AUTHENTICATION REQUIRED." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const body = await request.json().catch(() => ({}));
  const type = String(body?.type || "").toUpperCase() as CheckerType;
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "INVALID CHECKER TYPE." }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const updated = recordCheckerStats(user.id, type, {
      runs: 1,
      checked: number(body?.checked),
      manual: number(body?.manual),
      defects: number(body?.defects),
    });
    return NextResponse.json({ ok: true, user: updated, checkerStats: updated.checkerStats }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CHECKER STATISTICS COULD NOT BE SAVED." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
