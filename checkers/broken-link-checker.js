(async () => {
  // ============================================================
  // BROKEN LINK CHECKER v1124
  // ============================================================

  const CONFIG = {
    version: "v1124",
    name: "Broken Link Checker v1124",

    concurrency: 4,
    delayMs: 250,
    timeoutMs: 15000,

    retries429: 2,
    retryDelayMs: 1500,

    sameOriginOnly: true
  };

  const START_TIME = new Date();

  console.clear();

  console.log(`
========================================
${CONFIG.name}
========================================
`);

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
        CONFIG.sameOriginOnly &&
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
      return `${tag.toUpperCase()} → ${heading}`;
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
      CONFIG.timeoutMs
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
          attempt <= CONFIG.retries429;
          attempt++
        ) {
          console.log(
            `429 retry ${attempt}/${CONFIG.retries429}: ${url}`
          );

          await sleep(
            CONFIG.retryDelayMs * attempt
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
            attempt <= CONFIG.retries429;
            attempt++
          ) {
            console.log(
              `429 retry ${attempt}/${CONFIG.retries429}: ${url}`
            );

            await sleep(
              CONFIG.retryDelayMs * attempt
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
          `[${index + 1}/${links.length}] Checking: ${link.label} → ${link.destination}`
        );

        const response =
          await request(link.destination);

        results[index] = {
          ...link,
          ...response
        };

        if (response.status === null) {
          console.log(
            `❌ NETWORK/CORS: ${link.destination}`
          );
        } else {
          console.log(
            `${response.status} ${link.destination}`
          );
        }

        await sleep(CONFIG.delayMs);
      }
    }

    const workers = [];

    for (
      let i = 0;
      i < Math.min(
        CONFIG.concurrency,
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
    add(`Extractor: ${CONFIG.version}`);
    add(`Checker: ${CONFIG.name}`);
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
  // RUN CHECKER
  // ------------------------------------------------------------

  console.log(
    `Current page: ${location.href}`
  );

  const links =
    collectVisibleLinks();

  console.log(
    `Visible same-origin links: ${links.length}`
  );

  console.log("Checking...");

  const results =
    await checkLinks(links);

  const {
    report,
    broken
  } = buildReport(results);

  // ------------------------------------------------------------
  // DOWNLOAD ONLY IF BROKEN LINKS EXIST
  // ------------------------------------------------------------

  if (broken.length > 0) {
    downloadReport(report);
  } else {
    console.log(
      "No confirmed broken links found — no TXT downloaded."
    );
  }

  // ------------------------------------------------------------
  // FINAL CONSOLE SUMMARY
  // ------------------------------------------------------------

  const rateLimited =
    results.filter(
      r => classify(r) === "429"
    );

  const network =
    results.filter(
      r => classify(r) === "network"
    );

  console.log(`
========================================
SCAN COMPLETE
========================================

Checker: ${CONFIG.name}
Page: ${location.href}

Visible links: ${results.length}
Confirmed broken: ${broken.length}
Rate limited: ${rateLimited.length}
Network/CORS: ${network.length}

${
  broken.length > 0
    ? `Report saved as: ${getReportFileName()}`
    : "No report downloaded — page has no confirmed broken links."
}

========================================
`);
})();