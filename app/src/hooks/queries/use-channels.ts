import { startSlackConnect } from "@houston/sdk/channels/connect-flow";
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
import { generateState } from "../../lib/identity/pkce";
import { normalizeLocale } from "../../lib/locale";
import { runOptimisticWrite } from "../../lib/optimistic-core";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import {
  osCancelChannelsLoopback,
  osIsTauri,
  osStartChannelsLoopback,
} from "../../lib/os-bridge";
import { queryKeys } from "../../lib/query-keys";
import { refetchAfterWrite } from "../../lib/refetch-after-write";
import { tauriChannels } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";
import { inChannelWorkspace } from "../channel-workspace-scope";

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
  const { t, i18n } = useTranslation("settings");
  const spaceId = useWorkspaceStore((s) => s.current?.id);
  const invalidateHere = () => {
    if (useWorkspaceStore.getState().current?.id === spaceId) {
      return refetchAfterWrite(qc, queryKeys.channels(spaceId));
    }
  };
  const returnCopy = () => ({
    lang: normalizeLocale(i18n.resolvedLanguage) ?? "en",
    success: {
      heading: t("channels.slack.returnPage.returnHeading"),
      body: t("channels.slack.returnPage.returnBody"),
    },
    stale: {
      heading: t("channels.slack.returnPage.staleHeading"),
      body: t("channels.slack.returnPage.staleBody"),
    },
    openButton: t("channels.slack.returnPage.openHouston"),
  });
  const connect = useMutation({
    mutationFn: (): Promise<SlackAuthorization> =>
      inChannelWorkspace(spaceId, (assertCurrent, signal) =>
        startSlackConnect({
          connect: async (returnTo) => {
            const answer = await tauriChannels.connectSlack(returnTo, signal);
            assertCurrent();
            return answer;
          },
          listener: osIsTauri()
            ? {
                start: (state) => osStartChannelsLoopback(state, returnCopy()),
                cancel: osCancelChannelsLoopback,
              }
            : null,
          newState: generateState,
          assertCurrent,
          open: tauriChannels.openSlack,
          report: logAndReportError,
        }),
      ),
  });
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
  const complete = useMutation({
    mutationFn: (ticket: string) =>
      inChannelWorkspace(spaceId, (_assert, signal) =>
        tauriChannels.completeSlack(ticket, signal),
      ),
    onSuccess: invalidateHere,
  });
  const [disconnecting, setDisconnecting] = useState(0);
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
