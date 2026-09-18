(async () => {
  // ============================================================
  // BROKEN VIDEO CHECKER v1124
  // ============================================================

  const CONFIG = {
    version: "v1124",
    name: "Broken Video Checker v1124",

    concurrency: 3,
    delayMs: 250,
    timeoutMs: 15000,
    probeTimeoutMs: 10000,

    retries429: 2,
    retryDelayMs: 1500,

    sameOriginOnly: false
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
      return `${tag.toUpperCase()} → ${heading}`;
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
        }, CONFIG.probeTimeoutMs);

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
        CONFIG.timeoutMs
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
            CONFIG.delayMs
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
            `❌ VIDEO FAILURE: ${video.label}`
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
            `❌ NETWORK/CORS: ${video.label}`
          );
        } else {
          console.log(
            `MANUAL VIDEO: ${video.label}`
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
  // RUN
  // ------------------------------------------------------------

  console.log(
    `Current page: ${location.href}`
  );

  const videos =
    collectVisibleVideos();

  console.log(
    `Visible videos: ${videos.length}`
  );

  console.log(
    `Video elements checked: ${videos.length}`
  );

  console.log(
    `Sources discovered: ${
      videos.reduce(
        (n, video) =>
          n + video.sources.length,
        0
      )
    }`
  );

  console.log(
    `Same-origin sources: ${
      videos.reduce(
        (n, video) =>
          n +
          video.sources.filter(
            source =>
              new URL(source.url).origin ===
              location.origin
          ).length,
        0
      )
    }`
  );

  console.log(
    `External sources: ${
      videos.reduce(
        (n, video) =>
          n +
          video.sources.filter(
            source =>
              new URL(source.url).origin !==
              location.origin
          ).length,
        0
      )
    }`
  );

  console.log(
    "Checking..."
  );

  const results =
    await checkVideos(
      videos
    );

  const {
    report,
    broken
  } =
    buildReport(
      results
    );

  // ------------------------------------------------------------
  // JACKPOT RULE
  // ------------------------------------------------------------

  if (
    broken.length > 0
  ) {

    downloadReport(
      report
    );

    console.log(
      `🚨 JACKPOT — ${broken.length} confirmed broken video(s). Report downloaded.`
    );

  } else {

    console.log(
      "No confirmed broken videos found — no TXT downloaded."
    );
  }

  // ------------------------------------------------------------
  // FINAL SUMMARY
  // ------------------------------------------------------------

  const healthy =
    results.filter(
      r =>
        classify(r) ===
        "2xx"
    );

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

  const clientErrors =
    results.filter(
      r =>
        classify(r) ===
        "4xx"
    );

  const totalSources =
    results.reduce(
      (n, r) =>
        n + r.sources.length,
      0
    );

  const sameOriginSources =
    results.reduce(
      (n, r) =>
        n +
        r.sources.filter(
          source =>
            new URL(source.url).origin ===
            location.origin
        ).length,
      0
    );

  const externalSources =
    totalSources -
    sameOriginSources;

  console.log(`
========================================
SCAN COMPLETE
========================================

Checker: ${CONFIG.name}
Page: ${location.href}

Visible videos: ${results.length}
Video elements checked: ${results.length}
Sources discovered: ${totalSources}
Same-origin sources: ${sameOriginSources}
External sources: ${externalSources}
Healthy videos: ${healthy.length}
Confirmed broken videos: ${broken.length}
Client errors: ${clientErrors.length}
Rate limited: ${rateLimited.length}
Network/CORS: ${network.length}
Manual verification: ${manual.length}

${
  broken.length > 0
    ? `Report saved as: ${getReportFileName()}`
    : "No report downloaded — page has no confirmed broken videos."
}

========================================
`);
})();