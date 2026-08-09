import { Spinner } from "@houston-ai/core";
import { InstructionsContent } from "../agent/job-description-parts";
import { useContextSlot, useContextSlotLabels } from "../context/context-slots";
import type { OrgTabProps } from "./organization-view";

/**
 * Organization > Company context: the standing knowledge every agent in this
 * workspace starts a turn with. It is admin-owned org-wide copy, so it belongs
 * on the Admin dashboard next to People and Billing rather than on a screen of
 * its own; the per-user half of the same context lives with the user, not here.
 *
 * The wire is unchanged — `useContextSlot("workspace")` reads and writes the
 * same blob it always did. `ready` is false until the agent-backed read lands,
 * so the frame shows a spinner instead of an editor over nothing.
 *
 * Takes {@link OrgTabProps} for uniformity with every other section even though
 * it reads nothing off the shared context.
 */
export default function CompanyContextTab(_props: OrgTabProps) {
  const editor = useContextSlot("workspace");
  const labels = useContextSlotLabels("workspace");

  if (!editor.ready) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <InstructionsContent
      content={editor.content}
      onSave={editor.onSave}
      labels={labels}
    />
  );
}
