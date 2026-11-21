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
  | "bug_intake_unavailable"
  | "upload_interrupted"
  | "routine_gone"
  | "link_identity_taken"
  | "codex_port_taken";

export function quietBurstKey(
  kind: QuietErrorClass,
  command: string,
  agent: string | null,
): string {
  if (kind === "offline") return kind;
  return `${kind}:${command}:${agent ?? ""}`;
}
