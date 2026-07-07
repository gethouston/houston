/**
 * UnauthenticatedCard — drives the user back into the provider's connect flow.
 * Body copy varies by cause (see `authCauseBodyKey`) so the user understands WHY
 * they must reconnect. The state -> title/body/button mapping lives in
 * `./auth-presentation`; this component owns only the side effects.
 *
 * Reconnect lifecycle (the button must not fire-and-forget): `launchLogin`
 * resolves when the engine STARTS sign-in, not when the user finishes in the
 * browser — completion arrives later as the `ProviderLoginComplete` event. So
 * the card holds a "finish in your browser" state (the pill becomes a Cancel
 * that frees the login slot and re-arms) until that event flips it to a green
 * confirmation, the failure, or a benign cancel.
 *
 * The confirmation depends on what failed. A refused SEND (`failed_prompt`: the
 * message never reached the engine) resends once — signing in IS the remaining
 * intent — then shows a disabled "Signed in" badge. A mid-turn failure keeps an
 * explicit resend CTA (that turn already has server-side context).
 *
 * Every launch is cancelLogin -> launchLogin: the engine keeps one login slot
 * per provider and rejects a second launch as "already pending", so a relaunch
 * frees the slot first (cancelLogin is idempotent). The benign completion our
 * own cancel triggers is ignored via `relaunchingRef` so the card does not
 * flicker to idle mid-relaunch.
 */

import type { ProviderError } from "@houston-ai/chat";
import type { HoustonEvent } from "@houston-ai/core";
import { CheckCircle2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeHoustonEvents } from "../../../lib/events";
import { tauriProvider } from "../../../lib/tauri";
import { useUIStore } from "../../../stores/ui";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { ProviderGlyph } from "../provider-logos";
import {
  type AuthCardButton,
  authCauseBodyKey,
  type LoginPhase,
  resolveAuthCardPresentation,
} from "./auth-presentation";
import { providerLabel } from "./shared";

export function UnauthenticatedCard({
  error,
  onRetry,
}: {
  error: Extract<ProviderError, { kind: "unauthenticated" }>;
  onRetry?: () => Promise<void> | void;
}) {
  const { t } = useTranslation(["shell", "common"]);
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [launching, setLaunching] = useState(false);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const relaunchingRef = useRef(false);
  // The auto-resend must fire ONCE per card — a second fire (the provider can
  // complete several logins while the chat stays open) would double-send.
  const autoResendFiredRef = useRef(false);
  const provider = providerLabel(error.provider);
  // A refused SEND (see header): reconnect auto-resends; mid-turn failures keep
  // the explicit CTA.
  const autoResend = !!error.failed_prompt;
  // In a ref so the subscription mounts once (resubscribing per render could
  // drop a completion event in the gap).
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type !== "ProviderLoginComplete") return;
      if (ev.data.provider !== error.provider) return;
      if (ev.data.success) {
        setPhase("done");
        setFailureDetail(null);
        // Login succeeded — clear the global flag so other surfaces (store
        // reconnect card, error suppression) stop treating it as signed out.
        if (useUIStore.getState().authRequired === error.provider) {
          setAuthRequired(null);
        }
        if (autoResend && onRetryRef.current && !autoResendFiredRef.current) {
          autoResendFiredRef.current = true;
          setRetrying(true);
          void Promise.resolve(onRetryRef.current())
            // The send surfaces its own failure (toast + Report bug); this
            // catch only stops an unhandled rejection.
            .catch(() => {})
            .finally(() => setRetrying(false));
        }
      } else if (ev.data.error) {
        setPhase("failed");
        setFailureDetail(ev.data.error);
      } else if (!relaunchingRef.current) {
        // Benign cancel (user gave up on the OAuth tab) — re-arm quietly.
        // Skipped when WE issued the cancel as the first half of a relaunch:
        // the new login is spawning and the card must stay in its waiting state.
        setPhase("idle");
      }
    });
  }, [error.provider, setAuthRequired, autoResend]);

  const reconnect = async () => {
    if (launching) return;
    setLaunching(true);
    relaunchingRef.current = true;
    setFailureDetail(null);
    try {
      await tauriProvider.cancelLogin(error.provider);
      await tauriProvider.launchLogin(error.provider);
      setPhase("waiting");
    } catch {
      setPhase("failed");
    } finally {
      relaunchingRef.current = false;
      setLaunching(false);
    }
  };

  const cancelSignIn = async () => {
    try {
      await tauriProvider.cancelLogin(error.provider);
    } finally {
      setPhase("idle");
    }
  };

  const sendAgain = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const pres = resolveAuthCardPresentation({
    phase,
    hasFailedPrompt: autoResend,
    hasRetry: !!onRetry,
    causeBodyKey: authCauseBodyKey(error.cause),
  });

  // Map the resolved button spec to its live handler + pending state. The
  // "done" resend badge is a disabled status pill that spins during the resend;
  // Cancel (bail out of the browser wait) is the only outline action pill.
  const renderButton = (button: AuthCardButton) => {
    if (!button) return undefined;
    if (button.kind === "badge") {
      return (
        <RowCardButton
          label={t(button.labelKey)}
          onClick={() => {}}
          disabled
          loading={retrying}
          variant="outline"
        />
      );
    }
    const handler =
      button.action === "cancel"
        ? cancelSignIn
        : button.action === "sendAgain"
          ? sendAgain
          : reconnect;
    return (
      <RowCardButton
        label={t(button.labelKey)}
        onClick={handler}
        loading={
          button.action === "reconnect"
            ? launching
            : button.action === "sendAgain"
              ? retrying
              : false
        }
        variant={button.action === "cancel" ? "outline" : "default"}
      />
    );
  };

  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={
          pres.variant === "done" ? (
            <CheckCircle2Icon className="size-5 text-green-600" />
          ) : (
            <ProviderGlyph providerId={error.provider} />
          )
        }
        title={t(pres.titleKey, { provider })}
        description={t(pres.bodyKey, { provider, detail: failureDetail ?? "" })}
        action={renderButton(pres.button)}
      />
    </div>
  );
}
