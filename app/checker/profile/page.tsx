"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components_AuthGate";
import CheckerManagement from "@/app/checker/CheckerManagement";
import { normalizeAccountState, type AccountState } from "@/lib/account";

type AuthUser = { username: string; email: string };

function StatIcon({ type, className = "text-primary" }: { type: "overview" | "link" | "image" | "video" | "ultimate"; className?: string }) {
  const icon = { overview: "◉", link: "↗", image: "▧", video: "▶", ultimate: "⚡" }[type];
  return <span className={className} aria-hidden="true">{icon}</span>;
}

function CheckerProfileContent() {
  const [account, setAccount] = useState<AccountState>(() => normalizeAccountState(null));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [checkerStats, setCheckerStats] = useState({
    LINK: { runs: 0, checked: 0, defects: 0 },
    IMAGE: { runs: 0, checked: 0, defects: 0 },
    VIDEO: { runs: 0, checked: 0, defects: 0 },
    ULTIMATE: { runs: 0, checked: 0, defects: 0 },
  });
  const [statsTab, setStatsTab] = useState<"overview" | "link" | "image" | "video" | "ultimate">("overview");

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" }).then(async r => r.ok ? r.json() : null).then(data => {
      if (data?.account) setAccount(normalizeAccountState(data.account));
      if (data?.checkerStats) {
        setCheckerStats(() => ({
          LINK: { runs: Number(data.checkerStats.LINK?.runs || 0), checked: Number(data.checkerStats.LINK?.checked || 0), defects: Number(data.checkerStats.LINK?.defects || 0) },
          IMAGE: { runs: Number(data.checkerStats.IMAGE?.runs || 0), checked: Number(data.checkerStats.IMAGE?.checked || 0), defects: Number(data.checkerStats.IMAGE?.defects || 0) },
          VIDEO: { runs: Number(data.checkerStats.VIDEO?.runs || 0), checked: Number(data.checkerStats.VIDEO?.checked || 0), defects: Number(data.checkerStats.VIDEO?.defects || 0) },
          ULTIMATE: { runs: Number(data.checkerStats.ULTIMATE?.runs || 0), checked: Number(data.checkerStats.ULTIMATE?.checked || 0), defects: Number(data.checkerStats.ULTIMATE?.defects || 0) },
        }));
      }
      if (data?.authUser) setAuthUser({ username: data.authUser.username, email: data.authUser.email });
    }).catch(() => {});
    fetch("/api/auth", { cache: "no-store" }).then(async r => r.ok ? r.json() : null).then(data => {
      if (data?.user) setAuthUser({ username: data.user.username, email: data.user.email });
    }).catch(() => {});
  }, []);

  const username = authUser?.username || "—";
  const accountAge = (() => {
    const created = new Date(account.profile.createdAt).getTime();
    if (Number.isNaN(created)) return "Unknown";
    const days = Math.max(0, Math.floor((Date.now() - created) / 86400000));
    return days === 0 ? "Less than a day" : days === 1 ? "1 day" : `${days} days`;
  })();
  const totalCheckerRuns = checkerStats.LINK.runs + checkerStats.IMAGE.runs + checkerStats.VIDEO.runs + checkerStats.ULTIMATE.runs;
  const successfulRuns = 0;
  const failedRuns = 0;
  const totalChecks = checkerStats.LINK.checked + checkerStats.IMAGE.checked + checkerStats.VIDEO.checked + checkerStats.ULTIMATE.checked;
  const totalDefects = checkerStats.LINK.defects + checkerStats.IMAGE.defects + checkerStats.VIDEO.defects + checkerStats.ULTIMATE.defects;

  return (
    <main className="min-h-screen overflow-hidden bg-[#020805] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-30"><div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,255,80,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,80,0.08) 1px, transparent 1px)", backgroundSize: "42px 42px" }} /></div>
      <div className="pointer-events-none fixed left-0 top-0 h-full w-24 border-r border-green-500/40" />
      <div className="pointer-events-none fixed right-0 top-0 h-full w-24 border-l border-green-500/40" />
      <div className="relative mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
        <div className="absolute left-8 top-12 hidden text-label font-semibold leading-5 tracking-[0.2em] text-green-500/60 sm:block">WEBSITES<br/>PERFORMANCE<br/>ACCESSIBILITY<br/>BETTER WEB<br/><span className="text-green-400">━━━━</span></div>
        <div className="absolute right-8 top-12 hidden text-right text-label font-semibold leading-5 tracking-[0.2em] text-green-500/60 sm:block">SCAN<br/>DETECT<br/>REPORT<br/>FIX<br/><span className="text-green-400">━</span></div>

        <header className="mx-auto max-w-4xl text-center">
          <img src="/bug-checker-logo.png" alt="v1124 Bug Checker" className="mx-auto w-full max-w-[12rem] object-contain" />
          <p className="mt-5 text-body font-semibold uppercase tracking-[0.22em] text-green-100/70">Check your website for broken links, images, and videos.</p>
          <p className="mt-4 text-body font-bold tracking-[0.18em] text-green-400">FIND ISSUES &nbsp;|&nbsp; IMPROVE QUALITY &nbsp;|&nbsp; AVOID LOST VISITORS</p>
        </header>

        <CheckerManagement active="profile" />

        <section className="mx-auto mt-6 max-w-5xl rounded-[28px] border border-green-500/40 bg-black/70 p-5 shadow-[0_0_35px_rgba(0,255,80,0.12)] sm:p-7">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" style={{ gridTemplateColumns: "minmax(0,1fr) 220px minmax(0,1fr)" }}>
            <div className="rounded-2xl border border-green-500/40 bg-green-500/[0.07] p-5 shadow-[0_0_25px_rgba(0,255,80,0.08)]">
              <p className="text-body font-black tracking-[0.16em] text-green-400/60">USERNAME</p>
              <p className="mt-2 text-primary font-black tracking-wide text-green-50">{username}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/[0.06] px-2 py-1.5 text-green-400 shadow-[0_0_18px_rgba(0,255,80,.05)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 shrink-0 text-green-400"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M7 2.8v4M17 2.8v4M3 9h18M8 13h2M14 13h2M8 17h2" /></svg>
                <p className="text-label font-black tracking-[0.12em] text-green-400">ACCOUNT AGE <span className="ml-1 tracking-tight text-white" >{accountAge}</span></p>
              </div>
            </div>
            <div className="h-[190px] w-full rounded-2xl border border-green-500/40 bg-green-500/[0.07] p-4">
              <div className="flex h-[calc(100%-20px)] items-center justify-center">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-green-400/30 bg-black/50 shadow-[0_0_24px_rgba(0,255,80,.08)]">
                  {account.profile.avatar ? <div aria-hidden="true" style={{ width: 94, height: 94, backgroundImage: `url(${account.profile.avatar})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} /> : <img src="/favicon.png" alt="Default profile" className="block h-full w-full object-cover" />}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-green-500/40 bg-green-500/[0.07] p-5 shadow-[0_0_25px_rgba(0,255,80,0.08)]">
              <p className="text-body font-black tracking-[0.16em] text-green-400/60">CHECKER</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_12px_rgba(0,255,80,.85)]" />
                <p className="text-body font-black tracking-tight text-green-50">ACTIVE</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-green-500/40 bg-green-500/[0.07] p-5 shadow-[0_0_25px_rgba(0,255,80,0.08)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-primary font-black tracking-[0.2em] text-green-400">CHECKER STATISTICS</p><p className="mt-1 inline-flex items-center gap-1.5 text-body font-black tracking-tight text-white">{statsTab === "overview" ? <><StatIcon type="overview" className="text-primary" />OVERVIEW</> : <><StatIcon type={statsTab} className="text-body" />{`${statsTab.toUpperCase()} LIFETIME`}</>}</p></div>
              <span className="text-body font-black tracking-[0.12em] text-green-400/35">LIFETIME TOTALS</span>
            </div>

            <div className="mt-4 border-b border-green-500/40 pb-4">
              <div className="grid grid-cols-5 gap-2">
              {([
                ["overview", "OVERVIEW"],
                ["link", "LINK STATISTICS"],
                ["image", "IMAGE STATISTICS"],
                ["video", "VIDEO STATISTICS"],
                ["ultimate", "ULTIMATE STATISTICS"],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setStatsTab(key)} aria-label={label} title={label} className={`inline-flex h-10 w-full items-center justify-center rounded-lg border text-primary font-black transition ${statsTab === key ? "border-green-500/40 bg-green-400/10 text-green-300" : "border-green-500/40 bg-green-500/[0.035] text-green-100/40 hover:bg-green-500/10 hover:text-green-300"}`}>
                  <StatIcon type={key} className="text-primary" />
                </button>
              ))}
              </div>
            </div>

            {statsTab === "overview" ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {([
                    ["TOTAL CHECKER RUNS", totalCheckerRuns],
                    ["SUCCESSFUL RUNS", successfulRuns],
                    ["FAILED RUNS", failedRuns],
                    ["CONFIRMED DEFECTS", totalDefects],
                  ] as Array<[string, number]>).map(([label, value]) => (
                    <div key={label} className="group rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3 transition hover:border-green-400/30 hover:bg-green-400/[0.035]"><div className="flex items-center justify-between gap-2"><p className="text-body font-black tracking-[0.10em] text-green-400">{label}</p><p className="text-primary font-black leading-none text-white">{value}</p></div></div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {([
                    ["TOTAL CHECKS", [["LINK", checkerStats.LINK.checked], ["IMAGE", checkerStats.IMAGE.checked], ["VIDEO", checkerStats.VIDEO.checked], ["ULTIMATE", checkerStats.ULTIMATE.checked]]],
                    ["TOTAL DEFECTS", [["LINK", checkerStats.LINK.defects], ["IMAGE", checkerStats.IMAGE.defects], ["VIDEO", checkerStats.VIDEO.defects], ["ULTIMATE", checkerStats.ULTIMATE.defects]]],
                  ] as Array<[string, Array<[string, number]>]>).map(([title, values]) => (
                    <div key={title} className="rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3"><p className="text-body font-black tracking-[0.11em] text-green-400">{title}</p><div className="mt-2 grid grid-cols-1 gap-1.5">{(values as Array<[string, number]>).map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/[0.055] px-2 py-1.5"><StatIcon type={label === "LINK" ? "link" : label === "IMAGE" ? "image" : label === "VIDEO" ? "video" : "ultimate"} className="text-body text-green-400" /><p className="text-primary font-black text-white">{value}</p></div>)}</div></div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3"><div className="flex items-center justify-between gap-2"><p className="text-body font-black tracking-[0.11em] text-green-400">PROFILE LIFETIME TOTALS</p><p className="text-body font-bold tracking-[0.08em] text-white"><span>{totalChecks}</span> <span className="text-green-400">CHECKS</span> · <span>{totalDefects}</span> <span className="text-green-400">DEFECTS</span></p></div><p className="mt-2 text-label leading-4 text-green-400">A compact total of the full lifetime record. Detailed checker fields stay inside their individual statistics tabs.</p></div>
              </>
            ) : (
              <div className="mt-4">
                {(() => {
                  const stat = checkerStats[statsTab.toUpperCase() as "LINK" | "IMAGE" | "VIDEO" | "ULTIMATE"];
                  const rows: Array<[string, number]> = statsTab === "ultimate"
                    ? [["ULTIMATE SCANS", stat.runs], ["TOTAL LINK CHECKS", 0], ["TOTAL IMAGE CHECKS", 0], ["TOTAL VIDEO CHECKS", 0], ["LINK DEFECTS", 0], ["IMAGE DEFECTS", 0], ["VIDEO DEFECTS", 0], ["LINK MANUAL", 0], ["IMAGE MANUAL", 0], ["VIDEO MANUAL", 0], ["TOTAL CHECKED", stat.checked], ["TOTAL CONFIRMED DEFECTS", stat.defects]]
                    : statsTab === "video"
                    ? [["TOTAL RUNS", stat.runs], ["VIDEO ELEMENTS", stat.checked], ["SOURCES DISCOVERED", 0], ["SAME-ORIGIN SOURCES", 0], ["EXTERNAL SOURCES", 0], ["HEALTHY", 0], ["CLIENT ERRORS", 0], ["RATE LIMITED", 0], ["SERVER ERRORS", 0], ["NETWORK/CORS", 0], ["MANUAL VERIFICATION", 0], ["CONFIRMED BROKEN", stat.defects]]
                    : [["TOTAL RUNS", stat.runs], ["TOTAL CHECKS", stat.checked], ["SUCCESSFUL", 0], ["REDIRECTS", 0], ["CLIENT ERRORS", 0], ["RATE LIMITED", 0], ["SERVER ERRORS", 0], ["NETWORK/CORS", 0], ["MANUAL VERIFICATION", 0], ["CONFIRMED BROKEN", stat.defects]];
                  return <div className="grid grid-cols-2 gap-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3"><div className="flex items-center justify-between gap-2"><p className="text-body font-black tracking-[0.08em] text-green-400">{label}</p><p className="text-primary font-black text-white">{value}</p></div></div>)}</div>;
                })()}
              </div>
            )}
          </div>
        </section>

        <footer className="relative mt-16 border-t border-green-500/40 pt-8"><div className="h-px bg-gradient-to-r from-green-400 via-green-500/30 to-transparent" /><div className="flex items-center justify-between pt-6 text-label font-bold tracking-[0.2em] text-green-500/60"><span>v1124 BUG CHECKER</span><span>SCAN SMARTER. BUILD BETTER.</span></div></footer>
      </div>
    </main>
  );
}

export default function CheckerProfilePage() { return <AuthGate returnTo="/checker/profile"><CheckerProfileContent /></AuthGate>; }
