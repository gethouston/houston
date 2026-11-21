import type { Session } from "./identity";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";

export interface ActingUser {
  userId: string;
  name?: string;
}

export function actingUser(): ActingUser | undefined {
  const session = queryClient.getQueryData<Session | null>(queryKeys.session());
  if (!session) return undefined;
  return {
    userId: session.uid,
    ...(session.displayName ? { name: session.displayName } : {}),
  };
}
