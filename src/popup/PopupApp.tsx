import { useMemo, useState } from "react";

import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../components/ui/card";
import { cn } from "../lib/utils";
import { pair } from "../lib/telemetry";
import { setAuth } from "../lib/storage";

const STATUS_COPY: Record<string, string> = {
  idle: "",
  loading: "Connecting...",
  success: "Paired. Opening dashboard...",
  invalid_or_expired_pairing_code: "That pairing code is invalid or expired.",
  bad_request: "Enter a valid pairing code.",
  network_error: "Network error. Try again."
};

export function PopupApp() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");

  const helperText = useMemo(() => {
    if (STATUS_COPY[status]) {
      return STATUS_COPY[status];
    }
    if (status && status !== "idle") {
      return "Pairing failed. Try again.";
    }
    return "";
  }, [status]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setStatus("bad_request");
      return;
    }
    setStatus("loading");
    const result = await pair(normalized);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    await setAuth({
      viewer_token: result.viewer_token,
      agent_id: result.agent_id,
      expires_at: result.expires_at
    });
    chrome.runtime?.sendMessage({ type: "SYNC_UI" });
    chrome.runtime?.sendMessage({ type: "OPEN_PANEL" });
    setStatus("success");
    setTimeout(() => {
      window.close();
    }, 150);
  };

  return (
    <div className="panel-atmosphere panel-grid flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm border-border/60 bg-card/90 shadow-lg shadow-black/20 animate-fade-up">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Pair LaserSell</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Enter the pairing code shown in your LaserSell terminal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                htmlFor="pairingCode"
              >
                Pairing Code
              </label>
              <input
                id="pairingCode"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABCDEFGH"
                className={cn(
                  "font-mono w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary"
                )}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              {helperText ? (
                <p
                  className={cn(
                    "text-xs",
                    status === "success"
                      ? "text-emerald-400"
                      : status === "loading"
                        ? "text-muted-foreground"
                        : "text-rose-400"
                  )}
                >
                  {helperText}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={status === "loading"}
            >
              Connect
            </Button>
            <p className="text-xs text-muted-foreground">
              Read-only. No keys stored.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
