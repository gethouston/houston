/**
 * One provider CARD in the marketplace grid (Providers tab). A colorful,
 * recognition-first card mirroring the Integrations tab's `AppRow`: a boxless
 * full-color brand mark + name + a secondary line leading with the live model
 * count in bold (`{N} models`), a middot, then the muted friendly cost story
 * (e.g. "Your Claude subscription") + two right-aligned controls: an
 * always-visible info button that opens the provider modal (the explicit
 * affordance — body click alone was not discoverable) and a Connect pill when
 * disconnected (which, while a connect is in flight, flips to Cancel on hover so
 * a stuck sign-in can be aborted) or a ghost Sign out when connected (opening
 * the shared confirm). The card body still opens the modal on click; both
 * buttons stop propagation so they never double as an open.
 * Keyboard-focusable, nothing hover-only.
 */

import { AsyncButton, Button } from "@houston-ai/core";
import { Info, Loader2, X } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
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
  onOpen: (provider: ProviderInfo) => void;
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

  // Enter / Space opens the modal, but only when the row itself holds focus —
  // a key press on the inner action button must run that button, not open.
  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(provider);
    }
  };

  // The action button lives inside the clickable row, so every handler stops
  // propagation — a Connect / Sign out click must never also open the modal.
  const stop = (fn: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    fn();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: the row wraps a real <button> (the action), so it can't itself be a <button>; role+tabIndex+keydown make the body openable.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(provider)}
      onKeyDown={onRowKeyDown}
      className="flex cursor-pointer items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <BrandMark providerId={provider.id} size="lg" />
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

      {/* An always-visible, explicit "details" affordance: the body click alone
          was too discoverable-by-accident-only. Opens the same provider modal. */}
      <Button
        size="icon-sm"
        variant="ghost"
        className="shrink-0 text-muted-foreground"
        aria-label={t("card.details")}
        title={t("card.details")}
        onClick={stop(() => onOpen(provider))}
      >
        <Info className="size-4" aria-hidden="true" />
      </Button>

      {connected ? (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          disabled={signingOut}
          onClick={stop(() => onSignOut(provider))}
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
          aria-label={connecting ? t("card.cancel") : undefined}
          onClick={stop(() =>
            connecting ? onCancel(provider) : onConnect(provider),
          )}
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
