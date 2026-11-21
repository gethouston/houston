export type ClaudeInstallErrorKind =
  | "timeout"
  | "network_unreachable"
  | "download_interrupted"
  | "http_error"
  | "checksum_mismatch"
  | "platform_unsupported"
  | "write_failed"
  | "manifest_missing"
  | "manifest_entry_missing"
  | "unknown";

export interface ClaudeInstallError {
  kind: ClaudeInstallErrorKind;
  status?: number;
  platform?: string;
  detail?: string;
}
