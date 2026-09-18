import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.V1124_WORKSTATION_PORT || 18724);
const sessions = new Map();
const reports = new Map();
const checkerJobs = new Map();
const extractorJobs = new Map();
const SOURCE_DIR = process.env.V1124_WORKSTATION_SOURCES || ".v1124-workstation/sources";
const WORKSPACE_DIR = process.env.V1124_WORKSTATION_WORKSPACES || ".v1124-workstation/workspaces";
const ACCOUNT_DIR = process.env.V1124_WORKSTATION_ACCOUNT_DIR || ".v1124-workstation/account";
const ACCOUNT_PATH = process.env.V1124_WORKSTATION_ACCOUNT || path.join(ACCOUNT_DIR, "account.json");
const LEGACY_ACCOUNT_PATH = ".v1124-workstation/account.json";
const INSTRUCTION_SOURCE_PATH = new URL("./1. Project Instructions.txt", import.meta.url);
const EXTRACTOR_PATHS = {
  "testio-overview": new URL("./Test IO Overview Extractor v1124.txt", import.meta.url),
  "testio-new-bugs": new URL("./Test IO New Bugs Extractor v1124.txt", import.meta.url),
  "testio-known-bugs": new URL("./Test IO Known Bugs Extractor v1124.txt", import.meta.url),
  "testio-my-bugs": new URL("./Test IO My Bugs Extractor v1124.txt", import.meta.url),
  "testio-my-reproduction": new URL("./Test IO My Reproduction Extractor v1124.txt", import.meta.url),
  "testio-chat": new URL("./Test IO Chat Extractor v1124.txt", import.meta.url),
  "testio-academy": new URL("./Test IO Academy Extractor v1124.txt", import.meta.url),
  "testio-single-academy": new URL("./Test IO Single Academy Extractor v1124.txt", import.meta.url),
  "utest-overview": new URL("./uTest Overview Extractor v1124.txt", import.meta.url),
  "utest-issues": new URL("./uTest Issues Extractor v1124.txt", import.meta.url),
  "utest-testcases": new URL("./uTest Test Cases Extractor v1124.txt", import.meta.url),
  "utest-academy": new URL("./uTest Academy Extractor v1124.txt", import.meta.url),
};
const CHECKER_SOURCE_PATH = new URL("./Website Defect Checker v1124.txt", import.meta.url);

const BUILTIN_EXTRACTOR_HOST_RULES = {
  "testio-overview": host => host === "test.io" || host.endsWith(".test.io"),
  "testio-new-bugs": host => host === "test.io" || host.endsWith(".test.io"),
  "testio-known-bugs": host => host === "test.io" || host.endsWith(".test.io"),
  "testio-my-bugs": host => host === "test.io" || host.endsWith(".test.io"),
  "testio-my-reproduction": host => host === "test.io" || host.endsWith(".test.io"),
  "testio-chat": host => host === "test.io" || host.endsWith(".test.io"),
  "testio-academy": host => host === "academy.test.io",
  "testio-single-academy": host => host === "academy.test.io",
  "utest-overview": host => host === "utest.com" || host.endsWith(".utest.com"),
  "utest-issues": host => host === "utest.com" || host.endsWith(".utest.com"),
  "utest-testcases": host => host === "utest.com" || host.endsWith(".utest.com"),
  "utest-academy": host => host === "academy.utest.com" || host === "utest.com" || host.endsWith(".utest.com"),
};

function extractorPageCompatibilityError(extractor, pageUrl) {
  const rule = BUILTIN_EXTRACTOR_HOST_RULES[extractor];
  if (!rule) return null;
  let host = "";
  try { host = new URL(pageUrl).hostname.toLowerCase(); } catch {}
  return rule(host) ? null : "The selected extractor cannot run on the current page.";
}
const REPORTS_DIR = process.env.V1124_WORKSTATION_REPORTS
  ? process.env.V1124_WORKSTATION_REPORTS
  : ".v1124-workstation/reports";

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type, x-v1124-device, x-v1124-workspace-id",
  });
  res.end(JSON.stringify(body));
}

function profileDir(browser) {
  return process.env.V1124_WORKSTATION_PROFILE_ROOT
    ? `${process.env.V1124_WORKSTATION_PROFILE_ROOT}/${browser}`
    : `.v1124-workstation/${browser}`;
}

const DOWNLOAD_ROOT = process.env.V1124_WORKSTATION_DOWNLOADS || ".v1124-workstation/downloads";
const OS_DOWNLOADS_ROOT = process.env.V1124_WORKSTATION_OS_DOWNLOADS || path.join(os.homedir(), "Downloads");

function browserDownloadDir(browser) {
  return `${DOWNLOAD_ROOT}/${browser}`;
}


function evidenceDownloadCategory(fileName) {
  const extension = String(fileName || "").toLowerCase().split(".").pop() || "";
  if (["jpg", "jpeg", "png"].includes(extension)) return "IMAGE";
  if (extension === "mp4") return "VIDEO";
  if (["log", "chls", "chlsj", "chlz"].includes(extension)) return "LOG";
  return null;
}

function evidenceDownloadFolder(browser, category) {
  const folder = category === "IMAGE" ? "screenshots" : category === "VIDEO" ? "screencasts" : "logs";
  return `${browserDownloadDir(browser)}/evidence/${folder}`;
}

async function queueBrowserDownload(browser, session, sourcePath, fileName) {
  const name = String(fileName || "").trim();
  const category = evidenceDownloadCategory(name);
  if (!category) return false;
  const absoluteSource = String(sourcePath || "");
  if (!absoluteSource) return false;
  const seenKey = absoluteSource;
  if (session.downloadSeen?.has(seenKey)) return false;
  session.downloadSeen ||= new Set();
  session.downloadSeen.add(seenKey);

  try {
    const stat = await fs.stat(absoluteSource);
    if (!stat.isFile()) return false;
    const data = await fs.readFile(absoluteSource);
    const type = name.toLowerCase().endsWith(".mp4") ? "video/mp4"
      : name.toLowerCase().endsWith(".png") ? "image/png"
      : name.toLowerCase().match(/\.(jpe?g)$/i) ? "image/jpeg"
      : "application/octet-stream";

    const targetDir = evidenceDownloadFolder(browser, category);
    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = `${targetDir}/${name}`;
    await fs.writeFile(targetPath, data);
    if (targetPath !== absoluteSource) await fs.unlink(absoluteSource).catch(() => {});

    session.downloads ||= [];
    session.downloads.push({
      id: crypto.randomUUID(),
      name,
      category,
      createdAt: new Date().toISOString(),
      type,
      size: stat.size,
      dataUrl: `data:${type};base64,${data.toString("base64")}`,
      savedPath: targetPath,
    });
    return true;
  } catch {
    return false;
  }
}

async function scanBrowserDownloadDirectory(browser, session, dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (name.endsWith(".crdownload") || name.endsWith(".part") || name.endsWith(".tmp")) continue;
      const category = evidenceDownloadCategory(name);
      if (!category) continue;
      const sourcePath = path.join(dir, name);
      const seenKey = sourcePath;
      if (session.downloadSeen?.has(seenKey)) continue;
      const stat = await fs.stat(sourcePath).catch(() => null);
      if (!stat?.isFile()) continue;
      if (session.downloadBaseline?.has(seenKey) && stat.mtimeMs <= session.startedAt) continue;
      await queueBrowserDownload(browser, session, sourcePath, name);
    }
  } catch {}
}

async function scanBrowserDownloads(browser, session) {
  await scanBrowserDownloadDirectory(browser, session, browserDownloadDir(browser));
  await scanBrowserDownloadDirectory(browser, session, OS_DOWNLOADS_ROOT);
}

async function captureDownloadBaseline(session) {
  session.downloadBaseline = new Set();
  try {
    const entries = await fs.readdir(OS_DOWNLOADS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) session.downloadBaseline.add(path.join(OS_DOWNLOADS_ROOT, entry.name));
    }
  } catch {}
}

function startBrowserDownloadWatcher(browser, session) {
  if (session.downloadWatcher) clearInterval(session.downloadWatcher);
  session.downloadWatcher = setInterval(() => { void scanBrowserDownloads(browser, session); }, 500);
  void scanBrowserDownloads(browser, session);
}

async function persistReport(report) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(
    `${REPORTS_DIR}/${report.id}.json`,
    JSON.stringify(report),
    "utf8"
  );
}

function workspaceIdFromRequest(req) {
  const id = String(req.headers["x-v1124-workspace-id"] || "").trim();
  return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : "";
}
function workspaceSourceDir(workspaceId) { return `${WORKSPACE_DIR}/${workspaceId}/sources`; }
async function persistWorkspace(workspace) {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  await fs.writeFile(`${WORKSPACE_DIR}/${workspace.id}.json`, JSON.stringify(workspace), "utf8");
}
async function loadWorkspaces() {
  try {
    const names = await fs.readdir(WORKSPACE_DIR); const result=[];
    for(const name of names.filter(n=>n.endsWith(".json"))){ try { const ws=JSON.parse(await fs.readFile(`${WORKSPACE_DIR}/${name}`,"utf8")); if(ws?.id&&ws?.name) result.push(ws); } catch {} }
    return result.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  } catch { return []; }
}
async function loadWorkspace(id) {
  try { return JSON.parse(await fs.readFile(`${WORKSPACE_DIR}/${id}.json`, "utf8")); } catch { return null; }
}

const DEFAULT_ACCOUNT = {
  tier: "PRO",
  profile: { name: "v1124 User", email: "user@example.com", avatar: "", createdAt: new Date().toISOString() },
  preferences: { browser: true, signals: true, extractors: true, evidence: true, sources: true, checker: true },
  stats: { workspacesCreated: 0 },
};

async function loadAccount() {
  try { return JSON.parse(await fs.readFile(ACCOUNT_PATH, "utf8")); } catch {
    try {
      const legacy = JSON.parse(await fs.readFile(LEGACY_ACCOUNT_PATH, "utf8"));
      await persistAccount(legacy);
      return legacy;
    } catch {}
    const existingWorkspaces = await loadWorkspaces();
    const initial = { ...DEFAULT_ACCOUNT, stats: { workspacesCreated: existingWorkspaces.length } };
    await persistAccount(initial);
    return initial;
  }
}
async function persistAccount(account) {
  await fs.mkdir(path.dirname(ACCOUNT_PATH), { recursive: true });
  await fs.writeFile(ACCOUNT_PATH, JSON.stringify(account, null, 2), "utf8");
}

async function persistSource(source, workspaceId="") {
  const dir = workspaceId ? workspaceSourceDir(workspaceId) : SOURCE_DIR;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(`${dir}/${source.id}.json`, JSON.stringify(source), "utf8");
}

