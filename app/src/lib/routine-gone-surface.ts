import { isRoutineGone } from "@houston/sdk/routines/routine-gone";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useUIStore } from "../stores/ui";
import i18n from "./i18n";

export type RoutineGoneReport = (
  kind: "routine_gone",
  command: string,
  message: string,
  err: unknown,
) => void;

export function surfaceRoutineGone(
  command: string,
  message: string,
  err: unknown,
  report: RoutineGoneReport,
): true {
  console.warn(`[toast:${command}] ${message}`);
  report("routine_gone", command, message, err);
  useUIStore.getState().addToast({
    title: i18n.t("routines:toasts.goneTitle"),
    description: i18n.t("routines:toasts.goneBody"),
    variant: "info",
  });
  return true;
}

export function refetchIfRoutineGone(
  qc: Pick<QueryClient, "invalidateQueries">,
  queryKey: QueryKey,
  err: unknown,
): void {
  if (!isRoutineGone(err)) return;
  void qc.invalidateQueries({ queryKey });
}
