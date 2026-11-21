import { reportError } from "./error-report";
import { osCurrentAppBundlePath, osRelaunchAppFromPath } from "./os-bridge";

export async function relaunchInstalledRelease(
  version: string,
  appPath: string | null,
): Promise<boolean> {
  try {
    await osRelaunchAppFromPath(appPath ?? (await osCurrentAppBundlePath()));
    return true;
  } catch (error) {
    console.error("[updater] relaunch failed", error);
    reportError("update_relaunch", `relaunch into ${version}`, error);
    return false;
  }
}
