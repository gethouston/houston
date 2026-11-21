import type { TurnLimits } from "@houston/protocol";

export interface FireTurnOptions {
  actingUser?: string | undefined;
  actingAs?: string | undefined;
  limits?: TurnLimits | undefined;
  routine?: true;
  nonce?: string;
}
