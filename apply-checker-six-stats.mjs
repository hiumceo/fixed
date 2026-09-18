import fs from "node:fs";

const files = {
  auth: "lib/auth.ts",
  statsRoute: "app/api/checker/stats/route.ts",
  checker: "app/checker/page.tsx",
  profile: "app/checker/profile/page.tsx",
};

const edits = [];
function read(path) {
  if (!fs.existsSync(path)) throw new Error(`${path}: file not found`);
  return fs.readFileSync(path, "utf8");
}
function prepare(path, fn) {
  const source = read(path);
  const next = fn(source);
  if (next === source) throw new Error(`${path}: no change produced`);
  edits.push([path, next]);
}

/* AUTH: current file uses EngineStats + Record<...>, not an inline bucket type. */
prepare(files.auth, source => {
  let next = source;

  const oldRecord = /export type CheckerStats = Record<"LINK" \| "IMAGE" \| "VIDEO" \| "ULTIMATE", EngineStats>;/;
  const newRecord = `export type CheckerStats = Record<"LINK" | "IMAGE" | "VIDEO" | "ULTIMATE_LINK" | "ULTIMATE_IMAGE" | "ULTIMATE_VIDEO", EngineStats>;`;
  if (!oldRecord.test(next)) throw new Error(`${files.auth}: CheckerStats Record anchor not found`);
  next = next.replace(oldRecord, newRecord);

  const emptyRe = /function emptyCheckerStats\(\): CheckerStats\s*\{\s*return \{\s*LINK:\s*emptyEngineStats\(\),\s*IMAGE:\s*emptyEngineStats\(\),\s*VIDEO:\s*emptyEngineStats\(\),\s*ULTIMATE:\s*emptyEngineStats\(\),\s*\};\s*\}/;
  const newEmpty = `function emptyCheckerStats(): CheckerStats {
    return {
      LINK: emptyEngineStats(),
      IMAGE: emptyEngineStats(),
      VIDEO: emptyEngineStats(),
      ULTIMATE_LINK: emptyEngineStats(),
      ULTIMATE_IMAGE: emptyEngineStats(),
      ULTIMATE_VIDEO: emptyEngineStats(),
    };
  }`;
  if (!emptyRe.test(next)) throw new Error(`${files.auth}: emptyCheckerStats anchor not found`);
  next = next.replace(emptyRe, newEmpty);

  const normalizeRe = /(function normalizeCheckerStats\(value: any\): CheckerStats \{\s*const legacyChecks = Number\(value\?\.checks \|\| 0\);\s*const base = emptyCheckerStats\(\);\s*const next = \{)[\s\S]*?(\n\s*\};\s*if \(legacyChecks && !Object\.values\(next\)\.some\(item =>\s*item\.runs \|\| item\.checked \|\| item\.defects\)\) \{[\s\S]*?\n\s*\}\s*return next;\s*\})/;
  const normalizeMatch = next.match(normalizeRe);
  if (!normalizeMatch) throw new Error(`${files.auth}: normalizeCheckerStats anchor not found`);
  const newNormalizeBody = `function normalizeCheckerStats(value: any): CheckerStats {
    const legacyChecks = Number(value?.checks || 0);
    const base = emptyCheckerStats();
    const next = {
      LINK: normalizeEngineStats(value?.LINK),
      IMAGE: normalizeEngineStats(value?.IMAGE),
      VIDEO: normalizeEngineStats(value?.VIDEO),
      ULTIMATE_LINK: normalizeEngineStats(value?.ULTIMATE_LINK),
      ULTIMATE_IMAGE: normalizeEngineStats(value?.ULTIMATE_IMAGE),
      ULTIMATE_VIDEO: normalizeEngineStats(value?.ULTIMATE_VIDEO),
    };
    if (legacyChecks && !Object.values(next).some(item => item.runs || item.checked || item.defects)) {
      next.LINK.checked = legacyChecks;
    }
    return next;
  }`;
  next = next.replace(normalizeMatch[0], newNormalizeBody);

  const sigRe = /(export function recordCheckerStats\(\s*userId: string,\s*category: )"LINK" \| "IMAGE" \| "VIDEO" \| "ULTIMATE"(,)/;
  if (!sigRe.test(next)) throw new Error(`${files.auth}: recordCheckerStats category anchor not found`);
  next = next.replace(sigRe, `$1"LINK" | "IMAGE" | "VIDEO" | "ULTIMATE_LINK" | "ULTIMATE_IMAGE" | "ULTIMATE_VIDEO"$2`);

  return next;
});

/* STATS API: preserve its current implementation; only expand accepted engines. */
prepare(files.statsRoute, source => {
  const re = /const TYPES = \["LINK", "IMAGE", "VIDEO", "ULTIMATE"\] as const;/;
  if (!re.test(source)) throw new Error(`${files.statsRoute}: TYPES anchor not found`);
  return source.replace(re, `const TYPES = ["LINK", "IMAGE", "VIDEO", "ULTIMATE_LINK", "ULTIMATE_IMAGE", "ULTIMATE_VIDEO"] as const;`);
});

/* CHECKER: replace the aggregate Ultimate recording with three engine recordings.
   Match structurally rather than depending on whitespace. */
prepare(files.checker, source => {
  const re = /(?<indent>[\t ]*)void fetch\(["']\/api\/checker\/stats["'],\s*\{\s*method:\s*["']POST["'],[\s\S]*?body:\s*JSON\.stringify\(\{\s*type:\s*["']ULTIMATE["'],[\s\S]*?\}\),\s*keepalive:\s*true,\s*\}\)\.catch\(\(\)\s*=>\s*\{\}\);/;
  const m = source.match(re);
  if (!m) throw new Error(`${files.checker}: aggregate ULTIMATE stats recording anchor not found`);

  const indent = m.groups?.indent || "                ";
  const replacement = `${indent}const ultimateStats = [
${indent}  ["ULTIMATE_LINK", ultimateSummary.LINK],
${indent}  ["ULTIMATE_IMAGE", ultimateSummary.IMAGE],
${indent}  ["ULTIMATE_VIDEO", ultimateSummary.VIDEO],
${indent}] as const;
${indent}for (const [type, stat] of ultimateStats) {
${indent}  void fetch("/api/checker/stats", {
${indent}    method: "POST",
${indent}    headers: { "content-type": "application/json" },
${indent}    body: JSON.stringify({
${indent}      type,
${indent}      checked: stat.checked,
${indent}      manual: stat.manual,
${indent}      defects: stat.defects,
${indent}    }),
${indent}    keepalive: true,
${indent}  }).catch(() => {});
${indent}}`;
  return source.replace(re, replacement);
});

