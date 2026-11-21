import cromaIcon from "../../assets/integrations/croma.svg";
import highlevelIcon from "../../assets/integrations/highlevel.svg";
import manychatIcon from "../../assets/integrations/manychat.svg";

const CURATED_LOGOS: Readonly<Record<string, string>> = {
  croma: cromaIcon,
  highlevel: highlevelIcon,
  manychat: manychatIcon,
};

export function curatedLogoUrl(slug: string): string {
  return CURATED_LOGOS[slug] ?? "";
}

export function customIntegrationLogoUrl(
  slug: string,
  iconUrl: string | undefined,
): string {
  return curatedLogoUrl(slug) || iconUrl || "";
}
