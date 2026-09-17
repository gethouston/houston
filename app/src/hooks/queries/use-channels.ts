import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ChannelWatch,
  channelWatchActive,
  type SlackAuthorization,
} from "../../lib/channel-handoff";
import { queryKeys } from "../../lib/query-keys";
import { tauriChannels } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";
import { inChannelWorkspace } from "../channel-workspace-scope";

/**
 * The endpoint describes availability; absent deployments expose no nav row.
 * `watch` is the hand-off the Channels section has outstanding, if any; the nav
 * row reads availability only and never polls.
 */
export function useChannels(watch: ChannelWatch | null = null) {
  const spaceId = useWorkspaceStore((s) => s.current?.id);
  return useQuery({
    queryKey: queryKeys.channels(spaceId),
    queryFn: () =>
      inChannelWorkspace(spaceId, (_assert, signal) =>
        tauriChannels.list(signal),
      ),
    enabled: !!spaceId,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: "always",
    // A connection is made on the gateway, never in this tab, so nothing here
    // is told when it lands: poll while a hand-off is outstanding, and stop the
    // moment it arrives (or the person is plainly not coming back).
    refetchInterval: (query) =>
      channelWatchActive(
        watch,
        query.state.data?.connections.length ?? 0,
        Date.now(),
      )
        ? 5_000
        : false,
  });
}

export function useChannelActions() {
  const qc = useQueryClient();
  const spaceId = useWorkspaceStore((s) => s.current?.id);
  const invalidateHere = () => {
    if (useWorkspaceStore.getState().current?.id === spaceId) {
      return qc.invalidateQueries({ queryKey: queryKeys.channels(spaceId) });
    }
  };
  const connect = useMutation({
    mutationFn: (): Promise<SlackAuthorization> =>
      inChannelWorkspace(spaceId, async (assertCurrent, signal) => {
        const url = await tauriChannels.connectSlack(signal);
        assertCurrent();
        // The browser can REFUSE the open (a popup blocker on web). The
        // section must not claim a tab the user never saw, so the answer is
        // carried back and it offers the page behind a click instead.
        return { url, opened: await tauriChannels.openSlack(url) };
      }),
  });
  /** Open the same page from a real click, which a popup blocker honors. */
  const reopen = useMutation({
    mutationFn: (url: string) => tauriChannels.openSlack(url),
  });
  const link = useMutation({
    mutationFn: () =>
      inChannelWorkspace(spaceId, (_assert, signal) =>
        tauriChannels.linkSlack(signal),
      ),
    gcTime: 0,
  });
  /**
   * Redeem the callback ticket. This is what BINDS the Slack account to the
   * signed-in user, so it runs from the app with its own credential rather than
   * off Slack's redirect, whose completer is nobody in particular.
   */
  const complete = useMutation({
    mutationFn: (ticket: string) =>
      inChannelWorkspace(spaceId, (_assert, signal) =>
        tauriChannels.completeSlack(ticket, signal),
      ),
    onSuccess: invalidateHere,
  });
  const disconnect = useMutation({
    mutationFn: (id: string) =>
      inChannelWorkspace(spaceId, (_assert, signal) =>
        tauriChannels.disconnect(id, signal),
      ),
    onSuccess: invalidateHere,
  });
  return { connect, reopen, complete, link, disconnect };
}
