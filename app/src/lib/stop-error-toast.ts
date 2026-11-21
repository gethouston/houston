import { useUIStore } from "../stores/ui";
import { isEngineWakingError } from "./engine-waking-error";
import { logAndReportError } from "./error-report";
import i18n from "./i18n";
import { isNetworkTransportError } from "./network-transport-error";

export function showStopFailedToast(err: unknown): void {
  if (isEngineWakingError(err) || isNetworkTransportError(err)) return;
  logAndReportError("stop_session", err);
  useUIStore.getState().addToast({
    title: i18n.t("chat:errors.stopSession"),
    variant: "error",
  });
}
