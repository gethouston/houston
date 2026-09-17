import {
  type ChannelConnection,
  channelUnavailableReason,
  slackCompletionFailure,
} from "@houston/engine-adapter";
import { Button, ConfirmDialog, Skeleton } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useChannelActions,
  useChannels,
} from "../../../hooks/queries/use-channels";
import { useSlackCompletion } from "../../../hooks/use-slack-completion";
import {
  type ChannelWatch,
  slackHandoff,
  startChannelWatch,
} from "../../../lib/channel-handoff";
import { slackCompletionResult } from "../../../lib/slack-completion";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { ChannelsSlackCard } from "./channels-slack-card";

export function ChannelsSection() {
  const space = useWorkspaceStore((s) => s.current);
  return <ChannelsBody key={space?.id} spaceName={space?.name ?? ""} />;
}

function ChannelsBody({ spaceName }: { spaceName: string }) {
  const { t } = useTranslation("settings");
  const { connect, reopen, complete, link, disconnect } = useChannelActions();
  const [target, setTarget] = useState<ChannelConnection | null>(null);
  const [watch, setWatch] = useState<ChannelWatch | null>(null);
  const landed = useSlackCompletion(complete.mutate);
  const query = useChannels(watch);
  const unavailable = channelUnavailableReason(query.error);
  const slack = query.data?.providers.find(
    (provider) => provider.id === "slack",
  );
  const connections = query.data?.connections ?? [];
  const busy =
    connect.isPending ||
    complete.isPending ||
    link.isPending ||
    disconnect.isPending;
  const completionFailed = slackCompletionResult(
    landed,
    slackCompletionFailure(complete.error),
  );
  const actionUnavailable = [
    connect.error,
    complete.error,
    link.error,
    disconnect.error,
  ].some((error) => channelUnavailableReason(error) === "not-configured");
  /** Every hand-off starts the watch: the connection arrives out of band. */
  const handOff = (start: () => void) => {
    setWatch(startChannelWatch(connections.length, Date.now()));
    start();
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
          {t("channels.completing")}
        </p>
      ) : completionFailed ? (
        <p role="status" className="text-sm text-ink-muted">
          {t(
            completionFailed === "taken"
              ? "channels.completeAlready"
              : "channels.completeInvalid",
          )}
        </p>
      ) : null}
      {query.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : unavailable || (query.data && !slack) ? (
        <p className="text-sm text-ink-muted" role="status">
          {t(
            unavailable === "not-configured"
              ? "channels.notConfigured"
              : "channels.unsupported",
          )}
        </p>
      ) : query.data ? (
        <ChannelsSlackCard
          name={slack?.name ?? ""}
          connectable={!!slack?.configured && !actionUnavailable}
          connections={connections}
          busy={busy}
          connecting={connect.isPending}
          handoff={slackHandoff(connect.data, reopen.data)}
          link={link.data}
          onConnect={() =>
            handOff(() => {
              reopen.reset();
              connect.mutate();
            })
          }
          onOpen={(url) => reopen.mutate(url)}
          onLink={() => handOff(() => link.mutate())}
          onDisconnect={setTarget}
        />
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={query.isFetching}
        onClick={() => {
          if (actionUnavailable) {
            connect.reset();
            link.reset();
            disconnect.reset();
          }
          complete.reset();
          void query.refetch();
        }}
      >
        {t("channels.refresh")}
      </Button>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={t("channels.disconnectTitle")}
        description={t("channels.disconnectDescription", {
          name: target?.accountLabel ?? "",
        })}
        confirmLabel={t("channels.disconnect")}
        cancelLabel={t("channels.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (target) disconnect.mutate(target.id);
        }}
      />
    </section>
  );
}
