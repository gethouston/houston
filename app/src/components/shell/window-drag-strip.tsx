import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";

/** Overlay title bars need a drag target on full-window gate surfaces. */
export function WindowDragStrip() {
  if (!osIsTauri() || !isMac) return null;
  return (
    <div
      data-tauri-drag-region
      className="absolute inset-x-0 top-0 z-20 h-10"
    />
  );
}
