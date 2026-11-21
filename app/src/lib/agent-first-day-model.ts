import type { Config } from "../data/config";

export function isFirstDayPending(config: Config | undefined): boolean {
  return config?.firstDay === "pending";
}
