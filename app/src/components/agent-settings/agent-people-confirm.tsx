import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * What the People section is asking the manager to confirm before it replaces
 * the agent's assignee set.
 *
 * - `selfLockout` — switching to "Everyone on your team" while the VIEWER holds
 *   a non-owner Manager grant: the empty sentinel cannot carry it, so they
 *   demote themselves and lose this page. Same act, same destructive warning as
 *   the per-person control's self-lockout gate.
 * - `everyone` — switching to "Everyone on your team" changes somebody ELSE's
 *   resolved access. Informational, so it is NOT destructive.
 * - `specific` — switching to "Only specific people" materializes today's
 *   roster. Nobody loses access, but the write is a snapshot: it says how many
 *   people it is freezing and that future teammates are no longer included.
 */
export type PeopleConfirmKind = "selfLockout" | "everyone" | "specific";

/**
 * The confirm in front of every team-wide access change. One dialog, three
 * voices, so the destructive variant is spent only on the one outcome the
 * manager cannot undo alone.
 */
export function AgentPeopleConfirm({
  kind,
  count,
  onCancel,
  onConfirm,
}: {
  /** The pending question, or null when nothing is being confirmed. */
  kind: PeopleConfirmKind | null;
  /** People the "Only specific people" write would freeze into the roster. */
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("teams");
  const copy =
    kind === "selfLockout"
      ? {
          title: t("share.selfLockout.title"),
          description: t("share.selfLockout.description"),
          confirmLabel: t("share.selfLockout.confirm"),
          cancelLabel: t("share.selfLockout.cancel"),
          variant: "destructive" as const,
        }
      : kind === "specific"
        ? {
            title: t("agentSettings.people.confirmSpecific.title"),
            description: t("agentSettings.people.confirmSpecific.description", {
              count,
            }),
            confirmLabel: t("agentSettings.people.confirmSpecific.confirm"),
            cancelLabel: t("agentSettings.people.confirmSpecific.cancel"),
            variant: "default" as const,
          }
        : {
            title: t("agentSettings.people.confirmEveryone.title"),
            description: t("agentSettings.people.confirmEveryone.description"),
            confirmLabel: t("agentSettings.people.confirmEveryone.confirm"),
            cancelLabel: t("agentSettings.people.confirmEveryone.cancel"),
            variant: "default" as const,
          };

  return (
    <ConfirmDialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      cancelLabel={copy.cancelLabel}
      variant={copy.variant}
      onConfirm={onConfirm}
    />
  );
}
