import { useCapabilities } from "../../hooks/use-capabilities";
import { ComputeSection } from "../time-worked/compute-section";
import ActivityTab from "./activity-tab";
import { useAnalyticsLens } from "./analytics-lens-store";
import { analyticsLenses, resolveAnalyticsLens } from "./org-view-model";
import type { OrgTabProps } from "./organization-view";
import UsageTab from "./usage-tab";

/**
 * Organization > Analytics: everything measured about the org, behind one
 * section. Three LENSES rather than stacked sections — Activity is a paged
 * "Show more" feed, so anything under it would be buried below an unbounded
 * list. Each lens is the existing surface verbatim, keeping its own data hook;
 * only the SELECTED lens renders, so an unopened lens starts no read.
 *
 * The lens NAVIGATION is not here: opening Analytics drills the Admin header
 * into `AdminAnalyticsHeader`, whose lozenges are the lens tabs. Both read the
 * shared `useAnalyticsLens` store, and both resolve the visible lens through
 * the same pure pair (`analyticsLenses` + `resolveAnalyticsLens`), so the
 * mounted body can never disagree with the lozenge painted active.
 */
export default function AnalyticsTab({ ctx }: OrgTabProps) {
  const { capabilities } = useCapabilities();
  const lens = useAnalyticsLens((s) => s.lens);
  const active = resolveAnalyticsLens(lens, analyticsLenses(capabilities));

  return (
    <div className="flex flex-col gap-4">
      {active === "activity" && <ActivityTab ctx={ctx} />}
      {active === "usage" && <UsageTab ctx={ctx} />}
      {active === "timeWorked" && <ComputeSection />}
    </div>
  );
}
