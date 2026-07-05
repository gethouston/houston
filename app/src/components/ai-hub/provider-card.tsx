import { Button } from "@houston-ai/core";
import { ChevronRight, Loader2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ComingSoonProviderInfo, ProviderInfo } from "../../lib/providers";
import { ProviderGlyph } from "../shell/provider-logos";
import { SpecChip } from "./hub-badges";
import { authChipKey, providerDescriptionKey } from "./provider-grouping";

interface ProviderCardProps {
  provider: ProviderInfo;
  connected: boolean;
  busyState: "connecting" | "signingOut" | undefined;
  modelCount: number;
  onOpen: () => void;
  onConnect: () => void;
  onCancel: () => void;
}

/**
 * A marketplace tile for one provider. The whole card opens the provider
 * detail (`onOpen`); the footer carries an always-visible action (Connect
 * pill, a Cancel affordance while connecting, or a success dot + Connected
 * label), and inner buttons stop propagation so they never trigger `onOpen`.
 */
export function ProviderCard({
  provider,
  connected,
  busyState,
  modelCount,
  onOpen,
  onConnect,
  onCancel,
}: ProviderCardProps) {
  const { t } = useTranslation("aiHub");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Only the card itself activates on Enter/Space; a keypress on a nested
    // button (Connect / Cancel) must not also open the detail.
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  const stop = (fn: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    fn();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: the card hosts nested action buttons (Connect / Cancel), and a native <button> can't wrap another button; the div stays role="button" with explicit keyboard activation.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className="group flex cursor-pointer flex-col rounded-2xl border border-black/5 bg-card p-5 transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground">
        <ProviderGlyph providerId={provider.id} />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {provider.name}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {t(`providers.${providerDescriptionKey(provider.id)}.description`)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <SpecChip>{t(`card.${authChipKey(provider)}`)}</SpecChip>
        {modelCount > 0 && (
          <SpecChip>{t("card.models", { count: modelCount })}</SpecChip>
        )}
      </div>
      <div className="mt-4 flex items-center">
        {busyState === "connecting" ? (
          <button
            type="button"
            onClick={stop(onCancel)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Loader2 className="size-3.5 animate-spin" />
            {t("card.cancel")}
          </button>
        ) : connected ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {busyState === "signingOut" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <span
                role="img"
                aria-label={t("card.connected")}
                className="size-2 rounded-full bg-success"
              />
            )}
            {t("card.connected")}
          </span>
        ) : (
          <Button onClick={stop(onConnect)}>{t("card.connect")}</Button>
        )}
        <ChevronRight
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground"
        />
      </div>
    </div>
  );
}

/**
 * The muted, non-interactive card for a not-yet-available provider. Same tile
 * shape as `ProviderCard` but with a "Coming soon" chip and no action.
 */
export function ComingSoonProviderCard({
  provider,
}: {
  provider: ComingSoonProviderInfo;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <div
      aria-disabled="true"
      className="flex select-none flex-col rounded-2xl border border-black/5 bg-card p-5 opacity-60"
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-[11px] font-semibold text-muted-foreground">
        {provider.mark}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {provider.name}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {provider.subtitle}
      </p>
      <div className="mt-3 flex">
        <SpecChip>{t("card.comingSoon")}</SpecChip>
      </div>
    </div>
  );
}
