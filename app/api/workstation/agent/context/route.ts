import { NextRequest } from "next/server";
import {
  getWorkspace,
  runnerJson,
  workspaceResponse,
  type WorkstationWorkspace,
} from "@/lib/workstation";
import { normalizeAccountState, tierPermissions } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return workspaceResponse({ error: "Workspace id is required." }, 400);
  }

  try {
    const result = await getWorkspace(id);
    const accountResult = await runnerJson("/account");

    if (!result.response.ok) {
      return workspaceResponse(result.data, result.response.status);
    }

    const workspace = result.data?.workspace as WorkstationWorkspace | undefined;

    if (!workspace?.state) {
      return workspaceResponse(
        { error: "Workspace state is unavailable." },
        502,
      );
    }

    const state = workspace.state;
    const account = normalizeAccountState(accountResult.response.ok ? accountResult.data?.account : null);

    return workspaceResponse({
      account: {
        tier: account.tier,
        profile: account.profile,
        preferences: account.preferences,
        permissions: tierPermissions(account.tier),
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        browser: {
          url: state.browserUrl,
          investigationBrowser: state.investigationBrowser,
        },
        checker: {
          reports: state.checkerReports,
          inlineReports: state.inlineReports,
          inlineReportCategory: state.inlineReportCategory,
          ultimateFinalSummary: state.ultimateFinalSummary,
          ultimateSummary: state.ultimateSummary,
        },
        signals: state.signals,
        extraction: {
          selectedExtractor: state.selectedExtractor,
          files: state.extractedFiles,
        },
        evidence: {
          files: state.evidenceFiles,
        },
        sources: state.sources,
        projectInstruction: state.projectInstruction ?? null,
      },
    });
  } catch (error) {
    return workspaceResponse(
      { error: error instanceof Error ? error.message : "Unable to build WorkStation agent context." },
      502,
    );
  }
}
