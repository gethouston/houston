import type { ComponentProps } from "react";
import { OrgChartShareDialog } from "./org-chart-share-dialog";
import type { OrgTree } from "./org-chart-tree";
import { OrgChartTreeView } from "./org-chart-tree-view";
import { useOrgChartShare } from "./use-org-chart-share";

export function OrgChartTreeShare({
  shareTree,
  ...props
}: Omit<ComponentProps<typeof OrgChartTreeView>, "onShare"> & {
  shareTree: OrgTree;
}) {
  const share = useOrgChartShare(shareTree);
  return (
    <>
      <OrgChartTreeView {...props} onShare={() => share.setOpen(true)} />
      <OrgChartShareDialog share={share} />
    </>
  );
}
