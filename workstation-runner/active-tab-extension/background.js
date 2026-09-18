async function markActiveTab(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (id) => {
        if (!document.documentElement) {
          throw new Error("document.documentElement is unavailable");
        }

        document.documentElement.setAttribute(
          "data-v1124-tab-id",
          String(id)
        );

        return document.documentElement.getAttribute(
          "data-v1124-tab-id"
        );
      },
      args: [tabId]
    });

    console.log(
      `[v1124-marker] tabId=${tabId} result=${JSON.stringify(result)}`
    );

    await fetch("http://127.0.0.1:18724/browser/active-tab-marker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        browser: "chrome",
        tabId,
        ok: true,
        result
      })
    }).catch(() => {});

    return true;
  } catch (error) {
    const message = error?.message || String(error);

    console.error(
      `[v1124-marker] FAILED tabId=${tabId}:`,
      message
    );

    await fetch("http://127.0.0.1:18724/browser/active-tab-marker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        browser: "chrome",
        tabId,
        ok: false,
        error: message
      })
    }).catch(() => {});

    return false;
  }
}

async function reportCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });

    const tab = tabs[0];

    if (!tab || !Number.isInteger(tab.id)) {
      return;
    }

    await markActiveTab(tab.id);

    await fetch("http://127.0.0.1:18724/browser/active-tab", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        browser: "chrome",
        tabId: tab.id,
        windowId: tab.windowId
      })
    });
  } catch (error) {
    console.error(
      "[v1124-active-tab] report failed:",
      error?.message || String(error)
    );
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log(
    `[v1124-active-tab] activated tabId=${activeInfo.tabId} windowId=${activeInfo.windowId}`
  );

  await markActiveTab(activeInfo.tabId);

  try {
    await fetch("http://127.0.0.1:18724/browser/active-tab", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        browser: "chrome",
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId
      })
    });
  } catch (error) {
    console.error(
      "[v1124-active-tab] runner report failed:",
      error?.message || String(error)
    );
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active) {
    return;
  }

  console.log(
    `[v1124-active-tab] active tab finished loading tabId=${tabId}`
  );

  await markActiveTab(tabId);

  try {
    await fetch("http://127.0.0.1:18724/browser/active-tab", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        browser: "chrome",
        tabId,
        windowId: tab.windowId
      })
    });
  } catch (error) {
    console.error(
      "[v1124-active-tab] runner update failed:",
      error?.message || String(error)
    );
  }
});

reportCurrentTab();

