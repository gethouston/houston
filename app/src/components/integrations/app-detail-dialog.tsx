import { CatalogDetailDialog } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { Plus, RotateCw, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { accountRowLabel } from "./account-display";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { ConnectionStatusBadge } from "./connection-status-badge";

interface AppDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  display: AppDisplay;
  connection: IntegrationConnection;
  onReconnect: () => void;
  onDisconnect: () => void;
  description?: string;
  /** Every ACTIVE account behind this app (primary first). More than one
   *  renders the accounts list; each row can be disconnected on its own. */
  accounts?: IntegrationConnection[];
  /** Start connecting ANOTHER account of the same app (a second Gmail). The
   *  section renders only when this is provided. */
  onAddAccount?: () => void;
  /** Confirm-gated disconnect of ONE account (rendered only with 2+). */
  onDisconnectAccount?: (account: IntegrationConnection) => void;
}

/**
 * The per-app detail MODAL for a connected app — the same {@link
 * CatalogDetailDialog} the browse rows open (one detail surface per catalog
 * family, never a slideover): status chip beside the art, the full
 * description, the app's connected ACCOUNTS (an app can hold several — two
 * Gmail logins — each named by the identity the provider knows and removable
 * on its own, plus the "add another account" affordance, HOU-901), and the
 * Reconnect / Disconnect actions. This is a personal connection surface only —
 * which agents may use an app is managed in one place, the Permissions view,
 * so the dialog carries no per-agent controls.
 */
export function AppDetailDialog({
  open,
  onOpenChange,
  display,
  connection,
  onReconnect,
  onDisconnect,
  description,
  accounts,
  onAddAccount,
  onDisconnectAccount,
}: AppDetailDialogProps) {
  const { t, i18n } = useTranslation("integrations");
  const accountList = accounts ?? [];
  return (
    <CatalogDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<AppLogo display={display} size="xl" className="rounded-xl" />}
      title={display.name}
      tags={<ConnectionStatusBadge status={connection.status} />}
      description={description || display.description}
      action={
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onReconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-input px-3 text-sm font-medium text-ink transition-colors hover:bg-chip"
          >
            <RotateCw className="size-4" />
            {t("detail.reconnect")}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Unplug className="size-4" />
            {t("detail.disconnect")}
          </button>
        </div>
      }
    >
      {onAddAccount && accountList.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm font-medium text-ink">
            {t("accounts.title")}
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-input">
            {accountList.map((account, index) => (
              <li
                key={account.connectionId || `${account.toolkit}-${index}`}
                className="flex min-h-10 items-center gap-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {accountRowLabel(account, index, t, i18n.language)}
                </span>
                {accountList.length > 1 && onDisconnectAccount && (
                  <button
                    type="button"
                    aria-label={t("accounts.remove", {
                      name: accountRowLabel(account, index, t, i18n.language),
                    })}
                    onClick={() => onDisconnectAccount(account)}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger/10"
                  >
                    <Unplug className="size-4" />
                  </button>
                )}
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={onAddAccount}
                className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-hover"
              >
                <Plus className="size-4" />
                {t("accounts.add")}
              </button>
            </li>
          </ul>
        </div>
      )}
    </CatalogDetailDialog>
  );
}
