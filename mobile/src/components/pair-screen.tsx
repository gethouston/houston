// Pair screen — scan-only.
//
// One job: take a `?code=<...>` from the QR-scan deep link and exchange
// it for an engine token. If there's no code (fresh install / after
// unpair), show a big "Scan the QR from your Mac" panel with no text
// input. We do NOT want users thinking they have to type anything.
//
// On failure we show a clear recovery path: open Houston on the Mac and scan
// the current QR again. The QR is reusable until phone access is reset.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, RotateCw } from "lucide-react";
import { redeemPairingCode, PairError } from "../lib/pairing";
import { HoustonHelmet } from "@houston-ai/core";

type State =
  | { kind: "awaiting-scan" }
  | { kind: "connecting" }
  | { kind: "error"; message: string };

export function PairScreen() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<State>({ kind: "awaiting-scan" });
  const attempted = useRef(false);

  // Auto-redeem on deep-link `?code=<...>`.
  useEffect(() => {
    if (attempted.current) return;
    const incoming = params.get("code");
    if (!incoming) return;
    attempted.current = true;

    // Clean the query so reloading doesn't repeat the exchange.
    const next = new URLSearchParams(params);
    next.delete("code");
    setParams(next, { replace: true });

    setState({ kind: "connecting" });
    const label = defaultLabel();
    redeemPairingCode(incoming, label)
      .then(() => nav("/", { replace: true }))
      .catch((e) => {
        setState({ kind: "error", message: friendlyError(e) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "connecting") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-background safe-top px-6 text-center">
        <HoustonHelmet color="#737373" size={48} className="mb-4 opacity-70" />
        <div className="size-8 border-[3px] border-muted-foreground/30 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Connecting to your Mac…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-background safe-top px-6 text-center">
        <HoustonHelmet color="#ef4444" size={48} className="mb-4" />
        <h2 className="text-lg font-semibold">Couldn&rsquo;t connect</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          {state.message}
        </p>
        <button
          className="touchable mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground active:opacity-80"
          onClick={() => setState({ kind: "awaiting-scan" })}
        >
          <RotateCw className="size-3.5" />
          Try again
        </button>
      </div>
    );
  }

  // Default: awaiting scan.
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background safe-top px-6 text-center">
      <HoustonHelmet color="#737373" size={56} className="mb-5" />
      <h1 className="text-2xl font-semibold">Houston</h1>
      <p className="mt-3 max-w-xs text-sm text-muted-foreground">
        Open{" "}
        <span className="font-medium text-foreground">Houston on your Mac</span>
        , click{" "}
        <span className="font-medium text-foreground">
          &ldquo;Connect phone&rdquo;
        </span>
        , then scan the QR with your camera.
      </p>
      <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
        <Camera className="size-3.5" />
        Waiting for QR scan
      </div>
    </div>
  );
}

function defaultLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  return "Mobile";
}

/** Map a pair failure to a message a non-technical user can act on.
 *
 * Every branch tells the user EXACTLY what to do — no "contact support,"
 * no dev jargon. After retries are exhausted, `PairError.code` is the
 * stable contract we switch on (set by the relay + engine). */
function friendlyError(e: unknown): string {
  if (!(e instanceof PairError)) {
    return "Something went wrong. Please try again.";
  }
  switch (e.code) {
    case "code_unknown":
      return "That QR was reset. Open Houston on your Mac and scan the current QR.";
    case "code_malformed":
      return "The pairing link looks wrong. Open Houston on your Mac and scan the QR again.";
    case "desktop_offline":
      return "Your Mac is currently offline. Make sure Houston is open, then tap Try again.";
    case "pair_timeout":
      return "Your Mac took too long to respond. Tap Try again.";
    case "network":
      return "No internet connection. Check your signal and tap Try again.";
    default:
      return "Something went wrong on Houston\u2019s end. Tap Try again in a moment.";
  }
}
