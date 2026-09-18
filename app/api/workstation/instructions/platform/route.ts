const RUNNER_URL =
  process.env.V1124_RUNNER_URL || "http://127.0.0.1:18724";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${RUNNER_URL}/instructions/platform`, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));

    return Response.json(data, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the WorkStation instruction service.",
      },
      { status: 502 }
    );
  }
}
