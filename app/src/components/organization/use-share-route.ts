import { isTauri } from "@tauri-apps/api/core";
import { useCapabilities } from "../../hooks/use-capabilities";
import { osIsNativeMobile } from "../../lib/os-bridge/platform";
import { coarsePointer, shareSheet } from "./org-chart-share-browser";
import { type ShareRoute, shareRoute } from "./org-chart-share-run";

/** Where Share on LinkedIn goes on this device, for the drawn `image`. */
export function useShareRoute(image: File | null): ShareRoute {
  const { capabilities } = useCapabilities();
  return shareRoute({
    tauri: isTauri(),
    nativeMobile: osIsNativeMobile(),
    coarse: coarsePointer(),
    sheet: shareSheet(),
    image,
    linkedin: capabilities?.linkedinShare === true,
  });
}
