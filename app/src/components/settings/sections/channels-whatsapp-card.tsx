import type { ChannelConnection, WhatsAppLink } from "@houston/engine-adapter";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { ChannelCardState } from "./channel-provider-cards";
import { ChannelProviderPanel } from "./channel-provider-panel";
import { WhatsAppLinkDetails } from "./channels-whatsapp-link";

export function ChannelsWhatsAppCard({
  name,
  state,
  busy,
  waiting,
  link,
  onLink,
  onDisconnect,
  headingRef,
}: {
  name: string;
  state: ChannelCardState;
  busy: boolean;
  waiting: boolean;
  link: WhatsAppLink | undefined;
  onLink: () => void;
  onDisconnect: (connection: ChannelConnection) => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const { t } = useTranslation("settings");
  return (
    <ChannelProviderPanel
      provider="whatsapp"
      name={name}
      state={state}
      busy={busy}
      actionLabel={link ? t("channels.newCode") : undefined}
      onConnect={onLink}
      onDisconnect={onDisconnect}
      headingRef={headingRef}
    >
      {link && (
        <WhatsAppLinkDetails link={link} busy={busy} waiting={waiting} />
      )}
    </ChannelProviderPanel>
  );
}
