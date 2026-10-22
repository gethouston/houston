import type { OrgsList } from "@houston/engine-adapter";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { createdOrg, useCreateTeam } from "../../hooks/queries/use-orgs";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import {
  createFailed,
  pickTeam,
  reconcileCreatedTeam,
  type ShareViaTeamState,
} from "../../lib/share-via-team";

/**
 * Create a team from the share pipeline's pick step and pick it. A free slot
 * already taken says so inline. `POST /v1/orgs` is NOT idempotent: a lost
 * response may still have created the team, so a failure reconciles against
 * a fresh list before the person retries.
 */
export function useShareCreateTeam(
  setState: Dispatch<SetStateAction<ShareViaTeamState>>,
  refetchOrgs: () => Promise<{ data?: OrgsList }>,
) {
  const { t } = useTranslation("teams");
  const createTeam = useCreateTeam();
  const run = async (name: string) => {
    try {
      const created = createdOrg(await createTeam.mutateAsync({ name }));
      if (!created) {
        const key = canPurchaseInApp()
          ? "createTeam.freeTakenInline"
          : "native.freeTakenInline";
        setState((s) => createFailed(s, t(key)));
        return;
      }
      setState(pickTeam({ slug: created.slug, name: created.name }));
    } catch {
      const res = await refetchOrgs();
      const reconciled = reconcileCreatedTeam(res.data?.orgs ?? [], name);
      setState((s) =>
        reconciled
          ? pickTeam(reconciled)
          : createFailed(s, t("shareViaTeam.pick.failed")),
      );
    }
  };
  return { run, pending: createTeam.isPending };
}
