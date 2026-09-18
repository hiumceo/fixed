function markTab(tabId) {
  if (!Number.isInteger(tabId)) return;

  const apply = () => {
    if (document.documentElement) {
      document.documentElement.setAttribute(
        "data-v1124-tab-id",
        String(tabId)
      );
    }
  };

  if (document.documentElement) {
    apply();
  } else {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  }
}

chrome.runtime.sendMessage({ type: "v1124-register-tab" })
  .then(response => {
    if (response && Number.isInteger(response.tabId)) {
      markTab(response.tabId);
    }
  })
  .catch(() => {});

chrome.runtime.onMessage.addListener(message => {
  if (
    message?.type === "v1124-mark-tab" &&
    Number.isInteger(message.tabId)
  ) {
    markTab(message.tabId);
  }
});
