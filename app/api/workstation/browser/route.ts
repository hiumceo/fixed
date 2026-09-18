import { NextRequest, NextResponse } from "next/server";
import { chromium, firefox, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrowserName = "chrome" | "firefox" | "edge";

type Session = {
  browser: BrowserContext;
  page: Page;
  browserName: BrowserName;
  profilePath: string;
};

const globalForWorkstation = globalThis as typeof globalThis & {
  __v1124WorkstationSessions?: Map<string, Session>;
};

const sessions =
  globalForWorkstation.__v1124WorkstationSessions ??
  (globalForWorkstation.__v1124WorkstationSessions = new Map());

const profilesRoot = path.join(process.cwd(), ".v1124-workstation");

async function profileFor(browser: BrowserName) {
  const profilePath = path.join(profilesRoot, browser);
  await fs.mkdir(profilePath, { recursive: true });
  return profilePath;
}

async function startBrowser(browserName: BrowserName, url: string) {
  const profilePath = await profileFor(browserName);
  const existing = sessions.get(browserName);

  if (existing && !existing.browser.pages().length) {
    sessions.delete(browserName);
  }

  if (sessions.has(browserName)) {
    const active = sessions.get(browserName)!;
    if (!active.page.isClosed()) {
      await active.page.bringToFront().catch(() => {});
      if (url && url !== "about:blank" && active.page.url() !== url) {
        await active.page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      }
      return active;
    }
    await active.browser.close().catch(() => {});
    sessions.delete(browserName);
  }

  const launchOptions = {
    headless: false,
    viewport: null,
    args: [
      "--window-position=80,60",
      "--window-size=1440,900",
      "--disable-popup-blocking",
    ],
  };

  let context: BrowserContext;

  if (browserName === "firefox") {
    context = await firefox.launchPersistentContext(profilePath, launchOptions);
  } else {
    context = await chromium.launchPersistentContext(profilePath, {
      ...launchOptions,
      channel: browserName === "edge" ? "msedge" : "chrome",
    });
  }

  const page = context.pages()[0] ?? await context.newPage();
  await page.bringToFront().catch(() => {});

  if (url && url !== "about:blank") {
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  }

  const session = { browser: context, page, browserName, profilePath };
  sessions.set(browserName, session);

  context.on("close", () => {
    if (sessions.get(browserName) === session) sessions.delete(browserName);
  });

  return session;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const browser = body?.browser as BrowserName;
    const url =
      typeof body?.url === "string" && body.url.trim()
        ? body.url.trim()
        : "about:blank";

    if (!["chrome", "firefox", "edge"].includes(browser)) {
      return NextResponse.json({ error: "Unsupported browser." }, { status: 400 });
    }

    const session = await startBrowser(browser, url);

    return NextResponse.json({
      status: "BROWSER_LIVE",
      browser,
      profile: "v1124 WorkStation",
      profilePath: session.profilePath,
      persistent: true,
      currentPage: session.page.url(),
    });
  } catch (error) {
    console.error("WorkStation browser launch failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start the Investigation Browser.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const browser = request.nextUrl.searchParams.get("browser") as BrowserName | null;
  const url = request.nextUrl.searchParams.get("url") || "about:blank";

  if (!browser) {
    return NextResponse.json({ error: "Browser selection is required." }, { status: 400 });
  }

  return startBrowser(browser, url)
    .then((session) =>
      NextResponse.json({
        status: "BROWSER_LIVE",
        browser,
        profile: "v1124 WorkStation",
        profilePath: session.profilePath,
        persistent: true,
        currentPage: session.page.url(),
      }),
    )
    .catch((error) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to start browser." },
        { status: 500 },
      ),
    );
}
