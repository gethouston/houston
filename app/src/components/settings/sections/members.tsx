import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useSession } from "../../../hooks/use-session";
import { canManageMembers, isMultiplayer } from "../../../lib/org-roles";
import { AddMemberForm } from "./members-add-form";
import { MemberRoster } from "./members-roster";

/**
 * The org Members surface. Owner can add / re-role / remove; admin sees the
 * roster read-only (the mutating controls are hidden, and the gateway enforces
 * the same for real). Gated at the nav level on `canSeeMembers`, so this only
 * mounts for owner/admin in a multiplayer deployment.
 */
export function MembersSection() {
  const { t } = useTranslation("org");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const org = useOrg(isMultiplayer(capabilities));

  const canManage = canManageMembers(capabilities);
  const selfId = session?.uid ?? null;
  const members = org.data?.members ?? [];

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("members.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("members.description")}
      </p>

      {!canManage && (
        <p className="text-xs text-muted-foreground mb-4">
          {t("members.adminNotice")}
        </p>
      )}

      {canManage && <AddMemberForm />}

      {org.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("members.roster.empty")}
        </p>
      ) : (
        <MemberRoster members={members} selfId={selfId} canManage={canManage} />
      )}
    </section>
  );
}
