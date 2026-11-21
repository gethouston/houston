import gmailIcon from "../../assets/integrations/gmail.svg";
import outlookIcon from "../../assets/integrations/outlook.svg";
import slackIcon from "../../assets/integrations/slack.svg";
import type { CONNECT_APPS_FALLBACK } from "./connect-group-logos";

const BUNDLED_LOGOS = {
  gmail: gmailIcon,
  outlook: outlookIcon,
  slack: slackIcon,
} satisfies Record<(typeof CONNECT_APPS_FALLBACK)[number], string>;

const BY_SLUG: ReadonlyMap<string, string> = new Map(
  Object.entries(BUNDLED_LOGOS),
);

export function bundledConnectAppLogo(slug: string): string {
  return BY_SLUG.get(slug) ?? "";
}
