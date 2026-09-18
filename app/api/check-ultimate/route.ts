import { chromium } from "playwright";
import path from "node:path";
import crypto from "node:crypto";

const RUNNER_URL =
  process.env.V1124_RUNNER_URL || "http://127.0.0.1:18724";

type Category = "LINK" | "IMAGE" | "VIDEO";

type CheckerReport = {
  category: Category;
  filename: string;
  content: string;
  count?: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error();
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
      let closed = false;
      let masterScanComplete = false;

      const send = (data: object) => {
        if (closed) return;

        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      try {
        send({
          type: "status",
          message: "Opening page...",
        });

        // Preserve the original public Bug Checker browser behavior:
        // headful Playwright, deliberately positioned off-screen.
        browser = await chromium.launch({
          headless: false,
          args: [
            "--window-position=-2000,-2000",
            "--window-size=1920,1080",
          ],
        });

        const page = await browser.newPage();

        page.on("console", (msg) => {
          const text = msg.text();
          if (!text) return;

          send({
            type: "console",
            message: text,
          });

          if (text.includes("MASTER SCAN COMPLETE")) {
            masterScanComplete = true;
          }
        });

        page.on("pageerror", (error) => {
          send({
            type: "page-error",
            message: error.message,
          });
        });

        send({
          type: "status",
          message: "Page rendering...",
        });

        await page.goto(parsedUrl.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        try {
          await page.waitForLoadState("load", { timeout: 30000 });
        } catch {
          // Preserve the original behavior: continue after a load timeout.
        }

        for (let seconds = 20; seconds > 0; seconds--) {
          send({
            type: "status",
            message: `Page Rendering... ${seconds}s`,
          });
          await sleep(1000);
        }

        send({
          type: "status",
          message: "Page rendered.",
        });

        send({
          type: "status",
          message: "Starting Website Defect Checker v1124...",
        });

        const checkerPath = path.join(
          process.cwd(),
          "checkers",
          "website-defect-checker.js"
        );

        try {
          await page.addScriptTag({ path: checkerPath });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          /*
           * Preserve the existing script-tag path for normal pages.
           * Some target pages enforce CSP that blocks the inline
           * script produced by Playwright's path-based injection.
           * Only that CSP failure uses the evaluation fallback,
           * avoiding any change to successful non-CSP checks.
           */
          if (
            !message.includes("Content Security Policy") &&
            !message.includes("page.addScriptTag")
          ) {
            throw error;
          }

          const fs = await import("node:fs/promises");
          const checkerSource = await fs.readFile(
            checkerPath,
            "utf8"
          );

          const checkerFunction =
            new Function(checkerSource);

          await page.evaluate(
  checkerFunction as () => void
);
        }

        // The checker produces three real browser downloads (LINK/IMAGE/VIDEO).
        // Capture those TXT artifacts directly. The viewer only needs the selected
        // TXT content; it does not need the checker to expose a synthetic JS object.
        const downloadPromises: Array<Promise<void>> = [];
        const downloads: Array<{
          filename: string;
          content: string;
        }> = [];

        // Attach this before the checker starts so none of the three real TXT
        // downloads can be missed. Each download is one independent Ultimate report.
        page.on("download", (download) => {
          downloadPromises.push((async () => {
            try {
              const filename = download.suggestedFilename();
              const filePath = await download.path();
              if (!filePath || !filename) return;

              const fs = await import("node:fs/promises");
              const content = await fs.readFile(filePath, "utf8");
              downloads.push({ filename, content });
            } catch {
              // A failed individual download simply does not produce a report tab.
            }
          })());
        });


        // Preserve the original completion gate: there is no fixed scan timeout.
        while (!masterScanComplete) {
          await sleep(100);
        }

        // Wait for every download event that fired during the checker run to finish
        // reading its TXT artifact before registering the reports.
        await Promise.all(downloadPromises);

        for (const report of downloads) {
          const lower = report.filename.toLowerCase();
          const category: Category | null =
            lower.includes("- link.txt") || lower.endsWith("link.txt")
              ? "LINK"
              : lower.includes("- image.txt") || lower.endsWith("image.txt")
                ? "IMAGE"
                : lower.includes("- video.txt") || lower.endsWith("video.txt")
                  ? "VIDEO"
                  : null;

          if (!category) continue;

          const registerResponse = await fetch(
            `${RUNNER_URL}/checker/report/register`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                category,
                filename: report.filename,
                content: report.content,
                page: parsedUrl.toString(),
                incognito: false,
              }),
            }
          );

          const registerData = await registerResponse.json().catch(() => ({}));
          if (!registerResponse.ok || !registerData?.report?.id) {
            throw new Error(
              registerData?.error || "Unable to register Checker report."
            );
          }

          send({
            type: "report-ready",
            category,
            filename: report.filename,
            reportId: registerData.report.id,
            message: `Report generated: ${report.filename}`,
          });
        }

        send({
          type: "complete",
          message: "SCAN COMPLETE",
        });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
      } finally {
        try {
          await browser?.close();
        } catch {}

        closed = true;

        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
    },
  });
}
