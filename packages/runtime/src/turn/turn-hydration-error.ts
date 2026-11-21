import { HydrateLimitError } from "@houston/runtime-client/object-sync";
import { TurnSetupError } from "./turn-layout";

export function turnHydrationError(error: unknown): unknown {
  return error instanceof HydrateLimitError
    ? new TurnSetupError("hydrate_over_cap", error.message)
    : error;
}
