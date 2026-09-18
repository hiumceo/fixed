"use client";

import Link from "next/link";
import { useState } from "react";

type Workspace = { id: string; name: string; createdAt: string; updatedAt: string };

type Props = {
  workspaces: Workspace[];
  activePath: "settings" | "profile" | "workstation";
  incognito?: boolean;
  onSave?: () => void | Promise<void>;
  saveAvailable?: boolean;
  onNew?: () => void;
  onLoadWorkspace?: (id: string) => void;
  onIncognito?: () => void;
  onDeleteWorkspace?: (id: string) => void;
  compact?: boolean;
};

export default function WorkspaceNavigator({ workspaces, activePath, incognito = false, onSave, saveAvailable = false, onNew, onLoadWorkspace, onIncognito, onDeleteWorkspace, compact = false }: Props) {
  const [saveActive, setSaveActive] = useState(false);

  async function handleSave() {
    if (!onSave || saveActive || incognito) return;
    setSaveActive(true);
    try {
      await onSave();
    } finally {
      setSaveActive(false);
    }
  }

  return (
    <section className={`mx-auto mt-10 max-w-5xl rounded-[28px] border p-5 shadow-[0_0_40px_rgba(0,220,255,.08)] sm:p-7 ${incognito ? "border-red-500/20 bg-black/70" : "border-cyan-400/30 bg-black/70"}`}>
      <div className={`flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between ${incognito ? "border-red-500/15" : "border-cyan-400/10"}`}>
        <div>
          <p className={`text-xs font-black tracking-[0.22em] ${incognito ? "text-red-400" : activePath !== "workstation" ? "text-white/60" : "text-cyan-400"}`}>WORKSPACE MANAGEMENT</p>
          <div className="mt-2 flex items-center gap-3"><h2 className="text-2xl font-black">{activePath === "settings" ? "SETTINGS" : activePath === "profile" ? "PROFILE" : "WORKSPACE"}</h2>{!incognito && !compact && workspaces.length > 0 && <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[9px] font-black tracking-[0.12em] text-cyan-300">{workspaces.length}</span>}</div>
          <p className="mt-2 text-body text-cyan-100/45">{incognito ? "Incognito mode is active. Nothing in this workspace will be saved." : activePath === "settings" ? "Edit account profile settings, password & security, email and tool preferences." : activePath === "profile" ? "View tester level, rating, personal profile information and statistics." : "Create, save, and reopen your investigation workspace."}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end">
{!incognito && (activePath === "settings" ? (
            <>
              <Link href="/workstation/profile" className="rounded-xl border border-white/10 bg-white px-4 py-3 text-xs font-black text-black">PROFILE</Link>
              <Link href="/workstation" className="rounded-xl border border-white/10 bg-white px-4 py-3 text-xs font-black text-black">BACK</Link>
            </>
          ) : activePath === "profile" ? (
            <>
              <Link href="/workstation/settings" className="rounded-xl border border-white/10 bg-white px-4 py-3 text-xs font-black text-black">SETTINGS</Link>
              <Link href="/workstation" className="rounded-xl border border-white/10 bg-white px-4 py-3 text-xs font-black text-black">BACK</Link>
            </>
          ) : (
            <Link href="/workstation/profile" className="rounded-xl border border-white/10 bg-white px-4 py-3 text-xs font-black text-black">PROFILE</Link>
          ))}
          {activePath === "workstation" ? <button type="button" className="rounded-xl bg-cyan-400 px-4 py-3 text-xs font-black text-black">NEW</button> : onNew ? <button type="button" onClick={onNew} className="rounded-xl bg-cyan-400 px-4 py-3 text-xs font-black text-black">NEW</button> : <Link href="/workstation" className="rounded-xl bg-cyan-400 px-4 py-3 text-xs font-black text-black">NEW</Link>}
          <button type="button" onClick={handleSave} disabled={!onSave || !saveAvailable || incognito || saveActive} className={incognito ? "cursor-not-allowed rounded-xl border border-white/35 bg-black px-4 py-3 text-xs font-black text-white/55" : "rounded-xl border px-4 py-3 text-xs font-black transition"} style={incognito ? undefined : ((!onSave || !saveAvailable || saveActive) ? { backgroundColor: "#000000", borderColor: "#6b7280", color: "#9ca3af" } : { backgroundColor: "#d1d5db", borderColor: "#9ca3af", color: "#000000" })}>SAVE</button>
          {activePath === "workstation" ? <button type="button" className="rounded-xl border border-red-400/40 bg-red-400/5 px-4 py-3 text-xs font-black text-red-300">INCOGNITO</button> : onIncognito ? <button type="button" onClick={onIncognito} className="rounded-xl border border-red-400/40 bg-red-400/5 px-4 py-3 text-xs font-black text-red-300">INCOGNITO</button> : <Link href="/workstation" className="rounded-xl border border-red-400/40 bg-red-400/5 px-4 py-3 text-xs font-black text-red-300">INCOGNITO</Link>}
        </div>
      </div>
      {!incognito && !compact && workspaces.length > 0 && <div className="mt-4 min-h-0 overflow-y-auto overscroll-contain pr-1" style={{ maxHeight: "10rem", minHeight: 0, overflowY: "auto" }}><div className="grid gap-2 sm:grid-cols-2">{workspaces.map(workspace => <div key={workspace.id} className="flex items-center gap-2 rounded-xl border border-cyan-400/15 px-3 py-3"><button type="button" onClick={() => onLoadWorkspace?.(workspace.id)} className="min-w-0 flex-1 text-left text-xs text-cyan-100/60">{workspace.name}</button>{onDeleteWorkspace && <button type="button" onClick={() => onDeleteWorkspace(workspace.id)} className="shrink-0 rounded-lg border border-red-400/40 bg-red-400/5 px-2 py-1 text-[9px] font-black tracking-[0.12em] text-red-300">DELETE</button>}</div>)}</div></div>}
    </section>
  );
}
