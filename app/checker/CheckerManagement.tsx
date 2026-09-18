"use client";

import Link from "next/link";

export default function CheckerManagement({ active }: { active: "checker" | "profile" | "settings" }) {
  return (
    <section className="mx-auto mt-10 max-w-5xl rounded-[28px] border border-green-500/40 bg-black/70 p-5 shadow-[0_0_35px_rgba(0,255,80,0.12)] sm:p-7">
      <div className="flex flex-col gap-4 border-b border-green-500/20 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.22em] text-green-400">CHECKER MANAGEMENT</p>
          <h2 className="mt-2 text-2xl font-black">{active === "checker" ? "CHECKER" : active === "profile" ? "PROFILE" : "SETTINGS"}</h2>
          <p className="mt-2 text-body text-green-100/45">
            {active === "checker" ? "Check your website for broken links, images, and videos." : active === "profile" ? "View your Bug Checker profile and account identity." : "Manage your Bug Checker account settings and password."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end">
          {active !== "checker" && (
            <Link href="/checker" className="rounded-xl border border-green-400/30 bg-green-400/[0.03] px-4 py-3 text-xs font-black text-green-300">CHECKER</Link>
          )}
          {active !== "checker" && (
            <Link href="/checker/settings" className={`rounded-xl px-4 py-3 text-xs font-black ${active === "settings" ? "border border-white/30 bg-white text-black" : "border border-green-400/30 bg-green-400/[0.03] text-green-300"}`}>SETTINGS</Link>
          )}
          <Link href="/checker/profile" className={`rounded-xl px-4 py-3 text-xs font-black ${active === "profile" ? "border border-white/30 bg-white text-black" : "border border-green-400/30 bg-green-400/[0.03] text-green-300"}`}>PROFILE</Link>
        </div>
      </div>
    </section>
  );
}
