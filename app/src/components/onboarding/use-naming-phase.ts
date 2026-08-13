import { useEffect, useState } from "react";
import { tutorialSelector } from "../tutorial";

/** Whether the create-agent dialog's naming phase is on screen (DOM-polled,
 *  same cadence as the spotlight's own measurer — the dialog's internal step
 *  is not in any store, and the anchor's presence IS the truth). */
export function useNamingPhase(active: boolean): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!active) {
      setPresent(false);
      return;
    }
    const check = () =>
      setPresent(
        document.querySelector(tutorialSelector("createAgentNaming")) !== null,
      );
    check();
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, [active]);
  return present;
}
