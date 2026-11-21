import { sidebarSheetRowClasses } from "@houston-ai/layout";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AccountMenuParts } from "./sidebar-account-menu";
import { SignedInHeader } from "./workspace-switcher-face";

export function MobileMoreAccountPage({
  account,
  onBack,
}: {
  account: AccountMenuParts;
  onBack: () => void;
}) {
  const { t } = useTranslation("shell");
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  const personal = account.actions.filter((a) => a.id !== "signOut");
  const signOut = account.actions.find((a) => a.id === "signOut");
  return (
    <div data-testid="more-account-page" className="flex min-h-0 flex-col py-2">
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        aria-label={t("moreMenu.backFrom", { label: account.label })}
        data-testid="more-account-back"
        className={sidebarSheetRowClasses}
      >
        <ChevronLeft className="size-5 shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">
          {account.label}
        </span>
      </button>
      {account.identity && (
        <div className="px-4 pt-1 pb-3">
          <SignedInHeader
            name={account.identity.name}
            email={account.identity.email}
          />
        </div>
      )}
      <div className="border-line border-t pt-2">
        {personal.map((action) => (
          <AccountPageRow key={action.id} action={action} />
        ))}
      </div>
      {signOut && (
        <div className="mt-2 border-line border-t pt-2">
          <AccountPageRow action={signOut} />
        </div>
      )}
    </div>
  );
}

function AccountPageRow({
  action,
}: {
  action: AccountMenuParts["actions"][number];
}) {
  return (
    <button
      type="button"
      onClick={action.onSelect}
      className={sidebarSheetRowClasses}
      {...action.dataAttrs}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-ink-muted">
        {action.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
    </button>
  );
}
