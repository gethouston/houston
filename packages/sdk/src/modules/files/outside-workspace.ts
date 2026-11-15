import { OUTSIDE_WORKSPACE } from "@houston/protocol/file-refusal";
import { refusalCode, refusalStatus } from "../refusal-code";

/**
 * Whether a failed files read was refused because the path points outside
 * the agent's files (`400 outside_workspace`): an agent linked a turn
 * sandbox path, an internal `.houston/` document, or a `..` path
 * (HOUSTON-APP-5HK). Reads the adapter's parsed `body`, a raw text `body`, or
 * the SDK's own error, whose message is the response text. Keyed on the code
 * alone: the host's English message is no contract, and a 400 without the
 * code is some other refusal that stays a failure.
 *
 * An expected state with its own copy. A burst of them means an agent (or
 * the product prompt) keeps linking such paths, which is ours to fix, so
 * every surface reports it as one fingerprinted warning.
 *
 * Dependency-free beyond that protocol subpath and erasable-syntax-only: the
 * app's node:test entry points load it through the
 * `@houston/sdk/files/outside-workspace` subpath.
 */
export function isOutsideWorkspaceRefusal(error: unknown): boolean {
  return (
    error instanceof Error &&
    refusalStatus(error) === 400 &&
    refusalCode(error) === OUTSIDE_WORKSPACE
  );
}
