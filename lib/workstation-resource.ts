import { NextRequest } from "next/server";
import {
  getWorkspace,
  saveWorkspace,
  workspaceResponse,
  type WorkstationWorkspace,
} from "@/lib/workstation";

export async function readResource(
  request: NextRequest,
  field: keyof WorkstationWorkspace["state"],
) {
  const id = request.nextUrl.searchParams.get("workspaceId")?.trim();
  if (!id) return workspaceResponse({ error: "workspaceId is required." }, 400);

  const result = await getWorkspace(id);
  if (!result.response.ok) return workspaceResponse(result.data, result.response.status);

  const workspace = result.data?.workspace as WorkstationWorkspace | undefined;
  if (!workspace?.state) {
    return workspaceResponse({ error: "Workspace state is unavailable." }, 502);
  }

  return workspaceResponse({
    workspaceId: id,
    [field]: workspace.state[field] ?? null,
  });
}

export async function writeResource(
  request: Request,
  field: keyof WorkstationWorkspace["state"],
) {
  const body = await request.json();
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId.trim() : "";

  if (!workspaceId) return workspaceResponse({ error: "workspaceId is required." }, 400);

  const result = await getWorkspace(workspaceId);
  if (!result.response.ok) return workspaceResponse(result.data, result.response.status);

  const workspace = result.data?.workspace as WorkstationWorkspace | undefined;
  if (!workspace?.state) {
    return workspaceResponse({ error: "Workspace state is unavailable." }, 502);
  }

  const next: WorkstationWorkspace = {
    ...workspace,
    state: {
      ...workspace.state,
      [field]: body?.data,
    },
  };

  const saved = await saveWorkspace(next);
  return workspaceResponse(saved.data, saved.response.status);
}
