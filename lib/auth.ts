import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type UserRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "DISABLED";
export type RecoveryStatus = "OPEN" | "IN_REVIEW" | "PROCESSED" | "CLOSED";

export type StatSummary = { checked: number; manual: number; defects: number };
export type EngineStats = StatSummary & { runs: number; successful: number; failed: number };
export type CheckerStats = Record<"LINK" | "IMAGE" | "VIDEO" | "ULTIMATE", EngineStats>;
export type WorkstationStats = {
  ULTIMATE: EngineStats & {
    LINK: StatSummary;
    IMAGE: StatSummary;
    VIDEO: StatSummary;
  };
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  avatar: string;
  telegramId: string;
  telegramUsername?: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
  checkerStats: CheckerStats;
  workstationStats: WorkstationStats;
  role: UserRole;
  status: UserStatus;
  passwordMustChange?: boolean;
};

type Session = { tokenHash: string; userId: string; createdAt: string };
export type RecoveryTicket = {
  id: string;
  username: string;
  email: string;
  telegramId: string;
  telegramUsername?: string;
  createdAt: string;
  status: RecoveryStatus;
  processedAt?: string;
};
type TelegramLinkSession = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  status: "PENDING" | "LINKED" | "USED";
  telegramId?: string;
  telegramUsername?: string;
};
type AuthStore = {
  users: AuthUser[];
  sessions: Session[];
  recoveryTickets: RecoveryTicket[];
  telegramLinkSessions: TelegramLinkSession[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "auth.json");
const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "admin@v1124.local";
const ADMIN_PASSWORD = "admin";
const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000;

function emptyEngineStats(): EngineStats {
  return { runs: 0, checked: 0, manual: 0, defects: 0, successful: 0, failed: 0 };
}

function emptyCheckerStats(): CheckerStats {
  return {
    LINK: emptyEngineStats(),
    IMAGE: emptyEngineStats(),
    VIDEO: emptyEngineStats(),
    ULTIMATE: emptyEngineStats(),
  };
}

function emptyWorkstationStats(): WorkstationStats {
  return {
    ULTIMATE: {
      ...emptyEngineStats(),
      LINK: { checked: 0, manual: 0, defects: 0 },
      IMAGE: { checked: 0, manual: 0, defects: 0 },
      VIDEO: { checked: 0, manual: 0, defects: 0 },
    },
  };
}

function normalizeSummary(value: any): StatSummary {
  return {
    checked: Number(value?.checked || 0),
    manual: Number(value?.manual || 0),
    defects: Number(value?.defects || 0),
  };
}

function normalizeEngineStats(value: any): EngineStats {
  return {
    ...normalizeSummary(value),
    runs: Number(value?.runs || 0),
    successful: Number(value?.successful || 0),
    failed: Number(value?.failed || 0),
  };
}

function normalizeCheckerStats(value: any): CheckerStats {
  const legacyChecks = Number(value?.checks || 0);
  const base = emptyCheckerStats();
  const next = {
    LINK: normalizeEngineStats(value?.LINK),
    IMAGE: normalizeEngineStats(value?.IMAGE),
    VIDEO: normalizeEngineStats(value?.VIDEO),
    ULTIMATE: normalizeEngineStats(value?.ULTIMATE),
  };
  if (legacyChecks && !Object.values(next).some(item => item.runs || item.checked || item.defects)) {
    next.LINK.checked = legacyChecks;
  }
  return next;
}

function normalizeWorkstationStats(value: any): WorkstationStats {
  const base = emptyWorkstationStats();
  const ultimate = normalizeEngineStats(value?.ULTIMATE);
  return {
    ULTIMATE: {
      ...ultimate,
      LINK: normalizeSummary(value?.ULTIMATE?.LINK),
      IMAGE: normalizeSummary(value?.ULTIMATE?.IMAGE),
      VIDEO: normalizeSummary(value?.ULTIMATE?.VIDEO),
    },
  };
}

export function recordCheckerStats(
  userId: string,
  category: "LINK" | "IMAGE" | "VIDEO" | "ULTIMATE",
  outcome: "success" | "failed",
  summary?: StatSummary
) {
  const store = readStore();
  const user = store.users.find(item => item.id === userId);
  if (!user) throw new Error("ACCOUNT NOT FOUND.");

  const stat = user.checkerStats[category];
  stat.runs += 1;
  if (outcome === "success") {
    stat.successful += 1;
    if (summary) {
      stat.checked += Number(summary.checked || 0);
      stat.manual += Number(summary.manual || 0);
      stat.defects += Number(summary.defects || 0);
    }
  } else {
    stat.failed += 1;
  }

  writeStore(store);
  return user;
}

export function recordWorkstationUltimateStats(
  userId: string,
  outcome: "success" | "failed",
  summary?: {
    LINK: StatSummary;
    IMAGE: StatSummary;
    VIDEO: StatSummary;
  }
) {
  const store = readStore();
  const user = store.users.find(item => item.id === userId);
  if (!user) throw new Error("ACCOUNT NOT FOUND.");

  const stat = user.workstationStats.ULTIMATE;
  stat.runs += 1;
  if (outcome === "success") {
    stat.successful += 1;
    if (summary) {
      stat.LINK.checked += Number(summary.LINK?.checked || 0);
      stat.LINK.manual += Number(summary.LINK?.manual || 0);
      stat.LINK.defects += Number(summary.LINK?.defects || 0);
      stat.IMAGE.checked += Number(summary.IMAGE?.checked || 0);
      stat.IMAGE.manual += Number(summary.IMAGE?.manual || 0);
      stat.IMAGE.defects += Number(summary.IMAGE?.defects || 0);
      stat.VIDEO.checked += Number(summary.VIDEO?.checked || 0);
      stat.VIDEO.manual += Number(summary.VIDEO?.manual || 0);
      stat.VIDEO.defects += Number(summary.VIDEO?.defects || 0);
      stat.checked = stat.LINK.checked + stat.IMAGE.checked + stat.VIDEO.checked;
      stat.manual = stat.LINK.manual + stat.IMAGE.manual + stat.VIDEO.manual;
      stat.defects = stat.LINK.defects + stat.IMAGE.defects + stat.VIDEO.defects;
    }
  } else {
    stat.failed += 1;
  }

  writeStore(store);
  return user;
}

function emptyStore(): AuthStore {
  return { users: [], sessions: [], recoveryTickets: [], telegramLinkSessions: [] };
}

function writeStore(store: AuthStore) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temp, DATA_FILE);
}

