/**
 * UnauthenticatedCard — drives the user back into the provider's
 * connect flow. Body copy varies by [`AuthFailureCause`] so the user
 * understands WHY they need to reconnect. Renders through the shared
 * `RowCard` with the provider's monochrome `ProviderGlyph` on the left
 * (never a hand-picked brand logo) and a text-only `RowCardButton`.
 *
 * Reconnect lifecycle (the button must not fire-and-forget):
 * `launchLogin` resolves when the engine STARTS the sign-in flow, not
 * when the user finishes it in the browser — completion arrives later as
 * the `ProviderLoginComplete` WS event (the same signal Settings uses to
 * flip its chip). So the card holds a "finish in your browser" state —
 * where the pill becomes a Cancel that frees the login slot and re-arms
 * (lost the OAuth tab, wrong account, second thoughts) — until that
 * event lands, then flips to a green confirmation, or shows the failure
 * and re-arms the button. A benign cancel (`success:false`, no error)
 * just re-arms.
 *
 * The confirmation's shape depends on what failed. A refused SEND (the
 * card carries `failed_prompt` — the message never reached the engine)
 * resends it automatically, once: the user already said what they
 * wanted, so signing in IS the remaining intent, and the pill settles
 * into a disabled "Signed in" badge. A mid-turn failure (token expired
 * during a live turn) keeps the explicit "Try again" CTA — re-running a
 * turn that already has server-side context stays a user decision.
 *
 * Every launch goes through cancelLogin → launchLogin: the engine keeps
 * one login slot per provider and rejects a second launch as "already
 * pending", so a relaunch after a cancel (or a stale slot from a
 * previous run) must free the slot first. cancelLogin is idempotent, so
 * the first press pays one no-op call. The benign ProviderLoginComplete
 * our own cancel triggers is ignored via `relaunchingRef` so the card
 * does not flicker back to idle mid-relaunch.
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
import { providerLabel } from "./shared";

type LoginPhase = "idle" | "waiting" | "done" | "failed";

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
  // The auto-resend must fire ONCE per card even if the provider completes
  // several logins while the chat stays open — a second fire would send the
  // same message twice.
  const autoResendFiredRef = useRef(false);
  const provider = providerLabel(error.provider);
  // A refused SEND (the message never reached the engine): reconnecting
  // completes the user's stated intent, so the reply is fetched without
  // another press. Mid-turn failures (no failed_prompt) keep the explicit CTA.
  const autoResend = !!error.failed_prompt;
  // In a ref so the subscription mounts once — resubscribing on every parent
  // render could drop a completion event in the gap.
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type !== "ProviderLoginComplete") return;
      if (ev.data.provider !== error.provider) return;
      if (ev.data.success) {
        setPhase("done");
        setFailureDetail(null);
        // The login this card prompted for just succeeded — clear the
        // global flag so other surfaces (store reconnect card, session
        // error suppression) stop treating the provider as signed out.
        if (useUIStore.getState().authRequired === error.provider) {
          setAuthRequired(null);
        }
        if (autoResend && onRetryRef.current && !autoResendFiredRef.current) {
          autoResendFiredRef.current = true;
          setRetrying(true);
          void Promise.resolve(onRetryRef.current())
            .catch(() => {
              // The send already surfaced its own failure (call()'s toast +
              // Report bug); this catch only stops an unhandled rejection.
            })
            .finally(() => setRetrying(false));
        }
      } else if (ev.data.error) {
        setPhase("failed");
        setFailureDetail(ev.data.error);
      } else if (!relaunchingRef.current) {
        // Benign cancel (user gave up on the OAuth tab) — re-arm quietly.
        // Skipped when WE issued the cancel as the first half of a
        // relaunch: the new login is already spawning and the card must
        // stay in its waiting state.
        setPhase("idle");
      }
    });
  }, [error.provider, setAuthRequired, autoResend]);

  // Map every cause to a body string so the user always sees a reason
  // (instead of a generic "session expired" wall). Keeps the card
  // honest about what we know.
  const bodyKey: string = (() => {
    switch (error.cause) {
      case "token_expired":
        return "providerError.unauthenticated.bodyTokenExpired";
      case "no_credentials":
        return "providerError.unauthenticated.bodyNoCredentials";
      case "invalid_api_key":
        return "providerError.unauthenticated.bodyInvalidApiKey";
      case "token_revoked":
        return "providerError.unauthenticated.bodyTokenRevoked";
      default:
        return "providerError.unauthenticated.bodyUnknown";
    }
  })();

  const reconnect = async () => {
    if (launching) return;
    setLaunching(true);
    relaunchingRef.current = true;
    setFailureDetail(null);
    try {
      // Free the engine's single login slot (idempotent no-op when
      // nothing is pending) so a relaunch is never rejected as
      // "already pending", then spawn a fresh browser sign-in.
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

  // Waiting-state Cancel: free the runtime's login slot for real (idempotent —
  // a no-pending cancel is benign) and re-arm so the user can relaunch.
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

  if (phase === "done") {
    return (
      <div className="w-full px-1 py-2">
        <RowCard
          media={<CheckCircle2Icon className="size-5 text-green-600" />}
          title={t("providerError.unauthenticated.reconnectedTitle", {
            provider,
          })}
          description={t(
            autoResend
              ? "providerError.unauthenticated.reconnectedResending"
              : "providerError.unauthenticated.reconnectedBody",
            { provider },
          )}
          action={
            autoResend ? (
              // The resend fired itself — the pill is a status badge, not an
              // action (it spins while the resend request is in flight).
              <RowCardButton
                label={t("providerError.unauthenticated.signedIn")}
                onClick={() => {}}
                disabled
                loading={retrying}
                variant="outline"
              />
            ) : (
              onRetry && (
                <RowCardButton
                  label={t("providerError.unauthenticated.sendAgain")}
                  onClick={sendAgain}
                  loading={retrying}
                />
              )
            )
          }
        />
      </div>
    );
  }

  const waiting = phase === "waiting";
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<ProviderGlyph providerId={error.provider} />}
        title={t("providerError.unauthenticated.title", { provider })}
        description={
          phase === "failed"
            ? t("providerError.unauthenticated.failedBody", {
                provider,
                detail: failureDetail ?? "",
              })
            : waiting
              ? t("providerError.unauthenticated.waiting")
              : t(bodyKey, { provider })
        }
        action={
          waiting ? (
            // The wait is on the user's browser, not on Houston — the useful
            // action here is bailing out (lost the tab, wrong account), which
            // re-arms the Reconnect button.
            <RowCardButton
              label={t("common:actions.cancel")}
              onClick={cancelSignIn}
              variant="outline"
            />
          ) : (
            <RowCardButton
              label={t("providerError.unauthenticated.reconnect")}
              onClick={reconnect}
              loading={launching}
            />
          )
        }
      />
    </div>
  );
}
