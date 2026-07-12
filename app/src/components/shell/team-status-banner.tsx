import { Button } from "@houston-ai/core";
import { AlertTriangle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBilling } from "../../hooks/queries/use-billing.ts";
import { useOrgs } from "../../hooks/queries/use-spaces.ts";
import { useCapabilities } from "../../hooks/use-capabilities.ts";
import { hasSpaces, orgRole } from "../../lib/org-roles.ts";
import { isTeamWorkspace, orgSlugFromWorkspaceId } from "../../lib/space-id.ts";
import { teamStatusView } from "../../lib/team-status-model.ts";
import { useUIStore } from "../../stores/ui.ts";
import { useWorkspaceStore } from "../../stores/workspaces.ts";
import { ORGANIZATION_VIEW_ID } from "../organization/id.ts";
import { useOrgNav } from "../organization/org-nav-store.ts";

/**
 * The C8 team-status strip, rendered once at the top of the workspace content
 * for the ACTIVE space. It shows nothing off a Spaces host, in a personal space,
 * or on a healthy team; in a team space it shows either the owner/admin trial
 * countdown pill or the expired-team degrade banner (everyone).
 *
 * Data comes from two reads that the space switch drops+refetches on entry (no
 * push on expiry, C8): `useBilling` (owner/admin billing detail) and `useOrgs`
 * (`OrgSummary.degraded`, the member-visible signal that carries no billing
 * detail). The decision itself is the pure {@link teamStatusView}. The trial
 * pill and the owner Upgrade action deep-link into the org dashboard Billing tab.
 */
export function TeamStatusBanner() {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const requestTab = useOrgNav((s) => s.requestTab);

  const spaces = hasSpaces(capabilities);
  const isTeam = current ? isTeamWorkspace(current.id) : false;
  const activeSlug = current ? orgSlugFromWorkspaceId(current.id) : null;

  const { data: billing } = useBilling();
  // `degraded` is the member-visible signal; owner/admin drive off billing, so
  // only fetch the list when it can actually matter (a team space, Spaces host).
  const { data: orgs } = useOrgs(spaces && isTeam);
  const degraded =
    orgs?.orgs.find((o) => o.slug === activeSlug)?.degraded ?? false;

  const view = teamStatusView({
    hasSpaces: spaces,
    isTeamSpace: isTeam,
    role: orgRole(capabilities),
    billing,
    degraded,
    now: new Date(),
  });

  if (view.kind === "none") return null;

  const openBilling = () => {
    requestTab("billing");
    setViewMode(ORGANIZATION_VIEW_ID);
  };

  if (view.kind === "trial") {
    return (
      <div className="shrink-0 px-4 pt-3">
        <button
          type="button"
          onClick={openBilling}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-chip-subtle/50 px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-chip-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Clock className="size-3.5" />
          {view.daysLeft !== null
            ? t("billing.trialPill", { count: view.daysLeft })
            : t("billing.status.trialing")}
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm"
    >
      <span className="flex items-center gap-2 text-ink">
        <AlertTriangle className="size-4 shrink-0 text-danger" />
        {view.isOwner ? t("degrade.owner") : t("degrade.member")}
      </span>
      {view.isOwner && (
        <Button size="sm" className="shrink-0" onClick={openBilling}>
          {t("degrade.upgrade")}
        </Button>
      )}
    </div>
  );
}
