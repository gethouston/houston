import { AsyncButton, Button, cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppDisplay } from "../integrations/app-display";
import { AppLogo } from "../integrations/app-logo";

interface ConnectStepTileProps {
  /** Resolved name / logo / description for this toolkit (slug fallbacks). */
  display: AppDisplay;
  /** The toolkit already shows up as an active connection. */
  connected: boolean;
  /** THIS tile's connect flow (OAuth hop + poll) is in flight. */
  connecting: boolean;
  /** Another tile owns the single-flight connect flow; disable this one. */
  disabled: boolean;
  /** Start this tile's connect flow. Returns the poll promise so AsyncButton's
   *  in-flight guard covers the whole OAuth hop (no double-mint on rage clicks). */
  onConnect: () => Promise<unknown>;
  /** Stop this tile's in-flight flow (the user closed the OAuth tab). */
  onCancel: () => void;
}

/**
 * One big tile in the activation Connect step: the app's real logo + name on
 * the left, and a Connect action on the right that becomes a waiting state
 * (with a Cancel) while its OAuth runs and a muted "Connected" pill once the
 * toolkit lands active. Styled to match the onboarding `OptionCard`, but a
 * plain row (not a select button) so the trailing Connect button never nests.
 */
export function ConnectStepTile({
  display,
  connected,
  connecting,
  disabled,
  onConnect,
  onCancel,
}: ConnectStepTileProps) {
  const { t } = useTranslation("agentOnboarding");

  return (
    <div className="flex items-center gap-3 rounded-xl bg-chip p-4">
      <AppLogo display={display} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{display.name}</p>
        {display.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">
            {display.description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {connected ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1",
              "bg-ink/[0.06] text-xs font-medium text-ink-muted",
            )}
          >
            <Check className="size-3.5" />
            {t("connect.connected")}
          </span>
        ) : connecting ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">
              {t("connect.waiting")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={onCancel}
            >
              {t("connect.cancel")}
            </Button>
          </div>
        ) : (
          <AsyncButton
            type="button"
            variant="outline"
            size="sm"
            spinner={false}
            className="rounded-full"
            disabled={disabled}
            onClick={() => onConnect()}
          >
            {t("connect.connect")}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}
