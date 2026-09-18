import { NextResponse } from "next/server";

const RUNNER_URL =
  process.env.V1124_RUNNER_URL || "http://127.0.0.1:18724";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("id")?.trim();

  if (!reportId) {
    return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${RUNNER_URL}/checker/report/${encodeURIComponent(reportId)}`,
      { cache: "no-store" }
    );

    const data = await response.json().catch(() => ({}));

    return NextResponse.json(data, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the Checker report service.",
      },
      { status: 502 }
    );
  }
}
