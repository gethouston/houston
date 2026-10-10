import {
  type ChannelConnection,
  channelUnavailableReason,
  slackCompletionFailure,
} from "@houston/engine-adapter";
import { channelWatchActive } from "@houston/sdk/channels/watch";
import { Button, Skeleton } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useChannelActions } from "../../../hooks/queries/use-channels";
import { useSlackCompletion } from "../../../hooks/use-slack-completion";
import { slackHandoff } from "../../../lib/channel-handoff";
import { slackCompletionResult } from "../../../lib/slack-completion";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { ChannelDisconnectDialog } from "./channel-disconnect-dialog";
import {
  type ChannelProviderCard,
  channelProviderCards,
} from "./channel-provider-cards";
import { ChannelsSlackCard } from "./channels-slack-card";
import { ChannelsWhatsAppCard } from "./channels-whatsapp-card";
import { useWatchedChannels } from "./use-watched-channels";

export function ChannelsSection() {
  const space = useWorkspaceStore((s) => s.current);
  return <ChannelsBody key={space?.id} spaceName={space?.name ?? ""} />;
}

function ChannelsBody({ spaceName }: { spaceName: string }) {
  const { t } = useTranslation("settings");
  const {
    connect,
    reopen,
    complete,
    link,
    linkWhatsApp,
    disconnect,
    disconnecting,
  } = useChannelActions();
  const [target, setTarget] = useState<ChannelConnection | null>(null);
  // A landed connection spends the hand-off that produced it: clear its code
  // and its "finish in Slack" line so nothing invites a second, dead attempt.
  const { query, connections, watches, watch } = useWatchedChannels(
    (provider) => {
      switch (provider) {
        case "slack":
          link.reset();
          connect.reset();
          reopen.reset();
          return;
        case "whatsapp":
          linkWhatsApp.reset();
          return;
        default: {
          const unknown: never = provider;
          return unknown;
        }
      }
    },
  );
  const landed = useSlackCompletion(complete.mutate);
  const unavailable = channelUnavailableReason(query.error);
  const cards = query.data ? channelProviderCards(query.data) : [];
  const busy =
    connect.isPending ||
    complete.isPending ||
    link.isPending ||
    linkWhatsApp.isPending ||
    disconnecting;
  const completionFailed = slackCompletionResult(
    landed,
    slackCompletionFailure(complete.error),
  );
  const slackUnavailable = [connect.error, complete.error, link.error].some(
    (error) => channelUnavailableReason(error) === "not-configured",
  );
  const whatsAppUnavailable =
    channelUnavailableReason(linkWhatsApp.error) === "not-configured";
  /** One card per provider; a provider with no case here fails to compile. */
  const renderCard = ({ provider, connections: own }: ChannelProviderCard) => {
    const id = provider.id;
    switch (id) {
      case "slack":
        return (
          <ChannelsSlackCard
            key={id}
            name={provider.name}
            connectable={provider.configured && !slackUnavailable}
            connections={own}
            busy={busy}
            connecting={connect.isPending}
            handoff={slackHandoff(connect.data, reopen.data)}
            link={link.data}
            onConnect={() => {
              watch("slack");
              reopen.reset();
              connect.mutate();
            }}
            onOpen={(url) => reopen.mutate(url)}
            // The code lives longer than the default window; watch it all.
            onLink={() =>
              link.mutate(undefined, {
                onSuccess: (minted) => watch("slack", minted.expiresAt),
              })
            }
            onDisconnect={setTarget}
          />
        );
      case "whatsapp":
        return (
          <ChannelsWhatsAppCard
            key={id}
            name={provider.name}
            connectable={provider.configured && !whatsAppUnavailable}
            connections={own}
            busy={busy}
            waiting={channelWatchActive(
              watches.whatsapp,
              connections,
              Date.now(),
            )}
            link={linkWhatsApp.data}
            // The code is scanned on another device, so this window is
            // watched for as long as the code lives, not the default window.
            onLink={() =>
              linkWhatsApp.mutate(undefined, {
                onSuccess: (minted) => watch("whatsapp", minted.expiresAt),
              })
            }
            onDisconnect={setTarget}
          />
        );
      default: {
        const unknown: never = id;
        return unknown;
      }
    }
  };
  return (
    <section className="space-y-6">
      <header>
        <h2 className="mb-1 text-lg font-semibold text-ink">
          {t("channels.title")}
        </h2>
        <p className="text-sm text-ink-muted">{t("channels.intro")}</p>
        <p className="mt-2 text-sm text-ink-muted">
          {t("channels.space", { name: spaceName })}
        </p>
      </header>
      {complete.isPending ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("channels.slack.completing")}
        </p>
      ) : completionFailed ? (
        <p role="status" className="text-sm text-ink-muted">
          {t(
            completionFailed === "taken"
              ? "channels.slack.completeAlready"
              : "channels.slack.completeInvalid",
          )}
        </p>
      ) : null}
      {query.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : unavailable || (query.data && cards.length === 0) ? (
        <p className="text-sm text-ink-muted" role="status">
          {t("channels.unsupported")}
        </p>
      ) : (
        cards.map(renderCard)
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={query.isFetching}
        onClick={() => {
          if (slackUnavailable || whatsAppUnavailable) {
            connect.reset();
            link.reset();
            linkWhatsApp.reset();
          }
          complete.reset();
          void query.refetch();
        }}
      >
        {t("channels.refresh")}
      </Button>
      <ChannelDisconnectDialog
        target={target}
        providers={query.data?.providers ?? []}
        onClose={() => setTarget(null)}
        onConfirm={(connection) => disconnect(connection.id)}
      />
    </section>
  );
}
