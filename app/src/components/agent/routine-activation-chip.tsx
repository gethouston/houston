/**
 * RoutineActivationChip — the always-visible health of a trigger-bound routine,
 * shown in the setup chat's one header right where the user just created it. It
 * answers "is it working?" without a wall of text: a compact chip while it
 * settles (checking -> activating -> active), and an alert block with the human
 * reason plus a one-click Reconnect when reconnecting is what fixes it.
 *
 * It reads the same per-agent trigger-status query the Routines grid does
 * (shared cache), so opening the chat right after creation streams the live
 * activation, and resolves it through the same verification timeout, so a
 * routine the host never reports on ends in a concrete error instead of
 * spinning forever. Reconnect routes to the Integrations surface, the same
 * hand-off the grid's row badge uses.
 */

import { cn } from "@houston-ai/core";
import type { Routine } from "@houston/engine-adapter";
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
  /** The trigger-bound routine. Its wake binding picks the surface (an
   *  incoming-webhook binding needs the mint/rotate flow, a Composio binding
   *  the connect/reconnect health) and its `created_by` decides who may mint
   *  a webhook key. Renders nothing for a schedule-only routine. */
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

  // An incoming-webhook routine has its own mint/rotate surface — no external
  // account to connect, so the Composio health path below never applies.
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
