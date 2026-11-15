/**
 * MiniMax ids Houston once stored that MiniMax's API no longer serves. A turn
 * on one, pinned or saved, runs on the MiniMax default (`DEFAULT_MODEL`), and
 * the host catalog keeps each as a hidden row whose `runsAs` names that
 * default, so an allowed-models ceiling written with it still admits MiniMax.
 *
 * - `MiniMax-M3[1m]` came from MiniMax's Claude Code setup, where `[1m]` is a
 *   client-side marker Claude Code strips before the request. Sent verbatim it
 *   fails every turn with `unknown model 'MiniMax-M3[1m]' (2013)`.
 * - `MiniMax-M2.7` and `MiniMax-M2.7-highspeed` are retired: closed to new
 *   users on 2026-10-19, pay-as-you-go ends 2026-11-18, plan keys already run
 *   M3.1 Flash in their place, and the Anthropic endpoint no longer lists them.
 *
 * A dependency-free LEAF (see `provider-dialect.ts`), exposed as the
 * `@houston/domain/minimax-retired` subpath for the runtime and the host.
 */

export const MINIMAX_PROVIDER = "minimax";

export const MINIMAX_RETIRED_MODELS: ReadonlySet<string> = new Set([
  "MiniMax-M3[1m]",
  "MiniMax-M2.7",
  "MiniMax-M2.7-highspeed",
]);
