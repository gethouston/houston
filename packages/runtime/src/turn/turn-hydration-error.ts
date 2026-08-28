import { HydrateLimitError } from "@houston/runtime-client/object-sync";
import { TurnSetupError } from "./turn-layout";

/** Map runtime-client hydration limits onto the turn setup taxonomy. */
export function turnHydrationError(error: unknown): unknown {
  return error instanceof HydrateLimitError
    ? new TurnSetupError("hydrate_over_cap", error.message)
    : error;
}
