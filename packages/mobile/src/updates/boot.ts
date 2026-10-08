import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { logAndReportError } from "@houston/app/lib/error-report";
import { showNativeUpdateGate } from "./gate";
import { createUpdateManager } from "./manager";

export async function installUpdates(): Promise<void> {
  const reported = new Set<string>();
  const reportRollback = (version: string) => {
    if (reported.has(version)) return;
    reported.add(version);
    logAndReportError(
      "mobile_update_rollback",
      new Error(`Rolled back OTA bundle ${version}`),
    );
  };
  await CapacitorUpdater.addListener("updateFailed", ({ bundle }) =>
    reportRollback(bundle.version),
  );
  // Native persists the failed bundle when rollback precedes JS listener setup.
  const failed = await CapacitorUpdater.getFailedUpdate();
  if (failed) reportRollback(failed.bundle.version);
  const baseUrl = __HOUSTON_MOBILE_UPDATE_BASE_URL__;
  const publicKey = __HOUSTON_MOBILE_UPDATE_PUBKEY__;
  if (!baseUrl || !publicKey) return;
  const channel = __HOUSTON_MOBILE_DEPLOY_ENV__;
  if (channel === "development") {
    throw new Error(
      "OTA configuration requires production or preview deploy environment",
    );
  }
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey,
      channel,
      builtinVersion: __HOUSTON_MOBILE_BUNDLE_VERSION__,
    },
    {
      fetch: nativeManifestFetch,
      now: Date.now,
      isOnline: () => navigator.onLine,
      updater: CapacitorUpdater,
      nativeBuild: async () => (await App.getInfo()).build,
      onRequired: () =>
        showNativeUpdateGate(
          Capacitor.getPlatform() === "ios"
            ? __HOUSTON_MOBILE_STORE_URL_IOS__
            : __HOUSTON_MOBILE_STORE_URL_ANDROID__,
        ),
      report: (error) => logAndReportError("mobile_update", error),
    },
  );
  await App.addListener("appStateChange", ({ isActive }) => {
    if (isActive)
      void check().catch((error: unknown) =>
        logAndReportError("mobile_update", error),
      );
  });
  void check().catch((error: unknown) =>
    logAndReportError("mobile_update", error),
  );
}

// GCS path-style object URLs use its XML API, which needs bucket CORS for WebView
// fetch. CapacitorHttp uses native networking, so the pinned bucket needs no CORS.
async function nativeManifestFetch(url: RequestInfo | URL): Promise<Response> {
  const result = await CapacitorHttp.get({
    url: String(url),
    headers: { "Cache-Control": "no-store" },
    connectTimeout: 10000,
    readTimeout: 10000,
  });
  const body =
    typeof result.data === "string" ? result.data : JSON.stringify(result.data);
  return new Response(body, { status: result.status });
}
