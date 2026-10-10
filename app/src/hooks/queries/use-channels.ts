import {
  type ChannelWatches,
  channelWatchPollMs,
} from "@houston/sdk/channels/watch";
import type { ChannelStatus } from "@houston/wire-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { channelsWithout } from "../../lib/account-cache-patches";
import type { SlackAuthorization } from "../../lib/channel-handoff";
import { silenceChannelCall } from "../../lib/channel-silence";
import { logAndReportError } from "../../lib/error-report";
import { runOptimisticWrite } from "../../lib/optimistic-core";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { refetchAfterWrite } from "../../lib/refetch-after-write";
import { tauriChannels } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";
import { inChannelWorkspace } from "../channel-workspace-scope";

/**
 * The endpoint describes availability; absent deployments expose no nav row.
 * `watches` are the hand-offs the Channels section has outstanding, one per
 * provider at most; the nav row reads availability only and never polls.
 */
export function useChannels(watches: ChannelWatches = {}) {
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
    // is told when it lands: the SDK's watch policy says when to poll.
    refetchInterval: (query) =>
      channelWatchPollMs(
        watches,
        query.state.data?.connections ?? [],
        Date.now(),
      ),
  });
}

export function useChannelActions() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  const spaceId = useWorkspaceStore((s) => s.current?.id);
  const invalidateHere = () => {
    if (useWorkspaceStore.getState().current?.id === spaceId) {
      return refetchAfterWrite(qc, queryKeys.channels(spaceId));
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
  const linkWhatsApp = useMutation({
    mutationFn: () =>
      inChannelWorkspace(spaceId, (_assert, signal) =>
        tauriChannels.linkWhatsApp(signal),
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
  const [disconnecting, setDisconnecting] = useState(0);
  /**
   * Optimistic: the account leaves the card on the click. A refusal the
   * section answers itself (no channels here, the user moved away) only
   * rolls back; the refetch shows the truth. `disconnecting` stays up until
   * the write settles: a hand-off started meanwhile would record the ids
   * without the removed account, and a rollback would then read as a landing.
   */
  const disconnect = useCallback(
    (id: string) => {
      setDisconnecting((n) => n + 1);
      void runOptimisticWrite(
        {
          qc,
          command: "disconnect_channel",
          patches: [
            {
              queryKey: queryKeys.channels(spaceId),
              apply: (status: ChannelStatus | undefined) =>
                channelsWithout(status, id),
            },
          ],
          write: () =>
            inChannelWorkspace(spaceId, (_assert, signal) =>
              tauriChannels.disconnect(id, signal),
            ),
          failure: {
            title: t("writeFailed.disconnectChannel.title"),
            description: t("writeFailed.disconnectChannel.description"),
          },
        },
        (command, err, copy) => {
          if (silenceChannelCall("disconnect_channel", err)) return;
          tellOptimisticRefusal(command, err, copy);
        },
        logAndReportError,
      ).finally(() => setDisconnecting((n) => n - 1));
    },
    [qc, spaceId, t],
  );
  return {
    connect,
    reopen,
    complete,
    link,
    linkWhatsApp,
    disconnect,
    disconnecting: disconnecting > 0,
  };
}
