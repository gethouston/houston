import type { ComponentProps } from "react";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";

type McToolbarProps = Omit<
  ComponentProps<typeof MissionControlToolbar>,
  "variant"
>;

/**
 * The board's toolbar in the page header. One row or two is the STRIP's call,
 * not the board's: it is the only thing that knows how much room the three
 * zones actually have.
 */
export function McToolbarSlot(props: McToolbarProps) {
  return (
    <PageHeaderTools>
      {(oneRow) => (
        <MissionControlToolbar variant={oneRow ? "strip" : "row"} {...props} />
      )}
    </PageHeaderTools>
  );
}
