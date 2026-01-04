const AUTH_KEYS = ["viewer_token", "agent_id", "expires_at"];

function isPaired(auth) {
  if (!auth?.viewer_token || !auth?.agent_id) {
    return false;
  }
  if (!auth.expires_at) {
    return true;
  }
  const expiresAt = new Date(auth.expires_at).getTime();
  if (Number.isNaN(expiresAt)) {
    return false;
  }
  return Date.now() < expiresAt;
}

function syncUi() {
  chrome.storage.local.get(AUTH_KEYS, (auth) => {
    const paired = isPaired(auth);
    if (!paired && auth?.viewer_token && auth?.agent_id) {
      chrome.storage.local.remove(AUTH_KEYS);
    }
    if (paired) {
      chrome.action.setPopup({ popup: "" });
      if (chrome.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      }
    } else {
      chrome.action.setPopup({ popup: "popup.html" });
      if (chrome.sidePanel?.setPanelBehavior) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      }
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  syncUi();
});

chrome.runtime.onStartup.addListener(() => {
  syncUi();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if (AUTH_KEYS.some((key) => key in changes)) {
    syncUi();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "SYNC_UI") {
    syncUi();
  }
  if (message.type === "OPEN_PANEL") {
    if (chrome.sidePanel?.open) {
      chrome.sidePanel
        .open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
        .catch(() => undefined);
    }
  }
});

syncUi();
