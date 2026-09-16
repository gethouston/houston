import type { ChannelConnection, ChannelLink } from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { MessageSquare, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SlackHandoff } from "../../../lib/channel-handoff";
import { SettingsCard } from "../settings-row";
import { ChannelLinkCommand } from "./channel-link-command";

/**
 * The Slack row: who is connected, and the two ways to connect. The browser
 * hand-off speaks for itself — "finish in Slack" only once the page is really
 * open, and the page offered behind a click when the browser refused it.
 */
export function ChannelsSlackCard({
  name,
  connectable,
  connections,
  busy,
  connecting,
  handoff,
  link,
  onConnect,
  onOpen,
  onLink,
  onDisconnect,
}: {
  name: string;
  /** Slack is set up for this deployment and no action has said otherwise. */
  connectable: boolean;
  connections: ChannelConnection[];
  busy: boolean;
  connecting: boolean;
  handoff: SlackHandoff;
  link: ChannelLink | undefined;
  onConnect: () => void;
  onOpen: (url: string) => void;
  onLink: () => void;
  onDisconnect: (connection: ChannelConnection) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <SettingsCard>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="size-5 text-ink-muted" />
          <h3 className="text-sm font-medium text-ink">{name}</h3>
        </div>
        {!connections.length && (
          <p className="text-sm text-ink-muted">{t("channels.empty")}</p>
        )}
        {connections.map((connection) => (
          <div
            key={connection.id}
            className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <p className="break-words text-sm text-ink">
                {connection.accountLabel}
              </p>
              <p className="text-xs text-ink-muted">
                {t("channels.connected")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onDisconnect(connection)}
            >
              {t("channels.disconnect")}
            </Button>
          </div>
        ))}
        {connectable ? (
          <div className="space-y-3">
            <Button disabled={busy} onClick={onConnect}>
              <Plus className="size-4" />
              {t(connecting ? "channels.connecting" : "channels.connect")}
            </Button>
            {handoff.kind === "open" && (
              <p role="status" className="text-sm text-ink-muted">
                {t("channels.finishInSlack")}
              </p>
            )}
            {handoff.kind === "blocked" && (
              <div className="space-y-2">
                <p role="status" className="text-sm text-ink-muted">
                  {t("channels.blocked")}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onOpen(handoff.url)}
                >
                  {t("channels.openSlack")}
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
                {t(link ? "channels.newCode" : "channels.alreadyAdded")}
              </Button>
            </div>
            {link && <ChannelLinkCommand link={link} />}
          </div>
        ) : (
          <p role="status" className="text-sm text-ink-muted">
            {t("channels.notConfigured")}
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
