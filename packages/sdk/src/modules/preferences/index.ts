/**
 * The preferences module — per-user key/value preferences plus the
 * workspace-locale override (the desktop's boot + language-settings path).
 *
 * These are pure commands: they read/write the gateway's user-scoped routes and
 * return the value; there is no reactive scope to publish (a preference read is
 * on-demand, and the locale write is a one-shot the surface acts on). The same
 * handlers back both the typed facade and the `dispatch` path.
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
import { requireString } from "../payload";

/** The write vocabulary — the same constants back the facade and `dispatch`. */
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

  /**
   * Reads one of the user's saved preferences.
   * @assistant group:settings hidden: UI plumbing; an untyped key/value store the app reads for its own device settings.
   */
  const get = (key: string): Promise<string | null> =>
    run(() => client.getPreference(key));
  /**
   * Changes one of the user's saved preferences.
   * @assistant group:settings hidden: UI plumbing; an open key/value write that can clobber any app setting.
   */
  const set = (key: string, value: string | null): Promise<string | null> =>
    run(() => client.setPreference(key, value));
  /**
   * Sets the language Houston's own screens are shown in, for one workspace.
   * @param workspaceId The workspace this acts on, by the id listWorkspaces
   *   returns.
   * @param locale The language to switch to, or nothing to follow the device.
   * @assistant group:settings unconfirmed: Reversible display preference; the app's own language picker changes it with one click.
   */
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
