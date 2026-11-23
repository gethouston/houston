import { currentActingContext } from "../session/acting-context";

export type TurnCredentialHealthMark = "needs_reconnect" | "out_of_credits";

export interface TurnCredentialChannel {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  hostToken: string;
  actingAs?: string;
  provider: string;
  kind: "oauth" | "api_key";
  scope: "personal" | "team";
  accessSha256?: string;
  health?: TurnCredentialHealthMark;
}

export function currentTurnCredentialChannel():
  | TurnCredentialChannel
  | undefined {
  return currentActingContext()?.credentialChannel;
}
