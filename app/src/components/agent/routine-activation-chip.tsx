import type { Routine } from "@houston/engine-adapter";
import { cn } from "@houston-ai/core";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgentTriggerStatus } from "../../hooks/queries/use-triggers";
import { useUIStore } from "../../stores/ui";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import { RoutineActivationAlert } from "./routine-activation-alert";
import { triggerActivationKind } from "./routine-trigger-maps";
import { useTriggerStatusTimeouts } from "./use-trigger-status-timeouts";
import { WebhookActivationChip } from "./webhook-activation-chip";

interface Props {
  agentId: string;
  routine: Routine;
}

export function RoutineActivationChip({ agentId, routine }: Props) {
  const { t } = useTranslation("routines");
  const setViewMode = useUIStore((s) => s.setViewMode);
  const routineId = routine.id;
  const trigger = routine.trigger;

  const routineIds = useMemo(() => [routineId], [routineId]);
  const statusQuery = useAgentTriggerStatus(agentId, true, routineIds);
  const statuses = useTriggerStatusTimeouts(routineIds, statusQuery.data);
  const status = statuses[routineId];

  const onReconnect = useCallback(() => {
    setViewMode(INTEGRATIONS_VIEW_ID);
  }, [setViewMode]);

  if (!trigger) return null;

  if (trigger.kind === "webhook") {
    return (
      <WebhookActivationChip
        agentId={agentId}
        createdBy={routine.created_by}
        routineId={routineId}
        status={status}
      />
    );
  }

  const kind = triggerActivationKind(status);

  if (kind === "alert")
    return <RoutineActivationAlert status={status} onReconnect={onReconnect} />;

  const label =
    kind === "active"
      ? t("chat.activation.active")
      : kind === "activating"
        ? t("chat.activation.activating")
        : t("chat.activation.checking");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        kind === "active" ? "text-success" : "text-ink-muted",
      )}
    >
      {kind === "active" ? (
        <CheckCircle2 className="size-3.5 shrink-0" />
      ) : (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      )}
      {label}
    </span>
  );
}
