"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeAccountState, type AccountState } from "@/lib/account";
import WorkspaceNavigator from "@/components_WorkspaceNavigator";
import AuthGate from "@/components_AuthGate";

type Workspace = { id: string; name: string; createdAt: string; updatedAt: string };

type WorkstationStats = {
  ULTIMATE: {
    runs: number;
    checked: number;
    manual: number;
    defects: number;
    successful: number;
    failed: number;
    LINK: { checked: number; manual: number; defects: number };
    IMAGE: { checked: number; manual: number; defects: number };
    VIDEO: { checked: number; manual: number; defects: number };
  };
};

function StatIcon({ type, className = "text-primary" }: { type: "overview" | "link" | "image" | "video" | "ultimate"; className?: string }) {
  const icon = { overview: "◉", link: "↗", image: "▧", video: "▶", ultimate: "⚡" }[type];
  return <span className={className} aria-hidden="true">{icon}</span>;
}

const TIER_LEVELS: Record<AccountState["tier"], number> = {
  NOVICE: 1,
  AMATEUR: 3,
  PRO: 5,
};

const PROFILE_TIER_LABELS: Record<AccountState["tier"], string> = {
  NOVICE: "NOVICE",
  AMATEUR: "AMATEUR",
  PRO: "PROFESSIONAL",
};

