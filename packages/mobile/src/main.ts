import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { setNativeShell } from "../../web/src/shims/native-shell";
import { logAuthAvailability, nativeIdentity } from "./identity/native-config";
import { openExternalUrl } from "./open-url";
import { installEarlyPushTap, mobilePush } from "./push";
import { publishMobileSurface } from "./surface";
import { installSystemBars } from "./system-bars";
import {
  declareProvisionalReady,
  declareReadyWhenShellRenders,
} from "./updates/ready";
import { capgoReadyPorts } from "./updates/ready-ports";

publishMobileSurface(window, {
  platform: Capacitor.getPlatform(),
  deployEnvironment: __HOUSTON_MOBILE_DEPLOY_ENV__,
  controlPlaneUrl: __HOUSTON_MOBILE_CONTROL_PLANE_URL__,
});
setNativeShell({
  identity: nativeIdentity,
  push: mobilePush,
  openUrl: (url) =>
    openExternalUrl(url, window.location.href, {
      browser: (href) => Browser.open({ url: href }),
      system: (href) => window.location.assign(href),
    }),
});
logAuthAvailability();
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
let provisionalReady: Promise<void> = Promise.resolve();
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
  await provisionalReady;
  const ready = declareReadyWhenShellRenders(
    capgoReadyPorts((error) => {
      void reportBootError(error);
    }),
  );
  try {
    await earlyPushTapReady;
    const { installUpdates } = await import("./updates/boot");
    await installUpdates().catch(reportBootError);
    await import("../../web/src/main");
  } catch (error) {
    ready.fail(error);
    throw error;
  }
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
      provisionalReady = declareProvisionalReady(
        capgoReadyPorts((error) => {
          void reportBootError(error);
        }),
      ).catch(reportBootError);
      window.addEventListener("online", launch, { once: true });
      if (navigator.onLine) launch();
    })
    .catch(reportBootError);
}
