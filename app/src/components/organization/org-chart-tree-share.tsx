import type { ComponentProps } from "react";
import { OrgChartShareDialog } from "./org-chart-share-dialog";
import type { OrgTree } from "./org-chart-tree";
import { OrgChartTreeView } from "./org-chart-tree-view";
import { useOrgChartShare } from "./use-org-chart-share";

/**
 * The on-screen chart with its Share pill and the share dialog it opens.
 * The share image starts drawing when this mounts, so only a chart that is
 * on screen draws one, and the dialog opens on a finished image.
 */
export function OrgChartTreeShare({
  shareTree,
  ...props
}: Omit<ComponentProps<typeof OrgChartTreeView>, "onShare"> & {
  /** The same chart under the share image's caps. */
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