function ProfilePageContent() {
  const [account, setAccount] = useState<AccountState>(() => normalizeAccountState(null));
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [profileSaveAvailable, setProfileSaveAvailable] = useState(false);
  const [authUser, setAuthUser] = useState<{ username: string; email: string } | null>(null);
  const [workstationStats, setWorkstationStats] = useState<WorkstationStats>({
    ULTIMATE: {
      runs: 0,
      checked: 0,
      manual: 0,
      defects: 0,
      successful: 0,
      failed: 0,
      LINK: { checked: 0, manual: 0, defects: 0 },
      IMAGE: { checked: 0, manual: 0, defects: 0 },
      VIDEO: { checked: 0, manual: 0, defects: 0 },
    },
  });
  const [statsTab, setStatsTab] = useState<"overview" | "ultimate">("overview");

  useEffect(() => {
    if (!profileSaveAvailable) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [profileSaveAvailable]);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (data?.user) setAuthUser({ username: data.user.username, email: data.user.email }); })
      .catch(() => {});
    fetch("/api/account", { cache: "no-store" })
      .then(async r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.account) setAccount(normalizeAccountState(data.account));
        const storedStats = data?.workstationStats ?? data?.authUser?.workstationStats;
        if (storedStats?.ULTIMATE) {
          const ws = storedStats.ULTIMATE;
          setWorkstationStats({
            ULTIMATE: {
              runs: Number(ws.runs || 0),
              checked: Number(ws.checked || 0),
              manual: Number(ws.manual || 0),
              defects: Number(ws.defects || 0),
              successful: Number(ws.successful || 0),
              failed: Number(ws.failed || 0),
              LINK: { checked: Number(ws.LINK?.checked || 0), manual: Number(ws.LINK?.manual || 0), defects: Number(ws.LINK?.defects || 0) },
              IMAGE: { checked: Number(ws.IMAGE?.checked || 0), manual: Number(ws.IMAGE?.manual || 0), defects: Number(ws.IMAGE?.defects || 0) },
              VIDEO: { checked: Number(ws.VIDEO?.checked || 0), manual: Number(ws.VIDEO?.manual || 0), defects: Number(ws.VIDEO?.defects || 0) },
            },
          });
        }
      })
      .catch(() => {});
    fetch("http://127.0.0.1:18724/workspaces", { cache: "no-store" })
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.workspaces)) setWorkspaces(data.workspaces); })
      .catch(() => {});
  }, []);

  const created = useMemo(() => new Date(account.profile.createdAt), [account.profile.createdAt]);
  const testerLevel = account.testerLevel ?? TIER_LEVELS[account.tier];
  const rating = typeof account.rating === "number" ? Math.max(0, Math.min(100, account.rating)) : null;
  const toStatNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const ultimateStats = workstationStats.ULTIMATE;
  const totalCheckerRuns = toStatNumber(ultimateStats.runs);
  const successfulRuns = toStatNumber(ultimateStats.successful);
  const failedRuns = toStatNumber(ultimateStats.failed);
  const totalChecks = toStatNumber(ultimateStats.LINK.checked + ultimateStats.IMAGE.checked + ultimateStats.VIDEO.checked);
  const totalDefects = toStatNumber(ultimateStats.LINK.defects + ultimateStats.IMAGE.defects + ultimateStats.VIDEO.defects);

  async function saveProfile() {
    if (!profileSaveAvailable) return;
    await fetch("/api/account", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account }),
    });
    setProfileSaveAvailable(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#020608] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-30"><div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,220,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,220,255,0.06) 1px, transparent 1px)", backgroundSize: "42px 42px" }} /></div>
      <div className="pointer-events-none fixed left-0 top-0 h-full w-24 border-r border-cyan-400/15" /><div className="pointer-events-none fixed right-0 top-0 h-full w-24 border-l border-cyan-400/15" />
      <div className="relative mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-10 sm:py-10">
        <div className="relative">
          <header className="mx-auto max-w-4xl text-center">
            <img src="/bug-workstation-logo.png" alt="v1124 Bug WorkStation" className="mx-auto h-auto w-full max-w-[12rem] object-contain" />
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-cyan-100/65 sm:text-sm">A SPECIALIZED WORKSPACE FOR AUTOMATED WEBSITE INVESTIGATION</p>
            <p className="mt-4 text-label font-black tracking-[0.16em] text-cyan-400">INVESTIGATION BROWSER &nbsp;|&nbsp; <span className="text-green-400">ULTIMATE CHECKER</span> &nbsp;|&nbsp; SIGNALS &nbsp;|&nbsp; EVIDENCES &nbsp;|&nbsp; EXTRACTORS &nbsp;|&nbsp; SOURCE HIERARCHY &nbsp;|&nbsp; PROJECT INSTRUCTION</p>
          </header>
        </div>

        <WorkspaceNavigator
          workspaces={workspaces}
          activePath="profile"
          compact
          onSave={saveProfile}
          saveAvailable={profileSaveAvailable}
          onNew={() => { window.location.href = "/workstation"; }}
          onLoadWorkspace={(id) => { window.localStorage.setItem("v1124-workstation-active", id); window.location.href = "/workstation"; }}
          onIncognito={() => { window.location.href = "/workstation"; }}
        />

        <section className="mx-auto mt-6 max-w-5xl rounded-[28px] border border-cyan-400/30 bg-black/70 p-5 sm:p-7">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" style={{ gridTemplateColumns: "minmax(0,1fr) 220px minmax(0,1fr)" }}>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.025] p-5">
              <div className="grid gap-5">
                <div>
                  <p className="text-body font-black tracking-[0.2em] text-cyan-400">USERNAME</p>
                  <p className="mt-2 text-primary font-black">{authUser?.username || "—"}</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] px-2 py-1.5 text-cyan-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 shrink-0 text-cyan-300"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M7 2.8v4M17 2.8v4M3 9h18M8 13h2M14 13h2M8 17h2" /></svg>
                    <p className="text-label font-black tracking-[0.12em] text-cyan-300">ACCOUNT AGE <span className="ml-1 tracking-tight text-white">{Number.isNaN(created.getTime()) ? "Unknown" : (() => { const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000)); return days === 0 ? "Less than a day" : days === 1 ? "1 day" : `${days} days`; })()}</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-[190px] w-full rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.025] p-4">
              <div className="flex h-[calc(100%-20px)] items-center justify-center">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-cyan-400/30 bg-black/50 shadow-[0_0_24px_rgba(0,220,255,.08)]" style={{ width: 96, height: 96 }}>
                  {account.profile.avatar ? <div aria-hidden="true" style={{ width: 94, height: 94, backgroundImage: `url(${account.profile.avatar})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} /> : <div aria-hidden="true" style={{ width: 94, height: 94, backgroundImage: "url(/favicon.png)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.025] p-5">
              <p className="text-body font-black tracking-[0.2em] text-cyan-400">TIER</p>
              <p className="mt-2 text-primary font-black text-white">{PROFILE_TIER_LABELS[account.tier]}</p>
              <p className="mt-3 text-body text-cyan-100/45">Current access tier for the v1124 Bug Workstation.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.025] p-5">
              <p className="text-body font-black tracking-[0.2em] text-cyan-400">TESTER LEVEL</p>
              <p className="mt-2 text-primary font-black">LEVEL {testerLevel}</p>
              <button type="button" onClick={() => setProfileSaveAvailable(true)} className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] px-3 py-2 text-micro font-black tracking-[0.12em] text-cyan-300">UPDATE</button>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.025] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-body font-black tracking-[0.2em] text-cyan-400">RATING</p>
                <p className="text-primary font-black">{rating === null ? "—" : rating}</p>
              </div>
              <div className="mt-5 overflow-hidden rounded-full border border-cyan-400/30 bg-black/80" style={{ height: 12 }}>
                <div className="rounded-full transition-all" style={{ width: `${rating ?? 50}%`, height: 10, minWidth: 8, background: "#ffffff" }} />
              </div>
              <button type="button" onClick={() => setProfileSaveAvailable(true)} className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] px-3 py-2 text-micro font-black tracking-[0.12em] text-cyan-300">UPDATE</button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.025] p-5">
            <p className="text-primary font-black tracking-[0.2em] text-cyan-400">WORKSPACE STATISTICS</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div><p className="text-body font-black tracking-[0.14em] text-cyan-400/60">CURRENT WORKSPACES</p><p className="mt-2 text-primary font-black text-cyan-100/70">{workspaces.length}</p></div>
              <div><p className="text-body font-black tracking-[0.14em] text-cyan-400/60">TOTAL WORKSPACES CREATED</p><p className="mt-2 text-primary font-black text-cyan-100/70">{account.stats.workspacesCreated}</p></div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-green-500/40 bg-green-500/[0.07] p-5 shadow-[0_0_25px_rgba(0,255,80,0.08)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-primary font-black tracking-[0.2em] text-green-400">ULTIMATE CHECKER STATISTICS</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-body font-black tracking-tight text-white">
                  {statsTab === "overview" ? <><StatIcon type="overview" className="text-body" />OVERVIEW</> : <><StatIcon type="ultimate" className="text-body" />ULTIMATE LIFETIME</>}
                </p>
              </div>
              <span className="text-body font-black tracking-[0.12em] text-green-400/35">LIFETIME TOTALS</span>
            </div>

            <div className="mt-4 border-b border-green-500/40 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {(["overview", "ultimate"] as const).map((key) => (
                  <button key={key} type="button" onClick={() => setStatsTab(key)} aria-label={key === "overview" ? "Overview" : "Ultimate Lifetime"} title={key === "overview" ? "Overview" : "Ultimate Lifetime"} className={`inline-flex h-8 w-full items-center justify-center rounded-lg border text-green-100/40 transition ${statsTab === key ? "border-green-500/40 bg-green-400/10 text-green-300" : "border-green-500/40 bg-green-500/[0.035] hover:bg-green-500/10 hover:text-green-300"}`}>
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
                    ["TOTAL CHECKS", [["link", workstationStats.ULTIMATE.LINK.checked], ["image", workstationStats.ULTIMATE.IMAGE.checked], ["video", workstationStats.ULTIMATE.VIDEO.checked], ["ultimate", workstationStats.ULTIMATE.checked]]],
                    ["TOTAL DEFECTS", [["link", workstationStats.ULTIMATE.LINK.defects], ["image", workstationStats.ULTIMATE.IMAGE.defects], ["video", workstationStats.ULTIMATE.VIDEO.defects], ["ultimate", workstationStats.ULTIMATE.defects]]],
                  ] as Array<[string, Array<["link" | "image" | "video" | "ultimate", number]>]>).map(([title, values]) => (
                    <div key={title} className="rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3"><p className="text-body font-black tracking-[0.11em] text-green-400">{title}</p><div className="mt-2 grid grid-cols-1 gap-1.5">{values.map(([type, value]) => <div key={type} className="flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/[0.055] px-2 py-1.5"><StatIcon type={type} className="text-body text-green-400" /><p className="text-primary font-black leading-none text-white">{value}</p></div>)}</div></div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3"><div className="flex items-center justify-between gap-2"><p className="text-body font-black tracking-[0.11em] text-green-400">PROFILE LIFETIME TOTALS</p><p className="text-body font-bold tracking-[0.08em] text-white"><span>{totalChecks}</span> <span className="text-green-400">CHECKS</span> · <span>{totalDefects}</span> <span className="text-green-400">DEFECTS</span></p></div><p className="mt-2 text-body leading-5 text-green-400">A compact total of the full lifetime record. Detailed checker fields stay inside their individual statistics tabs.</p></div>
              </>
            ) : (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["ULTIMATE SCANS", ultimateStats.runs],
                    ["TOTAL LINK CHECKS", ultimateStats.LINK.checked],
                    ["TOTAL IMAGE CHECKS", ultimateStats.IMAGE.checked],
                    ["TOTAL VIDEO CHECKS", ultimateStats.VIDEO.checked],
                    ["LINK DEFECTS", ultimateStats.LINK.defects],
                    ["IMAGE DEFECTS", ultimateStats.IMAGE.defects],
                    ["VIDEO DEFECTS", ultimateStats.VIDEO.defects],
                    ["LINK MANUAL", ultimateStats.LINK.manual],
                    ["IMAGE MANUAL", ultimateStats.IMAGE.manual],
                    ["VIDEO MANUAL", ultimateStats.VIDEO.manual],
                    ["TOTAL ULTIMATE CHECKS", totalChecks],
                    ["TOTAL CONFIRMED DEFECTS", totalDefects],
                  ] as Array<[string, number]>).map(([label, value]) => <div key={label} className="rounded-xl border border-green-500/40 bg-green-500/[0.05] p-3"><div className="flex items-center justify-between gap-2"><p className="text-body font-black tracking-[0.08em] text-green-400">{label}</p><p className="text-primary font-black text-white">{value}</p></div></div>)}
                </div>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-10 border-t border-cyan-400/20 pt-6 text-center text-label font-black tracking-[0.2em] text-cyan-400/40">v1124 PROFILE</footer>
      </div>
    </main>
  );
}

export default function ProfilePage(){ return <AuthGate returnTo="/workstation/profile"><ProfilePageContent /></AuthGate>; }
