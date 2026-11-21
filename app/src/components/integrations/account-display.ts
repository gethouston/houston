import type { IntegrationConnection } from "@houston/engine-adapter";
import type { TFunction } from "i18next";

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
