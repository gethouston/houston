import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { logAndReportError } from "../lib/error-report";
import { osIsTauri } from "../lib/os-bridge";
import { isMac } from "../lib/platform";
import { watchFullscreen } from "../lib/window-fullscreen";

/** Native fullscreen hides macOS traffic lights and releases their rail space. */
export function useWindowControlsInset(): boolean {
  const eligible = osIsTauri() && isMac;
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    return watchFullscreen(
      getCurrentWindow(),
      setFullscreen,
      logAndReportError,
    );
  }, [eligible]);

  return eligible && !fullscreen;
}
