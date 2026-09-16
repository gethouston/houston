// The wire package rather than the adapter barrel: this module is a pure
// decision covered by the node test runner, which resolves the adapter's own
// directory re-exports no further than a bundler would be needed for.
import {
  channelUnavailableReason,
  slackCompletionFailure,
} from "@houston/wire-types";

/** Every engine call the Channels section makes, named for its report. */
export type ChannelCall =
  | "list_channels"
  | "connect_slack"
  | "open_slack"
  | "link_slack"
  | "complete_slack"
  | "disconnect_channel";

/** The failure as `@houston/wire-types` classified it at the call site. */
export interface ChannelFailure {
  /** The deployment serves no channels, or is not configured for them. */
  unavailable: boolean;
  /** The completion route refused the TICKET: unknown, expired, spent, taken. */
  refusedTicket: boolean;
  /** The user's own space or identity change cancelled the call in flight. */
  cancelled: boolean;
}

/**
 * Which channel failures the section answers itself instead of reporting. A
 * deployment that serves no channels is an expected state for EVERY call — the
 * section says so — and so is a call the user cancelled by moving elsewhere.
 *
 * The completion route's typed refusals belong to the completion ALONE: the
 * same status from a disconnect or a link is a break with no copy behind it,
 * and silencing it there would lose the report as well as the toast.
 */
export function silenceChannelError(
  call: ChannelCall,
  failure: ChannelFailure,
): boolean {
  if (failure.unavailable || failure.cancelled) return true;
  return call === "complete_slack" && failure.refusedTicket;
}

/**
 * The same decision off a raw thrown error, for the engine seam
 * (`lib/tauri.ts`), which holds the error rather than a classification.
 */
export function silenceChannelCall(call: ChannelCall, error: unknown): boolean {
  return silenceChannelError(call, {
    unavailable: channelUnavailableReason(error) !== null,
    refusedTicket: slackCompletionFailure(error) !== null,
    cancelled: error instanceof Error && error.name === "AbortError",
  });
}
