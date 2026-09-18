"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Category = "LINK" | "IMAGE" | "VIDEO";
type ReportData = { filename: string; content: string };

const categories: Category[] = ["LINK", "IMAGE", "VIDEO"];

function getCheckerName(content: string) {
  const match = content.match(/^Checker:\s*(.+)$/im);
  return match?.[1]?.trim() || "Website Defect Checker v1124";
}

function getPageName(content: string) {
  const match = content.match(/^Page title:\s*(.+)$/im);
  return match?.[1]?.trim() || "";
}

function getMatchPositions(content: string, query: string) {
  if (!query.trim()) return [];
  const positions: number[] = [];
  const source = content.toLowerCase();
  const needle = query.trim().toLowerCase();
  let start = 0;
  while (start < source.length) {
    const index = source.indexOf(needle, start);
    if (index === -1) break;
    positions.push(index);
    start = index + Math.max(needle.length, 1);
  }
  return positions;
}

function UltimateReportPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const ids = useMemo(() => ({
    LINK: searchParams.get("link"),
    IMAGE: searchParams.get("image"),
    VIDEO: searchParams.get("video"),
  }), [searchParams]);

  const [reports, setReports] = useState<Partial<Record<Category, ReportData>>>({});
  const [activeCategory, setActiveCategory] = useState<Category>("LINK");
  const [search, setSearch] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setError("");

      const loaded: Partial<Record<Category, ReportData>> = {};

      await Promise.all(
        categories.map(async (category) => {
          const reportId = ids[category];
          if (!reportId) return;

          try {
            const response = await fetch(`/api/ultimate-report?id=${encodeURIComponent(reportId)}`, {
              cache: "no-store",
            });
            const data = await response.json();
            if (response.ok && data.content) {
              loaded[category] = {
                filename: data.filename || `${category.toLowerCase()}.txt`,
                content: data.content,
              };
            }
          } catch {
            // A missing individual report simply makes that tab unavailable.
          }
        })
      );

      if (cancelled) return;

      setReports(loaded);

      const firstAvailable = categories.find((category) => loaded[category]);
      if (firstAvailable) {
        setActiveCategory(firstAvailable);
      } else {
        setError("No Ultimate reports are available.");
      }

      setLoading(false);
    }

    loadReports();
    return () => { cancelled = true; };
  }, [ids]);

  const currentReport = reports[activeCategory];
  const content = currentReport?.content || "";
  const filename = currentReport?.filename || "Loading report...";
  const checker = getCheckerName(content);
  const pageName = getPageName(content);

  const matches = useMemo(
    () => getMatchPositions(content, search),
    [content, search]
  );

  useEffect(() => { setCurrentMatch(0); }, [search, activeCategory]);

  useEffect(() => {
    if (!matches.length) return;
    const node = reportRef.current?.querySelectorAll("mark[data-report-match]")[currentMatch] as HTMLElement | undefined;
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (content) {
      const ratio = matches[currentMatch] / Math.max(content.length, 1);
      if (reportRef.current) reportRef.current.scrollTop = ratio * reportRef.current.scrollHeight;
    }
  }, [currentMatch, matches, content]);

  function moveMatch(direction: 1 | -1) {
    if (!matches.length) return;
    setCurrentMatch((previous) => (previous + direction + matches.length) % matches.length);
  }

  async function handleCopy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function handleDownload() {
    const reportId = ids[activeCategory];
    const report = reports[activeCategory];
    if (!reportId || !report) return;

    try {
      const blob = new Blob([report.content], { type: "text/plain;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = report.filename || `${activeCategory.toLowerCase()}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError("REPORT DOWNLOAD FAILED");
    }
  }

  function renderReport() {
    if (!search.trim()) return content;
    const needle = search.trim();
    const parts = content.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    let matchNumber = -1;
    return parts.map((part, index) => {
      const isMatch = part.toLowerCase() === needle.toLowerCase();
      if (isMatch) {
        matchNumber += 1;
        return (
          <mark
            key={index}
            data-report-match
            className={matchNumber === currentMatch ? "rounded bg-green-300 px-0.5 text-black" : "rounded bg-green-500/30 text-green-100"}
          >{part}</mark>
        );
      }
      return <span key={index}>{part}</span>;
    });
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#020805] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-30">
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,255,80,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,80,0.08) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
      </div>
      <div className="pointer-events-none fixed left-0 top-0 h-full w-24 border-r border-green-500/20" />
      <div className="pointer-events-none fixed right-0 top-0 h-full w-24 border-l border-green-500/20" />

      <div className="relative mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-4 border-b border-green-500/20 pb-5">
          <button onClick={() => router.back()} className="hidden rounded-xl border border-green-400/60 bg-green-400/5 px-4 py-3 text-xs font-black tracking-[0.12em] text-green-300 sm:block">← BACK TO RESULTS</button>
          <img src="/bug-checker-logo.png" alt="v1124 Bug Checker" className="mx-auto w-full max-w-[220px] object-contain sm:mx-0 sm:max-w-[280px]" />
          <button onClick={() => router.push("/")} className="hidden rounded-xl bg-gradient-to-r from-green-400 to-emerald-300 px-5 py-3 text-xs font-black tracking-[0.12em] text-black sm:block">▶ &nbsp; RUN A NEW CHECK</button>
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:hidden">
          <button onClick={() => router.back()} className="rounded-xl border border-green-400/60 bg-green-400/5 px-3 py-3 text-[11px] font-black tracking-[0.08em] text-green-300">← BACK</button>
          <button onClick={() => router.push("/")} className="rounded-xl bg-gradient-to-r from-green-400 to-emerald-300 px-3 py-3 text-[11px] font-black tracking-[0.08em] text-black">▶ NEW CHECK</button>
        </div>

        <section className="rounded-[28px] border border-green-500/60 bg-black/70 p-4 shadow-[0_0_45px_rgba(0,255,80,0.12)] sm:p-7">
          <div className="flex flex-col gap-5 border-b border-green-500/20 pb-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="shrink-0 text-5xl text-green-300">▤</div>
              <div className="min-w-0">
                <h1 className="text-3xl font-black tracking-[0.08em] text-green-300 sm:text-5xl">ULTIMATE DETAILED REPORT</h1>
                <p className="mt-2 break-all font-mono text-sm text-green-400">{filename}</p>
                <p className="mt-2 text-xs text-green-100/55">{checker}{pageName ? ` • ${pageName}` : ""}</p>
              </div>
            </div>
            <button onClick={handleDownload} disabled={loading || !!error || !currentReport} className="w-full shrink-0 rounded-2xl border border-green-400/70 bg-green-400/5 px-5 py-4 text-sm font-black tracking-[0.1em] text-green-300 transition hover:bg-green-400/15 disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto">↓ &nbsp; DOWNLOAD REPORT</button>
          </div>

          <div className="mt-5 rounded-[20px] border border-green-400/70 p-2">
            <div className="grid grid-cols-3 gap-2">
              {categories.map((category) => {
                const available = !!reports[category];
                const selected = activeCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    disabled={!available}
                    onClick={() => available && setActiveCategory(category)}
                    className={`rounded-xl px-3 py-4 text-sm font-black tracking-[0.18em] transition-all ${selected && available ? "bg-gradient-to-r from-green-400 to-emerald-300 text-black shadow-[0_0_30px_rgba(0,255,80,0.45)]" : "text-green-100/80 hover:bg-green-500/10 hover:text-green-300"} ${!available ? "cursor-default" : ""}`}
                  >
                    <span className="mr-2 text-lg">{category === "LINK" ? "↗" : category === "IMAGE" ? "▧" : "▶"}</span>
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row">
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border border-green-400/70 bg-black">
              <div className="flex w-12 shrink-0 items-center justify-center border-r border-green-500/30 text-xl text-green-300">⌕</div>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report (URL, status code, section, keyword...)" className="min-w-0 flex-1 bg-transparent px-4 py-4 text-sm text-white outline-none placeholder:text-green-100/30" />
              {search && <button onClick={() => setSearch("")} className="px-4 text-lg text-green-300 hover:text-white" aria-label="Clear report search">×</button>}
            </div>
            <div className="grid grid-cols-3 gap-2 lg:w-auto">
              <button onClick={() => moveMatch(-1)} disabled={!matches.length} className="rounded-xl border border-green-500/60 bg-green-400/5 px-4 py-3 text-green-300 disabled:opacity-30" aria-label="Previous match">↑</button>
              <button onClick={() => moveMatch(1)} disabled={!matches.length} className="rounded-xl border border-green-500/60 bg-green-400/5 px-4 py-3 text-green-300 disabled:opacity-30" aria-label="Next match">↓</button>
              <div className="flex items-center justify-center rounded-xl border border-green-500/60 bg-black px-3 text-xs font-bold text-green-300">{matches.length ? `${currentMatch + 1} / ${matches.length}` : "0 / 0"}</div>
            </div>
            <button onClick={handleCopy} disabled={loading || !!error || !content} className="rounded-2xl border border-green-400/60 bg-green-400/5 px-5 py-4 text-sm font-black tracking-[0.08em] text-green-300 transition hover:bg-green-400/15 disabled:opacity-40">{copied ? "✓ COPIED" : "▣ COPY REPORT"}</button>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-500/50 bg-red-500/5 p-6 text-sm text-red-300">{error}</div>
          ) : (
            <div ref={reportRef} className="mt-5 h-[60vh] min-h-[420px] overflow-auto rounded-[22px] border border-green-500/50 bg-[#010603] p-5 font-mono text-[11px] leading-5 text-green-100 shadow-[inset_0_0_35px_rgba(0,255,80,0.05)] sm:p-6 sm:text-xs">
              {loading ? <div className="animate-pulse text-green-400">Loading Ultimate reports...</div> : <pre className="whitespace-pre-wrap break-words">{renderReport()}</pre>}
            </div>
          )}

          <div className="mt-5 grid gap-3 border-t border-green-500/20 pt-5 sm:grid-cols-3">
            <button onClick={() => router.back()} className="rounded-2xl border border-green-400/60 bg-green-400/5 px-5 py-4 text-sm font-black tracking-[0.08em] text-green-300">← BACK TO RESULTS</button>
            <button onClick={handleDownload} disabled={loading || !!error || !currentReport} className="rounded-2xl bg-gradient-to-r from-green-400 to-emerald-300 px-5 py-4 text-sm font-black tracking-[0.08em] text-black shadow-[0_0_25px_rgba(0,255,80,0.22)] disabled:cursor-not-allowed disabled:opacity-40">↓ &nbsp; DOWNLOAD REPORT</button>
            <button onClick={() => router.push("/")} className="rounded-2xl bg-gradient-to-r from-green-400 to-emerald-300 px-5 py-4 text-sm font-black tracking-[0.08em] text-black shadow-[0_0_25px_rgba(0,255,80,0.22)]">▶ &nbsp; RUN A NEW CHECK</button>
          </div>
        </section>

        <footer className="relative mt-8 border-t border-green-500/30 pt-6">
          <div className="h-px bg-gradient-to-r from-green-400 via-green-500/30 to-transparent" />
          <div className="flex flex-col gap-3 pt-5 text-[10px] font-bold tracking-[0.16em] text-green-500/60 sm:flex-row sm:items-center sm:justify-between"><span>v1124 BUG CHECKER</span><span>SCAN SMARTER. BUILD BETTER.</span></div>
        </footer>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#020805] text-green-300 p-8">Loading Ultimate report...</main>}>
      <UltimateReportPage />
    </Suspense>
  );
}
