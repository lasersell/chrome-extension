import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { cn } from "../lib/utils";
import { clearAuth, getAuth, type AuthState } from "../lib/storage";
import {
  ApiError,
  fetchSolUsdPrice,
  fetchViewerStateStream,
  type TelemetrySession,
  type ViewerStateResponse
} from "../lib/telemetry";
import {
  formatCompact,
  formatSol,
  formatUsd,
  lamportsToSol,
  relativeTime,
  shortPubkey
} from "../lib/format";

function isLive(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) {
    return false;
  }
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) {
    return false;
  }
  return Date.now() - ts <= 15_000;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function sessionLabel(session: TelemetrySession) {
  if (session.symbol && session.symbol.trim().length > 0) {
    return session.symbol;
  }
  if (session.name && session.name.trim().length > 0) {
    return session.name;
  }
  return shortPubkey(session.mint);
}

function formatDurationSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }
  const total = Math.max(0, Math.floor(value));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) {
    return `${hours}h ${remMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "--";
  }
  return `${Math.round(value)} ms`;
}

function maxIsoTimestamp(
  first: string | null | undefined,
  second: string | null | undefined
) {
  const firstMs = first ? Date.parse(first) : Number.NaN;
  const secondMs = second ? Date.parse(second) : Number.NaN;
  if (Number.isFinite(firstMs) && Number.isFinite(secondMs)) {
    return firstMs >= secondMs ? first : second;
  }
  if (Number.isFinite(firstMs)) {
    return first;
  }
  if (Number.isFinite(secondMs)) {
    return second;
  }
  return null;
}

export function SidePanelApp() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [expired, setExpired] = useState(false);
  const [viewerState, setViewerState] = useState<ViewerStateResponse | null>(null);
  const [viewerError, setViewerError] = useState<Error | ApiError | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

  useEffect(() => {
    let mounted = true;
    getAuth().then((nextAuth) => {
      if (!mounted) {
        return;
      }
      setAuth(nextAuth);
      setAuthLoaded(true);
      if (nextAuth) {
        setExpired(false);
      }
    });

    const handleChange = (
      changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
      area: string
    ) => {
      if (area !== "local") {
        return;
      }
      if ("viewer_token" in changes || "agent_id" in changes || "expires_at" in changes) {
        getAuth().then((nextAuth) => {
          setAuth(nextAuth);
          if (nextAuth) {
            setExpired(false);
          }
        });
      }
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await clearAuth();
    chrome.runtime?.sendMessage({ type: "SYNC_UI" });
    setAuth(null);
    setExpired(false);
  }, []);

  const handleExpired = useCallback(async () => {
    await clearAuth();
    chrome.runtime?.sendMessage({ type: "SYNC_UI" });
    setAuth(null);
    setExpired(true);
  }, []);

  const priceQuery = useQuery({
    queryKey: ["sol-usd"],
    queryFn: fetchSolUsdPrice,
    enabled: !!auth,
    refetchInterval: 60_000,
    retry: 1
  });

  useEffect(() => {
    const agentId = auth?.agent_id ?? null;
    const viewerToken = auth?.viewer_token ?? null;
    if (!agentId || !viewerToken) {
      setViewerState(null);
      setViewerError(null);
      setViewerLoading(false);
      return;
    }

    setViewerError(null);

    let cancelled = false;
    let since: string | null = null;
    let initial = true;
    let backoffMs = 1000;

    const poll = async () => {
      while (!cancelled) {
        if (initial) {
          setViewerLoading(true);
        }
        try {
          const result = await fetchViewerStateStream(agentId, viewerToken, since, 8000);
          if (cancelled) {
            return;
          }
          if (result) {
            setViewerState(result);
            setViewerError(null);
            since =
              maxIsoTimestamp(result.state_updated_at, result.last_seen_at) ??
              new Date().toISOString();
          }
          if (initial) {
            setViewerLoading(false);
            initial = false;
          }
          backoffMs = 1000;
        } catch (err) {
          if (cancelled) {
            return;
          }
          if (err instanceof ApiError && err.status === 401) {
            if (initial) {
              setViewerLoading(false);
              initial = false;
            }
            handleExpired();
            return;
          }
          setViewerError(
            err instanceof Error ? err : new Error("Unable to load telemetry.")
          );
          if (initial) {
            setViewerLoading(false);
            initial = false;
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 8000);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [auth?.agent_id, auth?.viewer_token, handleExpired, pollKey]);

  const isUnauthorized = viewerError instanceof ApiError && viewerError.status === 401;
  const telemetry = viewerState?.state ?? null;
  const solUsd = priceQuery.data?.sol_usd ?? null;
  const balanceLamports = telemetry?.balance_lamports ?? null;
  const totalPnlLamports = telemetry?.total_pnl_lamports ?? null;
  const balanceSol = balanceLamports !== null ? lamportsToSol(balanceLamports) : null;
  const totalPnlSol = totalPnlLamports !== null ? lamportsToSol(totalPnlLamports) : null;
  const updatedAt = viewerState?.state_updated_at ?? viewerState?.last_seen_at ?? null;
  const live = isLive(viewerState?.last_seen_at ?? null);
  const networkLabel =
    viewerState?.agent?.devnet === null || viewerState?.agent?.devnet === undefined
      ? "Unknown"
      : viewerState.agent.devnet
        ? "Devnet"
        : "Mainnet";

  const historyData = useMemo(() => {
    if (!telemetry?.pnl_history?.length) {
      return [];
    }
    return telemetry.pnl_history.map(([timestamp, pnlLamports]) => {
      const pnlSol = lamportsToSol(pnlLamports);
      const pnlUsd = solUsd ? pnlSol * solUsd : null;
      return {
        t: timestamp,
        pnlSol,
        pnlUsd
      };
    });
  }, [telemetry?.pnl_history, solUsd]);

  const sessions = telemetry?.sessions ?? [];
  const performance = viewerState?.agent?.performance ?? null;
  const rpcMetrics = telemetry?.rpc ?? null;
  const recentTrades = Array.isArray(viewerState?.agent?.recent_trades)
    ? viewerState?.agent?.recent_trades
    : [];
  const perfWindows = ["1d", "7d", "30d", "all"] as const;
  const formatPerfDuration = (value: number | null | undefined) =>
    value === null || value === undefined ? "--" : formatDurationSeconds(value);
  const formatPerfCount = (value: number | null | undefined) =>
    value === null || value === undefined ? "--" : formatCompact(value);

  if (!authLoaded) {
    return (
      <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-6">
        <Card className="max-w-md border-border/60 bg-card/90 text-center">
          <CardHeader>
            <CardTitle className="text-xl">Loading</CardTitle>
            <CardDescription>Preparing your dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!auth && authLoaded) {
    return (
      <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-6">
        <Card className="max-w-md border-border/60 bg-card/90 text-center">
          <CardHeader>
            <CardTitle className="text-xl">Not paired</CardTitle>
            <CardDescription>
              Pair LaserSell in the popup to unlock the dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-6">
        <Card className="max-w-md border-border/60 bg-card/90 text-center">
          <CardHeader>
            <CardTitle className="text-xl">Pairing expired</CardTitle>
            <CardDescription>
              Your viewer token expired. Open the popup to pair again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (viewerLoading && !viewerState) {
    return (
      <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-6">
        <Card className="max-w-md border-border/60 bg-card/90 text-center">
          <CardHeader>
            <CardTitle className="text-xl">Loading telemetry</CardTitle>
            <CardDescription>Waiting for LaserSell data...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (viewerError && !isUnauthorized) {
    const errorMessage =
      viewerError instanceof Error ? viewerError.message : "Unable to load telemetry.";
    return (
      <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-6">
        <Card className="max-w-md border-border/60 bg-card/90 text-center">
          <CardHeader>
            <CardTitle className="text-xl">Telemetry error</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setPollKey((value) => value + 1)}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="panel-atmosphere panel-grid min-h-full w-full">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-6 pb-8 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-up">
          <div className="flex flex-col gap-1">
            <Badge
              variant="outline"
              className={cn(
                "w-fit border-transparent",
                live
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-rose-500/20 text-rose-200"
              )}
            >
              {live ? "Live" : "Offline"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Updated {relativeTime(updatedAt)} ago
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {shortPubkey(viewerState?.agent?.wallet_pubkey ?? "")}
            </span>
            <Badge variant="secondary">{networkLabel}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>

        <div
          className="flex items-center gap-2 animate-fade-up"
          style={{ animationDelay: "20ms" }}
        >
          <Button
            size="sm"
            variant={activeTab === "overview" ? "secondary" : "outline"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </Button>
          <Button
            size="sm"
            variant={activeTab === "history" ? "secondary" : "outline"}
            onClick={() => setActiveTab("history")}
          >
            History
          </Button>
        </div>

        {!telemetry ? (
          <Card
            className="border-border/60 bg-card/90 animate-fade-up"
            style={{ animationDelay: "40ms" }}
          >
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Telemetry Pending
              </CardTitle>
              <CardDescription>
                Waiting for the LaserSell app to send its first snapshot.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {activeTab === "overview" ? (
          <>
            <div className="grid gap-4 grid-cols-2">
              <Card
                className="border-border/60 bg-card/90 animate-fade-up"
                style={{ animationDelay: "60ms" }}
              >
                <CardHeader className="p-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Wallet Balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 p-4">
                  <div className="text-xl font-semibold text-foreground">
                    {balanceSol !== null ? `${formatSol(balanceSol)} SOL` : "--"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {balanceSol !== null && solUsd
                      ? formatUsd(balanceSol * solUsd)
                      : "--"}
                  </div>
                </CardContent>
              </Card>
              <Card
                className="border-border/60 bg-card/90 animate-fade-up"
                style={{ animationDelay: "120ms" }}
              >
                <CardHeader className="p-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Total PnL
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 p-4">
                  <div
                    className={cn(
                      "text-xl font-semibold",
                      totalPnlSol === null
                        ? "text-muted-foreground"
                        : totalPnlSol < 0
                          ? "text-rose-400"
                          : "text-emerald-400"
                    )}
                  >
                    {totalPnlSol !== null ? `${formatSol(totalPnlSol)} SOL` : "--"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {totalPnlSol !== null && solUsd
                      ? formatUsd(totalPnlSol * solUsd)
                      : "--"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card
              className="border-border/60 bg-card/90 animate-fade-up"
              style={{ animationDelay: "160ms" }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {perfWindows.map((window) => (
                    <span key={window}>{window.toUpperCase()}</span>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Avg time to profit
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm font-semibold text-foreground">
                    {perfWindows.map((window) => (
                      <div key={`avg-${window}`}>
                        {formatPerfDuration(
                          performance?.avg_time_to_profit_sec?.[window]
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Profitable trades
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm font-semibold text-foreground">
                    {perfWindows.map((window) => (
                      <div key={`profit-${window}`}>
                        {formatPerfCount(performance?.profitable_trades?.[window])}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Non-profitable trades
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm font-semibold text-foreground">
                    {perfWindows.map((window) => (
                      <div key={`nonprofit-${window}`}>
                        {formatPerfCount(
                          performance?.non_profitable_trades?.[window]
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="border-border/60 bg-card/90 animate-fade-up"
              style={{ animationDelay: "200ms" }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  RPC Latency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Latest
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {formatMs(rpcMetrics?.latest_ms)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Avg
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {formatMs(rpcMetrics?.avg_ms)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      P95
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {formatMs(rpcMetrics?.p95_ms)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Errors</span>
                  <span>
                    {rpcMetrics
                      ? `${rpcMetrics.errors}/${rpcMetrics.total}`
                      : "--"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card
              className="border-border/60 bg-card/90 animate-fade-up"
              style={{ animationDelay: "240ms" }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  PnL History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {historyData.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No history yet.
                  </div>
                ) : (
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={historyData}
                        margin={{ top: 10, left: 0, right: 16, bottom: 0 }}
                      >
                        <CartesianGrid stroke="rgba(148, 163, 184, 0.2)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="t"
                          tickFormatter={(value) =>
                            new Date(value as number).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit"
                            })
                          }
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "rgba(148, 163, 184, 0.8)", fontSize: 11 }}
                        />
                        <YAxis
                          dataKey={solUsd ? "pnlUsd" : "pnlSol"}
                          tickFormatter={(value) =>
                            solUsd
                              ? `${Number(value).toFixed(2)}`
                              : `${Number(value).toFixed(4)}`
                          }
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "rgba(148, 163, 184, 0.8)", fontSize: 11 }}
                          width={44}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) {
                              return null;
                            }
                            const point = payload[0]?.payload as {
                              t: number;
                              pnlSol: number;
                              pnlUsd: number | null;
                            };
                            const label = new Date(point.t).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit"
                            });
                            const value = solUsd && point.pnlUsd !== null
                              ? formatUsd(point.pnlUsd)
                              : `${formatSol(point.pnlSol, 4)} SOL`;
                            return (
                              <div className="rounded-md border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
                                <div className="text-muted-foreground">{label}</div>
                                <div className="text-foreground">{value}</div>
                              </div>
                            );
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey={solUsd ? "pnlUsd" : "pnlSol"}
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              className="border-border/60 bg-card/90 animate-fade-up"
              style={{ animationDelay: "280ms" }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Active Sessions
                  </CardTitle>
                  <Badge variant="secondary">{sessions.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No active sessions.
                  </div>
                ) : (
                  sessions.map((session) => {
                    const costSol =
                      session.cost_basis_lamports !== null &&
                      session.cost_basis_lamports !== undefined
                        ? lamportsToSol(session.cost_basis_lamports)
                        : null;
                    const costLabel =
                      costSol !== null ? `${formatSol(costSol)} SOL` : "--";
                    const tokenLabel =
                      session.position_tokens !== null &&
                      session.position_tokens !== undefined
                        ? formatCompact(session.position_tokens)
                        : "--";
                    return (
                      <div
                        key={session.mint}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-border/60 bg-muted/40">
                            {session.image_url ? (
                              <img
                                src={session.image_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-semibold text-foreground">
                              {sessionLabel(session)}
                            </div>
                            <Badge variant="secondary">
                              {statusLabel(session.status)}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              costSol === null
                                ? "text-muted-foreground"
                                : "text-foreground"
                            )}
                          >
                            {costLabel}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tokenLabel}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card
            className="border-border/60 bg-card/90 animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Trades
                </CardTitle>
                <Badge variant="secondary">{recentTrades.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTrades.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No recent trades yet.
                </div>
              ) : (
                recentTrades.map((trade) => {
                  const label =
                    trade.symbol && trade.symbol.trim().length > 0
                      ? trade.symbol
                      : trade.name && trade.name.trim().length > 0
                        ? trade.name
                        : shortPubkey(trade.mint);
                  const profitSol =
                    trade.profit_lamports !== null &&
                    trade.profit_lamports !== undefined
                      ? lamportsToSol(trade.profit_lamports)
                      : null;
                  const profitUsd =
                    profitSol !== null && solUsd ? profitSol * solUsd : null;
                  const profitClass =
                    profitSol === null
                      ? "text-muted-foreground"
                      : profitSol < 0
                        ? "text-rose-400"
                        : "text-emerald-400";
                  const holdLabel = formatDurationSeconds(trade.hold_seconds);
                  const relativeLabel = relativeTime(trade.sell_block_time);
                  const timeLabel =
                    relativeLabel === "--" ? "--" : `${relativeLabel} ago`;
                  const explorerUrl = trade.sell_signature
                    ? `https://solscan.io/tx/${trade.sell_signature}${
                        viewerState?.agent?.devnet ? "?cluster=devnet" : ""
                      }`
                    : null;
                  return (
                    <div
                      key={trade.sell_signature}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-border/60 bg-muted/40">
                          {trade.image_url ? (
                            <img
                              src={trade.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {label}
                            </span>
                            {explorerUrl ? (
                              <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                View
                              </a>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {holdLabel} · {timeLabel}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-sm font-semibold", profitClass)}>
                          {profitSol !== null ? `${formatSol(profitSol)} SOL` : "--"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {profitUsd !== null ? formatUsd(profitUsd) : "--"}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        <div className="pb-4 text-center text-xs text-muted-foreground">
          Read-only dashboard.
        </div>
      </div>
    </div>
  );
}
