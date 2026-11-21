import type { UpdateOrigin } from "./update-policy";

export interface UpdateInfo {
  currentVersion: string;
  version: string;
  origin: UpdateOrigin;
}

export type UpdateErrorPhase = "download" | "install" | "relaunch";

export type InstallSource = "user" | "launch" | "return";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; info: UpdateInfo }
  | { state: "downloading"; info: UpdateInfo; progress: number | null }
  | { state: "downloaded"; info: UpdateInfo }
  | { state: "installing"; info: UpdateInfo }
  | { state: "error"; info: UpdateInfo; phase: UpdateErrorPhase };

export function updateCheckBlocked(status: UpdateStatus): boolean {
  return (
    status.state === "downloading" ||
    status.state === "downloaded" ||
    status.state === "installing"
  );
}
