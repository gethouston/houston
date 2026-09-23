/**
 * Which provider/model pair gets WRITTEN onto a freshly imported agent.
 *
 * A pair the user picked by hand outranks every default. Everything else is
 * `kickoffPinFromScan`'s rule: only a CONFIRMED connection is worth persisting,
 * because the fallback the selector displays while statuses are unknown is a
 * guess, and a guess pinned onto the agent would outlive the screen that made
 * it. An unanswerable scan pins nothing here — the press is already running the
 * install, so there is nowhere to wait for a better answer, and "no pin" is the
 * same outcome the create dialog reaches when its own re-probe comes back
 * unconfirmed.
 */

import { type KickoffPin, kickoffPinFromScan } from "../../lib/kickoff-pin.ts";

interface KickoffPinInput {
  /** The user picked the pair in the selector rather than inheriting it. */
  userPickedModel: boolean;
  provider: string;
  model: string;
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
  /** Confirmed connected ids, or `null` when the scan could not answer. */
  connected: readonly string[] | null;
}

export function resolveKickoffPin({
  userPickedModel,
  provider,
  model,
  lastUsedProvider,
  lastUsedModel,
  connected,
}: KickoffPinInput): KickoffPin {
  if (userPickedModel) return { provider, model };
  return (
    kickoffPinFromScan({ connected, lastUsedProvider, lastUsedModel }) ?? {}
  );
}
