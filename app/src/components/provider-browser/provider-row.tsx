/**
 * One provider CARD in the marketplace grid (Providers tab). A colorful,
 * recognition-first card mirroring the Integrations tab's `AppRow`: a boxless
 * full-color brand mark + name + a secondary line leading with the live model
 * count in bold (`{N} models`), a middot, then the muted friendly cost story
 * (e.g. "Your Claude subscription") + two right-aligned controls: an
 * always-visible info button that opens the provider modal (the ONE open
 * affordance — the body itself is deliberately not clickable, an invisible
 * click target was not discoverable) and a Connect pill when disconnected
 * (which, while a connect is in flight, flips to Cancel on hover so a stuck
 * sign-in can be aborted) or a ghost Sign out when connected (opening the
 * shared confirm). Nothing hover-only.
 */

import { AsyncButton, Button } from "@houston-ai/core";
import { Info, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../lib/providers";
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
  connected: boolean;
  connecting: boolean;
  signingOut: boolean;
  /** Open the provider's detail. When omitted the info button is hidden (no dead affordance). */
  onOpen?: (provider: ProviderInfo) => void;
  onConnect: (provider: ProviderInfo) => void;
  onCancel: (provider: ProviderInfo) => void;
  onSignOut: (provider: ProviderInfo) => void;
}

export function ProviderRow({
  provider,
  modelCount,
  description,
  connected,
  connecting,
  signingOut,
  onOpen,
  onConnect,
  onCancel,
  onSignOut,
}: ProviderRowProps) {
  const { t } = useTranslation("aiHub");

  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left">
      <BrandMark providerId={provider.id} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-foreground">
          {provider.name}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {modelCount > 0 && (
            <>
              <span className="font-medium text-foreground">
                {t("card.models", { count: modelCount })}
              </span>
              {" · "}
            </>
          )}
          {description}
        </span>
      </div>

      {/* The ONE open affordance: an explicit info button (the card body is not
          clickable). The label carries the provider name so every card's button
          reads distinctly to screen readers. Hidden when no `onOpen` is wired,
          so a browser without a detail surface shows no dead button. */}
      {onOpen && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label={t("card.details", { name: provider.name })}
          title={t("card.details", { name: provider.name })}
          onClick={() => onOpen(provider)}
        >
          <Info className="size-4" aria-hidden="true" />
        </Button>
      )}

      {connected ? (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
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
          className="group/connect relative min-w-[92px] shrink-0"
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
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
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
  );
}
