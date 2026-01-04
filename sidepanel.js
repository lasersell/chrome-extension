const API_BASE = "https://telemetry.lasersell.app";
const POLL_INTERVAL_MS = 3000;
const DISCONNECT_THRESHOLD_MS = 15000;
const LAMPORTS_PER_SOL = 1_000_000_000;

const state = {
  balanceLamports: 0,
  sessions: [],
  logs: [],
  lastSeenAt: null
};

const auth = {
  viewerToken: null,
  agentId: null
};

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const balanceEl = document.getElementById("balance");
const totalPnlEl = document.getElementById("total-pnl");
const sessionListEl = document.getElementById("session-list");
const sessionCountEl = document.getElementById("session-count");
const logListEl = document.getElementById("log-list");

const pairingForm = document.getElementById("pairing-form");
const pairingInput = document.getElementById("pairing-code");
const pairingButton = document.getElementById("pairing-button");
const pairingStatus = document.getElementById("pairing-status");
const disconnectButton = document.getElementById("disconnect-button");

let pollTimer = null;

function setConnected(connected) {
  statusDot.classList.toggle("connected", connected);
  const label = connected ? "Connected" : "Disconnected";
  statusDot.title = label;
  statusText.textContent = label;
}

function setPairingStatus(message) {
  pairingStatus.textContent = message;
}

function updatePairingUI(isPaired) {
  pairingForm.classList.toggle("hidden", isPaired);
  disconnectButton.classList.toggle("hidden", !isPaired);
  if (!isPaired) {
    pairingInput.value = "";
  }
}

