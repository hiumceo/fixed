import { NextRequest } from "next/server";
import {
  getWorkspace,
  saveWorkspace,
  workspaceResponse,
  type WorkstationWorkspace,
} from "@/lib/workstation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("workspaceId")?.trim();
  if (!id) return workspaceResponse({ error: "workspaceId is required." }, 400);

  const result = await getWorkspace(id);
  if (!result.response.ok) return workspaceResponse(result.data, result.response.status);

  const workspace = result.data?.workspace as WorkstationWorkspace | undefined;
  if (!workspace?.state) return workspaceResponse({ error: "Workspace state is unavailable." }, 502);

  return workspaceResponse({
    workspaceId: id,
    checker: {
      reports: workspace.state.checkerReports,
      inlineReports: workspace.state.inlineReports,
      inlineReportCategory: workspace.state.inlineReportCategory,
      ultimateFinalSummary: workspace.state.ultimateFinalSummary,
      ultimateSummary: workspace.state.ultimateSummary,
    },
  });
}
