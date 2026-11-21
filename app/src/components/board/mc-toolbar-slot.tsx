import type { ComponentProps } from "react";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";

type McToolbarProps = Omit<
  ComponentProps<typeof MissionControlToolbar>,
  "variant"
>;

export function McToolbarSlot(props: McToolbarProps) {
  return (
    <PageHeaderTools>
      {(oneRow) => (
        <MissionControlToolbar variant={oneRow ? "strip" : "row"} {...props} />
      )}
    </PageHeaderTools>
  );
}
