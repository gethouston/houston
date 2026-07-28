import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { TFunction } from "i18next";

/**
 * The one line naming an account in the accounts list: the identity the
 * provider knows (an email, a workspace name) when it exposes one, else the
 * connection date, else an ordinal — so two logins to one app always read as
 * two distinct rows, never twins.
 */
export function accountRowLabel(
  account: IntegrationConnection,
  index: number,
  t: TFunction<"integrations">,
  locale: string,
): string {
  if (account.accountLabel) return account.accountLabel;
  if (account.createdAt) {
    const at = new Date(account.createdAt);
    if (!Number.isNaN(at.getTime())) {
      return t("accounts.addedOn", {
        date: new Intl.DateTimeFormat(locale, {
          month: "short",
          day: "numeric",
        }).format(at),
      });
    }
  }
  return t("accounts.fallback", { number: index + 1 });
}
