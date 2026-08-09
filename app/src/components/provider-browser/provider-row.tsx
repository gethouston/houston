/**
 * One provider CARD in the marketplace grid (Providers tab). A colorful,
 * recognition-first card mirroring the Integrations page's `AppRow`: a boxless
 * full-color brand mark + name (with an inline `LiveStatus` "Connected" dot
 * when connected) on the first line, then a secondary line leading with the
 * live model count in bold (`{N} models`), a middot, then
 * the muted friendly cost story (e.g. "Your Claude subscription" — how the
 * card is billed lives in this prose and in the Subscription/Pay-as-you-go
 * quick filter, `provider-filtering.ts`, not on the card itself) + a trailing
 * action button: a Connect pill when disconnected (which, while a connect is
 * in flight, flips to Cancel on hover so a stuck sign-in can be aborted) or a
 * ghost Sign out when connected (opening the shared confirm). Nothing
 * hover-only. Serves onboarding / migration / workspace setup; the AI hub's
 * own Providers tab uses the catalog-grammar `ProvidersPane` instead.
 */

import { AsyncButton, Button } from "@houston-ai/core";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import { LiveStatus } from "../ai-hub/hub-badges";
import { BrandMark } from "./brand-mark";

interface ProviderRowProps {
  provider: ProviderInfo;
  /**
   * Live model count for this provider from the catalog. Rendered bold as
   * `{N} models` at the head of the secondary line; when 0 (unknown) the line is
   * the description alone.
   */
  modelCount: number;
  /** Muted one-line secondary: the friendly cost prose or provider description. */
  description: string;
  /**
   * The card's connection state. `checking` (an unconfirmable probe) renders a
   * muted, non-actionable "Checking" in place of both the Connected dot and the
   * Connect / Sign out buttons: claiming either would be a guess (HOU-979).
   */
  connection: ProviderConnectionState;
  connecting: boolean;
  signingOut: boolean;
  onConnect: (provider: ProviderInfo) => void;
  onCancel: (provider: ProviderInfo) => void;
  onSignOut: (provider: ProviderInfo) => void;
}

export function ProviderRow({
  provider,
  modelCount,
  description,
  connection,
  connecting,
  signingOut,
  onConnect,
  onCancel,
  onSignOut,
}: ProviderRowProps) {
  const { t } = useTranslation("aiHub");
  const connected = connection === "connected";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-chip px-3 py-2.5 text-left">
      <BrandMark providerId={provider.id} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
          <span className="min-w-0 truncate">{provider.name}</span>
          {connected && <LiveStatus label={t("card.connected")} />}
        </span>
        <span className="truncate text-[11px] text-ink-muted">
          {modelCount > 0 && (
            <>
              <span className="font-medium text-ink">
                {t("card.models", { count: modelCount })}
              </span>
              {" · "}
            </>
          )}
          {description}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {connection === "checking" ? (
          // Not confirmable right now (engine unreachable, pod waking, the
          // space's agent list still settling). Say exactly that instead of
          // offering an action whose premise we can't verify.
          <span className="px-3 text-[13px] text-ink-muted">
            {t("card.checking")}
          </span>
        ) : connected ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-muted"
            disabled={signingOut}
            onClick={() => onSignOut(provider)}
          >
            {t("card.signOut")}
          </Button>
        ) : (
          <AsyncButton
            // Fixed min-width so the label swap (Connect / Connecting / Cancel)
            // never nudges the row's width.
            size="sm"
            variant="secondary"
            spinner={false}
            className="group/connect relative min-w-[92px]"
            // Per-provider accessible name so every Connect pill reads distinctly
            // to screen readers (the visible label is just "Connect"); flips to
            // "Cancel" while a connect is in flight.
            aria-label={
              connecting
                ? t("card.cancel")
                : t("card.connectName", { name: provider.name })
            }
            onClick={() =>
              connecting ? onCancel(provider) : onConnect(provider)
            }
          >
            {connecting ? (
              <>
                {/* Resting: spinner + "Connecting" — fades out on hover. */}
                <span className="flex items-center justify-center gap-1.5 transition-opacity group-hover/connect:opacity-0">
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  {t("card.connecting")}
                </span>
                {/* Hover: Cancel — click aborts so the user can retry. */}
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition-opacity group-hover/connect:opacity-100">
                  <X className="size-3.5" aria-hidden="true" />
                  {t("card.cancel")}
                </span>
              </>
            ) : (
              t("card.connect")
            )}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}
