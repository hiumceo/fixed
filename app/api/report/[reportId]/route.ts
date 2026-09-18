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
    return new Response("Report not found", {
      status: 404,
    });
  }

  try {
    const file = await fs.readFile(report.path);

    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Report file is no longer available", {
      status: 404,
    });
  }
}