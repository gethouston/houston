import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The account key/value store, as the control plane serves it.
 *
 * The app's own preference reads and writes are the SDK's
 * (`sdk.preferences.get/set`, delegated from `client/config-prefs-mixin.ts`).
 * These two remain the control-plane path for callers INSIDE this layer — the
 * agent-colour reconcile (`agent-color-sync.ts`) runs off a
 * {@link ControlPlaneConfig} handed down by `cp/agents.ts` and reaches no SDK.
 */

/** The route an account preference reads and writes, as EVERY path that
 *  touches it — this helper pair, the SDK-delegated mixin calls — spells it. */
export const prefPath = (key: string) =>
  `/v1/preferences/${encodeURIComponent(key)}`;

/**
 * Reads one of the user's saved preferences.
 * @assistant group:settings hidden: UI plumbing; an untyped key/value store the app reads for its own device settings.
 */
export async function getPreference(
  cfg: ControlPlaneConfig,
  key: string,
): Promise<string | null> {
  const res = await cpFetch(cfg, prefPath(key));
  return ((await res.json()) as { value: string | null }).value;
}
/**
 * Changes one of the user's saved preferences.
 * @assistant group:settings hidden: UI plumbing; an open key/value write that can clobber any app setting.
 */
export async function setPreference(
  cfg: ControlPlaneConfig,
  key: string,
  value: string,
): Promise<void> {
  await cpFetch(cfg, prefPath(key), {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
