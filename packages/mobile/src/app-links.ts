import { App } from "@capacitor/app";
import { logAndReportError } from "@houston/app/lib/error-report";
import { useUIStore } from "@houston/app/stores/ui";
import { useWorkspaceStore } from "@houston/app/stores/workspaces";
import { type AppLinkTarget, appLinkTarget } from "./app-link-target";

export async function installAppLinks(): Promise<void> {
  let pending: AppLinkTarget | null = null;
  const apply = (target: AppLinkTarget) => {
    if (!useWorkspaceStore.getState().current) {
      pending = target;
      return;
    }
    if (target === "home")
      useUIStore.getState().openAgentsHome(null, { nav: "reset" });
    else useUIStore.getState().openSettings("plan");
  };
  useWorkspaceStore.subscribe((state) => {
    if (state.current && pending) {
      const target = pending;
      pending = null;
      apply(target);
    }
  });
  await App.addListener("appUrlOpen", ({ url }) => {
    const target = appLinkTarget(url);
    if (target) apply(target);
  });
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      const target = appLinkTarget(launch.url);
      if (target) apply(target);
    }
  } catch (error) {
    logAndReportError("mobile_initial_app_link", error);
  }
}
