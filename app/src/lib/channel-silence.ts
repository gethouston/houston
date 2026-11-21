import {
  channelUnavailableReason,
  slackCompletionFailure,
} from "@houston/wire-types";

export type ChannelCall =
  | "list_channels"
  | "connect_slack"
  | "open_slack"
  | "link_slack"
  | "link_whatsapp"
  | "complete_slack"
  | "disconnect_channel";

export interface ChannelFailure {
  unavailable: boolean;
  refusedTicket: boolean;
  cancelled: boolean;
}

export function silenceChannelError(
  call: ChannelCall,
  failure: ChannelFailure,
): boolean {
  if (failure.unavailable || failure.cancelled) return true;
  return call === "complete_slack" && failure.refusedTicket;
}

export function silenceChannelCall(call: ChannelCall, error: unknown): boolean {
  return silenceChannelError(call, {
    unavailable: channelUnavailableReason(error) !== null,
    refusedTicket: slackCompletionFailure(error) !== null,
    cancelled: error instanceof Error && error.name === "AbortError",
  });
}
