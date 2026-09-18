import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = [
  "lib/auth.ts",
  "app/api/account/route.ts",
  "app/api/checker/stats/route.ts",
  "app/checker/page.tsx",
  "app/checker/profile/page.tsx",
];

const report = [];

function section(title) {
  report.push("");
  report.push("=".repeat(100));
  report.push(title);
  report.push("=".repeat(100));
}

function add(label, value = "") {
  report.push(`${label}${value}`);
}

function read(rel) {
  const full = path.join(root, rel);

  if (!fs.existsSync(full)) {
    return {
      exists: false,
      full,
      text: "",
    };
  }

  return {
    exists: true,
    full,
    text: fs.readFileSync(full, "utf8"),
  };
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function extractMatches(text, pattern) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : pattern.flags + "g";

  const re = new RegExp(pattern.source, flags);
  const results = [];

  let match;

  while ((match = re.exec(text)) !== null) {
    results.push({
      line: lineNumber(text, match.index),
      match: match[0],
    });

    if (match[0] === "") re.lastIndex++;
  }

  return results;
}

function contextAt(text, line, before = 8, after = 12) {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, line - 1 - before);
  const end = Math.min(lines.length, line - 1 + after + 1);

  return lines
    .slice(start, end)
    .map((value, index) => {
      const n = start + index + 1;
      return `${String(n).padStart(5, " ")} | ${value}`;
    })
    .join("\n");
}

const loaded = new Map();

for (const rel of files) {
  const data = read(rel);
  loaded.set(rel, data);

  section(`FILE: ${rel}`);

  if (!data.exists) {
    add("STATUS: ", "MISSING");
    continue;
  }

  const lineCount = data.text.split(/\r?\n/).length;
  const bytes = Buffer.byteLength(data.text, "utf8");

  add("STATUS: ", "PRESENT");
  add("LINES: ", String(lineCount));
  add("BYTES: ", String(bytes));
}

/* -------------------------------------------------------------------------- */
/* Full auth statistics architecture                                          */
/* -------------------------------------------------------------------------- */