function readStore(): AuthStore {
  let store: AuthStore;
  try {
    store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as AuthStore;
  } catch {
    store = emptyStore();
  }

  let changed = false;
  store.users = Array.isArray(store.users)
    ? store.users.map((user: any) => {
        const next = {
          ...user,
          role: user?.role === "ADMIN" ? "ADMIN" : "USER",
          status: user?.status === "DISABLED" ? "DISABLED" : "ACTIVE",
          checkerStats: normalizeCheckerStats(user?.checkerStats),
          workstationStats: normalizeWorkstationStats(user?.workstationStats),
          email: typeof user?.email === "string" ? user.email : "",
          avatar: typeof user?.avatar === "string" ? user.avatar : "",
          telegramId: typeof user?.telegramId === "string" ? user.telegramId : "",
          telegramUsername: typeof user?.telegramUsername === "string" ? user.telegramUsername : undefined,
        } as AuthUser;
        if (
          next.role !== user?.role ||
          next.status !== user?.status ||
          !user?.checkerStats ||
          !user?.workstationStats ||
          typeof user?.telegramId !== "string"
        ) changed = true;
        return next;
      })
    : [];
  store.sessions = Array.isArray(store.sessions) ? store.sessions : [];
  store.recoveryTickets = Array.isArray(store.recoveryTickets)
    ? store.recoveryTickets.map((ticket: any) => ({
        ...ticket,
        email: typeof ticket?.email === "string" ? ticket.email : "",
        telegramId: typeof ticket?.telegramId === "string" ? ticket.telegramId : "",
        telegramUsername: typeof ticket?.telegramUsername === "string" ? ticket.telegramUsername : undefined,
      }))
    : [];
  store.telegramLinkSessions = Array.isArray(store.telegramLinkSessions) ? store.telegramLinkSessions : [];

  if (!store.recoveryTickets.every(ticket => ["OPEN", "IN_REVIEW", "PROCESSED", "CLOSED"].includes(ticket.status))) {
    store.recoveryTickets = store.recoveryTickets.map(ticket => ({
      ...ticket,
      status: ticket.status === "PROCESSED" ? "PROCESSED" : "OPEN",
    }));
    changed = true;
  }

  if (!store.users.some(user => user.role === "ADMIN")) {
    store.users.push({
  id: crypto.randomUUID(),
  username: ADMIN_USERNAME,
  email: ADMIN_EMAIL,
  telegramId: "",
  passwordHash: hashPassword(ADMIN_PASSWORD),
  createdAt: new Date().toISOString(),
  avatar: "",
  checkerStats: emptyCheckerStats(),
  workstationStats: emptyWorkstationStats(),
  role: "ADMIN",
  status: "ACTIVE",
});
    changed = true;
  }

  if (changed) writeStore(store);
  return store;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar || "",
    telegramId: user.telegramId || null,
    telegramUsername: user.telegramUsername || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    checkerStats: user.checkerStats,
    workstationStats: user.workstationStats,
    role: user.role,
    status: user.status,
    passwordMustChange: !!user.passwordMustChange,
  };
}

