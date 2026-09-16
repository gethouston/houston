/**
 * Which provider/model pair gets WRITTEN onto a freshly imported agent.
 *
 * A pair the user picked by hand outranks every default. Otherwise only a
 * confirmed connection is worth persisting: the non-blocking fallback the
 * selector displays while statuses are still unknown is a guess, and a guess
 * pinned onto the agent would outlive the screen that made it.
 */

import { pickDefaultProviderModel } from "../../lib/default-provider-model.ts";
import type { KickoffPin } from "./import-install-request";

interface KickoffPinInput {
  /** The user picked the pair in the selector rather than inheriting it. */
  userPickedModel: boolean;
  provider: string;
  model: string;
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
  connectedProviders: readonly string[];
}

export function resolveKickoffPin({
  userPickedModel,
  provider,
  model,
  lastUsedProvider,
  lastUsedModel,
  connectedProviders,
}: KickoffPinInput): KickoffPin {
  if (userPickedModel) return { provider, model };
  const resolved = pickDefaultProviderModel({
    lastUsedProvider,
    lastUsedModel,
    connectedProviders,
  });
  return resolved.confirmed
    ? { provider: resolved.provider, model: resolved.model }
    : {};
}
