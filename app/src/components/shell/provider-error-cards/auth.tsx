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
 */

import { useEffect, useState } from "react";
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
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
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
      } else {
        // Benign cancel (user gave up on the OAuth tab) — re-arm quietly.
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
    if (phase === "waiting") return;
    setFailureDetail(null);
    try {
      await tauriProvider.launchLogin(error.provider);
      // Spawn succeeded — now the user finishes in the browser. Stay in
      // "waiting" until ProviderLoginComplete resolves it.
      setPhase("waiting");
    } catch {
      setPhase("failed");
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
      {phase === "waiting" ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            <span>{t("providerError.unauthenticated.waiting")}</span>
          </div>
          <button
            type="button"
            onClick={() => void reconnect()}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("providerError.unauthenticated.reconnect")}
          </button>
        </div>
      ) : (
        <Button
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={() => void reconnect()}
        >
          <KeyIcon className="size-3.5" />
          {t("providerError.unauthenticated.reconnect")}
        </Button>
      )}
    </ErrorCard>
  );
}
