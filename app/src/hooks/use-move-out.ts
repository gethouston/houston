import { canMoveAgentsOut, moveOutDestinations } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import type { TeamRef } from "../lib/share-via-team.ts";
import { useActiveOrgBilling } from "./queries/use-billing.ts";
import { usePersonalSpace } from "./use-personal-space.ts";

export function useMoveOutDestinations(): TeamRef[] | null {
  const { t } = useTranslation("teams");
  const personalSpace = usePersonalSpace();
  const { org, orgs } = useActiveOrgBilling();
  if (personalSpace || !org || !canMoveAgentsOut(org)) return null;
  return moveOutDestinations(orgs, org.slug).map((destination) => ({
    slug: destination.slug,
    name: destination.personal ? t("moveOut.personal") : destination.name,
    personal: destination.personal,
  }));
}
