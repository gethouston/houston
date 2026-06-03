import { useUIStore } from "../stores/ui";
import { showErrorToast, raiseJavascriptSentrySmokeTest } from "./error-toast";
import i18n from "./i18n";
import { osTriggerNativeSentrySmokeTest } from "./os-bridge";
import { sentrySmokeActionForKey } from "./sentry-smoke-shortcut";

let installed = false;

export function installSentrySmokeShortcuts(): void {
  if (installed) return;
  installed = true;
  window.__HOUSTON_SENTRY_SMOKE__ = {
    javascript: triggerJavascriptSmokeTest,
    native: triggerNativeSmokeTest,
  };

  window.addEventListener("keydown", (event) => {
    const action = sentrySmokeActionForKey(event);
    if (action === "javascript") {
      event.preventDefault();
      triggerJavascriptSmokeTest();
    } else if (action === "native") {
      event.preventDefault();
      void triggerNativeSmokeTest();
    }
  });
}

function triggerJavascriptSmokeTest(): void {
  try {
    raiseJavascriptSentrySmokeTest();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showErrorToast("sentry_js_stack_smoke", message, error);
  }
}

function triggerNativeSmokeTest(): Promise<void> {
  return osTriggerNativeSentrySmokeTest().then(() => {
    useUIStore.getState().addToast({
      title: i18n.t("shell:sentrySmoke.nativeTriggeredTitle"),
      description: i18n.t("shell:sentrySmoke.nativeTriggeredDescription"),
      variant: "success",
    });
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    showErrorToast("sentry_native_smoke_failed", message, error);
  });
}

declare global {
  interface Window {
    __HOUSTON_SENTRY_SMOKE__?: {
      javascript: () => void;
      native: () => Promise<void>;
    };
  }
}
