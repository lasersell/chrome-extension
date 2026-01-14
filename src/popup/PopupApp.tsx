import { useEffect, useMemo, useState } from"react";

import { Button } from"../components/ui/button";
import {
 Card,
 CardContent,
 CardDescription,
 CardHeader,
 CardTitle
} from"../components/ui/card";
import { cn } from"../lib/utils";
import { pair } from"../lib/telemetry";
import { setAuth } from"../lib/storage";

const ERROR_COPY: Record<string, string> = {
 invalid_or_expired_pairing_code:"That pairing code is invalid or expired.",
 bad_request:"Enter a valid pairing code.",
 network_error:"Network error. Try again."
};

export function PopupApp() {
 const [code, setCode] = useState("");
 const [status, setStatus] = useState<"idle" |"pairing" |"paired" |"error">(
"idle"
 );
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [openError, setOpenError] = useState<string | null>(null);
 const [windowId, setWindowId] = useState<number | null>(null);
 const [tabId, setTabId] = useState<number | null>(null);

 useEffect(() => {
 chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
 const active = tabs?.[0];
 if (active?.windowId !== undefined) {
 setWindowId(active.windowId);
 }
 if (active?.id !== undefined) {
 setTabId(active.id);
 }
 });
 }, []);

 const helperText = useMemo(() => {
 if (status ==="pairing") {
 return"Connecting...";
 }
 if (status ==="error") {
 return errorMessage ||"Pairing failed. Try again.";
 }
 return"";
 }, [status, errorMessage]);

 const normalizePairingCode = (value: string) =>
 value
 .toUpperCase()
 .replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,"")
 .slice(0, 10);

 const onSubmit = async (event: React.FormEvent) => {
 event.preventDefault();
 const normalized = normalizePairingCode(code);
 if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(normalized)) {
 setStatus("error");
 setErrorMessage(ERROR_COPY.bad_request);
 return;
 }
 setStatus("pairing");
 setErrorMessage(null);
 setOpenError(null);
 const result = await pair(normalized);
 if (!result.ok) {
 setStatus("error");
 setErrorMessage(ERROR_COPY[result.error] ||"Pairing failed. Try again.");
 return;
 }
 await setAuth({
 viewer_token: result.viewer_token,
 agent_id: result.agent_id,
 expires_at: result.expires_at
 });
 chrome.runtime?.sendMessage({ type:"SYNC_UI" });
 setStatus("paired");
 };

 const handleOpenSidePanel = () => {
 setOpenError(null);
 if (!chrome.sidePanel?.open) {
 setOpenError("Side panel is unavailable. Click the extension icon.");
 return;
 }
 const target =
 windowId !== null ? { windowId } : tabId !== null ? { tabId } : null;
 if (!target) {
 setOpenError(
"Unable to find the active tab. Click the extension icon to open the side panel."
 );
 return;
 }
 const openPromise = chrome.sidePanel.open(target);
 if (openPromise && typeof openPromise.then ==="function") {
 openPromise
 .then(() => window.close())
 .catch(() => {
 setOpenError(
"Could not open the side panel. Click the extension icon to open it."
 );
 });
 } else {
 window.close();
 }
 };
 const isPaired = status ==="paired";

 return (
 <div className="page-atmosphere flex min-h-full items-center justify-center p-4">
 <Card className="w-full max-w-sm border-border/60 bg-card/90 shadow-lg shadow-black/20 animate-fade-up">
 <CardHeader className="space-y-2">
 <CardTitle className="text-xl">Pair LaserSell</CardTitle>
 <CardDescription className="text-sm text-muted-foreground">
 Enter the pairing code shown in your LaserSell terminal.
 </CardDescription>
 </CardHeader>
 <CardContent>
 {isPaired ? (
 <div className="space-y-4">
 <p className="text-sm font-medium text-emerald-400">
 Paired successfully.
 </p>
 <Button type="button" className="w-full" onClick={handleOpenSidePanel}>
 Open Side Panel
 </Button>
 {openError ? (
 <p className="text-xs text-rose-400">{openError}</p>
 ) : null}
 <p className="text-xs text-muted-foreground">
 Read-only. No keys stored.
 </p>
 </div>
 ) : (
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
 onChange={(event) => {
 setCode(normalizePairingCode(event.target.value));
 if (status !=="pairing") {
 setStatus("idle");
 setErrorMessage(null);
 }
 }}
 placeholder="ABCDEFGHJK"
 maxLength={10}
 className={cn(
"font-sans w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm text-foreground",
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
 status ==="pairing" ?"text-muted-foreground" :"text-rose-400"
 )}
 >
 {helperText}
 </p>
 ) : null}
 </div>
 <Button
 type="submit"
 className="w-full font-sans"
 disabled={status ==="pairing"}
 >
 Connect
 </Button>
 <p className="text-xs text-muted-foreground">
 Read-only. No keys stored.
 </p>
 </form>
 )}
 </CardContent>
 </Card>
 </div>
 );
}
