import { useEffect, useRef } from "react";
import { analytics } from "../../lib/analytics";
import { useIsActiveView } from "../shell/keep-alive-views";

export function useAcademyOpened(): void {
  const isActiveScreen = useIsActiveView();
  const reported = useRef(false);

  useEffect(() => {
    if (!isActiveScreen || reported.current) return;
    reported.current = true;
    analytics.track("academy_opened");
  }, [isActiveScreen]);
}
