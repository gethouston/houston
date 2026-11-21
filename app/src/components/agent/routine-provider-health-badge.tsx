import { Button, cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useProviderConnectLaunch } from "../../hooks/use-provider-connect-launch";
import { providerName } from "../../lib/providers";
import {
  type RoutineProviderHealth,
  routineHealthOffersConnect,
} from "../../lib/routine-provider-health";

const TONE: Record<RoutineProviderHealth, string> = {
  connected: "text-success",
  not_connected: "text-danger",
  needs_reconnect: "text-warning",
  out_of_credits: "text-warning",
  checking: "text-ink-muted",
};

const DOT: Record<RoutineProviderHealth, string> = {
  connected: "bg-success",
  not_connected: "bg-danger",
  needs_reconnect: "bg-warning",
  out_of_credits: "bg-warning",
  checking: "border border-ink-muted animate-pulse",
};

export function RoutineProviderHealthBadge({
  health,
  provider,
  compact = false,
  className,
}: {
  health: RoutineProviderHealth;
  provider: string;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("routines");
  const connect = useProviderConnectLaunch(provider);
  const name = providerName(provider);
  const showConnect = !compact && routineHealthOffersConnect(health);
  const label = {
    connected: t("details.health.connected"),
    not_connected: t("details.health.notConnected"),
    needs_reconnect: t("details.health.needsReconnect"),
    out_of_credits: t("details.health.outOfCredits"),
    checking: t("details.health.checking"),
  }[health];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          TONE[health],
        )}
      >
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", DOT[health])}
        />
        {label}
      </span>
      {showConnect && (
        <Button
          variant="secondary"
          size="sm"
          disabled={connect.launching}
          onClick={(e) => {
            e.stopPropagation();
            connect.connect();
          }}
        >
          {t("details.health.connect", { provider: name })}
        </Button>
      )}
      {!compact && connect.dialog}
    </span>
  );
}
