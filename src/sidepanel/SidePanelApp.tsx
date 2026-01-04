import { useEffect, useMemo, useState } from "react";
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
import { Separator } from "../components/ui/separator";
import { cn } from "../lib/utils";
import { clearAuth, getAuth, type AuthState } from "../lib/storage";
import {
  ApiError,
  fetchSolUsdPrice,
  fetchViewerState,
  type TelemetrySession
} from "../lib/telemetry";
import {
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
  return shortPubkey(session.mint);
}

export function SidePanelApp() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [expired, setExpired] = useState(false);

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

  const handleDisconnect = async () => {
    await clearAuth();
    chrome.runtime?.sendMessage({ type: "SYNC_UI" });
    setAuth(null);
    setExpired(false);
  };

  const handleExpired = async () => {
    await clearAuth();
    chrome.runtime?.sendMessage({ type: "SYNC_UI" });
    setAuth(null);
    setExpired(true);
  };

  const viewerQuery = useQuery({
    queryKey: ["viewer-state", auth?.agent_id],
    queryFn: async () => {
      if (!auth) {
        throw new Error("missing_auth");
      }
      return fetchViewerState(auth.agent_id, auth.viewer_token);
    },
    enabled: !!auth,
    refetchInterval: 3000,
    retry: 1
  });

  const priceQuery = useQuery({
    queryKey: ["sol-usd"],
    queryFn: fetchSolUsdPrice,
    enabled: !!auth,
    refetchInterval: 60_000,
    retry: 1
  });

  useEffect(() => {
    if (viewerQuery.error instanceof ApiError && viewerQuery.error.status === 401) {
      if (!expired) {
        handleExpired();
      }
    }
  }, [viewerQuery.error, expired]);

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

  const viewerState = viewerQuery.data;
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
  const logs = telemetry?.logs ?? [];
  const recentLogs = [...logs].slice(-20).reverse();

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

        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className="border-border/60 bg-card/90 animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Wallet Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-semibold text-foreground">
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Total PnL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div
                className={cn(
                  "text-2xl font-semibold",
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
          style={{ animationDelay: "180ms" }}
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
                  <LineChart data={historyData} margin={{ top: 10, left: 0, right: 16, bottom: 0 }}>
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
          style={{ animationDelay: "240ms" }}
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
                const pnlSol = lamportsToSol(session.pnl_lamports);
                const pnlUsd = solUsd ? pnlSol * solUsd : null;
                return (
                  <div key={session.mint} className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-semibold text-foreground">
                        {sessionLabel(session)}
                      </div>
                      <Badge variant="secondary">{statusLabel(session.status)}</Badge>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          "text-sm font-semibold",
                          pnlSol < 0 ? "text-rose-400" : "text-emerald-400"
                        )}
                      >
                        {formatSol(pnlSol)} SOL
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pnlUsd !== null ? formatUsd(pnlUsd) : "--"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card
          className="border-border/60 bg-card/90 animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No recent activity.
              </div>
            ) : (
              <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
                {recentLogs.map((log, index) => (
                  <div key={`${log.level}-${index}`} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{log.level}</Badge>
                      <span className="text-xs text-muted-foreground">Log</span>
                    </div>
                    <p className="font-mono text-xs text-foreground">
                      {log.message}
                    </p>
                    {index < recentLogs.length - 1 ? (
                      <Separator className="bg-border/50" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="pb-4 text-center text-xs text-muted-foreground">
          Read-only dashboard.
        </div>
      </div>
    </div>
  );
}
