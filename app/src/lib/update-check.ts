import { check } from "@tauri-apps/plugin-updater";
import { analytics } from "./analytics";
import type { CheckOrigin, UpdateCheckOutcome } from "./update-policy";
import type { UpdateInfo, UpdateStatus } from "./update-status";

export type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

export type CheckResult = { outcome: UpdateCheckOutcome; message?: string };

export type FoundUpdate = { update: AvailableUpdate; info: UpdateInfo };

export async function runUpdateCheck(
  origin: CheckOrigin,
  previous: UpdateStatus,
): Promise<{ result: CheckResult; found: FoundUpdate | null }> {
  try {
    const update = await check();
    if (!update) return { result: { outcome: "none" }, found: null };
    const info: UpdateInfo = {
      currentVersion: update.currentVersion,
      version: update.version,
      origin,
    };
    if (previous.state === "idle" || previous.info.version !== info.version) {
      analytics.track("update_offered", {
        from_version: info.currentVersion,
        to_version: info.version,
      });
    }
    return { result: { outcome: "found" }, found: { update, info } };
  } catch (error) {
    console.warn("[updater] check failed", error);
    return {
      result: {
        outcome: "failed",
        message: error instanceof Error ? error.message : String(error),
      },
      found: null,
    };
  }
}
