import { Button } from "@houston-ai/core";
import type { ChannelConnection, ChannelLink } from "@houston/engine-adapter";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { SlackHandoff } from "../../../lib/channel-handoff";
import { ChannelLinkCommand } from "./channel-link-command";
import type { ChannelCardState } from "./channel-provider-cards";
import { ChannelProviderPanel } from "./channel-provider-panel";

/**
 * The Slack card's connect flow. The browser hand-off speaks for itself:
 * "finish in Slack" only once the page is really open, and the page offered
 * behind a click when the browser refused it.
 */
export function ChannelsSlackCard({
  name,
  state,
  busy,
  connecting,
  handoff,
  link,
  onConnect,
  onOpen,
  onLink,
  onDisconnect,
  headingRef,
}: {
  name: string;
  state: ChannelCardState;
  busy: boolean;
  connecting: boolean;
  handoff: SlackHandoff;
  link: ChannelLink | undefined;
  onConnect: () => void;
  onOpen: (url: string) => void;
  onLink: () => void;
  onDisconnect: (connection: ChannelConnection) => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const { t } = useTranslation("settings");
  return (
    <ChannelProviderPanel
      provider="slack"
      name={name}
      state={state}
      busy={busy}
      actionLabel={connecting ? t("channels.slack.connecting") : undefined}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      headingRef={headingRef}
    >
      {handoff.kind === "open" && (
        <p role="status" className="text-sm text-ink-muted">
          {t("channels.slack.finishInSlack")}
        </p>
      )}
      {handoff.kind === "blocked" && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-ink-muted">
            {t("channels.slack.blocked")}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onOpen(handoff.url)}
          >
            {t("channels.slack.openSlack")}
          </Button>
        </div>
      )}
      <div>
        <Button
          variant="link"
          className="h-auto whitespace-normal p-0 text-left"
          disabled={busy}
          onClick={onLink}
        >
          {t(link ? "channels.newCode" : "channels.slack.alreadyAdded")}
        </Button>
      </div>
      {link && (
        <ChannelLinkCommand
          key={link.code}
          link={link}
          instruction={t("channels.slack.linkInstructions")}
          label={t("channels.slack.commandLabel")}
        />
      )}
    </ChannelProviderPanel>
  );
}
