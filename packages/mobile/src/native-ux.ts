import { App } from "@capacitor/app";
import { logAndReportError } from "@houston/app/lib/error-report";
import { useUIStore } from "@houston/app/stores/ui";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { applyNativeAppState } from "./app-state";
import { handleHardwareBack } from "./back-button";

export async function installNativeUx(): Promise<void> {
  await App.addListener("backButton", () => {
    void handleHardwareBack({
      state: () => useUIStore.getState(),
      back: () => useUIStore.getState().navBack(),
      minimize: () => App.minimizeApp(),
    }).catch((error: unknown) => logAndReportError("mobile_back", error));
  });
  await App.addListener("appStateChange", ({ isActive }) => {
    applyNativeAppState(isActive, navigator.onLine, {
      online: (online) => onlineManager.setOnline(online),
      focused: (focused) => focusManager.setFocused(focused),
    });
    if (isActive) window.dispatchEvent(new Event("push-resume"));
  });
}