async function loadSources(workspaceId="") {
  const dir = workspaceId ? workspaceSourceDir(workspaceId) : SOURCE_DIR;
  try {
    const names = await fs.readdir(dir);
    const result = [];
    for (const name of names.filter(name => name.endsWith(".json"))) {
      try { result.push(JSON.parse(await fs.readFile(`${dir}/${name}`, "utf8"))); } catch {}
    }
    return result.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch { return []; }
}

function builtInInstructionSource() {
  return {
    id: "platform-project-instruction",
    name: "1. Project Instructions.txt",
    kind: "INSTRUCTIONS",
    createdAt: "",
    origin: "v1124 built-in project instruction"
  };
}

function deriveMasterName(fileNames) {
  const first = Array.isArray(fileNames) && fileNames.length ? String(fileNames[0] || "") : "";
  const base = first.replace(/\.json$/i, "");
  const parts = base.split(/[-_]+/).map(part => part.trim()).filter(Boolean);
  const prefix = parts.slice(0, 2).join("-");
  const safe = prefix.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "MASTER"}-Master.json`;
}

async function loadPersistedReport(id) {
  try {
    const raw = await fs.readFile(`${REPORTS_DIR}/${id}.json`, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getActivePage(session, options = {}) {
  const requireActive = options.requireActive === true;

  const pages = session.context.pages().filter(page => !page.isClosed());

  if (!pages.length) {
    return null;
  }

  const fallback =
    pages.includes(session.page) && !session.page.isClosed()
      ? session.page
      : pages[0];

  if (
    session.browserName !== "chrome" ||
    !Number.isInteger(session.activeTabId)
  ) {
    if (requireActive && session.browserName === "chrome") {
      return null;
    }

    session.page = fallback;
    return fallback;
  }

  const wantedTabId = String(session.activeTabId);

  for (const page of pages) {
    const tabId = await page.evaluate(() => {
      return document.documentElement?.getAttribute("data-v1124-tab-id") || "";
    }).catch(() => "");

    if (tabId === wantedTabId) {
      session.page = page;
      return page;
    }
  }

  if (requireActive) {
    return null;
  }

  session.page = fallback;
  return fallback;
}

async function launch(browserName, url, incognito = false) {
  const targetUrl =
    typeof url === "string" && url.trim() && url.trim() !== "about:blank"
      ? url.trim()
      : null;

  const old = sessions.get(browserName);

  if (old) {
    try {
      if (old.incognito === incognito) {
        const page = await getActivePage(old);
        if (!page) {
          throw new Error("No usable browser page.");
        }

        await page.bringToFront();

        if (targetUrl && page.url() !== targetUrl) {
          await page
            .goto(targetUrl, { waitUntil: "domcontentloaded" })
            .catch(() => {});
        }

        old.page = page;
        startBrowserDownloadWatcher(browserName, old);
        return old;
      }
    } catch {}

    await old.context.close().catch(() => {});
    sessions.delete(browserName);
  }

  const chromiumOptions = {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    downloadsPath: browserDownloadDir(browserName),
    args: [
      "--window-position=80,60",
      "--window-size=1440,900",
      `--disable-extensions-except=${path.resolve(
        process.cwd(),
        "active-tab-extension"
      )}`,
      `--load-extension=${path.resolve(
        process.cwd(),
        "active-tab-extension"
      )}`,
    ],
  };

  let context;

  if (incognito) {
    if (browserName === "firefox") {
      const browser = await firefox.launch({
        headless: false,
        viewport: null,
        downloadsPath: browserDownloadDir(browserName),
      });

      context = await browser.newContext({
        viewport: null,
        acceptDownloads: true,
      });
    } else if (browserName === "edge") {
      const browser = await chromium.launch({
        ...chromiumOptions,
        channel: "msedge",
      });

      context = await browser.newContext({
        viewport: null,
        acceptDownloads: true,
      });
    } else {
      const browser = await chromium.launch(chromiumOptions);

      context = await browser.newContext({
        viewport: null,
        acceptDownloads: true,
      });
    }
    } else if (browserName === "firefox") {
    context = await firefox.launchPersistentContext(
      profileDir(browserName),
      {
        headless: false,
        viewport: null,
        acceptDownloads: true,
        downloadsPath: browserDownloadDir(browserName),
        firefoxUserPrefs: {
          "browser.startup.page": 3,
          "browser.sessionstore.resume_from_crash": true,
        },
      }
    );
  } else if (browserName === "edge") {
    context = await chromium.launchPersistentContext(
      profileDir(browserName),
      {
        ...chromiumOptions,
        channel: "msedge",
        args: [
          ...chromiumOptions.args,
          "--restore-last-session",
        ],
      }
    );
  } else {
    // Chrome
    context = await chromium.launchPersistentContext(
      profileDir(browserName),
      {
        ...chromiumOptions,
        args: [
          ...chromiumOptions.args,
          "--restore-last-session",
        ],
      }
    );
  }

  const page =
    context.pages().find(candidate => !candidate.isClosed()) ??
    await context.newPage();

  const session = {
    context,
    page,
    browserName,
    activeTabId: null,
    activeWindowId: null,
    downloads: [],
    downloadSeen: new Set(),
    downloadBaseline: new Set(),
    downloadWatcher: null,
    startedAt: Date.now(),
  };

  session.incognito = incognito;

  // Register the session before waiting for the Chrome extension to report
  // the focused tab. This avoids the initial active-tab report racing the
  // runner and being discarded as "No live Chrome session."
  sessions.set(browserName, session);

  await captureDownloadBaseline(session);

  if (browserName === "chrome") {
    const deadline = Date.now() + 1500;
    while (
      !Number.isInteger(session.activeTabId) &&
      Date.now() < deadline
    ) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const activePage = await getActivePage(session);
  if (activePage) {
    session.page = activePage;
    await activePage.bringToFront().catch(() => {});

    // Chrome can expose a transient startup about:blank page alongside the
    // restored/active tab. Once the extension has identified the real active
    // tab, remove only that orphan blank page. Never create a replacement tab.
    if (browserName === "chrome") {
      const pages = session.context.pages().filter(page => !page.isClosed());
      for (const page of pages) {
        if (
          page !== activePage &&
          page.url() === "about:blank" &&
          pages.length > 1
        ) {
          await page.close().catch(() => {});
        }
      }
    }

    if (targetUrl && activePage.url() !== targetUrl) {
      await activePage
        .goto(targetUrl, { waitUntil: "domcontentloaded" })
        .catch(() => {});
    }
  }

  context.on("close", () => {
    if (session.downloadWatcher) {
      clearInterval(session.downloadWatcher);
    }

    if (sessions.get(browserName) === session) {
      sessions.delete(browserName);
    }
  });

  return session;
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}


function buildPageFunctionFromIife(source) {
  const normalized = String(source || '').replace(/\r\n/g, "\n").trim();
  const start = normalized.indexOf("(async () => {");
  const end = normalized.lastIndexOf("})();");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Extractor source is not a supported async browser script.");
  }

  const bodyStart = start + "(async () => {".length;
  const body = normalized.slice(bodyStart, end);

  // Create the same kind of page function used by Ultimate Checker.
  // Playwright serializes this function and executes its body directly in
  // the existing Investigation Browser page context.
  return new Function(`return async function () {\n${body}\n}`)();
}

async function executeExtractorInPage(page, source) {
  const normalized = String(source || '').replace(/\r\n/g, "\n").trim();
  const start = normalized.indexOf("(async () => {");
  const end = normalized.lastIndexOf("})();");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Extractor source is not a supported async browser script.");
  }

  const bodyStart = start + "(async () => {".length;
  const body = normalized.slice(bodyStart, end);

  // Execute directly in the existing Investigation Browser page, like the
  // Ultimate Checker. Extractors historically used anchor downloads for
  // output, so intercept those clicks inside the page and retain the Blob
  // objects in memory instead of invoking the browser download manager.
  const pageFunction = new Function(`return async function () {
    const __originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const __originalAnchorClick = HTMLAnchorElement.prototype.click;
    const __blobByUrl = new Map();
    const __capturedFiles = [];

    URL.createObjectURL = function (object) {
      const url = __originalCreateObjectURL(object);
      if (object instanceof Blob) __blobByUrl.set(url, object);
      return url;
    };

    HTMLAnchorElement.prototype.click = function () {
      const href = this.href || '';
      if (this.download && __blobByUrl.has(href)) {
        __capturedFiles.push({ name: this.download, blob: __blobByUrl.get(href) });
        return;
      }
      return __originalAnchorClick.call(this);
    };

    try {
      const __extractorResult = await (async () => {
${body}
      })();
      const __files = await Promise.all(__capturedFiles.map(async ({ name, blob }) => ({
        name,
        kind: 'JSON',
        content: await blob.text()
      })));
      return { result: __extractorResult, files: __files };
    } finally {
      URL.createObjectURL = __originalCreateObjectURL;
      HTMLAnchorElement.prototype.click = __originalAnchorClick;
      __blobByUrl.clear();
      __capturedFiles.length = 0;
    }
  }`)();

  return await page.evaluate(pageFunction);
}


function installBusyNavigationGuard(page, job, label) {
  job.navigationCancelled = false;

  const onMainFrameNavigated = frame => {
    if (frame.parentFrame() !== null || job.status !== "RUNNING") return;
    job.navigationCancelled = true;
    job.status = "CANCELLED";
    job.error = null;
    job.messages.push(`${label} ENDED BY USER NAVIGATION.`);
  };

  const guardSource = `
    (() => {
      const message = ${JSON.stringify(`${label} is running. Leaving or reloading this page will end the current run. Continue?`)};
      const clickHandler = event => {
        if (event.defaultPrevented) return;
        const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!target) return;
        if (target.target && target.target !== '_self') return;
        if (target.hasAttribute('download')) return;

        let url;
        try { url = new URL(target.href, location.href); } catch { return; }
        if (!["http:", "https:"].includes(url.protocol)) return;
        if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;

        if (!window.confirm(message)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        window.__v1124ProceedingNavigation = true;
      };

      const beforeUnloadHandler = event => {
        event.preventDefault();
        event.returnValue = message;
      };

      window.addEventListener('click', clickHandler, true);
      window.addEventListener('beforeunload', beforeUnloadHandler);
      window.__v1124BusyNavigationGuardCleanup = () => {
        window.removeEventListener('click', clickHandler, true);
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        delete window.__v1124BusyNavigationGuardCleanup;
        delete window.__v1124ProceedingNavigation;
      };
    })();
  `;

  page.on("framenavigated", onMainFrameNavigated);
  return page.evaluate(guardSource).catch(error => {
    page.off("framenavigated", onMainFrameNavigated);
    throw error;
  });
}

async function removeBusyNavigationGuard(page) {
  await page.evaluate(() => {
    if (typeof window.__v1124BusyNavigationGuardCleanup === "function") {
      window.__v1124BusyNavigationGuardCleanup();
    }
  }).catch(() => {});
}

function lastNumberFor(messages, labels) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = String(messages[i] || "");
    for (const label of labels) {
      const m = text.match(new RegExp(label + "\\s*:?\\s*(\\d+)", "i"));
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function buildExtractorSummary(extractor, title, source, messages, fileCount) {
  const discovered =
    lastNumberFor(messages, ["Sitemap candidates"]) ??
    lastNumberFor(messages, ["Discovered URLs", "Discovered links", "Courses discovered", "uniqueCoursesDiscovered", "Test cases discovered", "Expected messages", "Total unique messages", "Unique articles"]);
  const successful = lastNumberFor(messages, [
    "Successful", "Pages captured", "Bug pages captured", "Bugs captured",
    "Detail pages captured", "Reproductions captured", "Links captured",
    "Test cases captured", "Courses extracted", "Total unique messages"
  ]);
  const failed = lastNumberFor(messages, [
    "Failed", "Pages failed", "Bug pages failed", "Detail pages failed",
    "Linked pages failed", "Test cases failed", "Course failures", "Course-track failures"
  ]);
  return {
    discovered: discovered ?? fileCount,
    successful: successful ?? fileCount,
    failed: failed ?? 0,
    generated: fileCount,
    extractor: title,
    source,
    failures: []
  };
}

async function runAcademyExtractor(page, job, extractor) {
  job.messages = [];
  job.status = "RUNNING";
  job.files = [];
  job.error = null;

  const onConsole = msg => {
    const text = msg.text();
    if (text) job.messages.push(text);
  };

  const onPageError = error => {
    const text = error?.message || String(error);
    if (text) job.messages.push(`EXTRACTOR ERROR: ${text}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  let extractorTitle = extractor;

  try {
    await installBusyNavigationGuard(page, job, "EXTRACTOR");
    const sourcePath = EXTRACTOR_PATHS[extractor];
    if (!sourcePath) throw new Error(`Extractor "${extractor}" is not connected to a live runner yet.`);

    const source = await fs.readFile(sourcePath, "utf8");
    extractorTitle = decodeURIComponent(sourcePath.pathname.split("/").pop() || extractor).replace(/\.txt$/i, "");
    const currentPageUrl = page.url();
    const compatibilityError = extractorPageCompatibilityError(extractor, currentPageUrl);
    if (compatibilityError) {
      throw new Error(compatibilityError);
    }

    // Same Playwright page-function execution model as Ultimate Checker.
    // The supplied extractor runs inside the already-open Investigation
    // Browser page/session; no second browser or page is created.
    const extractorExecution = await executeExtractorInPage(page, source);
    const extractorResult = extractorExecution?.result;
    job.files = Array.isArray(extractorExecution?.files)
      ? extractorExecution.files.filter(file => /\.json$/i.test(file.name))
      : [];

    if (!job.files.length) {
      throw new Error("Extractor completed but produced no JSON files.");
    }

    if (job.navigationCancelled) {
      job.status = "CANCELLED";
      job.error = null;
      return;
    }

    job.status = "COMPLETE";
    job.summary = buildExtractorSummary(extractor, extractorTitle, page.url(), job.messages, job.files.length);

    if (extractor === "testio-academy" && extractorResult) {
      // Preserve the V56 summary meaning: DISCOVERED is the unique article
      // count shown by the Academy extractor, not the raw sitemap candidate count.
      job.summary.discovered = Number(extractorResult.articleCount ?? extractorResult.sitemapCandidates ?? job.summary.discovered);
      job.summary.successful = Number(extractorResult.successful ?? job.summary.successful);
      job.summary.failed = Number(extractorResult.failed ?? job.summary.failed);
      job.summary.failures = Array.isArray(extractorResult.failures) ? extractorResult.failures.map(failure => ({
        url: String(failure?.url || ""),
        error: String(failure?.error || "Extraction failed.")
      })) : [];
    } else if (extractor === "utest-academy" && extractorResult) {
      job.summary.discovered = Number(extractorResult.discoveredCourses ?? job.summary.discovered);
      job.summary.successful = Number(extractorResult.coursesExtracted ?? job.summary.successful);
      job.summary.failed = Number(extractorResult.courseFailures ?? 0) + Number(extractorResult.courseTrackFailures ?? 0);
    }
  } catch (error) {
    if (!job.navigationCancelled) {
      job.status = "FAILED";
      job.error = error instanceof Error ? error.message : "Extractor failed.";
      job.summary = {
        discovered: 0,
        successful: 0,
        failed: 1,
        generated: 0,
        extractor: extractorTitle,
        source: page.url(),
        failures: []
      };
    }
  } finally {
    await removeBusyNavigationGuard(page);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}
async function runMergeJob(job, files) {
  job.messages = ["MERGE JSON STARTED", `Loading ${files.length} extracted JSON file(s)...`];
  job.status = "RUNNING";
  try {
    const sourceFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      job.messages.push(`Merging ${i + 1}/${files.length}: ${file.name}`);
      sourceFiles.push({ filename: file.name, content: JSON.parse(file.content) });
    }
    job.messages.push("Validating merged JSON...");
    const master = {
      bundle_version: "v1124",
      bundled_at: new Date().toISOString(),
      source_files: sourceFiles,
      failed_files: [],
      summary: { files_found: files.length, files_bundled: sourceFiles.length, failed: 0 }
    };
    job.master = { name: deriveMasterName(files.map(file => file.name)), kind: "MASTER", content: JSON.stringify(master, null, 2) };
    job.messages.push(`MASTER JSON READY: ${sourceFiles.length} file(s) merged.`);
    job.messages.push("MERGE JSON COMPLETE");
    job.status = "COMPLETE";
  } catch (error) {
    job.status = "FAILED";
    job.error = error instanceof Error ? error.message : "Merge failed.";
    job.messages.push(`MERGE ERROR: ${job.error}`);
  }
}

