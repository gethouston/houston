import { useEffect, useState } from "react";
import { type TutorialTarget, tutorialSelector } from "../tutorial";

/** The create-agent dialog's screens, in the order they are reached. The LAST
 *  one present is the one on screen: an anchor only exists while its screen is
 *  mounted. */
const DIALOG_ANCHORS = [
  "createAgentBrief",
  "createAgentNaming",
] as const satisfies readonly TutorialTarget[];

type CreateAgentDialogAnchor = (typeof DIALOG_ANCHORS)[number];

/**
 * Which screen of the create-agent dialog is on show (DOM-polled, same cadence
 * as the spotlight's own measurer — the dialog's internal step is not in any
 * store, and the anchor's presence IS the truth). While the dialog is closed
 * the first screen stands in, so the spotlight has a target to open on the
 * moment it appears.
 */
export function useCreateAgentDialogAnchor(
  active: boolean,
): CreateAgentDialogAnchor {
  const [anchor, setAnchor] = useState<CreateAgentDialogAnchor>(
    DIALOG_ANCHORS[0],
  );
  useEffect(() => {
    if (!active) {
      setAnchor(DIALOG_ANCHORS[0]);
      return;
    }
    const check = () =>
      setAnchor(
        DIALOG_ANCHORS.findLast(
          (target) => document.querySelector(tutorialSelector(target)) !== null,
        ) ?? DIALOG_ANCHORS[0],
      );
    check();
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, [active]);
  return anchor;
}
