import { useEffect } from "react";
import { nativeShell } from "../../../packages/web/src/shims/native-shell";
import { logAndReportError } from "../lib/error-report";
import i18n from "../lib/i18n";
import {
  isSessionNotificationEnabled,
  loadNotificationSettings,
  readOsPermissionGranted,
} from "../lib/notification-settings";
import { osIsNativeMobile } from "../lib/os-bridge/platform";
import { pushPayloadOrReport } from "../lib/push-payload";
import { tauriPush } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { navigateToNotificationTarget } from "./session-notification-navigate";
import { useCapabilities } from "./use-capabilities";

async function openTap(data: unknown): Promise<void> {
  const payload = pushPayloadOrReport(data, (error) =>
    logAndReportError("push_payload", error),
  );
  if (!payload) return;
  if (!useWorkspaceStore.getState().loaded) {
    await new Promise<void>((resolve) => {
      const unsubscribe = useWorkspaceStore.subscribe((state) => {
        if (state.loaded) {
          unsubscribe();
          resolve();
        }
      });
    });
  }
  const spaces = useWorkspaceStore.getState();
  const target =
    spaces.workspaces.find((ws) => ws.id === `org:${payload.org}`) ??
    spaces.workspaces.find((ws) => ws.id === "default");
  if (target && target.id !== spaces.current?.id) spaces.setCurrent(target);
  await new Promise<void>((resolve) => {
    const ready = () => {
      const agents = useAgentStore.getState();
      return (
        agents.loaded &&
        agents.loadedWorkspaceId === useWorkspaceStore.getState().current?.id
      );
    };
    if (ready()) {
      resolve();
      return;
    }
    const unsubscribe = useAgentStore.subscribe(() => {
      if (ready()) {
        unsubscribe();
        resolve();
      }
    });
  });
  await navigateToNotificationTarget({
    agentId: payload.agent,
    sessionKey: payload.conversation,
  });
}

export function useNativePush(signedIn: boolean): void {
  const { capabilities } = useCapabilities();
  useEffect(() => {
    if (
      !osIsNativeMobile() ||
      !signedIn ||
      capabilities?.profile !== "cloud" ||
      !capabilities.push
    )
      return;
    const push = nativeShell()?.push;
    if (!push?.available) return;
    let alive = true;
    const sync = async (token?: string) => {
      await loadNotificationSettings();
      if (!isSessionNotificationEnabled()) {
        await tauriPush.unregister(await tauriPush.deviceId());
        return;
      }
      if (!(await readOsPermissionGranted())) return;
      const input = {
        token: token ?? (await push.getToken()),
        platform:
          window.__HOUSTON_SURFACE__ === "ios"
            ? ("ios" as const)
            : ("android" as const),
        locale: i18n.language || "en",
        app_version:
          typeof __APP_VERSION__ === "undefined" ? "0.0.0" : __APP_VERSION__,
      };
      if (alive) await tauriPush.register(await tauriPush.deviceId(), input);
    };
    const report = (error: unknown) => logAndReportError("native_push", error);
    const run = () => {
      void sync().catch(report);
    };
    run();
    window.addEventListener("focus", run);
    window.addEventListener("push-resume", run);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("push-toggle", run);
    i18n.on("languageChanged", run);
    const tokenListener = push.onTokenRefresh((token) => {
      void sync(token).catch(report);
    });
    const tapListener = push.onNotificationTap((data) => {
      void openTap(data).catch(report);
    });
    return () => {
      alive = false;
      window.removeEventListener("focus", run);
      window.removeEventListener("push-resume", run);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("push-toggle", run);
      i18n.off("languageChanged", run);
      void tokenListener.then((remove) => remove()).catch(report);
      void tapListener.then((remove) => remove()).catch(report);
    };
  }, [signedIn, capabilities?.profile, capabilities?.push]);
}
