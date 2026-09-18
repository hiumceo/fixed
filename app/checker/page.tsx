"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components_AuthGate";
import CheckerManagement from "@/app/checker/CheckerManagement";

type CheckerType = "LINK" | "IMAGE" | "VIDEO" | "ULTIMATE";
type UltimateCategory = "LINK" | "IMAGE" | "VIDEO";

type UltimateSummary = {
  checked: number;
  manual: number;
  defects: number;
};

const checkerInfo = {
  LINK: {
    checked: "Links checked",
    broken: "Broken links",
    button: "CHECK LINK",
    icon: "↗",
  },
  IMAGE: {
    checked: "Images checked",
    broken: "Broken images",
    button: "CHECK IMAGE",
    icon: "▧",
  },
  VIDEO: {
    checked: "Videos checked",
    broken: "Broken videos",
    button: "CHECK VIDEO",
    icon: "▶",
  },
  ULTIMATE: {
    checked: "Reports generated",
    broken: "Confirmed defects",
    button: "RUN ULTIMATE CHECK",
    icon: "⚡",
  },
};

function CheckerPage() {

  const [activeTab, setActiveTab] =
    useState<CheckerType>("LINK");

  const [url, setUrl] = useState("");

  const [checking, setChecking] = useState(false);
  const [complete, setComplete] = useState(false);

  const [liveLines, setLiveLines] =
    useState<string[]>([]);

  const [finalSummary, setFinalSummary] =
    useState<string[]>([]);

  const [checkedCount, setCheckedCount] =
    useState<number | null>(null);

  const [brokenCount, setBrokenCount] =
    useState<number | null>(null);

  const [manualVerificationCount, setManualVerificationCount] =
    useState<number | null>(null);

  const [reportId, setReportId] =
    useState<string | null>(null);

  const [ultimateReports, setUltimateReports] =
    useState<Partial<Record<"LINK" | "IMAGE" | "VIDEO", string>>>({});

  const [ultimateSummary, setUltimateSummary] =
    useState<Record<UltimateCategory, UltimateSummary>>({
      LINK: { checked: 0, manual: 0, defects: 0 },
      IMAGE: { checked: 0, manual: 0, defects: 0 },
      VIDEO: { checked: 0, manual: 0, defects: 0 },
    });


  const current = checkerInfo[activeTab];

  /*
   * Keep only the latest two live checker messages
   * while the scan is running.
   */
  function addLiveLine(message: string) {
    if (!message.trim()) {
      return;
    }

    setLiveLines((previous) => {
      const next = [...previous, message];

      return next.slice(-2);
    });
  }

  /*
   * Extract a numeric value from checker output.
   *
   * Supports the current compact format:
   *
   * CHECKED 22
   * BROKEN 0
   * MANUAL VERIFICATION 0
   *
   * Also accepts the older detailed checker terminology.
   */
  function extractValue(
    message: string,
    patterns: RegExp[]
  ) {
    for (const pattern of patterns) {
      const match = message.match(pattern);

      if (match) {
        return match[1].trim();
      }
    }

    return "";
  }

  /*
   * Parse counters from every checker message.
   */
  function parseSummary(message: string) {
    const checked = extractValue(message, [
      /^\s*CHECKED\s+(\d+)/im,
      /^\s*Visible links:\s*(\d+)/im,
      /^\s*Visible images:\s*(\d+)/im,
      /^\s*Visible videos:\s*(\d+)/im,
    ]);

    const broken = extractValue(message, [
      /^\s*BROKEN\s+(\d+)/im,
      /^\s*Confirmed broken videos:\s*(\d+)/im,
      /^\s*Confirmed broken images:\s*(\d+)/im,
      /^\s*Confirmed broken:\s*(\d+)/im,
    ]);

    const manualVerification = extractValue(message, [
      /^\s*MANUAL VERIFICATION\s+(\d+)/im,
      /^\s*Manual verification:\s*(\d+)/im,
    ]);

    if (activeTab === "ULTIMATE") {
      const ultimateMatch = message.match(
        /^ULTIMATE\s+(LINK|IMAGE|VIDEO)\s+SUMMARY:\s+CHECKED\s+(\d+)\s+\|\s+MANUAL\s+(\d+)\s+\|\s+DEFECTS\s+(\d+)$/im
      );

      if (ultimateMatch) {
        const category =
          ultimateMatch[1] as UltimateCategory;

        setUltimateSummary((previous) => ({
          ...previous,
          [category]: {
            checked: Number(ultimateMatch[2]),
            manual: Number(ultimateMatch[3]),
            defects: Number(ultimateMatch[4]),
          },
        }));
      }

      const total = extractValue(message, [
        /^\s*TOTAL CONFIRMED DEFECTS:\s*(\d+)/im,
      ]);

      if (total !== "") {
        setBrokenCount(Number(total));
      }
    }

    if (checked !== "") {
      setCheckedCount(Number(checked));
    }

    if (broken !== "") {
      setBrokenCount(Number(broken));
    }

    if (manualVerification !== "") {
      setManualVerificationCount(
        Number(manualVerification)
      );
    }
  }

  /*
   * Extract a field from the final checker message.
   */
  function extractField(
    message: string,
    patterns: RegExp[]
  ) {
    for (const pattern of patterns) {
      const match = message.match(pattern);

      if (match) {
        return match[1].trim();
      }
    }

    return "";
  }

  /*
   * Build the final organized live-check console.
   *
   * Traffic-light order:
   *
   * GREEN  = CHECKED
   * YELLOW = MANUAL VERIFICATION
   * RED    = BROKEN
   *
   * Network/CORS and Rate Limited are intentionally
   * not displayed in the user-facing console.
   */
  function buildFinalSummary(
    messages: string[]
  ) {
    const completeMessage =
      messages.find((message) =>
        message.includes(
          activeTab === "ULTIMATE"
            ? "MASTER SCAN COMPLETE"
            : "SCAN COMPLETE"
        )
      );

    if (!completeMessage) {
      return [];
    }

    if (activeTab === "ULTIMATE") {
      const page = extractField(
        completeMessage,
        [
          /^\s*Page:\s*(.+)$/im,
        ]
      );

      const total = extractField(
        completeMessage,
        [
          /^\s*TOTAL CONFIRMED DEFECTS:\s*(\d+)$/im,
        ]
      );

      const summaries: Record<
        UltimateCategory,
        string
      > = {
        LINK: "CHECKED 0 | MANUAL 0 | DEFECTS 0",
        IMAGE: "CHECKED 0 | MANUAL 0 | DEFECTS 0",
        VIDEO: "CHECKED 0 | MANUAL 0 | DEFECTS 0",
      };

      for (const message of messages) {
        const match = message.match(
          /^ULTIMATE\s+(LINK|IMAGE|VIDEO)\s+SUMMARY:\s+CHECKED\s+(\d+)\s+\|\s+MANUAL\s+(\d+)\s+\|\s+DEFECTS\s+(\d+)$/im
        );

        if (match) {
          summaries[
            match[1] as UltimateCategory
          ] =
            `CHECKED ${match[2]} | MANUAL ${match[3]} | DEFECTS ${match[4]}`;
        }
      }

      const organized: string[] = [
        "SCAN COMPLETE",
        "Checker: Website Defect Checker v1124",
      ];

      if (page) {
        organized.push(`Page: ${page}`);
      }

      organized.push(
        `LINK ${summaries.LINK}`,
        `IMAGE ${summaries.IMAGE}`,
        `VIDEO ${summaries.VIDEO}`,
        `TOTAL CONFIRMED DEFECTS ${total || "0"}`
      );

      return organized;
    }

    const checker =
      extractField(
        completeMessage,
        [
          /^\s*CHECKER\s+(.+)$/im,
          /^\s*Checker:\s*(.+)$/im,
        ]
      );

    const page =
      extractField(
        completeMessage,
        [
          /^\s*PAGE\s+(.+)$/im,
          /^\s*Page:\s*(.+)$/im,
        ]
      );

    const checked =
      extractField(
        completeMessage,
        [
          /^\s*CHECKED\s+(\d+)$/im,
          /^\s*Visible links:\s*(\d+)$/im,
          /^\s*Visible images:\s*(\d+)$/im,
          /^\s*Visible videos:\s*(\d+)$/im,
        ]
      );

    const broken =
      extractField(
        completeMessage,
        [
          /^\s*BROKEN\s+(\d+)$/im,
          /^\s*Confirmed broken videos:\s*(\d+)$/im,
          /^\s*Confirmed broken images:\s*(\d+)$/im,
          /^\s*Confirmed broken:\s*(\d+)$/im,
        ]
      );

    const manualVerification =
      extractField(
        completeMessage,
        [
          /^\s*MANUAL VERIFICATION\s+(\d+)$/im,
          /^\s*Manual verification:\s*(\d+)$/im,
        ]
      );

    const reportFilename =
      extractField(
        completeMessage,
        [
          /^\s*REPORT GENERATED\s+(.+)$/im,
          /^\s*Report generated:\s*(.+)$/im,
          /^\s*Report saved as:\s*(.+)$/im,
        ]
      );

    const organized: string[] = [
      "SCAN COMPLETE",
    ];

    if (checker) {
      organized.push(
        `Checker: ${checker}`
      );
    }

    if (page) {
      organized.push(
        `Page: ${page}`
      );
    }

    if (checked) {
      organized.push(
        `CHECKED ${checked}`
      );
    }

    /*
     * Always show Manual Verification in the live
     * checker. If the checker did not explicitly
     * provide a value, the UI starts at 0.
     */
    organized.push(
      `MANUAL VERIFICATION ${
        manualVerification || "0"
      }`
    );

    if (broken) {
      organized.push(
        `BROKEN ${broken}`
      );
    }

    if (reportFilename) {
      organized.push(
        `Report generated: ${reportFilename}`
      );
    }

    return organized;
  }

  async function handleCheck() {
    if (!url.trim()) {
      alert("Enter a URL first.");
      return;
    }

    setChecking(true);
    setComplete(false);

    setLiveLines([]);
    setFinalSummary([]);

    setCheckedCount(null);
    setBrokenCount(null);

    /*
     * Start Manual Verification at zero.
     * If the checker reports another value,
     * parseSummary() updates it.
     */
    setManualVerificationCount(0);

    setReportId(null);
    setUltimateReports({});
    setUltimateSummary({
      LINK: { checked: 0, manual: 0, defects: 0 },
      IMAGE: { checked: 0, manual: 0, defects: 0 },
      VIDEO: { checked: 0, manual: 0, defects: 0 },
    });

    try {
      const endpoint =
        activeTab === "ULTIMATE"
          ? "/api/check-ultimate"
          : activeTab === "IMAGE"
            ? "/api/check-image"
            : activeTab === "VIDEO"
              ? "/api/check-video"
              : "/api/check-link";

      const response = await fetch(
        `${endpoint}?url=${encodeURIComponent(
          url.trim()
        )}`
      );

      if (
        !response.ok ||
        !response.body
      ) {
        throw new Error(
          "Unable to start checker."
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let buffer = "";

      const allMessages: string[] = [];

      /*
       * Keep the report ID locally as soon as
       * the report-ready event arrives.
       *
       * This avoids relying on React state being
       * updated before the complete event arrives.
       */
      let currentReportId: string | null = null;

      while (true) {
        const {
          value,
          done,
        } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(
          value,
          {
            stream: true,
          }
        );

        const events =
          buffer.split("\n\n");

        buffer =
          events.pop() || "";

        for (
          const event of events
        ) {
          if (
            !event.startsWith(
              "data: "
            )
          ) {
            continue;
          }

          try {
            const data =
              JSON.parse(
                event.slice(6)
              );

            const message =
              typeof data.message ===
              "string"
                ? data.message
                : "";

            if (!message) {
              continue;
            }

            /*
             * Keep every checker message privately
             * for final parsing.
             */
            allMessages.push(
              message
            );

            /*
             * Parse actual checker values.
             */
            parseSummary(
              message
            );

            /*
             * Capture report ID immediately.
             */
            if (
              data.type ===
                "report-ready" &&
              typeof data.reportId ===
                "string"
            ) {
              if (
                activeTab === "ULTIMATE" &&
                typeof data.category === "string" &&
                ["LINK", "IMAGE", "VIDEO"].includes(data.category)
              ) {
                setUltimateReports((previous) => ({
                  ...previous,
                  [data.category as "LINK" | "IMAGE" | "VIDEO"]:
                    data.reportId,
                }));
              } else {
                currentReportId =
                  data.reportId;

                setReportId(
                  data.reportId
                );
              }
            }

            /*
             * During scanning, only show the newest
             * two live messages.
             */
            if (
              data.type !==
              "complete"
            ) {
              addLiveLine(
                message
              );
            }

            /*
             * When complete, replace the live stream
             * with the organized traffic-light console.
             */
            if (
              data.type ===
              "complete"
            ) {
              const summary =
                buildFinalSummary(
                  allMessages
                );

              setFinalSummary(
                summary
              );

              /*
               * Make sure the report ID captured from
               * report-ready is committed to state before
               * the Download button becomes enabled.
               */
              if (
                activeTab !== "ULTIMATE" &&
                currentReportId
              ) {
                setReportId(
                  currentReportId
                );
              }

              setComplete(
                true
              );

              const lastNumber = (patterns: RegExp[]) => {
                let value = 0;
                for (const message of allMessages) {
                  for (const pattern of patterns) {
                    const match = message.match(pattern);
                    if (match) value = Number(match[1]);
                  }
                }
                return value;
              };

              if (activeTab === "ULTIMATE") {
                const categories = {
                  LINK: { checked: 0, manual: 0, defects: 0 },
                  IMAGE: { checked: 0, manual: 0, defects: 0 },
                  VIDEO: { checked: 0, manual: 0, defects: 0 },
                };

                for (const message of allMessages) {
                  const match = message.match(
                    /^ULTIMATE\\s+(LINK|IMAGE|VIDEO)\\s+SUMMARY:\\s+CHECKED\\s+(\\d+)\\s+\\|\\s+MANUAL\\s+(\\d+)\\s+\\|\\s+DEFECTS\\s+(\\d+)$/im
                  );
                  if (match) {
                    const category = match[1] as "LINK" | "IMAGE" | "VIDEO";
                    categories[category] = {
                      checked: Number(match[2]),
                      manual: Number(match[3]),
                      defects: Number(match[4]),
                    };
                  }
                }

                void fetch("/api/account", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    system: "checker",
                    category: "ULTIMATE",
                    outcome: "success",
                    summary: {
                      checked: categories.LINK.checked + categories.IMAGE.checked + categories.VIDEO.checked,
                      manual: categories.LINK.manual + categories.IMAGE.manual + categories.VIDEO.manual,
                      defects: categories.LINK.defects + categories.IMAGE.defects + categories.VIDEO.defects,
                    },
                  }),
                }).catch(() => {});
              } else {
                void fetch("/api/account", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    system: "checker",
                    category: activeTab,
                    outcome: "success",
                    summary: {
                      checked: lastNumber([/^\\s*CHECKED\\s+(\\d+)/im, /^\\s*Visible links:\\s*(\\d+)/im, /^\\s*Visible images:\\s*(\\d+)/im, /^\\s*Visible videos:\\s*(\\d+)/im]),
                      manual: lastNumber([/^\\s*MANUAL VERIFICATION\\s+(\\d+)/im, /^\\s*Manual verification:\\s*(\\d+)/im]),
                      defects: lastNumber([/^\\s*BROKEN\\s+(\\d+)/im, /^\\s*Confirmed broken videos:\\s*(\\d+)/im, /^\\s*Confirmed broken images:\\s*(\\d+)/im, /^\\s*Confirmed broken:\\s*(\\d+)/im]),
                    },
                  }),
                }).catch(() => {});
              }

              setLiveLines(
                []
              );
            }
          } catch {
            // Ignore malformed stream events.
          }
        }
      }
    } catch (error) {
      setLiveLines([
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      ]);
    } finally {
      setChecking(false);
    }
  }

  /*
   * Open the exact TXT report inside the Bug Checker.
   */
  function handleViewReport() {
    if (activeTab === "ULTIMATE") {
      const params = new URLSearchParams();

      for (const category of ["LINK", "IMAGE", "VIDEO"] as const) {
        const id = ultimateReports[category];

        if (id) {
          params.set(category.toLowerCase(), id);
        }
      }

      if (!params.toString()) {
        return;
      }

      window.location.href =
        `/report/ultimate?${params.toString()}`;
      return;
    }

    if (!reportId) {
      return;
    }

    window.location.href =
      `/report/${reportId}`;
  }

  /*
   * Download the exact TXT report captured
   * by the backend. Ultimate reports are
   * downloaded individually from the Ultimate Viewer.
   */
  function handleDownloadReport() {
    if (activeTab === "ULTIMATE") {
      handleViewReport();
      return;
    }

    if (!reportId) {
      return;
    }

    window.location.href =
      `/api/report/${reportId}`;
  }

  /*
   * Color the live scanning messages.
   */
  function getLineClass(
    message: string
  ) {
    if (
      message.includes(
        "MANUAL VERIFICATION"
      )
    ) {
      return "text-yellow-400";
    }

    if (
      message.includes("BROKEN") ||
      message.includes("404")
    ) {
      return "text-red-400";
    }

    if (
      /^200\s/.test(message)
    ) {
      return "text-green-400";
    }

    if (
      message.includes(
        "Checking:"
      )
    ) {
      return "text-green-300";
    }

    return "text-green-600";
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#020805] text-white">
      {/* Background grid / tech atmosphere */}
      <div className="pointer-events-none fixed inset-0 opacity-30">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,255,80,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,80,0.08) 1px, transparent 1px)",
            backgroundSize:
              "42px 42px",
          }}
        />
      </div>

      <div className="pointer-events-none fixed left-0 top-0 h-full w-24 border-r border-green-500/20" />

      <div className="pointer-events-none fixed right-0 top-0 h-full w-24 border-l border-green-500/20" />

      <div className="relative mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
        {/* Small tech labels */}
        <div className="absolute left-8 top-12 hidden text-label font-semibold leading-5 tracking-[0.2em] text-green-500/60 sm:block">
          WEBSITES
          <br />
          PERFORMANCE
          <br />
          ACCESSIBILITY
          <br />
          BETTER WEB
          <br />
          <span className="text-green-400">
            ━━━━
          </span>
        </div>

        <div className="absolute right-8 top-12 hidden text-right text-label font-semibold leading-5 tracking-[0.2em] text-green-500/60 sm:block">
          SCAN
          <br />
          DETECT
          <br />
          REPORT
          <br />
          FIX
          <br />
          <span className="text-green-400">
            ━
          </span>
        </div>

        {/* Header */}
        <header className="mx-auto max-w-4xl text-center">
          <img
            src="/bug-checker-logo.png"
            alt="v1124 Bug Checker"
            className="mx-auto w-full max-w-sm object-contain"
          />

          <p className="mt-5 text-body font-semibold uppercase tracking-[0.22em] text-green-100/70">
            Check your website for broken links, images, and videos
          </p>

          <p className="mt-4 text-body font-black tracking-[0.18em] text-green-400">
            FIND ISSUES &nbsp;|&nbsp; IMPROVE QUALITY &nbsp;|&nbsp; AVOID LOST
            VISITORS
          </p>
        </header>

        <CheckerManagement active="checker" />

        {/* Main checker */}
        <section className="mx-auto mt-14 max-w-4xl">
          {/* Tabs */}
          <div className="rounded-[28px] border border-green-500/50 bg-black/70 p-3 shadow-[0_0_35px_rgba(0,255,80,0.12)]">
            <div className="rounded-[20px] border border-green-400/70 p-2">
              <div className="grid grid-cols-3 gap-2">
                {(["LINK", "IMAGE", "VIDEO"] as CheckerType[]).map(
                  (tab) => {
                  const selected =
                    activeTab ===
                    tab;

                  return (
                    <button
                      key={tab}
                      onClick={() =>
                        setActiveTab(
                          tab
                        )
                      }
                      disabled={
                        checking
                      }
                      className={`rounded-xl px-3 py-4 text-section font-black tracking-[0.18em] transition-all ${
                        selected
                          ? "bg-gradient-to-r from-green-400 to-emerald-300 text-black shadow-[0_0_30px_rgba(0,255,80,0.45)]"
                          : "text-green-100/80 hover:bg-green-500/10 hover:text-green-300"
                      } ${
                        checking
                          ? "cursor-not-allowed opacity-60"
                          : ""
                      }`}
                    >
                      <span className="mr-2 text-lg">
                        {
                          checkerInfo[
                            tab
                          ].icon
                        }
                      </span>

                      {tab}
                    </button>
                  );
                  }
                )}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("ULTIMATE")}
                disabled={checking}
                className={`mt-2 w-full rounded-xl px-3 py-4 text-section font-black tracking-[0.18em] transition-all ${
                  activeTab === "ULTIMATE"
                    ? "bg-gradient-to-r from-green-400 to-emerald-300 text-black shadow-[0_0_30px_rgba(0,255,80,0.45)]"
                    : "border border-green-400/50 text-green-100/80 hover:bg-green-500/10 hover:text-green-300"
                } ${checking ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <span className="mr-2 text-lg">⚡</span>
                ULTIMATE
              </button>
            </div>

            {/* URL section */}
            <div className="mt-4 rounded-[22px] border border-green-500/50 bg-[#031009]/90 p-6 shadow-[inset_0_0_30px_rgba(0,255,80,0.06)] sm:p-8">
              <label
                htmlFor="website"
                className="mb-3 block text-section font-bold tracking-wide text-green-300"
              >
                URL
              </label>

              <div className="flex overflow-hidden rounded-2xl border border-green-400/80 bg-black shadow-[0_0_25px_rgba(0,255,80,0.12)]">
                <div className="flex w-16 items-center justify-center border-r border-green-500/40 text-2xl text-green-400">
                  {
                    current.icon
                  }
                </div>

                <input
                  id="website"
                  type="url"
                  value={url}
                  onChange={(e) =>
                    setUrl(
                      e.target.value
                    )
                  }
                  placeholder="https://example.com"
                  disabled={
                    checking
                  }
                  className="min-w-0 flex-1 bg-transparent px-5 py-5 text-primary text-white outline-none placeholder:text-green-100/30 disabled:opacity-60"
                />
              </div>

              <button
                onClick={
                  handleCheck
                }
                disabled={
                  checking
                }
                className="mt-5 flex w-full items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-green-400 to-emerald-300 px-6 py-5 text-display font-black tracking-[0.12em] text-black shadow-[0_0_35px_rgba(0,255,80,0.35)] transition hover:scale-[1.01] hover:shadow-[0_0_50px_rgba(0,255,80,0.55)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-2xl">
                  {
                    checking
                      ? "◌"
                      : "◉"
                  }
                </span>

                {checking
                  ? "CHECKING..."
                  : current.button}

                <span className="text-3xl">
                  →
                </span>
              </button>
            </div>
          </div>

          {/* LIVE CONSOLE */}
          {consoleLinesVisible(
            liveLines,
            finalSummary,
            checking,
            complete
          ) && (
            <div className="mt-8 overflow-hidden rounded-[28px] border border-green-500/50 bg-black/80 shadow-[0_0_35px_rgba(0,255,80,0.1)]">
              <div className="flex items-center justify-between border-b border-green-500/30 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      checking
                        ? "animate-pulse bg-green-400 shadow-[0_0_12px_rgba(0,255,80,0.9)]"
                        : "bg-green-500"
                    }`}
                  />

                  <h2 className="text-section font-black tracking-[0.2em] text-green-300">
                    LIVE{" "}
                    {
                      activeTab
                    }{" "}
                    CHECK
                  </h2>
                </div>

                <span className="text-label font-bold tracking-[0.18em] text-green-500/70">
                  {checking
                    ? "SCANNING..."
                    : complete
                      ? "COMPLETE"
                      : ""}
                </span>
              </div>

              <div
                className={`overflow-hidden px-5 py-5 font-mono text-body leading-5 ${
                  complete
                    ? "min-h-[250px]"
                    : "h-[150px]"
                }`}
              >
                {!complete &&
                  liveLines.map(
                    (
                      message,
                      index
                    ) => (
                      <div
                        key={`${index}-${message}`}
                        className={`${getLineClass(
                          message
                        )} break-words`}
                      >
                        {
                          message
                        }
                      </div>
                    )
                  )}

                {checking && (
                  <div className="mt-1 text-green-300">
                    █ SCANNING...
                  </div>
                )}

                {complete && (
                  <div className="space-y-3">
                    <div className="mb-4 text-section font-black tracking-[0.15em] text-green-300">
                      ╔════════════════════════════════════╗
                      <br />
                      ║ &nbsp; SCAN COMPLETE
                      <br />
                      ╚════════════════════════════════════╝
                    </div>

                    {finalSummary.map((message, index) => {
                      if (message === "SCAN COMPLETE") {
                        return null;
                      }

                      if (
                        activeTab === "ULTIMATE" &&
                        /^(LINK|IMAGE|VIDEO) CHECKED \d+ \| MANUAL \d+ \| DEFECTS \d+$/.test(
                          message
                        )
                      ) {
                        return null;
                      }

                      if (
                        activeTab !== "ULTIMATE" &&
                        (message.startsWith("CHECKED ") ||
                          message.startsWith("MANUAL VERIFICATION ") ||
                          message.startsWith("BROKEN "))
                      ) {
                        return null;
                      }

                      if (message.startsWith("Checker:")) {
                        return (
                          <div
                            key={`meta-${index}-${message}`}
                            className="text-green-300"
                          >
                            <span className="text-green-500">
                              CHECKER
                            </span>
                            {"  "}
                            {message
                              .replace("Checker:", "")
                              .trim()}
                          </div>
                        );
                      }

                      if (message.startsWith("Page:")) {
                        return (
                          <div
                            key={`meta-${index}-${message}`}
                            className="break-all text-green-300"
                          >
                            <span className="text-green-500">
                              PAGE
                            </span>
                            {"     "}
                            {message
                              .replace("Page:", "")
                              .trim()}
                          </div>
                        );
                      }

                      return null;
                    })}

                    {activeTab === "ULTIMATE" ? (
                      <>
                        <div className="space-y-2">
                          {(["LINK", "IMAGE", "VIDEO"] as const).map(
                            (category) => {
                              const summary =
                                ultimateSummary[category];

                              return (
                                <div
                                  key={category}
                                  className="rounded-xl border border-green-500/20 bg-green-500/5 px-3 py-2.5"
                                >
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="font-black tracking-[0.16em] text-green-300">
                                      {category}
                                    </span>

                                    <span className="text-label font-bold tracking-[0.14em] text-green-500/70">
                                      ULTIMATE SCAN
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2">
                                    <div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-black/40 px-2.5 py-1.5">
                                      <span className="flex items-center gap-1.5 text-label font-black tracking-[0.08em] text-green-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(0,255,80,0.9)]" />
                                        CHECKED
                                      </span>
                                      <span className="font-black text-white">
                                        {summary.checked}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-yellow-500/20 bg-black/40 px-2.5 py-1.5">
                                      <span className="flex items-center gap-1.5 text-label font-black tracking-[0.08em] text-yellow-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(255,210,0,0.75)]" />
                                        MANUAL
                                      </span>
                                      <span className="font-black text-white">
                                        {summary.manual}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-black/40 px-2.5 py-1.5">
                                      <span className="flex items-center gap-1.5 text-label font-black tracking-[0.08em] text-red-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(255,60,80,0.75)]" />
                                        DEFECTS
                                      </span>
                                      <span className="font-black text-white">
                                        {summary.defects}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>

                        <div className="border-t border-green-500/20 pt-3">
                          <div className="text-section font-black tracking-[0.12em] text-red-300">
                            TOTAL CONFIRMED DEFECTS{" "}
                            {ultimateSummary.LINK.defects +
                              ultimateSummary.IMAGE.defects +
                              ultimateSummary.VIDEO.defects}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {(() => {
                          const checked =
                            finalSummary
                              .find((message) =>
                                message.startsWith("CHECKED ")
                              )
                              ?.match(/^CHECKED\s+(\d+)$/)?.[1] ||
                            "0";

                          const manual =
                            finalSummary
                              .find((message) =>
                                message.startsWith(
                                  "MANUAL VERIFICATION "
                                )
                              )
                              ?.match(
                                /^MANUAL VERIFICATION\s+(\d+)$/
                              )?.[1] || "0";

                          const broken =
                            finalSummary
                              .find((message) =>
                                message.startsWith("BROKEN ")
                              )
                              ?.match(/^BROKEN\s+(\d+)$/)?.[1] ||
                            "0";

                          return (
                            <>
                              <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-3 py-2.5">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="font-black tracking-[0.16em] text-green-300">
                                    {activeTab}
                                  </span>

                                  <span className="text-label font-bold tracking-[0.14em] text-green-500/70">
                                    v1124
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                  <div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-black/40 px-2.5 py-1.5">
                                    <span className="flex items-center gap-1.5 text-label font-black tracking-[0.08em] text-green-400">
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(0,255,80,0.9)]" />
                                      CHECKED
                                    </span>
                                    <span className="font-black text-white">
                                      {checked}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between rounded-lg border border-yellow-500/20 bg-black/40 px-2.5 py-1.5">
                                    <span className="flex items-center gap-1.5 text-label font-black tracking-[0.08em] text-yellow-400">
                                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(255,210,0,0.75)]" />
                                      MANUAL
                                    </span>
                                    <span className="font-black text-white">
                                      {manual}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-black/40 px-2.5 py-1.5">
                                    <span className="flex items-center gap-1.5 text-label font-black tracking-[0.08em] text-red-400">
                                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(255,60,80,0.75)]" />
                                      DEFECTS
                                    </span>
                                    <span className="font-black text-white">
                                      {broken}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="border-t border-green-500/20 pt-3">
                                {finalSummary.map(
                                  (message, index) => {
                                    if (
                                      message.startsWith(
                                        "Report generated:"
                                      )
                                    ) {
                                      return (
                                        <div
                                          key={`report-${index}-${message}`}
                                          className="text-green-300"
                                        >
                                          <span className="text-green-500">
                                            REPORT
                                          </span>
                                          {"  "}
                                          {message
                                            .replace(
                                              "Report generated:",
                                              ""
                                            )
                                            .trim()}
                                        </div>
                                      );
                                    }

                                    return null;
                                  }
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RESULTS */}
          {complete && (
          <div className="mt-8 rounded-[28px] border border-green-500/50 bg-black/70 p-6 shadow-[0_0_35px_rgba(0,255,80,0.1)] sm:p-8">
            <div className="mb-6 flex items-center gap-4">
              <div className="text-3xl text-green-400">
                ☷
              </div>

              <h2 className="text-display font-black tracking-[0.08em] text-green-300">
                RESULTS
              </h2>
            </div>

            {/* Jackpot */}
            {complete &&
              brokenCount !== null &&
              brokenCount > 0 && (
                <div className="mb-6 rounded-2xl border border-green-400/60 bg-green-400/5 px-5 py-4 text-center shadow-[0_0_30px_rgba(0,255,80,0.12)]">
                  <div className="text-2xl font-black text-green-300">
                    💥 JACKPOT! 💥
                  </div>

                  <div className="mt-1 text-label font-bold tracking-[0.2em] text-green-500">
                    CONFIRMED DEFECTS FOUND
                  </div>
                </div>
              )}

            {activeTab === "ULTIMATE" ? (
              <div className="grid gap-5 lg:grid-cols-3">
                {(
                  [
                    ["LINK", "↗"],
                    ["IMAGE", "▧"],
                    ["VIDEO", "▶"],
                  ] as const
                ).map(([category, icon]) => {
                  const summary =
                    ultimateSummary[category];

                  return (
                    <div
                      key={category}
                      className="rounded-2xl border border-green-500/50 bg-[#031009] p-5 shadow-[inset_0_0_25px_rgba(0,255,80,0.05)]"
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl text-green-400">
                            {icon}
                          </span>

                          <div>
                            <p className="text-lg font-black tracking-[0.16em] text-green-300">
                              {category}
                            </p>

                            <p className="text-label font-bold tracking-[0.16em] text-green-500/60">
                              ULTIMATE SCAN
                            </p>
                          </div>
                        </div>

                        <span className="rounded-full border border-green-500/30 px-2 py-1 text-label font-bold tracking-[0.12em] text-green-500/70">
                          v1124
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-green-500/30 bg-black/50 px-2 py-4 text-center">
                          <div className="text-label font-black tracking-[0.12em] text-green-500">
                            CHECKED
                          </div>
                          <div className="mt-2 text-3xl font-black text-white">
                            {summary.checked}
                          </div>
                        </div>

                        <div className="rounded-xl border border-yellow-500/30 bg-black/50 px-2 py-4 text-center">
                          <div className="text-label font-black tracking-[0.08em] text-yellow-500">
                            MANUAL
                          </div>
                          <div className="mt-2 text-3xl font-black text-white">
                            {summary.manual}
                          </div>
                        </div>

                        <div className="rounded-xl border border-red-500/30 bg-black/50 px-2 py-4 text-center">
                          <div className="text-label font-black tracking-[0.12em] text-red-400">
                            DEFECTS
                          </div>
                          <div className="mt-2 text-3xl font-black text-white">
                            {summary.defects}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-green-500/50 bg-[#031009] p-6 shadow-[inset_0_0_25px_rgba(0,255,80,0.05)]">
                  <div className="mb-4 text-3xl text-green-400">
                    {current.icon}
                  </div>
                  <p className="text-section font-medium text-green-100/60">
                    {current.checked}
                  </p>
                  <p className="mt-2 text-5xl font-black text-white">
                    {checkedCount !== null ? checkedCount : "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-500/50 bg-[#031009] p-6 shadow-[inset_0_0_25px_rgba(0,255,80,0.05)]">
                  <div className="mb-4 text-3xl text-green-400">
                    ⚡
                  </div>
                  <p className="text-section font-medium text-green-100/60">
                    {current.broken}
                  </p>
                  <p className="mt-2 text-5xl font-black text-white">
                    {brokenCount !== null ? brokenCount : "—"}
                  </p>
                </div>
              </div>
            )}

            <div className={`mt-6 grid gap-3 ${activeTab === "ULTIMATE" ? "grid-cols-1" : "sm:grid-cols-2"}`}>
              <button
                onClick={
                  handleViewReport
                }
                disabled={
                  !complete ||
                  (activeTab === "ULTIMATE"
                    ? Object.keys(ultimateReports).length === 0
                    : !reportId)
                }
                className="w-full rounded-2xl bg-gradient-to-r from-green-400 to-emerald-300 px-6 py-4 text-section font-black tracking-[0.12em] text-black shadow-[0_0_25px_rgba(0,255,80,0.22)] transition hover:shadow-[0_0_35px_rgba(0,255,80,0.38)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                ◉ &nbsp; {activeTab === "ULTIMATE"
                  ? "VIEW ULTIMATE DETAILED REPORT"
                  : "VIEW DETAILED REPORT"}
              </button>

              {activeTab !== "ULTIMATE" && (
                <button
                  onClick={
                    handleDownloadReport
                  }
                  disabled={
                    !reportId ||
                    !complete
                  }
                  className="w-full rounded-2xl border border-green-400/60 bg-green-400/10 px-6 py-4 text-section font-black tracking-[0.12em] text-green-300 transition hover:bg-green-400/20 hover:text-green-200 disabled:cursor-not-allowed disabled:border-green-100/30 disabled:bg-black/40 disabled:text-green-100/30"
                >
                  ↓ &nbsp; DOWNLOAD DETAILED REPORT
                </button>
              )}
            </div>
          </div>
          )}
        </section>

        {/* Feature strip */}
        <section className="mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-8 border-t border-green-500/20 pt-10 sm:grid-cols-4">
          {[
            [
              "ϟ",
              "FAST",
              "Real Results",
            ],
            [
              "♢",
              "RELIABLE",
              "Find Issues Early",
            ],
            [
              "⚙",
              "EASY TO USE",
              "Just Enter a URL",
            ],
            [
              "▥",
              "BETTER WEBSITES",
              "Higher Quality",
            ],
          ].map(
            ([
              icon,
              title,
              text,
            ]) => (
              <div
                key={title}
                className="text-center"
              >
                <div className="text-3xl font-bold text-green-400 [text-shadow:0_0_15px_rgba(0,255,80,0.5)]">
                  {
                    icon
                  }
                </div>

                <p className="mt-3 text-section font-black tracking-[0.12em] text-white">
                  {
                    title
                  }
                </p>

                <p className="mt-1 text-body text-green-100/45">
                  {
                    text
                  }
                </p>
              </div>
            )
          )}
        </section>

        {/* BUG WORKSTATION */}
        <section className="mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-[28px] border border-cyan-400/50 bg-black/80 p-3 shadow-[0_0_40px_rgba(0,220,255,0.12)]">
            <div className="rounded-[22px] border border-cyan-400/30 bg-[#020a0d] p-7 text-center shadow-[inset_0_0_35px_rgba(0,220,255,0.05)] sm:p-10">
              <img
                src="/bug-workstation-logo.png"
                alt="v1124 Bug WorkStation"
                className="mx-auto h-auto w-full max-w-[18rem] object-contain"
              />

              <p className="mx-auto mt-3 max-w-2xl text-body leading-6 tracking-[0.12em] text-cyan-100/60">
                A SPECIALIZED WORKSPACE FOR AUTOMATED WEBSITE INVESTIGATION
              </p>

              <p className="mx-auto mt-3 max-w-3xl text-label font-black tracking-[0.16em] text-cyan-400">
                INVESTIGATION BROWSER &nbsp;|&nbsp; <span className="text-green-400">ULTIMATE CHECKER</span> &nbsp;|&nbsp; SIGNALS &nbsp;|&nbsp; EXTRACTORS &nbsp;|&nbsp; EVIDENCES &nbsp;|&nbsp; SOURCE HIERARCHY &nbsp;|&nbsp; PROJECT INSTRUCTION
              </p>

              <button
                type="button"
                onClick={() => {
                  window.location.href = "/workstation";
                }}
                className="mt-7 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-300 px-6 py-5 text-section font-black tracking-[0.16em] text-black shadow-[0_0_35px_rgba(0,220,255,0.28)] transition hover:scale-[1.01] hover:shadow-[0_0_50px_rgba(0,220,255,0.45)] active:scale-[0.99]"
              >
                BUG WORKSTATION
              </button>
            </div>
          </div>
        </section>

        {/* Footer tech line */}
        <footer className="relative mt-16 border-t border-green-500/30 pt-8">
          <div className="h-px bg-gradient-to-r from-green-400 via-green-500/30 to-transparent" />

          <div className="flex items-center justify-between pt-6 text-label font-bold tracking-[0.2em] text-green-500/60">
            <span>
              v1124 BUG CHECKER
            </span>

            <span>
              SCAN SMARTER. BUILD BETTER.
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}

/*
 * Determines whether the console box should exist.
 */
function consoleLinesVisible(
  liveLines: string[],
  finalSummary: string[],
  checking: boolean,
  complete: boolean
) {
  return (
    checking ||
    complete ||
    liveLines.length > 0 ||
    finalSummary.length > 0
  );
}
export default function Home(){ return <AuthGate returnTo="/checker"><CheckerPage /></AuthGate>; }