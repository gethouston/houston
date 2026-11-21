import type { ChannelProviderId } from "@houston/engine-adapter";
import slackLogo from "../../../assets/integrations/slack.svg";
import whatsAppLogo from "../../../assets/integrations/whatsapp.svg";

interface ChannelProviderDisplay {
  logo: string;
  description: string;
  accountsTitle: string;
  connect: string;
  addAnother: string;
  notConfigured: string;
}

export const CHANNEL_PROVIDER_DISPLAY = {
  slack: {
    logo: slackLogo,
    description: "channels.slack.description",
    accountsTitle: "channels.slack.accounts",
    connect: "channels.slack.connect",
    addAnother: "channels.slack.addAnother",
    notConfigured: "channels.slack.notConfigured",
  },
  whatsapp: {
    logo: whatsAppLogo,
    description: "channels.whatsapp.description",
    accountsTitle: "channels.whatsapp.accounts",
    connect: "channels.whatsapp.connect",
    addAnother: "channels.whatsapp.addAnother",
    notConfigured: "channels.whatsapp.notConfigured",
  },
} as const satisfies Record<ChannelProviderId, ChannelProviderDisplay>;
