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
  status: string;
  pnl_lamports: number;
};

export type TelemetryLog = {
  level: string;
  message: string;
};

export type TelemetryState = {
  balance_lamports: number | null;
  total_pnl_lamports: number;
  pnl_history: Array<[number, number]>;
  sessions: TelemetrySession[];
  logs: TelemetryLog[];
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
