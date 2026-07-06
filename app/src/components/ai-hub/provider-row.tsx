/**
 * One provider row in the marketplace LIST (Providers tab). A quiet, scannable
 * line — small brand glyph + name + a muted secondary (subtitle / model count) —
 * with a single right-aligned action: a Connect pill when disconnected (which,
 * while a connect is in flight, flips to Cancel on hover so a stuck sign-in can
 * be aborted) or a ghost Sign out when connected (opening the shared confirm).
 * The row body is the open affordance: clicking anywhere but the action button
 * opens the provider modal (`onOpen`); the action button stops propagation so it
 * never doubles as an open. Keyboard-focusable, nothing hover-only. Mirrors the
 * Models tab's `ModelRow` rhythm (hairline dividers, `hover:bg-secondary`) so the
 * two tabs read as one system.
 */

import { AsyncButton, Button } from "@houston-ai/core";
import { Loader2, X } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderGlyph } from "../shell/provider-logos";
import { ModelMark } from "./hub-badges";

interface ProviderRowProps {
  provider: ProviderInfo;
  /** Muted secondary line: the provider's subtitle or its model count. */
  secondary: string;
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
  secondary,
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
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <ModelMark size="md" mark={<ProviderGlyph providerId={provider.id} />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {provider.name}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">
          {secondary}
        </span>
      </div>

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
