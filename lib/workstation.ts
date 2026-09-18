import { NextResponse } from "next/server";

export const RUNNER_URL =
  process.env.V1124_RUNNER_URL || "http://127.0.0.1:18724";

export type EvidenceCategory = "SCREENSHOT" | "SCREENCAST" | "LOG";

export type EvidenceFile = {
  id: string;
  name: string;
  category: EvidenceCategory;
  createdAt: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type ArtifactKind = "JSON" | "TXT" | "MASTER";

export type Artifact = {
  id: string;
  name: string;
  kind: ArtifactKind;
  createdAt: string;
  content?: string;
};

export type SourceKind = "INSTRUCTIONS" | "SOURCE";

export type SourceFile = {
  id: string;
  name: string;
  kind: SourceKind;
  createdAt: string;
  content?: string;
};

export type CheckerCategory = "LINK" | "IMAGE" | "VIDEO";

export type CheckerReport = {
  id: string;
  category: CheckerCategory;
  filename?: string;
  count?: number;
  content?: string;
};

export type InlineReport = {
  filename: string;
  content: string;
};

export type UltimateMetric = {
  checked: number;
  manual: number;
  defects: number;
};

export type UltimateSummary = {
  LINK: UltimateMetric;
  IMAGE: UltimateMetric;
  VIDEO: UltimateMetric;
};

export type WorkstationState = {
  browserUrl: string;
  investigationBrowser: string;
  selectedExtractor: string;
  signals: Artifact[];
  extractedFiles: Artifact[];
  sources: SourceFile[];
  checkerReports: CheckerReport[];
  evidenceFiles: EvidenceFile[];
  inlineReports: Partial<Record<CheckerCategory, InlineReport>>;
  inlineReportCategory: CheckerCategory;
  ultimateFinalSummary: string[];
  ultimateSummary: UltimateSummary;
  projectInstruction?: unknown;
};

export type WorkstationWorkspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: WorkstationState;
};

export async function runnerJson(path: string, init?: RequestInit) {
  const response = await fetch(`${RUNNER_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export async function getWorkspace(id: string) {
  return runnerJson(`/workspaces/${encodeURIComponent(id)}`);
}

export async function saveWorkspace(workspace: WorkstationWorkspace) {
  return runnerJson("/workspaces", {
    method: "POST",
    body: JSON.stringify({ workspace }),
  });
}

export function workspaceResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function requireWorkspaceId(value: string | null) {
  const id = value?.trim();
  return id || null;
}
