import { useEffect, useRef } from "react";
import { analytics } from "../../lib/analytics";
import { useIsActiveView } from "../shell/keep-alive-views";

/**
 * Report that the Academy was opened, ONCE per mounted screen.
 *
 * Top-level screens are kept alive, so the mount says nothing about when the
 * user arrived and a plain mount effect would miss every visit after the first.
 * The active-view flag is the arrival, and the ref keeps a re-activation from
 * counting a second time within the same session on screen.
 */
export function useAcademyOpened(): void {
  const isActiveScreen = useIsActiveView();
  const reported = useRef(false);

  useEffect(() => {
    if (!isActiveScreen || reported.current) return;
    reported.current = true;
    analytics.track("academy_opened");
  }, [isActiveScreen]);
}
