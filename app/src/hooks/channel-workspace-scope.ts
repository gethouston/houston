import { createChannelScope } from "../lib/channel-scope";
import type { Session } from "../lib/identity";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { useWorkspaceStore } from "../stores/workspaces";

export function channelWorkspaceScope() {
  return createChannelScope(
    () =>
      JSON.stringify([
        useWorkspaceStore.getState().current?.id,
        queryClient.getQueryData<Session | null>(queryKeys.session())?.uid,
      ]),
    (changed) => {
      const offSpace = useWorkspaceStore.subscribe(changed);
      const offSession = queryClient.getQueryCache().subscribe(changed);
      return () => {
        offSpace();
        offSession();
      };
    },
  );
}

export async function inChannelWorkspace<T>(
  spaceId: string | undefined,
  action: (assertCurrent: () => void, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const scope = channelWorkspaceScope();
  try {
    if (useWorkspaceStore.getState().current?.id !== spaceId) {
      throw new DOMException("Channel scope changed", "AbortError");
    }
    const result = await action(scope.assertCurrent, scope.signal);
    scope.assertCurrent();
    return result;
  } finally {
    scope.close();
  }
}
