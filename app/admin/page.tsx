"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components_AuthGate";

type User = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  checkerStats: { checks: number };
  passwordMustChange: boolean;
};

type Ticket = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  status: "OPEN" | "IN_REVIEW" | "PROCESSED" | "CLOSED";
  processedAt?: string;
};

type Modal = "user" | "ticket" | "status" | "credentials" | "role" | "username" | null;

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "ticket") return <svg {...common}><path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Z"/><path d="M13 7v12"/></svg>;
  if (name === "ban") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>;
  if (name === "key") return <svg {...common}><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-5"/></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/></svg>;
  if (name === "download") return <svg {...common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/></svg>;
  if (name === "eye") return <svg {...common}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ children }: { children: string }) {
  return <span className="inline-flex rounded-md bg-white px-2.5 py-1 text-micro font-black text-black">{children}</span>;
}

function AdminPanelContent() {
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState({ users: 0, activeUsers: 0, disabledUsers: 0, tickets: 0, openTickets: 0 });
  const [admin, setAdmin] = useState<{ username: string; email: string } | null>(null);
  const [authorized, setAuthorized] = useState<"checking" | "yes" | "no">("checking");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("READY");
  const [userSearchDraft, setUserSearchDraft] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userStatus, setUserStatusFilter] = useState("ALL");
  const [userRole, setUserRoleFilter] = useState("ALL");
  const [userSort, setUserSort] = useState("NEWEST");
  const [ticketSearchDraft, setTicketSearchDraft] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatus, setTicketStatus] = useState("ALL");
  const [userPage, setUserPage] = useState(1);
  const [ticketPage, setTicketPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [delivery, setDelivery] = useState("");
  const [newRole, setNewRole] = useState<"USER" | "ADMIN">("USER");
  const [ownPassword, setOwnPassword] = useState({ current: "", next: "", confirm: "" });
  const [newUsername, setNewUsername] = useState("");
  const [menuUser, setMenuUser] = useState<string | null>(null);
  const [menuTicket, setMenuTicket] = useState<string | null>(null);
  const [accountMenu, setAccountMenu] = useState(false);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 403) { setAuthorized("no"); return; }
      if (!response.ok) throw new Error(data?.error || "ADMIN DATA UNAVAILABLE.");
      setAuthorized("yes"); setUsers(Array.isArray(data.users) ? data.users : []); setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setCounts(data.counts || { users: 0, activeUsers: 0, disabledUsers: 0, tickets: 0, openTickets: 0 });
      if (data.admin) setAdmin(data.admin);
      if (!silent) setStatus("DATA REFRESHED");
    } catch (error) { setAuthorized("no"); setStatus(error instanceof Error ? error.message : "ADMIN DATA UNAVAILABLE."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    const result = users.filter(user => {
      const matchesQuery = !query || user.username.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
      const matchesStatus = userStatus === "ALL" || user.status === userStatus;
      const matchesRole = userRole === "ALL" || user.role === userRole;
      return matchesQuery && matchesStatus && matchesRole;
    });
    return result.sort((a, b) => userSort === "OLDEST" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [users, userSearch, userStatus, userRole, userSort]);

  const filteredTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase();
    return tickets.filter(ticket => {
      const matchesQuery = !query || ticket.username.toLowerCase().includes(query) || ticket.email.toLowerCase().includes(query) || ticket.id.toLowerCase().includes(query);
      const matchesStatus = ticketStatus === "ALL" || ticket.status === ticketStatus;
      return matchesQuery && matchesStatus;
    });
  }, [tickets, ticketSearch, ticketStatus]);

  const userPages = Math.max(1, Math.ceil(filteredUsers.length / 5));
  const ticketPages = Math.max(1, Math.ceil(filteredTickets.length / 5));
  const visibleUsers = filteredUsers.slice((userPage - 1) * 5, userPage * 5);
  const visibleTickets = filteredTickets.slice((ticketPage - 1) * 5, ticketPage * 5);

  useEffect(() => { setUserPage(page => Math.min(page, userPages)); }, [userPages]);
  useEffect(() => { setTicketPage(page => Math.min(page, ticketPages)); }, [ticketPages]);

  async function adminAction(action: string, payload: Record<string, string>) {
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "ADMIN ACTION FAILED.");
      if (data.user) setSelectedUser(data.user);
      if (data.ticket) setSelectedTicket(data.ticket);
      if (data.temporaryPassword) { setTemporaryPassword(data.temporaryPassword); setDelivery(data.delivery?.status || ""); setModal("credentials"); }
      await loadData(true);
      return data;
    } catch (error) { setStatus(error instanceof Error ? error.message : "ADMIN ACTION FAILED."); return null; }
  }

  function selectUser(user: User) { setSelectedUser(user); setStatus(`SELECTED ${user.username.toUpperCase()}`); }

  async function signOut() {
    await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signout" }) }).catch(() => {});
    window.location.href = "/";
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), counts, users, tickets }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `v1124-auth-admin-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); setStatus("ADMIN DATA EXPORTED");
  }

  async function showSystemStatus() {
    try {
      const response = await fetch("/api/admin?resource=status", { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "SYSTEM STATUS UNAVAILABLE.");
      setStatus(data.status || "OPERATIONAL"); setModal("status");
    } catch (error) { setStatus(error instanceof Error ? error.message : "SYSTEM STATUS UNAVAILABLE."); }
  }

  async function saveOwnPassword() {
    if (!ownPassword.current || !ownPassword.next || !ownPassword.confirm) { setStatus("COMPLETE ALL PASSWORD FIELDS"); return; }
    if (ownPassword.next !== ownPassword.confirm) { setStatus("NEW PASSWORDS DO NOT MATCH"); return; }
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: ownPassword.current, newPassword: ownPassword.next }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "PASSWORD COULD NOT BE CHANGED.");
      setOwnPassword({ current: "", next: "", confirm: "" }); setModal(null); setStatus("ADMIN PASSWORD UPDATED");
    } catch (error) { setStatus(error instanceof Error ? error.message : "PASSWORD COULD NOT BE CHANGED."); }
  }

  if (authorized === "checking") return <main className="min-h-screen bg-[#030505]" />;
  if (authorized === "no") return <main className="min-h-screen bg-[#030505] px-5 py-10 text-white"><div className="mx-auto max-w-lg rounded-3xl border border-white/20 bg-black/80 p-8 text-center"><img src="/v1124-auth-logo.png" alt="v1124 AUTH" className="mx-auto mb-7 max-h-20 w-auto"/><p className="text-body font-black tracking-[0.2em] text-white/50">ADMIN ACCESS REQUIRED</p><h1 className="mt-3 text-display font-black">AUTHORIZED ADMIN ONLY</h1><p className="mt-3 text-body text-white/55">This area is protected by the v1124 AUTH server.</p><button onClick={() => window.location.href = "/"} className="mt-6 rounded-xl bg-white px-5 py-3 text-micro font-black tracking-[0.14em] text-black">RETURN TO AUTH</button></div></main>;

  return (
    <main className="min-h-screen overflow-hidden bg-[#020608] text-white">
      <div className="pointer-events-none fixed left-0 top-0 h-full w-24 border-r border-white/15" />
      <div className="pointer-events-none fixed right-0 top-0 h-full w-24 border-l border-white/15" />
      <div className="relative mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-10 sm:py-10">
        <header className="relative mx-auto max-w-4xl text-center">
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setAccountMenu(value => !value)} className="flex items-center gap-2 rounded-full border border-white/50 bg-black/70 px-3 py-2 text-body font-bold"><span className="grid h-9 w-9 place-items-center rounded-full border border-white/70"><span className="text-primary">●</span></span><span className="hidden sm:inline">{admin?.username || "Admin"}</span><span>⌄</span></button>
              {accountMenu && <div className="absolute right-0 z-30 mt-2 w-48 rounded-2xl border border-white/20 bg-black p-2 text-left shadow-2xl"><button onClick={() => { setAccountMenu(false); setModal("credentials"); setTemporaryPassword(""); }} className="w-full rounded-xl px-3 py-3 text-left text-micro font-black tracking-[0.12em] hover:bg-white/10">CHANGE PASSWORD</button><button onClick={() => { setAccountMenu(false); setNewUsername(admin?.username || ""); setModal("username"); }} className="w-full rounded-xl px-3 py-3 text-left text-micro font-black tracking-[0.12em] hover:bg-white/10">USERNAME SETTINGS</button></div>}
            </div>
            <button onClick={signOut} className="rounded-xl border border-white/60 px-4 py-3 text-micro font-black tracking-[0.12em]">SIGN OUT</button>
          </div>
          <img src="/v1124-auth-logo.png" alt="v1124 AUTH" className="mx-auto h-auto w-full max-w-[220px] object-contain" />
          <p className="mt-5 text-body font-semibold tracking-[0.14em] text-white/80">v1124 Authentication</p>
          <nav className="mt-4 text-label font-black tracking-[0.16em] text-white/90 sm:text-body">USER <span className="mx-3 text-white/40">|</span> PASSWORD RECOVERY <span className="mx-3 text-white/40">|</span> ACCOUNT MANAGEMENT</nav>
        </header>

        <section className="mx-auto mt-10 max-w-5xl rounded-[28px] border border-white/20 bg-black p-5 shadow-[0_0_40px_rgba(255,255,255,.04)] sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-body font-black tracking-[0.2em] text-white/80">ADMIN DASHBOARD</p><h1 className="mt-2 text-display font-black">ADMIN</h1><p className="mt-2 text-body text-white/60">Manage users, handle password recovery, and control account settings.</p></div>
            <div className="flex flex-wrap gap-2"><button className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">DASHBOARD</button><button onClick={() => void loadData()} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black" disabled={loading}><span className="inline-flex items-center gap-2"><Icon name="refresh" size={15}/>REFRESH</span></button><button onClick={exportData} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black"><span className="inline-flex items-center gap-2"><Icon name="download" size={15}/>EXPORT</span></button><button onClick={() => void showSystemStatus()} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black">SYSTEM STATUS</button></div>
          </div>
        </section>

        <section className="mx-auto mt-6 max-w-5xl rounded-[28px] border border-white/20 bg-black p-5 sm:p-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div><p className="text-body font-black tracking-[0.2em] text-white/75">USER MANAGEMENT</p><h2 className="mt-2 text-display font-black">USERS</h2><p className="mt-1 text-body text-white/55">Search, view, and manage all registered users.</p></div>
            <div className="w-full lg:max-w-[610px]"><div className="flex gap-2"><div className="flex min-w-0 flex-1 items-center rounded-xl border border-white/20 bg-black px-3"><Icon name="search" size={21}/><input value={userSearchDraft} onChange={e => setUserSearchDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { setUserSearch(userSearchDraft); setUserPage(1); } }} placeholder="Search users by username or email..." className="min-w-0 flex-1 bg-transparent px-3 py-4 text-primary outline-none"/><button onClick={() => { setUserSearch(userSearchDraft); setUserPage(1); }} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">SEARCH</button></div><button onClick={() => setFiltersOpen(v => !v)} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black"><span className="inline-flex items-center gap-2"><Icon name="filter" size={17}/>FILTERS</span></button></div></div>
          </div>
          {filtersOpen && <div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="text-label font-black tracking-[0.12em] text-white/60">STATUS<select value={userStatus} onChange={e => { setUserStatusFilter(e.target.value); setUserPage(1); }} className="mt-2 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-primary text-white"><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label><label className="text-label font-black tracking-[0.12em] text-white/60">ROLE<select value={userRole} onChange={e => { setUserRoleFilter(e.target.value); setUserPage(1); }} className="mt-2 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-primary text-white"><option value="ALL">All</option><option value="USER">User</option><option value="ADMIN">Admin</option></select></label><label className="text-label font-black tracking-[0.12em] text-white/60">SORT BY<select value={userSort} onChange={e => setUserSort(e.target.value)} className="mt-2 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-primary text-white"><option value="NEWEST">Newest</option><option value="OLDEST">Oldest</option></select></label></div>}
          <div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-white/20 bg-black p-5"><p className="text-label text-white/50">TOTAL USERS</p><p className="mt-1 text-display font-black">{counts.users.toLocaleString()}</p></div><div className="rounded-2xl border border-white/20 bg-black p-5"><p className="text-label text-white/50">ACTIVE</p><p className="mt-1 text-display font-black">{counts.activeUsers.toLocaleString()}</p></div><div className="rounded-2xl border border-white/20 bg-black p-5"><p className="text-label text-white/50">DISABLED</p><p className="mt-1 text-display font-black">{counts.disabledUsers.toLocaleString()}</p></div><div className="rounded-2xl border border-white/20 bg-black p-5"><p className="text-label text-white/50">ADMINS</p><p className="mt-1 text-display font-black">{users.filter(u => u.role === "ADMIN").length.toLocaleString()}</p></div></div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/20"><table className="w-full min-w-[900px] text-left text-body"><thead className="bg-white/[0.08] text-label font-black tracking-[0.08em] text-white/75"><tr><th className="px-4 py-3">#</th><th>USERNAME</th><th>EMAIL</th><th>STATUS</th><th>ROLE</th><th>DATE CREATED</th><th>LAST LOGIN</th><th>ACTIONS</th></tr></thead><tbody>{visibleUsers.map((user, index) => <tr key={user.id} onClick={() => selectUser(user)} className={`border-t border-white/5 ${selectedUser?.id === user.id ? "bg-white/[0.07]" : ""}`}><td className="px-4 py-3">{(userPage - 1) * 5 + index + 1}</td><td className="py-3 font-medium">{user.username}</td><td className="py-3 text-white/75">{user.email}</td><td className="py-2.5"><StatusBadge>{user.status === "ACTIVE" ? "Active" : "Disabled"}</StatusBadge></td><td className="py-2.5">{user.role === "ADMIN" ? "Admin" : "User"}</td><td className="py-3 text-white/65">{new Date(user.createdAt).toLocaleDateString()}</td><td className="py-3 text-white/65">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}</td><td className="relative py-3"><div className="flex items-center gap-2"><button onClick={e => { e.stopPropagation(); selectUser(user); setModal("user"); }} className="rounded-lg bg-white px-4 py-2 text-micro font-black text-black">VIEW</button><button onClick={e => { e.stopPropagation(); setMenuUser(menuUser === user.id ? null : user.id); }} className="rounded-lg border border-white/40 px-3 py-2 text-body">•••</button></div>{menuUser === user.id && <div className="absolute right-3 top-12 z-20 w-44 rounded-xl border border-white/20 bg-black p-2 shadow-2xl"><button onClick={() => { setMenuUser(null); void adminAction("set-status", { userId: user.id, status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }); }} className="w-full rounded-lg px-3 py-2 text-left text-micro font-black hover:bg-white/10">{user.status === "ACTIVE" ? "DISABLE ACCOUNT" : "ENABLE ACCOUNT"}</button><button onClick={() => { setMenuUser(null); selectUser(user); setModal("role"); setNewRole(user.role); }} className="w-full rounded-lg px-3 py-2 text-left text-micro font-black hover:bg-white/10">UPDATE ROLE</button><button onClick={() => { setMenuUser(null); void adminAction("reset-password", { userId: user.id }); }} className="w-full rounded-lg px-3 py-2 text-left text-micro font-black hover:bg-white/10">RESET PASSWORD</button></div>}</td></tr>)}</tbody></table>{!visibleUsers.length && <div className="p-8 text-center text-body text-white/45">NO USERS MATCH THE CURRENT SEARCH/FILTERS.</div>}</div>
          <div className="mt-3 flex flex-col gap-3 text-body text-white/65 sm:flex-row sm:items-center sm:justify-between"><span>Showing {filteredUsers.length ? (userPage - 1) * 5 + 1 : 0} - {Math.min(userPage * 5, filteredUsers.length)} of {filteredUsers.length} users</span><Pagination page={userPage} pages={userPages} setPage={setUserPage}/></div>
        </section>

        <section className="mx-auto mt-6 max-w-5xl rounded-[28px] border border-white/20 bg-black p-5 sm:p-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-body font-black tracking-[0.2em] text-white/75">PASSWORD RECOVERY</p><h2 className="mt-2 text-display font-black">TICKETS</h2><p className="mt-1 text-body text-white/55">Review and process password recovery requests.</p></div><div className="w-full lg:max-w-[590px]"><div className="flex gap-2"><div className="flex min-w-0 flex-1 items-center rounded-xl border border-white/20 bg-black px-3"><Icon name="search" size={21}/><input value={ticketSearchDraft} onChange={e => setTicketSearchDraft(e.target.value)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { setTicketSearch(e.currentTarget.value); setTicketPage(1); } }} placeholder="Search tickets by email, username, or ID..." className="min-w-0 flex-1 bg-transparent px-3 py-4 text-primary outline-none"/><button onClick={() => { setTicketSearch(ticketSearchDraft); setTicketPage(1); }} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">SEARCH</button></div><label className="w-32 text-label font-black text-white/60">STATUS<select value={ticketStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setTicketStatus(e.target.value); setTicketPage(1); }} className="mt-2 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-primary text-white"><option value="ALL">All</option><option value="OPEN">Pending</option><option value="IN_REVIEW">In Review</option><option value="PROCESSED">Resolved</option><option value="CLOSED">Closed</option></select></label></div></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/20 bg-black p-5"><p className="text-label text-white/50">PENDING TICKETS</p><p className="mt-1 text-display font-black">{counts.openTickets.toLocaleString()}</p></div><div className="rounded-2xl border border-white/20 bg-black p-5"><p className="text-label text-white/50">TOTAL TICKETS</p><p className="mt-1 text-display font-black">{counts.tickets.toLocaleString()}</p></div></div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/20"><table className="w-full min-w-[850px] text-left text-body"><thead className="bg-white/[0.08] text-label font-black tracking-[0.08em] text-white/75"><tr><th className="px-4 py-3">#</th><th>TICKET ID</th><th>USERNAME</th><th>EMAIL</th><th>STATUS</th><th>DATE SUBMITTED</th><th>ACTIONS</th></tr></thead><tbody>{visibleTickets.map((ticket,index) => <tr key={ticket.id} className="border-t border-white/5"><td className="px-4 py-3">{(ticketPage - 1) * 5 + index + 1}</td><td className="py-3 font-mono text-label">{ticket.id.slice(0, 12)}</td><td className="py-3">{ticket.username}</td><td className="py-3 text-white/75">{ticket.email}</td><td className="py-2.5"><StatusBadge>{ticket.status === "OPEN" ? "Pending" : ticket.status === "IN_REVIEW" ? "In Review" : ticket.status === "PROCESSED" ? "Resolved" : "Closed"}</StatusBadge></td><td className="py-3 text-white/65">{formatDate(ticket.createdAt)}</td><td className="relative py-3"><div className="flex items-center gap-2"><button onClick={() => { setSelectedTicket(ticket); setModal("ticket"); }} className="rounded-lg bg-white px-4 py-2 text-micro font-black text-black">OPEN</button><button onClick={() => setMenuTicket(menuTicket === ticket.id ? null : ticket.id)} className="rounded-lg border border-white/40 px-3 py-2 text-body">•••</button></div>{menuTicket === ticket.id && <div className="absolute right-3 top-12 z-20 w-44 rounded-xl border border-white/20 bg-black p-2 shadow-2xl"><button onClick={() => { setMenuTicket(null); void adminAction("set-ticket-status", { ticketId: ticket.id, status: "IN_REVIEW" }); }} className="w-full rounded-lg px-3 py-2 text-left text-micro font-black hover:bg-white/10">MARK IN REVIEW</button><button onClick={() => { setMenuTicket(null); void adminAction("set-ticket-status", { ticketId: ticket.id, status: "CLOSED" }); }} className="w-full rounded-lg px-3 py-2 text-left text-micro font-black hover:bg-white/10">CLOSE TICKET</button></div>}</td></tr>)}</tbody></table>{!visibleTickets.length && <div className="p-8 text-center text-body text-white/45">NO RECOVERY TICKETS MATCH THE CURRENT SEARCH/FILTERS.</div>}</div>
          <div className="mt-3 flex flex-col gap-3 text-body text-white/65 sm:flex-row sm:items-center sm:justify-between"><span>Showing {filteredTickets.length ? (ticketPage - 1) * 5 + 1 : 0} - {Math.min(ticketPage * 5, filteredTickets.length)} of {filteredTickets.length} tickets</span><Pagination page={ticketPage} pages={ticketPages} setPage={setTicketPage}/></div>
        </section>

        <section className="mx-auto mt-6 max-w-5xl rounded-[28px] border border-white/20 bg-black p-5 sm:p-7">
          <div><p className="text-body font-black tracking-[0.2em] text-white/75">ACCOUNT MANAGEMENT</p><h2 className="mt-2 text-display font-black">CONTROLS</h2><p className="mt-1 text-body text-white/55">Manage account status and perform administrative actions.</p></div>
          <div className="mt-5 rounded-2xl border border-white/20 bg-black p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center rounded-xl border border-white/20 bg-black px-3"><Icon name="search" size={20}/><input value={selectedUser?.username || ""} onChange={e => { const q = e.target.value.toLowerCase(); const found = users.find(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)); setSelectedUser(found || null); }} placeholder="Search accounts..." className="min-w-0 flex-1 bg-transparent px-3 py-4 text-primary outline-none"/><button onClick={() => selectedUser ? setStatus(`SELECTED ${selectedUser.username.toUpperCase()}`) : setStatus("ACCOUNT NOT SELECTED")} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">SEARCH</button></div>{selectedUser && <div className="rounded-xl border border-white/15 px-3 py-2 text-label font-black">SELECTED: {selectedUser.username}</div>}</div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><ControlButton icon="users" title="ENABLE ACCOUNT" description="Re-activate a disabled account." onClick={() => selectedUser ? void adminAction("set-status", { userId: selectedUser.id, status: "ACTIVE" }) : setStatus("SELECT AN ACCOUNT FIRST")} disabled={selectedUser?.status === "ACTIVE"}/><ControlButton icon="ban" title="DISABLE ACCOUNT" description="Restrict account access." onClick={() => selectedUser ? void adminAction("set-status", { userId: selectedUser.id, status: "DISABLED" }) : setStatus("SELECT AN ACCOUNT FIRST")} disabled={selectedUser?.status === "DISABLED"}/><ControlButton icon="key" title="RESET PASSWORD" description="Generate a temporary password." onClick={() => selectedUser ? void adminAction("reset-password", { userId: selectedUser.id }) : setStatus("SELECT AN ACCOUNT FIRST")}/><ControlButton icon="shield" title="UPDATE ROLE" description="Modify user role and permissions." onClick={() => { if (!selectedUser) { setStatus("SELECT AN ACCOUNT FIRST"); return; } setNewRole(selectedUser.role); setModal("role"); }}/></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/20 bg-black p-5"><div className="flex items-center gap-3"><Icon name="users" size={34}/><div><p className="text-label text-white/50">ACTIVE ACCOUNTS</p><p className="text-display font-black">{counts.activeUsers.toLocaleString()}</p></div></div></div><div className="rounded-2xl border border-white/20 bg-black p-5"><div className="flex items-center gap-3"><Icon name="ban" size={34}/><div><p className="text-label text-white/50">DISABLED ACCOUNTS</p><p className="text-display font-black">{counts.disabledUsers.toLocaleString()}</p></div></div></div></div>
        </section>

        <footer className="flex flex-col gap-2 px-2 py-6 text-label font-black tracking-[0.14em] text-white/75 sm:flex-row sm:justify-between"><span>v1124 AUTH — ADMIN PANEL</span><span>SECURE <span className="mx-2">|</span> CONTROL <span className="mx-2">|</span> MANAGE</span></footer>
        <div className="min-h-5 text-center text-label font-black tracking-[0.14em] text-white/45">{status}</div>
      </div>

      {modal && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4" onMouseDown={() => { if (modal === "status" || modal === "credentials") setModal(null); }}>
        <div className="w-full max-w-xl rounded-3xl border border-white/20 bg-black p-6 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
          {modal === "user" && selectedUser && <><p className="text-body font-black tracking-[0.2em] text-white/55">USER ACCOUNT</p><h3 className="mt-2 text-display font-black">{selectedUser.username}</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{[["EMAIL",selectedUser.email],["STATUS",selectedUser.status],["ROLE",selectedUser.role],["CREATED",formatDate(selectedUser.createdAt)],["LAST LOGIN",formatDate(selectedUser.lastLoginAt)],["CHECKS",String(selectedUser.checkerStats?.checks || 0)]].map(([label,value])=><div key={label} className="rounded-xl border border-white/15 p-4"><p className="text-label font-black text-white/45">{label}</p><p className="mt-1 text-primary font-bold">{value}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void adminAction("set-status", { userId: selectedUser.id, status: selectedUser.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black">{selectedUser.status === "ACTIVE" ? "DISABLE" : "ENABLE"}</button><button onClick={() => void adminAction("reset-password", { userId: selectedUser.id })} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">RESET PASSWORD</button><button onClick={() => { setNewRole(selectedUser.role); setModal("role"); }} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black">UPDATE ROLE</button><button onClick={() => setModal(null)} className="ml-auto rounded-xl border border-white/30 px-4 py-3 text-micro font-black">CLOSE</button></div></>}
          {modal === "ticket" && selectedTicket && <><p className="text-body font-black tracking-[0.2em] text-white/55">PASSWORD RECOVERY</p><h3 className="mt-2 break-all text-display font-black">{selectedTicket.id}</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{[["USERNAME",selectedTicket.username],["EMAIL",selectedTicket.email],["STATUS",selectedTicket.status],["SUBMITTED",formatDate(selectedTicket.createdAt)],["PROCESSED",formatDate(selectedTicket.processedAt)]].map(([label,value])=><div key={label} className="rounded-xl border border-white/15 p-4"><p className="text-label font-black text-white/45">{label}</p><p className="mt-1 text-primary font-bold">{value}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-2"><button disabled={selectedTicket.status === "IN_REVIEW" || selectedTicket.status === "CLOSED"} onClick={() => void adminAction("set-ticket-status", { ticketId: selectedTicket.id, status: "IN_REVIEW" })} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black disabled:opacity-30">MARK IN REVIEW</button><button disabled={selectedTicket.status !== "OPEN" && selectedTicket.status !== "IN_REVIEW"} onClick={() => void adminAction("process-ticket", { ticketId: selectedTicket.id })} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black disabled:opacity-30">PROCESS & RESET PASSWORD</button><button disabled={selectedTicket.status === "CLOSED"} onClick={() => void adminAction("set-ticket-status", { ticketId: selectedTicket.id, status: "CLOSED" })} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black disabled:opacity-30">CLOSE</button><button onClick={() => setModal(null)} className="ml-auto rounded-xl border border-white/30 px-4 py-3 text-micro font-black">CLOSE</button></div></>}
          {modal === "role" && selectedUser && <><p className="text-body font-black tracking-[0.2em] text-white/55">ACCOUNT MANAGEMENT</p><h3 className="mt-2 text-display font-black">UPDATE ROLE</h3><p className="mt-2 text-body text-white/55">Change the role assigned to {selectedUser.username}.</p><select value={newRole} onChange={e => setNewRole(e.target.value as "USER" | "ADMIN")} className="mt-5 w-full rounded-xl border border-white/20 bg-black px-4 py-3 text-primary"><option value="USER">User</option><option value="ADMIN">Admin</option></select><div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(null)} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black">CANCEL</button><button onClick={async () => { const data = await adminAction("set-role", { userId: selectedUser.id, role: newRole }); if (data) setModal(null); }} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">SAVE ROLE</button></div></>}
          {modal === "status" && <SystemStatusModal onClose={() => setModal(null)} />}
          {modal === "credentials" && !temporaryPassword && <><p className="text-body font-black tracking-[0.2em] text-white/55">ADMIN ACCOUNT</p><h3 className="mt-2 text-display font-black">CHANGE PASSWORD</h3><div className="mt-5 grid gap-3"><input type="password" value={ownPassword.current} onChange={e => setOwnPassword(p => ({ ...p, current: e.target.value }))} placeholder="Current password" className="rounded-xl border border-white/15 bg-black px-4 py-3 text-primary outline-none"/><input type="password" value={ownPassword.next} onChange={e => setOwnPassword(p => ({ ...p, next: e.target.value }))} placeholder="New password (8+ characters)" className="rounded-xl border border-white/15 bg-black px-4 py-3 text-primary outline-none"/><input type="password" value={ownPassword.confirm} onChange={e => setOwnPassword(p => ({ ...p, confirm: e.target.value }))} placeholder="Confirm new password" className="rounded-xl border border-white/15 bg-black px-4 py-3 text-primary outline-none"/></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(null)} className="rounded-xl border border-white/30 px-4 py-3 text-micro font-black">CANCEL</button><button onClick={() => void saveOwnPassword()} className="rounded-xl bg-white px-4 py-3 text-micro font-black text-black">UPDATE PASSWORD</button></div></>}
          {modal === "credentials" && temporaryPassword && <><p className="text-body font-black tracking-[0.2em] text-white/55">TEMPORARY PASSWORD</p><h3 className="mt-2 text-display font-black">PASSWORD GENERATED</h3><p className="mt-3 text-body text-white/55">Give this temporary password to the account owner. They must change it after signing in.</p><div className="mt-5 rounded-xl border border-white/20 bg-black p-4 text-center font-mono text-primary font-bold tracking-[0.08em]">{temporaryPassword}</div><p className="mt-3 text-label font-black tracking-[0.1em] text-white/55">EMAIL DELIVERY: {delivery === "SENT" ? "SENT" : delivery === "NOT_CONFIGURED" ? "NOT CONFIGURED" : delivery === "FAILED" ? "FAILED" : delivery || "PENDING"}</p><button onClick={() => { navigator.clipboard?.writeText(temporaryPassword); setStatus("TEMPORARY PASSWORD COPIED"); }} className="mt-5 rounded-xl border border-white/30 px-4 py-3 text-micro font-black">COPY PASSWORD</button><button onClick={() => { setTemporaryPassword(""); setDelivery(""); setModal(null); }} className="ml-2 rounded-xl bg-white px-4 py-3 text-micro font-black text-black">DONE</button></>}
        </div>
      </div>}
    </main>
  );
}

function Pagination({ page, pages, setPage }: { page: number; pages: number; setPage: (page: number) => void }) {
  return <div className="flex items-center gap-1"><button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded-xl border border-white/20 px-4 py-3 text-body disabled:opacity-30">‹</button>{Array.from({ length: Math.min(pages, 6) }, (_, i) => i + 1).map(item => <button key={item} onClick={() => setPage(item)} className={`rounded-xl px-4 py-3 text-body font-black ${item === page ? "bg-white text-black" : "border border-white/20"}`}>{item}</button>)}{pages > 6 && <span className="px-1 text-body">…</span>}{pages > 6 && <button onClick={() => setPage(pages)} className="rounded-xl border border-white/20 px-4 py-3 text-micro font-black">{pages}</button>}<button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages} className="rounded-xl border border-white/20 px-4 py-3 text-body disabled:opacity-30">›</button></div>;
}

function ControlButton({ icon, title, description, onClick, disabled }: { icon: string; title: string; description: string; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="rounded-2xl border border-white/20 bg-black p-5 text-left transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"><div className="flex items-center gap-3"><Icon name={icon} size={29}/><div><p className="text-body font-black">{title}</p><p className="mt-1 text-label text-white/55">{description}</p></div></div></button>;
}

function SystemStatusModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch("/api/admin?resource=status", { cache: "no-store" }).then(r => r.json()).then(setData).catch(() => setData({ status: "UNAVAILABLE" })); }, []);
  return <><p className="text-body font-black tracking-[0.2em] text-white/55">SYSTEM STATUS</p><h3 className="mt-2 text-display font-black">{data?.status || "CHECKING"}</h3><div className="mt-5 space-y-2">{data ? <>{[["STORAGE",data.storage],["ADMIN",data.authenticatedAs],["USERS",String(data.counts?.users ?? 0)],["OPEN TICKETS",String(data.counts?.openTickets ?? 0)],["CHECKED AT",formatDate(data.timestamp)]].map(([label,value])=><div key={label} className="flex justify-between gap-4 rounded-xl border border-white/15 p-3 text-body"><span className="text-white/45">{label}</span><span className="font-bold">{value}</span></div>)}</> : <div className="rounded-xl border border-white/15 p-4 text-body text-white/50">Checking AUTH server status…</div>}</div><button onClick={onClose} className="mt-5 rounded-xl bg-white px-4 py-3 text-micro font-black text-black">CLOSE</button></>;
}

export default function AdminPage() {
  return <AuthGate returnTo="/admin"><AdminPanelContent /></AuthGate>;
}
