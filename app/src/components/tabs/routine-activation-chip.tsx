/**
 * RoutineActivationChip — the always-visible health of a trigger-bound routine,
 * shown in the setup chat's one header right where the user just created it. It
 * answers "is it working?" without a wall of text: a compact chip while it
 * settles (checking -> activating -> active), and an alert block with the human
 * reason plus a one-click Reconnect when it needs the user.
 *
 * It reads the same per-agent trigger-status query the Automations grid does
 * (shared cache), so opening the chat right after creation streams the live
 * activation. Reconnect routes to the Integrations surface, the same hand-off
 * the grid's row badge uses.
 */
import { Button, cn } from "@houston-ai/core";
import type { RoutineTriggerBinding } from "@houston-ai/engine-client";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgentTriggerStatus } from "../../hooks/queries/use-triggers";
import { useUIStore } from "../../stores/ui";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import { triggerActivationKind } from "./routine-trigger-maps";
import { WebhookActivationChip } from "./webhook-activation-chip";

interface Props {
  agentId: string;
  routineId: string;
  /** The routine's wake binding, so the chip renders the right surface: an
   *  incoming-webhook binding needs the mint/rotate flow, a Composio binding
   *  the connect/reconnect health. */
  trigger: RoutineTriggerBinding;
}

export function RoutineActivationChip({ agentId, routineId, trigger }: Props) {
  const { t } = useTranslation("routines");
  const setViewMode = useUIStore((s) => s.setViewMode);

  const routineIds = useMemo(() => [routineId], [routineId]);
  const statusQuery = useAgentTriggerStatus(agentId, true, routineIds);
  const status = useMemo(
    () => statusQuery.data?.find((s) => s.routine_id === routineId),
    [statusQuery.data, routineId],
  );

  const onReconnect = useCallback(() => {
    setViewMode(INTEGRATIONS_VIEW_ID);
  }, [setViewMode]);

  // An incoming-webhook routine has its own mint/rotate surface — no external
  // account to connect, so the Composio health path below never applies.
  if (trigger.kind === "webhook") {
    return (
      <WebhookActivationChip
        agentId={agentId}
        routineId={routineId}
        status={status}
      />
    );
  }

  const kind = triggerActivationKind(status);

  if (kind === "alert") {
    const state = status?.status;
    const label =
      state === "paused_disconnected"
        ? t("trigger.status.paused_disconnected")
        : state === "paused_revoked"
          ? t("trigger.status.paused_revoked")
          : t("trigger.status.error");
    const detail =
      status?.detail ??
      (state === "paused_disconnected"
        ? t("trigger.statusDisconnectedHint")
        : state === "paused_revoked"
          ? t("trigger.statusRevokedHint")
          : undefined);
    return (
      <div className="flex flex-col items-end gap-0.5 max-w-[15rem]">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          {label}
        </span>
        {detail && (
          <p className="text-xs text-ink-muted text-right line-clamp-2">
            {detail}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onReconnect}
          className="-mr-2"
        >
          {t("trigger.reconnect")}
        </Button>
      </div>
    );
  }

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