export function updateUserAvatar(userId: string, avatar: string) {
  const store = readStore();
  const user = store.users.find(item => item.id === userId);
  if (!user) throw new Error("ACCOUNT NOT FOUND.");
  user.avatar = typeof avatar === "string" ? avatar : "";
  writeStore(store);
  return user;
}

export function startTelegramLink() {
  const store = readStore();
  const code = `TG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const session: TelegramLinkSession = {
    id: crypto.randomUUID(),
    code,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TELEGRAM_LINK_TTL_MS).toISOString(),
    status: "PENDING",
  };
  store.telegramLinkSessions = store.telegramLinkSessions.filter(item => new Date(item.expiresAt).getTime() > Date.now());
  store.telegramLinkSessions.push(session);
  writeStore(store);
  return { id: session.id, code: session.code, expiresAt: session.expiresAt };
}

export function completeTelegramLink(code: string, telegramId: string, telegramUsername?: string) {
  const store = readStore();
  const session = store.telegramLinkSessions.find(item => item.code === code && item.status === "PENDING");
  if (!session) throw new Error("TELEGRAM LINK CODE IS INVALID OR EXPIRED.");
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    session.status = "USED";
    writeStore(store);
    throw new Error("TELEGRAM LINK CODE IS INVALID OR EXPIRED.");
  }

  const normalizedTelegramId = String(telegramId).trim();
  if (!/^\d+$/.test(normalizedTelegramId)) throw new Error("INVALID TELEGRAM ID.");
  if (store.users.some(user => user.telegramId === normalizedTelegramId)) {
    throw new Error("THIS TELEGRAM ACCOUNT IS ALREADY LINKED TO AN AUTH ACCOUNT.");
  }

  session.status = "LINKED";
  session.telegramId = normalizedTelegramId;
  session.telegramUsername = telegramUsername?.trim() || "";
  writeStore(store);
  return {
    linkId: session.id,
    telegramId: normalizedTelegramId,
    telegramUsername: session.telegramUsername || null,
  };
}

export function getTelegramLinkStatus(linkId: string) {
  const store = readStore();
  const session = store.telegramLinkSessions.find(item => item.id === linkId);
  if (!session) throw new Error("TELEGRAM LINK SESSION NOT FOUND.");
  if (session.status === "PENDING" && new Date(session.expiresAt).getTime() <= Date.now()) {
    session.status = "USED";
    writeStore(store);
    throw new Error("TELEGRAM LINK CODE IS INVALID OR EXPIRED.");
  }
  return {
    status: session.status,
    telegramId: session.telegramId || null,
    telegramUsername: session.telegramUsername || null,
    expiresAt: session.expiresAt,
  };
}

export function createUser(username: string, password: string, telegramId: string, telegramUsername?: string) {
  const store = readStore();
  const normalizedUsername = normalizeUsername(username);
  const normalizedTelegramId = String(telegramId || "").trim();

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim())) {
    throw new Error("USERNAME MUST BE 3–32 CHARACTERS AND USE LETTERS, NUMBERS, _, ., OR -.");
  }
  if (password.length < 8) throw new Error("PASSWORD MUST BE AT LEAST 8 CHARACTERS.");
  if (!/^\d+$/.test(normalizedTelegramId)) throw new Error("TELEGRAM MUST BE CONNECTED.");
  if (store.users.some(u => normalizeUsername(u.username) === normalizedUsername)) {
    throw new Error("USERNAME IS ALREADY IN USE.");
  }
  if (store.users.some(u => u.telegramId === normalizedTelegramId)) {
    throw new Error("THIS TELEGRAM ACCOUNT IS ALREADY LINKED TO AN AUTH ACCOUNT.");
  }

  const user: AuthUser = {
    id: crypto.randomUUID(),
    username: username.trim(),
    email: "",
    avatar: "",
    telegramId: normalizedTelegramId,
    telegramUsername: telegramUsername?.trim() || "",
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    checkerStats: emptyCheckerStats(),
    workstationStats: emptyWorkstationStats(),
    role: "USER",
    status: "ACTIVE",
  };

  store.users.push(user);
  store.telegramLinkSessions = store.telegramLinkSessions.map(item =>
    item.telegramId === normalizedTelegramId && item.status === "LINKED"
      ? { ...item, status: "USED" }
      : item
  );
  writeStore(store);
  return user;
}

export function authenticate(username: string, password: string) {
  const store = readStore();
  const user = store.users.find(u => normalizeUsername(u.username) === normalizeUsername(username));
  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("INVALID USERNAME OR PASSWORD.");
  if (user.status === "DISABLED") throw new Error("ACCOUNT IS DISABLED.");
  user.lastLoginAt = new Date().toISOString();
  writeStore(store);
  return user;
}

export function createSession(userId: string) {
  const store = readStore();
  const token = crypto.randomBytes(48).toString("base64url");
  store.sessions = store.sessions.filter(s => s.userId !== userId);
  store.sessions.push({ tokenHash: hashToken(token), userId, createdAt: new Date().toISOString() });
  writeStore(store);
  return token;
}

export function getUserBySession(token: string | undefined) {
  if (!token) return null;
  const store = readStore();
  const session = store.sessions.find(s => s.tokenHash === hashToken(token));
  if (!session) return null;
  const user = store.users.find(u => u.id === session.userId) || null;
  if (user?.status === "DISABLED") return null;
  return user;
}

export function getAdminBySession(token: string | undefined) {
  const user = getUserBySession(token);
  return user?.role === "ADMIN" ? user : null;
}

export function deleteSession(token: string | undefined) {
  if (!token) return;
  const store = readStore();
  store.sessions = store.sessions.filter(s => s.tokenHash !== hashToken(token));
  writeStore(store);
}

export function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const store = readStore();
  const user = store.users.find(u => u.id === userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) throw new Error("CURRENT PASSWORD IS INCORRECT.");
  if (newPassword.length < 8) throw new Error("NEW PASSWORD MUST BE AT LEAST 8 CHARACTERS.");
  user.passwordHash = hashPassword(newPassword);
  user.passwordMustChange = false;
  writeStore(store);
  return user;
}

export function createRecoveryTicket(username: string) {
  const store = readStore();
  const user = store.users.find(u => normalizeUsername(u.username) === normalizeUsername(username));
  if (!user) throw new Error("ACCOUNT NOT FOUND.");
  if (user.status === "DISABLED") throw new Error("ACCOUNT IS DISABLED.");
  if (!user.telegramId) throw new Error("NO TELEGRAM ACCOUNT IS LINKED TO THIS ACCOUNT.");

  const ticket: RecoveryTicket = {
    id: crypto.randomUUID(),
    username: user.username,
    email: "",
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername || "",
    createdAt: new Date().toISOString(),
    status: "OPEN",
  };

  store.recoveryTickets.push(ticket);
  writeStore(store);
  return ticket;
}

export function listAdminUsers() {
  const store = readStore();
  return store.users
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(publicUser);
}

export function listRecoveryTickets() {
  const store = readStore();
  return store.recoveryTickets
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function requireUser(store: AuthStore, userId: string) {
  const user = store.users.find(item => item.id === userId);
  if (!user) throw new Error("USER NOT FOUND.");
  return user;
}

export function setUserStatus(userId: string, status: UserStatus, actingAdminId: string) {
  const store = readStore();
  const user = requireUser(store, userId);
  if (user.id === actingAdminId && status === "DISABLED") throw new Error("YOU CANNOT DISABLE YOUR OWN ADMIN ACCOUNT.");
  user.status = status;
  if (status === "ACTIVE") user.passwordMustChange = !!user.passwordMustChange;
  writeStore(store);
  return publicUser(user);
}

export function setUserRole(userId: string, role: UserRole, actingAdminId: string) {
  const store = readStore();
  const user = requireUser(store, userId);
  if (user.id === actingAdminId && role !== "ADMIN") throw new Error("YOU CANNOT REMOVE YOUR OWN ADMIN ROLE.");
  if (role !== "ADMIN" && !store.users.some(item => item.id !== user.id && item.role === "ADMIN" && item.status === "ACTIVE")) {
    throw new Error("AT LEAST ONE ACTIVE ADMIN ACCOUNT IS REQUIRED.");
  }
  user.role = role;
  writeStore(store);
  return publicUser(user);
}

export function prepareUserPasswordReset(userId: string, actingAdminId: string) {
  const store = readStore();
  const user = requireUser(store, userId);
  if (user.id === actingAdminId) throw new Error("USE YOUR ACCOUNT PASSWORD SETTINGS TO CHANGE YOUR OWN PASSWORD.");
  if (!user.telegramId) throw new Error("NO TELEGRAM ACCOUNT IS LINKED TO THIS ACCOUNT.");
  return {
    userId: user.id,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername || "",
    username: user.username,
    temporaryPassword: `v1124-${crypto.randomBytes(5).toString("hex")}`,
  };
}

export function commitUserPasswordReset(userId: string, temporaryPassword: string, actingAdminId: string) {
  const store = readStore();
  const user = requireUser(store, userId);
  if (user.id === actingAdminId) throw new Error("USE YOUR ACCOUNT PASSWORD SETTINGS TO CHANGE YOUR OWN PASSWORD.");
  if (!user.telegramId) throw new Error("NO TELEGRAM ACCOUNT IS LINKED TO THIS ACCOUNT.");
  user.passwordHash = hashPassword(temporaryPassword);
  user.passwordMustChange = true;
  store.sessions = store.sessions.filter(session => session.userId !== user.id);
  writeStore(store);
  return { user: publicUser(user), temporaryPassword };
}

export function resetUserPassword(userId: string, actingAdminId: string) {
  const prepared = prepareUserPasswordReset(userId, actingAdminId);
  return commitUserPasswordReset(prepared.userId, prepared.temporaryPassword, actingAdminId);
}

export function setRecoveryTicketStatus(ticketId: string, status: RecoveryStatus) {
  const store = readStore();
  const ticket = store.recoveryTickets.find(item => item.id === ticketId);
  if (!ticket) throw new Error("RECOVERY TICKET NOT FOUND.");
  ticket.status = status;
  if (status === "PROCESSED" || status === "CLOSED") ticket.processedAt = ticket.processedAt || new Date().toISOString();
  writeStore(store);
  return ticket;
}

export function prepareRecoveryTicketPasswordReset(ticketId: string, actingAdminId: string) {
  const store = readStore();
  const ticket = store.recoveryTickets.find(item => item.id === ticketId);
  if (!ticket) throw new Error("RECOVERY TICKET NOT FOUND.");
  if (ticket.status !== "OPEN" && ticket.status !== "IN_REVIEW") throw new Error("RECOVERY TICKET IS ALREADY CLOSED.");

  const user = store.users.find(item => normalizeUsername(item.username) === normalizeUsername(ticket.username));
  if (!user) throw new Error("ACCOUNT FOR THIS TICKET WAS NOT FOUND.");
  if (user.id === actingAdminId) throw new Error("USE YOUR ACCOUNT PASSWORD SETTINGS TO CHANGE YOUR OWN PASSWORD.");
  if (!user.telegramId) throw new Error("NO TELEGRAM ACCOUNT IS LINKED TO THIS ACCOUNT.");

  return {
    ticketId: ticket.id,
    userId: user.id,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername || "",
    username: user.username,
    temporaryPassword: `v1124-${crypto.randomBytes(5).toString("hex")}`,
  };
}

export function commitRecoveryTicketPasswordReset(ticketId: string, temporaryPassword: string, actingAdminId: string) {
  const store = readStore();
  const ticket = store.recoveryTickets.find(item => item.id === ticketId);
  if (!ticket) throw new Error("RECOVERY TICKET NOT FOUND.");
  if (ticket.status !== "OPEN" && ticket.status !== "IN_REVIEW") throw new Error("RECOVERY TICKET IS ALREADY CLOSED.");

  const user = store.users.find(item => normalizeUsername(item.username) === normalizeUsername(ticket.username));
  if (!user) throw new Error("ACCOUNT FOR THIS TICKET WAS NOT FOUND.");
  if (user.id === actingAdminId) throw new Error("USE YOUR ACCOUNT PASSWORD SETTINGS TO CHANGE YOUR OWN PASSWORD.");
  if (!user.telegramId) throw new Error("NO TELEGRAM ACCOUNT IS LINKED TO THIS ACCOUNT.");

  user.passwordHash = hashPassword(temporaryPassword);
  user.passwordMustChange = true;
  ticket.status = "PROCESSED";
  ticket.processedAt = new Date().toISOString();
  store.sessions = store.sessions.filter(session => session.userId !== user.id);
  writeStore(store);
  return { ticket, user: publicUser(user), temporaryPassword };
}

export function processRecoveryTicket(ticketId: string, actingAdminId: string) {
  const prepared = prepareRecoveryTicketPasswordReset(ticketId, actingAdminId);
  return commitRecoveryTicketPasswordReset(prepared.ticketId, prepared.temporaryPassword, actingAdminId);
}
