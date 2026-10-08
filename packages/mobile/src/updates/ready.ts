import { CapacitorUpdater } from "@capgo/capacitor-updater";

let ready = false;
export function notifyMobileReadyAfterRender(
  report: (error: unknown) => void,
): void {
  if (ready) return;
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing mobile root");
  const notify = () => {
    if (
      ready ||
      !root.hasChildNodes() ||
      root.querySelector("[data-houston-boot-crashed]")
    )
      return;
    ready = true;
    observer.disconnect();
    void CapacitorUpdater.notifyAppReady().catch(report);
  };
  const observer = new MutationObserver(notify);
  observer.observe(root, { childList: true, subtree: true });
  notify();
}