/* PROFILE: update the four-bucket local state/hydration/totals/detail view.
   Keep the existing UI and typography untouched. */
prepare(files.profile, source => {
  let next = source;

  const oldState = `  const [checkerStats, setCheckerStats] = useState({
    LINK: { runs: 0, checked: 0, defects: 0 },
    IMAGE: { runs: 0, checked: 0, defects: 0 },
    VIDEO: { runs: 0, checked: 0, defects: 0 },
    ULTIMATE: { runs: 0, checked: 0, defects: 0 },
  });`;
  const newState = `  const [checkerStats, setCheckerStats] = useState({
    LINK: { runs: 0, checked: 0, defects: 0 },
    IMAGE: { runs: 0, checked: 0, defects: 0 },
    VIDEO: { runs: 0, checked: 0, defects: 0 },
    ULTIMATE_LINK: { runs: 0, checked: 0, defects: 0 },
    ULTIMATE_IMAGE: { runs: 0, checked: 0, defects: 0 },
    ULTIMATE_VIDEO: { runs: 0, checked: 0, defects: 0 },
  });`;
  if (!next.includes(oldState)) throw new Error(`${files.profile}: checkerStats state anchor not found`);
  next = next.replace(oldState, newState);

  const oldHydrate = `          LINK: { runs: Number(data.checkerStats.LINK?.runs || 0), checked: Number(data.checkerStats.LINK?.checked || 0), defects: Number(data.checkerStats.LINK?.defects || 0) },
          IMAGE: { runs: Number(data.checkerStats.IMAGE?.runs || 0), checked: Number(data.checkerStats.IMAGE?.checked || 0), defects: Number(data.checkerStats.IMAGE?.defects || 0) },
          VIDEO: { runs: Number(data.checkerStats.VIDEO?.runs || 0), checked: Number(data.checkerStats.VIDEO?.checked || 0), defects: Number(data.checkerStats.VIDEO?.defects || 0) },
          ULTIMATE: { runs: Number(data.checkerStats.ULTIMATE?.runs || 0), checked: Number(data.checkerStats.ULTIMATE?.checked || 0), defects: Number(data.checkerStats.ULTIMATE?.defects || 0) },`;
  const newHydrate = `          LINK: { runs: Number(data.checkerStats.LINK?.runs || 0), checked: Number(data.checkerStats.LINK?.checked || 0), defects: Number(data.checkerStats.LINK?.defects || 0) },
          IMAGE: { runs: Number(data.checkerStats.IMAGE?.runs || 0), checked: Number(data.checkerStats.IMAGE?.checked || 0), defects: Number(data.checkerStats.IMAGE?.defects || 0) },
          VIDEO: { runs: Number(data.checkerStats.VIDEO?.runs || 0), checked: Number(data.checkerStats.VIDEO?.checked || 0), defects: Number(data.checkerStats.VIDEO?.defects || 0) },
          ULTIMATE_LINK: { runs: Number(data.checkerStats.ULTIMATE_LINK?.runs || 0), checked: Number(data.checkerStats.ULTIMATE_LINK?.checked || 0), defects: Number(data.checkerStats.ULTIMATE_LINK?.defects || 0) },
          ULTIMATE_IMAGE: { runs: Number(data.checkerStats.ULTIMATE_IMAGE?.runs || 0), checked: Number(data.checkerStats.ULTIMATE_IMAGE?.checked || 0), defects: Number(data.checkerStats.ULTIMATE_IMAGE?.defects || 0) },
          ULTIMATE_VIDEO: { runs: Number(data.checkerStats.ULTIMATE_VIDEO?.runs || 0), checked: Number(data.checkerStats.ULTIMATE_VIDEO?.checked || 0), defects: Number(data.checkerStats.ULTIMATE_VIDEO?.defects || 0) },`;
  if (!next.includes(oldHydrate)) throw new Error(`${files.profile}: checkerStats hydration anchor not found`);
  next = next.replace(oldHydrate, newHydrate);

  const oldTotals = `  const totalCheckerRuns = checkerStats.LINK.runs + checkerStats.IMAGE.runs + checkerStats.VIDEO.runs + checkerStats.ULTIMATE.runs;`;
  const newTotals = `  const totalCheckerRuns = checkerStats.LINK.runs + checkerStats.IMAGE.runs + checkerStats.VIDEO.runs + checkerStats.ULTIMATE_LINK.runs + checkerStats.ULTIMATE_IMAGE.runs + checkerStats.ULTIMATE_VIDEO.runs;`;
  if (!next.includes(oldTotals)) throw new Error(`${files.profile}: totalCheckerRuns anchor not found`);
  next = next.replace(oldTotals, newTotals);

  const oldChecks = `  const totalChecks = checkerStats.LINK.checked + checkerStats.IMAGE.checked + checkerStats.VIDEO.checked + checkerStats.ULTIMATE.checked;`;
  const newChecks = `  const totalChecks = checkerStats.LINK.checked + checkerStats.IMAGE.checked + checkerStats.VIDEO.checked + checkerStats.ULTIMATE_LINK.checked + checkerStats.ULTIMATE_IMAGE.checked + checkerStats.ULTIMATE_VIDEO.checked;`;
  if (!next.includes(oldChecks)) throw new Error(`${files.profile}: totalChecks anchor not found`);
  next = next.replace(oldChecks, newChecks);

  const oldDefects = `  const totalDefects = checkerStats.LINK.defects + checkerStats.IMAGE.defects + checkerStats.VIDEO.defects + checkerStats.ULTIMATE.defects;`;
  const newDefects = `  const totalDefects = checkerStats.LINK.defects + checkerStats.IMAGE.defects + checkerStats.VIDEO.defects + checkerStats.ULTIMATE_LINK.defects + checkerStats.ULTIMATE_IMAGE.defects + checkerStats.ULTIMATE_VIDEO.defects;`;
  if (!next.includes(oldDefects)) throw new Error(`${files.profile}: totalDefects anchor not found`);
  next = next.replace(oldDefects, newDefects);

  const oldOverview = `["ULTIMATE", checkerStats.ULTIMATE.checked]`;
  if (next.includes(oldOverview)) next = next.replace(oldOverview, `["ULTIMATE LINK", checkerStats.ULTIMATE_LINK.checked], ["ULTIMATE IMAGE", checkerStats.ULTIMATE_IMAGE.checked], ["ULTIMATE VIDEO", checkerStats.ULTIMATE_VIDEO.checked]`);
  const oldOverviewDef = `["ULTIMATE", checkerStats.ULTIMATE.defects]`;
  if (next.includes(oldOverviewDef)) next = next.replace(oldOverviewDef, `["ULTIMATE LINK", checkerStats.ULTIMATE_LINK.defects], ["ULTIMATE IMAGE", checkerStats.ULTIMATE_IMAGE.defects], ["ULTIMATE VIDEO", checkerStats.ULTIMATE_VIDEO.defects]`);

  const oldDetail = `                  const stat = checkerStats[statsTab.toUpperCase() as "LINK" | "IMAGE" | "VIDEO" | "ULTIMATE"];`;
  if (next.includes(oldDetail)) {
    next = next.replace(oldDetail, `                  const stat = statsTab === "link" ? checkerStats.LINK : statsTab === "image" ? checkerStats.IMAGE : checkerStats.VIDEO;`);
  }

  const oldUltimateDetail = `statsTab === "ultimate"`;
  if (!next.includes(oldUltimateDetail)) throw new Error(`${files.profile}: Ultimate detail view anchor not found`);

  /* Replace the Ultimate row array wherever it currently contains the old aggregate bucket. */
  const ultimateRowRe = /\[\["ULTIMATE SCANS",\s*checkerStats\.ULTIMATE\.runs\],[\s\S]*?\["TOTAL CONFIRMED DEFECTS",\s*checkerStats\.ULTIMATE\.defects\]\]/;
  if (ultimateRowRe.test(next)) {
    next = next.replace(ultimateRowRe, `[
                      ["ULTIMATE SCANS", checkerStats.ULTIMATE_LINK.runs + checkerStats.ULTIMATE_IMAGE.runs + checkerStats.ULTIMATE_VIDEO.runs],
                      ["ULTIMATE LINK CHECKS", checkerStats.ULTIMATE_LINK.checked],
                      ["ULTIMATE IMAGE CHECKS", checkerStats.ULTIMATE_IMAGE.checked],
                      ["ULTIMATE VIDEO CHECKS", checkerStats.ULTIMATE_VIDEO.checked],
                      ["ULTIMATE LINK DEFECTS", checkerStats.ULTIMATE_LINK.defects],
                      ["ULTIMATE IMAGE DEFECTS", checkerStats.ULTIMATE_IMAGE.defects],
                      ["ULTIMATE VIDEO DEFECTS", checkerStats.ULTIMATE_VIDEO.defects],
                      ["TOTAL CHECKED", checkerStats.ULTIMATE_LINK.checked + checkerStats.ULTIMATE_IMAGE.checked + checkerStats.ULTIMATE_VIDEO.checked],
                      ["TOTAL CONFIRMED DEFECTS", checkerStats.ULTIMATE_LINK.defects + checkerStats.ULTIMATE_IMAGE.defects + checkerStats.ULTIMATE_VIDEO.defects]
                    ]`);
  } else if (next.includes("checkerStats.ULTIMATE")) {
    throw new Error(`${files.profile}: old Ultimate aggregate remains, but its detail-row shape was not recognized`);
  }

  if (next.includes('checkerStats.ULTIMATE.') && !next.includes('checkerStats.ULTIMATE_LINK')) {
    throw new Error(`${files.profile}: old ULTIMATE bucket reference remains`);
  }
  return next;
});

/* Transactional write: every file was read and all anchors validated before this point. */
for (const [path, content] of edits) fs.writeFileSync(path, content, "utf8");
console.log("PATCH APPLIED: Checker now tracks six engines: LINK, IMAGE, VIDEO, ULTIMATE_LINK, ULTIMATE_IMAGE, ULTIMATE_VIDEO. No standalone ULTIMATE bucket.");
