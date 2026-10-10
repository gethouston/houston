import type { ChannelConnection, WhatsAppLink } from "@houston/engine-adapter";
import { Button } from "@houston-ai/core";
import { MessageCircle, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "../settings-row";
import { ChannelConnectionRow } from "./channel-connection-row";
import { WhatsAppLinkDetails } from "./channels-whatsapp-link";

/**
 * The WhatsApp row: who is connected, and a connection code to send from the
 * person's own WhatsApp. "Waiting for your message" holds until that
 * connection lands or the code expires.
 */
export function ChannelsWhatsAppCard({
  name,
  connectable,
  connections,
  busy,
  waiting,
  link,
  onLink,
  onDisconnect,
}: {
  name: string;
  connectable: boolean;
  connections: ChannelConnection[];
  busy: boolean;
  waiting: boolean;
  link: WhatsAppLink | undefined;
  onLink: () => void;
  onDisconnect: (connection: ChannelConnection) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <SettingsCard>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <MessageCircle className="size-5 text-ink-muted" />
          <div>
            <h3 className="text-sm font-medium text-ink">{name}</h3>
            <p className="text-sm text-ink-muted">
              {t("channels.whatsapp.description")}
            </p>
          </div>
        </div>
        {!connections.length && (
          <p className="text-sm text-ink-muted">{t("channels.empty")}</p>
        )}
        {connections.map((connection) => (
          <ChannelConnectionRow
            key={connection.id}
            connection={connection}
            busy={busy}
            onDisconnect={onDisconnect}
          />
        ))}
        {connectable ? (
          <div className="space-y-3">
            <Button disabled={busy} onClick={onLink}>
              <Plus className="size-4" />
              {t(link ? "channels.newCode" : "channels.whatsapp.connect")}
            </Button>
            {link && (
              <WhatsAppLinkDetails link={link} busy={busy} waiting={waiting} />
            )}
          </div>
        ) : (
          <p role="status" className="text-sm text-ink-muted">
            {t("channels.whatsapp.notConfigured")}
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
