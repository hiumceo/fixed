import { NextRequest, NextResponse } from "next/server";
import { getUserBySession, recordCheckerStats } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = getUserBySession(request.cookies.get("v1124_auth_session")?.value);
  if (!user) return NextResponse.json({ error: "AUTHENTICATION REQUIRED." }, { status: 401, headers: { "cache-control": "no-store" } });

  const body = await request.json().catch(() => ({}));
  const summary = body?.summary || {};
  const checked = ["LINK", "IMAGE", "VIDEO"].reduce((total, key) => total + Math.max(0, Number(summary?.[key]?.checked || 0)), 0);
  const defects = ["LINK", "IMAGE", "VIDEO"].reduce((total, key) => total + Math.max(0, Number(summary?.[key]?.defects || 0)), 0);

  recordCheckerStats(user.id, "WORKSTATION", "ULTIMATE", { runs: 1, checked, defects });
  return NextResponse.json({ status: "RECORDED" }, { headers: { "cache-control": "no-store" } });
}
