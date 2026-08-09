import { type ReactNode, useId } from "react";
import { sidebarBandInset } from "./sidebar-geometry";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarBandProps {
  /** The band's words. */
  label: string;
  /**
   * Whether the run is folded away. CONTROLLED, because the host persists it —
   * a rail that forgets it was folded on every reload is worse than one that
   * never folded.
   */
  collapsed?: boolean;
  /** Absent means the band is a plain label: no triangle, no click, no fold. */
  onToggleCollapsed?: () => void;
  /**
   * One trailing control, opposite the label, in the row's affordance slot: the
   * "+" that creates. A SIBLING of the band button, never a child, because a
   * button may not nest inside a button.
   */
  affordance?: ReactNode;
  /** The run this band names. Rendered flush under it, dropped when folded. */
  children: ReactNode;
  /** Extra classes on the CONTENT region (e.g. the scroll box's own sizing). */
  contentClassName?: string;
}

/**
 * A named, foldable run of rail rows — and the ONE way the rail draws one.
 *
 * Called a BAND, not a "section", because `SidebarSection` already names the
 * resolved DATA of one team block in this package. Band is the word the rail, the design
 * inventory and the knowledge base already use for this object.
 *
 * The rail has three: "My accounts" and "Workspace" over the top-level
 * destinations, and "Your teams" over the team blocks. They are one component
 * wearing different props, not three lookalikes: a rail whose bands differed in
 * type step, triangle placement, fold behaviour or the gap under the heading
 * would be teaching three rules for one row shape, and that is exactly how the
 * three drifted apart before this existed.
 *
 * What it owns, end to end:
 *
 * - **The band**, as the SAME `SidebarRowButton` as everything below it, in the
 *   `band` type step: 12px against the rows' 13px, none of a block head's
 *   weight, same resting ink. **Size, not weight or greyness, distinguishes
 *   it**: a band painted greyer than the rows under it reads as disabled, so it
 *   takes the same resting label colour and is set apart by the type step
 *   alone. That is what makes it a heading bolted above a list rather than the
 *   first line of one.
 * - **The disclosure**, immediately after the words, so the label reads as a
 *   phrase you click rather than as a caption with a control parked beside it.
 *   The whole label IS the toggle.
 * - **The aria wiring.** `aria-expanded` and `aria-controls` point at the
 *   content region, whose id is minted here so a caller can neither forget it
 *   nor collide with another band's.
 * - **The rhythm.** The content sits FLUSH under the band (the heading's own
 *   `pb-0.5` is the entire gap), so a band and its rows read as one object.
 * - **The left edge.** The heading is inset by {@link sidebarBandInset} and by
 *   nothing else, and this is the ONLY thing in the rail that insets a band
 *   heading. A caller that wrapped it in its own horizontal padding would push
 *   that band's label off the column the other two sit on, which is exactly the
 *   8px drift the shared export exists to make unrepeatable.
 *
 * The content region stays mounted while folded and only loses its rows, so
 * `aria-controls` always resolves to something real.
 *
 * i18n-agnostic and store-free per the `ui/` boundary: the label arrives
 * translated and the fold arrives resolved. Persisting it is the host's job.
 */
export function SidebarBand({
  label,
  collapsed = false,
  onToggleCollapsed,
  affordance,
  children,
  contentClassName,
}: SidebarBandProps) {
  const contentId = useId();
  const foldable = onToggleCollapsed !== undefined;
  return (
    <>
      <div className={`${sidebarBandInset} pt-2 pb-0.5`}>
        <SidebarRowButton
          label={label}
          depth="block"
          band
          onActivate={onToggleCollapsed}
          disclosure={
            foldable ? { expanded: !collapsed, contentId } : undefined
          }
          affordance={affordance}
        />
      </div>
      <div className={contentClassName} id={contentId}>
        {foldable && collapsed ? null : children}
      </div>
    </>
  );
}
