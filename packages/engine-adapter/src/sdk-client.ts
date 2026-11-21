import {
  createFanOutGate,
  type FanOutGate,
  HoustonSdk,
  type KeyValueStore,
  type SdkLogger,
  type WorkspacePreferenceReporter,
  WorkspacePreferenceUnavailable,
  type WorkspaceSelectionState,
} from "@houston/sdk";
import { createDevicePrefsStore } from "./client/device-prefs";
import { toHoustonEngineError } from "./client/sdk-error";
import { transientRetryFetch } from "./control-plane";
import { jwtSub } from "./conversation-cache-identity";
import { sharedPageLifecycle } from "./page-lifecycle";

const SDK_STORAGE_PREFIX = "houston.sdk.";

function createWebStorage(): KeyValueStore {
  const memory = new Map<string, string>();
  const hasLocal = (() => {
    try {
      return typeof localStorage !== "undefined";
    } catch {
      return false;
    }
  })();
  const key = (k: string) => `${SDK_STORAGE_PREFIX}${k}`;
  return {
    async get(k) {
      if (!hasLocal) return memory.get(k) ?? null;
      try {
        return localStorage.getItem(key(k));
      } catch {
        return memory.get(k) ?? null;
      }
    },
    async set(k, value) {
      memory.set(k, value);
      if (!hasLocal) return;
      try {
        localStorage.setItem(key(k), value);
      } catch {}
    },
    async delete(k) {
      memory.delete(k);
      if (!hasLocal) return;
      try {
        localStorage.removeItem(key(k));
      } catch {}
    },
  };
}

const webLogger: SdkLogger = {
  debug: (msg, fields) => console.debug(`[engine-adapter/sdk] ${msg}`, fields),
  info: (msg, fields) => console.info(`[engine-adapter/sdk] ${msg}`, fields),
  warn: (msg, fields) => console.warn(`[engine-adapter/sdk] ${msg}`, fields),
  error: (msg, fields) => console.error(`[engine-adapter/sdk] ${msg}`, fields),
};

export interface EngineSdkOptions {
  baseUrl: string;
  fetch: typeof fetch;
  liveToken?: () => string;
  workspaceSelection?: WorkspaceSelectionState;
  reportPreferenceError?: WorkspacePreferenceReporter;
}

export function createEngineSdk(opts: EngineSdkOptions): HoustonSdk {
  return new HoustonSdk({
    baseUrl: opts.baseUrl.replace(/\/+$/, ""),
    reactivity: false,
    ports: {
      fetch: transientRetryFetch(opts.fetch),
      rawFetch: (input, init) => globalThis.fetch(input, init),
      random: Math.random,
      workspaceSelection: opts.workspaceSelection,
      reportPreferenceError: opts.reportPreferenceError
        ? (operation, error) =>
            opts.reportPreferenceError?.(
              operation,
              toHoustonEngineError(
                error instanceof WorkspacePreferenceUnavailable
                  ? error.cause
                  : error,
                "/v1/preferences/last_workspace_id",
              ),
            )
        : undefined,
      userId: opts.liveToken
        ? () => jwtSub(opts.liveToken?.() ?? "")
        : undefined,
      storage: createWebStorage(),
      devicePreferences: createDevicePrefsStore(),
      clock: {
        now: () => Date.now(),
        monotonic: () => performance.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
        clearTimeout: (id) => clearTimeout(id),
      },
      logger: webLogger,
      pageLifecycle: sharedPageLifecycle(),
      fanOut: sharedFanOutGate(),
    },
  });
}

let fanOutGate: FanOutGate | undefined;

export function sharedFanOutGate(): FanOutGate {
  fanOutGate ??= createFanOutGate();
  return fanOutGate;
}
