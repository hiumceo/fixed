import { NextRequest, NextResponse } from "next/server";
import { RUNNER_URL } from "@/lib/workstation";
import { normalizeAccountState } from "@/lib/account";
import {
  getUserBySession,
  publicUser,
  updateUserAvatar,
  recordCheckerStats,
  recordWorkstationUltimateStats,
  type StatSummary,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = getUserBySession(request.cookies.get("v1124_auth_session")?.value);
  if (!user) return NextResponse.json({ error: "AUTHENTICATION REQUIRED." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const response = await fetch(`${RUNNER_URL}/account`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (data?.account) {
      data.account = normalizeAccountState(data.account);
      data.account.profile = { ...data.account.profile, email: user.email, avatar: user.avatar || "" };
    }
    return NextResponse.json({ ...data, authUser: publicUser(user) }, { status: response.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ACCOUNT UNAVAILABLE" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const user = getUserBySession(request.cookies.get("v1124_auth_session")?.value);
  if (!user) return NextResponse.json({ error: "AUTHENTICATION REQUIRED." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const body = await request.json().catch(() => ({}));
    const account = normalizeAccountState(body?.account);
    const avatar = typeof account.profile.avatar === "string" ? account.profile.avatar : "";
    updateUserAvatar(user.id, avatar);
    account.profile.email = user.email;
    // The Runner account is shared workspace state; user-specific avatar data belongs to AUTH.
    account.profile.avatar = "";
    const response = await fetch(`${RUNNER_URL}/account`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (data?.account) {
      data.account = normalizeAccountState(data.account);
      data.account.profile.email = user.email;
      data.account.profile.avatar = avatar;
    }
    return NextResponse.json({ ...data, authUser: publicUser(user) }, { status: response.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ACCOUNT COULD NOT BE SAVED" }, { status: 502 });
  }
}


export async function POST(request: NextRequest) {
  const user = getUserBySession(request.cookies.get("v1124_auth_session")?.value);
  if (!user) {
    return NextResponse.json(
      { error: "AUTHENTICATION REQUIRED." },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const system = body?.system === "workstation" ? "workstation" : "checker";
    const category = String(body?.category || "").toUpperCase();
    const outcome = body?.outcome === "failed" ? "failed" : "success";

    if (system === "workstation") {
      if (category !== "ULTIMATE") {
        return NextResponse.json({ error: "INVALID WORKSTATION STATS CATEGORY." }, { status: 400 });
      }
      const summary = body?.summary;
      if (outcome === "success" && (!summary?.LINK || !summary?.IMAGE || !summary?.VIDEO)) {
        return NextResponse.json({ error: "INVALID WORKSTATION SUMMARY." }, { status: 400 });
      }
      recordWorkstationUltimateStats(user.id, outcome, summary);
    } else {
      if (!["LINK", "IMAGE", "VIDEO", "ULTIMATE"].includes(category)) {
        return NextResponse.json({ error: "INVALID CHECKER STATS CATEGORY." }, { status: 400 });
      }
      const summary = body?.summary as StatSummary | undefined;
      recordCheckerStats(user.id, category as "LINK" | "IMAGE" | "VIDEO" | "ULTIMATE", outcome, summary);
    }

    const updated = getUserBySession(request.cookies.get("v1124_auth_session")?.value);
    return NextResponse.json(
      { authUser: updated ? publicUser(updated) : null },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "STATS COULD NOT BE SAVED." },
      { status: 500 }
    );
  }
}
