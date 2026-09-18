import { NextRequest } from "next/server";
import {
  getWorkspace,
  runnerJson,
  saveWorkspace,
  workspaceResponse,
  type WorkstationWorkspace,
} from "@/lib/workstation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();

  try {
    const result = id
      ? await getWorkspace(id)
      : await runnerJson("/workspaces");

    return workspaceResponse(result.data, result.response.status);
  } catch (error) {
    return workspaceResponse(
      { error: error instanceof Error ? error.message : "Unable to reach WorkStation workspace service." },
      502,
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const workspace = (body?.workspace ?? body) as WorkstationWorkspace;

    if (
      !workspace ||
      typeof workspace !== "object" ||
      typeof workspace.id !== "string" ||
      !workspace.id.trim() ||
      typeof workspace.name !== "string" ||
      !workspace.name.trim() ||
      !workspace.state ||
      typeof workspace.state !== "object"
    ) {
      return workspaceResponse(
        { error: "Workspace id, name, and state are required." },
        400,
      );
    }

    const result = await saveWorkspace({
      ...workspace,
      name: workspace.name.trim(),
    });

    return workspaceResponse(result.data, result.response.status);
  } catch (error) {
    return workspaceResponse(
      { error: error instanceof Error ? error.message : "Unable to save WorkStation workspace." },
      502,
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return workspaceResponse({ error: "Workspace id is required." }, 400);
  }

  try {
    const result = await runnerJson(`/workspaces/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return workspaceResponse(result.data, result.response.status);
  } catch (error) {
    return workspaceResponse(
      { error: error instanceof Error ? error.message : "Unable to delete WorkStation workspace." },
      502,
    );
  }
}
