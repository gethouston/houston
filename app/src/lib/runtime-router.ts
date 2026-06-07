import type { Agent } from "./types";

/** Local-only integration branch: no cloud agents. */
export function isCloudAgent(_agent: Agent): boolean {
  return false;
}