{
  const data = loaded.get("lib/auth.ts");

  if (data?.exists) {
    section("AUTH: COMPLETE CHECKER STATISTICS DEFINITIONS");

    const patterns = [
      /export type StatSummary[\s\S]{0,500}?;/,
      /export type EngineStats[\s\S]{0,500}?;/,
      /export type CheckerStats[\s\S]{0,800}?;/,
      /function emptyEngineStats[\s\S]{0,1000}?\n  }/,
      /function emptyCheckerStats[\s\S]{0,1500}?\n  }/,
      /function normalizeEngineStats[\s\S]{0,1500}?\n  }/,
      /function normalizeCheckerStats[\s\S]{0,2500}?\n  }/,
      /export function recordCheckerStats[\s\S]{0,3000}?\n  }/,
    ];

    for (const pattern of patterns) {
      const matches = extractMatches(data.text, pattern);

      if (!matches.length) {
        add("\nNOT FOUND: ", pattern.toString());
        continue;
      }

      for (const item of matches) {
        add(`\nMATCH @ line ${item.line}:\n`);
        add(contextAt(data.text, item.line, 2, 35));
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Every checkerStats reference                                               */
/* -------------------------------------------------------------------------- */

for (const rel of files) {
  const data = loaded.get(rel);
  if (!data?.exists) continue;

  section(`${rel}: EVERY checkerStats REFERENCE`);

  const matches = extractMatches(data.text, /checkerStats/g);

  if (!matches.length) {
    add("NONE");
    continue;
  }

  for (const item of matches) {
    add(`\nLINE ${item.line}:\n`);
    add(contextAt(data.text, item.line, 8, 14));
  }
}

/* -------------------------------------------------------------------------- */
/* Every recordCheckerStats call                                               */
/* -------------------------------------------------------------------------- */

for (const rel of files) {
  const data = loaded.get(rel);
  if (!data?.exists) continue;

  section(`${rel}: EVERY recordCheckerStats CALL`);

  const matches = extractMatches(
    data.text,
    /recordCheckerStats\s*\(/g
  );

  if (!matches.length) {
    add("NONE");
    continue;
  }

  for (const item of matches) {
    add(`\nLINE ${item.line}:\n`);
    add(contextAt(data.text, item.line, 15, 35));
  }
}

/* -------------------------------------------------------------------------- */
/* Every ULTIMATE reference                                                    */
/* -------------------------------------------------------------------------- */

for (const rel of files) {
  const data = loaded.get(rel);
  if (!data?.exists) continue;

  section(`${rel}: EVERY ULTIMATE REFERENCE`);

  const matches = extractMatches(data.text, /\bULTIMATE\b/g);

  if (!matches.length) {
    add("NONE");
    continue;
  }

  for (const item of matches) {
    add(`\nLINE ${item.line}:\n`);
    add(contextAt(data.text, item.line, 5, 10));
  }
}

/* -------------------------------------------------------------------------- */
/* Checker-specific statistical fields                                         */
/* -------------------------------------------------------------------------- */

for (const rel of [
  "app/checker/page.tsx",
  "app/checker/profile/page.tsx",
  "app/api/checker/stats/route.ts",
  "lib/auth.ts",
]) {
  const data = loaded.get(rel);
  if (!data?.exists) continue;

  section(`${rel}: STATISTICAL FIELD REFERENCES`);

  const fieldPattern =
    /\b(?:runs|checked|manual|defects|successful|failed|checks|brokenCount|checkedCount|manualVerificationCount|finalSummary|ultimateSummary|reportId|ultimateReports)\b/g;

  const matches = extractMatches(data.text, fieldPattern);

  if (!matches.length) {
    add("NONE");
    continue;
  }

  const seen = new Set();

  for (const item of matches) {
    const key = `${item.line}:${item.match}`;

    if (seen.has(key)) continue;
    seen.add(key);

    add(`\n${item.match} @ line ${item.line}:\n`);
    add(contextAt(data.text, item.line, 4, 8));
  }
}

/* -------------------------------------------------------------------------- */
/* Type/interface declarations containing stats-related data                   */
/* -------------------------------------------------------------------------- */

for (const rel of files) {
  const data = loaded.get(rel);
  if (!data?.exists) continue;

  section(`${rel}: TYPES / INTERFACES / STATE DECLARATIONS`);

  const patterns = [
    /type\s+\w*(?:Stat|Summary|Result|Report|Category|Checker|Ultimate)\w*\s*=/g,
    /interface\s+\w*(?:Stat|Summary|Result|Report|Category|Checker|Ultimate)\w*\s*\{/g,
    /useState\s*<[^>]*(?:Stat|Summary|Result|Report|Checker|Ultimate)[^>]*>/g,
  ];

  let found = false;

  for (const pattern of patterns) {
    const matches = extractMatches(data.text, pattern);

    for (const item of matches) {
      found = true;
      add(`\nLINE ${item.line}:\n`);
      add(contextAt(data.text, item.line, 3, 30));
    }
  }

  if (!found) add("NONE");
}

/* -------------------------------------------------------------------------- */
/* API routes: HTTP methods and payload fields                                  */
/* -------------------------------------------------------------------------- */

for (const rel of [
  "app/api/account/route.ts",
  "app/api/checker/stats/route.ts",
]) {
  const data = loaded.get(rel);
  if (!data?.exists) continue;

  section(`${rel}: API METHODS / REQUEST / RESPONSE STRUCTURE`);

  const patterns = [
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g,
    /request\.json\s*\(/g,
    /NextResponse\.[a-zA-Z]+\s*\(/g,
    /recordCheckerStats[\s\S]{0,1200}/g,
    /publicUser[\s\S]{0,500}/g,
  ];

  for (const pattern of patterns) {
    const matches = extractMatches(data.text, pattern);

    for (const item of matches) {
      add(`\nLINE ${item.line}:\n`);
      add(contextAt(data.text, item.line, 5, 25));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Checker page: summary parsing/completion/recording flow                      */
/* -------------------------------------------------------------------------- */

{
  const rel = "app/checker/page.tsx";
  const data = loaded.get(rel);

  if (data?.exists) {
    section("CHECKER PAGE: SUMMARY / COMPLETION / RECORDING FLOW");

    const patterns = [
      /function\s+\w*(?:Summary|Parse|Build|Check|Complete|Record)\w*\s*\(/g,
      /const\s+\w*(?:Summary|Parse|Build|Check|Complete|Record)\w*\s*=/g,
      /ULTIMATE\s+(?:LINK|IMAGE|VIDEO)\s+SUMMARY/g,
      /TOTAL CONFIRMED DEFECTS/g,
      /setUltimateSummary/g,
      /setFinalSummary/g,
      /setCheckedCount/g,
      /setBrokenCount/g,
      /setManualVerificationCount/g,
      /setComplete/g,
    ];

    for (const pattern of patterns) {
      const matches = extractMatches(data.text, pattern);

      for (const item of matches) {
        add(`\nLINE ${item.line}:\n`);
        add(contextAt(data.text, item.line, 10, 30));
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Profile: actual displayed statistics                                         */
/* -------------------------------------------------------------------------- */

{
  const rel = "app/checker/profile/page.tsx";
  const data = loaded.get(rel);

  if (data?.exists) {
    section("CHECKER PROFILE: DISPLAYED STATISTICS");

    const patterns = [
      /checkerStats\.[A-Z_]+/g,
      /checkerStats\[[^\]]+\]/g,
      /TOTAL CHECKER RUNS/g,
      /TOTAL CHECKED/g,
      /TOTAL CONFIRMED DEFECTS/g,
      /ULTIMATE SCANS/g,
      /ULTIMATE LINK/g,
      /ULTIMATE IMAGE/g,
      /ULTIMATE VIDEO/g,
    ];

    for (const pattern of patterns) {
      const matches = extractMatches(data.text, pattern);

      for (const item of matches) {
        add(`\nLINE ${item.line}:\n`);
        add(contextAt(data.text, item.line, 6, 14));
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Current four/six bucket detection                                           */
/* -------------------------------------------------------------------------- */

{
  section("DETECTED CHECKER ENGINE KEYS");

  const auth = loaded.get("lib/auth.ts");

  if (auth?.exists) {
    const typeMatch = auth.text.match(
      /export type CheckerStats\s*=\s*Record<([^;]+);/
    );

    if (typeMatch) {
      add("CheckerStats Record: ", typeMatch[1].trim());
    } else {
      add("CheckerStats Record: NOT DETECTED");
    }

    const emptyMatch = auth.text.match(
      /function emptyCheckerStats[\s\S]{0,2000}?\n  }/
    );

    if (emptyMatch) {
      add("\nemptyCheckerStats():\n");
      add(emptyMatch[0]);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Complete source hashes                                                      */
/* -------------------------------------------------------------------------- */

section("SOURCE FILE HASHES");

for (const rel of files) {
  const data = loaded.get(rel);

  if (!data?.exists) {
    add(`${rel}: MISSING`);
    continue;
  }

  const crypto = await import("node:crypto");

  const sha = crypto
    .createHash("sha256")
    .update(data.text, "utf8")
    .digest("hex");

  add(`${rel}: ${sha}`);
}

/* -------------------------------------------------------------------------- */
/* Write report                                                                */
/* -------------------------------------------------------------------------- */

const output = path.join(root, "checker-stats-full-inspection.txt");

fs.writeFileSync(output, report.join("\n"), "utf8");

console.log("");
console.log("CHECKER STATISTICS FULL INSPECTION COMPLETE");
console.log("");
console.log(`Report: ${output}`);
console.log("");
console.log("Files inspected:");
for (const rel of files) {
  console.log(`  - ${rel}`);
}
console.log("");
console.log("The report contains the complete statistics architecture,");
console.log("all relevant fields, all recording calls, Ultimate handling,");
console.log("API payloads, profile display logic, and source hashes.");