import { canMoveAgentsOut, moveOutDestinations } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import type { TeamRef } from "../lib/share-via-team.ts";
import { useActiveOrgBilling } from "./queries/use-billing.ts";
import { usePersonalSpace } from "./use-personal-space.ts";

/**
 * Where the caller can move an AI Employee out of the team space they are
 * in, by the SDK's rule ({@link canMoveAgentsOut}, {@link moveOutDestinations}):
 * a locked org's way to empty itself, Personal included. `null` when the
 * caller cannot move agents out of this org, or is in the Personal space,
 * whose own move into a team is the share flow.
 */
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
