import type { TriggerStatusItem } from "@houston/engine-adapter";
import { triggerRemedy } from "@houston/sdk";
import {
  remedyHintKey,
  type TriggerRemedyHintKey,
} from "./trigger-remedy-detail";

export type ActivationAlertLabelKey =
  | "trigger.status.paused_disconnected"
  | "trigger.status.paused_revoked"
  | "trigger.status.error";

export type ActivationAlertHintKey =
  | "trigger.statusDisconnectedHint"
  | "trigger.statusRevokedHint"
  | TriggerRemedyHintKey;

export type ActivationAlertDetail =
  | { kind: "hint"; key: ActivationAlertHintKey }
  | { kind: "server"; text: string }
  | null;

export interface ActivationAlertView {
  labelKey: ActivationAlertLabelKey;
  detail: ActivationAlertDetail;
  showReconnect: boolean;
}

export function activationAlertView(
  status: TriggerStatusItem | undefined,
): ActivationAlertView {
  const state = status?.status;
  const remedy = triggerRemedy(status);
  const labelKey: ActivationAlertLabelKey =
    state === "paused_disconnected"
      ? "trigger.status.paused_disconnected"
      : state === "paused_revoked"
        ? "trigger.status.paused_revoked"
        : "trigger.status.error";
  return {
    labelKey,
    detail: alertDetail(status, remedy),
    showReconnect: remedy === "reconnect",
  };
}

function alertDetail(
  status: TriggerStatusItem | undefined,
  remedy: ReturnType<typeof triggerRemedy>,
): ActivationAlertDetail {
  const remedyKey = remedyHintKey(remedy);
  if (remedyKey) return { kind: "hint", key: remedyKey };
  if (status?.detail) return { kind: "server", text: status.detail };
  if (status?.status === "paused_disconnected")
    return { kind: "hint", key: "trigger.statusDisconnectedHint" };
  if (status?.status === "paused_revoked")
    return { kind: "hint", key: "trigger.statusRevokedHint" };
  return null;
}
