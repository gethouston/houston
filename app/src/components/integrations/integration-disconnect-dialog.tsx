import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { AgentChip } from "./agent-chip";
import type { AppDisplay } from "./app-display";

/**
 * The confirm-gated disconnect, shared by both surfaces. Same dialog, different
 * stakes — `scope` picks the copy: `agent` (removes the app for your agent) vs
 * `everywhere` (the connection is user-level, so it disappears for ALL agents).
 * When `affectedAgents` is given, the body names how many agents lose access.
 */
export function IntegrationDisconnectDialog({
  app,
  connectionId,
  accountLabel,
  scope,
  onClose,
  onConfirm,
  affectedAgents,
}: {
  /** The app pending disconnect, or null when the dialog is closed. */
  app: AppDisplay | null;
  /** The account being disconnected; passed back to `onConfirm`. */
  connectionId: string | null;
  /** The account's display label, named in the body so the user knows which. */
  accountLabel?: string;
  scope: "agent" | "everywhere";
  onClose: () => void;
  onConfirm: (connectionId: string) => void;
  affectedAgents?: AgentChip[];
}) {
  const { t } = useTranslation("integrations");
  const keys =
    scope === "everywhere"
      ? ({
          title: "grants.disconnect.confirmTitle",
          body: "grants.disconnect.confirmBody",
          action: "grants.disconnect.confirmAction",
        } as const)
      : ({
          title: "connected.disconnect.confirmTitle",
          body: "connected.disconnect.confirmBody",
          action: "connected.disconnect.confirmAction",
        } as const);

  const account = accountLabel
    ? t("disconnect.account", { label: accountLabel })
    : "";
  const affected = affectedAgents?.length
    ? t("disconnect.affected", { count: affectedAgents.length })
    : "";
  const description = [
    t(keys.body, { name: app?.name ?? "" }),
    account,
    affected,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ConfirmDialog
      open={app !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t(keys.title, { name: app?.name ?? "" })}
      description={description}
      confirmLabel={t(keys.action)}
      cancelLabel={t("connected.disconnect.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (connectionId) onConfirm(connectionId);
      }}
    />
  );
}
