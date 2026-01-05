const API_BASE = "https://telemetry.lasersell.app";

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
  image_url?: string | null;
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
  image_url?: string | null;
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

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function pair(pairingCode: string): Promise<PairResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/viewer/pair`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ pairing_code: pairingCode.trim() })
    });
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
  const response = await fetch(
    `${API_BASE}/api/viewer/state?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  const body = (await response.json().catch(() => null)) as
    | ViewerStateResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body);
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
  const response = await fetch(`${API_BASE}/api/viewer/state/stream?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (response.status === 204) {
    return null;
  }
  const body = (await response.json().catch(() => null)) as
    | ViewerStateResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body);
  }
  return body as ViewerStateResponse;
}

export async function fetchSolUsdPrice(): Promise<SolPriceResponse> {
  const response = await fetch(`${API_BASE}/api/prices/sol-usd`);
  const body = (await response.json().catch(() => null)) as
    | SolPriceResponse
    | { ok: false; error: string }
    | null;
  if (!response.ok || !body || ("ok" in body && !body.ok)) {
    const errorMessage = body && "error" in body ? body.error : "request_failed";
    throw new ApiError(response.status, errorMessage, body);
  }
  return body as SolPriceResponse;
}
