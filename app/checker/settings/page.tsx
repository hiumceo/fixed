"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import AuthGate from "@/components_AuthGate";
import CheckerManagement from "@/app/checker/CheckerManagement";
import { normalizeAccountState, type AccountState } from "@/lib/account";

function CheckerSettingsContent() {
  const [account, setAccount] = useState<AccountState>(() => normalizeAccountState(null));
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("READY");
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [avatarDirty, setAvatarDirty] = useState(false);

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" }).then(async r => r.ok ? r.json() : null).then(data => {
      if (data?.account) setAccount(normalizeAccountState(data.account));
      if (data?.authUser) { setUsername(data.authUser.username || ""); setSavedUsername(data.authUser.username || ""); setTelegramId(data.authUser.telegramId || ""); setTelegramUsername(data.authUser.telegramUsername || ""); }
    }).catch(() => {});
    fetch("/api/auth", { cache: "no-store" }).then(async r => r.ok ? r.json() : null).then(data => {
      if (data?.user) { setUsername(data.user.username || ""); setSavedUsername(data.user.username || ""); setTelegramId(data.user.telegramId || ""); setTelegramUsername(data.user.telegramUsername || ""); }
    }).catch(() => {});
  }, []);

  function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setAccount(prev => ({ ...prev, profile: { ...prev.profile, avatar: typeof reader.result === "string" ? reader.result : prev.profile.avatar } }));
    reader.onloadend = () => { setAvatarDirty(true); setStatus("PROFILE IMAGE READY • PRESS SAVE"); };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    setSaving(true); setStatus("");
    try {
      if (!username.trim()) throw new Error("USERNAME IS REQUIRED.");
      if (username.trim() !== savedUsername) {
        const ur = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-username", username: username.trim() }), cache: "no-store" });
        const ud = await ur.json().catch(() => ({}));
        if (!ur.ok) throw new Error(ud.error || "USERNAME COULD NOT BE SAVED.");
        setSavedUsername(ud.user?.username || username.trim());
        setUsername(ud.user?.username || username.trim());
      }
      const next = { ...account };
      const r = await fetch("/api/account", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: next }), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.account) throw new Error("ACCOUNT PROFILE COULD NOT BE SAVED.");
      setAccount(normalizeAccountState(d.account));
      setAvatarDirty(false);
      setStatus("ACCOUNT SAVED");
    } catch (e) { setStatus(e instanceof Error ? e.message : "ACCOUNT SAVE FAILED"); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) { setStatus("COMPLETE ALL PASSWORD FIELDS"); return; }
    if (newPassword !== confirmPassword) { setStatus("NEW PASSWORDS DO NOT MATCH"); return; }
    setPasswordSaving(true); setStatus("");
    try {
      const r = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "PASSWORD COULD NOT BE CHANGED.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setStatus("PASSWORD UPDATED");
    } catch (e) { setStatus(e instanceof Error ? e.message : "PASSWORD COULD NOT BE CHANGED."); }
    finally { setPasswordSaving(false); }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#020805] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-30"><div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(0,255,80,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,80,0.08) 1px, transparent 1px)", backgroundSize: "42px 42px" }} /></div>
      <div className="pointer-events-none fixed left-0 top-0 h-full w-24 border-r border-green-500/20" /><div className="pointer-events-none fixed right-0 top-0 h-full w-24 border-l border-green-500/20" />
      <div className="relative mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
        <div className="absolute left-8 top-12 hidden text-label font-semibold leading-5 tracking-[0.2em] text-green-500/60 sm:block">WEBSITES<br/>PERFORMANCE<br/>ACCESSIBILITY<br/>BETTER WEB<br/><span className="text-green-400">━━━━</span></div>
        <div className="absolute right-8 top-12 hidden text-right text-label font-semibold leading-5 tracking-[0.2em] text-green-500/60 sm:block">SCAN<br/>DETECT<br/>REPORT<br/>FIX<br/><span className="text-green-400">━</span></div>
        <header className="mx-auto max-w-4xl text-center"><img src="/bug-checker-logo.png" alt="v1124 Bug Checker" className="mx-auto w-full max-w-[12rem] object-contain" /><p className="mt-5 text-body font-semibold uppercase tracking-[0.22em] text-green-100/70">Check your website for broken links, images, and videos.</p><p className="mt-4 text-label font-black tracking-[0.18em] text-green-400">FIND ISSUES &nbsp;|&nbsp; IMPROVE QUALITY &nbsp;|&nbsp; AVOID LOST VISITORS</p></header>
        <CheckerManagement active="settings" />

        <section className="mx-auto mt-6 max-w-5xl rounded-[28px] border border-green-500/40 bg-black/70 p-5 shadow-[0_0_35px_rgba(0,255,80,0.12)] sm:p-7">
          <div className="rounded-2xl border border-green-400/20 bg-green-400/[0.025] p-5 shadow-[0_0_25px_rgba(0,255,80,0.08)]">
            <p className="text-body font-black tracking-[0.22em] text-green-400">ACCOUNT SETTINGS</p>
            <h2 className="mt-2 text-primary font-black">PROFILE SETTINGS</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-[120px_1fr] sm:items-start">
              <div className="text-center"><div className="mx-auto h-24 w-24 overflow-hidden rounded-full border border-green-400/20 bg-black/50">{<img src={account.profile.avatar || "/favicon.png"} alt="Profile" className="block h-full w-full object-cover" />}</div><label className="mt-3 block cursor-pointer rounded-xl border border-green-400/15 bg-black/30 px-2 py-2 text-label font-black tracking-[0.1em] text-green-300" style={{ borderColor: "rgba(74,222,128,0.15)" }}>CHANGE IMAGE<input type="file" accept="image/*" className="hidden" onChange={updateAvatar} /></label></div>
              <div className="grid gap-4">
                <label className="block"><span className="text-label font-black tracking-[0.14em] text-green-400/70">USERNAME</span><input value={username} onChange={e => setUsername(e.target.value)} className="mt-2 w-full rounded-xl border border-green-400/15 bg-black px-3 py-3 text-primary text-green-300 placeholder:text-green-400/45 outline-none" style={{ borderColor: "rgba(74,222,128,0.15)" }} /></label>
                <label className="block"><span className="text-label font-black tracking-[0.14em] text-green-400/70">TELEGRAM ID</span><input value={telegramId} readOnly aria-readonly="true" className="mt-2 w-full cursor-not-allowed rounded-xl border border-green-400/15 bg-black px-3 py-3 text-primary text-green-300/70 placeholder:text-green-400/45 outline-none" style={{ borderColor: "rgba(74,222,128,0.15)" }} /></label>
                <label className="block"><span className="text-label font-black tracking-[0.14em] text-green-400/70">TELEGRAM USERNAME</span><input value={telegramUsername ? `@${telegramUsername.replace(/^@/, "")}` : ""} readOnly aria-readonly="true" className="mt-2 w-full cursor-not-allowed rounded-xl border border-green-400/15 bg-black px-3 py-3 text-primary text-green-300/70 placeholder:text-green-400/45 outline-none" style={{ borderColor: "rgba(74,222,128,0.15)" }} /></label>
                <button type="button" disabled={saving || (!avatarDirty && username === savedUsername)} onClick={saveProfile} className="w-fit rounded-xl border border-green-400/40 bg-black px-5 py-3 text-micro font-black tracking-[0.12em] text-green-300 disabled:cursor-not-allowed disabled:opacity-40">SAVE</button>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-green-400/20 bg-green-400/[0.025] p-5 shadow-[0_0_25px_rgba(0,255,80,0.08)]">
            <p className="text-body font-black tracking-[0.22em] text-green-400">PASSWORD SETTINGS</p>
            <h2 className="mt-2 text-primary font-black">CHANGE PASSWORD</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3"><input value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} type="password" placeholder="CURRENT PASSWORD" className="rounded-xl border border-green-400/15 bg-black px-3 py-3 text-primary text-green-300 placeholder:text-green-400/45 outline-none" style={{ borderColor: "rgba(74,222,128,0.15)" }} /><input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="NEW PASSWORD" className="rounded-xl border border-green-400/15 bg-black px-3 py-3 text-primary text-green-300 placeholder:text-green-400/45 outline-none" style={{ borderColor: "rgba(74,222,128,0.15)" }} /><input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password" placeholder="CONFIRM NEW PASSWORD" className="rounded-xl border border-green-400/15 bg-black px-3 py-3 text-primary text-green-300 placeholder:text-green-400/45 outline-none" style={{ borderColor: "rgba(74,222,128,0.15)" }} /></div>
            <button type="button" disabled={passwordSaving} onClick={changePassword} className="mt-5 rounded-xl bg-green-400 px-5 py-3 text-micro font-black tracking-[0.12em] text-black disabled:cursor-not-allowed disabled:opacity-50">CHANGE PASSWORD</button>
          </div>
          <div className="mt-5 text-label font-black tracking-[0.12em] text-green-300/60">STATUS: {status}</div>
        </section>

        <footer className="relative mt-16 border-t border-green-500/30 pt-8"><div className="h-px bg-gradient-to-r from-green-400 via-green-500/30 to-transparent" /><div className="flex items-center justify-between pt-6 text-label font-bold tracking-[0.2em] text-green-500/60"><span>v1124 BUG CHECKER</span><span>SCAN SMARTER. BUILD BETTER.</span></div></footer>
      </div>
    </main>
  );
}

export default function CheckerSettingsPage() { return <AuthGate returnTo="/checker/settings"><CheckerSettingsContent /></AuthGate>; }