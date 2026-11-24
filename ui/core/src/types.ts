/**
 * Stable failure `kind` for a Claude Code install attempt. Mirror of the
 * Rust `ClaudeInstallError` enum in
 * `engine/houston-ui-events/src/lib.rs` (serde `tag = "kind"`,
 * snake_case). The engine emits the slug; the frontend localizes it. The
 * two MUST stay in sync.
 */
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

/**
 * Typed install failure carried by `ClaudeCliFailed`. `kind` is
 * localized by the frontend; `detail` is technical text for the bug
 * report, never shown verbatim.
 */
export interface ClaudeInstallError {
  kind: ClaudeInstallErrorKind;
  /** Present on `http_error`. */
  status?: number;
  /** Present on `platform_unsupported`. */
  platform?: string;
  /** Present on `checksum_mismatch` / `write_failed` / `unknown`. */
  detail?: string;
}
