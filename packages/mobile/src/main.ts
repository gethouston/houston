import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { setNativeShell } from "../../web/src/shims/native-shell";
import { installEarlyPushTap, mobilePush } from "./push";
import { publishMobileSurface } from "./surface";
import { installSystemBars } from "./system-bars";
import { notifyMobileReadyAfterRender } from "./updates/ready";

// These globals precede every shared-app module, including analytics bootstrap.
publishMobileSurface(window, {
  platform: Capacitor.getPlatform(),
  deployEnvironment: __HOUSTON_MOBILE_DEPLOY_ENV__,
  controlPlaneUrl: __HOUSTON_MOBILE_CONTROL_PLANE_URL__,
});
setNativeShell({
  push: mobilePush,
  async openUrl(url) {
    await Browser.open({ url: new URL(url, window.location.href).href });
    return true;
  },
});
const earlyPushTapReady = installEarlyPushTap().catch((error: unknown) =>
  reportBootError(error),
);
if (!__HOUSTON_MOBILE_UPDATE_BASE_URL__ || !__HOUSTON_MOBILE_UPDATE_PUBKEY__) {
  console.warn(
    "[mobile/updates] OTA OFF: set HOUSTON_MOBILE_UPDATE_BASE_URL and HOUSTON_MOBILE_UPDATE_PUBKEY in the mobile build.",
  );
}
if (!mobilePush.available) {
  console.warn(
    "[mobile/push] Firebase native config absent; remote push unavailable. Add GoogleService-Info.plist and google-services.json.",
  );
}

let starting = false;
let clearOffline: (() => void) | null = null;
async function reportBootError(error: unknown): Promise<void> {
  const { logAndReportError } = await import("@houston/app/lib/error-report");
  logAndReportError("mobile_boot", error);
}
installSystemBars((error) => {
  void reportBootError(error);
});

async function start(): Promise<void> {
  if (starting || !navigator.onLine) return;
  starting = true;
  clearOffline?.();
  clearOffline = null;
  await earlyPushTapReady;
  const { installUpdates } = await import("./updates/boot");
  await installUpdates().catch(reportBootError);
  await import("../../web/src/main");
  notifyMobileReadyAfterRender((error) => {
    void reportBootError(error);
  });
  const { installNativeUx } = await import("./native-ux");
  void installNativeUx().catch((error: unknown) => reportBootError(error));
}

function launch(): void {
  void start().catch(reportBootError);
}

if (navigator.onLine) {
  launch();
} else {
  void import("./offline")
    .then(({ showOffline }) => {
      clearOffline = showOffline(launch);
      // The offline first frame proves this local bundle booted; waiting for a
      // network-backed sign-in here would falsely roll back a healthy OTA.
      notifyMobileReadyAfterRender((error) => {
        void reportBootError(error);
      });
      window.addEventListener("online", launch, { once: true });
      if (navigator.onLine) launch();
    })
    .catch(reportBootError);
}
