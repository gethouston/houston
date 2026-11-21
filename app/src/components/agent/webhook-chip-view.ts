import type { WebhookKeyAccess } from "@houston/sdk";
import type { WebhookActivationState } from "./routine-trigger-maps";

export interface WebhookChipView {
  active: boolean;
  checking: boolean;
  alert: boolean;
  showCreate: boolean;
  showRotate: boolean;
  notice: "creator_only" | "owner_only" | null;
}

export function webhookChipView(
  state: WebhookActivationState,
  access: WebhookKeyAccess,
): WebhookChipView {
  const allowed = access === "allowed";
  const keyed = state === "needs_key" || state === "active";
  return {
    active: state === "active",
    checking: state === "checking",
    alert: state === "alert",
    showCreate: state === "needs_key" && allowed,
    showRotate: state === "active" && allowed,
    notice: !keyed
      ? null
      : access === "not_creator"
        ? "creator_only"
        : access === "not_owner"
          ? "owner_only"
          : null,
  };
}