function resetState() {
  state.balanceLamports = 0;
  state.sessions = [];
  state.logs = [];
  state.lastSeenAt = null;
  render();
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

function removeStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

async function loadAuth() {
  const items = await getStorage(["viewer_token", "agent_id"]);
  auth.viewerToken = typeof items.viewer_token === "string" ? items.viewer_token : null;
  auth.agentId = typeof items.agent_id === "string" ? items.agent_id : null;
  return auth.viewerToken && auth.agentId;
}

async function saveAuth(viewerToken, agentId) {
  auth.viewerToken = viewerToken;
  auth.agentId = agentId;
  await setStorage({ viewer_token: viewerToken, agent_id: agentId });
}

async function clearAuth() {
  auth.viewerToken = null;
  auth.agentId = null;
  await removeStorage(["viewer_token", "agent_id"]);
}

async function pair() {
  const code = pairingInput.value.trim();
  if (!code) {
    setPairingStatus("Enter a pairing code.");
    return;
  }

  pairingButton.disabled = true;
  setPairingStatus("Connecting...");

  try {
    const response = await fetch(`${API_BASE}/api/viewer/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pairing_code: code })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !payload.ok) {
      const errorCode = payload && payload.error ? payload.error : "pair_failed";
      if (errorCode === "invalid_or_expired_pairing_code") {
        setPairingStatus("Invalid or expired pairing code.");
      } else {
        setPairingStatus("Pairing failed. Try again.");
      }
      return;
    }

    await saveAuth(payload.viewer_token, payload.agent_id);
    setPairingStatus("Paired. Fetching telemetry...");
    updatePairingUI(true);
    startPolling();
  } catch (error) {
    setPairingStatus("Network error. Try again.");
  } finally {
    pairingButton.disabled = false;
  }
}

function startPolling() {
  stopPolling();
  pollState();
  pollTimer = setInterval(pollState, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollState() {
  if (!auth.viewerToken || !auth.agentId) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/viewer/state?agent_id=${encodeURIComponent(auth.agentId)}`,
      {
        headers: {
          Authorization: `Bearer ${auth.viewerToken}`
        }
      }
    );

    if (response.status === 401) {
      await clearAuth();
      setPairingStatus("Pairing expired. Reconnect.");
      updatePairingUI(false);
      setConnected(false);
      resetState();
      stopPolling();
      return;
    }

    if (!response.ok) {
      setConnected(false);
      return;
    }

    const payload = await response.json();
    if (!payload || !payload.ok) {
      setConnected(false);
      return;
    }

    const lastSeenAt = payload.last_seen_at ? Date.parse(payload.last_seen_at) : null;
    state.lastSeenAt = Number.isFinite(lastSeenAt) ? lastSeenAt : null;

    const snapshot = payload.state || {};
    state.balanceLamports = Number(snapshot.balance_lamports) || 0;
    state.sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
    state.logs = Array.isArray(snapshot.logs) ? snapshot.logs : [];

    render();

    const connected =
      state.lastSeenAt !== null &&
      Date.now() - state.lastSeenAt <= DISCONNECT_THRESHOLD_MS;
    setConnected(connected);
  } catch (error) {
    setConnected(false);
  }
}

function render() {
  balanceEl.textContent = formatSol(lamportsToSol(state.balanceLamports));

  let totalPnlLamports = 0;
  for (const session of state.sessions) {
    totalPnlLamports += Number(session.pnl_lamports) || 0;
  }
  const totalPnlSol = lamportsToSol(totalPnlLamports);
  totalPnlEl.textContent = formatSol(totalPnlSol);
  totalPnlEl.className = "card-value";
  if (totalPnlLamports > 0) {
    totalPnlEl.classList.add("pnl", "positive");
  } else if (totalPnlLamports < 0) {
    totalPnlEl.classList.add("pnl", "negative");
  }

  renderSessions();
  renderLogs();
}

function renderSessions() {
  const sessions = state.sessions.filter((session) =>
    isSessionActive(session.status)
  );

  sessionCountEl.textContent = sessions.length.toString();

  if (sessions.length === 0) {
    sessionListEl.innerHTML = '<div class="empty">No active sessions</div>';
    return;
  }

  const rows = sessions
    .map((session) => {
      const pnlLamports = Number(session.pnl_lamports) || 0;
      const pnlSol = lamportsToSol(pnlLamports);
      const pnlClass = pnlLamports > 0 ? "positive" : pnlLamports < 0 ? "negative" : "";
      return `
        <div class="session-row">
          <div class="session-main">
            <div class="session-symbol">${escapeHtml(displaySymbol(session))}</div>
            <div class="session-meta">
              <span class="status-pill">${escapeHtml(session.status || "UNKNOWN")}</span>
            </div>
          </div>
          <div class="session-actions">
            <div class="pnl ${pnlClass}">${formatSol(pnlSol)} SOL</div>
          </div>
        </div>
      `;
    })
    .join("");

  sessionListEl.innerHTML = rows;
}

function renderLogs() {
  if (state.logs.length === 0) {
    logListEl.innerHTML = '<div class="empty">No logs yet</div>';
    return;
  }

  const rows = state.logs
    .slice(-3)
    .map((entry) => {
      return `
        <div class="log-entry">
          <span class="log-level">${escapeHtml(entry.level || "INFO")}</span>
          <span>${escapeHtml(entry.message || "")}</span>
        </div>
      `;
    })
    .join("");

  logListEl.innerHTML = rows;
}

function isSessionActive(status) {
  return !["SESSION_CLOSED", "SESSION_ERROR", "SELL_COMPLETE"].includes(status);
}

function displaySymbol(session) {
  if (session.symbol && session.symbol.trim().length > 0) {
    return session.symbol;
  }
  return shortMint(session.mint);
}

function shortMint(mint) {
  if (!mint || mint.length <= 8) {
    return mint || "";
  }
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function lamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

function formatSol(value) {
  if (!Number.isFinite(value)) {
    return "0.0000";
  }
  return value.toFixed(4);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

pairingButton.addEventListener("click", pair);

pairingInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    pair();
  }
});

disconnectButton.addEventListener("click", async () => {
  await clearAuth();
  setPairingStatus("Disconnected.");
  updatePairingUI(false);
  setConnected(false);
  stopPolling();
  resetState();
});

setConnected(false);
render();
updatePairingUI(false);

loadAuth().then((hasAuth) => {
  updatePairingUI(Boolean(hasAuth));
  if (hasAuth) {
    setPairingStatus("Paired.");
    startPolling();
  }
});
