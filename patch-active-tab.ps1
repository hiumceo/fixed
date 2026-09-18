$path = ".\workstation-runner\server.mjs"
$backup = ".\workstation-runner\server.mjs.before-windows-active-tab"

Copy-Item $path $backup -Force

$text = Get-Content $path -Raw

# Normalize line endings only for matching.
$text = $text -replace "`r`n", "`n"
$text = $text -replace "`r", "`n"
$text = $text -replace "^\uFEFF", ""

$oldImports = @'
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
'@

$newImports = @'
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, firefox } from "playwright";

const execFileAsync = promisify(execFile);
'@

if (($text.Split($oldImports).Count - 1) -ne 1) {
    throw "Expected import block was not found exactly once. No changes were made."
}

$text = $text.Replace($oldImports, $newImports)

$oldActive = @'
async function getActivePage(session) {
  const pages = session.context.pages().filter(page => !page.isClosed());

  if (!pages.length) {
    return null;
  }

  let fallback = pages.includes(session.page) && !session.page.isClosed()
    ? session.page
    : pages[0];

  for (const page of pages) {
    try {
      const state = await page.evaluate(() => ({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
      }));

      if (state.visible && state.focused) {
        session.page = page;
        return page;
      }

      if (state.visible) {
        fallback = page;
      }
    } catch {}
  }

  session.page = fallback;
  return fallback;
}
'@

$newActive = @'
async function getActivePage(session) {
  const pages = session.context.pages().filter(page => !page.isClosed());

  if (!pages.length) {
    return null;
  }

  const fallback =
    pages.includes(session.page) && !session.page.isClosed()
      ? session.page
      : pages[0];

  try {
    const powershell = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class V1124Window {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder text,
        int count
    );

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(
        IntPtr hWnd
    );

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId
    );
}
"@

$hwnd = [V1124Window]::GetForegroundWindow()

if ($hwnd -eq [IntPtr]::Zero) {
    exit 0
}

$length = [V1124Window]::GetWindowTextLength($hwnd)
$sb = New-Object System.Text.StringBuilder ($length + 1)

[V1124Window]::GetWindowText(
    $hwnd,
    $sb,
    $sb.Capacity
) | Out-Null

$processId = [uint32]0

[V1124Window]::GetWindowThreadProcessId(
    $hwnd,
    [ref]$processId
) | Out-Null

$process = Get-Process -Id $processId -ErrorAction SilentlyContinue

if (-not $process) {
    exit 0
}

[PSCustomObject]@{
    ProcessName = $process.ProcessName
    WindowTitle = $sb.ToString()
} | ConvertTo-Json -Compress
`;

    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        $powershell
      ],
      {
        windowsHide: true,
        timeout: 1500
      }
    );

    const raw = stdout.trim();

    if (raw) {
      const window = JSON.parse(raw);

      const processName =
        String(window?.ProcessName || "").toLowerCase();

      const windowTitle =
        String(window?.WindowTitle || "").trim();

      const expectedProcess =
        session.browserName === "edge"
          ? "msedge"
          : session.browserName === "firefox"
            ? "firefox"
            : "chrome";

      if (
        processName === expectedProcess &&
        windowTitle
      ) {
        const pageTitles = await Promise.all(
          pages.map(async page => ({
            page,
            title: (await page.title().catch(() => "")).trim()
          }))
        );

        let bestMatch = null;

        for (const item of pageTitles) {
          if (!item.title) continue;

          const title = item.title;

          const matches =
            windowTitle === title ||
            windowTitle.startsWith(`${title} -`) ||
            windowTitle.startsWith(`${title} |`) ||
            windowTitle.startsWith(`${title} —`) ||
            windowTitle.startsWith(`${title} –`);

          if (
            matches &&
            (!bestMatch ||
              title.length > bestMatch.title.length)
          ) {
            bestMatch = item;
          }
        }

        if (bestMatch) {
          session.page = bestMatch.page;
          return bestMatch.page;
        }
      }
    }
  } catch {}

  session.page = fallback;
  return fallback;
}
'@

if (($text.Split($oldActive).Count - 1) -ne 1) {
    throw "Expected getActivePage() block was not found exactly once. No changes were made."
}

$text = $text.Replace($oldActive, $newActive)

$oldSession = @'
const session = { context, page, downloads: [], downloadSeen: new Set(), downloadBaseline: new Set(), downloadWatcher: null, startedAt: Date.now() };
'@

$newSession = @'
const session = { context, page, browserName, downloads: [], downloadSeen: new Set(), downloadBaseline: new Set(), downloadWatcher: null, startedAt: Date.now() };
'@

if (($text.Split($oldSession).Count - 1) -ne 1) {
    throw "Expected session object was not found exactly once. No changes were made."
}

$text = $text.Replace($oldSession, $newSession)

# Restore Windows line endings before writing.
$text = $text -replace "`n", "`r`n"

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host ""
Write-Host "PATCH APPLIED."
Write-Host "Backup created at:"
Write-Host $backup
Write-Host ""

node --check $path

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "SYNTAX CHECK FAILED."
    Write-Host "Restoring original server.mjs..."
    Copy-Item $backup $path -Force
    exit 1
}

Write-Host ""
Write-Host "SYNTAX CHECK PASSED."