async function runUltimateChecker(page, job) {
  const bucket = {};
  job.messages = [];
  job.status = "RUNNING";

  const onConsole = msg => {
    const text = msg.text();
    if (text) job.messages.push(text);
  };

  const onPageError = error => {
    const text = error?.message || String(error);
    if (text) job.messages.push(`CHECKER ERROR: ${text}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await installBusyNavigationGuard(page, job, "CHECKER");
    const result = await page.evaluate(async (bucket) => {

  const MASTER = {
    version: "v1124",
    name: "Website Defect Checker v1124"
  };

  const LINK_CONFIG = {
    version: "v1124", name: "Broken Link Checker v1124",
    concurrency: 4, delayMs: 250, timeoutMs: 15000,
    retries429: 2, retryDelayMs: 1500, sameOriginOnly: true
  };

  const IMAGE_CONFIG = {
    version: "v1124", name: "Broken Image Checker v1124",
    concurrency: 4, delayMs: 250, timeoutMs: 15000,
    retries429: 2, retryDelayMs: 1500, sameOriginOnly: true
  };

  const VIDEO_CONFIG = {
    version: "v1124", name: "Broken Video Checker v1124",
    concurrency: 3, delayMs: 250, timeoutMs: 15000,
    probeTimeoutMs: 10000, retries429: 2, retryDelayMs: 1500,
    sameOriginOnly: false
  };

  const START_TIME = new Date();

  console.clear();

  console.log(`
========================================
${MASTER.name}
========================================
`);

  async function run_linkEngine() {
  // ============================================================
  // BROKEN LINK CHECKER v1124
  // ============================================================


  // ------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function cleanUrl(raw) {
    if (!raw) return null;

    try {
      const url = new URL(raw, location.href);

      if (!["http:", "https:"].includes(url.protocol)) {
        return null;
      }

      if (
        LINK_CONFIG.sameOriginOnly &&
        url.origin !== location.origin
      ) {
        return null;
      }

      // Fragments do not affect the HTTP resource.
      url.hash = "";

      return url.href;
    } catch {
      return null;
    }
  }

  function isVisible(el) {
    if (!el) return false;

    const style = getComputedStyle(el);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    ) {
      return false;
    }

    if (el.hidden) return false;

    if (el.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const rect = el.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    return true;
  }

  function getLinkLabel(el) {
    const text =
      el.innerText?.trim() ||
      el.getAttribute("aria-label")?.trim() ||
      el.getAttribute("title")?.trim() ||
      el.querySelector("img")?.getAttribute("alt")?.trim() ||
      "";

    return text.replace(/\s+/g, " ").trim() || "(unnamed link)";
  }

  function getElementContext(el) {
    const container = el.closest(
      "nav, header, footer, main, section, article, aside"
    );

    if (!container) {
      return "Page";
    }

    const headingEl = container.querySelector(
      "h1, h2, h3, h4, h5, h6"
    );

    const heading = headingEl?.innerText
      ?.replace(/\s+/g, " ")
      ?.trim();

    const tag = container.tagName.toLowerCase();

    if (heading) {
      return `${tag.toUpperCase()} Ã¢â€ â€™ ${heading}`;
    }

    return tag.toUpperCase();
  }

  // ------------------------------------------------------------
  // PAGE-SPECIFIC REPORT FILENAME
  // ------------------------------------------------------------

  function getReportFileName() {
    const path = location.pathname.replace(/\/+$/, "");

    const parts = path
      .split("/")
      .filter(Boolean);

    let name = parts.length
      ? parts[parts.length - 1]
      : "homepage";

    try {
      name = decodeURIComponent(name);
    } catch {}

    name = name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!name) {
      name = "homepage";
    }

    return `${name}.txt`;
  }

  // ------------------------------------------------------------
  // COLLECT VISIBLE LINKS
  // ------------------------------------------------------------

  function collectVisibleLinks() {
    const anchors = [
      ...document.querySelectorAll("a[href]")
    ];

    const links = [];
    const seen = new Set();

    for (const el of anchors) {
      if (!isVisible(el)) continue;

      const destination = cleanUrl(el.href);

      if (!destination) continue;

      const label = getLinkLabel(el);
      const context = getElementContext(el);

      const key = `${destination}|||${label}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      links.push({
        element: el,
        label,
        destination,
        context
      });
    }

    return links;
  }

  // ------------------------------------------------------------
  // HTTP REQUEST
  // ------------------------------------------------------------

  async function fetchWithTimeout(
    url,
    method = "HEAD"
  ) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      LINK_CONFIG.timeoutMs
    );

    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(url) {
    // ----------------------------------------------------------
    // HEAD
    // ----------------------------------------------------------

    try {
      let response = await fetchWithTimeout(url, "HEAD");

      // Servers that reject HEAD get a GET fallback.
      if (
        response.status === 405 ||
        response.status === 501
      ) {
        response = await fetchWithTimeout(url, "GET");
      }

      // --------------------------------------------------------
      // 429 RETRIES
      // --------------------------------------------------------

      if (response.status === 429) {
        for (
          let attempt = 1;
          attempt <= LINK_CONFIG.retries429;
          attempt++
        ) {
          console.log(
            `429 retry ${attempt}/${LINK_CONFIG.retries429}: ${url}`
          );

          await sleep(
            LINK_CONFIG.retryDelayMs * attempt
          );

          response = await fetchWithTimeout(url, "HEAD");

          if (
            response.status === 405 ||
            response.status === 501
          ) {
            response = await fetchWithTimeout(url, "GET");
          }

          if (response.status !== 429) {
            break;
          }
        }
      }

      return {
        status: response.status,
        finalUrl: response.url || url,
        method: "HEAD"
      };

    } catch (headError) {

      // --------------------------------------------------------
      // GET FALLBACK
      // --------------------------------------------------------

      try {
        let response =
          await fetchWithTimeout(url, "GET");

        if (response.status === 429) {
          for (
            let attempt = 1;
            attempt <= LINK_CONFIG.retries429;
            attempt++
          ) {
            console.log(
              `429 retry ${attempt}/${LINK_CONFIG.retries429}: ${url}`
            );

            await sleep(
              LINK_CONFIG.retryDelayMs * attempt
            );

            response =
              await fetchWithTimeout(url, "GET");

            if (response.status !== 429) {
              break;
            }
          }
        }

        return {
          status: response.status,
          finalUrl: response.url || url,
          method: "GET"
        };

      } catch (getError) {
        return {
          status: null,
          finalUrl: url,
          method: null,
          error: getError || headError
        };
      }
    }
  }

  // ------------------------------------------------------------
  // CHECK LINKS WITH CONCURRENCY CONTROL
  // ------------------------------------------------------------

  async function checkLinks(links) {
    const results = new Array(links.length);

    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index = nextIndex++;

        if (index >= links.length) {
          break;
        }

        const link = links[index];

        console.log(
          `[${index + 1}/${links.length}] Checking: ${link.label} Ã¢â€ â€™ ${link.destination}`
        );

        const response =
          await request(link.destination);

        results[index] = {
          ...link,
          ...response
        };

        if (response.status === null) {
          console.log(
            `Ã¢ÂÅ’ NETWORK/CORS: ${link.destination}`
          );
        } else {
          console.log(
            `${response.status} ${link.destination}`
          );
        }

        await sleep(LINK_CONFIG.delayMs);
      }
    }

    const workers = [];

    for (
      let i = 0;
      i < Math.min(
        LINK_CONFIG.concurrency,
        links.length
      );
      i++
    ) {
      workers.push(worker());
    }

    await Promise.all(workers);

    return results;
  }

  // ------------------------------------------------------------
  // CLASSIFICATION
  // ------------------------------------------------------------

  function classify(result) {
    const status = result.status;

    if (status === null) {
      return "network";
    }

    if (status === 429) {
      return "429";
    }

    if (status >= 200 && status < 300) {
      return "2xx";
    }

    if (status >= 300 && status < 400) {
      return "3xx";
    }

    // Confirmed broken:
    // 404, 410 and server-side 5xx.
    if (
      status === 404 ||
      status === 410 ||
      (status >= 500 && status <= 599)
    ) {
      return "confirmed-broken";
    }

    if (status >= 400 && status <= 499) {
      return "4xx";
    }

    return "other";
  }

  // ------------------------------------------------------------
  // BUILD TXT REPORT
  // ------------------------------------------------------------

  function buildReport(results) {
    const finished = new Date();

    const summary = {
      total: results.length,
      successful: 0,
      redirects: 0,
      clientErrors: 0,
      rateLimited: 0,
      serverErrors: 0,
      network: 0,
      confirmedBroken: 0
    };

    const broken = [];
    const clientErrors = [];
    const rateLimited = [];
    const redirects = [];
    const networkErrors = [];

    for (const result of results) {
      const category = classify(result);

      switch (category) {
        case "2xx":
          summary.successful++;
          break;

        case "3xx":
          summary.redirects++;
          redirects.push(result);
          break;

        case "4xx":
          summary.clientErrors++;
          clientErrors.push(result);
          break;

        case "429":
          summary.rateLimited++;
          rateLimited.push(result);
          break;

        case "confirmed-broken":
          summary.confirmedBroken++;
          broken.push(result);

          if (result.status >= 500) {
            summary.serverErrors++;
          } else {
            summary.clientErrors++;
          }
          break;

        case "network":
          summary.network++;
          networkErrors.push(result);
          break;

        default:
          break;
      }
    }

    let report = "";

    const add = text =>
      report += text + "\n";

    add("BROKEN LINK CHECKER");
    add("========================================");
    add("");
    add(`Extractor: ${LINK_CONFIG.version}`);
    add(`Checker: ${LINK_CONFIG.name}`);
    add(`Page checked: ${location.href}`);
    add(
      `Page title: ${document.title || "(untitled)"}`
    );
    add(
      `Started: ${START_TIME.toISOString()}`
    );
    add(
      `Finished: ${finished.toISOString()}`
    );
    add(
      `Duration: ${(
        (finished - START_TIME) /
        1000
      ).toFixed(1)} seconds`
    );
    add("");

    // ----------------------------------------------------------
    // PAGE SUMMARY
    // ----------------------------------------------------------

    add("PAGE SUMMARY");
    add("----------------------------------------");
    add(
      `Visible links checked: ${summary.total}`
    );
    add(
      `Successful (2xx):      ${summary.successful}`
    );
    add(
      `Redirects (3xx):       ${summary.redirects}`
    );
    add(
      `Client errors (4xx):   ${summary.clientErrors}`
    );
    add(
      `Rate limited (429):    ${summary.rateLimited}`
    );
    add(
      `Server errors (5xx):   ${summary.serverErrors}`
    );
    add(
      `Network/CORS errors:   ${summary.network}`
    );
    add(
      `Confirmed broken:      ${summary.confirmedBroken}`
    );
    add("");

    // ----------------------------------------------------------
    // BROKEN LINKS
    // ----------------------------------------------------------

    add("BROKEN VISIBLE LINKS");
    add("========================================");
    add("");

    if (!broken.length) {
      add(
        "No confirmed broken visible links found."
      );
    } else {
      broken.forEach((result, index) => {
        add(
          `[${index + 1}] BROKEN VISIBLE LINK`
        );
        add("----------------------------------------");
        add(
          `Source page: ${location.href}`
        );
        add(
          `Visible link: ${result.label}`
        );
        add(
          `Page section: ${result.context}`
        );
        add(
          `Destination: ${result.destination}`
        );
        add(
          `Status: ${result.status}`
        );
        add("");

        add("HOW TO REPRODUCE:");
        add(
          `1. Open: ${location.href}`
        );
        add(
          `2. Find the visible link: "${result.label}"`
        );
        add(
          "3. Click the link."
        );
        add(
          `4. Observe: ${result.status}`
        );
        add("");
      });
    }

    add("");

    // ----------------------------------------------------------
    // OTHER 4XX
    // ----------------------------------------------------------

    add(
      "OTHER VISIBLE-LINK CLIENT ERRORS"
    );
    add("========================================");
    add("");

    if (!clientErrors.length) {
      add("None.");
    } else {
      clientErrors.forEach((result, index) => {
        add(`[${index + 1}]`);
        add(
          `Visible link: ${result.label}`
        );
        add(
          `Destination: ${result.destination}`
        );
        add(
          `Status: ${result.status}`
        );
        add(
          `Source page: ${location.href}`
        );
        add("");
      });
    }

    add("");

    // ----------------------------------------------------------
    // 429
    // ----------------------------------------------------------

    add("RATE LIMITED LINKS");
    add("========================================");
    add("");

    if (!rateLimited.length) {
      add("None.");
    } else {
      rateLimited.forEach((result, index) => {
        add(`[${index + 1}]`);
        add(
          `Visible link: ${result.label}`
        );
        add(
          `Destination: ${result.destination}`
        );
        add(
          "Status: 429 Too Many Requests"
        );
        add(
          `Source page: ${location.href}`
        );
        add("");
      });
    }

    add("");

    // ----------------------------------------------------------
    // NETWORK / CORS
    // ----------------------------------------------------------

    add("NETWORK / CORS FAILURES");
    add("========================================");
    add("");

    if (!networkErrors.length) {
      add("None.");
    } else {
      networkErrors.forEach((result, index) => {
        add(`[${index + 1}]`);
        add(
          `Visible link: ${result.label}`
        );
        add(
          `Destination: ${result.destination}`
        );
        add(
          `Error: ${
            result.error?.message ||
            "Network/CORS failure"
          }`
        );
        add(
          `Source page: ${location.href}`
        );
        add("");
      });
    }

    add("");

    // ----------------------------------------------------------
    // REDIRECTS
    // ----------------------------------------------------------

    add("REDIRECTS");
    add("========================================");
    add("");

    if (!redirects.length) {
      add("No redirects reported.");
    } else {
      redirects.forEach((result, index) => {
        add(`[${index + 1}]`);
        add(
          `Visible link: ${result.label}`
        );
        add(
          `Destination: ${result.destination}`
        );
        add(
          `Final URL: ${result.finalUrl}`
        );
        add(
          `Status: ${result.status}`
        );
        add("");
      });
    }

    add("");

    // ----------------------------------------------------------
    // INTERPRETATION
    // ----------------------------------------------------------

    add("INTERPRETATION");
    add("========================================");
    add(
      "Only visible, user-navigable same-origin <a> links were checked."
    );
    add(
      "Hidden links and implementation URLs were excluded."
    );
    add(
      "JavaScript, CSS, API, robots.txt and sitemap URLs were excluded."
    );
    add(
      "404/410 and 5xx responses are treated as confirmed broken."
    );
    add(
      "401/403/405/422 and similar 4xx responses are reported separately."
    );
    add(
      "429 responses are treated as rate-limited and not automatically broken."
    );
    add(
      "Network/CORS failures require manual verification."
    );
    add(
      "This scan covers this page only; navigate to another page and run the checker again."
    );
    add("");

    add("END OF REPORT");
    add("========================================");

    return {
      report,
      broken
    };
  }

  // ------------------------------------------------------------
  // DOWNLOAD REPORT
  // ONLY WHEN CONFIRMED BROKEN LINKS EXIST
  // ------------------------------------------------------------

  function downloadReport(report) {
    const blob = new Blob(
      [report],
      {
        type: "text/plain;charset=utf-8"
      }
    );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = getReportFileName();

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );

    console.log(
      `Report saved as: ${getReportFileName()}`
    );
  }

  // ------------------------------------------------------------

    const items = collectVisibleLinks();
    const results = await checkLinks(items);
    const built = buildReport(results);
    return { items, results, report: built.report, broken: built.broken, manual: results.filter(result => classify(result) === "manual").length };
  }

  async function run_imageEngine() {
  // ============================================================
  // BROKEN IMAGE CHECKER v1124
  // ============================================================


  // ------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function cleanUrl(raw) {
    if (!raw) return null;

    try {
      const url = new URL(raw, location.href);

      if (!["http:", "https:"].includes(url.protocol)) {
        return null;
      }

      if (
        IMAGE_CONFIG.sameOriginOnly &&
        url.origin !== location.origin
      ) {
        return null;
      }

      url.hash = "";

      return url.href;
    } catch {
      return null;
    }
  }

  function isVisible(el) {
    if (!el) return false;

    const style = getComputedStyle(el);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    ) {
      return false;
    }

    if (el.hidden) return false;

    if (
      el.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return false;
    }

    return true;
  }

  function getImageLabel(img) {
    return (
      img.getAttribute("alt")?.trim() ||
      img.getAttribute("aria-label")?.trim() ||
      img.getAttribute("title")?.trim() ||
      "(unnamed image)"
    );
  }

  function getElementContext(el) {
    const container = el.closest(
      "nav, header, footer, main, section, article, aside"
    );

    if (!container) {
      return "Page";
    }

    const headingEl = container.querySelector(
      "h1, h2, h3, h4, h5, h6"
    );

    const heading = headingEl?.innerText
      ?.replace(/\s+/g, " ")
      ?.trim();

    const tag = container.tagName.toLowerCase();

    if (heading) {
      return `${tag.toUpperCase()} Ã¢â€ â€™ ${heading}`;
    }

    return tag.toUpperCase();
  }

  // ------------------------------------------------------------
  // IMAGE URL EXTRACTION
  // ------------------------------------------------------------

  function getImageUrl(img) {
    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-image"),
      img.getAttribute("data-url")
    ];

    for (const candidate of candidates) {
      const cleaned = cleanUrl(candidate);

      if (cleaned) {
        return cleaned;
      }
    }

    const srcset =
      img.getAttribute("srcset") ||
      img.getAttribute("data-srcset");

    if (srcset) {
      const first =
        srcset
          .split(",")[0]
          ?.trim()
          ?.split(/\s+/)[0];

      return cleanUrl(first);
    }

    return null;
  }

  // ------------------------------------------------------------
  // PAGE-SPECIFIC REPORT FILENAME
  // ------------------------------------------------------------

  function getReportFileName() {
    const path =
      location.pathname.replace(/\/+$/, "");

    const parts =
      path.split("/").filter(Boolean);

    let name = parts.length
      ? parts[parts.length - 1]
      : "homepage";

    try {
      name = decodeURIComponent(name);
    } catch {}

    name = name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!name) {
      name = "homepage";
    }

    return `${name}.txt`;
  }

  // ------------------------------------------------------------
  // COLLECT VISIBLE IMAGES
  // ------------------------------------------------------------

  function collectVisibleImages() {
    const imageElements = [
      ...document.querySelectorAll("img")
    ];

    const images = [];
    const seen = new Set();

    for (const img of imageElements) {
      if (!isVisible(img)) continue;

      const destination =
        getImageUrl(img);

      if (!destination) continue;

      const label =
        getImageLabel(img);

      const context =
        getElementContext(img);

      const key =
        `${destination}|||${label}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      images.push({
        element: img,
        label,
        destination,
        context
      });
    }

    return images;
  }

  // ------------------------------------------------------------
  // CHECK BROWSER IMAGE STATE
  // ------------------------------------------------------------

  async function checkBrowserImage(img) {
    // Already successfully rendered.
    if (
      img.complete &&
      img.naturalWidth > 0
    ) {
      return {
        browserState: "loaded",
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      };
    }

    // Browser already knows it failed.
    if (
      img.complete &&
      img.naturalWidth === 0
    ) {
      return {
        browserState: "failed",
        naturalWidth: 0,
        naturalHeight: 0
      };
    }

    return await new Promise(resolve => {
      let finished = false;

      const finish = result => {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        img.removeEventListener(
          "load",
          onLoad
        );

        img.removeEventListener(
          "error",
          onError
        );

        resolve(result);
      };

      const onLoad = () => {
        finish({
          browserState: "loaded",
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      };

      const onError = () => {
        finish({
          browserState: "failed",
          naturalWidth: 0,
          naturalHeight: 0
        });
      };

      const timer = setTimeout(() => {
        finish({
          browserState: "unknown",
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      }, IMAGE_CONFIG.timeoutMs);

      img.addEventListener(
        "load",
        onLoad,
        { once: true }
      );

      img.addEventListener(
        "error",
        onError,
        { once: true }
      );
    });
  }

  // ------------------------------------------------------------
  // HTTP REQUEST
  // ------------------------------------------------------------

  async function fetchWithTimeout(
    url,
    method = "HEAD"
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        IMAGE_CONFIG.timeoutMs
      );

    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(url) {
    try {
      let response =
        await fetchWithTimeout(
          url,
          "HEAD"
        );

      if (
        response.status === 405 ||
        response.status === 501
      ) {
        response =
          await fetchWithTimeout(
            url,
            "GET"
          );
      }

      if (response.status === 429) {
        for (
          let attempt = 1;
          attempt <= IMAGE_CONFIG.retries429;
          attempt++
        ) {
          console.log(
            `429 retry ${attempt}/${IMAGE_CONFIG.retries429}: ${url}`
          );

          await sleep(
            IMAGE_CONFIG.retryDelayMs *
            attempt
          );

          response =
            await fetchWithTimeout(
              url,
              "HEAD"
            );

          if (
            response.status === 405 ||
            response.status === 501
          ) {
            response =
              await fetchWithTimeout(
                url,
                "GET"
              );
          }

          if (response.status !== 429) {
            break;
          }
        }
      }

      return {
        status: response.status,
        finalUrl:
          response.url || url,
        contentType:
          response.headers.get(
            "content-type"
          ) || "",
        method: "HEAD"
      };

    } catch (headError) {

      try {
        let response =
          await fetchWithTimeout(
            url,
            "GET"
          );

        if (response.status === 429) {
          for (
            let attempt = 1;
            attempt <= IMAGE_CONFIG.retries429;
            attempt++
          ) {
            console.log(
              `429 retry ${attempt}/${IMAGE_CONFIG.retries429}: ${url}`
            );

            await sleep(
              IMAGE_CONFIG.retryDelayMs *
              attempt
            );

            response =
              await fetchWithTimeout(
                url,
                "GET"
              );

            if (response.status !== 429) {
              break;
            }
          }
        }

        return {
          status: response.status,
          finalUrl:
            response.url || url,
          contentType:
            response.headers.get(
              "content-type"
            ) || "",
          method: "GET"
        };

      } catch (getError) {
        return {
          status: null,
          finalUrl: url,
          contentType: "",
          method: null,
          error:
            getError || headError
        };
      }
    }
  }

  // ------------------------------------------------------------
  // CHECK IMAGES
  // ------------------------------------------------------------

  async function checkImages(images) {
    const results =
      new Array(images.length);

    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index =
          nextIndex++;

        if (
          index >= images.length
        ) {
          break;
        }

        const image =
          images[index];

        console.log(
          `[${index + 1}/${images.length}] Checking image: ${image.label} Ã¢â€ â€™ ${image.destination}`
        );

        // ------------------------------------------------------
        // 1. Browser state
        // ------------------------------------------------------

        const browser =
          await checkBrowserImage(
            image.element
          );

        // ------------------------------------------------------
        // 2. HTTP verification
        // ------------------------------------------------------

        const http =
          await request(
            image.destination
          );

        results[index] = {
          ...image,
          ...http,
          browserState:
            browser.browserState,
          naturalWidth:
            browser.naturalWidth,
          naturalHeight:
            browser.naturalHeight
        };

        // ------------------------------------------------------
        // Logging
        // ------------------------------------------------------

        if (
          browser.browserState ===
          "failed"
        ) {
          console.log(
            `Ã¢ÂÅ’ IMAGE LOAD FAILURE Ã¢â‚¬â€ HTTP ${http.status ?? "UNKNOWN"}: ${image.destination}`
          );
        } else if (
          browser.browserState ===
          "loaded"
        ) {
          console.log(
            `200 IMAGE LOADED: ${image.destination}`
          );
        } else if (
          http.status === null
        ) {
          console.log(
            `Ã¢ÂÅ’ NETWORK/CORS: ${image.destination}`
          );
        } else {
          console.log(
            `${http.status} ${image.destination}`
          );
        }

        await sleep(
          IMAGE_CONFIG.delayMs
        );
      }
    }

    const workers = [];

    for (
      let i = 0;
      i <
      Math.min(
        IMAGE_CONFIG.concurrency,
        images.length
      );
      i++
    ) {
      workers.push(worker());
    }

    await Promise.all(workers);

    return results;
  }

  // ------------------------------------------------------------
  // CLASSIFICATION
  // ------------------------------------------------------------

  function classify(result) {
    const status =
      result.status;

    const browserFailed =
      result.browserState ===
      "failed";

    const contentType =
      (
        result.contentType ||
        ""
      ).toLowerCase();

    const isImageContent =
      contentType.startsWith(
        "image/"
      );

    // ----------------------------------------------------------
    // DEFINITIVE HTTP BROKEN RESOURCE
    // ----------------------------------------------------------

    if (
      status === 404 ||
      status === 410 ||
      (
        status >= 500 &&
        status <= 599
      )
    ) {
      return "confirmed-broken";
    }

    // ----------------------------------------------------------
    // BROWSER FAILED + 200 NON-IMAGE RESOURCE
    //
    // Example:
    // HTTP 200
    // Content-Type: text/html
    // <img> visibly broken
    //
    // This is the HP case we just found.
    // ----------------------------------------------------------

    if (
      browserFailed &&
      status >= 200 &&
      status < 300 &&
      contentType &&
      !isImageContent
    ) {
      return "confirmed-broken";
    }

    // ----------------------------------------------------------
    // BROWSER FAILED + HTTP IMAGE RESPONSE
    //
    // The server claims it returned an image but the browser
    // cannot render it. This is also a broken image resource.
    // ----------------------------------------------------------

    if (
      browserFailed &&
      status >= 200 &&
      status < 300 &&
      isImageContent
    ) {
      return "confirmed-broken";
    }

    // ----------------------------------------------------------
    // RATE LIMITED
    // ----------------------------------------------------------

    if (
      status === 429
    ) {
      return "429";
    }

    // ----------------------------------------------------------
    // OTHER 4XX
    // ----------------------------------------------------------

    if (
      status >= 400 &&
      status <= 499
    ) {
      return "4xx";
    }

    // ----------------------------------------------------------
    // REDIRECT
    // ----------------------------------------------------------

    if (
      status >= 300 &&
      status < 400
    ) {
      return "3xx";
    }

    // ----------------------------------------------------------
    // NETWORK / CORS
    // ----------------------------------------------------------

    if (
      status === null
    ) {
      return "network";
    }

    // ----------------------------------------------------------
    // BROWSER FAILURE WITH NO CONFIRMED HTTP STATUS
    // ----------------------------------------------------------

    if (
      browserFailed
    ) {
      return "manual";
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    if (
      status >= 200 &&
      status < 300
    ) {
      return "2xx";
    }

    return "other";
  }

  // ------------------------------------------------------------
  // BUILD TXT REPORT
  // ------------------------------------------------------------

  function buildReport(results) {
    const finished =
      new Date();

    const summary = {
      total: results.length,
      successful: 0,
      redirects: 0,
      clientErrors: 0,
      rateLimited: 0,
      serverErrors: 0,
      network: 0,
      manual: 0,
      confirmedBroken: 0
    };

    const broken = [];
    const clientErrors = [];
    const rateLimited = [];
    const redirects = [];
    const networkErrors = [];
    const manual = [];

    for (
      const result of results
    ) {
      const category =
        classify(result);

      switch (category) {

        case "2xx":
          summary.successful++;
          break;

        case "3xx":
          summary.redirects++;
          redirects.push(result);
          break;

        case "4xx":
          summary.clientErrors++;
          clientErrors.push(result);
          break;

        case "429":
          summary.rateLimited++;
          rateLimited.push(result);
          break;

        case "confirmed-broken":
          summary.confirmedBroken++;

          broken.push(result);

          if (
            result.status >= 500
          ) {
            summary.serverErrors++;
          } else {
            summary.clientErrors++;
          }

          break;

        case "network":
          summary.network++;
          networkErrors.push(result);
          break;

        case "manual":
          summary.manual++;
          manual.push(result);
          break;

        default:
          break;
      }
    }

    let report = "";

    const add = text =>
      report += text + "\n";

    add("BROKEN IMAGE CHECKER");
    add(
      "========================================"
    );
    add("");

    add(
      `Extractor: ${IMAGE_CONFIG.version}`
    );

    add(
      `Checker: ${IMAGE_CONFIG.name}`
    );

    add(
      `Page checked: ${location.href}`
    );

    add(
      `Page title: ${
        document.title ||
        "(untitled)"
      }`
    );

    add(
      `Started: ${
        START_TIME.toISOString()
      }`
    );

    add(
      `Finished: ${
        finished.toISOString()
      }`
    );

    add(
      `Duration: ${(
        (finished -
          START_TIME) /
        1000
      ).toFixed(1)} seconds`
    );

    add("");

    // ----------------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------------

    add("PAGE SUMMARY");

    add(
      "----------------------------------------"
    );

    add(
      `Visible images checked: ${summary.total}`
    );

    add(
      `Successful (2xx):       ${summary.successful}`
    );

    add(
      `Redirects (3xx):        ${summary.redirects}`
    );

    add(
      `Client errors (4xx):    ${summary.clientErrors}`
    );

    add(
      `Rate limited (429):     ${summary.rateLimited}`
    );

    add(
      `Server errors (5xx):    ${summary.serverErrors}`
    );

    add(
      `Network/CORS errors:    ${summary.network}`
    );

    add(
      `Manual verification:    ${summary.manual}`
    );

    add(
      `Confirmed broken:       ${summary.confirmedBroken}`
    );

    add("");

    // ----------------------------------------------------------
    // BROKEN IMAGES
    // ----------------------------------------------------------

    add(
      "BROKEN VISIBLE IMAGES"
    );

    add(
      "========================================"
    );

    add("");

    if (!broken.length) {

      add(
        "No confirmed broken visible images found."
      );

    } else {

      broken.forEach(
        (result, index) => {

          add(
            `[${index + 1}] BROKEN VISIBLE IMAGE`
          );

          add(
            "----------------------------------------"
          );

          add(
            `Source page: ${location.href}`
          );

          add(
            `Image: ${result.label}`
          );

          add(
            `Page section: ${result.context}`
          );

          add(
            `Image URL: ${result.destination}`
          );

          add(
            `Status: ${
              result.status ??
              "Browser image load failure"
            }`
          );

          if (
            result.contentType
          ) {
            add(
              `Content-Type: ${result.contentType}`
            );
          }

          if (
            result.browserState
          ) {
            add(
              `Browser image state: ${result.browserState}`
            );
          }

          add("");

          add(
            "HOW TO REPRODUCE:"
          );

          add(
            `1. Open: ${location.href}`
          );

          add(
            `2. Locate the visible image: "${result.label}"`
          );

          add(
            "3. Observe the image."
          );

          if (
            result.status
          ) {
            add(
              `4. Observe that the image fails to load / the resource returns HTTP ${result.status}.`
            );
          } else {
            add(
              "4. Observe that the image fails to load."
            );
          }

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // OTHER 4XX
    // ----------------------------------------------------------

    add(
      "OTHER VISIBLE-IMAGE CLIENT ERRORS"
    );

    add(
      "========================================"
    );

    add("");

    if (!clientErrors.length) {

      add("None.");

    } else {

      clientErrors.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Image: ${result.label}`
          );

          add(
            `Image URL: ${result.destination}`
          );

          add(
            `Status: ${result.status}`
          );

          add(
            `Source page: ${location.href}`
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // RATE LIMITED
    // ----------------------------------------------------------

    add(
      "RATE LIMITED IMAGES"
    );

    add(
      "========================================"
    );

    add("");

    if (!rateLimited.length) {

      add("None.");

    } else {

      rateLimited.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Image: ${result.label}`
          );

          add(
            `Image URL: ${result.destination}`
          );

          add(
            "Status: 429 Too Many Requests"
          );

          add(
            `Source page: ${location.href}`
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // NETWORK / CORS
    // ----------------------------------------------------------

    add(
      "NETWORK / CORS FAILURES"
    );

    add(
      "========================================"
    );

    add("");

    if (!networkErrors.length) {

      add("None.");

    } else {

      networkErrors.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Image: ${result.label}`
          );

          add(
            `Image URL: ${result.destination}`
          );

          add(
            `Error: ${
              result.error?.message ||
              "Network/CORS failure"
            }`
          );

          add(
            `Source page: ${location.href}`
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // MANUAL VERIFICATION
    // ----------------------------------------------------------

    add(
      "IMAGES REQUIRING MANUAL VERIFICATION"
    );

    add(
      "========================================"
    );

    add("");

    if (!manual.length) {

      add("None.");

    } else {

      manual.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Image: ${result.label}`
          );

          add(
            `Image URL: ${result.destination}`
          );

          add(
            "Browser state: Image failed to load"
          );

          add(
            "HTTP status/content did not provide enough evidence for automatic confirmation."
          );

          add(
            `Source page: ${location.href}`
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // REDIRECTS
    // ----------------------------------------------------------

    add("REDIRECTS");

    add(
      "========================================"
    );

    add("");

    if (!redirects.length) {

      add(
        "No redirects reported."
      );

    } else {

      redirects.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Image: ${result.label}`
          );

          add(
            `Image URL: ${result.destination}`
          );

          add(
            `Final URL: ${result.finalUrl}`
          );

          add(
            `Status: ${result.status}`
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // INTERPRETATION
    // ----------------------------------------------------------

    add("INTERPRETATION");

    add(
      "========================================"
    );

    add(
      "Only visible images on the current page were checked."
    );

    add(
      "Hidden images and implementation resources were excluded."
    );

    add(
      "JavaScript, CSS, API, robots.txt and sitemap resources were excluded."
    );

    add(
      "Normal src, currentSrc, common lazy-load attributes and srcset were considered."
    );

    add(
      "404/410 and 5xx responses are treated as confirmed broken."
    );

    add(
      "A browser image-load failure combined with a non-image HTTP response is treated as confirmed broken."
    );

    add(
      "A browser image-load failure combined with an HTTP image response is also treated as confirmed broken because the browser cannot render the supplied image resource."
    );

    add(
      "429 responses are treated as rate-limited and not automatically broken."
    );

    add(
      "Browser failures without sufficient HTTP confirmation require manual verification."
    );

    add(
      "Missing alt text is not treated as a broken-image defect."
    );

    add(
      "This scan covers this page only; navigate to another page and run the checker again."
    );

    add("");

    add("END OF REPORT");

    add(
      "========================================"
    );

    return {
      report,
      broken
    };
  }

  // ------------------------------------------------------------
  // DOWNLOAD ONLY WHEN CONFIRMED BROKEN
  // ------------------------------------------------------------

  function downloadReport(report) {
    const blob =
      new Blob(
        [report],
        {
          type:
            "text/plain;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download =
      getReportFileName();

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(url),
      1000
    );

    console.log(
      `Report saved as: ${getReportFileName()}`
    );
  }

  // ------------------------------------------------------------

    const items = collectVisibleImages();
    const results = await checkImages(items);
    const built = buildReport(results);
    return { items, results, report: built.report, broken: built.broken, manual: results.filter(result => classify(result) === "manual").length };
  }

  async function run_videoEngine() {
  // ============================================================
  // BROKEN VIDEO CHECKER v1124
  // ============================================================


  // ------------------------------------------------------------
  // UTILITIES
  // ------------------------------------------------------------

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function cleanUrl(raw) {
    if (!raw) return null;

    try {
      const url = new URL(raw, location.href);

      if (!["http:", "https:"].includes(url.protocol)) {
        return null;
      }

      if (
        VIDEO_CONFIG.sameOriginOnly &&
        url.origin !== location.origin
      ) {
        return null;
      }

      url.hash = "";

      return url.href;
    } catch {
      return null;
    }
  }

  function isVisible(el) {
    if (!el) return false;

    const style = getComputedStyle(el);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    ) {
      return false;
    }

    if (el.hidden) return false;

    if (
      el.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return false;
    }

    return true;
  }

  function getVideoLabel(video, index) {
    return (
      video.getAttribute("aria-label")?.trim() ||
      video.getAttribute("title")?.trim() ||
      video.getAttribute("id")?.trim() ||
      video.closest("figure")
        ?.querySelector("figcaption")
        ?.innerText
        ?.replace(/\s+/g, " ")
        ?.trim() ||
      `Video ${index + 1}`
    );
  }

  function getElementContext(el) {
    const container = el.closest(
      "nav, header, footer, main, section, article, aside"
    );

    if (!container) {
      return "Page";
    }

    const headingEl = container.querySelector(
      "h1, h2, h3, h4, h5, h6"
    );

    const heading = headingEl?.innerText
      ?.replace(/\s+/g, " ")
      ?.trim();

    const tag = container.tagName.toLowerCase();

    if (heading) {
      return `${tag.toUpperCase()} Ã¢â€ â€™ ${heading}`;
    }

    return tag.toUpperCase();
  }

  // ------------------------------------------------------------
  // VIDEO SOURCE EXTRACTION
  // ------------------------------------------------------------

  function getVideoSources(video) {
    const sources = [];
    const seen = new Set();

    function add(raw, type = "") {
      const cleaned = cleanUrl(raw);

      if (!cleaned || seen.has(cleaned)) {
        return;
      }

      seen.add(cleaned);

      sources.push({
        url: cleaned,
        type
      });
    }

    add(video.currentSrc, "currentSrc");
    add(video.src, "src");
    add(video.getAttribute("src"), "src-attribute");

    video.querySelectorAll("source").forEach(source => {
      add(
        source.src,
        source.getAttribute("type") || "source"
      );

      add(
        source.getAttribute("src"),
        source.getAttribute("type") || "source"
      );
    });

    [
      "data-src",
      "data-video-src",
      "data-source",
      "data-url",
      "data-original",
      "data-lazy-src",
      "data-file",
      "data-video"
    ].forEach(attr => {
      add(
        video.getAttribute(attr),
        attr
      );
    });

    return sources;
  }

  // ------------------------------------------------------------
  // PAGE-SPECIFIC REPORT FILENAME
  // ------------------------------------------------------------

  function getReportFileName() {
    const path =
      location.pathname.replace(/\/+$/, "");

    const parts =
      path.split("/").filter(Boolean);

    let name =
      parts.length
        ? parts[parts.length - 1]
        : "homepage";

    try {
      name = decodeURIComponent(name);
    } catch {}

    name = name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!name) {
      name = "homepage";
    }

    return `${name}.txt`;
  }

  // ------------------------------------------------------------
  // COLLECT VISIBLE VIDEOS
  // ------------------------------------------------------------

  function collectVisibleVideos() {
    const videoElements = [
      ...document.querySelectorAll("video")
    ];

    const videos = [];
    const seen = new Set();

    for (
      let index = 0;
      index < videoElements.length;
      index++
    ) {
      const video =
        videoElements[index];

      if (!isVisible(video)) {
        continue;
      }

      const sources =
        getVideoSources(video);

      if (!sources.length) {
        continue;
      }

      const label =
        getVideoLabel(
          video,
          index
        );

      const context =
        getElementContext(video);

      const key =
        `${sources.map(s => s.url).join("|")}|||${label}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      videos.push({
        element: video,
        label,
        context,
        sources
      });
    }

    return videos;
  }

  // ------------------------------------------------------------
  // OLD WORKING BROWSER VIDEO PROBE
  // ------------------------------------------------------------

  async function probeVideoSource(url) {
    return await new Promise(resolve => {
      const video =
        document.createElement("video");

      let finished = false;

      const finish = result => {
        if (finished) return;

        finished = true;

        clearTimeout(timer);

        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.remove();
        } catch {}

        resolve(result);
      };

      const timer =
        setTimeout(() => {
          finish({
            browserState: "failed",
            mediaError:
              video.error?.code || null,
            mediaErrorMessage:
              video.error?.message || "",
            readyState:
              video.readyState
          });
        }, VIDEO_CONFIG.probeTimeoutMs);

      video.muted = true;
      video.preload = "metadata";
      video.playsInline = true;

      video.style.position = "fixed";
      video.style.left = "-99999px";
      video.style.top = "-99999px";
      video.style.width = "1px";
      video.style.height = "1px";
      video.style.opacity = "0";
      video.style.pointerEvents = "none";

      video.addEventListener(
        "loadedmetadata",
        () => {
          finish({
            browserState: "playable",
            mediaError: null,
            mediaErrorMessage: "",
            readyState:
              video.readyState,
            duration:
              Number.isFinite(video.duration)
                ? video.duration
                : null
          });
        },
        { once: true }
      );

      video.addEventListener(
        "canplay",
        () => {
          finish({
            browserState: "playable",
            mediaError: null,
            mediaErrorMessage: "",
            readyState:
              video.readyState,
            duration:
              Number.isFinite(video.duration)
                ? video.duration
                : null
          });
        },
        { once: true }
      );

      video.addEventListener(
        "error",
        () => {
          finish({
            browserState: "failed",
            mediaError:
              video.error?.code || null,
            mediaErrorMessage:
              video.error?.message || "",
            readyState:
              video.readyState
          });
        },
        { once: true }
      );

      document.body.appendChild(video);

      video.src = url;
      video.load();
    });
  }

  // ------------------------------------------------------------
  // HTTP REQUEST
  // ------------------------------------------------------------

  async function fetchWithTimeout(
    url,
    method = "HEAD"
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        VIDEO_CONFIG.timeoutMs
      );

    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(url) {
    try {
      let response =
        await fetchWithTimeout(
          url,
          "HEAD"
        );

      if (
        response.status === 405 ||
        response.status === 501
      ) {
        response =
          await fetchWithTimeout(
            url,
            "GET"
          );
      }

      if (
        response.status === 429
      ) {
        for (
          let attempt = 1;
          attempt <= VIDEO_CONFIG.retries429;
          attempt++
        ) {
          console.log(
            `429 retry ${attempt}/${VIDEO_CONFIG.retries429}: ${url}`
          );

          await sleep(
            VIDEO_CONFIG.retryDelayMs *
            attempt
          );

          response =
            await fetchWithTimeout(
              url,
              "HEAD"
            );

          if (
            response.status === 405 ||
            response.status === 501
          ) {
            response =
              await fetchWithTimeout(
                url,
                "GET"
              );
          }

          if (
            response.status !== 429
          ) {
            break;
          }
        }
      }

      return {
        status: response.status,
        finalUrl:
          response.url || url,
        contentType:
          response.headers.get(
            "content-type"
          ) || "",
        method: "HEAD"
      };

    } catch (headError) {

      try {
        let response =
          await fetchWithTimeout(
            url,
            "GET"
          );

        if (
          response.status === 429
        ) {
          for (
            let attempt = 1;
            attempt <= VIDEO_CONFIG.retries429;
            attempt++
          ) {
            console.log(
              `429 retry ${attempt}/${VIDEO_CONFIG.retries429}: ${url}`
            );

            await sleep(
              VIDEO_CONFIG.retryDelayMs *
              attempt
            );

            response =
              await fetchWithTimeout(
                url,
                "GET"
              );

            if (
              response.status !== 429
            ) {
              break;
            }
          }
        }

        return {
          status: response.status,
          finalUrl:
            response.url || url,
          contentType:
            response.headers.get(
              "content-type"
            ) || "",
          method: "GET"
        };

      } catch (getError) {

        return {
          status: null,
          finalUrl: url,
          contentType: "",
          method: null,
          error:
            getError || headError
        };
      }
    }
  }

  // ------------------------------------------------------------
  // CHECK VIDEOS
  // ------------------------------------------------------------

  async function checkVideos(videos) {
    const results =
      new Array(videos.length);

    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index =
          nextIndex++;

        if (
          index >= videos.length
        ) {
          break;
        }

        const video =
          videos[index];

        console.log(
          `[${index + 1}/${videos.length}] Checking video: ${video.label}`
        );

        const sourceResults = [];

        /*
         * Test every source.
         *
         * Browser probe is the old working check.
         * HTTP verification is additional evidence.
         *
         * If any source is playable, the VIDEO is healthy.
         */
        for (
          const source of video.sources
        ) {
          console.log(
            `  Source: ${source.url}`
          );

          const browser =
            await probeVideoSource(
              source.url
            );

          let http;

          if (
            browser.browserState ===
            "playable"
          ) {
            http = {
              status: null,
              finalUrl: source.url,
              contentType: "",
              method: null
            };
          } else {
            http =
              await request(
                source.url
              );
          }

          sourceResults.push({
            ...source,
            ...http,
            browserState:
              browser.browserState,
            mediaError:
              browser.mediaError,
            mediaErrorMessage:
              browser.mediaErrorMessage,
            readyState:
              browser.readyState,
            duration:
              browser.duration
          });

          /*
           * One playable source means the video itself
           * is working. Do not punish it because another
           * fallback source is dead.
           */
          if (
            browser.browserState ===
            "playable"
          ) {
            break;
          }

          await sleep(
            VIDEO_CONFIG.delayMs
          );
        }

        results[index] = {
          ...video,
          sourceResults
        };

        const category =
          classify(
            results[index]
          );

        if (
          category ===
          "confirmed-broken"
        ) {
          console.log(
            `Ã¢ÂÅ’ VIDEO FAILURE: ${video.label}`
          );
        } else if (
          category === "2xx"
        ) {
          console.log(
            `200 VIDEO LOADED: ${video.label}`
          );
        } else if (
          category === "429"
        ) {
          console.log(
            `429 VIDEO: ${video.label}`
          );
        } else if (
          category === "network"
        ) {
          console.log(
            `Ã¢ÂÅ’ NETWORK/CORS: ${video.label}`
          );
        } else {
          console.log(
            `MANUAL VIDEO: ${video.label}`
          );
        }

        await sleep(
          VIDEO_CONFIG.delayMs
        );
      }
    }

    const workers = [];

    for (
      let i = 0;
      i <
      Math.min(
        VIDEO_CONFIG.concurrency,
        videos.length
      );
      i++
    ) {
      workers.push(
        worker()
      );
    }

    await Promise.all(
      workers
    );

    return results;
  }

  // ------------------------------------------------------------
  // CLASSIFICATION
  // ------------------------------------------------------------

  function classify(result) {
    const sources =
      result.sourceResults || [];

    if (!sources.length) {
      return "manual";
    }

    /*
     * ----------------------------------------------------------
     * SUCCESS
     * ----------------------------------------------------------
     *
     * This is deliberately browser-first.
     *
     * If the browser successfully loads media, the video
     * is healthy even if HTTP fetch cannot inspect it.
     */

    if (
      sources.some(
        source =>
          source.browserState ===
          "playable"
      )
    ) {
      return "2xx";
    }

    /*
     * ----------------------------------------------------------
     * DEFINITIVE BROKEN HTTP RESPONSE
     * ----------------------------------------------------------
     */

    if (
      sources.some(
        source =>
          source.status === 404 ||
          source.status === 410 ||
          (
            source.status >= 500 &&
            source.status <= 599
          )
      )
    ) {
      return "confirmed-broken";
    }

    /*
     * ----------------------------------------------------------
     * BROWSER MEDIA FAILURE
     * ----------------------------------------------------------
     *
     * This preserves the old checker behavior.
     *
     * If the browser failed every discovered source,
     * and there is no successful fallback, classify the
     * visible video as confirmed broken.
     */

    const allBrowserFailed =
      sources.every(
        source =>
          source.browserState ===
          "failed"
      );

    if (
      allBrowserFailed
    ) {
      return "confirmed-broken";
    }

    /*
     * ----------------------------------------------------------
     * 429
     * ----------------------------------------------------------
     */

    if (
      sources.some(
        source =>
          source.status === 429
      )
    ) {
      return "429";
    }

    /*
     * ----------------------------------------------------------
     * OTHER 4XX
     * ----------------------------------------------------------
     */

    if (
      sources.some(
        source =>
          source.status >= 400 &&
          source.status <= 499 &&
          source.status !== 429
      )
    ) {
      return "4xx";
    }

    /*
     * ----------------------------------------------------------
     * NETWORK / CORS
     * ----------------------------------------------------------
     */

    if (
      sources.some(
        source =>
          source.status === null
      )
    ) {
      return "network";
    }

    /*
     * ----------------------------------------------------------
     * MANUAL
     * ----------------------------------------------------------
     */

    return "manual";
  }

  // ------------------------------------------------------------
  // BUILD TXT REPORT
  // ------------------------------------------------------------

  function buildReport(results) {
    const finished =
      new Date();

    const summary = {
      total: results.length,
      successful: 0,
      redirects: 0,
      clientErrors: 0,
      rateLimited: 0,
      serverErrors: 0,
      network: 0,
      manual: 0,
      confirmedBroken: 0
    };

    const broken = [];
    const clientErrors = [];
    const rateLimited = [];
    const redirects = [];
    const networkErrors = [];
    const manual = [];

    for (
      const result of results
    ) {
      const category =
        classify(result);

      switch (
        category
      ) {
        case "2xx":
          summary.successful++;
          break;

        case "3xx":
          summary.redirects++;
          redirects.push(result);
          break;

        case "4xx":
          summary.clientErrors++;
          clientErrors.push(result);
          break;

        case "429":
          summary.rateLimited++;
          rateLimited.push(result);
          break;

        case "confirmed-broken":

          summary.confirmedBroken++;

          broken.push(result);

          if (
            result.sourceResults.some(
              source =>
                source.status >= 500
            )
          ) {
            summary.serverErrors++;
          } else {
            summary.clientErrors++;
          }

          break;

        case "network":
          summary.network++;
          networkErrors.push(result);
          break;

        case "manual":
          summary.manual++;
          manual.push(result);
          break;
      }
    }

    let report = "";

    const add = text =>
      report += text + "\n";

    add(
      "BROKEN VIDEO CHECKER"
    );

    add(
      "========================================"
    );

    add("");

    add(
      `Extractor: ${VIDEO_CONFIG.version}`
    );

    add(
      `Checker: ${VIDEO_CONFIG.name}`
    );

    add(
      `Page checked: ${location.href}`
    );

    add(
      `Page title: ${
        document.title ||
        "(untitled)"
      }`
    );

    add(
      `Started: ${
        START_TIME.toISOString()
      }`
    );

    add(
      `Finished: ${
        finished.toISOString()
      }`
    );

    add(
      `Duration: ${(
        (finished -
          START_TIME) /
        1000
      ).toFixed(1)} seconds`
    );

    add("");

    // ----------------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------------

    add(
      "PAGE SUMMARY"
    );

    add(
      "----------------------------------------"
    );

    add(
      `Visible videos checked: ${summary.total}`
    );

    add(
      `Successful (2xx):       ${summary.successful}`
    );

    add(
      `Redirects (3xx):        ${summary.redirects}`
    );

    add(
      `Client errors (4xx):    ${summary.clientErrors}`
    );

    add(
      `Rate limited (429):     ${summary.rateLimited}`
    );

    add(
      `Server errors (5xx):    ${summary.serverErrors}`
    );

    add(
      `Network/CORS errors:    ${summary.network}`
    );

    add(
      `Manual verification:    ${summary.manual}`
    );

    add(
      `Confirmed broken:       ${summary.confirmedBroken}`
    );

    add("");

    // ----------------------------------------------------------
    // BROKEN VIDEOS
    // ----------------------------------------------------------

    add(
      "BROKEN VISIBLE VIDEOS"
    );

    add(
      "========================================"
    );

    add("");

    if (
      !broken.length
    ) {

      add(
        "No confirmed broken visible videos found."
      );

    } else {

      broken.forEach(
        (result, index) => {

          add(
            `[${index + 1}] BROKEN VISIBLE VIDEO`
          );

          add(
            "----------------------------------------"
          );

          add(
            `Source page: ${location.href}`
          );

          add(
            `Video: ${result.label}`
          );

          add(
            `Page section: ${result.context}`
          );

          add("");

          add(
            "VIDEO SOURCES:"
          );

          result.sourceResults.forEach(
            source => {

              add(
                `- ${source.url}`
              );

              add(
                `  Status: ${
                  source.status ??
                  "No HTTP response"
                }`
              );

              add(
                `  Browser state: ${
                  source.browserState ||
                  "unknown"
                }`
              );

              if (
                source.contentType
              ) {
                add(
                  `  Content-Type: ${source.contentType}`
                );
              }

              if (
                source.mediaError
              ) {
                add(
                  `  Media error code: ${source.mediaError}`
                );
              }
            }
          );

          add("");

          add(
            "HOW TO REPRODUCE:"
          );

          add(
            `1. Open: ${location.href}`
          );

          add(
            `2. Locate the visible video: "${result.label}"`
          );

          add(
            "3. Attempt to play the video."
          );

          add(
            "4. Observe that the video fails to load/play."
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // OTHER 4XX
    // ----------------------------------------------------------

    add(
      "OTHER VISIBLE-VIDEO CLIENT ERRORS"
    );

    add(
      "========================================"
    );

    add("");

    if (
      !clientErrors.length
    ) {

      add("None.");

    } else {

      clientErrors.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Video: ${result.label}`
          );

          add(
            `Source page: ${location.href}`
          );

          result.sourceResults
            .filter(
              source =>
                source.status >= 400 &&
                source.status <= 499 &&
                source.status !== 429
            )
            .forEach(
              source => {

                add(
                  `Video URL: ${source.url}`
                );

                add(
                  `Status: ${source.status}`
                );
              }
            );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // RATE LIMITED
    // ----------------------------------------------------------

    add(
      "RATE LIMITED VIDEOS"
    );

    add(
      "========================================"
    );

    add("");

    if (
      !rateLimited.length
    ) {

      add("None.");

    } else {

      rateLimited.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Video: ${result.label}`
          );

          add(
            `Source page: ${location.href}`
          );

          result.sourceResults
            .filter(
              source =>
                source.status === 429
            )
            .forEach(
              source => {

                add(
                  `Video URL: ${source.url}`
                );

                add(
                  "Status: 429 Too Many Requests"
                );
              }
            );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // NETWORK / CORS
    // ----------------------------------------------------------

    add(
      "NETWORK / CORS FAILURES"
    );

    add(
      "========================================"
    );

    add("");

    if (
      !networkErrors.length
    ) {

      add("None.");

    } else {

      networkErrors.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Video: ${result.label}`
          );

          add(
            `Source page: ${location.href}`
          );

          result.sourceResults
            .filter(
              source =>
                source.status === null
            )
            .forEach(
              source => {

                add(
                  `Video URL: ${source.url}`
                );

                add(
                  `Error: ${
                    source.error?.message ||
                    "Network/CORS failure"
                  }`
                );
              }
            );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // MANUAL VERIFICATION
    // ----------------------------------------------------------

    add(
      "VIDEOS REQUIRING MANUAL VERIFICATION"
    );

    add(
      "========================================"
    );

    add("");

    if (
      !manual.length
    ) {

      add("None.");

    } else {

      manual.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Video: ${result.label}`
          );

          add(
            `Source page: ${location.href}`
          );

          add(
            "Browser/media state did not provide enough evidence for automatic confirmation."
          );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // REDIRECTS
    // ----------------------------------------------------------

    add(
      "REDIRECTS"
    );

    add(
      "========================================"
    );

    add("");

    if (
      !redirects.length
    ) {

      add(
        "No redirects reported."
      );

    } else {

      redirects.forEach(
        (result, index) => {

          add(`[${index + 1}]`);

          add(
            `Video: ${result.label}`
          );

          add(
            `Source page: ${location.href}`
          );

          result.sourceResults
            .filter(
              source =>
                source.status >= 300 &&
                source.status < 400
            )
            .forEach(
              source => {

                add(
                  `Video URL: ${source.url}`
                );

                add(
                  `Final URL: ${source.finalUrl}`
                );

                add(
                  `Status: ${source.status}`
                );
              }
            );

          add("");
        }
      );
    }

    add("");

    // ----------------------------------------------------------
    // INTERPRETATION
    // ----------------------------------------------------------

    add(
      "INTERPRETATION"
    );

    add(
      "========================================"
    );

    add(
      "Only visible videos on the current page were checked."
    );

    add(
      "Hidden videos and implementation resources were excluded."
    );

    add(
      "External video sources are supported."
    );

    add(
      "JavaScript, CSS, API, robots.txt and sitemap resources were excluded."
    );

    add(
      "Direct video sources, <source> elements and common lazy-load attributes were considered."
    );

    add(
      "The browser media probe is used as the primary video availability check."
    );

    add(
      "404/410 and 5xx responses are treated as confirmed broken."
    );

    add(
      "A browser failure across all discovered sources is also treated as confirmed broken, preserving the established video-check behavior."
    );

    add(
      "A video with multiple sources is considered healthy when at least one source successfully loads."
    );

    add(
      "429 responses are treated as rate-limited."
    );

    add(
      "Network/CORS failures are recorded separately when HTTP verification cannot be completed."
    );

    add(
      "This scan covers this page only; navigate to another page and run the checker again."
    );

    add("");

    add(
      "END OF REPORT"
    );

    add(
      "========================================"
    );

    return {
      report,
      broken
    };
  }

  // ------------------------------------------------------------
  // DOWNLOAD ONLY WHEN CONFIRMED BROKEN
  // ------------------------------------------------------------

  function downloadReport(report) {
    const blob =
      new Blob(
        [report],
        {
          type:
            "text/plain;charset=utf-8"
        }
      );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download =
      getReportFileName();

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(url),
      1000
    );

    console.log(
      `Report saved as: ${getReportFileName()}`
    );
  }

  // ------------------------------------------------------------

    const items = collectVisibleVideos();
    const results = await checkVideos(items);
    const built = buildReport(results);
    return { items, results, report: built.report, broken: built.broken, manual: results.filter(result => classify(result) === "manual").length };
  }

  // ------------------------------------------------------------
  // MASTER CLASSIFICATION / DOWNLOAD LAYER
  // ------------------------------------------------------------

  function getPageBaseName() {
    const path = location.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);

    let name = parts.length ? parts[parts.length - 1] : "homepage";

    try { name = decodeURIComponent(name); } catch {}

    name = name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return name || "homepage";
  }
  function downloadCategoryReport(report, category, count) {
    const filename = `${getPageBaseName()} - ${category}.txt`;
    bucket[category] = { filename, content: report, count };
    console.log(`Report generated: ${filename} (${count} confirmed ${category} defect(s))`);
  }

  function classifyReport(report, category, count) {
    return [
      `WEBSITE DEFECT CHECKER v1124 Ã¢â‚¬â€ ${category.toUpperCase()} REPORT`,
      "========================================",
      "",
      `Master checker: ${MASTER.name}`,
      `Defect classification: ${category.toUpperCase()}`,
      `Confirmed ${category} defects: ${count}`,
      "",
      report
    ].join("\n");
  }

  console.log("Starting link scan...");
  const linkScan = await run_linkEngine();

  console.log("Starting image scan...");
  const imageScan = await run_imageEngine();

  console.log("Starting video scan...");
  const videoScan = await run_videoEngine();

  const counts = {
    link: linkScan.broken.length,
    image: imageScan.broken.length,
    video: videoScan.broken.length
  };

  const summary = {
    LINK: {
      checked: linkScan.items.length,
      manual: linkScan.manual,
      defects: counts.link
    },
    IMAGE: {
      checked: imageScan.items.length,
      manual: imageScan.manual,
      defects: counts.image
    },
    VIDEO: {
      checked: videoScan.items.length,
      manual: videoScan.manual,
      defects: counts.video
    }
  };

  bucket.__summary = summary;

  console.log(`ULTIMATE LINK SUMMARY: CHECKED ${summary.LINK.checked} | MANUAL ${summary.LINK.manual} | DEFECTS ${summary.LINK.defects}`);
  console.log(`ULTIMATE IMAGE SUMMARY: CHECKED ${summary.IMAGE.checked} | MANUAL ${summary.IMAGE.manual} | DEFECTS ${summary.IMAGE.defects}`);
  console.log(`ULTIMATE VIDEO SUMMARY: CHECKED ${summary.VIDEO.checked} | MANUAL ${summary.VIDEO.manual} | DEFECTS ${summary.VIDEO.defects}`);

  if (counts.link > 0) {
    downloadCategoryReport(
      classifyReport(linkScan.report, "link", counts.link),
      "link",
      counts.link
    );
  } else {
    console.log("No confirmed broken links Ã¢â‚¬â€ no link report downloaded.");
  }

  if (counts.image > 0) {
    downloadCategoryReport(
      classifyReport(imageScan.report, "image", counts.image),
      "image",
      counts.image
    );
  } else {
    console.log("No confirmed broken images Ã¢â‚¬â€ no image report downloaded.");
  }

  if (counts.video > 0) {
    downloadCategoryReport(
      classifyReport(videoScan.report, "video", counts.video),
      "video",
      counts.video
    );
  } else {
    console.log("No confirmed broken videos Ã¢â‚¬â€ no video report downloaded.");
  }

  const total = counts.link + counts.image + counts.video;

  if (total > 0) {
    console.log(`
Ã¢â€¢â€Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢â€”
Ã¢â€¢â€˜              Ã°Å¸â€™Â¥ JACKPOT! Ã°Å¸â€™Â¥           Ã¢â€¢â€˜
Ã¢â€¢Å¡Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
Confirmed defects found on this page.
`);
  } else {
    console.log(`
========================================
NO CONFIRMED DEFECTS
========================================
`);
  }

  console.log(`
========================================
MASTER SCAN COMPLETE
========================================

Checker: ${MASTER.name}
Page: ${location.href}

BROKEN LINKS:  ${counts.link}
BROKEN IMAGES: ${counts.image}
BROKEN VIDEOS: ${counts.video}

TOTAL CONFIRMED DEFECTS: ${total}

${
  counts.link > 0
    ? `LINK REPORT:  ${getPageBaseName()} - link.txt`
    : "LINK REPORT:  none"
}
${
  counts.image > 0
    ? `IMAGE REPORT: ${getPageBaseName()} - image.txt`
    : "IMAGE REPORT: none"
}
${
  counts.video > 0
    ? `VIDEO REPORT: ${getPageBaseName()} - video.txt`
    : "VIDEO REPORT: none"
}

========================================
`);

      return bucket;
    }, bucket);

    const ids = [];
    for (const [category, item] of Object.entries(result || {})) {
      if (category === "__summary") continue;
      const id = crypto.randomUUID();
      const report={
        id, category, filename: item.filename, content: item.content,
        count: item.count, createdAt: new Date().toISOString(), page: page.url()
      };
      reports.set(id, report);
      if (!job.incognito) await persistReport(report);
      ids.push(id);
    }

    return {
      page: page.url(),
      title: await page.title().catch(() => ""),
      summary: result?.__summary || {
        LINK:{checked:0,manual:0,defects:0},
        IMAGE:{checked:0,manual:0,defects:0},
        VIDEO:{checked:0,manual:0,defects:0}
      },
      reports: ids.map(id => ({
        id, category: reports.get(id).category, filename: reports.get(id).filename,
        count: reports.get(id).count
      }))
    };
  } finally {
    await removeBusyNavigationGuard(page);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

function cleanupIncognitoJobs(browser) {
  for (const [id, job] of checkerJobs) {
    if (job.browser === browser && job.incognito) {
      for (const report of job.reports || []) { if (report?.id) reports.delete(report.id); }
      checkerJobs.delete(id);
    }
  }
  for (const [id, job] of extractorJobs) { if (job.browser === browser && job.incognito) extractorJobs.delete(id); }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { status: "RUNNER_LIVE", product: "v1124 WorkStation" });
    }

    if (req.method === "POST" && req.url === "/browser/open") {
      const body = await readBody(req);
      const browser = body.browser;
      const url = typeof body.url === "string" && body.url.trim()
        ? body.url.trim()
        : "about:blank";
      const incognito = body.incognito === true;

      if (!["chrome", "firefox", "edge"].includes(browser)) {
        return json(res, 400, { error: "Unsupported browser." });
      }

      const session = await launch(browser, url, incognito);
      return json(res, 200, {
        status: "BROWSER_LIVE",
        browser,
        profile: incognito ? "v1124 WorkStation Ã¢â‚¬Â¢ Incognito" : "v1124 WorkStation",
        currentPage: session.page.url(),
        runner: browser === "edge" ? "local-playwright-edge" : "local-playwright",
      });
    }

    if (req.method === "POST" && req.url === "/browser/close") {
      const body = await readBody(req);
      const browser = body.browser;
      if (!["chrome", "firefox", "edge"].includes(browser)) {
        return json(res, 400, { error: "Unsupported browser." });
      }
      const session = sessions.get(browser);
      if (session) {
        const wasIncognito = session.incognito === true;
        await session.context.close().catch(() => {});
        sessions.delete(browser);
        if (wasIncognito) cleanupIncognitoJobs(browser);
      }
      return json(res, 200, { status: "BROWSER_CLOSED", browser });
    }

    if (req.method === "GET" && req.url?.startsWith("/browser/debug-tabs")) {
      const query = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
      const browser = query.get("browser") || "chrome";
      const session = sessions.get(browser);

      if (!session) {
        return json(res, 404, { error: "No live browser session." });
      }

      const pages = session.context.pages().filter(page => !page.isClosed());
      const tabs = [];

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];

        let state = {
          visible: null,
          focused: null,
          tabMarker: null,
        };

        try {
          state = await page.evaluate(() => ({
            visible: document.visibilityState === "visible",
            focused: document.hasFocus(),
            tabMarker:
              document.documentElement?.getAttribute("data-v1124-tab-id") || null,
          }));
        } catch {}

        tabs.push({
          index,
          url: page.url(),
          title: await page.title().catch(() => ""),
          visible: state.visible,
          focused: state.focused,
          tabMarker: state.tabMarker,
          isSessionPage: page === session.page,
        });
      }

      return json(res, 200, {
        browser,
        activeTabId: session.activeTabId ?? null,
        sessionPage: session.page && !session.page.isClosed()
          ? session.page.url()
          : null,
        tabs,
      });
    }
    if (req.method === "GET" && req.url?.startsWith("/browser/debug-tabs")) {
      const query = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
      const browser = query.get("browser") || "chrome";
      const session = sessions.get(browser);

      if (!session) {
        return json(res, 404, { error: "No live browser session." });
      }

      const pages = session.context.pages().filter(page => !page.isClosed());
      const tabs = [];

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];

        let state = {
          visible: null,
          focused: null,
        };

        try {
          state = await page.evaluate(() => ({
            visible: document.visibilityState === "visible",
            focused: document.hasFocus(),
          }));
        } catch {}

        tabs.push({
          index,
          url: page.url(),
          title: await page.title().catch(() => ""),
          visible: state.visible,
          focused: state.focused,
          isSessionPage: page === session.page,
        });
      }

      return json(res, 200, {
        browser,
        sessionPage: session.page && !session.page.isClosed()
          ? session.page.url()
          : null,
        tabs,
      });
    }
    if (req.method === "GET" && req.url?.startsWith("/browser/current?")) {
      const browser = new URL(req.url, `http://127.0.0.1:${PORT}`)
        .searchParams.get("browser");
      const session = sessions.get(browser);
      const activePage = session ? await getActivePage(session) : null;
      if (!session || !activePage) {
        return json(res, 404, { error: "No live browser session." });
      }
      return json(res, 200, {
        status: "BROWSER_LIVE",
        browser,
        currentPage: activePage.url(),
        title: await activePage.title().catch(() => ""),
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/browser/downloads?")) {
      const browser = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get("browser");
      const session = sessions.get(browser);
      if (!session || session.page.isClosed()) {
        return json(res, 404, { error: "No live browser session." });
      }
      await scanBrowserDownloads(browser, session);
      const downloads = session.downloads.splice(0);
      return json(res, 200, { status: "BROWSER_DOWNLOADS", browser, downloads });
    }


    if (req.method === "POST" && req.url === "/extractor/run") {
      const body = await readBody(req);
      const browser = body.browser;
      const extractor = body.extractor;
      const incognito = body.incognito === true;
      if (!['chrome','firefox','edge'].includes(browser)) return json(res, 400, { error: "Unsupported browser." });
      if (!EXTRACTOR_PATHS[extractor]) return json(res, 400, { error: "This extractor is not connected to the WorkStation runner." });
      const session = sessions.get(browser);
      const activePage = session ? await getActivePage(session) : null;
      if (!session || !activePage) return json(res, 409, { error: "No live Investigation Browser session." });
      const job = { id: crypto.randomUUID(), browser, incognito, status: "RUNNING", messages: [], files: [], error: null };
      extractorJobs.set(job.id, job);
      void runAcademyExtractor(activePage, job, extractor);
      return json(res, 202, { status: "EXTRACTOR_RUNNING", jobId: job.id });
    }

    if (req.method === "GET" && req.url?.startsWith("/extractor/status?")) {
      const query = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
      const job = extractorJobs.get(query.get("job"));
      if (!job) return json(res, 404, { error: "Extractor job not found." });
      return json(res, 200, { status: job.status, messages: job.messages, files: job.files, summary: job.summary, master: job.master || null, error: job.error });
    }

    if (req.method === "POST" && req.url === "/extractor/merge") {
      const body = await readBody(req);
      const files = Array.isArray(body.files) ? body.files.filter(file => file?.name && file?.content) : [];
      if (!files.length) return json(res, 400, { error: "No extracted JSON files supplied." });
      const job = { id: crypto.randomUUID(), status: "RUNNING", messages: [], master: null, error: null };
      extractorJobs.set(job.id, job);
      void runMergeJob(job, files);
      return json(res, 202, { status: "MERGE_RUNNING", jobId: job.id });
    }

    if (req.method === "GET" && req.url === "/account") {
      const account = await loadAccount();
      const existingWorkspaceCount = (await loadWorkspaces()).length;
      const lifetimeCount = Math.max(Number(account?.stats?.workspacesCreated || 0), existingWorkspaceCount);
      if (lifetimeCount !== Number(account?.stats?.workspacesCreated || 0)) {
        account.stats = { ...(account.stats || {}), workspacesCreated: lifetimeCount };
        await persistAccount(account);
      }
      return json(res, 200, { account });
    }

    if (req.method === "PUT" && req.url === "/account") {
      const body = await readBody(req);
      if (!body?.account || !["NOVICE","AMATEUR","PRO"].includes(body.account.tier)) return json(res, 400, { error: "Valid account tier is required." });
      const current = await loadAccount();
      const incomingCount = Number(body.account?.stats?.workspacesCreated);
      const currentCount = Number(current?.stats?.workspacesCreated || 0);
      const account = {
        ...DEFAULT_ACCOUNT,
        ...body.account,
        profile: { ...DEFAULT_ACCOUNT.profile, ...(body.account.profile || {}) },
        preferences: { ...DEFAULT_ACCOUNT.preferences, ...(body.account.preferences || {}) },
        stats: { ...(current?.stats || DEFAULT_ACCOUNT.stats), ...(body.account.stats || {}), workspacesCreated: Math.max(currentCount, Number.isFinite(incomingCount) ? incomingCount : 0) },
      };
      await persistAccount(account);
      return json(res, 200, { status: "ACCOUNT_SAVED", account });
    }

    if (req.method === "GET" && req.url === "/workspaces") {
      const workspaces = await loadWorkspaces();
      return json(res, 200, { workspaces: workspaces.map(({state, ...meta}) => meta) });
    }

    if (req.method === "GET" && req.url?.startsWith("/workspaces/")) {
      const id = decodeURIComponent(req.url.slice("/workspaces/".length));
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) return json(res, 400, { error: "Invalid workspace id." });
      const workspace = await loadWorkspace(id);
      if (!workspace) return json(res, 404, { error: "Workspace not found." });
      return json(res, 200, { workspace });
    }

    if (req.method === "POST" && req.url === "/workspaces") {
      const body = await readBody(req); const incoming = body?.workspace;
      if (!incoming?.id || !incoming?.name || !incoming?.state) return json(res, 400, { error: "Workspace id, name, and state are required." });
      if (!/^[a-zA-Z0-9_-]+$/.test(String(incoming.id))) return json(res, 400, { error: "Invalid workspace id." });
      const workspace = { id:String(incoming.id), name:String(incoming.name).trim(), createdAt:String(incoming.createdAt||new Date().toISOString()), updatedAt:String(incoming.updatedAt||new Date().toISOString()), state:incoming.state };
      if (!workspace.name) return json(res, 400, { error: "Workspace name is required." });
      const existing = await loadWorkspace(workspace.id);
      await persistWorkspace(workspace);
      if (!existing) { const account = await loadAccount(); account.stats = { ...(account.stats || {}), workspacesCreated: Number(account.stats?.workspacesCreated || 0) + 1 }; await persistAccount(account); }
      return json(res, 201, { status:"WORKSPACE_SAVED", workspace });
    }

    if (req.method === "DELETE" && req.url?.startsWith("/workspaces/")) {
      const id=decodeURIComponent(req.url.slice("/workspaces/".length));
      if(!/^[a-zA-Z0-9_-]+$/.test(id)) return json(res,400,{error:"Invalid workspace id."});
      try { await fs.unlink(`${WORKSPACE_DIR}/${id}.json`); } catch(error) { if(error?.code==="ENOENT") return json(res,404,{error:"Workspace not found."}); throw error; }
      try { await fs.rm(`${WORKSPACE_DIR}/${id}`,{recursive:true,force:true}); } catch {}
      return json(res,200,{status:"WORKSPACE_DELETED",id});
    }

    if (req.method === "POST" && req.url === "/sources/rename") {
      const body = await readBody(req);
      const id = String(body?.id || "");
      const name = String(body?.name || "").trim();
      if (!id || id === "platform-project-instruction") return json(res, 400, { error: "This source cannot be renamed." });
      if (!name) return json(res, 400, { error: "A source name is required." });
      const workspaceId = workspaceIdFromRequest(req);
      const sourceDir = workspaceId ? workspaceSourceDir(workspaceId) : SOURCE_DIR;
      const sourcePath = `${sourceDir}/${id}.json`;
      try {
        let actualPath = sourcePath;
        let source;
        try {
          source = JSON.parse(await fs.readFile(actualPath, "utf8"));
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
          // Resolve the source by its stored id as a fallback. This keeps
          // rename working for sources created before the current storage
          // filename convention was introduced.
          const names = await fs.readdir(sourceDir);
          for (const filename of names.filter((filename) => filename.endsWith(".json"))) {
            const candidatePath = `${sourceDir}/${filename}`;
            try {
              const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
              if (String(candidate?.id || "") === id) {
                actualPath = candidatePath;
                source = candidate;
                break;
              }
            } catch {}
          }
          if (!source) return json(res, 404, { error: "Source not found." });
        }
        source.name = name;
        await fs.writeFile(actualPath, JSON.stringify(source), "utf8");
        return json(res, 200, { status: "SOURCE_RENAMED", source: { ...source, content: undefined } });
      } catch (error) {
        throw error;
      }
    }

    if (req.method === "DELETE" && req.url?.startsWith("/sources/")) {
      const id = decodeURIComponent(req.url.slice("/sources/".length));
      if (!id || id === "platform-project-instruction") return json(res, 400, { error: "This source cannot be deleted." });
      const workspaceId = workspaceIdFromRequest(req);
      const sourceDir = workspaceId ? workspaceSourceDir(workspaceId) : SOURCE_DIR;
      const sourcePath = `${sourceDir}/${id}.json`;
      try {
        await fs.unlink(sourcePath);
      } catch (error) {
        if (error?.code === "ENOENT") return json(res, 404, { error: "Source not found." });
        throw error;
      }
      return json(res, 200, { status: "SOURCE_DELETED", id });
    }

    if (req.method === "POST" && req.url === "/sources/upload") {
      const body = await readBody(req);
      if (!body?.name || !body?.content) return json(res, 400, { error: "A merged Master JSON is required." });
      const workspaceId = workspaceIdFromRequest(req);
      if (!workspaceId) return json(res, 409, { error: "A workspace is required for source storage." });
      const source = { id: crypto.randomUUID(), name: body.name, kind: "SOURCE", createdAt: new Date().toISOString(), content: body.content, origin: "v1124 extractor merge" };
      await persistSource(source, workspaceId);
      return json(res, 201, { status: "SOURCE_UPLOADED", source: { ...source, content: undefined } });
    }

    if (req.method === "GET" && req.url === "/sources") {
      const workspaceId = workspaceIdFromRequest(req);
      const sourceList = workspaceId ? await loadSources(workspaceId) : await loadSources();
      return json(res, 200, { sources: [builtInInstructionSource(), ...sourceList.map(({content, ...source}) => source)] });
    }

    if (req.method === "GET" && req.url === "/instructions/platform") {
      const content = await fs.readFile(INSTRUCTION_SOURCE_PATH, "utf8");
      return json(res, 200, { name: "Platform-Based Project Instruction", filename: "1. Project Instructions.txt", kind: "INSTRUCTION", content });
    }

    if (req.method === "POST" && req.url === "/browser/active-tab-marker") {
      const body = await readBody(req);

      console.log(
        `[active-tab-marker] tabId=${body?.tabId} ok=${body?.ok}` +
        (body?.error ? ` error=${body.error}` : "") +
        (body?.result ? ` result=${JSON.stringify(body.result)}` : "")
      );

      return json(res, 200, { status: "MARKER_RESULT_RECEIVED" });
    }
    if (req.method === "POST" && req.url === "/browser/active-tab") {
      const body = await readBody(req);
      const browser = body?.browser;
      const tabId = body?.tabId;
      const windowId = body?.windowId;

      if (browser !== "chrome" || !Number.isInteger(tabId)) {
        return json(res, 400, { error: "Invalid active-tab payload." });
      }

      const session = sessions.get(browser);

      if (!session) {
        return json(res, 409, { error: "No live Chrome session." });
      }

      session.activeTabId = tabId;
      session.activeWindowId = Number.isInteger(windowId) ? windowId : null;

      console.log(
        `[active-tab] Chrome selected tabId=${tabId}` +
        (session.activeWindowId !== null ? ` windowId=${session.activeWindowId}` : "")
      );

      return json(res, 200, {
        status: "ACTIVE_TAB_RECORDED",
        browser,
        tabId,
        windowId: session.activeWindowId
      });
    }

    if (req.method === "POST" && req.url === "/checker/ultimate") {
      const body = await readBody(req);
      const browser = body.browser;
      const incognito = body.incognito === true;

      if (!["chrome", "firefox", "edge"].includes(browser)) {
        return json(res, 400, { error: "Unsupported browser." });
      }

      const session = sessions.get(browser);
      const activePage = session
        ? await getActivePage(session, {
            requireActive: browser === "chrome"
          })
        : null;

      if (!session || !activePage || activePage.isClosed()) {
        return json(res, 409, {
          error: browser === "chrome"
            ? "No active Chrome tab available for Ultimate Check."
            : "No live Investigation Browser session."
        });
      }

      const job = {
        id: crypto.randomUUID(),
        browser,
        incognito,
        status: "RUNNING",
        messages: [],
        reports: [],
        error: null
      };
      checkerJobs.set(job.id, job);

      void runUltimateChecker(activePage, job)
        .then(result => {
          if (job.navigationCancelled) {
            job.status = "CANCELLED";
            job.error = null;
            return;
          }
          job.status = "COMPLETE";
          job.reports = result.reports;
          job.page = result.page;
          job.title = result.title;
          job.summary = result.summary;
        })
        .catch(error => {
          if (job.navigationCancelled) return;
          job.status = "FAILED";
          job.error = error instanceof Error ? error.message : "Ultimate checker failed.";
        });

      return json(res, 202, {
        status: "ULTIMATE_CHECK_RUNNING",
        jobId: job.id
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/checker/status?")) {
      const query = new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams;
      const job = checkerJobs.get(query.get("job"));
      if (!job || (query.get("browser") && job.browser !== query.get("browser"))) {
        return json(res, 404, { error: "Checker job not found." });
      }
      return json(res, 200, {
        status: job.status,
        messages: job.messages,
        reports: job.reports,
        summary: job.summary,
        page: job.page,
        title: job.title,
        error: job.error
      });
    }

    if (req.method === "POST" && req.url === "/checker/report/register") {
      const body = await readBody(req);
      const category = String(body.category || "").toUpperCase();
      if (!["LINK", "IMAGE", "VIDEO"].includes(category)) {
        return json(res, 400, { error: "Invalid Checker report category." });
      }
      if (typeof body.filename !== "string" || !body.filename.trim()) {
        return json(res, 400, { error: "Missing Checker report filename." });
      }
      if (typeof body.content !== "string") {
        return json(res, 400, { error: "Missing Checker report content." });
      }

      const id = crypto.randomUUID();
      const report = {
        id,
        category,
        filename: body.filename,
        content: body.content,
        count: Number.isFinite(Number(body.count)) ? Number(body.count) : undefined,
        createdAt: new Date().toISOString(),
        page: typeof body.page === "string" ? body.page : ""
      };

      reports.set(id, report);
      if (body.incognito !== true) await persistReport(report);

      return json(res, 201, {
        report: {
          id: report.id,
          category: report.category,
          filename: report.filename,
          count: report.count
        }
      });
    }

    if (req.method === "GET" && req.url?.startsWith("/checker/report/")) {
      const path = req.url.split("?")[0];
      const parts = path.split("/").filter(Boolean);
      const id = parts[parts.length - 1] === "download" ? parts[parts.length - 2] : parts[parts.length - 1];
      let report = reports.get(id);
      if (!report) report = await loadPersistedReport(id);
      if (!report) return json(res, 404, { error: "Checker report not found." });

      if (parts[parts.length - 1] === "download") {
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="${String(report.filename).replace(/"/g, "")}"`,
          "cache-control": "no-store"
        });
        return res.end(report.content);
      }

      return json(res, 200, report);
    }

    return json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Runner error.",
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`v1124 WorkStation local browser runner: http://127.0.0.1:${PORT}`);
});







