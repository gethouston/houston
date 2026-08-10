import { ComputeSection } from "../time-worked/compute-section";
import ActivityTab from "./activity-tab";
import type { AnalyticsLens } from "./org-view-model";
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
 * into `AdminAnalyticsHeader`, whose lozenges are the lens tabs. The view
 * owns the lens state and threads the RESOLVED lens to both, so the mounted
 * body can never disagree with the lozenge painted active.
 */
export default function AnalyticsTab({
  ctx,
  lens,
}: OrgTabProps & { lens: AnalyticsLens }) {
  return (
    <div className="flex flex-col gap-4">
      {lens === "activity" && <ActivityTab ctx={ctx} />}
      {lens === "usage" && <UsageTab ctx={ctx} />}
      {lens === "timeWorked" && <ComputeSection />}
    </div>
  );
}
