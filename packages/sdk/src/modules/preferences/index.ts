/**
 * The preferences module — per-user key/value preferences plus the
 * workspace-locale override (the desktop's boot + language-settings path).
 *
 * These are pure commands: they read/write the gateway's user-scoped routes and
 * return the value; there is no reactive scope to publish (a preference read is
 * on-demand, and the locale write is a one-shot the surface acts on). The same
 * handlers back both the typed facade and the bridge `dispatch` path.
 *
 * SEAM — user-scoped, NOT per-agent. Preferences are keyed by the caller's
 * session `sub`, so this module talks to the flat {@link PreferencesClient}
 * (rooted at the base URL), never `clientFor(agentId)`. A 401 routes through the
 * shared {@link ModuleContext.authExpiry} notifier.
 */

import {
  EngineError,
  PreferencesClient,
  type Workspace,
} from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";

/** The write vocabulary — the same constants back the facade and the bridge. */
export const PreferencesCommand = {
  Get: "preferences/get",
  Set: "preferences/set",
  SetLocale: "workspace/setLocale",
} as const;

export type PreferencesCommandType =
  (typeof PreferencesCommand)[keyof typeof PreferencesCommand];

/** The typed facade for preference reads/writes + the workspace locale. */
export interface PreferencesModule {
  /** Read a preference value, or `null` when unset. */
  get(key: string): Promise<string | null>;
  /** Write (or, with `null`, clear) a preference; echoes the stored value. */
  set(key: string, value: string | null): Promise<string | null>;
  /** Set (or clear, with `null`) the workspace's UI-locale override. */
  setLocale(workspaceId: string, locale: string | null): Promise<Workspace>;
}

/** A required non-empty string off an untrusted command payload. */
function requireString(payload: unknown, key: string): string {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

/** A nullable-string field off an untrusted command payload. */
function optionalString(payload: unknown, key: string): string | null {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`'${key}' must be a string`);
  return value;
}

export function createPreferencesModule(ctx: ModuleContext): PreferencesModule {
  const { authExpiry } = ctx;
  const { baseUrl, ports } = ctx.config;

  const client = new PreferencesClient({ baseUrl, fetch: ports.fetch });
  const emitTokenExpired = () => authExpiry.notifyExpired();

  /** Run a client call, surfacing a 401 as the shared token-expiry signal. */
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof EngineError && err.status === 401) emitTokenExpired();
      throw err;
    }
  }

  const get = (key: string): Promise<string | null> =>
    run(() => client.getPreference(key));
  const set = (key: string, value: string | null): Promise<string | null> =>
    run(() => client.setPreference(key, value));
  const setLocale = (
    workspaceId: string,
    locale: string | null,
  ): Promise<Workspace> =>
    run(() => client.setWorkspaceLocale(workspaceId, locale));

  ctx.registerCommand(PreferencesCommand.Get, (p) =>
    get(requireString(p, "key")),
  );
  ctx.registerCommand(PreferencesCommand.Set, (p) =>
    set(requireString(p, "key"), optionalString(p, "value")),
  );
  ctx.registerCommand(PreferencesCommand.SetLocale, (p) =>
    setLocale(requireString(p, "workspaceId"), optionalString(p, "locale")),
  );

  return { get, set, setLocale };
}
