const API_BASE = "https://telemetry.lasersell.app";
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const STREAM_TIMEOUT_BUFFER_MS = 2_000;

function parseRetryAfterMs(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return error instanceof Error && error.name === "AbortError";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export type PairResponse =
  | {
      ok: true;
      agent_id: string;
      viewer_token: string;
      expires_at: string;
    }
  | {
      ok: false;
      error: string;
    };

export type TelemetrySession = {
  mint: string;
  symbol: string;
  name?: string | null;
  status: string;
  pnl_lamports: number;
  cost_basis_lamports?: number | null;
  position_tokens?: number | null;
};

export type TelemetryState = {
  balance_lamports: number | null;
  total_pnl_lamports: number;
  pnl_history: Array<[number, number]>;
  rpc?: {
    total: number;
    errors: number;
    latest_ms: number | null;
    avg_ms: number | null;
    p95_ms: number | null;
  };
  sessions: TelemetrySession[];
};

export type PerformanceWindowStats = {
  "1h": number;
  "1d": number;
  "7d": number;
  "30d": number;
  all: number;
};

export type PerformanceMetrics = {
  avg_time_to_profit_sec: PerformanceWindowStats;
  profitable_trades: PerformanceWindowStats;
  non_profitable_trades: PerformanceWindowStats;
};

export type RecentTrade = {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  profit_lamports: number | null;
  hold_seconds: number | null;
  sell_signature: string;
  sell_block_time: string | null;
};

export type ViewerStateResponse = {
  ok: true;
  agent_id: string;
  last_seen_at: string | null;
  state_updated_at: string | null;
  agent: {
    wallet_pubkey: string | null;
    devnet: boolean | null;
    client_version: string | null;
    net_pnl_lamports?: number | null;
    net_pnl_updated_at?: string | null;
    performance?: PerformanceMetrics | null;
    performance_updated_at?: string | null;
    recent_trades?: RecentTrade[] | null;
  } | null;
  state: TelemetryState | null;
};

export type SolPriceResponse = {
  ok: true;
  sol_usd: number;
  source: string;
  fetched_at: string;
};

export type SolFiatPriceResponse = {
  ok: true;
  currency: string;
  sol_price: number;
  source: string;
  fetched_at: string;
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  retryAfterMs?: number;
  isTransient: boolean;

  constructor(
    status: number,
    message: string,
    body: unknown,
    opts?: { retryAfterMs?: number; isTransient?: boolean }
  ) {
    super(message);
    this.status = status;
    this.body = body;
    this.retryAfterMs = opts?.retryAfterMs;
    this.isTransient = opts?.isTransient ?? false;
  }
}

export function isTransientApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.isTransient;
}

export async function pair(pairingCode: string): Promise<PairResponse> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/api/viewer/pair`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ pairing_code: pairingCode.trim() })
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
    const body = (await response.json().catch(() => null)) as PairResponse | null;
    if (!response.ok || !body || !body.ok) {
      return {
        ok: false,
        error: body && "error" in body ? body.error : "network_error"
      };
    }
    return body;
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function fetchViewerState(
  agentId: string,
  token: string
): Promise<ViewerStateResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/api/viewer/state?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: {
          authorization: `Bearer ${token}`
        }
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    throw new ApiError(0, isAbortError(error) ? "timeout" : "network_error", null, {
      isTransient: true
    });
  }
  const body = (await response.json().catch(() => null)) as
    | ViewerStateResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body, {
      retryAfterMs: parseRetryAfterMs(response.headers),
      isTransient: isTransientStatus(response.status)
    });
  }
  return body as ViewerStateResponse;
}

export async function fetchViewerStateStream(
  agentId: string,
  token: string,
  sinceIso: string | null,
  timeoutMs?: number
): Promise<ViewerStateResponse | null> {
  const params = new URLSearchParams({ agent_id: agentId });
  if (sinceIso) {
    params.set("since", sinceIso);
  }
  if (timeoutMs) {
    params.set("timeout_ms", String(timeoutMs));
  }
  const requestTimeoutMs = timeoutMs
    ? timeoutMs + STREAM_TIMEOUT_BUFFER_MS
    : DEFAULT_REQUEST_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/api/viewer/state/stream?${params.toString()}`,
      {
        headers: {
          authorization: `Bearer ${token}`
        }
      },
      requestTimeoutMs
    );
  } catch (error) {
    throw new ApiError(0, isAbortError(error) ? "timeout" : "network_error", null, {
      isTransient: true
    });
  }
  if (response.status === 204) {
    return null;
  }
  const body = (await response.json().catch(() => null)) as
    | ViewerStateResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body, {
      retryAfterMs: parseRetryAfterMs(response.headers),
      isTransient: isTransientStatus(response.status)
    });
  }
  return body as ViewerStateResponse;
}

export async function fetchSolUsdPrice(): Promise<SolPriceResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/api/prices/sol-usd`,
      {},
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    throw new ApiError(0, isAbortError(error) ? "timeout" : "network_error", null, {
      isTransient: true
    });
  }
  const body = (await response.json().catch(() => null)) as
    | SolPriceResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body, {
      retryAfterMs: parseRetryAfterMs(response.headers),
      isTransient: isTransientStatus(response.status)
    });
  }
  return body as SolPriceResponse;
}

export async function fetchSolFiatPrice(
  currency: string
): Promise<SolFiatPriceResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/api/prices/sol/${currency.toLowerCase()}`,
      {},
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    throw new ApiError(0, isAbortError(error) ? "timeout" : "network_error", null, {
      isTransient: true
    });
  }
  const body = (await response.json().catch(() => null)) as
    | SolFiatPriceResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body, {
      retryAfterMs: parseRetryAfterMs(response.headers),
      isTransient: isTransientStatus(response.status)
    });
  }
  return body as SolFiatPriceResponse;
}

export async function disconnectViewer(
  token: string,
  signal?: AbortSignal
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/viewer/disconnect`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`
      },
      signal
    });
  } catch {
    return;
  }
}
