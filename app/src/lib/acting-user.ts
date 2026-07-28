/**
 * Who is sending a turn — the acting user's identity, as the send path stamps
 * it onto the optimistic bubble (HOU-943).
 *
 * In a shared conversation the gateway stamps every persisted message with its
 * author (from `x-houston-acting-as`), so a reload attributes each turn. The
 * LIVE bubble is pushed client-side before any server frame exists, so it needs
 * the same identity from here — otherwise the message the user just sent is the
 * one row in a multiplayer thread with no name on it.
 *
 * Read from the shared query cache (`["session"]`, the one place the signed-in
 * session lives) rather than a second copy: no new state to keep in sync, and a
 * signed-out or single-player client simply resolves `undefined`, leaving the
 * bubble authorless exactly as it is today.
 */

import type { Session } from "./identity";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";

export interface ActingUser {
  userId: string;
  name?: string;
}

/** The signed-in caller, or `undefined` when signed out / identity-less. */
export function actingUser(): ActingUser | undefined {
  const session = queryClient.getQueryData<Session | null>(queryKeys.session());
  if (!session) return undefined;
  return {
    userId: session.uid,
    ...(session.displayName ? { name: session.displayName } : {}),
  };
}
