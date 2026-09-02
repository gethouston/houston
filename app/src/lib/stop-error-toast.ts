import { useUIStore } from "../stores/ui";
import { isEngineWakingError } from "./engine-waking-error";
import { logAndReportError } from "./error-report";
import i18n from "./i18n";
import { isNetworkTransportError } from "./network-transport-error";

/**
 * The ONE toast for a Stop that failed (`tauriChat.stop`). Shared by every
 * stop catch (agent board, Mission Control) so the quiet states branch in one
 * place.
 *
 * `call("stop_session")` already surfaces every failure before rethrowing: a
 * waking pod (the gateway's "engine unavailable" 503 / "engine proxy failed"
 * 502) and a connectivity drop each get their deduped informational toast
 * there, and a real bug is reported. The catch then used to add a SECOND, red
 * "Couldn't stop the task: <raw gateway body>" toast on top of the waking
 * notice: a user who pressed Stop while their pod was still cold-starting saw
 * "your agent is waking up" and a red box quoting a DNS dial error at once,
 * and read the pair as the conversation being broken. Those two states are
 * not something a Stop can fix (the held send lands once the pod answers), so
 * the red toast is skipped for them; everything else keeps the actionable
 * "couldn't stop" toast as its only user-visible surface (no-silent-failures
 * rule). The toast is authored copy only: the raw gateway body (a DNS dial
 * error naming a pod service) goes to the log and Sentry, never on screen.
 */
export function showStopFailedToast(err: unknown): void {
  if (isEngineWakingError(err) || isNetworkTransportError(err)) return;
  logAndReportError("stop_session", err);
  useUIStore.getState().addToast({
    title: i18n.t("chat:errors.stopSession"),
    variant: "error",
  });
}
