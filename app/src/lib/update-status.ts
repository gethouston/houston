import type { UpdateOrigin } from "./update-policy";

export interface UpdateInfo {
  currentVersion: string;
  version: string;
  /** Which check found it: the launch check, or a mid-session re-check. The
   *  policy layer picks the presentation from this, so it rides on every
   *  state after `available`. */
  origin: UpdateOrigin;
}

export type UpdateErrorPhase = "download" | "install" | "relaunch";

/** What set the install off: the user's own click, or the silent
 *  launch-time install. */
export type InstallSource = "user" | "launch";

/** The updater's states: check → available → downloading → downloaded →
 *  installing → relaunch, or error at any step after `available`. */
export type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; info: UpdateInfo }
  | { state: "downloading"; info: UpdateInfo; progress: number | null }
  /** In the updater's buffer, waiting for a restart. */
  | { state: "downloaded"; info: UpdateInfo }
  | { state: "installing"; info: UpdateInfo }
  | { state: "error"; info: UpdateInfo; phase: UpdateErrorPhase };

/** A re-check must not run while a download or install is in flight, nor
 *  while a release already waits for its restart. */
export function updateCheckBlocked(status: UpdateStatus): boolean {
  return (
    status.state === "downloading" ||
    status.state === "downloaded" ||
    status.state === "installing"
  );
}
