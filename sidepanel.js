const WS_URL = "ws://127.0.0.1:17777/ws";
const LAMPORTS_PER_SOL = 1_000_000_000;

// CSP connect-src must explicitly allow ws://127.0.0.1:17777 for this socket.
// host_permissions in manifest use http://127.0.0.1/* because match patterns do not accept ws://.

const state = {
  balanceLamports: 0,
  sessions: new Map(),
  logs: [],
};

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const balanceEl = document.getElementById("balance");
const totalPnlEl = document.getElementById("total-pnl");
const sessionListEl = document.getElementById("session-list");
const sessionCountEl = document.getElementById("session-count");
const logListEl = document.getElementById("log-list");

let ws = null;
let reconnectDelay = 250;
let reconnectTimer = null;

function setConnected(connected) {
  statusDot.classList.toggle("connected", connected);
  const label = connected ? "Connected" : "Disconnected";
  statusDot.title = label;
  statusText.textContent = label;
}

function connect() {
  if (ws) {
    ws.close();
  }
  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.addEventListener("open", () => {
    reconnectDelay = 250;
    setConnected(true);
  });

  socket.addEventListener("message", (event) => {
    handleMessage(event.data);
  });

  socket.addEventListener("close", () => {
    setConnected(false);
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    setConnected(false);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 5000);
}

function handleMessage(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return;
  }

  if (payload.type === "BalanceUpdate") {
    state.balanceLamports = Number(payload.lamports) || 0;
  }

  if (payload.type === "SessionUpdate") {
    const mint = payload.mint;
    if (!mint) {
      return;
    }
    const existing = state.sessions.get(mint) || {
      mint,
      symbol: "",
      status: "UNKNOWN",
      pnlLamports: 0,
    };
    existing.symbol = payload.symbol || existing.symbol;
    existing.status = payload.status || existing.status;
    existing.pnlLamports = Number(payload.pnl_lamports) || 0;
    state.sessions.set(mint, existing);
  }

  if (payload.type === "LogLine") {
    state.logs.push({
      level: payload.level || "INFO",
      message: payload.message || "",
    });
    if (state.logs.length > 3) {
      state.logs.shift();
    }
  }

  render();
}

function render() {
  balanceEl.textContent = formatSol(lamportsToSol(state.balanceLamports));

  let totalPnlLamports = 0;
  for (const session of state.sessions.values()) {
    totalPnlLamports += session.pnlLamports || 0;
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
  const sessions = Array.from(state.sessions.values()).filter((session) =>
    isSessionActive(session.status)
  );

  sessionCountEl.textContent = sessions.length.toString();

  if (sessions.length === 0) {
    sessionListEl.innerHTML = '<div class="empty">No active sessions</div>';
    return;
  }

  const rows = sessions
    .map((session) => {
      const pnlSol = lamportsToSol(session.pnlLamports || 0);
      const pnlClass = session.pnlLamports > 0 ? "positive" : session.pnlLamports < 0 ? "negative" : "";
      return `
        <div class="session-row">
          <div class="session-main">
            <div class="session-symbol">${escapeHtml(displaySymbol(session))}</div>
            <div class="session-meta">
              <span class="status-pill">${escapeHtml(session.status)}</span>
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
    .map((entry) => {
      return `
        <div class="log-entry">
          <span class="log-level">${escapeHtml(entry.level)}</span>
          <span>${escapeHtml(entry.message)}</span>
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

setConnected(false);
render();
connect();
