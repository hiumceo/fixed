const RUNNER_URL =
  process.env.V1124_RUNNER_URL || "http://127.0.0.1:18724";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ workspaceId: string }>;
};

function validId(id: string) {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

async function proxy(request: Request, workspaceId: string) {
  if (!validId(workspaceId)) {
    return Response.json({ error: "Invalid workspace id." }, { status: 400 });
  }

  const method = request.method;
  const response = await fetch(
    `${RUNNER_URL}/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method,
      headers:
        method === "POST" ? { "content-type": "application/json" } : undefined,
      body: method === "POST" ? await request.text() : undefined,
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => ({}));
  return Response.json(data, {
    status: response.status,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: Request, context: Params) {
  try {
    const { workspaceId } = await context.params;
    return await proxy(request, workspaceId);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the WorkStation workspace service.",
      },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const { workspaceId } = await context.params;
    return await proxy(request, workspaceId);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the WorkStation workspace service.",
      },
      { status: 502 }
    );
  }
}
