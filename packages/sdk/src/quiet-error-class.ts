import type { BridgeQuietClass } from "@houston/sdk/local-model-bridge/quiet";

export type QuietErrorClass =
  | "office_preview_capacity"
  | "engine_waking"
  | "offline"
  | BridgeQuietClass
  | "release_host_unavailable"
  | "storage_full"
  | "no_url_handler"
  | "plan_min_interval"
  | "webhook_not_creator"
  | "first_day_no_provider"
  | "first_day_provider_unavailable"
  | "first_day_account_blocked"
  | "bug_intake_unavailable"
  | "upload_interrupted"
  | "routine_gone"
  | "link_identity_taken"
  | "codex_port_taken"
  | "compute_busy"
  | "conversation_edit_refused";

export function quietBurstKey(
  kind: QuietErrorClass,
  command: string,
  agent: string | null,
): string {
  if (kind === "offline") return kind;
  return `${kind}:${command}:${agent ?? ""}`;
}
