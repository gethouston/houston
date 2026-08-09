import { Tabs, TabsList, TabsTrigger } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { ComputeSection } from "../time-worked/compute-section";
import { showComputeSection } from "../time-worked/compute-usage-model";
import ActivityTab from "./activity-tab";
import type { OrgTabProps } from "./organization-view";
import UsageTab from "./usage-tab";

/** The three questions Analytics answers, in sub-tab order. */
type AnalyticsLens = "activity" | "usage" | "timeWorked";

const BASE_LENSES: readonly AnalyticsLens[] = ["activity", "usage"];

/**
 * Organization > Analytics: everything measured about the org, behind one tab.
 * Three LENSES as sub-tabs rather than stacked sections — Activity is a paged
 * "Show more" feed, so anything under it would be buried below an unbounded
 * list. Each lens is the existing surface verbatim, keeping its own data hook;
 * only the SELECTED lens renders, so an unopened lens starts no read.
 *
 * Time worked appears only where the deployment meters compute
 * (`capabilities.computeUsage`): omitting the sub-tab is what keeps
 * `ComputeSection`'s query from firing elsewhere, and it means the lens can
 * never open empty.
 */
export default function AnalyticsTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const [lens, setLens] = useState<AnalyticsLens>("activity");

  const lenses: readonly AnalyticsLens[] = showComputeSection(capabilities)
    ? [...BASE_LENSES, "timeWorked"]
    : BASE_LENSES;
  // Capabilities can resolve (or a space can change) under a selected lens; fall
  // back to the lead lens rather than render nothing.
  const active = lenses.includes(lens) ? lens : "activity";

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={active}
        onValueChange={(next) => setLens(next as AnalyticsLens)}
        className="self-start"
      >
        <TabsList>
          {lenses.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`org.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {active === "activity" && <ActivityTab ctx={ctx} />}
      {active === "usage" && <UsageTab ctx={ctx} />}
      {active === "timeWorked" && <ComputeSection />}
    </div>
  );
}
