/**
 * UnauthenticatedCard — drives the user back into the provider's
 * connect flow. Body copy varies by [`AuthFailureCause`] so the user
 * understands WHY they need to reconnect.
 *
 * Reconnect lifecycle (the button must not fire-and-forget):
 * `launchLogin` resolves when the engine SPAWNS the login CLI, not when
 * the user finishes the browser flow — completion arrives later as the
 * `ProviderLoginComplete` WS event (the same signal Settings uses to
 * flip its chip). So the card holds a "finish in your browser" state
 * until that event lands, then flips to a green confirmation with a
 * "try again" CTA, or shows the failure and re-arms the button. A
 * benign cancel (`success:false`, no error) just re-arms.
 *
 * Every press goes through cancelLogin → launchLogin: the engine keeps
 * one login slot per provider and rejects a second launch as "already
 * pending", so relaunching from the waiting state (lost the OAuth tab)
 * must free the slot first. cancelLogin is idempotent, so the first
 * press pays one no-op call. The benign ProviderLoginComplete our own
 * cancel triggers is ignored via `relaunchingRef` so the card does not
 * flicker back to idle mid-relaunch.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2Icon, KeyIcon } from "lucide-react";
import { Button, Spinner } from "@houston-ai/core";
import type { HoustonEvent } from "@houston-ai/core";
import type { ProviderError } from "@houston-ai/chat";
import { tauriProvider } from "../../../lib/tauri";
import { subscribeHoustonEvents } from "../../../lib/events";
import { useUIStore } from "../../../stores/ui";
import { ErrorCard, providerLabel, RetryButton } from "./shared";

type LoginPhase = "idle" | "waiting" | "done" | "failed";

export function UnauthenticatedCard({
  error,
  onRetry,
}: {
  error: Extract<ProviderError, { kind: "unauthenticated" }>;
  onRetry?: () => Promise<void> | void;
}) {
  const { t } = useTranslation("shell");
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [launching, setLaunching] = useState(false);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const relaunchingRef = useRef(false);
  const provider = providerLabel(error.provider);

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
  }, [error.provider, setAuthRequired]);

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
      case "unknown":
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

  if (phase === "done") {
    return (
      <ErrorCard
        icon={<CheckCircle2Icon className="size-5 text-green-600" />}
        title={t("providerError.unauthenticated.reconnectedTitle", { provider })}
        body={t("providerError.unauthenticated.reconnectedBody", { provider })}
      >
        {onRetry && (
          <RetryButton
            onRetry={onRetry}
            label={t("providerError.unauthenticated.sendAgain")}
          />
        )}
      </ErrorCard>
    );
  }

  const waiting = phase === "waiting";
  return (
    <ErrorCard
      icon={<KeyIcon className="size-5" />}
      title={t("providerError.unauthenticated.title", { provider })}
      body={
        phase === "failed"
          ? t("providerError.unauthenticated.failedBody", {
              provider,
              detail: failureDetail ?? "",
            })
          : t(bodyKey, { provider })
      }
    >
      {waiting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>{t("providerError.unauthenticated.waiting")}</span>
        </div>
      )}
      <Button
        size="sm"
        variant={waiting ? "outline" : "default"}
        className="h-8 gap-2 rounded-full px-3 text-xs"
        disabled={launching}
        onClick={() => void reconnect()}
      >
        {launching ? (
          <Spinner className="size-3.5" />
        ) : (
          <KeyIcon className="size-3.5" />
        )}
        {t("providerError.unauthenticated.reconnect")}
      </Button>
    </ErrorCard>
  );
}
