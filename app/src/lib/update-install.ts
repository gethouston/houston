import { analytics } from "./analytics";
import { reportError } from "./error-report";
import { osCurrentAppBundlePath, osInstallUpdate } from "./os-bridge";
import type { ReturnHold } from "./update-return";
import type { InstallSource, UpdateInfo } from "./update-status";

export type InstallOutcome =
  | { outcome: "installed"; appPath: string }
  | { outcome: "held" }
  | { outcome: "failed" };

export async function installStagedRelease(args: {
  rid: number;
  bytesRid: number;
  info: UpdateInfo;
  source: InstallSource;
  lastLook: ReturnHold;
}): Promise<InstallOutcome> {
  const { rid, bytesRid, info, source, lastLook } = args;
  try {
    const appPath = await osCurrentAppBundlePath();
    const reason = lastLook();
    if (reason !== null) {
      analytics.track("update_return_held", { reason });
      return { outcome: "held" };
    }
    analytics.track("update_accepted", {
      from_version: info.currentVersion,
      to_version: info.version,
      source,
    });
    await osInstallUpdate(rid, bytesRid);
    return { outcome: "installed", appPath };
  } catch (error) {
    console.error("[updater] install failed", error);
    reportError("update_install", `install of ${info.version}`, error);
    return { outcome: "failed" };
  }
}
