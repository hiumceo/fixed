import fs from "fs/promises";
import { getReport } from "@/lib/reports";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      reportId: string;
    }>;
  }
) {
  const { reportId } = await context.params;

  const report = getReport(reportId);

  if (!report) {
    return Response.json(
      {
        error: "Report not found",
      },
      {
        status: 404,
      }
    );
  }

  try {
    const content = await fs.readFile(
      report.path,
      "utf-8"
    );

    return Response.json(
      {
        filename: report.filename,
        content,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return Response.json(
      {
        error:
          "Report file is no longer available",
      },
      {
        status: 404,
      }
    );
  }
}