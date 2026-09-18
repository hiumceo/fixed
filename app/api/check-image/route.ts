import { chromium } from "playwright";

import path from "path";

import os from "os";

import fs from "fs/promises";

import crypto from "crypto";

import { registerReport } from "@/lib/reports";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing url parameter", {
      status: 400,
    });
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);

    if (
      !["http:", "https:"].includes(
        parsedUrl.protocol
      )
    ) {
      throw new Error(
        "Only HTTP and HTTPS URLs are supported."
      );
    }
  } catch {
    return new Response("Invalid URL", {
      status: 400,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let browser;

      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify(data)}\n\n`
          )
        );
      };

      try {
        /*
         * ------------------------------------------------------
         * START HEADED BROWSER — HIDDEN OFF-SCREEN
         * ------------------------------------------------------
         */

        browser = await chromium.launch({
          headless: false,

          args: [
            "--window-position=-2000,-2000",
            "--window-size=1920,1080",
          ],
        });

        const page = await browser.newPage();

        let scanComplete = false;

        /*
         * The download promise resolves with the ACTUAL
         * captured TXT report.
         */

        let downloadResolve:
          | ((
              value: {
                filename: string;
                path: string;
              } | null
            ) => void)
          | null = null;

        const downloadPromise =
  new Promise<{
    filename: string;
    path: string;
  } | null>((resolve) => {
    downloadResolve = resolve;
  });

        /*
         * ------------------------------------------------------
         * DOWNLOAD REPORT
         * ------------------------------------------------------
         */

        page.once(
          "download",
          async (download) => {
            try {
              const originalFilename =
                download.suggestedFilename();

              /*
               * Example:
               *
               * page-name.txt
               *
               * becomes:
               *
               * page-name-image.txt
               */

              const baseName =
                originalFilename.replace(
                  /\.txt$/i,
                  ""
                );

              const filename =
                `${baseName}-image.txt`;

              const tempPath =
                path.join(
                  os.tmpdir(),
                  `v1124-${Date.now()}-${filename}`
                );

              await download.saveAs(
                tempPath
              );

              const capturedReport = {
                filename,
                path: tempPath,
              };

              send({
                type: "report",
                message:
                  `TXT captured: ${filename}`,
                filename,
              });

              if (downloadResolve) {
                downloadResolve(
                  capturedReport
                );

                downloadResolve = null;
              }
            } catch (error) {
              send({
                type: "page-error",
                message:
                  error instanceof Error
                    ? error.message
                    : String(error),
              });

              if (downloadResolve) {
                downloadResolve(null);

                downloadResolve = null;
              }
            }
          }
        );

        /*
         * ------------------------------------------------------
         * CONSOLE
         * ------------------------------------------------------
         */

        page.on(
          "console",
          (message) => {
            const text =
              message.text();

            send({
              type: "console",
              message: text,
            });

            if (
              text.includes(
                "SCAN COMPLETE"
              )
            ) {
              scanComplete = true;

              /*
               * A zero-defect scan is a valid completed scan and
               * intentionally produces no TXT report. Only release
               * the report wait here when the final summary confirms
               * that there is nothing to report.
               *
               * When confirmed defects exist, keep waiting for the
               * actual captured report so the existing report-ready
               * path is unchanged.
               */
              const brokenMatch = text.match(
                /Confirmed broken(?: videos)?:\s*(\d+)/i
              );

              if (
                brokenMatch &&
                Number(brokenMatch[1]) === 0 &&
                downloadResolve
              ) {
                downloadResolve(null);
                downloadResolve = null;
              }
            }
          }
        );

        /*
         * ------------------------------------------------------
         * PAGE ERRORS
         * ------------------------------------------------------
         */

        page.on(
          "pageerror",
          (error) => {
            send({
              type: "page-error",
              message:
                error.message,
            });
          }
        );

        /*
         * ------------------------------------------------------
         * OPEN PAGE
         * ------------------------------------------------------
         */

        send({
          type: "status",
          message: "Opening page...",
        });

        await page.goto(
          parsedUrl.toString(),
          {
            waitUntil:
              "domcontentloaded",
            timeout: 30000,
          }
        );

        /*
         * ------------------------------------------------------
         * PAGE RENDERING
         * ------------------------------------------------------
         */

        send({
          type: "status",
          message: "Page rendering...",
        });

        /*
         * Wait for the actual browser LOAD event before
         * beginning the 20-second rendering window.
         */

        try {
          await page.waitForLoadState(
            "load",
            {
              timeout: 30000,
            }
          );
        } catch {
          /*
           * Some sites continue loading indefinitely.
           * Continue rather than hanging the checker.
           */
        }

        /*
         * ------------------------------------------------------
         * 20-SECOND RENDER WINDOW
         * ------------------------------------------------------
         */

        for (
          let seconds = 20;
          seconds >= 1;
          seconds--
        ) {
          send({
            type: "status",
            message:
              `Page Rendering... ${seconds}s`,
          });

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                1000
              )
          );
        }

        /*
         * ------------------------------------------------------
         * PAGE RENDERED
         * ------------------------------------------------------
         */

        send({
          type: "status",
          message: "Page rendered.",
        });

        /*
         * ------------------------------------------------------
         * START PROVEN IMAGE CHECKER
         * ------------------------------------------------------
         */

        send({
          type: "status",
          message:
            "Starting Broken Image Checker v1124...",
        });

        const checkerPath =
          path.join(
            process.cwd(),
            "checkers",
            "broken-image-checker.js"
          );

        try {
          await page.addScriptTag({
            path: checkerPath,
          });
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

          const checkerSource =
            await fs.readFile(
              checkerPath,
              "utf8"
            );

          const checkerFunction =
            new Function(checkerSource);

          await page.evaluate(
  checkerFunction as () => void
);
        }

        /*
         * ------------------------------------------------------
         * WAIT FOR SCAN COMPLETE
         * ------------------------------------------------------
         */

        while (!scanComplete) {
  await new Promise(
    (resolve) =>
      setTimeout(resolve, 100)
  );
}

const capturedReport =
  await downloadPromise;

if (capturedReport) {
  try {
    await fs.access(
      capturedReport.path
    );

    const reportId =
      crypto.randomUUID();

    registerReport(
      reportId,
      {
        path:
          capturedReport.path,
        filename:
          capturedReport.filename,
      }
    );

    send({
      type: "report-ready",
      message:
        `Report generated: ${capturedReport.filename}`,
      filename:
        capturedReport.filename,
      reportId,
    });
  } catch {
    send({
      type: "error",
      message:
        "The checker generated a report name, but the TXT file could not be captured.",
    });
  }
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
        if (browser) {
          await browser.close();
        }

        controller.close();
      }
    },
  });

  return new Response(
    stream,
    {
      headers: {
        "Content-Type":
          "text/event-stream",

        "Cache-Control":
          "no-cache, no-transform",

        Connection:
          "keep-alive",
      },
    }
  );
}