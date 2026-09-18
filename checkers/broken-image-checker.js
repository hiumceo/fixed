(async () => {
  // ============================================================
  // BROKEN IMAGE CHECKER v1124
  // ============================================================

  const CONFIG = {
    version: "v1124",
    name: "Broken Image Checker v1124",

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
      return `${tag.toUpperCase()} → ${heading}`;
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
      }, CONFIG.timeoutMs);

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
          attempt <= CONFIG.retries429;
          attempt++
        ) {
          console.log(
            `429 retry ${attempt}/${CONFIG.retries429}: ${url}`
          );

          await sleep(
            CONFIG.retryDelayMs *
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
            attempt <= CONFIG.retries429;
            attempt++
          ) {
            console.log(
              `429 retry ${attempt}/${CONFIG.retries429}: ${url}`
            );

            await sleep(
              CONFIG.retryDelayMs *
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
          `[${index + 1}/${images.length}] Checking image: ${image.label} → ${image.destination}`
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
            `❌ IMAGE LOAD FAILURE — HTTP ${http.status ?? "UNKNOWN"}: ${image.destination}`
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
            `❌ NETWORK/CORS: ${image.destination}`
          );
        } else {
          console.log(
            `${http.status} ${image.destination}`
          );
        }

        await sleep(
          CONFIG.delayMs
        );
      }
    }

    const workers = [];

    for (
      let i = 0;
      i <
      Math.min(
        CONFIG.concurrency,
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
      `Extractor: ${CONFIG.version}`
    );

    add(
      `Checker: ${CONFIG.name}`
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
  // RUN
  // ------------------------------------------------------------

  console.log(
    `Current page: ${location.href}`
  );

  const images =
    collectVisibleImages();

  console.log(
    `Visible same-origin images: ${images.length}`
  );

  console.log("Checking...");

  const results =
    await checkImages(images);

  const {
    report,
    broken
  } =
    buildReport(results);

  // ------------------------------------------------------------
  // JACKPOT RULE
  // ------------------------------------------------------------

  if (
    broken.length > 0
  ) {

    downloadReport(report);

  } else {

    console.log(
      "No confirmed broken images found — no TXT downloaded."
    );
  }

  // ------------------------------------------------------------
  // FINAL SUMMARY
  // ------------------------------------------------------------

  const rateLimited =
    results.filter(
      r =>
        classify(r) ===
        "429"
    );

  const network =
    results.filter(
      r =>
        classify(r) ===
        "network"
    );

  const manual =
    results.filter(
      r =>
        classify(r) ===
        "manual"
    );

  console.log(`
========================================
SCAN COMPLETE
========================================

Checker: ${CONFIG.name}
Page: ${location.href}

Visible images: ${results.length}
Confirmed broken: ${broken.length}
Rate limited: ${rateLimited.length}
Network/CORS: ${network.length}
Manual verification: ${manual.length}

${
  broken.length > 0
    ? `Report saved as: ${getReportFileName()}`
    : "No report downloaded — page has no confirmed broken images."
}

========================================
`);
})();